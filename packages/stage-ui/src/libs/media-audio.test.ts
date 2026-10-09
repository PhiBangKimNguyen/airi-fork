import { afterEach, describe, expect, it, vi } from 'vitest'

import { MediaAudioEars } from './media-audio'
import { PrivacyRouter } from './privacy-routing'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('shared media audio coordination', () => {
  it('keeps a slow audio result usable without retaining captured audio beyond one minute', async () => {
    vi.useFakeTimers()
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 33_000))
      return new Response(JSON.stringify({ observation: 'MUSIC: VOCALS: none. INSTRUMENTS: guitar and drums.' }))
    })
    const ears = new MediaAudioEars('http://127.0.0.1:18420', 'test-token')
    ears.setSharing('share', 'https://example.com/video', true)
    const capturedAt = Date.now()
    const pending = ears.observe({ sharingId: 'share', url: 'https://example.com/video', capturedAt, audio: 'YWJj' })
    await vi.advanceTimersByTimeAsync(33_000)
    await pending
    expect(fetcher).toHaveBeenCalledOnce()
    expect(ears.status).toBe('ready')
    expect(ears.kind()).toBe('music')
    expect(ears.recent()).toHaveLength(1)
    expect(ears.kind(capturedAt + 59_000)).toBe('music')
    expect(ears.recent(capturedAt + 60_001)).toEqual([])
    ears.setSharing('', '', false)
    expect(ears.recent()).toEqual([])
  })

  it('expires a fast result thirty seconds after perception completes', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 5000))
      return new Response(JSON.stringify({ observation: 'MUSIC: A steady instrumental groove.' }))
    })
    const ears = new MediaAudioEars('http://127.0.0.1:18420', 'test-token')
    ears.setSharing('share', 'https://example.com/video', true)
    const capturedAt = Date.now()
    const pending = ears.observe({ sharingId: 'share', url: 'https://example.com/video', capturedAt, audio: 'YWJj' })
    await vi.advanceTimersByTimeAsync(5000)
    await pending
    expect(ears.kind(capturedAt + 34_000)).toBe('music')
    expect(ears.kind(capturedAt + 35_001)).toBe('unknown')
  })

  it('prefers fresh instrumental gaps and section changes without blocking unlabeled audio', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ observation: 'MUSIC: VOCALS: sung. CHANGE: unchanged.' })))
    const ears = new MediaAudioEars('http://127.0.0.1:18420', 'test-token')
    ears.setSharing('share', 'https://example.com/video', true)
    const packet = { sharingId: 'share', url: 'https://example.com/video', capturedAt: Date.now(), audio: 'YWJj' }
    await ears.observe(packet)
    expect(ears.shouldDeferReaction()).toBe(true)
    expect(ears.shouldDeferReaction(packet.capturedAt + 31_000)).toBe(false)
    for (const observation of ['MUSIC: VOCALS: none. CHANGE: unchanged.', 'MUSIC: VOCALS: sung. CHANGE: section change.', 'Unlabeled legacy observation.']) {
      fetcher.mockResolvedValue(new Response(JSON.stringify({ observation })))
      await ears.observe(packet)
      expect(ears.shouldDeferReaction()).toBe(false)
    }
  })
  it('requires developed scoped music and sends only one previous observation', async () => {
    vi.useFakeTimers()
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ observation: 'MUSIC: VOCALS: sung, Russian. INSTRUMENTS: guitar and drums. CHANGE: vocals enter.' })))
    const ears = new MediaAudioEars('http://127.0.0.1:18420', 'local-test-token')
    const packet = { sharingId: 'share', url: 'https://example.com/video', capturedAt: Date.now(), audio: 'YWJj' }
    ears.setSharing(packet.sharingId, packet.url, true)
    await ears.observe(packet)
    expect(ears.readyForTimeTease()).toBe(false)
    await vi.advanceTimersByTimeAsync(20_000)
    await ears.observe({ ...packet, capturedAt: Date.now() })
    expect(ears.readyForTimeTease()).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(ears.readyForTimeTease()).toBe(true)
    await ears.observe({ ...packet, capturedAt: Date.now() })
    const body = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))
    expect(body.previous).toHaveLength(1)
    ears.setSharing('next', 'https://example.com/next', true)
    expect(ears.readyForTimeTease()).toBe(false)
    vi.useRealTimers()
  })
  it('supplies silent ears observations to one scoped personality request', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ observation: 'The instrumental beat speeds up.' })))
    const ears = new MediaAudioEars('http://127.0.0.1:18420', 'local-test-token')
    ears.setSharing('share', 'https://example.com/video', true, true)
    await ears.observe({ sharingId: 'share', url: 'https://example.com/video', capturedAt: Date.now(), audio: 'YWJj' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String(fetcher.mock.calls[0][0])).toContain('/audio/inkling/observe')
    const router = new PrivacyRouter({ provider: 'inkling', sessions: {}, cloudHistory: {} })
    const input = { frames: ['data:image/jpeg;base64,YWJj'], audioObservations: ears.recent(), audioPriority: true, recentReplies: ['A previous reaction'], researchMedia: true }
    const publicMedia = router.captureMedia('public', input)
    const combined = JSON.stringify(router.mediaConversation(publicMedia))
    expect(combined).toContain('instrumental beat speeds up')
    expect(combined).toContain('ONE specific reaction')
    expect(combined).not.toContain('A previous reaction')
    expect(combined).toContain('FRESH AUDIO REQUIRED')
    expect(publicMedia.lane).toBe('inkling')
    expect(router.mediaConversation(publicMedia).turns).toHaveLength(2)
    const privateMedia = router.capturePrivateMedia('private', input)
    expect(privateMedia.lane).toBe('local')
    expect(JSON.stringify(router.mediaConversation(privateMedia))).not.toContain('instrumental beat speeds up')
    expect(JSON.stringify(router.mediaConversation(privateMedia))).not.toContain('FRESH AUDIO REQUIRED')
    expect(() => router.cloudConversation(privateMedia)).toThrow('Private requests')
    ears.setSharing('', '', false)
    expect(ears.recent()).toEqual([])
  })

  it('routes ordinary public viewing to Gemini even when free Inkling is selected', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ observation: 'A synthetic tone.' })))
    const ears = new MediaAudioEars('http://127.0.0.1:18420', 'local-test-token')
    ears.setSharing('share', 'https://example.com', true)
    await ears.observe({ sharingId: 'share', url: 'https://example.com', capturedAt: Date.now(), audio: 'YWJj' })
    expect(String(fetcher.mock.calls[0][0])).toContain('/audio/gemini/observe')
    const router = new PrivacyRouter({ provider: 'inkling', sessions: {}, cloudHistory: {} })
    expect(router.captureMedia('real-video', { frames: ['data:image/jpeg;base64,YWJj'] }).lane).toBe('gemini')
  })

  it('classifies singing as music, leaves unlabeled observations unknown, and expires the label with its audio', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ observation: 'MUSIC: A gentle vocal over a steady groove.' })))
    const ears = new MediaAudioEars('http://127.0.0.1:18420', 'local-test-token')
    const now = Date.now()
    ears.setSharing('share', 'https://example.com', true)
    await ears.observe({ sharingId: 'share', url: 'https://example.com', capturedAt: now, audio: 'YWJj' })
    expect(ears.kind(now)).toBe('music')
    expect(ears.kind(now + 31_000)).toBe('unknown')
    fetcher.mockResolvedValue(new Response(JSON.stringify({ observation: 'Uncertain audio content.' })))
    await ears.observe({ sharingId: 'share', url: 'https://example.com', capturedAt: Date.now(), audio: 'YWJj' })
    expect(ears.kind()).toBe('unknown')
  })

  it('rejects private, stale, mismatched and concurrent packets and aborts on navigation', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted')))))
    const ears = new MediaAudioEars('http://127.0.0.1:18420', 'local-test-token')
    const packet = { sharingId: 'share', url: 'https://example.com/video', capturedAt: Date.now(), audio: 'YWJj' }
    await ears.observe(packet)
    expect(fetcher).not.toHaveBeenCalled()
    ears.setSharing('share', packet.url, true)
    await ears.observe({ ...packet, sharingId: 'other' })
    await ears.observe({ ...packet, capturedAt: Date.now() - 31_000 })
    expect(fetcher).not.toHaveBeenCalled()
    const pending = ears.observe(packet)
    await ears.observe(packet)
    expect(fetcher).toHaveBeenCalledTimes(1)
    ears.setSharing('next', 'https://example.com/next', false)
    await pending
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(ears.status).toBe('off')
    expect(ears.recent()).toEqual([])
  })

  it('backs off on provider limits without fallback', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }))
    const ears = new MediaAudioEars('http://127.0.0.1:18420', 'local-test-token')
    ears.setSharing('share', 'https://example.com', true)
    const packet = { sharingId: 'share', url: 'https://example.com', capturedAt: Date.now(), audio: 'YWJj' }
    await ears.observe(packet)
    await ears.observe(packet)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(ears.status).toBe('unavailable')
    expect(ears.recent()).toEqual([])
  })
})
