import { describe, expect, it } from 'vitest'

import { MediaReactionMemory } from './media-reaction-memory'
import { parseMediaReaction } from './media-reaction-performance'

describe('media reaction performance', () => {
  it.each([
    '[Ib 記憶に続き、今回もしっとりとした空気感が戻ってきましたね。]\n(Ib Memory followed up, and this moody atmosphere has settled back in.)',
    '[PRIVATE listening preferences]ライブ版が集まったね。\n(You have collected live versions.)',
    '(ライブ版が集まったね。)\n(You have collected live versions.)',
  ])('rejects annotations and parenthesized dialogue before captions and speech: %s', (text) => {
    expect(parseMediaReaction(text)).toEqual({ text: '', rejected: 'format' })
  })

  it('keeps a song named Memory in ordinary dialogue', () => {
    const text = '「Ib 記憶」の別アレンジも集まったね。\n(You have collected another arrangement of Ib Memory.)'
    expect(parseMediaReaction(text)).toEqual({ text })
  })

  it.each([
    'この曲、懐かしいね。ライブ版もいいね。また聴きたいな。',
    'このプレイリストは、静かな雨音とアコーディオンの共演が繰り返されているようだが、特に「L’été indien」で聴いたように、雨の匂いが漂うチェロや弦の音が、後で入ってくるコーラスによって一気にドラマチックになるパターンが見られる。別のバージョンを重ねても、その切ない響きは変わっていない。',
    `${'あ'.repeat(61)}。`,
    `${'あ'.repeat(40)}。${'い'.repeat(40)}。`,
  ])('rejects an overlong watching reply before captions and speech: %s', (text) => {
    expect(parseMediaReaction(`[emotion=curious]${text}\n\n(A long translation.)`).text).toBe('')
  })

  it('accepts two short spoken sentences and excludes metadata and translation from the count', () => {
    const text = '[prosody tone=curious focus=ライブ]ライブ版が集まったね！[prosody tone=plain]同じ歌でも楽しみ方が変わるね。\n\n(You have collected live versions. The same song offers different ways to enjoy it.)'
    expect(parseMediaReaction(`[emotion=happy]${text}`).text).toBe(text)
  })

  it('rejects long untagged dialogue and does not retain an avatar cue', () => {
    expect(parseMediaReaction('あ'.repeat(100))).toEqual({ text: '', rejected: 'length' })
    expect(parseMediaReaction(`[emotion=happy]${'あ'.repeat(100)}`).emotion).toBeUndefined()
  })

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

  it.each([
    'えっ、赤いね。\n(Whoa, it is red!)\n[emotion=curious]',
    'えっ、[emotion=curious]赤いね。\n(Whoa, it is red!)',
  ])('extracts emotion metadata outside the prefix: %s', (text) => {
    expect(parseMediaReaction(text)).toEqual({
      text: 'えっ、赤いね。\n(Whoa, it is red!)',
      emotion: 'curious',
    })
  })

  it('removes repeated and unsupported trailing cues and preserves the first cue', () => {
    expect(parseMediaReaction('[emotion=happy]いいね。\n(Nice.)\n[emotion=curious][emotion=unknown]')).toEqual({
      text: 'いいね。\n(Nice.)',
      emotion: 'happy',
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
