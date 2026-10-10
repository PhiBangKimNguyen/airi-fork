import type { MediaAudioKind } from './media-vision'

import { errorMessageFrom } from '@moeru/std'

import * as v from 'valibot'

import { isLoopbackUrl } from './privacy-routing'

const audioObservationInput = v.object({
  sharingId: v.string(),
  url: v.string(),
  capturedAt: v.number(),
  audio: v.pipe(v.string(), v.maxLength(600_000), v.regex(/^[A-Z0-9+/]+=*$/i)),
})
const audioObservationOutput = v.object({ observation: v.pipe(v.string(), v.maxLength(1400)) })

/** Owns ephemeral audio observations. Stop, provider changes, and navigation abort the one in-flight request and clear its memory. */
export class MediaAudioEars {
  private sharingId = ''
  private url = ''
  private enabled = false
  private provider: 'gemini' | 'inkling' = 'gemini'
  private controller?: AbortController
  private observations: { text: string, capturedAt: number, receivedAt: number }[] = []
  private retryAt = 0
  private firstObservedAt?: number
  private observationCount = 0
  status: 'off' | 'listening' | 'processing' | 'ready' | 'unavailable' = 'off'

  constructor(private readonly gateway: string, private readonly token: string) {
    if (!isLoopbackUrl(gateway))
      throw new Error('Audio observations require the local gateway.')
  }

  setSharing(sharingId: string, url: string, enabled: boolean, researchMedia = false) {
    const provider = researchMedia ? 'inkling' : 'gemini'
    if (sharingId === this.sharingId && url === this.url && enabled === this.enabled && provider === this.provider)
      return
    this.controller?.abort()
    this.controller = undefined
    this.observations = []
    this.retryAt = 0
    this.firstObservedAt = undefined
    this.observationCount = 0
    this.sharingId = sharingId
    this.url = url
    this.enabled = enabled
    this.provider = provider
    this.status = enabled ? 'listening' : 'off'
  }

  recent(now = Date.now()) {
    // NOTICE:
    // Gemini audio can take more than 30 seconds.
    // Capture-based expiry discarded successful results before reactions used them.
    // Context: /audio/gemini/observe and media-audio.test.ts.
    // Remove the latency allowance when perception reliably completes within 30 seconds.
    return this.observations.filter(item => now - item.receivedAt <= 30_000 && now - item.capturedAt <= 60_000).map(item => item.text)
  }

  /** Reads only the latest fresh perception label. Unlabeled output cannot force a music policy. */
  kind(now = Date.now()): MediaAudioKind {
    const label = /^(MUSIC|SPEECH|MIXED|SILENCE):/i.exec(this.recent(now).at(-1)?.trim() ?? '')?.[1]?.toLowerCase()
    return label === 'music' || label === 'speech' || label === 'mixed' || label === 'silence' ? label : 'unknown'
  }

  /** Time teasing waits for developed evidence from this URL, rather than guessing a whole track from its intro. */
  readyForTimeTease(now = Date.now()) {
    const latest = this.recent(now).at(-1) ?? ''
    return this.observationCount >= 2 && this.firstObservedAt !== undefined && now - this.firstObservedAt >= 30_000
      && this.kind(now) === 'music' && /VOCALS:\s*(?:sung|spoken|none)|full[- ]band|instrumental/i.test(latest)
  }

  /** Structured vocal labels favor a short wait. Missing labels cannot indefinitely block a reaction. */
  shouldDeferReaction(now = Date.now()) {
    const latest = this.recent(now).at(-1) ?? ''
    return /VOCALS\s*:\s*(?:sung|spoken)\b/i.test(latest)
      && !/CHANGE\s*:[^\n;|]*(?:section|transition|break|pause)/i.test(latest)
  }

  async observe(input: unknown) {
    const parsed = v.safeParse(audioObservationInput, input)
    if (!parsed.success || !this.enabled || this.controller || Date.now() < this.retryAt)
      return
    const packet = parsed.output
    if (packet.sharingId !== this.sharingId || packet.url !== this.url || Date.now() - packet.capturedAt > 30_000 || packet.capturedAt > Date.now())
      return
    const controller = new AbortController()
    this.controller = controller
    this.status = 'processing'
    console.info('Audio perception started', { provider: this.provider, captureAgeMs: Date.now() - packet.capturedAt })
    const timeout = setTimeout(() => controller.abort(), 60_000)
    try {
      const response = await fetch(`${this.gateway}/audio/${this.provider}/observe`, {
        method: 'POST',
        headers: { 'authorization': `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ audio: packet.audio, previous: this.recent().slice(-1), researchMedia: this.provider === 'inkling' }),
        signal: controller.signal,
      })
      if (!response.ok)
        throw new Error(`Audio perception returned HTTP ${response.status}.`)
      const result = v.safeParse(audioObservationOutput, await response.json())
      if (!result.success)
        throw new Error('Invalid audio perception response.')
      if (!controller.signal.aborted && this.controller === controller) {
        const receivedAt = Date.now()
        if (receivedAt - packet.capturedAt > 60_000) {
          this.status = 'listening'
          console.info('Audio perception discarded', { reason: 'stale-capture' })
          return
        }
        this.observations = [...this.observations, { text: result.output.observation, capturedAt: packet.capturedAt, receivedAt }].slice(-2)
        this.firstObservedAt ??= packet.capturedAt
        this.observationCount++
        this.status = 'ready'
        console.info('Audio perception ready', { provider: this.provider, captureAgeMs: receivedAt - packet.capturedAt, kind: this.kind(receivedAt) })
      }
    }
    catch (error) {
      if (this.controller === controller) {
        this.status = 'unavailable'
        this.retryAt = Date.now() + 60_000
        console.warn('Audio perception unavailable', { provider: this.provider, message: errorMessageFrom(error) ?? 'Unknown audio perception error.' })
      }
    }
    finally {
      clearTimeout(timeout)
      if (this.controller === controller)
        this.controller = undefined
    }
  }
}
