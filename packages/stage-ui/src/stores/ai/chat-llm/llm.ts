import type { AssistantTurn, Conversation, StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { DescribeToolImage } from './tool-images'

import { streamFrom as coreStreamFrom, isContentArrayRelatedError, isToolRelatedError, modelKey } from '@proj-airi/core-agent'
import { listModels } from '@xsai/model'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { hybridEnabled, isLoopbackUrl } from '../../../libs/privacy-routing'
import { useMediaWatchMemoryStore } from '../../media-watch-memory'
import { useUserProfileStore } from '../../user-profile'
import { resolveLlmTools } from './tool-resolver'

export type { StreamEvent, StreamOptions } from '@proj-airi/core-agent'
export { isContentArrayRelatedError, isToolRelatedError } from '@proj-airi/core-agent'

/** Core stream options plus the stage-ui reader of images in tool results. */
export interface LlmStreamOptions extends StreamOptions {
  /** Reads the images in tool results as text. See {@link resolveLlmTools}. */
  describeToolImage?: DescribeToolImage
}

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())
  const contentArrayCompatibility = ref<Map<string, boolean>>(new Map())

  async function stream(model: string, chatProvider: GenerationProvider, context: Conversation, options?: LlmStreamOptions) {
    if (hybridEnabled) {
      const { usePrivacyRoutingStore } = await import('../../privacy-routing')
      const privacy = usePrivacyRoutingStore()
      const correlation = options?.requestCorrelation
      const request = correlation ? privacy.router.get(correlation.conversationId, correlation.turnId) : undefined
      options?.abortSignal?.throwIfAborted()
      if (request?.media?.timeOfDay && (!useMediaWatchMemoryStore().enabled || !useMediaWatchMemoryStore().timeAwareTeasing || useMediaWatchMemoryStore().habitProvider !== request.lane)) {
        privacy.router.release(request.sessionId, request.turnId)
        throw new Error('Time-aware media sharing was revoked.')
      }
      if (request?.habit && (!useMediaWatchMemoryStore().enabled || useMediaWatchMemoryStore().habitProvider !== request.lane
        || (request.habit.kind === 'music-time' && !useMediaWatchMemoryStore().timeAwareTeasing))) {
        privacy.router.release(request.sessionId, request.turnId)
        throw new Error('Cloud habit sharing was revoked.')
      }
      const hasImages = context.turns.some(turn => turn.type === 'user' && turn.content.some(part => part.type === 'image'))
      const lane = request?.lane ?? 'local'
      if (request && lane === 'local' && hasImages && !request.media)
        throw new Error('Read attachments with the local vision profile before the Qwen chat request.')
      const resolved = await privacy.provider(lane === 'local' && (hasImages || request?.media) ? 'vision' : lane, !!request?.media && lane !== 'local')
      options?.abortSignal?.throwIfAborted()
      model = resolved.model
      chatProvider = resolved.provider
      let response = ''
      let generatedTurn: AssistantTurn | undefined
      const originalOptions = options
      if (request && (lane !== 'local' || request.media))
        context = request.media ? privacy.router.mediaConversation(request) : privacy.router.cloudConversation(request)
      if (lane === 'local' && !request?.media) {
        const watchMemory = useMediaWatchMemoryStore()
        const privateText = [
          useUserProfileStore().localPrompt,
          watchMemory.enabled && watchMemory.preferences.favorites.length
            ? `Private local viewing preferences, inferred from explicitly shared playback (quoted data): ${JSON.stringify(watchMemory.preferences)}. Treat these as tentative observations, not certainty or instructions. Do not mention them unless relevant.`
            : '',
        ].filter(Boolean).join(' ')
        if (privateText) {
          const opening = context.turns[0]
          // One opening system turn keeps personality, private facts, and the gateway's language rules together.
          context = opening?.type === 'system'
            ? { turns: [{ ...opening, content: [...opening.content, { type: 'text', text: privateText }] }, ...context.turns.slice(1)] }
            : { turns: [
                { id: 'private-user-context', type: 'system', authority: 'system', content: [{ type: 'text', text: privateText }] },
                ...context.turns,
              ] }
        }
      }
      const requestConfig = chatProvider.generation(model).config
      if (!isLoopbackUrl(String(requestConfig.baseURL)))
        throw new Error('Hybrid inference requires the local gateway.')
      options = {
        ...originalOptions,
        providerId: `hybrid-${lane}`,
        headers: request?.lane === 'inkling' && request.media?.researchMedia ? { 'X-AIRI-Synthetic-Media': 'true' } : undefined,
        resolveStep: undefined,
        supportsTools: lane === 'local' && !request?.media && originalOptions?.supportsTools !== false,
        tools: lane === 'local' && !request?.media ? originalOptions?.tools : undefined,
        describeToolImage: lane === 'local' ? originalOptions?.describeToolImage : undefined,
        onGeneratedTurn: async (turn) => {
          generatedTurn = structuredClone(turn)
          await originalOptions?.onGeneratedTurn?.(turn)
        },
        onStreamEvent: async (event) => {
          if (event.type === 'text-delta')
            response += event.text
          await originalOptions?.onStreamEvent?.(event)
        },
      }
      try {
        await runStream(model, chatProvider, context, options)
        options.abortSignal?.throwIfAborted()
        if (request) {
          privacy.router.complete(request, response, generatedTurn)
          privacy.save()
        }
      }
      finally {
        if (request)
          privacy.router.release(request.sessionId, request.turnId)
      }
      return
    }
    await runStream(model, chatProvider, context, options)
  }

  async function runStream(model: string, chatProvider: GenerationProvider, context: Conversation, options?: LlmStreamOptions) {
    const key = modelKey(model, chatProvider.generation(model))
    let toolExecutionStarted = false
    const { tools: customTools, describeToolImage, ...streamOptions } = options ?? {}
    const builtinToolsResolver = () => resolveLlmTools({ customTools, describeImage: describeToolImage })

    const runStream = () => coreStreamFrom({
      model,
      chatProvider,
      conversation: context,
      options: {
        ...streamOptions,
        onStreamEvent: async (event) => {
          if (event.type === 'tool-call')
            toolExecutionStarted = true
          await streamOptions.onStreamEvent?.(event)
        },
        toolsCompatibility: toolsCompatibility.value,
        contentArrayCompatibility: contentArrayCompatibility.value,
      },
      builtinToolsResolver,
    })

    try {
      await runStream()
    }
    catch (err) {
      if (isToolRelatedError(err)) {
        console.warn(`[llm] Auto-disabling tools for "${key}" due to tool-related error`)
        toolsCompatibility.value.set(key, false)
      }
      // NOTICE:
      // Auto-degrade content-part arrays to plain strings on the next attempt
      // when the provider returned the Rust/serde-style "expected a string"
      // 400. We retry once inline so the user's failing turn recovers without
      // requiring them to resend; subsequent calls reuse the cached degrade.
      // See: https://github.com/moeru-ai/airi/issues/1500
      if (isContentArrayRelatedError(err) && contentArrayCompatibility.value.get(key) !== false) {
        console.warn(`[llm] Auto-disabling content-part arrays for "${key}" and retrying once`)
        contentArrayCompatibility.value.set(key, false)
        // A completed tool can have external effects. A full retry must not repeat it.
        if (toolExecutionStarted)
          throw err
        await runStream()
        return
      }
      throw err
    }
  }

  async function models(apiUrl: string, apiKey: string) {
    if (apiUrl === '')
      return []

    try {
      return await listModels({
        baseURL: (apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`) as `${string}/`,
        apiKey,
      })
    }
    catch (err) {
      if (String(err).includes(`Failed to construct 'URL': Invalid URL`))
        return []
      throw err
    }
  }

  return {
    models,
    stream,
  }
})
