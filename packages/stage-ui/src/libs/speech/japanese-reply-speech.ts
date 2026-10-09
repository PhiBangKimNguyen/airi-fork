/** The Kimi chat template can expose this delimiter before reply text. */
const replyTemplateToken = '<|close|>response'

/**
 * Removes complete template tokens and retains an unfinished suffix for the next stream chunk.
 * @example
 * cleanReplyTemplate('<|close|>responseこんにちは。<|cl')
 * // => { text: 'こんにちは。', pending: '<|cl' }
 */
export function cleanReplyTemplate(text: string) {
  // NOTICE:
  // Kimi can expose a chat template delimiter in captions and speech.
  // The upstream response includes <|close|>response as reply text.
  // Source: the hybrid Kimi output reported on 2026-10-08.
  // Remove this filter when the upstream guarantees replies without template delimiters.
  const cleaned = text.replaceAll(replyTemplateToken, '')
  for (let length = replyTemplateToken.length - 1; length > 0; length--) {
    const prefix = replyTemplateToken.slice(0, length)
    if (cleaned.endsWith(prefix))
      return { text: cleaned.slice(0, -length), pending: prefix }
  }
  return { text: cleaned, pending: '' }
}
/**
 * Speaks Japanese while suppressing parenthetical notes and the trailing English translation.
 * Each intent owns its filter. Parentheses can span stream chunks and use either width.
 * An ASCII group with Latin text starts the translation tail. Japanese-only groups are silent notes.
 */
export class JapaneseReplySpeech {
  private templatePrefix = ''
  private translationStarted = false
  private parentheticalDepth = 0
  private asciiParenthetical = false
  private parentheticalJapanese = false
  private parentheticalLatin = false

  consume(chunk: string): string {
    if (this.translationStarted)
      return ''
    const cleaned = cleanReplyTemplate(this.templatePrefix + chunk)
    this.templatePrefix = cleaned.pending
    let speech = ''
    for (const char of cleaned.text) {
      if (char === '(' || char === '（') {
        if (this.parentheticalDepth === 0) {
          this.asciiParenthetical = char === '('
          this.parentheticalJapanese = false
          this.parentheticalLatin = false
        }
        this.parentheticalDepth += 1
      }
      else if (char === ')' || char === '）') {
        if (this.parentheticalDepth === 0)
          continue
        this.parentheticalDepth -= 1
        if (this.parentheticalDepth === 0 && this.asciiParenthetical
          && (this.parentheticalLatin || !this.parentheticalJapanese)) {
          this.translationStarted = true
          break
        }
      }
      else if (this.parentheticalDepth > 0) {
        this.parentheticalJapanese ||= /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(char)
        this.parentheticalLatin ||= /\p{Script=Latin}/u.test(char)
      }
      else {
        speech += char
      }
    }
    return speech
  }
}

/**
 * Hides speech metadata from complete replies and partial streamed captions.
 * @example
 * speechCaption('[prosody tone=sassy focus=ジャズ]ジャズっぽいね。')
 * // => 'ジャズっぽいね。'
 */
export function speechCaption(text: string): string {
  return cleanReplyTemplate(text).text.replace(/\[prosody[^\]\r\n]*(?:\]|$)/g, '').replace(/\[(?:p|pr|pro|pros|proso|prosod)?$/g, '')
}

/**
 * Keeps speech metadata only for the `voicevox` provider. The AIRI local VOICEVOX server reads and removes it.
 * Other providers speak the tag aloud.
 * @example
 * speechTextForProvider('[prosody tone=sassy]いいね。', 'kokoro-local')
 * // => 'いいね。'
 */
export function speechTextForProvider(text: string, providerId: string): string {
  return providerId === 'voicevox' ? cleanReplyTemplate(text).text : speechCaption(text)
}
