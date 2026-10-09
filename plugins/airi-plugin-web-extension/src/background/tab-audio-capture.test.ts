import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TabAudioCapture } from './tab-audio-capture'

const { browserApi } = vi.hoisted(() => ({ browserApi: {
  offscreen: { createDocument: vi.fn(), closeDocument: vi.fn(), Reason: { USER_MEDIA: 'USER_MEDIA' } },
  tabCapture: { getMediaStreamId: vi.fn() },
  runtime: { getContexts: vi.fn(), sendMessage: vi.fn(), ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' } },
} }))

vi.mock('wxt/browser', () => ({ browser: browserApi }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('browser', browserApi)
  browserApi.runtime.getContexts.mockResolvedValue([])
  browserApi.tabCapture.getMediaStreamId.mockResolvedValue('fixture-stream')
  browserApi.runtime.sendMessage.mockImplementation(async message => message.type === 'audio:start' ? { ok: true } : true)
})

describe('owned tab audio lifecycle', () => {
  it('starts one owned tab and retains its stream across video scope changes', async () => {
    const capture = new TabAudioCapture()
    await capture.start(12, 'share', 'https://www.youtube.com/watch?v=fixture')
    expect(capture.active).toBe(true)
    expect(browserApi.tabCapture.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 12 })
    await capture.follow('next-share', 'https://www.youtube.com/watch?v=nextfixture')
    expect(browserApi.tabCapture.getMediaStreamId).toHaveBeenCalledOnce()
    expect(browserApi.runtime.sendMessage).toHaveBeenLastCalledWith({ type: 'audio:scope', target: 'offscreen', sharingId: 'next-share', url: 'https://www.youtube.com/watch?v=nextfixture' })
    await capture.stop()
    expect(capture.active).toBe(false)
  })

  it('reports the failed offscreen stage and never marks a failed stream active', async () => {
    browserApi.runtime.sendMessage.mockResolvedValue({ ok: false, error: 'tab stream: NotAllowedError' })
    const capture = new TabAudioCapture()
    await expect(capture.start(1, 'share', 'https://www.youtube.com/watch?v=fixture')).rejects.toThrow('tab stream: NotAllowedError')
    expect(capture.active).toBe(false)
  })
  it('removes a created offscreen document when Chrome refuses stream permission', async () => {
    const capture = new TabAudioCapture()
    browserApi.offscreen.createDocument.mockImplementation(async () => {
      browserApi.runtime.getContexts.mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }])
    })
    browserApi.tabCapture.getMediaStreamId.mockRejectedValue(new Error('Extension has not been invoked for the current page'))
    await expect(capture.start(1, 'share', 'https://www.youtube.com/watch?v=fixture')).rejects.toThrow('invoked')
    expect(capture.active).toBe(false)
    expect(browserApi.offscreen.closeDocument).toHaveBeenCalledOnce()
  })

  it('revokes a start while its offscreen document is still being created', async () => {
    let created!: () => void
    const documentReady = new Promise<void>((resolve) => {
      created = resolve
    })
    browserApi.offscreen.createDocument.mockImplementation(async () => {
      await documentReady
      browserApi.runtime.getContexts.mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }])
    })
    const capture = new TabAudioCapture()
    const started = capture.start(1, 'share', 'https://www.youtube.com/watch?v=fixture')
    const rejected = expect(started).rejects.toThrow('revoked')
    await vi.waitFor(() => expect(browserApi.offscreen.createDocument).toHaveBeenCalledOnce())
    const stopped = capture.stop()
    created()
    await Promise.all([rejected, stopped])
    expect(capture.active).toBe(false)
    expect(browserApi.runtime.sendMessage.mock.calls.some(([message]) => message.type === 'audio:start')).toBe(false)
  })
})
