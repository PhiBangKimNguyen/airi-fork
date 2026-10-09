import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.stubEnv('VITE_AIRI_HYBRID_ENABLED', 'true')
  vi.stubEnv('VITE_LOCAL_TTS_PROVIDER', 'voicevox')
  vi.stubEnv('VITE_LOCAL_TTS_VOICE', '8')
  vi.stubEnv('VITE_LOCAL_VOICEVOX_URL', 'http://127.0.0.1:50021/')
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
})

describe('hybrid voice configuration', () => {
  it('selects the brain once without erasing private provenance or later provider choices', async () => {
    vi.stubEnv('VITE_AIRI_MODEL_ROLES_ENABLED', 'true')
    localStorage.setItem('hybrid/privacy-state', JSON.stringify({ provider: 'gemini', sessions: { private: { private: true } }, cloudHistory: {} }))
    const { initializeHybrid } = await import('./hybrid')
    initializeHybrid()
    const state = JSON.parse(localStorage.getItem('hybrid/privacy-state')!)
    expect(state.provider).toBe('brain')
    expect(state.sessions.private.private).toBe(true)
    state.provider = 'kimi'
    localStorage.setItem('hybrid/privacy-state', JSON.stringify(state))
    initializeHybrid()
    expect(JSON.parse(localStorage.getItem('hybrid/privacy-state')!).provider).toBe('kimi')
  })
  it('seeds the approved controls for an absent provider', async () => {
    const { initializeHybrid } = await import('./hybrid')
    initializeHybrid()
    const stored = JSON.parse(localStorage.getItem('settings/providers/configured')!)
    expect(stored.voicevox.config.voiceSettings).toEqual({ speed: 0.9, pitch: 0, intonation: 1, volume: 1 })
    expect(stored.voicevox.config.baseUrl).toBe('http://127.0.0.1:50021/')
  })

  it('applies the approved migration once and preserves later user changes', async () => {
    const { initializeHybrid } = await import('./hybrid')
    localStorage.setItem('settings/providers/configured', JSON.stringify({ voicevox: {
      id: 'voicevox',
      config: { baseUrl: 'http://127.0.0.1:50022/', voiceSettings: { speed: 0.92, pitch: 0, intonation: 1.25, volume: 1 } },
    } }))
    initializeHybrid()
    const stored = JSON.parse(localStorage.getItem('settings/providers/configured')!)
    expect(stored.voicevox.config.voiceSettings).toEqual({ speed: 0.9, pitch: 0, intonation: 1, volume: 1 })
    stored.voicevox.config.voiceSettings.speed = 0.83
    localStorage.setItem('settings/providers/configured', JSON.stringify(stored))
    initializeHybrid()
    const restarted = JSON.parse(localStorage.getItem('settings/providers/configured')!)
    expect(restarted.voicevox.config.voiceSettings.speed).toBe(0.83)
    expect(restarted.voicevox.config.baseUrl).toBe('http://127.0.0.1:50022/')
  })
})
