import type Kuroshiro from 'kuroshiro'

/**
 * Adds display readings without changing the source message or the speech intent.
 * Each renderer shares one lazy dictionary and a bounded cache of Japanese text fragments.
 * Failed initialization can retry. Failed conversion never replaces the original display text.
 */
class Furigana {
  private converter?: Promise<Kuroshiro>
  private readonly readings = new Map<string, Promise<string>>()

  private initialize(): Promise<Kuroshiro> {
    if (!this.converter) {
      this.converter = (async () => {
        const [{ default: Kuroshiro }, { default: KuromojiAnalyzer }] = await Promise.all([
          import('kuroshiro'),
          import('kuroshiro-analyzer-kuromoji'),
        ])
        const converter = new Kuroshiro()
        const dictPath = new URL(`${import.meta.env.BASE_URL}assets/furigana/`, window.location.href).href
        await converter.init(new KuromojiAnalyzer({ dictPath }))
        return converter
      })().catch((error: unknown) => {
        this.converter = undefined
        throw error
      })
    }
    return this.converter
  }

  private convert(text: string): Promise<string> {
    const cached = this.readings.get(text)
    if (cached)
      return cached
    const result = this.initialize()
      .then(converter => converter.convert(text, { to: 'hiragana', mode: 'furigana' }))
      .catch((error: unknown) => {
        this.readings.delete(text)
        throw error
      })
    this.readings.set(text, result)
    // Streaming prefixes and old conversations must not retain an unbounded text cache.
    if (this.readings.size > 256)
      this.readings.delete(this.readings.keys().next().value!)
    return result
  }

  /** Accepts sanitized HTML. Preserves code, math, existing ruby, and all original base text. */
  async annotate(html: string): Promise<string> {
    if (!/\p{Script=Han}/u.test(html))
      return html
    const template = document.createElement('template')
    template.innerHTML = html
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (node instanceof Text && /\p{Script=Han}/u.test(node.data)
        && !node.parentElement?.closest('pre, code, kbd, samp, ruby, math, .katex')) {
        nodes.push(node)
      }
    }
    await Promise.all(nodes.map(async (node) => {
      const fragment = document.createDocumentFragment()
      let offset = 0
      for (const match of node.data.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}〆ー]+/gu)) {
        fragment.append(node.data.slice(offset, match.index))
        const text = match[0]
        if (/\p{Script=Han}/u.test(text)) {
          const reading = document.createElement('template')
          // Only Japanese characters enter conversion. Generated ruby never contains source HTML or attributes.
          reading.innerHTML = await this.convert(text)
          const original = reading.content.cloneNode(true)
          if (original instanceof DocumentFragment) {
            original.querySelectorAll('rt, rp').forEach(element => element.remove())
            if (original.textContent !== text)
              throw new Error('Furigana conversion changed the source text.')
          }
          // Unknown dictionary words have no kana reading. Keep them readable without a duplicate kanji annotation.
          reading.content.querySelectorAll('ruby').forEach((ruby) => {
            const annotation = ruby.querySelector('rt')
            if (!annotation || !/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(annotation.textContent ?? '')) {
              ruby.querySelectorAll('rt, rp').forEach(element => element.remove())
              ruby.replaceWith(...ruby.childNodes)
            }
            else {
              annotation.setAttribute('aria-hidden', 'true')
              ruby.querySelectorAll('rp').forEach(element => element.setAttribute('aria-hidden', 'true'))
            }
          })
          fragment.append(reading.content)
        }
        else {
          fragment.append(text)
        }
        offset = match.index + text.length
      }
      fragment.append(node.data.slice(offset))
      node.replaceWith(fragment)
    }))
    return template.innerHTML
  }
}

/** Shared display converter. Speech and message storage keep the original text. */
export const furigana = new Furigana()
