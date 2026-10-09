import type { AddressInfo } from 'node:net'

import type { GatewayProfile } from '@proj-airi/stage-ui/libs/model-role-profile'
import type { ModelRoles } from '@proj-airi/stage-ui/libs/model-roles'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGateway } from './gateway'

const token = 'test-local-token-with-more-than-32-characters'
const servers: ReturnType<typeof createServer>[] = []

async function listen(server: ReturnType<typeof createServer>) {
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
})

describe('hybrid gateway', () => {
  it('routes shared frames through the vision sensor and streams only the brain dialogue', async () => {
    const nativeFetch = globalThis.fetch
    const requests: Array<{ model: string, messages: unknown }> = []
    const profile: GatewayProfile = { private: false, baseUrl: `https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/ai/v1/`, model: 'test-brain', apiKey: 'synthetic-secret' }
    const roles: ModelRoles = { brain: profile, vision: { ...profile, model: 'test-vision' } }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://api.cloudflare.com/')) {
        const body = JSON.parse(String(options?.body))
        requests.push(body)
        const rendering = body.response_format?.json_schema?.name === 'english_rendering'
        let decision: unknown = { action: 'speak', text: '猫だね。\n\n(A cat.)', translation: 'A cat.' }
        if (body.model === 'test-vision')
          decision = { summary: 'Synthetic cat.', interesting: true }
        else if (rendering)
          decision = { translation: 'It\'s a cat.' }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }))
      }
      return nativeFetch(input, options)
    })
    const gateway = await listen(createGateway({ brain: profile }, token, undefined, 'ja-en', true, false, roles))
    const response = await fetch(`${gateway}/media/brain/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ stream: true, messages: [
        { role: 'system', content: 'Custom character.' },
        { role: 'user', content: [{ type: 'text', text: 'An authorized event.' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YWJj' } }] },
      ] }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const stream = await response.text()
    expect(stream).toContain('猫だね。')
    expect(stream).toContain('It\'s a cat.')
    expect(stream).not.toContain('A cat.')
    expect(stream).toContain('[DONE]')
    expect(stream).not.toContain('Synthetic cat.')
    expect(stream).not.toContain('synthetic-secret')
    expect(requests.map(request => request.model)).toEqual(['test-vision', 'test-brain', 'test-brain'])
    expect(JSON.stringify(requests[1]?.messages)).not.toContain('data:image')
    expect(JSON.stringify(requests[1]?.messages)).toContain('Custom character.')
    expect(JSON.stringify(requests[2]?.messages)).not.toContain('Custom character.')
    expect(JSON.stringify(requests[2]?.messages)).not.toContain('Synthetic cat.')
  })

  it('returns revised English with the unchanged Japanese through the brain HTTP route', async () => {
    const nativeFetch = globalThis.fetch
    const requests: Array<{ messages: Array<{ role: string, content: string }> }> = []
    const japanese = 'ねえ、もし私が消えたら、あなたはその残像をどうやって消すつもり？'
    const english = 'If I vanished, how would you ever erase the trace I left behind?'
    const profile: GatewayProfile = { private: false, baseUrl: `https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/ai/v1/`, model: 'test-brain', apiKey: 'synthetic-secret' }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://api.cloudflare.com/')) {
        const body = JSON.parse(String(options?.body))
        requests.push(body)
        const content = requests.length === 1
          ? { action: 'speak', text: `${japanese}\n\n(Hey, if I disappeared, how would you go about getting rid of that afterimage?)`, translation: 'Hey, if I disappeared, how would you go about getting rid of that afterimage?' }
          : { translation: `(${english})` }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }))
      }
      return nativeFetch(input, options)
    })
    const gateway = await listen(createGateway({ brain: profile }, token, undefined, 'ja-en', true, false, { brain: profile }))
    const response = await fetch(`${gateway}/brain/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Synthetic idle question.' }] }),
    })
    expect(response.status).toBe(200)
    const completion = await response.json()
    expect(completion.choices[0].message.content).toBe(`${japanese}\n\n(${english})`)
    expect(requests).toHaveLength(2)
    expect(requests[1]?.messages[1]?.content).toBe(JSON.stringify({ japanese }))
    expect(JSON.stringify(requests[1]?.messages)).not.toContain('Synthetic idle question.')
    expect(requests[0]?.messages[0]?.content).not.toContain(japanese)
  })

  it('does not send disabled vision or cloud tools to the brain', async () => {
    const profile: GatewayProfile = { private: false, baseUrl: `https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/ai/v1/`, model: 'test-brain', apiKey: 'synthetic' }
    const gateway = await listen(createGateway({ brain: profile }, token, undefined, undefined, false, false, { brain: profile }))
    const send = (route: string, body: unknown) => fetch(`${gateway}/${route}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
    expect((await send('media/brain/v1/chat/completions', { messages: [] })).status).toBe(403)
    expect((await send('brain/v1/chat/completions', { messages: [{ role: 'user', content: 'Synthetic' }], tools: [] })).status).toBe(400)
  })

  it.each([200, 503])('retries Gemini HTTP 503 once with the same request and returns HTTP %s', async (status) => {
    vi.useFakeTimers()
    const nativeFetch = globalThis.fetch
    const received = vi.fn<(options?: RequestInit) => void>()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        received(options)
        return received.mock.calls.length === 1
          ? new Response('High demand', { status: 503 })
          : new Response(JSON.stringify({ choices: [{ message: { content: 'Synthetic reply' } }] }), { status: received.mock.calls.length === 2 ? status : 200 })
      }
      return nativeFetch(input, options)
    })
    try {
      const gateway = await listen(createGateway({ gemini: { private: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'test-model', apiKey: 'first', fallbackApiKeys: ['second'] } }, token))
      const send = () => fetch(`${gateway}/gemini/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Synthetic prompt' }] }) })
      const pending = send()
      await vi.waitFor(() => expect(received).toHaveBeenCalledOnce())
      await vi.advanceTimersByTimeAsync(1000)
      expect(received).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(500)
      const response = await pending
      expect(response.status).toBe(status)
      expect(received).toHaveBeenCalledTimes(2)
      expect(received.mock.calls[1][0]).toEqual(received.mock.calls[0][0])
      expect(new Headers(received.mock.calls[1][0]?.headers).get('authorization')).toBe('Bearer first')
      expect((await send()).status).toBe(200)
      expect(received).toHaveBeenCalledTimes(3)
      expect(new Headers(received.mock.calls[2][0]?.headers).get('authorization')).toBe('Bearer first')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('cancels the Gemini HTTP 503 delay when the client aborts', async () => {
    vi.useFakeTimers()
    const nativeFetch = globalThis.fetch
    const received = vi.fn()
    let upstreamSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        upstreamSignal = options?.signal ?? undefined
        received()
        return new Response('High demand', { status: 503 })
      }
      return nativeFetch(input, options)
    })
    try {
      const gateway = await listen(createGateway({ gemini: { private: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'test-model', apiKey: 'first' } }, token))
      const controller = new AbortController()
      const pending = fetch(`${gateway}/gemini/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Synthetic prompt' }] }), signal: controller.signal }).then(response => response.status, () => 'aborted')
      await vi.waitFor(() => expect(received).toHaveBeenCalledOnce())
      await vi.advanceTimersByTimeAsync(500)
      controller.abort()
      expect(await pending).toBe('aborted')
      await vi.waitFor(() => expect(upstreamSignal?.aborted).toBe(true))
      await vi.advanceTimersByTimeAsync(1500)
      expect(received).toHaveBeenCalledOnce()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('reuses a successful Gemini fallback for chat, media, and audio after a quota failure', async () => {
    const nativeFetch = globalThis.fetch
    const received: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        const credential = new Headers(options?.headers).get('authorization') ?? ''
        received.push(credential)
        return credential === 'Bearer first'
          ? new Response('quota', { status: 429 })
          : new Response(JSON.stringify({ choices: [{ message: { content: 'MUSIC: synthetic tones' } }] }))
      }
      return nativeFetch(input, options)
    })
    const profile: GatewayProfile = { private: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'current-model', apiKey: 'first', fallbackApiKeys: ['second', 'third'] }
    const gateway = await listen(createGateway({ gemini: profile }, token, undefined, undefined, true, true))
    const send = (path: string, body: unknown) => fetch(`${gateway}/${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
    const messages = [{ role: 'system', content: 'Companion' }, { role: 'user', content: 'Synthetic media' }]
    expect((await send('gemini/v1/chat/completions', { messages })).status).toBe(200)
    expect((await send('media/gemini/v1/chat/completions', { messages })).status).toBe(200)
    const wav = Buffer.alloc(44 + 32000)
    wav.write('RIFF', 0)
    wav.write('WAVE', 8)
    wav.writeUInt16LE(1, 20)
    wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(16000, 24)
    wav.writeUInt16LE(16, 34)
    expect((await send('audio/gemini/observe', { audio: wav.toString('base64') })).status).toBe(200)
    expect(received).toEqual(['Bearer first', 'Bearer second', 'Bearer second', 'Bearer second'])
  })
  it('tries each distinct Gemini key once and cools down exhausted credentials', async () => {
    const nativeFetch = globalThis.fetch
    const received: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        received.push(new Headers(options?.headers).get('authorization') ?? '')
        return new Response('UPSTREAM_SECRET_ERROR', { status: 429, headers: { 'retry-after': '120' } })
      }
      return nativeFetch(input, options)
    })
    const gateway = await listen(createGateway({ gemini: { private: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'current-model', apiKey: 'first', fallbackApiKeys: ['first', '', 'second', 'third'] } }, token))
    const send = () => fetch(`${gateway}/gemini/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Synthetic prompt' }] }) })
    const result = await send()
    expect(result.status).toBe(429)
    expect(await result.text()).not.toContain('UPSTREAM_SECRET_ERROR')
    expect((await send()).status).toBe(503)
    expect(received).toEqual(['Bearer first', 'Bearer second', 'Bearer third'])
  })
  it.each([400, 404, 500])('does not change Gemini credentials for HTTP %s', async (status) => {
    const nativeFetch = globalThis.fetch
    const received = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        received(new Headers(options?.headers).get('authorization'))
        return new Response('Unavailable', { status })
      }
      return nativeFetch(input, options)
    })
    const gateway = await listen(createGateway({ gemini: { private: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'current-model', apiKey: 'first', fallbackApiKeys: ['second'] } }, token))
    const result = await fetch(`${gateway}/gemini/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Synthetic prompt' }] }) })
    expect(result.status).toBe(status)
    expect(received).toHaveBeenCalledOnce()
    expect(received).toHaveBeenCalledWith('Bearer first')
  })
  it.each([401, 403])('uses Gemini fallback credentials after HTTP %s', async (status) => {
    const nativeFetch = globalThis.fetch
    const received: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        const credential = new Headers(options?.headers).get('authorization') ?? ''
        received.push(credential)
        return credential === 'Bearer first' ? new Response('Rejected', { status }) : new Response(JSON.stringify({ choices: [{ message: { content: 'Synthetic reply' } }] }))
      }
      return nativeFetch(input, options)
    })
    const gateway = await listen(createGateway({ gemini: { private: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'current-model', apiKey: 'first', fallbackApiKeys: ['second'] } }, token))
    const result = await fetch(`${gateway}/gemini/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Synthetic prompt' }] }) })
    expect(result.status).toBe(200)
    expect(received).toEqual(['Bearer first', 'Bearer second'])
  })
  it('uses Gemini fallback credentials after an invalid key HTTP 400', async () => {
    const nativeFetch = globalThis.fetch
    const received: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        const credential = new Headers(options?.headers).get('authorization') ?? ''
        received.push(credential)
        // Gemini returned this body for an invalid key on 2026-10-08.
        return credential === 'Bearer first'
          ? new Response('[{"error":{"code":400,"message":"Please pass a valid API key","status":"INVALID_ARGUMENT"}}]', { status: 400 })
          : new Response(JSON.stringify({ choices: [{ message: { content: 'Synthetic reply' } }] }))
      }
      return nativeFetch(input, options)
    })
    const gateway = await listen(createGateway({ gemini: { private: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'current-model', apiKey: 'first', fallbackApiKeys: ['second'] } }, token))
    const send = () => fetch(`${gateway}/gemini/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Synthetic prompt' }] }) })
    expect((await send()).status).toBe(200)
    expect((await send()).status).toBe(200)
    expect(received).toEqual(['Bearer first', 'Bearer second', 'Bearer second'])
  })
  it('returns an unrelated Gemini HTTP 400 without another key', async () => {
    const nativeFetch = globalThis.fetch
    const received: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        received.push(new Headers(options?.headers).get('authorization') ?? '')
        return new Response('[{"error":{"code":400,"message":"Invalid JSON payload received.","status":"INVALID_ARGUMENT"}}]', { status: 400 })
      }
      return nativeFetch(input, options)
    })
    const gateway = await listen(createGateway({ gemini: { private: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'current-model', apiKey: 'first', fallbackApiKeys: ['second'] } }, token))
    const result = await fetch(`${gateway}/gemini/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Synthetic prompt' }] }) })
    expect(result.status).toBe(400)
    expect(received).toEqual(['Bearer first'])
  })
  it('requests sentence prosody tags for bilingual media reactions only', async () => {
    const nativeFetch = globalThis.fetch
    const received = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        received(JSON.parse(String(options?.body)))
        return new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }))
      }
      return nativeFetch(input, options)
    })
    const gateway = await listen(createGateway({ gemini: {
      private: false,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      model: 'test-model',
      apiKey: 'test-key',
    } }, token, undefined, 'ja-en', true))
    const messages = [{ role: 'system', content: 'Companion' }, { role: 'user', content: 'Synthetic public observation' }]
    const send = (route: string) => fetch(`${gateway}/${route}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages }),
    })
    expect((await send('media/gemini')).status).toBe(200)
    expect(received.mock.calls[0][0].messages[0].content).toContain('[prosody tone=KIND focus=WORD]')
    expect(received.mock.calls[0][0].messages[0].content).toContain('one or two short spoken sentences')
    expect(received.mock.calls[0][0].max_tokens).toBe(384)
    expect((await send('gemini')).status).toBe(200)
    expect(received.mock.calls[1][0].messages[0].content).not.toContain('[prosody')
    expect(received.mock.calls[1][0].messages[0].content).not.toContain('one or two short spoken sentences')
    expect(received.mock.calls[1][0].max_tokens).toBe(4096)
  })

  it('pins independent media model and effort settings without changing chat or audio settings', async () => {
    const nativeFetch = globalThis.fetch
    const received = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        received(JSON.parse(String(options?.body)))
        return new Response(JSON.stringify({ choices: [{ message: { content: 'A reaction.' } }] }))
      }
      return nativeFetch(input, options)
    })
    const gateway = await listen(createGateway({ gemini: {
      private: false,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      model: 'current-model',
      apiKey: 'test-key',
      reasoningEffort: 'medium',
      mediaModel: 'configured-media-model',
      mediaReasoningEffort: 'low',
    } }, token, undefined, undefined, true))
    const send = (path: string, messages: unknown) => fetch(`${gateway}/${path}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ messages, model: 'caller-override', reasoning_effort: 'high' }) })
    expect((await send('media/gemini', [{ role: 'system', content: 'Companion' }, { role: 'user', content: 'Synthetic observation' }])).status).toBe(200)
    expect(received.mock.calls[0][0].model).toBe('configured-media-model')
    expect(received.mock.calls[0][0].reasoning_effort).toBe('low')
    expect(received.mock.calls[0][0].temperature).toBe(1.05)
    expect((await send('gemini', [{ role: 'user', content: 'Ordinary conversation' }])).status).toBe(200)
    expect(received.mock.calls[1][0].model).toBe('current-model')
    expect(received.mock.calls[1][0].reasoning_effort).toBe('medium')
    expect(received.mock.calls[1][0].temperature).toBeUndefined()
  })
  it('terminates a media stream stalled after headers by the gateway deadline', async () => {
    vi.useFakeTimers()
    const nativeFetch = globalThis.fetch
    let upstreamSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        upstreamSignal = options?.signal ?? undefined
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"test"}}]}\n\n'))
            upstreamSignal?.addEventListener('abort', () => controller.error(new Error('Upstream aborted')), { once: true })
          },
        }), { headers: { 'content-type': 'text/event-stream' } })
      }
      return nativeFetch(input, options)
    })
    try {
      const gateway = await listen(createGateway({ gemini: { private: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'test-model', apiKey: 'test-key' } }, token, undefined, undefined, true))
      const response = await fetch(`${gateway}/media/gemini/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ stream: true, messages: [{ role: 'system', content: 'Companion' }, { role: 'user', content: 'Synthetic media' }] }) })
      const reader = response.body?.getReader()
      expect((await reader?.read())?.done).toBe(false)
      const ended = reader?.read().then(() => false, () => true)
      await vi.advanceTimersByTimeAsync(30_000)
      expect(upstreamSignal?.aborted).toBe(true)
      expect(await ended).toBe(true)
    }
    finally {
      vi.useRealTimers()
    }
  })
  it.each(['string', 'array'])('accepts a %s static-music audio summary without images while still rejecting history and tools', async (representation) => {
    const nativeFetch = globalThis.fetch
    const received = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        received(JSON.parse(String(options?.body)))
        return new Response(JSON.stringify({ choices: [{ message: { content: 'A music reaction.' } }] }))
      }
      return nativeFetch(input, options)
    })
    const gateway = await listen(createGateway({ gemini: { private: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-3.5-flash-lite', apiKey: 'unused-test-key' } }, token, undefined, 'ja-en', true))
    const messages = [{ role: 'system', content: 'Companion personality' }, {
      role: 'user',
      content: representation === 'string' ? 'STATIC MUSIC. MUSIC: A bass line enters.' : [{ type: 'text', text: 'STATIC MUSIC. MUSIC: A bass line enters.' }],
    }]
    const send = (body: unknown) => fetch(`${gateway}/media/gemini/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
    expect((await send({ messages })).status).toBe(200)
    expect(received.mock.calls[0][0].messages[1].content).toEqual(messages[1].content)
    expect((await send({ messages: [...messages, { role: 'assistant', content: 'PRIVATE_SESSION_HISTORY' }] })).status).toBe(400)
    expect((await send({ messages, tools: [] })).status).toBe(400)
    expect(received).toHaveBeenCalledTimes(1)
  })
  it.each(['gemini', 'inkling'])('pins %s audio perception and rejects private-disabled or malformed audio', async (lane) => {
    const nativeFetch = globalThis.fetch
    const received = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://openrouter.ai/') || String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        received(JSON.parse(String(options?.body)))
        return new Response(JSON.stringify({ choices: [{ message: { content: 'Synthetic tones change rhythm.' } }] }))
      }
      return nativeFetch(input, options)
    })
    const model = lane === 'inkling' ? 'thinkingmachines/inkling:free' : 'gemini-3.5-flash-lite'
    const profile = { [lane]: { private: false, baseUrl: lane === 'inkling' ? 'https://openrouter.ai/api/v1/' : 'https://generativelanguage.googleapis.com/v1beta/openai/', model, apiKey: 'unused-test-key', reasoningEffort: lane === 'gemini' ? 'medium' : undefined } }
    const wav = Buffer.alloc(44 + 32000)
    wav.write('RIFF', 0)
    wav.write('WAVE', 8)
    wav.writeUInt16LE(1, 20)
    wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(16000, 24)
    wav.writeUInt16LE(16, 34)
    const body = { audio: wav.toString('base64'), previous: ['A steady tone.'], researchMedia: true, model: 'paid-override', messages: [{ role: 'user', content: 'PRIVATE_HISTORY' }] }
    const send = (gateway: string, value: unknown) => fetch(`${gateway}/audio/${lane}/observe`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(value) })
    const gateway = await listen(createGateway(profile, token, undefined, undefined, true, true))
    const response = await send(gateway, body)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ observation: 'Synthetic tones change rhythm.', auditory: { kind: 'unknown', summary: 'Synthetic tones change rhythm.', lyricEvidence: { source: 'audio-model', confidence: 'unavailable' } } })
    expect(received.mock.calls[0][0].model).toBe(model)
    expect(JSON.stringify(received.mock.calls[0][0])).not.toContain('PRIVATE_HISTORY')
    expect(received.mock.calls[0][0].messages[1].content[1].type).toBe('input_audio')
    if (lane === 'gemini') {
      expect(received.mock.calls[0][0].reasoning_effort).toBe('medium')
      expect(received.mock.calls[0][0].max_tokens).toBe(4096)
    }
    expect((await send(gateway, { audio: 'YWJj', researchMedia: true })).status).toBe(400)
    const privateGateway = await listen(createGateway(profile, token, undefined, undefined, false, true))
    expect((await send(privateGateway, body)).status).toBe(403)
    if (lane === 'inkling') {
      expect(received.mock.calls[0][0].provider.max_price).toEqual({ prompt: 0, completion: 0 })
      expect((await send(gateway, { ...body, researchMedia: false })).status).toBe(403)
    }
    expect(received).toHaveBeenCalledTimes(1)
  })
  it.each(['gemini', 'media/gemini'])('pins configured medium Gemini effort on %s requests', async (route) => {
    const nativeFetch = globalThis.fetch
    const received = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://generativelanguage.googleapis.com/')) {
        received(JSON.parse(String(options?.body)))
        return new Response(JSON.stringify({ choices: [{ message: { content: 'Public answer' } }] }))
      }
      return nativeFetch(input, options)
    })
    const gateway = await listen(createGateway({ gemini: { private: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-3.5-flash-lite', apiKey: 'unused-test-key', reasoningEffort: 'medium' } }, token, undefined, undefined, true))
    const messages = route.startsWith('media/')
      ? [{ role: 'system', content: 'Public companion' }, { role: 'user', content: [{ type: 'text', text: 'Synthetic video' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YWJj' } }] }]
      : [{ role: 'user', content: 'Public question' }]
    const response = await fetch(`${gateway}/${route}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ messages, reasoning_effort: 'high' }) })
    expect(response.status).toBe(200)
    expect(received.mock.calls[0][0].reasoning_effort).toBe('medium')
    expect(received).toHaveBeenCalledTimes(1)
  })
  it.each([
    ['gemma31', 'google/gemma-4-31b-it:free'],
    ['gemma26', 'google/gemma-4-26b-a4b-it:free'],
    ['inkling', 'thinkingmachines/inkling:free'],
  ])('pins %s to the requested free OpenRouter model and zero-cost providers', async (lane, model) => {
    const nativeFetch = globalThis.fetch
    const received = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://openrouter.ai/api/v1/')) {
        received(JSON.parse(String(options?.body)))
        return new Response(JSON.stringify({ choices: [{ message: { content: 'Public answer' } }] }))
      }
      return nativeFetch(input, options)
    })
    const gateway = await listen(createGateway({ [lane]: { private: false, baseUrl: 'https://openrouter.ai/api/v1/', model, apiKey: 'unused-test-key' } }, token))
    const response = await fetch(`${gateway}/${lane}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ model: 'paid-model-override', provider: { max_price: { prompt: 100 } }, messages: [{ role: 'user', content: 'A public question' }] }) })
    expect(response.status).toBe(200)
    expect(received.mock.calls[0][0].model).toBe(model)
    expect(received.mock.calls[0][0].provider.max_price).toEqual({ prompt: 0, completion: 0 })
    expect(received.mock.calls[0][0].reasoning.enabled).toBe(false)
  })
  it('allows only a fresh inline image observation in the explicitly enabled media endpoint', async () => {
    const nativeFetch = globalThis.fetch
    const received = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (String(input).startsWith('https://integrate.api.nvidia.com')) {
        received(JSON.parse(String(options?.body)))
        return new Response(JSON.stringify({ choices: [{ message: { content: 'Image answer' } }] }))
      }
      return nativeFetch(input, options)
    })
    const profiles = { kimi: { private: false, baseUrl: 'https://integrate.api.nvidia.com/v1/', model: 'moonshotai/kimi-k3', apiKey: 'unused-test-key' } }
    const gateway = await listen(createGateway(profiles, token, undefined, 'ja-en', true))
    const body = { messages: [
      { role: 'system', content: 'Public companion personality' },
      { role: 'user', content: [{ type: 'text', text: 'Shared video' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YWJj', detail: 'low' } }] },
    ] }
    const send = (url: string, value: unknown) => fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(value) })
    expect((await send(`${gateway}/media/kimi/v1/chat/completions`, body)).status).toBe(200)
    expect(received.mock.calls[0][0].model).toBe('moonshotai/kimi-k3')
    // A trailing language-only system message could replace the personality at compatible provider boundaries.
    expect(received.mock.calls[0][0].messages).toHaveLength(2)
    expect(received.mock.calls[0][0].messages[0].content).toContain('Public companion personality')
    expect(received.mock.calls[0][0].messages[0].content).toContain('English translation')
    expect((await send(`${gateway}/kimi/v1/chat/completions`, body)).status).toBe(400)
    expect((await send(`${gateway}/media/kimi/v1/chat/completions`, { ...body, messages: [...body.messages, { role: 'assistant', content: 'PRIVATE_HISTORY' }] })).status).toBe(400)
    expect((await send(`${gateway}/media/kimi/v1/chat/completions`, { ...body, tools: [] })).status).toBe(400)
    expect((await send(`${gateway}/media/kimi/v1/chat/completions`, { messages: [body.messages[0], { role: 'user', content: [{ type: 'text', text: 'Video' }, { type: 'image_url', image_url: { url: 'https://private.example/image' } }] }] })).status).toBe(400)
    const disabled = await listen(createGateway(profiles, token))
    expect((await send(`${disabled}/media/kimi/v1/chat/completions`, body)).status).toBe(403)
    expect(received).toHaveBeenCalledTimes(1)
  })
  it('keeps speech local and ignores client destination and model overrides', async () => {
    const synthesize = vi.fn(async () => Buffer.from('RIFF-local-WAVE'))
    const gateway = await listen(createGateway({}, token, { synthesize }))
    const result = await fetch(`${gateway}/speech/v1/audio/speech`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ input: 'PRIVATE_SPEECH_CANARY', voice: 'af_heart', model: 'cloud-tts', baseUrl: 'https://example.com' }),
    })
    expect(result.status).toBe(200)
    expect(result.headers.get('content-type')).toBe('audio/wav')
    expect(synthesize).toHaveBeenCalledWith('PRIVATE_SPEECH_CANARY', 1, expect.any(AbortSignal), 'af_heart')
    const invalid = await fetch(`${gateway}/speech/v1/audio/speech`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ input: 'x'.repeat(8001) }) })
    expect(invalid.status).toBe(400)
    expect(synthesize).toHaveBeenCalledTimes(1)
    const invalidVoice = await fetch(`${gateway}/speech/v1/audio/speech`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ input: 'hello', voice: 'https://example.com' }) })
    expect(invalidVoice.status).toBe(400)
  })

  it('fails local speech without invoking a hosted fallback', async () => {
    const gateway = await listen(createGateway({}, token, {
      synthesize: async () => {
        throw new Error('Local model missing')
      },
    }))
    const result = await fetch(`${gateway}/speech/v1/audio/speech`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ input: 'private speech' }) })
    expect(result.status).toBe(502)
    expect(await result.text()).toContain('No fallback was attempted')
  })

  it('pins private inference to loopback and preserves the existing server', async () => {
    const received = vi.fn()
    const upstream = await listen(createServer(async (request, response) => {
      const chunks = []
      for await (const chunk of request)
        chunks.push(chunk)
      received(JSON.parse(Buffer.concat(chunks).toString()))
      response.end(JSON.stringify({ choices: [{ message: { content: 'local answer' } }] }))
    }))
    const gateway = await listen(createGateway({ local: { private: true, baseUrl: `${upstream}/v1/`, model: 'existing-qwen', apiKey: '' } }, token, undefined, 'ja-en'))
    const result = await fetch(`${gateway}/local/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ model: 'airi-local', messages: [{ role: 'user', content: 'PRIVATE_CANARY_123' }] }),
    })
    expect(result.status).toBe(200)
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ model: 'existing-qwen' }))
    expect(received.mock.calls[0][0].messages.find((message: { role: string }) => message.role === 'user').content).toBe('PRIVATE_CANARY_123')
    expect(received.mock.calls[0][0].messages[0].role).toBe('system')
    expect(received.mock.calls[0][0].messages.filter((message: { role: string }) => message.role === 'system')).toHaveLength(1)
    expect(received.mock.calls[0][0].messages[0].content).toContain('Japanese')
    expect(received.mock.calls[0][0].messages[0].content).toContain('English translation enclosed in ASCII parentheses')
    expect(received.mock.calls[0][0].messages[0].content).not.toContain('one or two short spoken sentences')
    expect(received.mock.calls[0][0].messages[0].content).toContain('Translate intent, attitude, and rhythm, not words.')
    expect(received.mock.calls[0][0].messages[0].content).toContain('existential lines retain restrained poetry')
    const watching = await fetch(`${gateway}/local/v1/chat/completions`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${token}`, 'X-AIRI-Watching': 'true' },
      body: JSON.stringify({ max_tokens: 9999, messages: [{ role: 'user', content: 'Private playlist hint' }] }),
    })
    expect(watching.status).toBe(200)
    expect(received.mock.calls[1][0].messages[0].content).toContain('one or two short spoken sentences')
    expect(received.mock.calls[1][0].max_tokens).toBe(384)
    const preflight = await fetch(`${gateway}/local/v1/chat/completions`, { method: 'OPTIONS' })
    expect(preflight.headers.get('access-control-allow-headers')).toContain('x-airi-watching')
  })

  it('blocks tools, images, and tool history before a cloud request', async () => {
    const gateway = await listen(createGateway({ kimi: { private: false, baseUrl: 'https://integrate.api.nvidia.com/v1/', model: 'moonshotai/kimi-k3', apiKey: 'unused-test-key' } }, token))
    for (const body of [
      { messages: [{ role: 'user', content: 'hello' }], tools: [] },
      { messages: [{ role: 'tool', content: 'private tool output' }] },
      { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'private-image' } }] }] },
    ]) {
      const result = await fetch(`${gateway}/kimi/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
      expect(result.status).toBe(400)
    }
  })

  it('requires the local token and rejects external browser origins', async () => {
    const gateway = await listen(createGateway({ local: { private: true, baseUrl: 'http://127.0.0.1:1/v1/', model: 'qwen', apiKey: '' } }, token))
    expect((await fetch(`${gateway}/local/v1/models`)).status).toBe(401)
    expect((await fetch(`${gateway}/local/v1/models`, { headers: { origin: 'https://example.com', authorization: `Bearer ${token}` } })).status).toBe(403)
  })

  it('fails locally without a cloud fallback', async () => {
    const gateway = await listen(createGateway({ local: { private: true, baseUrl: 'http://127.0.0.1:1/v1/', model: 'qwen', apiKey: '' } }, token))
    const result = await fetch(`${gateway}/local/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ messages: [{ role: 'user', content: 'private text' }] }) })
    expect(result.status).toBe(502)
    expect(await result.text()).toContain('No fallback was attempted')
  })

  it('rejects private endpoints outside loopback', () => {
    expect(() => createGateway({ local: { private: true, baseUrl: 'https://example.com/v1/', model: 'qwen', apiKey: '' } }, token)).toThrow('loopback')
  })
})
