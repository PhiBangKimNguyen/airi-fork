import type { GatewayProfile } from '@proj-airi/stage-ui/libs/model-role-profile'
import type { ModelRoles } from '@proj-airi/stage-ui/libs/model-roles'

function positiveInteger(value: string | undefined, fallback: number) {
  if (!value)
    return fallback
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result <= 0)
    throw new Error('Model role limits require positive integers.')
  return result
}

/** Resolves role overrides from gateway settings. Credentials never become Vite environment variables. */
export function configureModelRoles(settings: Record<string, string>, keys: Record<string, string>, profiles: Record<string, GatewayProfile>): ModelRoles | undefined {
  if (settings.AIRI_MODEL_ROLES_ENABLED !== 'true')
    return undefined
  const account = settings.CLOUDFLARE_ACCOUNT_ID || keys.CLOUDFLARE_ACCOUNT_ID
  if (!account || !/^[a-f0-9]{32}$/i.test(account))
    throw new Error('Model roles require a valid Cloudflare account ID.')
  // An override replaces the complete pair. Tokens from another key file cannot authenticate the overridden account.
  const secondaryKeys = settings.CLOUDFLARE_ACCOUNT_ID_2 || settings.CLOUDFLARE_AI_API_TOKEN_2 ? settings : keys
  const secondaryAccount = secondaryKeys.CLOUDFLARE_ACCOUNT_ID_2
  const secondaryToken = secondaryKeys.CLOUDFLARE_AI_API_TOKEN_2
  if ((secondaryAccount || secondaryToken) && (!secondaryAccount || !/^[a-f0-9]{32}$/i.test(secondaryAccount) || !secondaryToken?.trim()))
    throw new Error('Cloudflare fallback requires a valid second account ID and its API token.')
  const providers: Record<string, GatewayProfile> = {
    ...profiles,
    cloudflare: {
      baseUrl: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/`,
      model: '',
      apiKey: settings.CLOUDFLARE_AI_API_TOKEN || keys.CLOUDFLARE_AI_API_TOKEN || '',
      fallbackAccount: secondaryAccount && secondaryToken
        ? { baseUrl: `https://api.cloudflare.com/client/v4/accounts/${secondaryAccount}/ai/v1/`, apiKey: secondaryToken }
        : undefined,
      private: false,
    },
    groq: { baseUrl: 'https://api.groq.com/openai/v1/', model: '', apiKey: settings.GROQ_API_KEY || keys.GROQ_API_KEY || '', private: false },
  }
  function role(name: string, provider: string, model: string, tokens: number, timeout: number): GatewayProfile {
    const selected = providers[settings[`AIRI_${name}_PROVIDER`] || provider]
    if (!selected)
      throw new Error(`Unknown provider for ${name}.`)
    const selectedModel = settings[`AIRI_${name}_MODEL`] || model
    const thinkingSetting = settings[`AIRI_${name}_THINKING`]
    let thinking: boolean | undefined
    if (thinkingSetting) {
      if (thinkingSetting !== 'true' && thinkingSetting !== 'false')
        throw new Error('Model thinking settings require true or false.')
      thinking = thinkingSetting === 'true'
    }
    else if (selectedModel === '@cf/zai-org/glm-4.7-flash') {
      thinking = false
    }
    return {
      ...selected,
      model: selectedModel,
      maxTokens: positiveInteger(settings[`AIRI_${name}_MAX_TOKENS`], tokens),
      timeoutMs: positiveInteger(settings[`AIRI_${name}_TIMEOUT_MS`], timeout),
      ambientMaxTokens: positiveInteger(settings[`AIRI_${name}_AMBIENT_MAX_TOKENS`], name === 'BRAIN' ? 1024 : tokens),
      contextMessages: positiveInteger(settings.AIRI_CONTEXT_MESSAGES, 12),
      reasoningEffort: settings[`AIRI_${name}_REASONING_EFFORT`],
      thinking,
    }
  }
  return {
    brain: role('BRAIN', 'cloudflare', settings.CLOUDFLARE_AI_MODEL || keys.CLOUDFLARE_AI_MODEL || '@cf/zai-org/glm-4.7-flash', 2048, 12_000),
    vision: role('VISION', 'cloudflare', '@cf/qwen/qwen3.8-27b', 1024, 8000),
    reasoning: role('REASONING', 'groq', 'qwen/qwen3.8-27b', 4096, 30_000),
    heavy: settings.AIRI_HEAVY_REASONING_ENABLED === 'true' ? role('HEAVY_REASONING', 'groq', 'openai/gpt-oss-120b', 8192, 45_000) : undefined,
    fallback: role('LOCAL_FALLBACK', 'local', profiles.local?.model ?? '', 2048, 15_000),
  }
}
