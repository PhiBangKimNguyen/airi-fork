import { describe, expect, it } from 'vitest'

import { MediaReactionMemory } from './media-reaction-memory'
import { parseMediaReaction } from './media-reaction-performance'

describe('media reaction performance', () => {
  it('separates the cue while preserving speech prosody and the translation', () => {
    expect(parseMediaReaction(' [emotion=surprised] [prosody tone=curious focus=音]えっ、この音！\n(Whoa, that sound!)')).toEqual({
      emotion: 'surprised',
      text: '[prosody tone=curious focus=音]えっ、この音！\n(Whoa, that sound!)',
    })
  })

  it('accepts the gateway prosody prefix before the dreamy cue', () => {
    expect(parseMediaReaction('[prosody tone=plain][emotion=think]夢みたい。')).toEqual({
      emotion: 'think',
      text: '[prosody tone=plain]夢みたい。',
    })
  })

  it('removes an exposed reply template before it reads the cue', () => {
    expect(parseMediaReaction('<|close|>response[emotion=think][prosody tone=plain]夢みたい。')).toEqual({
      emotion: 'think',
      text: '[prosody tone=plain]夢みたい。',
    })
  })

  it('keeps metadata-only replies silent', () => {
    const reply = parseMediaReaction('[prosody tone=plain][emotion=happy]')
    expect(reply.emotion).toBeUndefined()
    expect(new MediaReactionMemory().remember('cloud', 'share', 'video', reply.text)).toBe(false)
  })

  it.each(['', '  ', '[emotion=happy]', '[emotion=curious', '[emotion='])('keeps silence without a motion: %s', (text) => {
    const reply = parseMediaReaction(text)
    expect(reply.emotion).toBeUndefined()
    expect(reply.text.trim()).toBe('')
  })

  it.each(['neutral', 'wedding', 'angry'])('does not dispatch an unsupported or idle cue: %s', (emotion) => {
    expect(parseMediaReaction(`[emotion=${emotion}]いいね。`)).toEqual({ text: 'いいね。' })
  })

  it('keeps untagged replies and prevents changed cues from bypassing duplicate checks', () => {
    expect(parseMediaReaction('いいね。')).toEqual({ text: 'いいね。' })
    const memory = new MediaReactionMemory()
    expect(memory.remember('cloud', 'share', 'video', parseMediaReaction('[emotion=happy]いいね。').text)).toBe(true)
    expect(memory.remember('cloud', 'share', 'video', parseMediaReaction('[emotion=curious]いいね。').text)).toBe(false)
  })
})
