import { describe, expect, it } from 'vitest'

import { JapaneseReplySpeech, speechCaption, speechTextForProvider } from './japanese-reply-speech'

describe('japanese reply speech', () => {
  it('discards every later speech chunk after an orphan reasoning close', () => {
    const reply = 'こんにちは。</think>追加のログ。'
    for (let split = 0; split <= reply.length; split++) {
      const speech = new JapaneseReplySpeech()
      expect(speech.consume(reply.slice(0, split)) + speech.consume(reply.slice(split))).toBe('こんにちは。')
      expect(speech.consume('もっとログ。')).toBe('')
    }
  })

  it.each(['think', 'THINK', 'reasoning', 'analysis'])('suppresses %s blocks across every stream split before speech and captions', (tag) => {
    const reply = `<${tag}>秘密の文章。</${tag}>こんにちは。\n(Hello.)`
    for (let split = 0; split <= reply.length; split++) {
      const speech = new JapaneseReplySpeech()
      expect(speech.consume(reply.slice(0, split)) + speech.consume(reply.slice(split))).toBe('こんにちは。\n')
    }
    expect(speechCaption(reply)).toBe('こんにちは。\n(Hello.)')
    expect(speechCaption('こんにちは。\n(Hello.)</think>extra logs')).toBe('こんにちは。\n(Hello.)')
  })

  it.each(['（笑）', '(笑)', '（笑)', '（小声で）'])('suppresses %s across every stream split and resumes Japanese speech', (note) => {
    const response = `え、また戻ってきたわけ？${note}どんだけこれ好きなのさ。\n(Back again? You really love this.)`
    for (let split = 0; split <= response.length; split++) {
      const filter = new JapaneseReplySpeech()
      expect(filter.consume(response.slice(0, split)) + filter.consume(response.slice(split))).toBe('え、また戻ってきたわけ？どんだけこれ好きなのさ。\n')
    }
  })

  it('suppresses nested and unfinished notes without leaking their contents', () => {
    const speech = new JapaneseReplySpeech()
    expect(speech.consume('こんにちは（小声（で））！')).toBe('こんにちは！')
    expect(speech.consume('またね（')).toBe('またね')
    expect(speech.consume('笑')).toBe('')
  })

  it('keeps Japanese speech while leaving translation for the display consumer', () => {
    const response = 'おかえり！\n\n(Welcome back!)'
    expect(new JapaneseReplySpeech().consume(response)).toBe('おかえり！\n\n')
    expect(response).toBe('おかえり！\n\n(Welcome back!)')
  })

  it('suppresses English across every possible stream split', () => {
    const response = 'また会えて嬉しい！\n(So happy to see you again!)'
    for (let split = 0; split <= response.length; split++) {
      const speech = new JapaneseReplySpeech()
      expect(speech.consume(response.slice(0, split)) + speech.consume(response.slice(split))).toBe('また会えて嬉しい！\n')
    }
  })

  it('does not resume speech when nested translation parentheses close', () => {
    const speech = new JapaneseReplySpeech()
    expect(speech.consume('こんにちは！\n(')).toBe('こんにちは！\n')
    expect(speech.consume('Hello (my friend)!')).toBe('')
    expect(speech.consume(') More English.')).toBe('')
  })

  it('suppresses fullwidth Japanese notes and preserves Japanese paragraphs', () => {
    expect(new JapaneseReplySpeech().consume('こんにちは（小声で）！\nまた来てね。\n(Hello! Come back soon.)')).toBe('こんにちは！\nまた来てね。\n')
  })

  it('keeps different replies isolated', () => {
    const first = new JapaneseReplySpeech()
    const second = new JapaneseReplySpeech()
    expect(first.consume('ただいま！\n(I am back!)')).toBe('ただいま！\n')
    expect(second.consume('おかえり！')).toBe('おかえり！')
    expect(first.consume('English continuation')).toBe('')
  })
})

describe('speech metadata captions', () => {
  it('hides complete and partial emotion metadata in captions', () => {
    const tag = '[emotion=curious]'
    const line = 'えっ、赤いね。\n(Whoa, it is red!)'
    for (let split = 1; split <= tag.length; split++)
      expect(speechCaption(line + tag.slice(0, split))).toBe(line)
    expect(speechCaption(tag + line + tag)).toBe(line)
  })

  it('removes the Kimi reply token from captions and all speech providers', () => {
    const reply = '<|close|>response[prosody tone=plain]こんにちは。\n(Hello.)'
    expect(speechCaption(reply)).toBe('こんにちは。\n(Hello.)')
    expect(speechTextForProvider(reply, 'voicevox')).toBe('[prosody tone=plain]こんにちは。\n(Hello.)')
    expect(speechTextForProvider(reply, 'kokoro-local')).toBe('こんにちは。\n(Hello.)')
  })

  it('hides the Kimi reply token across every stream split', () => {
    const token = '<|close|>response'
    const line = 'こんにちは。\n(Hello.)'
    for (let split = 0; split <= token.length; split++) {
      expect(speechCaption(token.slice(0, split))).toBe('')
      const speech = new JapaneseReplySpeech()
      expect(speech.consume(token.slice(0, split)) + speech.consume(token.slice(split) + line)).toBe('こんにちは。\n')
    }
    expect(speechCaption(`こんにちは。${token}またね。`)).toBe('こんにちは。またね。')
    expect(new JapaneseReplySpeech().consume(`こんにちは。${token}またね。`)).toBe('こんにちは。またね。')
    expect(speechCaption('Use < and > normally.')).toBe('Use < and > normally.')
  })

  it('hides tags across stream splits while preserving the bilingual reply', () => {
    const tag = '[prosody tone=sassy focus=ジャズ]'
    const line = 'ジャズっぽいね。\n(Sounds jazzy.)'
    for (let split = 1; split <= tag.length; split++)
      expect(speechCaption(tag.slice(0, split))).toBe('')
    expect(speechCaption(tag + line)).toBe(line)
    expect(new JapaneseReplySpeech().consume(tag + line)).toBe(`${tag}ジャズっぽいね。\n`)
  })

  it('removes malformed metadata without hiding Japanese notes', () => {
    expect(speechCaption('[prosody tone=unknown]こんにちは（小声で）。')).toBe('こんにちは（小声で）。')
  })

  it('keeps the tag only for the local VOICEVOX provider', () => {
    const tagged = '[prosody tone=sassy focus=ジャズ]ジャズっぽいね。'
    expect(speechTextForProvider(tagged, 'voicevox')).toBe(tagged)
    for (const provider of ['kokoro-local', 'openai-audio-speech', 'elevenlabs'])
      expect(speechTextForProvider(tagged, provider)).toBe('ジャズっぽいね。')
    expect(speechTextForProvider('[prosody tone=plain]', 'kokoro-local')).toBe('')
  })
})
