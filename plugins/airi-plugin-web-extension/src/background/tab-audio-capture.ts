import type { TabAudioMessage } from '../shared/types'

import { browser } from 'wxt/browser'

/** Capture is owned by one explicitly shared public tab. Closing our offscreen document stops all its tracks. */
export class TabAudioCapture {
  // Lifecycle operations serialize Chrome document changes. Revocation invalidates a pending start immediately.
  private pending = Promise.resolve()
  private generation = 0
  private capturing = false

  get active() {
    return this.capturing
  }

  start(tabId: number, sharingId: string, url: string) {
    const generation = ++this.generation
    this.capturing = false
    return this.enqueue(async () => {
      await this.close()
      try {
        this.assertCurrent(generation)
        await browser.offscreen.createDocument({
          url: 'audio-offscreen.html',
          reasons: [browser.offscreen.Reason.USER_MEDIA],
          justification: 'Observe audio from the explicitly shared public tab through the local AIRI gateway.',
        })
        this.assertCurrent(generation)
        const streamId = await browser.tabCapture.getMediaStreamId({ targetTabId: tabId })
        this.assertCurrent(generation)
        const message: TabAudioMessage = { type: 'audio:start', target: 'offscreen', streamId, sharingId, url }
        const result: unknown = await browser.runtime.sendMessage(message)
        this.assertCurrent(generation)
        if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
          const detail = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error.slice(0, 200) : 'Offscreen audio did not acknowledge startup.'
          throw new Error(detail)
        }
        this.capturing = true
      }
      finally {
        if (!this.capturing)
          await this.close()
      }
    })
  }

  stop() {
    ++this.generation
    this.capturing = false
    return this.enqueue(() => this.close())
  }

  /** Retains the authorized tab stream while discarding the previous video's buffered analysis. */
  async follow(sharingId: string, url: string) {
    const message: TabAudioMessage = { type: 'audio:scope', target: 'offscreen', sharingId, url }
    await this.enqueue(async () => {
      if (!this.capturing || await browser.runtime.sendMessage(message) !== true)
        throw new Error('The tab audio scope could not change.')
    })
  }

  private assertCurrent(generation: number) {
    if (generation !== this.generation)
      throw new Error('Tab audio sharing was revoked.')
  }

  private enqueue(operation: () => Promise<void>) {
    const pending = this.pending.then(operation)
    // A failed start cannot prevent a later stop or explicit retry from cleaning up.
    this.pending = pending.catch(() => {})
    return pending
  }

  private async close() {
    const contexts = await browser.runtime.getContexts({ contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT] })
    if (!contexts.length)
      return
    const message: TabAudioMessage = { type: 'audio:stop', target: 'offscreen' }
    await browser.runtime.sendMessage(message).catch(() => {})
    await browser.offscreen.closeDocument()
  }
}
