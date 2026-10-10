import type { GatewayProfile } from '@proj-airi/stage-ui/libs/model-role-profile'

import { describe, expect, it } from 'vitest'

import { configureModelRoles } from './model-role-config'

const keys = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_AI_API_TOKEN: 'synthetic-cloudflare', CLOUDFLARE_AI_MODEL: '@cf/zai-org/glm-4.7-flash', GROQ_API_KEY: 'synthetic-groq' }
const local: GatewayProfile = { private: true, baseUrl: 'http://127.0.0.1:11434/v1/', model: 'existing-local-model', apiKey: '' }

describe('model role configuration', () => {
  it('loads the second Cloudflare account and token together for brain and vision', () => {
    const roles = configureModelRoles({ AIRI_MODEL_ROLES_ENABLED: 'true' }, {
      ...keys,
      CLOUDFLARE_ACCOUNT_ID_2: 'b'.repeat(32),
      CLOUDFLARE_AI_API_TOKEN_2: 'synthetic-secondary',
    }, { local })
    expect(roles?.brain.fallbackAccount).toEqual({
      baseUrl: `https://api.cloudflare.com/client/v4/accounts/${'b'.repeat(32)}/ai/v1/`,
      apiKey: 'synthetic-secondary',
    })
    expect(roles?.vision?.fallbackAccount).toEqual(roles?.brain.fallbackAccount)
    expect(roles?.reasoning?.fallbackAccount).toBeUndefined()
  })

  it('accepts AIRI fallback overrides and rejects an incomplete credential pair', () => {
    const settings = { AIRI_MODEL_ROLES_ENABLED: 'true', CLOUDFLARE_ACCOUNT_ID_2: 'c'.repeat(32), CLOUDFLARE_AI_API_TOKEN_2: 'synthetic-override' }
    const roles = configureModelRoles(settings, { ...keys, CLOUDFLARE_ACCOUNT_ID_2: 'b'.repeat(32), CLOUDFLARE_AI_API_TOKEN_2: 'synthetic-secondary' }, { local })
    expect(roles?.brain.fallbackAccount?.baseUrl).toContain(`/accounts/${'c'.repeat(32)}/`)
    expect(roles?.brain.fallbackAccount?.apiKey).toBe('synthetic-override')
    expect(() => configureModelRoles({ AIRI_MODEL_ROLES_ENABLED: 'true' }, { ...keys, CLOUDFLARE_ACCOUNT_ID_2: 'b'.repeat(32) }, { local })).toThrow('second account')
    expect(() => configureModelRoles({ AIRI_MODEL_ROLES_ENABLED: 'true' }, { ...keys, CLOUDFLARE_AI_API_TOKEN_2: 'synthetic-secondary' }, { local })).toThrow('second account')
    expect(() => configureModelRoles({ ...settings, CLOUDFLARE_ACCOUNT_ID_2: 'invalid' }, keys, { local })).toThrow('second account')
    expect(() => configureModelRoles({ AIRI_MODEL_ROLES_ENABLED: 'true', CLOUDFLARE_ACCOUNT_ID_2: 'c'.repeat(32) }, { ...keys, CLOUDFLARE_ACCOUNT_ID_2: 'b'.repeat(32), CLOUDFLARE_AI_API_TOKEN_2: 'synthetic-secondary' }, { local })).toThrow('second account')
  })

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
