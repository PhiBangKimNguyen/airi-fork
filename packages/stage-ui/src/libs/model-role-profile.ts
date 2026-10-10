/** A gateway profile pins the destination and credentials outside renderer state. */
export interface GatewayProfile {
  baseUrl: string
  model: string
  apiKey: string
  fallbackApiKeys?: readonly string[]
  /** Cloudflare quota failures use this paired account endpoint and token before another model role. */
  fallbackAccount?: { baseUrl: string, apiKey: string }
  private: boolean
  reasoningEffort?: string
  mediaModel?: string
  mediaReasoningEffort?: string
  /** Maximum completion budget, including provider reasoning tokens. @default 2048 */
  maxTokens?: number
  /** One upstream attempt expires after this interval. @default 15000 */
  timeoutMs?: number
  /** Ambient requests cap completion tokens independently. @default 1024 */
  ambientMaxTokens?: number
  /** Brain requests retain this many recent messages plus the opening instruction. @default 12 */
  contextMessages?: number
  /** Workers AI template control for fast ambient inference. Omitted values retain provider behavior. */
  thinking?: boolean
}

/** Validates a pinned upstream before credentials or private context reach the network. */
export function completionDestination(profile: GatewayProfile) {
  const url = new URL(profile.baseUrl.endsWith('/') ? profile.baseUrl : `${profile.baseUrl}/`)
  if (url.username || url.password || url.search || url.hash)
    throw new Error('Upstream URLs cannot contain credentials, queries, or fragments.')
  if (profile.private) {
    if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Private inference requires an HTTP endpoint on a literal loopback address.')
  }
  else {
    const hosts = ['integrate.api.nvidia.com', 'generativelanguage.googleapis.com', 'openrouter.ai', 'api.cloudflare.com', 'api.groq.com']
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname))
      throw new Error('Cloud inference requires an approved HTTPS provider host.')
    if (url.hostname === 'api.cloudflare.com' && !/^\/client\/v4\/accounts\/[a-f0-9]{32}\/ai\/v1\/$/i.test(url.pathname))
      throw new Error('Cloudflare inference requires a valid account endpoint.')
    if (url.hostname === 'api.groq.com' && url.pathname !== '/openai/v1/')
      throw new Error('Groq inference requires its OpenAI endpoint.')
  }
  return new URL('chat/completions', url)
}
