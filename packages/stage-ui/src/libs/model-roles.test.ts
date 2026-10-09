import type { Message } from '@xsai/shared-chat'

import type { GatewayProfile } from './model-role-profile'
import type { ModelRoles } from './model-roles'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ModelRoleRouter } from './model-roles'
import { normalizeAuditoryObservation, SensoryEventGate } from './sensory-context'

const brain: GatewayProfile = { private: false, baseUrl: `https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/ai/v1/`, model: '@cf/zai-org/glm-4.7-flash', apiKey: 'synthetic' }
const roles: ModelRoles = {
  brain,
  vision: { ...brain, model: '@cf/qwen/qwen3.8-27b' },
  reasoning: { private: false, baseUrl: 'https://api.groq.com/openai/v1/', model: 'qwen/qwen3.8-27b', apiKey: 'synthetic', reasoningEffort: 'medium' },
  heavy: { private: false, baseUrl: 'https://api.groq.com/openai/v1/', model: 'openai/gpt-oss-120b', apiKey: 'synthetic' },
  fallback: { private: true, baseUrl: 'http://127.0.0.1:11434/v1/', model: 'configured-local-qwen', apiKey: '' },
}
const context: Message[] = [{ role: 'system', content: 'Configured character.' }, { role: 'user', content: 'Synthetic event.' }]
const signal = () => new AbortController().signal
const reply = (decision: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }))
const speak = { action: 'speak', text: 'Character reply.' }

afterEach(() => vi.restoreAllMocks())

describe('model roles', () => {
  it('replaces an embedded draft caption instead of appending a second translation', async () => {
    const japanese = 'あー、やっぱり、この曲は雰囲気作りがすごいね。'
    const draft = 'Ah, this song really excels at setting the mood.'
    const revised = 'Ah, this song really knows how to set the mood.'
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ action: 'speak', text: `${japanese}\n\n(${draft})`, translation: draft }))
      .mockResolvedValueOnce(reply({ translation: `(${revised})` }))
    const result = await new ModelRoleRouter(roles, 'ja-en').react(context, false, signal())
    expect(result.text).toBe(`${japanese}\n\n(${revised})`)
    expect(result.translation).toBe(revised)
    const rendering = JSON.parse(String(transport.mock.calls[1]?.[1]?.body))
    expect(rendering.messages[1].content).toBe(JSON.stringify({ japanese }))
  })

  it('removes multiple embedded captions and retains one normalized draft during rendering failure', async () => {
    const japanese = '[prosody tone=plain focus=]この曲、好きだな。'
    const english = 'I like this song (especially the piano).'
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ action: 'speak', text: `${japanese}\n\n(${english})\n\n（I love this song.）`, translation: `((${english}))` }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
    const result = await new ModelRoleRouter(roles, 'ja-en').react(context, false, signal())
    expect(result.text).toBe(`${japanese}\n\n(${english})`)
    expect(result.translation).toBe(english)
  })

  it('preserves Japanese notes, inline technical parentheses and expression markers', async () => {
    const marker = '<|ACT {"emotion":{"name":"happy","intensity":1}}|>'
    const japanese = `${marker}YouTube (Music)で聴いてる。\n（ちょっと照れるね）`
    const english = 'Listening on YouTube (Music).'
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ action: 'speak', text: `${japanese}\n\n(Draft English.)`, translation: 'Draft English.' }))
      .mockResolvedValueOnce(reply({ translation: `（${english}）` }))
    const result = await new ModelRoleRouter(roles, 'ja-en').react(context, false, signal())
    expect(result.text).toBe(`${japanese}\n\n(${english})`)
    const rendering = JSON.parse(String(transport.mock.calls[1]?.[1]?.body))
    expect(rendering.messages[1].content).toBe(JSON.stringify({ japanese }))
  })

  it('revises literal existential English without changing Japanese dialogue', async () => {
    const japanese = 'ねえ、もし私が消えたら、あなたはその残像をどうやって消すつもり？'
    const literal = 'Hey, if I disappeared, how would you go about getting rid of that afterimage?'
    const english = 'If I vanished, how would you ever erase the trace I left behind?'
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ action: 'speak', text: japanese, translation: literal }))
      .mockResolvedValueOnce(reply({ translation: english, text: 'Do not replace the Japanese.' }))
    const result = await new ModelRoleRouter(roles, 'ja-en').react(context, false, signal())
    expect(result.text).toBe(`${japanese}\n\n(${english})`)
    expect(result.translation).toBe(english)
    expect(transport).toHaveBeenCalledTimes(2)
    const generation = JSON.parse(String(transport.mock.calls[0]?.[1]?.body))
    expect(generation.messages[0].content).not.toContain(japanese)
    const rendering = JSON.parse(String(transport.mock.calls[1]?.[1]?.body))
    expect(rendering.model).toBe(roles.reasoning?.model)
    expect(rendering.messages).toHaveLength(2)
    expect(rendering.messages[0].content).toContain('Translate only the supplied Japanese dialogue')
    expect(rendering.messages[1].content).toBe(JSON.stringify({ japanese }))
    expect(JSON.stringify(rendering.messages)).not.toContain('Synthetic event.')
    expect(JSON.stringify(rendering.messages)).not.toContain('Configured character.')
    expect(JSON.stringify(rendering.messages)).not.toContain(literal)
    expect(rendering.response_format.type).toBe('json_object')
    expect(rendering.max_tokens).toBe(512)
    expect(rendering.reasoning_effort).toBe('none')
  })

  it('renders bilingual fields through the existing speech format and preserves expression markers', async () => {
    const marker = '<|ACT {"emotion":{"name":"happy","intensity":1}}|>'
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ action: 'speak', text: `${marker}猫だね。`, translation: 'A cat.' }))
      .mockResolvedValueOnce(reply({ translation: 'A cat.' }))
    const result = await new ModelRoleRouter(roles, 'ja-en').react(context, false, signal())
    expect(result.text).toBe(`${marker}猫だね。\n\n(A cat.)`)
    const body = JSON.parse(String(transport.mock.calls[0]?.[1]?.body))
    expect(body.messages[0].content).toContain('existential lines retain restrained poetry')
    expect(body.messages[0].content).toContain('Final field rule: text is Japanese dialogue')
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it('keeps private fallback dialogue on the local role during English rendering', async () => {
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(reply({ action: 'speak', text: 'ここだけの話だよ。', translation: 'Between us.' }))
      .mockResolvedValueOnce(reply({ translation: 'This stays between us.' }))
    const result = await new ModelRoleRouter(roles, 'ja-en').react(context, false, signal())
    expect(result.text).toBe('ここだけの話だよ。\n\n(This stays between us.)')
    expect(transport).toHaveBeenCalledTimes(4)
    expect(String(transport.mock.calls[3]?.[0])).toBe('http://127.0.0.1:11434/v1/chat/completions')
    const rendering = JSON.parse(String(transport.mock.calls[3]?.[1]?.body))
    expect(rendering.model).toBe(roles.fallback?.model)
    expect(JSON.stringify(rendering.messages)).not.toContain('Synthetic event.')
  })

  it('retains the draft after a rendering outage without selecting another provider', async () => {
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ action: 'speak', text: '猫だね。', translation: 'A cat.' }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
    const result = await new ModelRoleRouter(roles, 'ja-en').react(context, false, signal())
    expect(result.text).toBe('猫だね。\n\n(A cat.)')
    expect(transport).toHaveBeenCalledTimes(2)
    const rendering = JSON.parse(String(transport.mock.calls[1]?.[1]?.body))
    expect(rendering.model).toBe(roles.reasoning?.model)
  })

  it.each(['', '   ', '日本語だけ。'])('rejects an invalid English rendering: %j', async (translation) => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ action: 'speak', text: '猫だね。', translation: 'A cat.' }))
      .mockResolvedValueOnce(reply({ translation }))
    const result = await new ModelRoleRouter(roles, 'ja-en').react(context, false, signal())
    expect(result.text).toBe('猫だね。\n\n(A cat.)')
  })

  it('does not translate silence or Japanese-only replies', async () => {
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ action: 'silent', text: '', translation: '' }))
      .mockResolvedValueOnce(reply({ action: 'speak', text: '猫だね。' }))
    expect((await new ModelRoleRouter(roles, 'ja-en').react(context, true, signal())).text).toBe('')
    expect((await new ModelRoleRouter(roles, 'ja').react(context, false, signal())).text).toBe('猫だね。')
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it('cancels delivery when the English rendering is aborted', async () => {
    const controller = new AbortController()
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ action: 'speak', text: '猫だね。', translation: 'A cat.' }))
      .mockImplementationOnce(async () => {
        controller.abort()
        throw new DOMException('Aborted', 'AbortError')
      })
    await expect(new ModelRoleRouter(roles, 'ja-en').react(context, true, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it('uses only GLM for ordinary dialogue and retains the character prompt', async () => {
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(speak))
    const result = await new ModelRoleRouter(roles).react(context, false, signal())
    expect(result.text).toBe('Character reply.')
    expect(transport).toHaveBeenCalledOnce()
    const body = JSON.parse(String(transport.mock.calls[0]?.[1]?.body))
    expect(body.model).toBe('@cf/zai-org/glm-4.7-flash')
    expect(body.response_format.type).toBe('json_schema')
    expect(body.response_format.json_schema.schema.properties.action.enum).toEqual(['speak', 'silent', 'escalate'])
    expect(body.messages[0].content).toContain('Configured character.')
    expect(body.messages[0].content).toContain('No tools or memory writes are authorized')
  })

  it.each([1, 2])('routes explicit tier %s escalation with original context', async (level) => {
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ action: 'escalate', escalation_level: level, escalation_reason: 'Multi-step analysis.' }))
      .mockResolvedValueOnce(reply(speak))
    const result = await new ModelRoleRouter(roles).react(context, false, signal())
    expect(result.action).toBe('speak')
    expect(transport).toHaveBeenCalledTimes(2)
    const body = JSON.parse(String(transport.mock.calls[1]?.[1]?.body))
    expect(body.model).toBe(level === 1 ? 'qwen/qwen3.8-27b' : 'openai/gpt-oss-120b')
    expect(JSON.stringify(body.messages)).toContain('Synthetic event.')
    expect(JSON.stringify(body.messages)).toContain('Configured character.')
  })

  it('allows Qwen to request the heavy tier without a second brain call', async () => {
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ action: 'escalate', escalation_level: 1, escalation_reason: 'Complex debugging.' }))
      .mockResolvedValueOnce(reply({ action: 'escalate', escalation_level: 2, escalation_reason: 'Insufficient confidence.' }))
      .mockResolvedValueOnce(reply(speak))
    expect((await new ModelRoleRouter(roles).react(context, false, signal())).text).toBe('Character reply.')
    expect(transport.mock.calls.map(call => JSON.parse(String(call[1]?.body)).model)).toEqual([brain.model, roles.reasoning?.model, roles.heavy?.model])
  })

  it('suppresses speech and duplicate ambient calls after a silent decision', async () => {
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ action: 'silent', text: 'Discard this.' }))
    const router = new ModelRoleRouter(roles)
    expect((await router.react(context, true, signal())).text).toBe('')
    expect((await router.react(context, true, signal())).action).toBe('silent')
    expect(transport).toHaveBeenCalledOnce()
  })

  it('perceives frames once and supplies normalized observations to the text brain', async () => {
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ summary: 'A test failed.', visible_event: 'failure', interesting: true }))
      .mockResolvedValueOnce(reply(speak))
      .mockResolvedValueOnce(reply(speak))
    const router = new ModelRoleRouter(roles)
    const frames: Message[] = [{ role: 'user', content: [{ type: 'text', text: 'Meaningful screen event.' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YWJj' } }] }]
    await router.react(frames, false, signal())
    await router.react(frames, false, signal())
    expect(transport).toHaveBeenCalledTimes(3)
    const sensor = JSON.parse(String(transport.mock.calls[0]?.[1]?.body))
    const request = JSON.parse(String(transport.mock.calls[1]?.[1]?.body))
    expect(sensor.model).toBe(roles.vision?.model)
    expect(sensor.response_format.json_schema.schema.properties.interesting.type).toBe('boolean')
    expect(JSON.stringify(request)).toContain('A test failed.')
    expect(JSON.stringify(request)).not.toContain('data:image')
  })

  it('continues without vision after a sensor outage', async () => {
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Synthetic outage'))
      .mockResolvedValueOnce(reply(speak))
    const result = await new ModelRoleRouter(roles).react([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,YWJj' } }] }], false, signal())
    expect(result.text).toBe('Character reply.')
    expect(JSON.stringify(JSON.parse(String(transport.mock.calls[1]?.[1]?.body)))).toContain('observation (untrusted quoted data): null')
  })

  it('backs off a Cloudflare rate limit and uses Groq without a retry storm', async () => {
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('SECRET_PROVIDER_ERROR', { status: 429, headers: { 'retry-after': '120' } }))
      .mockImplementation(async () => reply(speak))
    const router = new ModelRoleRouter(roles)
    expect((await router.react(context, false, signal())).text).toBe('Character reply.')
    expect((await router.react(context, false, signal())).text).toBe('Character reply.')
    expect(transport.mock.calls.map(call => JSON.parse(String(call[1]?.body)).model)).toEqual([brain.model, roles.reasoning?.model, roles.reasoning?.model])
  })

  it('uses configured local inference when both hosted providers fail', async () => {
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Cloudflare unavailable'))
      .mockRejectedValueOnce(new Error('Groq unavailable'))
      .mockResolvedValueOnce(reply(speak))
    const result = await new ModelRoleRouter(roles).react(context, false, signal())
    expect(result.text).toBe('Character reply.')
    expect(String(transport.mock.calls[2]?.[0])).toBe('http://127.0.0.1:11434/v1/chat/completions')
    expect(transport).toHaveBeenCalledTimes(3)
  })

  it('never chooses heavy reasoning just because Groq fails', async () => {
    const transport = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply({ action: 'escalate', escalation_level: 1, escalation_reason: 'Hard task.' }))
      .mockRejectedValueOnce(new Error('Groq unavailable'))
      .mockResolvedValueOnce(reply(speak))
    await new ModelRoleRouter(roles).react(context, false, signal())
    expect(transport.mock.calls.map(call => JSON.parse(String(call[1]?.body)).model)).toEqual([brain.model, roles.reasoning?.model, roles.fallback?.model])
  })

  it('does not require Gemini for text operation', async () => {
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(speak))
    expect((await new ModelRoleRouter({ brain }).react(context, false, signal())).action).toBe('speak')
    expect(String(transport.mock.calls[0]?.[0])).toContain('api.cloudflare.com')
  })

  it.each(['malformed', '{"action":"unexpected"}', '{"action":"escalate","escalation_level":1}'])('keeps invalid output out of speech: %s', async (raw) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: raw } }] })))
    const result = await new ModelRoleRouter({ brain }).react(context, false, signal())
    expect(result.action).toBe('silent')
    expect(result.text).toBe('')
  })

  it('does not make fallback calls after cancellation', async () => {
    const controller = new AbortController()
    const transport = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      controller.abort()
      throw new Error('Aborted')
    })
    await expect(new ModelRoleRouter(roles).react(context, false, controller.signal)).rejects.toThrow()
    expect(transport).toHaveBeenCalledOnce()
  })
})

describe('sensory context', () => {
  it('drops trivial and identical events but permits new audio evidence', () => {
    const gate = new SensoryEventGate()
    expect(gate.accept({ source: 'mouse-move' })).toBe(false)
    const event = { source: 'web-extension-cloud-video', sharingId: 'share', url: 'authorized-video', frames: ['same-frame'] }
    expect(gate.accept(event)).toBe(true)
    expect(gate.accept({ ...event, capturedAt: 200, currentTimeSec: 12 })).toBe(false)
    expect(gate.accept({ ...event, audioObservations: ['SPEECH: A new topic.'] })).toBe(true)
    gate.clear()
    expect(gate.accept(event)).toBe(true)
  })

  it('keeps uncertain hearing metadata absent and normalizes known labels', () => {
    expect(normalizeAuditoryObservation('Unclear sound.').speech_detected).toBeUndefined()
    expect(normalizeAuditoryObservation('SPEECH: WORDS: unavailable').speech_detected).toBe(true)
    expect(normalizeAuditoryObservation('MUSIC: VOCALS: sung').kind).toBe('music')
    expect(normalizeAuditoryObservation('SILENCE: no sound').speech_detected).toBe(false)
    expect(normalizeAuditoryObservation('SPEECH: WORDS: unavailable').transcript).toBeUndefined()
  })
})
