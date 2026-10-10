import type { SparkNotifyResponseControl } from '@proj-airi/core-agent/agents/spark-notify'
import type { WebSocketBaseEvent, WebSocketEventOf, WebSocketEvents } from '@proj-airi/server-sdk'

import type { WatchHint } from '../../../libs/media-watch-memory'
import type { RoutedRequest } from '../../../libs/privacy-routing'
import type { CloudProvider } from '../../../types/cloud-provider'

import { createSparkNotifyAgent, createSparkNotifyReactionPlugin } from '@proj-airi/core-agent/agents/spark-notify'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import * as v from 'valibot'

import { useCharacterNotebookStore, useCharacterStore } from '../'
import { useAiriRuntimePrompt } from '../../../composables/use-airi-runtime-prompt'
import { idleHumText, idleMusingInstruction, IdleMusingSchedule, normalizeIdleMusing, spokenIdleMusingKindSchema } from '../../../libs/idle-musing'
import { MediaAudioEars } from '../../../libs/media-audio'
import { MediaReactionMemory } from '../../../libs/media-reaction-memory'
import { parseMediaReaction } from '../../../libs/media-reaction-performance'
import { airiTimeOfDay, airiTimePeriodKey, habitReactionPersonality, MediaAttention, mediaReactionPersonality, parseSharedVideo } from '../../../libs/media-vision'
import { cloudProviderSchema, hybridEnabled } from '../../../libs/privacy-routing'
import { corroboratedLyrics, SensoryEventGate, unsupportedLyricClaim } from '../../../libs/sensory-context'
import { useLLM } from '../../ai/chat-llm/llm'
import { useSpeakingStore } from '../../audio'
import { useChatStore } from '../../chat'
import { useMediaWatchMemoryStore } from '../../media-watch-memory'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { useConsciousnessStore } from '../../modules/consciousness'
import { useSpeechStore } from '../../modules/speech'
import { usePrivacyRoutingStore } from '../../privacy-routing'

export { sparkNotifyCommandSchema } from '@proj-airi/core-agent/agents/spark-notify'

export const useCharacterOrchestratorStore = defineStore('character-orchestrator', () => {
  const { stream } = useLLM()
  const consciousnessStore = useConsciousnessStore()
  const { activeProvider, activeModel } = storeToRefs(consciousnessStore)
  const characterStore = useCharacterStore()
  const notebookStore = useCharacterNotebookStore()
  const { systemPrompt } = storeToRefs(characterStore)
  const runtimePrompt = useAiriRuntimePrompt()
  const modsServerChannelStore = useModsServerChannelStore()

  const processing = ref(false)
  const idleDiagnostics = ref({ blockers: [] as string[], nextAt: 0 })
  let processingIdle = false
  const pendingNotifies = ref<Array<WebSocketEventOf<'spark:notify'>>>([])

  const scheduledNotifies = ref<Array<{
    event: WebSocketEventOf<'spark:notify'>
    control?: SparkNotifyResponseControl
    enqueuedAt: number
    nextRunAt: number
    attempts: number
    maxAttempts: number
    reason?: string
  }>>([])

  const attentionConfig = ref({
    tickIntervalMs: 2_000,
    taskNotifyWindowMs: 60_000,
    requeueDelayMs: 30_000,
    maxAttempts: 3,
  })

  let tickTimer: ReturnType<typeof setInterval> | undefined
  let initialized = false
  let mediaController: AbortController | undefined
  let mediaSharingId = ''
  let sharingLastSeen = 0
  let mediaSharingSessionId = ''
  let publicSharingUrl = ''
  let mediaUrl = ''
  let lastTimedTeaseAt = 0
  let cloudVideoVision = false
  let cloudVideoProvider: CloudProvider = 'gemini'
  const mediaMemory = new MediaReactionMemory()
  const mediaAttention = new MediaAttention()
  const eventGate = new SensoryEventGate()
  const idleMusings = new IdleMusingSchedule(Date.now())
  const watchMemory = useMediaWatchMemoryStore()
  const privacyStore = usePrivacyRoutingStore()
  const ears = hybridEnabled ? new MediaAudioEars(import.meta.env.VITE_AIRI_GATEWAY_URL, import.meta.env.VITE_AIRI_GATEWAY_TOKEN) : undefined
  let audioEarsEnabled = false
  let localVideoVision = false
  let inklingResearchMedia = false
  const eventUnsubscribes: Array<() => void> = []

  function revokeSharing(reason: string) {
    mediaController?.abort(new Error(reason))
    mediaSharingId = ''
    mediaSharingSessionId = ''
    mediaUrl = ''
    publicSharingUrl = ''
    eventGate.clear()
    mediaMemory.clear()
    mediaAttention.clear()
    updatePublicSharing()
    updateAudioSharing()
    console.info('Media sharing revoked', { reason })
  }
  function updatePublicSharing() {
    privacyStore.router.setPublicSharing(cloudVideoVision && privacyStore.mode !== 'local'
      ? {
          sessionId: mediaSharingSessionId,
          sharingId: mediaSharingId,
          url: publicSharingUrl,
          continuity: privacyStore.mediaContinuity,
          chat: privacyStore.sharedTitleChat,
        }
      : undefined)
  }

  watch(() => [privacyStore.mediaContinuity, privacyStore.sharedTitleChat], () => {
    mediaMemory.setSession(privacyStore.mediaContinuity ? mediaSharingSessionId : '')
    updatePublicSharing()
  }, { flush: 'sync' })

  function updateAudioSharing() {
    ears?.setSharing(mediaSharingId, mediaUrl, !!mediaSharingId && cloudVideoVision && audioEarsEnabled && privacyStore.mode !== 'local', inklingResearchMedia)
  }

  watch(() => privacyStore.mode, () => {
    mediaController?.abort(new Error('Inference mode changed.'))
    mediaMemory.clear()
    mediaMemory.setSession(privacyStore.mediaContinuity ? mediaSharingSessionId : '')
    updatePublicSharing()
    updateAudioSharing()
  }, { flush: 'sync' })

  const replyLanguage = import.meta.env.VITE_LOCAL_REPLY_LANGUAGE
  const japaneseMusings = hybridEnabled && (replyLanguage === 'ja' || replyLanguage === 'ja-en')
  const idleLanguage = japaneseMusings ? replyLanguage : undefined

  function createNotifyAgent(correlation?: { conversationId: string, turnId: string }, media?: { scope: 'local' | 'cloud', sharingId: string, url: string, habitProvider?: 'brain' | 'gemini' | 'kimi', timeAware?: boolean, timePeriodKey?: string, habit: boolean, hint?: WatchHint, lyricsAvailable?: boolean }, signal?: AbortSignal, opening = '', idle = false) {
    // An opening line, such as a hum, always comes before the model's first words.
    let opened = !opening
    return createSparkNotifyAgent({
      runner: {
        run: request => stream(
          request.selectedChat.model,
          request.selectedChat.provider,
          request.conversation,
          {
            tools: request.tools,
            providerId: request.selectedChat.providerId,
            supportsTools: request.policy.supportsTools,
            waitForTools: request.policy.waitForTools,
            toolChoice: request.policy.toolChoice,
            onStreamEvent: async (event) => {
              if (media && event.type !== 'text-delta' && event.type !== 'reasoning-delta')
                console.info('Media stream event', { eventId: correlation?.turnId, type: event.type })
              if (!signal?.aborted)
                await request.onStreamEvent?.(event)
            },
            requestCorrelation: correlation,
            abortSignal: signal,
            temperature: media ? 1.05 : undefined,
            watching: !!media,
          },
        ),
      },
      plugins: [
        createSparkNotifyReactionPlugin({
          onDelta: (eventId, text) => {
            if (!media && !idle) {
              characterStore.onSparkNotifyReactionStreamEvent(eventId, opened ? text : `${opening}${text}`)
              opened = true
            }
          },
          onEnd: (eventId, text) => {
            if (signal?.aborted)
              return
            let reply: ReturnType<typeof parseMediaReaction>
            if (media)
              reply = parseMediaReaction(text)
            else if (idle)
              reply = { text: normalizeIdleMusing(text, idleLanguage) }
            else
              reply = { text: opening && opened ? `${opening}${text}` : text }
            if (idle) {
              if (!reply.text.trim()) {
                console.info('Idle musing skipped', { eventId, reason: 'empty-or-wrong-language' })
                return
              }
              // Publish only validated dialogue. A hum cannot make an English model reply pass the Japanese check.
              reply.text = `${opening}${reply.text}`
              characterStore.onSparkNotifyReactionStreamEvent(eventId, reply.text)
            }
            if (media) {
              if ('rejected' in reply && reply.rejected) {
                console.info('Media reaction skipped', { eventId, reason: reply.rejected === 'length' ? 'watching-length-limit' : 'watching-format-invalid' })
                return
              }
              if (unsupportedLyricClaim(reply.text, media.lyricsAvailable === true)) {
                console.info('Media reaction skipped', { eventId, reason: 'uncorroborated-lyric-claim' })
                return
              }
              if (media.scope === 'cloud' && !cloudVideoVision)
                return
              if (media.habitProvider && (!watchMemory.enabled || watchMemory.habitProvider !== media.habitProvider))
                return
              if (media.timeAware && !watchMemory.timeAwareTeasing)
                return
              if (media.hint && !watchMemory.enabled)
                return
              // Buffer a media reply until it can be checked. Revoked or repeated comments never reach TTS.
              if (media.sharingId !== mediaSharingId || media.url !== mediaUrl || !mediaMemory.remember(media.scope, media.sharingId, media.url, reply.text))
                return
              if (!watchMemory.remember(media.url, reply.text))
                return
              if (media.timePeriodKey && !watchMemory.rememberTimeTease(media.timePeriodKey))
                return
              mediaMemory.rememberStyle(media.scope, reply.text, media.habit)
              characterStore.onSparkNotifyReactionStreamEvent(eventId, reply.text, { emotion: reply.emotion })
              if (media.hint)
                watchMemory.completeHint(media.url, media.hint)
            }
            characterStore.onSparkNotifyReactionStreamEnd(eventId, reply.text)
          },
        }),
      ],
    })
  }
  const sparkNotifyAgent = createNotifyAgent()

  function computeNextRunAt(event: WebSocketEventOf<'spark:notify'>, attempts: number) {
    const now = Date.now()
    const baseDelay = (() => {
      switch (event.data.urgency) {
        case 'immediate':
          return 0
        case 'soon':
          return 10_000
        case 'later':
          return 60_000
        default:
          return 30_000
      }
    })()

    return now + baseDelay + (attempts * attentionConfig.value.requeueDelayMs)
  }

  function removePending(eventId: string) {
    pendingNotifies.value = pendingNotifies.value.filter(item => item.data.id !== eventId)
  }

  function enqueueSparkNotify(
    event: WebSocketEventOf<'spark:notify'>,
    options?: {
      reason?: string
      nextRunAt?: number
      maxAttempts?: number
      control?: SparkNotifyResponseControl
    },
  ) {
    if (!pendingNotifies.value.some(item => item.data.id === event.data.id)) {
      pendingNotifies.value.push(event)
    }

    scheduledNotifies.value.push({
      event,
      control: options?.control,
      enqueuedAt: Date.now(),
      nextRunAt: options?.nextRunAt ?? computeNextRunAt(event, 0),
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? attentionConfig.value.maxAttempts,
      reason: options?.reason,
    })
  }

  async function processSparkNotify(event: WebSocketEventOf<'spark:notify'>, control?: SparkNotifyResponseControl) {
    const payload = event.data.payload
    const cloudVideo = payload?.source === 'web-extension-cloud-video'
    const privateVideo = payload?.source === 'web-extension-local-video'
    if ((cloudVideo || privateVideo) && !hybridEnabled)
      return undefined
    const mediaReaction = payload?.source === 'web-extension-watch' || cloudVideo || privateVideo
    const idle = payload?.source === 'airi-idle-musing'
    // A musing never interrupts chat, speech, or a shared tab that began after scheduling.
    if (idle && (!hybridEnabled || !privacyStore.idleMusings || mediaSharingId || useChatStore().activeTurns.length > 0 || useSpeakingStore().nowSpeaking)) {
      console.info('Idle musing skipped', { eventId: event.data.id })
      return undefined
    }
    // A standalone hum needs no model. It is sung only by the local 猫使ビィ shy voice.
    if (idle && payload?.kind === 'hum') {
      if (!humVoiceActive())
        return undefined
      characterStore.onSparkNotifyReactionStreamEvent(event.data.id, idleHumText)
      characterStore.onSparkNotifyReactionStreamEnd(event.data.id, idleHumText)
      idleMusings.complete(Date.now())
      return undefined
    }
    // Media reactions expire rather than interrupt an active conversation or read stale content aloud.
    if (mediaReaction && payload) {
      if (!mediaSharingId || payload.sharingId !== mediaSharingId || payload.url !== mediaUrl
        || (cloudVideo && !cloudVideoVision)
        || (privateVideo && (cloudVideoVision || !localVideoVision))
        || typeof payload.expiresAt !== 'number' || payload.expiresAt < Date.now()
        || useChatStore().activeTurns.length > 0 || useSpeakingStore().nowSpeaking) {
        console.info('Media reaction skipped', { eventId: event.data.id, reason: 'expired-revoked-or-conversation-active' })
        return undefined
      }
    }
    const providerId = activeProvider.value
    const model = activeModel.value
    if (!providerId || !model) {
      console.warn('Spark notify ignored: missing active provider or model')
      return undefined
    }

    processing.value = true
    processingIdle = idle
    const controller = mediaReaction || idle ? new AbortController() : undefined
    if (controller)
      mediaController = controller
    let timer: ReturnType<typeof setTimeout> | undefined
    let captured: RoutedRequest | undefined
    let offeredHint: { url: string, hint: WatchHint } | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      if (!controller)
        return
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
      // Local Qwen needs longer than hosted media models for a cold musing.
      timer = setTimeout(() => controller.abort(new Error('Spark reaction deadline exceeded.')), idle ? 45_000 : 20_000)
    })
    console.info('Spark reaction started', { eventId: event.data.id, media: mediaReaction })

    try {
      const provider = await Promise.race([consciousnessStore.getChatProviderInstance(providerId), deadline])
      const privacy = usePrivacyRoutingStore()
      // Full history stays local. The cloud teaser receives approved counts or current music with a coarse period.
      const audioObservations = ears?.recent()
      if (hybridEnabled && mediaReaction && audioObservations?.length)
        watchMemory.observeMusic(mediaUrl, audioObservations)
      const memoryHint = hybridEnabled && mediaReaction ? watchMemory.takeHint(mediaUrl) : undefined
      if (memoryHint)
        offeredHint = { url: mediaUrl, hint: memoryHint }
      const now = new Date()
      const localMode = privacy.mode === 'local'
      const cloudTeaser = !localMode && (watchMemory.habitProvider === 'brain' || watchMemory.habitProvider === 'gemini' || watchMemory.habitProvider === 'kimi') ? watchMemory.habitProvider : undefined
      const timeAware = !memoryHint && cloudVideo && cloudVideoVision && !!cloudTeaser && watchMemory.canTimeTease(now)
        && ears?.readyForTimeTease(now.getTime()) === true && now.getTime() - lastTimedTeaseAt >= 180_000
      if (timeAware)
        lastTimedTeaseAt = now.getTime()
      const habitProvider = (memoryHint?.shared || timeAware) && cloudVideo && cloudVideoVision ? cloudTeaser : undefined
      // A late or failed audio request cannot silently turn listening together into visual-only commentary.
      if (cloudVideo && !localMode && !memoryHint && audioEarsEnabled && !audioObservations?.length) {
        console.info('Media reaction skipped', { eventId: event.data.id, reason: 'no-fresh-audio' })
        return undefined
      }
      const scope = !localMode && cloudVideo && (!memoryHint || habitProvider) ? 'cloud' as const : 'local' as const
      if (scope === 'local' && memoryHint && controller) {
        clearTimeout(timer)
        timer = setTimeout(() => controller.abort(new Error('Spark reaction deadline exceeded.')), 45_000)
      }
      const hints = mediaMemory.hints(scope)
      const media = mediaReaction ? { scope, sharingId: mediaSharingId, url: mediaUrl, habitProvider, timeAware, timePeriodKey: timeAware ? airiTimePeriodKey(now) : undefined, habit: !!memoryHint, hint: memoryHint, lyricsAvailable: scope === 'cloud' && corroboratedLyrics(audioObservations ?? [], typeof payload?.text === 'string' ? payload.text : '').length > 0 } : undefined
      const sharedMedia = cloudVideo && !memoryHint
        ? parseSharedVideo({ ...payload, modeHint: hints.modeHint, reactionSound: hints.reactionSound, timeOfDay: timeAware ? airiTimeOfDay(now) : undefined, audioObservations, audioPriority: audioEarsEnabled, researchMedia: inklingResearchMedia })
        : undefined
      if (memoryHint) {
        captured = habitProvider
          ? privacy.router.captureWatchHabit(event.data.id, memoryHint.shared, habitProvider, true, hints.habitWarm)
          : privacy.capture({ sessionId: 'private-watch-memory', turnId: event.data.id, text: memoryHint.privateText, privateInput: true, ambient: true, historyExists: false })
      }
      else if (sharedMedia) {
        captured = localMode
          ? privacy.router.capturePrivateMedia(event.data.id, { ...sharedMedia, audioObservations: undefined, audioPriority: false })
          : privacy.router.captureMedia(event.data.id, { ...sharedMedia, attention: mediaAttention.resolve(sharedMedia.frames, ears?.kind() ?? 'unknown') }, timeAware ? habitProvider : undefined, { sharingId: mediaSharingId, url: mediaUrl, recentWords: hints.recentWords, recentEndings: hints.recentEndings, recentComments: mediaMemory.recent(scope, mediaSharingId, mediaUrl).slice(-8) }, privacy.selectedProvider === 'brain' ? 'brain' : cloudVideoProvider)
      }
      else if (privateVideo) {
        captured = privacy.router.capturePrivateMedia(event.data.id, { ...payload, modeHint: hints.modeHint, reactionSound: hints.reactionSound })
      }
      // Local musings can use private context. Their recent lines never reach a cloud request.
      const idleScope = localMode ? 'local' as const : 'cloud' as const
      const idleText = idle ? idleMusingInstruction(v.parse(spokenIdleMusingKindSchema, payload?.kind), idleMusings.recentLines(idleScope), idleLanguage) : ''
      // The hum takes its own line, so speech chunking gives it a separate clip before the first sentence.
      const idleOpening = idle && payload?.humOpening === true && humVoiceActive() ? `${idleHumText}\n` : ''
      if (idle)
        captured = privacy.capture({ sessionId: 'idle-musings', turnId: event.data.id, text: idleText, privateInput: false, ambient: false, historyExists: false })
      const agent = media || idle ? createNotifyAgent(captured ? { conversationId: captured.sessionId, turnId: captured.turnId } : undefined, media, controller?.signal, idleOpening, idle) : sparkNotifyAgent
      const result = await Promise.race([agent.handle({
        event: memoryHint ? { ...event, data: { ...event.data, note: 'React to this approved habit only.', payload: habitProvider ? { habit: memoryHint.shared } : { memoryHint: memoryHint.privateText } } } : idle ? { ...event, data: { ...event.data, note: idleText } } : event,
        selectedChat: {
          providerId,
          model,
          provider,
        },
        systemPrompt: !mediaReaction ? systemPrompt.value : (memoryHint ? `${habitReactionPersonality} ${hints.habitWarm ? 'Prefer a warm acknowledgment.' : 'A light affectionate tease is welcome.'}` : mediaReactionPersonality),
        runtimePrompt: mediaReaction ? undefined : runtimePrompt.value,
        control: mediaReaction || idle ? { forceTextResponse: true } : control,
      }), deadline])
      if (idle && !controller?.signal.aborted) {
        const musing = [...characterStore.reactions].reverse().find(item => item.sourceEventId === event.data.id)?.message
        if (musing?.trim()) {
          idleMusings.remember(idleScope, musing)
          idleMusings.complete(Date.now())
        }
      }
      if (!result.commands.length)
        return result

      for (const command of result.commands) {
        modsServerChannelStore.send({
          type: 'spark:command',
          data: command,
        })
      }

      return result
    }
    finally {
      if (offeredHint)
        watchMemory.releaseHint(offeredHint.url, offeredHint.hint)
      if (timer)
        clearTimeout(timer)
      if (captured)
        usePrivacyRoutingStore().router.release(captured.sessionId, captured.turnId)
      if (controller === mediaController)
        mediaController = undefined
      processing.value = false
      processingIdle = false
      console.info('Spark reaction ended', { eventId: event.data.id, aborted: controller?.signal.aborted ?? false })
    }
  }

  async function handleIncomingSparkNotify(event: WebSocketEventOf<'spark:notify'>, control?: SparkNotifyResponseControl) {
    if (event.data.payload?.source === 'web-extension-audio') {
      // Ears only produce observations. They never open speech intents or run the personality agent independently.
      await ears?.observe(event.data.payload)
      const observations = ears?.recent()
      if (hybridEnabled && observations?.length)
        watchMemory.observeMusic(mediaUrl, observations)
      return undefined
    }
    if (hybridEnabled && !eventGate.accept(event.data.payload ? { ...event.data.payload, audioObservations: ears?.recent() } : undefined))
      return undefined
    const source = event.data.payload?.source
    if (source === 'web-extension-watch' || source === 'web-extension-cloud-video' || source === 'web-extension-local-video') {
      const replaced = scheduledNotifies.value.filter(item => item.reason === 'media:observed' && item.event.data.payload?.sharingId === event.data.payload?.sharingId)
      for (const item of replaced)
        removePending(item.event.data.id)
      scheduledNotifies.value = scheduledNotifies.value.filter(item => !replaced.includes(item))
      // Media already has a capture debounce and speech cooldown. An ordinary notification delay loses fresh audio.
      enqueueSparkNotify(event, { reason: 'media:observed', control, nextRunAt: Date.now(), maxAttempts: 1 })
      return undefined
    }
    if (event.data.urgency === 'immediate' && !processing.value) {
      return await processSparkNotify(event, control)
    }

    enqueueSparkNotify(event, { reason: 'spark:notify', control })
    return undefined
  }

  async function handleSparkNotifyWithReaction(
    event: WebSocketEventOf<'spark:notify'>,
    options?: SparkNotifyResponseControl & { fallbackText?: string },
  ) {
    await handleIncomingSparkNotify(event, options)

    const reaction = [...characterStore.reactions]
      .reverse()
      .find(item => item.sourceEventId === event.data.id)
      ?.message
      ?.trim()

    return reaction || options?.fallbackText || ''
  }

  function enqueueDueTasks(now: number) {
    const dueTasks = notebookStore.getDueTasks(now, attentionConfig.value.taskNotifyWindowMs)
    if (!dueTasks.length)
      return

    for (const task of dueTasks) {
      const event: WebSocketEventOf<'spark:notify'> = {
        type: 'spark:notify',
        source: 'character:task-scheduler',
        data: {
          id: `task-${task.id}`,
          eventId: task.id,
          kind: 'reminder',
          urgency: task.priority === 'critical' ? 'immediate' : 'soon',
          headline: `Task reminder: ${task.title}`,
          note: task.details,
          destinations: ['character'],
          payload: {
            taskId: task.id,
            dueAt: task.dueAt,
            priority: task.priority,
          },
        },
      }

      enqueueSparkNotify(event, { reason: 'task:due' })
      notebookStore.markTaskNotified(task.id, now + attentionConfig.value.requeueDelayMs)
    }
  }

  /** The local speech server sings hums only in VOICEVOX style 60, 猫使ビィ 人見知り. */
  function humVoiceActive() {
    const speech = useSpeechStore()
    return speech.activeSpeechProvider === 'voicevox' && speech.activeSpeechVoiceId === '60'
  }

  function enqueueIdleMusing(now: number) {
    const id = `idle-${nanoid()}`
    enqueueSparkNotify({
      type: 'spark:notify',
      source: 'character:idle-musing',
      data: {
        id,
        eventId: id,
        kind: 'ping',
        urgency: 'soon',
        headline: 'Idle musing',
        destinations: ['character'],
        payload: { source: 'airi-idle-musing', ...idleMusings.take(now, humVoiceActive()) },
      },
    }, { reason: 'idle:musing', nextRunAt: now, maxAttempts: 1 })
  }

  async function tick() {
    const now = Date.now()
    // Sharing heartbeats arrive every ten seconds. A 45-second lease tolerates delayed delivery and bounds stale sharing.
    if (mediaSharingId && now - sharingLastSeen >= 45_000)
      revokeSharing('sharing-heartbeat-expired')
    const expired = scheduledNotifies.value.filter(item => item.reason === 'media:observed' && typeof item.event.data.payload?.expiresAt === 'number' && item.event.data.payload.expiresAt <= now)
    for (const item of expired)
      removePending(item.event.data.id)
    scheduledNotifies.value = scheduledNotifies.value.filter(item => !expired.includes(item))
    const blockers = [
      !hybridEnabled && 'hybrid-disabled',
      !privacyStore.idleMusings && 'idle-disabled',
      processing.value && !processingIdle && 'reaction-processing',
      !!mediaSharingId && 'tab-shared',
      scheduledNotifies.value.some(item => item.reason !== 'idle:musing') && 'notification-pending',
      useChatStore().activeTurns.length > 0 && 'chat-active',
      !!useSpeakingStore().nowSpeaking && 'speaking',
    ].filter((reason): reason is string => !!reason)
    if (JSON.stringify(blockers) !== JSON.stringify(idleDiagnostics.value.blockers))
      console.info('Idle musing blockers changed', { blockers })
    if (blockers.length) {
      idleMusings.busy(now)
    }
    idleDiagnostics.value = { blockers, nextAt: idleMusings.nextAt }
    if (processing.value)
      return

    enqueueDueTasks(now)
    if (idleMusings.due(now))
      enqueueIdleMusing(now)

    const nextIndex = scheduledNotifies.value.findIndex(item => item.nextRunAt <= now)
    if (nextIndex < 0)
      return

    const candidate = scheduledNotifies.value[nextIndex]
    const payload = candidate.event.data.payload
    if (payload?.source === 'web-extension-cloud-video' && privacyStore.mode !== 'local' && audioEarsEnabled
      && ears?.shouldDeferReaction(now) && now - candidate.enqueuedAt < 8_000) {
      // Wait briefly for a musical gap. The original expiry and stream deadline remain unchanged.
      candidate.nextRunAt = now + attentionConfig.value.tickIntervalMs
      return
    }
    if (payload?.source === 'web-extension-cloud-video' && privacyStore.mode !== 'local' && audioEarsEnabled && !ears?.recent().length
      && payload.sharingId === mediaSharingId && payload.url === mediaUrl
      && typeof payload.expiresAt === 'number' && payload.expiresAt > now) {
      // Keep the same fresh frames pending until their audio arrives. Expired or revoked observations are discarded normally.
      candidate.nextRunAt = now + attentionConfig.value.tickIntervalMs
      return
    }

    const [next] = scheduledNotifies.value.splice(nextIndex, 1)
    removePending(next.event.data.id)

    try {
      await processSparkNotify(next.event, next.control)
    }
    catch (error) {
      if (next.attempts + 1 < next.maxAttempts) {
        scheduledNotifies.value = [...scheduledNotifies.value, {
          ...next,
          attempts: next.attempts + 1,
          nextRunAt: computeNextRunAt(next.event, next.attempts + 1),
        }]
        pendingNotifies.value = [...pendingNotifies.value, next.event]
      }
      else {
        console.warn('Dropped spark:notify after max attempts:', error)
      }
    }
  }

  function startTicker() {
    if (tickTimer)
      return

    tickTimer = setInterval(() => {
      void tick()
    }, attentionConfig.value.tickIntervalMs)
  }

  function stopTicker() {
    if (!tickTimer)
      return

    clearInterval(tickTimer)
    tickTimer = undefined
  }

  async function handleSparkEmit(_: WebSocketBaseEvent<'spark:emit', WebSocketEvents['spark:emit']>) {
    // Currently no-op
    return undefined
  }

  function initialize() {
    if (initialized)
      return

    initialized = true

    eventUnsubscribes.push(watch(() => modsServerChannelStore.connected, (connected) => {
      if (!connected && mediaSharingId)
        revokeSharing('server-channel-disconnected')
    }, { flush: 'sync' }))

    eventUnsubscribes.push(modsServerChannelStore.onContextUpdate((event) => {
      if (event.data.metadata?.source !== 'web-extension')
        return
      sharingLastSeen = Date.now()
      if (event.data.lane === 'web:sharing') {
        const nextSharingId = typeof event.data.metadata.sharingId === 'string' ? event.data.metadata.sharingId : ''
        const nextSessionId = typeof event.data.metadata.sharingSessionId === 'string' ? event.data.metadata.sharingSessionId : ''
        const nextUrl = typeof event.data.metadata.url === 'string' ? event.data.metadata.url : ''
        // Reconnection republishes the same share. Preserve memory until a genuine stop or new share.
        if (nextSharingId !== mediaSharingId || nextUrl !== publicSharingUrl) {
          eventGate.clear()
          mediaController?.abort(new Error('Media sharing changed.'))
          mediaMemory.clearVideo()
          mediaAttention.clear()
          mediaUrl = ''
        }
        mediaSharingId = nextSharingId
        mediaSharingSessionId = nextSessionId
        publicSharingUrl = nextUrl
        // The current sharing grant restores media scope without a new page event after a desktop reload.
        mediaUrl = nextSharingId ? nextUrl : ''
        if (cloudVideoVision !== (event.data.metadata.cloudVideoVision === true))
          mediaMemory.clear()
        const model = v.safeParse(cloudProviderSchema, event.data.metadata.cloudVideoProvider)
        const nextProvider = model.success ? model.output : 'gemini'
        if (cloudVideoProvider !== nextProvider) {
          mediaController?.abort(new Error('Cloud video model changed.'))
          mediaMemory.clear()
          eventGate.clear()
        }
        cloudVideoProvider = nextProvider
        cloudVideoVision = event.data.metadata.cloudVideoVision === true
        mediaMemory.setSession(privacyStore.mediaContinuity ? nextSessionId : '')
        if (!nextSharingId)
          mediaMemory.clear()
        updatePublicSharing()
        audioEarsEnabled = event.data.metadata.audioEars === true
        localVideoVision = event.data.metadata.localVideoVision === true
        inklingResearchMedia = event.data.metadata.inklingResearchMedia === true
        updateAudioSharing()
      }
      if (event.data.lane === 'web:page') {
        const nextUrl = typeof event.data.metadata.url === 'string' ? event.data.metadata.url : ''
        if (nextUrl !== mediaUrl) {
          eventGate.clear()
          mediaController?.abort(new Error('Shared video changed.'))
          mediaMemory.clearVideo()
          mediaAttention.clear()
        }
        mediaUrl = nextUrl
        if (nextUrl !== publicSharingUrl)
          privacyStore.router.setPublicSharing()
        updateAudioSharing()
      }
      if (event.data.lane === 'web:video' && mediaSharingId && event.data.metadata.url === mediaUrl) {
        watchMemory.observe(event.data.metadata)
        privacyStore.router.updatePublicIdentity(mediaSharingId, mediaUrl, event.data.metadata)
      }
    }))

    eventUnsubscribes.push(
      modsServerChannelStore.onEvent('spark:notify', async (event) => {
        try {
          await handleIncomingSparkNotify(event)
        }
        catch (error) {
          console.warn('Failed to handle spark:notify event:', error)
        }
      }),
    )

    eventUnsubscribes.push(
      modsServerChannelStore.onEvent('spark:emit', async (event) => {
        try {
          await handleSparkEmit(event)
        }
        catch (error) {
          console.warn('Failed to handle spark:emit event:', error)
        }
      }),
    )

    startTicker()
  }

  function dispose() {
    revokeSharing('orchestrator-disposed')
    stopTicker()

    for (const unsubscribe of eventUnsubscribes) {
      unsubscribe()
    }

    eventUnsubscribes.length = 0
    initialized = false
  }

  return {
    processing,
    idleDiagnostics,
    pendingNotifies,
    scheduledNotifies,
    attentionConfig,

    initialize,
    startTicker,
    stopTicker,
    dispose,

    handleSparkNotify: handleIncomingSparkNotify,
    handleSparkNotifyWithReaction,
    handleSparkEmit,
  }
})
