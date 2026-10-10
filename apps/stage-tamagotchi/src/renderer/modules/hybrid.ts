import { hybridEnabled } from '@proj-airi/stage-ui/libs/privacy-routing'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'

/** Character settings apply after raw profile settings. Seed local speech through the character's persisted owner once. */
export async function initializeHybridVoice() {
  if (!hybridEnabled)
    return
  if (import.meta.env.VITE_AIRI_MODEL_ROLES_ENABLED === 'true' && !localStorage.getItem('hybrid/brain-card-configured')) {
    const updated = await useAiriCardStore().updateActiveCardConsciousness({ provider: 'hybrid-brain', model: 'airi-brain' })
    if (updated)
      localStorage.setItem('hybrid/brain-card-configured', 'true')
  }
  const japanese = import.meta.env.VITE_LOCAL_TTS_PROVIDER === 'voicevox'
  const marker = japanese ? 'hybrid/voicevox-voice-configured-v2' : 'hybrid/local-kokoro-configured'
  if (localStorage.getItem(marker))
    return
  const card = useAiriCardStore()
  const updated = await card.updateActiveCardSpeech({ provider: japanese ? 'voicevox' : 'openai-compatible-audio-speech', model: japanese ? 'default' : 'kokoro-local-tts', voice_id: import.meta.env.VITE_LOCAL_TTS_VOICE })
  if (updated)
    localStorage.setItem(marker, 'true')
}

/** Initializes the dedicated hybrid profile before Pinia reads persisted provider configuration. */
export function initializeHybrid() {
  if (!hybridEnabled)
    return
  const gateway = import.meta.env.VITE_AIRI_GATEWAY_URL
  const token = import.meta.env.VITE_AIRI_GATEWAY_TOKEN
  const stored = JSON.parse(localStorage.getItem('settings/providers/configured') ?? '{}')
  const added = JSON.parse(localStorage.getItem('settings/providers/added') ?? '{}')
  for (const [lane, definitionId] of [['brain', 'openai-compatible'], ['local', 'openai-compatible'], ['vision', 'openai-compatible'], ['kimi', 'nvidia'], ['gemini', 'google-generative-ai'], ['gemma31', 'openrouter-ai'], ['gemma26', 'openrouter-ai'], ['inkling', 'openrouter-ai']]) {
    const id = `hybrid-${lane}`
    stored[id] = {
      id,
      definitionId,
      configuredBy: 'user',
      status: 'configured',
      config: { apiKey: token, baseUrl: `${gateway}/${lane}/v1/`, api: 'chat-completions', model: lane === 'vision' ? 'local-vision' : `airi-${lane}` },
    }
    added[id] = true
  }
  const speechId = 'openai-compatible-audio-speech'
  stored[speechId] = {
    id: speechId,
    definitionId: speechId,
    configuredBy: 'user',
    status: 'configured',
    config: { apiKey: token, baseUrl: `${gateway}/speech/v1/`, model: 'kokoro-local-tts', voice: import.meta.env.VITE_LOCAL_TTS_PROVIDER === 'voicevox' ? 'af_heart' : import.meta.env.VITE_LOCAL_TTS_VOICE },
  }
  added[speechId] = true
  if (import.meta.env.VITE_LOCAL_TTS_PROVIDER === 'voicevox') {
    if (!stored.voicevox) {
      stored.voicevox = {
        id: 'voicevox',
        definitionId: 'voicevox',
        configuredBy: 'user',
        status: 'configured',
        config: { baseUrl: import.meta.env.VITE_LOCAL_VOICEVOX_URL, voiceSettings: { speed: 0.9, pitch: 0, intonation: 1.0, volume: 1 } },
      }
    }
    // The selected VOICEVOX profile gets all four controls once. Later launches retain user changes.
    const controlsMarker = 'hybrid/tsumugi-j-controls-configured'
    if (!localStorage.getItem(controlsMarker)) {
      stored.voicevox.config.voiceSettings = { speed: 0.9, pitch: 0, intonation: 1.0, volume: 1 }
      localStorage.setItem(controlsMarker, 'true')
    }
    added.voicevox = true
  }
  localStorage.setItem('settings/providers/configured', JSON.stringify(stored))
  localStorage.setItem('settings/providers/added', JSON.stringify(added))
  if (import.meta.env.VITE_AIRI_MODEL_ROLES_ENABLED === 'true' && !localStorage.getItem('hybrid/brain-profile-configured')) {
    const privacy = JSON.parse(localStorage.getItem('hybrid/privacy-state') ?? '{"sessions":{},"cloudHistory":{}}')
    privacy.provider = 'brain'
    const habitProvider = localStorage.getItem('hybrid/watch-habit-provider')
    if (habitProvider === 'gemini' || habitProvider === 'kimi')
      localStorage.setItem('hybrid/watch-habit-provider', 'brain')
    localStorage.setItem('hybrid/privacy-state', JSON.stringify(privacy))
    localStorage.setItem('settings/consciousness/active-provider', 'hybrid-brain')
    localStorage.setItem('settings/consciousness/active-model', 'airi-brain')
    localStorage.setItem('hybrid/brain-profile-configured', 'true')
  }
  if (!localStorage.getItem('settings/consciousness/active-provider')) {
    localStorage.setItem('settings/consciousness/active-provider', 'hybrid-kimi')
    localStorage.setItem('settings/consciousness/active-model', 'airi-kimi')
  }
  localStorage.setItem('settings/vision/active-provider', 'hybrid-vision')
  localStorage.setItem('settings/vision/active-model', 'local-vision')
  if (!localStorage.getItem('settings/speech/active-provider') || localStorage.getItem('settings/speech/active-provider') === 'speech-noop') {
    localStorage.setItem('settings/speech/active-provider', speechId)
    localStorage.setItem('settings/speech/active-model', 'kokoro-local-tts')
    localStorage.setItem('settings/speech/voice', import.meta.env.VITE_LOCAL_TTS_VOICE)
  }
  localStorage.setItem('onboarding/completed', 'true')
  localStorage.setItem('onboarding/skipped', 'true')
}
