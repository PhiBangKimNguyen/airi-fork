/** The Kimi chat template can expose this delimiter before reply text. */
const replyTemplateToken = '<|close|>response'
const reasoningTokens = ['<think>', '</think>', '<reasoning>', '</reasoning>', '<analysis>', '</analysis>']

/**
 * Removes template tokens and reasoning blocks. Retains unfinished tokens or reasoning for the next stream chunk.
 * An orphan closing tag ends the reply. Stream consumers must discard later chunks when `ended` is true.
 * @example
 * cleanReplyTemplate('<|close|>responseこんにちは。<|cl')
 * // => { text: 'こんにちは。', pending: '<|cl', ended: false }
 */
export function cleanReplyTemplate(text: string) {
  // NOTICE:
  // Kimi can expose a chat template delimiter in captions and speech.
  // The upstream response includes <|close|>response as reply text.
  // Source: the hybrid Kimi output reported on 2026-10-08.
  // Remove this filter when the upstream guarantees replies without template delimiters.
  let cleaned = text.replaceAll(replyTemplateToken, '')
  // Incomplete reasoning stays buffered until its closing tag arrives. No reasoning enters captions or speech.
  while (true) {
    const opening = /<(think|reasoning|analysis)>/i.exec(cleaned)
    if (!opening)
      break
    const closing = `</${opening[1].toLowerCase()}>`
    const end = cleaned.toLowerCase().indexOf(closing, opening.index + opening[0].length)
    if (end < 0)
      return { text: cleaned.slice(0, opening.index), pending: cleaned.slice(opening.index), ended: false }
    cleaned = cleaned.slice(0, opening.index) + cleaned.slice(end + closing.length)
  }
  // An orphan closing tag marks a malformed continuation. Text after it has no reliable reply boundary.
  const orphan = /<\/(?:think|reasoning|analysis)>/i.exec(cleaned)
  if (orphan)
    return { text: cleaned.slice(0, orphan.index), pending: '', ended: true }
  for (const token of [replyTemplateToken, ...reasoningTokens]) {
    for (let length = token.length - 1; length > 0; length--) {
      const prefix = token.slice(0, length)
      if (cleaned.toLowerCase().endsWith(prefix.toLowerCase()))
        return { text: cleaned.slice(0, -length), pending: cleaned.slice(-length), ended: false }
    }
  }
  return { text: cleaned, pending: '', ended: false }
}

/**
 * Projects model output into literal text. The marker parser owns playback controls, so their payloads never become dialogue.
 * Incomplete controls remain pending until their closing delimiter arrives.
 * @example
 * literalReply('<|DELAY 2|>こんにちは。<|ACT {')
 * // => { text: 'こんにちは。', pending: '<|ACT {', ended: false }
 */
function literalReply(text: string) {
  const reply = cleanReplyTemplate(text)
  const literal = reply.text.replace(/<\|[\s\S]*?\|>/g, '')
  const unfinished = literal.indexOf('<|')
  if (unfinished >= 0) {
    return {
      text: literal.slice(0, unfinished),
      pending: literal.slice(unfinished) + reply.pending,
      ended: reply.ended,
    }
  }
  return { ...reply, text: literal }
}

/**
 * Speaks Japanese while suppressing parenthetical notes and the trailing English translation.
 * Each intent owns its filter. Parentheses can span stream chunks and use either width.
 * An ASCII group with Latin text starts the translation tail. Japanese-only groups are silent notes.
 */
export class JapaneseReplySpeech {
  private templatePrefix = ''
  private replyEnded = false
  private translationStarted = false
  private parentheticalDepth = 0
  private asciiParenthetical = false
  private parentheticalJapanese = false
  private parentheticalLatin = false

  consume(chunk: string): string {
    if (this.translationStarted || this.replyEnded)
      return ''
    const cleaned = literalReply(this.templatePrefix + chunk)
    this.templatePrefix = cleaned.pending
    this.replyEnded = cleaned.ended
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
 * Hides speech and avatar metadata from complete replies and partial streamed captions.
 * @example
 * speechCaption('[prosody tone=sassy focus=ジャズ]ジャズっぽいね。')
 * // => 'ジャズっぽいね。'
 */
export function speechCaption(text: string): string {
  const caption = literalReply(text).text.replace(/\[(?:prosody|emotion=)[^\]\r\n]*(?:\]|$)/g, '')
  return caption.replace(/\[(?:p|pr|pro|pros|proso|prosod|e|em|emo|emot|emoti|emotio|emotion)?$/g, '')
}

/**
 * Keeps speech metadata only for the `voicevox` provider. The AIRI local VOICEVOX server reads and removes it.
 * Other providers speak the tag aloud.
 * @example
 * speechTextForProvider('[prosody tone=sassy]いいね。', 'kokoro-local')
 * // => 'いいね。'
 */
export function speechTextForProvider(text: string, providerId: string): string {
  return providerId === 'voicevox' ? literalReply(text).text : speechCaption(text)
}
