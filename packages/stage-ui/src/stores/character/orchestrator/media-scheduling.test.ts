import type { WebSocketEventOf } from '@proj-airi/server-sdk'

import type { LlmStreamOptions } from '../../ai/chat-llm/llm'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useCharacterStore } from '../'
import { hybridEnabled } from '../../../libs/privacy-routing'
import { useLLM } from '../../ai/chat-llm/llm'
import { useMediaWatchMemoryStore } from '../../media-watch-memory'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { useConsciousnessStore } from '../../modules/consciousness'
import { usePrivacyRoutingStore } from '../../privacy-routing'
import { useCharacterOrchestratorStore } from './store'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: ref('en'), t: (key: string) => key, te: () => true }) }))

describe('media notification scheduling', () => {
  it.runIf(hybridEnabled)('retries a silent idle slot before the long success interval', async () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const channel = useModsServerChannelStore()
    vi.spyOn(channel, 'onContextUpdate').mockImplementation(() => () => {})
    vi.spyOn(channel, 'onEvent').mockImplementation(() => () => {})
    const privacy = usePrivacyRoutingStore()
    const previousEnabled = privacy.idleMusings
    const previousMode = privacy.mode
    const consciousness = useConsciousnessStore()
    consciousness.activeProvider = 'hybrid-kimi'
    consciousness.activeModel = 'airi-kimi'
    vi.spyOn(consciousness, 'getChatProviderInstance').mockResolvedValue({ generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'http://127.0.0.1:18420/kimi/v1/' } }) })
    const stream = vi.spyOn(useLLM(), 'stream').mockResolvedValue(undefined)
    const store = useCharacterOrchestratorStore()
    try {
      privacy.idleMusings = true
      privacy.mode = 'cloud'
      store.initialize()
      await vi.advanceTimersByTimeAsync(5 * 60_000)
      expect(stream).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(stream).toHaveBeenCalledTimes(2)
    }
    finally {
      store.dispose()
      privacy.idleMusings = previousEnabled
      privacy.mode = previousMode
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  it.runIf(hybridEnabled)('expires a sharing grant after heartbeat loss and clears it on channel disconnect', async () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const channel = useModsServerChannelStore()
    let publish: Parameters<typeof channel.onContextUpdate>[0] | undefined
    vi.spyOn(channel, 'onContextUpdate').mockImplementation((callback) => {
      publish = callback
      return () => {}
    })
    vi.spyOn(channel, 'onEvent').mockImplementation(() => () => {})
    const store = useCharacterOrchestratorStore()
    const share = () => publish?.({ type: 'context:update', metadata: { source: { kind: 'plugin', plugin: { id: 'fixture' }, id: 'fixture' }, event: { id: 'sharing' } }, data: { id: 'sharing', contextId: 'sharing', lane: 'web:sharing', text: '', strategy: ContextUpdateStrategy.ReplaceSelf, metadata: { source: 'web-extension', sharingId: 'share', sharingSessionId: 'grant', url: 'https://www.youtube.com/watch?v=fixture', cloudVideoVision: true } } })
    try {
      store.initialize()
      share()
      await vi.advanceTimersByTimeAsync(2000)
      expect(store.idleDiagnostics.blockers).toContain('tab-shared')
      await vi.advanceTimersByTimeAsync(44_000)
      expect(store.idleDiagnostics.blockers).not.toContain('tab-shared')
      channel.connected = true
      share()
      await vi.advanceTimersByTimeAsync(2000)
      expect(store.idleDiagnostics.blockers).toContain('tab-shared')
      channel.connected = false
      await vi.advanceTimersByTimeAsync(2000)
      expect(store.idleDiagnostics.blockers).not.toContain('tab-shared')
    }
    finally {
      store.dispose()
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  it.runIf(hybridEnabled)('keeps song comparisons local when a cloud habit provider is selected', async () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const channel = useModsServerChannelStore()
    let publish: Parameters<typeof channel.onContextUpdate>[0] | undefined
    vi.spyOn(channel, 'onContextUpdate').mockImplementation((callback) => {
      publish = callback
      return () => {}
    })
    vi.spyOn(channel, 'onEvent').mockImplementation(() => () => {})
    const memory = useMediaWatchMemoryStore()
    const previousEnabled = memory.enabled
    const previousHabitProvider = memory.habitProvider
    const privacy = usePrivacyRoutingStore()
    const previousMode = privacy.mode
    const consciousness = useConsciousnessStore()
    consciousness.activeProvider = 'hybrid-kimi'
    consciousness.activeModel = 'airi-kimi'
    vi.spyOn(consciousness, 'getChatProviderInstance').mockResolvedValue({ generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'http://127.0.0.1:18420/kimi/v1/' } }) })
    const capture = vi.spyOn(privacy, 'capture')
    const cloudCapture = vi.spyOn(privacy.router, 'captureWatchHabit')
    const stream = vi.spyOn(useLLM(), 'stream').mockResolvedValue(undefined)
    const store = useCharacterOrchestratorStore()
    const original = { url: 'https://www.youtube.com/watch?v=songfixture', title: 'Artist - Летний дождь (Official Video)', isPlaying: true }
    const live = { ...original, url: 'https://www.youtube.com/watch?v=livefixture', title: 'Artist - Летний дождь (Live)' }
    const context = (lane: string, metadata: Record<string, unknown>) => publish?.({ type: 'context:update', metadata: { source: { kind: 'plugin', plugin: { id: 'fixture' }, id: 'fixture' }, event: { id: lane } }, data: { id: lane, contextId: lane, lane, text: '', strategy: ContextUpdateStrategy.ReplaceSelf, metadata: { source: 'web-extension', ...metadata } } })
    try {
      memory.clear()
      memory.enabled = true
      memory.habitProvider = 'gemini'
      privacy.mode = 'cloud'
      memory.observe(original)
      vi.advanceTimersByTime(30_000)
      memory.observe(original)
      store.initialize()
      context('web:sharing', { sharingId: 'song-share', sharingSessionId: 'grant', url: live.url, cloudVideoVision: true })
      context('web:page', { url: live.url })
      context('web:video', live)
      vi.advanceTimersByTime(30_000)
      context('web:video', live)
      await store.handleSparkNotify({ type: 'spark:notify', source: 'fixture', data: { id: 'song-comparison', eventId: 'song-comparison', kind: 'ping', urgency: 'soon', headline: 'Shared media', destinations: ['character'], payload: { source: 'web-extension-cloud-video', sharingId: 'song-share', url: live.url, title: live.title, expiresAt: Date.now() + 30_000, frames: ['data:image/jpeg;base64,YWJj'] } } })
      await vi.advanceTimersByTimeAsync(2000)
      expect(stream).toHaveBeenCalledOnce()
      expect(capture).toHaveBeenCalledOnce()
      expect(capture.mock.results[0].value.lane).toBe('local')
      expect(capture.mock.calls[0][0].text).toContain('PRIVATE song comparison')
      expect(cloudCapture).not.toHaveBeenCalled()
    }
    finally {
      store.dispose()
      memory.clear()
      memory.enabled = previousEnabled
      memory.habitProvider = previousHabitProvider
      privacy.mode = previousMode
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  it.runIf(hybridEnabled).each([
    { chat: 'kimi', video: 'gemini', publishPage: true },
    { chat: 'brain', video: 'brain', publishPage: true },
    { chat: 'kimi', video: 'gemini', publishPage: false },
  ] as const)('restores $chat media through $video with a page update: $publishPage', async ({ chat, video, publishPage }) => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const channel = useModsServerChannelStore()
    let publish: Parameters<typeof channel.onContextUpdate>[0] | undefined
    vi.spyOn(channel, 'onContextUpdate').mockImplementation((callback) => {
      publish = callback
      return () => {}
    })
    vi.spyOn(channel, 'onEvent').mockImplementation(() => () => {})
    const privacy = usePrivacyRoutingStore()
    const previousMode = privacy.mode
    const previousProvider = privacy.selectedProvider
    privacy.mode = 'cloud'
    privacy.switchProvider(chat)
    const memory = useMediaWatchMemoryStore()
    const previousEnabled = memory.enabled
    memory.enabled = false
    const consciousness = useConsciousnessStore()
    consciousness.activeProvider = `hybrid-${chat}`
    consciousness.activeModel = `airi-${chat}`
    vi.spyOn(consciousness, 'getChatProviderInstance').mockResolvedValue({ generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: `http://127.0.0.1:18420/${chat}/v1/` } }) })
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ observation: 'MUSIC: VOCALS: none. INSTRUMENTS: guitar.' })))
    const capture = vi.spyOn(privacy.router, 'captureMedia')
    const stream = vi.spyOn(useLLM(), 'stream').mockResolvedValue(undefined)
    const store = useCharacterOrchestratorStore()
    const url = 'https://www.youtube.com/watch?v=model-choice'
    const context = (lane: string, metadata: Record<string, unknown>) => publish?.({ type: 'context:update', metadata: { source: { kind: 'plugin', plugin: { id: 'fixture' }, id: 'fixture' }, event: { id: lane } }, data: { id: lane, contextId: lane, lane, text: '', strategy: ContextUpdateStrategy.ReplaceSelf, metadata: { source: 'web-extension', ...metadata } } })
    try {
      store.initialize()
      context('web:sharing', { sharingId: 'share', sharingSessionId: 'grant', url, cloudVideoVision: true, cloudVideoProvider: 'gemini', audioEars: true })
      if (publishPage)
        context('web:page', { url })
      await store.handleSparkNotify({ type: 'spark:notify', source: 'fixture', data: { id: 'audio-after-reload', eventId: 'audio-after-reload', kind: 'ping', urgency: 'soon', headline: 'Shared audio', destinations: ['character'], payload: { source: 'web-extension-audio', sharingId: 'share', url, capturedAt: Date.now(), audio: 'YWJj' } } })
      const audioCalls = fetcher.mock.calls.filter(([input]) => String(input).includes('/audio/'))
      expect(audioCalls).toHaveLength(1)
      expect(String(audioCalls[0]?.[0])).toContain('/audio/gemini/observe')
      await store.handleSparkNotify({ type: 'spark:notify', source: 'fixture', data: { id: 'video-choice', eventId: 'video-choice', kind: 'ping', urgency: 'soon', headline: 'Shared media', destinations: ['character'], payload: { source: 'web-extension-cloud-video', sharingId: 'share', url, title: 'Model choice fixture', expiresAt: Date.now() + 30_000, frames: ['data:image/jpeg;base64,YWJj'] } } })
      await vi.advanceTimersByTimeAsync(2000)
      expect(capture).toHaveBeenCalledOnce()
      expect(capture.mock.results[0].value.lane).toBe(video)
      expect(stream).toHaveBeenCalledOnce()
      expect(privacy.selectedProvider).toBe(chat)
    }
    finally {
      store.dispose()
      privacy.mode = previousMode
      privacy.switchProvider(previousProvider)
      memory.enabled = previousEnabled
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  it.runIf(hybridEnabled)('uses local vision without cloud ears or the audio wait when LOCAL is selected', async () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const channel = useModsServerChannelStore()
    let publish: Parameters<typeof channel.onContextUpdate>[0] | undefined
    vi.spyOn(channel, 'onContextUpdate').mockImplementation((callback) => {
      publish = callback
      return () => {}
    })
    vi.spyOn(channel, 'onEvent').mockImplementation(() => () => {})
    const privacy = usePrivacyRoutingStore()
    const previousMode = privacy.mode
    privacy.mode = 'local'
    const consciousness = useConsciousnessStore()
    consciousness.activeProvider = 'hybrid-local'
    consciousness.activeModel = 'airi-local'
    vi.spyOn(consciousness, 'getChatProviderInstance').mockResolvedValue({ generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'http://127.0.0.1:18420/local/v1/' } }) })
    const localCapture = vi.spyOn(privacy.router, 'capturePrivateMedia')
    const cloudCapture = vi.spyOn(privacy.router, 'captureMedia')
    const fetch = vi.spyOn(globalThis, 'fetch')
    const stream = vi.spyOn(useLLM(), 'stream').mockResolvedValue(undefined)
    const store = useCharacterOrchestratorStore()
    const url = 'https://www.youtube.com/watch?v=local-fixture'
    const notify = (source: string, payload: Record<string, unknown>): WebSocketEventOf<'spark:notify'> => ({
      type: 'spark:notify',
      source: 'fixture',
      data: { id: source, eventId: source, kind: 'ping', urgency: 'soon', headline: 'Shared media', destinations: ['character'], payload: { source, sharingId: 'share', url, expiresAt: Date.now() + 30_000, ...payload } },
    })
    try {
      store.initialize()
      for (const [lane, metadata] of [
        ['web:sharing', { sharingId: 'share', sharingSessionId: 'grant', url, cloudVideoVision: true, audioEars: true }],
        ['web:page', { url }],
      ] as const) {
        publish?.({ type: 'context:update', metadata: { source: { kind: 'plugin', plugin: { id: 'fixture' }, id: 'fixture' }, event: { id: lane } }, data: { id: lane, contextId: lane, lane, text: '', strategy: ContextUpdateStrategy.ReplaceSelf, metadata: { source: 'web-extension', ...metadata } } })
      }
      await store.handleSparkNotify(notify('web-extension-audio', { capturedAt: Date.now(), audio: 'YWJj' }))
      expect(fetch.mock.calls.filter(([input]) => String(input).includes('/audio/'))).toHaveLength(0)
      await store.handleSparkNotify(notify('web-extension-cloud-video', { title: 'Local fixture', frames: ['data:image/jpeg;base64,YWJj'] }))
      await vi.advanceTimersByTimeAsync(2000)
      expect(localCapture).toHaveBeenCalledOnce()
      expect(localCapture.mock.results[0].value.lane).toBe('local')
      expect(localCapture.mock.results[0].value.media.audioObservations).toBeUndefined()
      expect(cloudCapture).not.toHaveBeenCalled()
      expect(stream).toHaveBeenCalledOnce()
      expect(store.scheduledNotifies).toHaveLength(0)
    }
    finally {
      store.dispose()
      privacy.mode = previousMode
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })
  it.runIf(hybridEnabled)('keeps titles within one approved tab grant and clears cloud chat on stop', () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const channel = useModsServerChannelStore()
    let publish: Parameters<typeof channel.onContextUpdate>[0] | undefined
    vi.spyOn(channel, 'onContextUpdate').mockImplementation((callback) => {
      publish = callback
      return () => {}
    })
    vi.spyOn(channel, 'onEvent').mockImplementation(() => () => {})
    const privacy = usePrivacyRoutingStore()
    privacy.mediaContinuity = true
    privacy.sharedTitleChat = true
    const store = useCharacterOrchestratorStore()
    const context = (lane: string, metadata: Record<string, unknown>) => publish?.({ type: 'context:update', metadata: { source: { kind: 'plugin', plugin: { id: 'test-extension' }, id: 'fixture' }, event: { id: lane } }, data: { id: lane, contextId: lane, lane, text: '', strategy: ContextUpdateStrategy.ReplaceSelf, metadata: { source: 'web-extension', ...metadata } } })
    try {
      store.initialize()
      for (const [sharingId, title] of [['first', 'First public song'], ['second', 'Second public song']]) {
        const url = `https://www.youtube.com/watch?v=${sharingId}`
        context('web:sharing', { sharingSessionId: 'grant', sharingId, url, cloudVideoVision: true })
        context('web:page', { url })
        context('web:video', { url, title })
      }
      const chat = privacy.capture({ sessionId: 'chat', turnId: 'now', text: '/cloud What is playing?', privateInput: false, ambient: false, historyExists: false })
      expect(JSON.stringify(privacy.router.cloudConversation(chat))).toContain('Second public song')
      expect(JSON.stringify(privacy.router.cloudConversation(chat))).not.toContain('First public song')
      const media = privacy.router.captureMedia('reaction', { frames: ['data:image/jpeg;base64,YWJj'] }, undefined, { sharingId: 'second', url: 'https://www.youtube.com/watch?v=second', recentWords: [], recentEndings: [] })
      expect(JSON.stringify(privacy.router.mediaConversation(media))).toContain('First public song')
      context('web:sharing', { sharingId: '', sharingSessionId: '', cloudVideoVision: true })
      expect(JSON.stringify(privacy.router.cloudConversation(chat))).not.toContain('Second public song')
      expect(JSON.stringify(privacy.router.mediaConversation(media))).not.toContain('First public song')
    }
    finally {
      store.dispose()
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })
  it('releases a stalled media stream by its deadline and allows the next request', async () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const channel = useModsServerChannelStore()
    let publishContext: Parameters<typeof channel.onContextUpdate>[0] | undefined
    vi.spyOn(channel, 'onContextUpdate').mockImplementation((callback) => {
      publishContext = callback
      return () => {}
    })
    vi.spyOn(channel, 'onEvent').mockImplementation(() => () => {})
    const consciousness = useConsciousnessStore()
    consciousness.activeProvider = 'test'
    consciousness.activeModel = 'test-model'
    vi.spyOn(consciousness, 'getChatProviderInstance').mockResolvedValue({ generation: model => ({ protocol: 'chat-completions', config: { model, apiKey: 'test', baseURL: 'http://127.0.0.1:18420/local/v1/' } }) })
    let signal: AbortSignal | undefined
    let lateOptions: LlmStreamOptions | undefined
    let finishLate: (() => void) | undefined
    const endReaction = vi.spyOn(useCharacterStore(), 'onSparkNotifyReactionStreamEnd')
    const stream = vi.spyOn(useLLM(), 'stream').mockImplementationOnce((_model, _provider, _conversation, options) => {
      signal = options?.abortSignal
      lateOptions = options
      return new Promise<void>((resolve) => {
        finishLate = resolve
      })
    }).mockResolvedValue(undefined)
    const store = useCharacterOrchestratorStore()
    store.initialize()
    for (const [lane, metadata] of [
      ['web:sharing', { source: 'web-extension', sharingId: 'share' }],
      ['web:page', { source: 'web-extension', url: 'https://example.com/video' }],
    ] as const)
      publishContext?.({ type: 'context:update', metadata: { source: { kind: 'plugin', plugin: { id: 'test-extension' }, id: 'fixture' }, event: { id: lane } }, data: { id: lane, contextId: lane, lane, text: '', strategy: ContextUpdateStrategy.ReplaceSelf, metadata } })
    const notify = (id: string): WebSocketEventOf<'spark:notify'> => ({
      type: 'spark:notify',
      source: 'test-extension',
      data: { id, eventId: id, kind: 'ping', urgency: 'soon', headline: 'Shared media', destinations: ['character'], payload: { source: 'web-extension-watch', sharingId: 'share', url: 'https://example.com/video', text: `Scene ${id}`, expiresAt: Date.now() + 30_000 } },
    })
    await store.handleSparkNotify(notify('stalled'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(store.processing).toBe(true)
    const expiring = notify('expires-while-processing')
    expiring.data.payload!.expiresAt = Date.now() + 1000
    await store.handleSparkNotify(expiring)
    await vi.advanceTimersByTimeAsync(2000)
    expect(store.scheduledNotifies).toHaveLength(0)
    expect(store.pendingNotifies).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(18_000)
    expect(signal?.aborted).toBe(true)
    expect(store.processing).toBe(false)
    await lateOptions?.onStreamEvent?.({ type: 'text-delta', text: 'A stale late reaction.' })
    finishLate?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(endReaction).not.toHaveBeenCalled()
    await store.handleSparkNotify(notify('next'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(stream).toHaveBeenCalledTimes(2)
    expect(store.processing).toBe(false)
    store.dispose()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  it.runIf(hybridEnabled)('retains a fresh video while awaiting audio and discards it at expiry', async () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const channel = useModsServerChannelStore()
    let publishContext: Parameters<typeof channel.onContextUpdate>[0] | undefined
    vi.spyOn(channel, 'onContextUpdate').mockImplementation((callback) => {
      publishContext = callback
      return () => {}
    })
    vi.spyOn(channel, 'onEvent').mockImplementation(() => () => {})
    const store = useCharacterOrchestratorStore()
    store.initialize()
    for (const [lane, metadata] of [
      ['web:sharing', { source: 'web-extension', sharingId: 'share', cloudVideoVision: true, audioEars: true }],
      ['web:page', { source: 'web-extension', url: 'https://example.com/video' }],
    ] as const) {
      publishContext?.({ type: 'context:update', metadata: { source: { kind: 'plugin', plugin: { id: 'test-extension' }, id: 'fixture' }, event: { id: lane } }, data: { id: lane, contextId: lane, lane, text: '', strategy: ContextUpdateStrategy.ReplaceSelf, metadata } })
    }
    await store.handleSparkNotify({
      type: 'spark:notify',
      source: 'test-extension',
      data: {
        id: 'pending-audio',
        eventId: 'audio-event',
        kind: 'ping',
        urgency: 'soon',
        headline: 'Shared video',
        destinations: ['character'],
        payload: { source: 'web-extension-cloud-video', sharingId: 'share', url: 'https://example.com/video', expiresAt: Date.now() + 30_000 },
      },
    })
    await vi.advanceTimersByTimeAsync(12_000)
    expect(store.scheduledNotifies).toHaveLength(1)
    expect(store.processing).toBe(false)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(store.scheduledNotifies).toHaveLength(0)
    store.dispose()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  it('queues fresh media without the ordinary soon-notification delay', async () => {
    setActivePinia(createPinia())
    const store = useCharacterOrchestratorStore()
    const started = Date.now()
    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'test-extension',
      data: {
        id: 'fresh-media',
        eventId: 'media-event',
        kind: 'ping',
        urgency: 'soon',
        headline: 'Shared media',
        destinations: ['character'],
        payload: { source: 'web-extension-watch', sharingId: 'share', url: 'https://example.com', text: 'First scene', expiresAt: started + 30_000 },
      },
    }
    await store.handleSparkNotify(event)
    expect(store.scheduledNotifies).toHaveLength(1)
    expect(store.scheduledNotifies[0]?.nextRunAt).toBeLessThan(started + 1000)
    await store.handleSparkNotify({ ...event, data: { ...event.data, id: 'newest-media', payload: { ...event.data.payload, text: 'Next scene' } } })
    expect(store.scheduledNotifies.map(item => item.event.data.id)).toEqual(['newest-media'])
    expect(store.pendingNotifies.map(item => item.data.id)).toEqual(['newest-media'])
    store.dispose()
  })
})
