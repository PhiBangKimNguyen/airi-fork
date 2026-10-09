import type { GatewayProfile } from '@proj-airi/stage-ui/libs/model-role-profile'

import { describe, expect, it } from 'vitest'

import { configureModelRoles } from './model-role-config'

const keys = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_AI_API_TOKEN: 'synthetic-cloudflare', CLOUDFLARE_AI_MODEL: '@cf/zai-org/glm-4.7-flash', GROQ_API_KEY: 'synthetic-groq' }
const local: GatewayProfile = { private: true, baseUrl: 'http://127.0.0.1:11434/v1/', model: 'existing-local-model', apiKey: '' }

describe('model role configuration', () => {
  it('loads the supplied key names and documented models without replacing local inference', () => {
    const roles = configureModelRoles({ AIRI_MODEL_ROLES_ENABLED: 'true', AIRI_HEAVY_REASONING_ENABLED: 'true' }, keys, { local })
    expect(roles?.brain.model).toBe('@cf/zai-org/glm-4.7-flash')
    expect(roles?.brain.apiKey).toBe('synthetic-cloudflare')
    expect(roles?.brain.thinking).toBe(false)
    expect(roles?.reasoning?.model).toBe('qwen/qwen3.8-27b')
    expect(roles?.heavy?.model).toBe('openai/gpt-oss-120b')
    expect(roles?.fallback?.model).toBe('existing-local-model')
  })

  it('supports independent provider, model, effort, and limit overrides', () => {
    const roles = configureModelRoles({ AIRI_MODEL_ROLES_ENABLED: 'true', AIRI_BRAIN_PROVIDER: 'groq', AIRI_BRAIN_MODEL: 'alternate-model', AIRI_BRAIN_MAX_TOKENS: '512', AIRI_BRAIN_REASONING_EFFORT: 'none' }, keys, { local })
    expect(roles?.brain.baseUrl).toBe('https://api.groq.com/openai/v1/')
    expect(roles?.brain.model).toBe('alternate-model')
    expect(roles?.brain.maxTokens).toBe(512)
    expect(roles?.brain.reasoningEffort).toBe('none')
    expect(roles?.heavy).toBeUndefined()
  })

  it('preserves the disabled pipeline and rejects invalid enabled configuration', () => {
    expect(configureModelRoles({}, {}, {})).toBeUndefined()
    expect(() => configureModelRoles({ AIRI_MODEL_ROLES_ENABLED: 'true' }, {}, {})).toThrow('account')
    expect(() => configureModelRoles({ AIRI_MODEL_ROLES_ENABLED: 'true', AIRI_VISION_MAX_TOKENS: '-1' }, keys, { local })).toThrow('positive integers')
    expect(() => configureModelRoles({ AIRI_MODEL_ROLES_ENABLED: 'true', AIRI_BRAIN_PROVIDER: 'unknown' }, keys, { local })).toThrow('Unknown provider')
  })
})
