import type { Conversation, streamFrom } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { stream } = vi.hoisted(() => ({ stream: vi.fn() }))

vi.mock('@proj-airi/core-agent', async (importOriginal) => {
  const original = await importOriginal<typeof import('@proj-airi/core-agent')>()
  return { ...original, streamFrom: stream }
})

const arbitraryCloud: GenerationProvider = {
  generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.com/v1/' } }),
}
const privateConversation: Conversation = { turns: [{
  type: 'user',
  id: 'private',
  content: [{ type: 'text', text: 'PRIVATE_SCREEN_CANARY' }],
}] }

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_AIRI_HYBRID_ENABLED', 'true')
  vi.stubEnv('VITE_AIRI_GATEWAY_URL', 'http://127.0.0.1:18420')
  vi.stubEnv('VITE_AIRI_GATEWAY_TOKEN', 'local-test-token-with-more-than-32-characters')
  setActivePinia(createPinia())
  stream.mockReset()
  stream.mockImplementation(async ({ options }: Parameters<typeof streamFrom>[0]) => {
    await options?.onStreamEvent?.({ type: 'text-delta', text: 'A public reply.' })
  })
})

afterEach(() => vi.unstubAllEnvs())

describe('hybrid LLM boundary', () => {
  it.each([true, false])('scopes watching headers and avoids duplicate private history only during watching: %s', async (watching) => {
    const { useMediaWatchMemoryStore } = await import('../../media-watch-memory')
    const { usePrivacyRoutingStore } = await import('../../privacy-routing')
    const { useLLM } = await import('./llm')
    const memory = useMediaWatchMemoryStore()
    const previousEnabled = memory.enabled
    try {
      memory.clear()
      memory.enabled = true
      memory.observe({ url: 'https://www.youtube.com/watch?v=fixturebrief', title: 'PRIVATE_DUPLICATED_HISTORY', isPlaying: true })
      const privacy = usePrivacyRoutingStore()
      const request = privacy.capture({ sessionId: 'private-watch-memory', turnId: 'brief', text: 'A bounded playlist hint', privateInput: true, ambient: true, historyExists: false })
      await useLLM().stream('untrusted', arbitraryCloud, privateConversation, { watching, requestCorrelation: { conversationId: request.sessionId, turnId: request.turnId } })
      const call = stream.mock.calls[0][0] as Parameters<typeof streamFrom>[0]
      expect(call.options?.headers?.['X-AIRI-Watching']).toBe(watching ? 'true' : undefined)
      expect(JSON.stringify(call.conversation).includes('PRIVATE_DUPLICATED_HISTORY')).toBe(!watching)
      expect(call.options).not.toHaveProperty('watching')
    }
    finally {
      memory.clear()
      memory.enabled = previousEnabled
    }
  })

  it('rejects a merged time hint before streaming when time consent is revoked', async () => {
    const { useMediaWatchMemoryStore } = await import('../../media-watch-memory')
    const { usePrivacyRoutingStore } = await import('../../privacy-routing')
    const { useLLM } = await import('./llm')
    const memory = useMediaWatchMemoryStore()
    memory.habitProvider = 'gemini'
    memory.timeAwareTeasing = true
    const privacy = usePrivacyRoutingStore()
    const request = privacy.router.captureMedia('merged-time', {
      title: 'Current public track',
      frames: ['data:image/jpeg;base64,YWJj'],
      timeOfDay: 'afternoon',
      attention: 'static-music',
      audioObservations: ['MUSIC: VOCALS: sung'],
    }, 'gemini')
    memory.timeAwareTeasing = false
    await expect(useLLM().stream('untrusted', arbitraryCloud, privateConversation, { requestCorrelation: { conversationId: request.sessionId, turnId: request.turnId } })).rejects.toThrow('revoked')
    expect(stream).not.toHaveBeenCalled()
    expect(privacy.router.get(request.sessionId, request.turnId)).toBeUndefined()
  })
  it.each(['daytime', 'late-night'] as const)('shares approved %s music context without precise time or private history', async (timeOfDay) => {
    const { useMediaWatchMemoryStore } = await import('../../media-watch-memory')
    const { usePrivacyRoutingStore } = await import('../../privacy-routing')
    const { useLLM } = await import('./llm')
    const memory = useMediaWatchMemoryStore()
    memory.habitProvider = 'gemini'
    memory.timeAwareTeasing = true
    const privacy = usePrivacyRoutingStore()
    const request = privacy.router.captureWatchHabit('timed', { kind: 'music-time', timeOfDay, audioObservation: 'MUSIC: A wistful piano ballad with subdued singing.', exactTime: 'PRIVATE_CLOCK', timezone: 'PRIVATE_TIMEZONE', comments: ['PRIVATE_HISTORY'] }, 'gemini', true)
    await useLLM().stream('untrusted', arbitraryCloud, privateConversation, { requestCorrelation: { conversationId: request.sessionId, turnId: request.turnId } })
    const call = stream.mock.calls[0][0] as Parameters<typeof streamFrom>[0]
    expect(JSON.stringify(call.conversation)).toContain(timeOfDay)
    expect(JSON.stringify(call.conversation)).toContain('wistful piano ballad')
    expect(JSON.stringify(call.conversation)).not.toContain('PRIVATE_')
    expect(privacy.router.snapshot().cloudHistory).toEqual({})
  })

  it('rejects a time tease when its setting is revoked or the observation is not music', async () => {
    const { useMediaWatchMemoryStore } = await import('../../media-watch-memory')
    const { usePrivacyRoutingStore } = await import('../../privacy-routing')
    const { useLLM } = await import('./llm')
    const memory = useMediaWatchMemoryStore()
    memory.habitProvider = 'gemini'
    const privacy = usePrivacyRoutingStore()
    expect(() => privacy.router.captureWatchHabit('speech', { kind: 'music-time', timeOfDay: 'daytime', audioObservation: 'SPEECH: A private call.' }, 'gemini', true)).toThrow()
    const request = privacy.router.captureWatchHabit('revoked-time', { kind: 'music-time', timeOfDay: 'daytime', audioObservation: 'MUSIC: Soft piano.' }, 'gemini', true)
    memory.timeAwareTeasing = false
    await expect(useLLM().stream('untrusted', arbitraryCloud, privateConversation, { requestCorrelation: { conversationId: request.sessionId, turnId: request.turnId } })).rejects.toThrow('revoked')
    expect(stream).not.toHaveBeenCalled()
  })
  it.each(['gemini', 'kimi'] as const)('sends only approved habit counts to %s without private history, tools, or cloud retention', async (lane) => {
    const { useMediaWatchMemoryStore } = await import('../../media-watch-memory')
    const { usePrivacyRoutingStore } = await import('../../privacy-routing')
    const { useLLM } = await import('./llm')
    const memory = useMediaWatchMemoryStore()
    memory.habitProvider = lane
    memory.observe({ url: 'https://www.youtube.com/watch?v=fixture1234', title: 'PRIVATE_WATCH_TITLE', channel: 'PRIVATE_CHANNEL', isPlaying: true })
    const privacy = usePrivacyRoutingStore()
    privacy.switchProvider(lane === 'kimi' ? 'gemini' : 'kimi')
    const request = privacy.router.captureWatchHabit('tease', { kind: 'replay', playsThisSession: 3, privateText: 'PRIVATE_HISTORY', title: 'PRIVATE_WATCH_TITLE', comments: ['PRIVATE_COMMENT'] }, lane, true)
    await useLLM().stream('untrusted', arbitraryCloud, privateConversation, { supportsTools: true, requestCorrelation: { conversationId: request.sessionId, turnId: request.turnId } })
    const call = stream.mock.calls[0][0] as Parameters<typeof streamFrom>[0]
    expect(String(call.chatProvider.generation(call.model).config.baseURL)).toContain(`/${lane}/v1/`)
    expect(call.conversation.turns.some(turn => turn.type === 'user' && turn.content.some(part => part.type === 'text' && part.text.includes('"playsThisSession":3')))).toBe(true)
    expect(JSON.stringify(call.conversation)).not.toContain('PRIVATE_')
    expect(call.options?.supportsTools).toBe(false)
    expect(privacy.router.snapshot().cloudHistory).toEqual({})
    expect(privacy.selectedProvider).toBe(lane === 'kimi' ? 'gemini' : 'kimi')
  })

  it('rejects missing or revoked habit approval before the provider request', async () => {
    const { useMediaWatchMemoryStore } = await import('../../media-watch-memory')
    const { usePrivacyRoutingStore } = await import('../../privacy-routing')
    const { useLLM } = await import('./llm')
    const memory = useMediaWatchMemoryStore()
    const privacy = usePrivacyRoutingStore()
    expect(() => privacy.router.captureWatchHabit('denied', { kind: 'replay', playsThisSession: 2 }, 'gemini', false)).toThrow('explicit approval')
    expect(() => privacy.router.captureWatchHabit('malformed', { kind: 'replay', playsThisSession: 'PRIVATE_TEXT' }, 'gemini', true)).toThrow()
    memory.habitProvider = 'gemini'
    const request = privacy.router.captureWatchHabit('revoked', { kind: 'replay', playsThisSession: 2 }, 'gemini', true)
    memory.habitProvider = 'local'
    await expect(useLLM().stream('untrusted', arbitraryCloud, privateConversation, { requestCorrelation: { conversationId: request.sessionId, turnId: request.turnId } })).rejects.toThrow('revoked')
    expect(stream).not.toHaveBeenCalled()
    expect(privacy.router.get(request.sessionId, request.turnId)).toBeUndefined()
  })
  it('routes a same-session replay tease to Qwen and excludes that habit from the next cloud music reaction', async () => {
    vi.useFakeTimers()
    try {
      const { useMediaWatchMemoryStore } = await import('../../media-watch-memory')
      const { usePrivacyRoutingStore } = await import('../../privacy-routing')
      const { useLLM } = await import('./llm')
      const memory = useMediaWatchMemoryStore()
      const item = { url: 'https://www.youtube.com/watch?v=fixture9876', title: 'PRIVATE_SESSION_REPLAY', channel: 'PRIVATE_SESSION_CHANNEL', isPlaying: true, durationSec: 100 }
      const start = Date.now()
      for (let seconds = 0; seconds <= 90; seconds += 15) {
        vi.setSystemTime(start + seconds * 1000)
        memory.observe({ ...item, currentTimeSec: seconds })
      }
      vi.setSystemTime(start + 105_000)
      memory.observe({ ...item, currentTimeSec: 4 })
      const hint = memory.takeHint(item.url)
      expect(hint?.privateText).toContain('"playsThisSession":2')
      const privacy = usePrivacyRoutingStore()
      privacy.switchProvider('gemini')
      const local = privacy.capture({ sessionId: 'private-watch-memory', turnId: 'replay', text: hint!.privateText, privateInput: true, ambient: true, historyExists: false, mode: 'cloud' })
      const conversation: Conversation = { turns: [
        { id: 'personality', type: 'system', authority: 'system', content: [{ type: 'text', text: 'AIRI private habit personality' }] },
        { id: 'replay', type: 'user', content: [{ type: 'text', text: hint!.privateText }] },
      ] }
      await useLLM().stream('arbitrary', arbitraryCloud, conversation, { requestCorrelation: { conversationId: local.sessionId, turnId: local.turnId } })
      const localCall = stream.mock.calls[0][0] as Parameters<typeof streamFrom>[0]
      expect(String(localCall.chatProvider.generation(localCall.model).config.baseURL)).toContain('/local/v1/')
      expect(localCall.conversation.turns.filter(turn => turn.type === 'system')).toHaveLength(1)
      expect(localCall.conversation.turns.some(turn => turn.type === 'user' && turn.content.some(part => part.type === 'text' && part.text.includes('"playsThisSession":2')))).toBe(true)
      const publicVideo = privacy.router.captureMedia('public-song', { title: 'Synthetic public song', frames: ['data:image/jpeg;base64,YWJj'], attention: 'static-music', audioObservations: ['MUSIC: A steady groove.'], audioPriority: true })
      await useLLM().stream('arbitrary', arbitraryCloud, conversation, { requestCorrelation: { conversationId: publicVideo.sessionId, turnId: publicVideo.turnId } })
      const cloudCall = stream.mock.calls[1][0] as Parameters<typeof streamFrom>[0]
      expect(String(cloudCall.chatProvider.generation(cloudCall.model).config.baseURL)).toContain('/media/gemini/v1/')
      expect(JSON.stringify(cloudCall.conversation)).not.toContain('PRIVATE_SESSION_REPLAY')
      expect(JSON.stringify(cloudCall.conversation)).not.toContain('playsThisSession')
      expect(JSON.stringify(cloudCall.conversation)).not.toContain('data:image')
    }
    finally {
      vi.useRealTimers()
    }
  })
  it('makes learned viewing preferences available only to local requests', async () => {
    const { useMediaWatchMemoryStore } = await import('../../media-watch-memory')
    const { usePrivacyRoutingStore } = await import('../../privacy-routing')
    const { useLLM } = await import('./llm')
    const memory = useMediaWatchMemoryStore()
    memory.observe({ url: 'https://www.youtube.com/watch?v=fixture1234', title: 'PRIVATE_WATCH_PREFERENCE', channel: 'PRIVATE_WATCH_CHANNEL', isPlaying: true })
    const privacy = usePrivacyRoutingStore()
    const local = privacy.capture({ sessionId: 'local-memory', turnId: 'local', text: '/local What do I watch?', privateInput: false, ambient: false, historyExists: false })
    await useLLM().stream('arbitrary', arbitraryCloud, privateConversation, { requestCorrelation: { conversationId: local.sessionId, turnId: local.turnId } })
    const privateRequest = stream.mock.calls[0][0] as Parameters<typeof streamFrom>[0]
    expect(String(privateRequest.chatProvider.generation(privateRequest.model).config.baseURL)).toContain('/local/v1/')
    expect(JSON.stringify(privateRequest.conversation)).toContain('PRIVATE_WATCH_PREFERENCE')
    const publicRequest = privacy.capture({ sessionId: 'public-memory', turnId: 'public', text: '/cloud Explain music.', privateInput: false, ambient: false, historyExists: false })
    await useLLM().stream('arbitrary', arbitraryCloud, privateConversation, { requestCorrelation: { conversationId: publicRequest.sessionId, turnId: publicRequest.turnId } })
    const cloud = stream.mock.calls[1][0] as Parameters<typeof streamFrom>[0]
    expect(JSON.stringify(cloud.conversation)).not.toContain('PRIVATE_WATCH_PREFERENCE')
    expect(JSON.stringify(cloud.conversation)).not.toContain('PRIVATE_WATCH_CHANNEL')
  })
  it.each(['gemma31', 'gemma26', 'inkling'] as const)('uses the existing OpenRouter abstraction for %s and retains media isolation', async (lane) => {
    const { usePrivacyRoutingStore } = await import('../../privacy-routing')
    const { useLLM } = await import('./llm')
    const privacy = usePrivacyRoutingStore()
    privacy.switchProvider(lane)
    const media = privacy.router.captureMedia(`video-${lane}`, { frames: ['data:image/jpeg;base64,YWJj'], title: 'Shared fixture', researchMedia: true })
    await useLLM().stream('untrusted-selection', arbitraryCloud, privateConversation, { requestCorrelation: { conversationId: media.sessionId, turnId: media.turnId } })
    const request = stream.mock.calls[0][0] as Parameters<typeof streamFrom>[0]
    expect(request.chatProvider.generation(request.model).config.baseURL).toBe(`http://127.0.0.1:18420/media/${lane}/v1/`)
    expect(JSON.stringify(request.conversation)).not.toContain('PRIVATE_SCREEN_CANARY')
    expect(JSON.stringify(privacy.router.snapshot())).not.toContain('data:image')
  })
  it('sends only the explicit shared video to its cloud endpoint without persisting it', async () => {
    const { usePrivacyRoutingStore } = await import('../../privacy-routing')
    const { useLLM } = await import('./llm')
    const privacy = usePrivacyRoutingStore()
    privacy.switchProvider('gemini')
    const media = privacy.router.captureMedia('video-fixture', { frames: ['data:image/jpeg;base64,YWJj'], title: 'Shared fixture', visibleText: 'PRIVATE_BROWSER_CANARY' })
    await useLLM().stream('untrusted-selection', arbitraryCloud, privateConversation, {
      requestCorrelation: { conversationId: media.sessionId, turnId: media.turnId },
      supportsTools: true,
    })
    const request = stream.mock.calls[0][0] as Parameters<typeof streamFrom>[0]
    expect(request.chatProvider.generation(request.model).config.baseURL).toBe('http://127.0.0.1:18420/media/gemini/v1/')
    expect(JSON.stringify(request.conversation)).toContain('data:image/jpeg;base64,YWJj')
    expect(JSON.stringify(request.conversation)).not.toContain('PRIVATE_SCREEN_CANARY')
    expect(JSON.stringify(request.conversation)).not.toContain('PRIVATE_BROWSER_CANARY')
    expect(request.options?.supportsTools).toBe(false)
    expect(JSON.stringify(privacy.router.snapshot().cloudHistory)).not.toContain('data:image')
    expect(privacy.router.get(media.sessionId, media.turnId)).toBeUndefined()
  })
  it('replaces private display context and disables tools for a captured cloud request', async () => {
    const { usePrivacyRoutingStore } = await import('../../privacy-routing')
    const { useLLM } = await import('./llm')
    const privacy = usePrivacyRoutingStore()
    privacy.capture({ sessionId: 'session', turnId: 'typed', text: 'Explain gravity.', privateInput: false, ambient: false, historyExists: false })
    await useLLM().stream('untrusted-selection', arbitraryCloud, privateConversation, {
      requestCorrelation: { conversationId: 'session', turnId: 'typed' },
      supportsTools: true,
      headers: { 'x-private-context': 'PRIVATE_HEADER_CANARY' },
    })
    const request = stream.mock.calls[0][0] as Parameters<typeof streamFrom>[0]
    expect(request.chatProvider.generation(request.model).config.baseURL).toBe('http://127.0.0.1:18420/kimi/v1/')
    expect(JSON.stringify(request.conversation)).toContain('Explain gravity.')
    expect(JSON.stringify(request.conversation)).not.toContain('PRIVATE_SCREEN_CANARY')
    expect(request.options?.supportsTools).toBe(false)
    expect(request.options?.headers).toBeUndefined()
    expect(JSON.stringify(privacy.router.snapshot().cloudHistory)).toContain('A public reply.')
  })

  it('routes an unclassified background request locally despite a supplied cloud provider', async () => {
    const { useLLM } = await import('./llm')
    await useLLM().stream('untrusted-selection', arbitraryCloud, privateConversation, { supportsTools: false })
    const request = stream.mock.calls[0][0] as Parameters<typeof streamFrom>[0]
    expect(request.chatProvider.generation(request.model).config.baseURL).toBe('http://127.0.0.1:18420/local/v1/')
    expect(JSON.stringify(request.conversation)).toContain('PRIVATE_SCREEN_CANARY')
    expect(request.options?.supportsTools).toBe(false)
  })
})
