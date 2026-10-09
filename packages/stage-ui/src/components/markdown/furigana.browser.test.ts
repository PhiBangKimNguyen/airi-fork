import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'

import FuriganaText from './furigana-text.vue'
import MarkdownRenderer from './markdown-renderer.vue'

import { furigana } from '../../libs/furigana'
import { JapaneseReplySpeech, speechTextForProvider } from '../../libs/speech/japanese-reply-speech'

function withoutReadings(element: Element): string {
  const copy = element.cloneNode(true)
  if (!(copy instanceof Element))
    throw new Error('Expected a display element.')
  copy.querySelectorAll('rt, rp').forEach(reading => reading.remove())
  return copy.textContent ?? ''
}

describe('local furigana display', () => {
  it('adds hiragana above kanji while speech receives the original bilingual reply', async () => {
    const text = '今日は猫と遊ぶ。\n\n(Today I play with a cat.)'
    const view = render(FuriganaText, { props: { text } })
    await expect.poll(() => view.container.querySelector('rt')?.textContent, { timeout: 15_000 }).toBe('きょう')
    expect(Array.from(view.container.querySelectorAll('rt'), reading => reading.textContent)).toContain('ねこ')
    expect(withoutReadings(view.container)).toBe(text)
    expect(getComputedStyle(view.container.querySelector('ruby')!).rubyPosition).toBe('over')
    expect(view.container.querySelector('rt')?.getAttribute('aria-hidden')).toBe('true')
    const speech = new JapaneseReplySpeech().consume(text)
    expect(speechTextForProvider(speech, 'voicevox')).toBe('今日は猫と遊ぶ。\n\n')
    expect(speechTextForProvider(speech, 'kokoro-local')).toBe('今日は猫と遊ぶ。\n\n')
  })

  it('preserves Markdown, link destinations, code, math, and existing ruby', async () => {
    const html = await furigana.annotate('<p><strong>猫</strong>と<a href="/猫">日本語</a></p><pre>猫</pre><code>日本語</code><math><mi>猫</mi></math><ruby>猫<rt>ねこ</rt></ruby>')
    const template = document.createElement('template')
    template.innerHTML = html
    expect(template.content.querySelector('strong rt')?.textContent).toBe('ねこ')
    expect(template.content.querySelector('a')?.getAttribute('href')).toBe('/猫')
    expect(template.content.querySelector('a rt')?.textContent).toBe('にほんご')
    expect(template.content.querySelector('pre')?.innerHTML).toBe('猫')
    expect(template.content.querySelector('code')?.innerHTML).toBe('日本語')
    expect(template.content.querySelector('math')?.querySelector('ruby')).toBeNull()
    expect(template.content.querySelectorAll('ruby ruby')).toHaveLength(0)
  })

  it('annotates assistant Markdown only when enabled', async () => {
    const view = render(MarkdownRenderer, { props: { content: '**猫**と`日本語`', furigana: true } })
    await expect.poll(() => view.container.querySelector('strong rt')?.textContent).toBe('ねこ')
    expect(view.container.querySelector('code ruby')).toBeNull()
    await view.rerender({ furigana: false })
    await expect.poll(() => view.container.querySelector('ruby')).toBeNull()
    expect(view.container.querySelector('strong')?.textContent).toBe('猫')
  })

  it('shows the newest streaming text and discards old readings after replacement', async () => {
    const view = render(FuriganaText, { props: { text: '猫' } })
    await view.rerender({ text: '日本語が好き。' })
    await expect.poll(() => view.container.querySelector('rt')?.textContent).toBe('にほんご')
    expect(withoutReadings(view.container)).toBe('日本語が好き。')
    await view.rerender({ text: 'Hello, こんにちは！' })
    await expect.poll(() => view.container.querySelector('ruby')).toBeNull()
    expect(view.container.textContent).toBe('Hello, こんにちは！')
  })

  it('escapes caption HTML and retains English, whitespace, and katakana', async () => {
    const text = '<img src=x onerror=alert(1)>\n猫とゲーム。  (A cat and a game.)'
    const view = render(FuriganaText, { props: { text } })
    await expect.poll(() => view.container.querySelector('rt')?.textContent).toBe('ねこ')
    expect(view.container.querySelector('img')).toBeNull()
    expect(withoutReadings(view.container)).toBe(text)
  })

  it('keeps unknown kanji visible without inventing a kana reading', async () => {
    const html = await furigana.annotate('<p>𠮷</p><p>猫</p>')
    const template = document.createElement('template')
    template.innerHTML = html
    expect(template.content.querySelector('p')?.textContent).toBe('𠮷')
    expect(template.content.querySelector('p:first-child ruby')).toBeNull()
    expect(template.content.querySelector('rt')?.textContent).toBe('ねこ')
  })
})
