import { describe, expect, it } from 'vitest'

import { MediaReactionMemory } from './media-reaction-memory'
import { parseMediaReaction } from './media-reaction-performance'
import { JapaneseReplySpeech, speechCaption } from './speech/japanese-reply-speech'

describe('media reaction performance', () => {
  it('removes empty Japanese quotation marks before captions and speech', () => {
    const dialogue = 'ふふ、これは静寂が音を立ててくっつく感じだね。'
    const caption = '(Heh, it\'s like silence makes an actual sound together here.)'
    const reaction = parseMediaReaction(`「」\n${dialogue}\n\n${caption}`)
    expect(reaction.text).toBe(`${dialogue}\n\n${caption}`)
    expect(speechCaption(reaction.text)).toBe(`${dialogue}\n\n${caption}`)
    expect(new JapaneseReplySpeech().consume(reaction.text)).toBe(`${dialogue}\n\n`)
    expect(parseMediaReaction('「 \n 」')).toEqual({ text: '' })
    expect(parseMediaReaction('「Memory」だね。\n(It is "Memory".)').text).toBe('「Memory」だね。\n(It is "Memory".)')
  })

  it('keeps one English caption with the requested title translation', () => {
    const japanese = 'あの「イブの記憶」がまたポップに生まれ変わって、どうした。'
    const reply = `${japanese}\n(That "Ib no Kioku" was born again in a pop way... why so?)\n\n(Hey, that "Ib no Kioku" has been reborn as something pop. What gives?)`
    expect(parseMediaReaction(reply).text).toBe(`${japanese}\n(Hey, that "Ib's Memory" has been reborn as something pop. What gives?)`)
  })

  it('keeps the first Memory reply pair and discards later dialogue and dangling thinking output', () => {
    const first = 'えっ、あの「Memory」ってタイトル見たことあるわ。  \n(Oh, I see that "Memory" title already.)'
    const reply = `${first}  \n\nふふ、ピアノと弦楽器の対比が気になりそうね。\n(Lol, the contrast between piano and violin sounds intriguing.)\n</think>\n\nあさ〜...ふふっ (Ah...)\n(Hmm, huh-huh)`
    expect(parseMediaReaction(reply)).toEqual({ text: first })
  })

  it('discards English commentary and inline bilingual continuations before captions and speech', () => {
    const first = '「はからさまに虚勢を張って ゆく 追い越される」\n\n(Hopelessly bluffed and gradually overtaken, it says.)'
    const reply = `${first}  \nThe lyrics keep this quiet rhythm—almost like a confession slipping out of someone’s breath.\nこの画像、静かな。音楽だけ聞こうか。(This image is quiet and still. Let's listen to the music.)\n\n(Hey, this picture's pretty peaceable. I'm going to focus on the melody.)`
    expect(parseMediaReaction(reply)).toEqual({ text: first })
    const reaction = parseMediaReaction(reply)
    expect(speechCaption(reaction.text)).toBe(first)
    expect(new JapaneseReplySpeech().consume(reaction.text)).toBe('「はからさまに虚勢を張って ゆく 追い越される」\n\n')
  })

  it('removes complete reasoning blocks before choosing a reply pair', () => {
    const text = 'こんにちは。\n(Hello.)'
    expect(parseMediaReaction(`<think>秘密の文章。\n(Private thoughts.)</think>${text}`)).toEqual({ text })
    expect(parseMediaReaction('<think>秘密の文章。\n(Private thoughts.)')).toEqual({ text: '' })
  })

  it.each([
    '[Ib 記憶に続き、今回もしっとりとした空気感が戻ってきましたね。]\n(Ib Memory followed up, and this moody atmosphere has settled back in.)',
    '[PRIVATE listening preferences]ライブ版が集まったね。\n(You have collected live versions.)',
    '(ライブ版が集まったね。)\n(You have collected live versions.)',
  ])('rejects annotations and parenthesized dialogue before captions and speech: %s', (text) => {
    expect(parseMediaReaction(text)).toEqual({ text: '', rejected: 'format' })
  })

  it('keeps a song named Memory in ordinary dialogue', () => {
    const text = '「Ib 記憶」の別アレンジも集まったね。\n(You have collected another arrangement of Ib Memory.)'
    expect(parseMediaReaction(text)).toEqual({ text: '「Ib 記憶」の別アレンジも集まったね。\n(You have collected another arrangement of Ib\'s Memory.)' })
  })

  it('preserves nested captions, Japanese notes and inline technical names', () => {
    const text = 'YouTube (Music)で聴いてる。（小声で）\n(This song (the live version) sounds great.)'
    expect(parseMediaReaction(text)).toEqual({ text })
  })

  it('retains avatar and speech metadata after a replacement caption', () => {
    const text = '[prosody tone=curious focus=曲]この曲、好きだな。\n(I like this song.)\n(I love this song.)[emotion=happy]'
    expect(parseMediaReaction(text)).toEqual({ text: '[prosody tone=curious focus=曲]この曲、好きだな。\n(I love this song.)', emotion: 'happy' })
  })

  it('preserves unrelated English song titles', () => {
    const text = '「Memory」の別アレンジだね。\n(Another arrangement of "Memory".)'
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
