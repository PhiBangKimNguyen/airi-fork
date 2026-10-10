import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { CloudProvider, InferenceLane, PrivacyState } from '../libs/privacy-routing'

import { getGenerationProvider } from '@proj-airi/provider-inference'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, markRaw, toRaw } from 'vue'

import { isLoopbackUrl, PrivacyRouter } from '../libs/privacy-routing'
import { getDefinedProvider } from '../libs/providers'
import { useUserProfileStore } from './user-profile'

/** Owns local provenance and cloud-only history. It does not replicate through AIRI account sync. */
export const usePrivacyRoutingStore = defineStore('privacy-routing', () => {
  const state = useLocalStorage<PrivacyState>('hybrid/privacy-state', { provider: import.meta.env.VITE_AIRI_MODEL_ROLES_ENABLED === 'true' ? 'brain' : 'kimi', sessions: {}, cloudHistory: {} })
  const label = useLocalStorage<InferenceLane>('hybrid/last-route', 'local')
  const mode = useLocalStorage<'auto' | 'local' | 'cloud'>('hybrid/conversation-mode', 'auto')
  const mediaContinuity = useLocalStorage('hybrid/media-continuity', false)
  const sharedTitleChat = useLocalStorage('hybrid/shared-title-chat', false)
  const idleMusings = useLocalStorage('hybrid/idle-musings', true)
  const userProfile = useUserProfileStore()
  const selectedProvider = computed(() => state.value.provider)
  const router = markRaw(new PrivacyRouter(structuredClone(toRaw(state.value)), import.meta.env.VITE_AIRI_PUBLIC_CHARACTER_PROMPT || undefined))
  const status = computed(() => label.value.toUpperCase())
  const gateway = import.meta.env.VITE_AIRI_GATEWAY_URL as string
  const token = import.meta.env.VITE_AIRI_GATEWAY_TOKEN as string

  async function provider(lane: InferenceLane | 'vision', sharedVideo = false): Promise<{ model: string, provider: GenerationProvider }> {
    if (!gateway || !isLoopbackUrl(gateway))
      throw new Error('The hybrid gateway must use a literal loopback address.')
    const definitionId = lane === 'kimi' ? 'nvidia' : lane === 'gemini' ? 'google-generative-ai' : ['gemma31', 'gemma26', 'inkling'].includes(lane) ? 'openrouter-ai' : 'openai-compatible'
    const definition = getDefinedProvider(definitionId)
    if (!definition)
      throw new Error(`Provider definition "${definitionId}" is unavailable.`)
    const instance = await definition.createProvider({ apiKey: token, baseUrl: `${gateway}/${sharedVideo ? 'media/' : ''}${lane}/v1/`, api: 'chat-completions' })
    const resolved = getGenerationProvider(instance)
    if (!resolved)
      throw new Error('The selected provider has no generation interface.')
    label.value = lane === 'vision' ? 'local' : lane
    return { model: lane === 'vision' ? 'local-vision' : `airi-${lane}`, provider: resolved }
  }

  function capture(input: Parameters<PrivacyRouter['capture']>[0]) {
    const request = router.capture({ mode: mode.value, ...input, userProfile: userProfile.cloudProfile })
    label.value = request.lane
    // Persist plain snapshots. A cloud request must never clone reactive history proxies.
    save()
    return request
  }

  function save() {
    state.value = router.snapshot()
  }

  function switchProvider(value: CloudProvider) {
    router.switchProvider(value)
    save()
  }

  return { status, mode, mediaContinuity, sharedTitleChat, idleMusings, selectedProvider, provider, capture, switchProvider, router, save }
})
