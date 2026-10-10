import type { MediaReactionEvidence } from './media-reaction-grounding'

import * as v from 'valibot'

import { unsupportedMediaClaim } from './media-reaction-grounding'
import { normalizeEnglishTitles } from './speech/bilingual-style'
import { cleanReplyTemplate, JapaneseReplySpeech, speechCaption } from './speech/japanese-reply-speech'

const emotionSchema = v.picklist(['happy', 'curious', 'surprised', 'awkward', 'think', 'neutral'])

/** Watching limits apply to spoken dialogue, independently of bilingual captions and avatar metadata. */
export const mediaReactionLengthPrompt = 'While watching, give one or two short spoken sentences, preferably one. Use at most 60 characters per sentence and 80 total in Japanese dialogue. The English caption translates only this brief dialogue. Do not give a playlist recap. This watching limit has no exceptions for explanation requests. Keep Japanese dialogue outside brackets and parentheses. Only emotion and prosody metadata use square brackets. Use 「」 for song titles. Never narrate private-memory labels or context annotations.'

const sentences = new Intl.Segmenter('ja', { granularity: 'sentence' })

/** Media providers choose a cue independently of speech prosody. Neutral sends no new gesture. */
export const mediaReactionPerformancePrompt = 'Prefix each nonempty reply with [emotion=NAME]. Use happy for delight. Use curious for wonder or a thoughtful observation. Use surprised for a sudden discovery. Use awkward for bashfulness. Use think for a dreamy, zoned-out, or unfocused moment. Use neutral for a calm or sincere moment. Match your reaction, not the video genre. The think cue never means anger or protest. The cue controls the avatar and is never spoken. Silence has no cue.'

function englishCaptionAt(text: string, start: number) {
  if (text[start] !== '(' && text[start] !== '（')
    return
  const closings: string[] = []
  for (let index = start; index < text.length; index++) {
    const char = text[index]
    if (char === '(' || char === '（') {
      closings.push(char === '(' ? ')' : '）')
    }
    else if (char === ')' || char === '）') {
      if (closings.pop() !== char)
        return
      if (closings.length)
        continue
      const caption = normalizeEnglishTitles(text.slice(start + 1, index))
      if (!/\p{Script=Latin}/u.test(caption) || /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(caption))
        return
      return { start, end: index + 1, text: caption }
    }
  }
}

/**
 * Keeps the first completed watching reply pair. Consecutive replacement captions retain only the last English rendering.
 * Later dialogue and unparenthesized commentary never extend that reply or bypass its spoken length limit.
 * @example
 * normalizeWatchingReply('猫だね。\n(A cat.)\n\n(It is a cat.)\nextra commentary')
 * // => '猫だね。\n(It is a cat.)'
 */
export function normalizeWatchingReply(text: string): string {
  const reply = cleanReplyTemplate(text).text.replace(/「\s*」/gu, '').trim()
  for (let index = 0; index < reply.length; index++) {
    const first = englishCaptionAt(reply, index)
    if (!first)
      continue
    // Inline technical names remain part of Japanese dialogue. Sentence captions can also follow dialogue on the same line.
    if (!/(?:^|\n)[ \t]*$/.test(reply.slice(0, index)) && !/[.!?]/.test(first.text)) {
      index = first.end - 1
      continue
    }
    let translation = first.text
    let remaining = reply.slice(first.end)
    let metadata = ''
    while (remaining.trim()) {
      const control = /^\s*(\[(?:emotion=[^\]\r\n]*|prosody[^\]\r\n]*)\])/.exec(remaining)
      if (control) {
        metadata += control[1]
        remaining = remaining.slice(control[0].length)
        continue
      }
      const start = remaining.length - remaining.trimStart().length
      const replacement = englishCaptionAt(remaining, start)
      if (!replacement)
        break
      translation = replacement.text
      remaining = remaining.slice(replacement.end)
    }
    const dialogue = reply.slice(0, first.start)
    const separator = /\n[ \t]*$/.test(dialogue) ? '' : '\n'
    return `${dialogue}${separator}(${translation})${metadata}`
  }
  return reply
}

/**
 * Removes provider cues before duplicate checks, captions, and speech. Unknown cues never dispatch a performance action.
 * @example
 * parseMediaReaction('[emotion=surprised]えっ！\n(Whoa!)')
 * // => { text: 'えっ！\n(Whoa!)', emotion: 'surprised' }
 */
export function parseMediaReaction(text: string, evidence?: MediaReactionEvidence): { text: string, emotion?: v.InferOutput<typeof emotionSchema>, rejected?: 'length' | 'format' | 'title' | 'replay' } {
  const reply = normalizeWatchingReply(text)
  // The first cue owns the gesture. Remove every cue, including misplaced tags, before captions and speech.
  const cue = /\[emotion=([^\]\r\n]*)\]/.exec(reply)
  if (!cue && /^\s*(?:\[prosody[^\]\r\n]*\]\s*)?\[emotion(?:=|$)/.test(reply)) {
    // An unfinished metadata prefix contains no complete reaction to speak.
    return { text: '' }
  }

  const reaction = reply.replace(/\[emotion=[^\]\r\n]*(?:\]|$)/g, '').trim()
  const caption = speechCaption(reaction)
  const spoken = new JapaneseReplySpeech().consume(caption).replace(/\s+/gu, ' ').trim()
  // Unknown annotations are not dialogue. Reject the translation with them instead of exposing internal notes.
  if (/[[\]［］]/u.test(caption) || (caption.trim() && !spoken))
    return { text: '', rejected: 'format' }
  const lengths = [...sentences.segment(spoken)].map(item => [...item.segment.replace(/\s/gu, '')].length)
  // Reject the complete bilingual reply instead of clipping Japanese and leaving a mismatched English caption.
  if (lengths.length > 2 || lengths.some(length => length > 60) || lengths.reduce((sum, length) => sum + length, 0) > 80)
    return { text: '', rejected: 'length' }
  const unsupported = evidence ? unsupportedMediaClaim(reaction, evidence) : undefined
  if (unsupported)
    return { text: '', rejected: unsupported }
  const emotion = v.safeParse(emotionSchema, cue?.[1].trim())
  if (!speechCaption(reaction).trim() || !emotion.success || emotion.output === 'neutral')
    return { text: reaction }
  return { text: reaction, emotion: emotion.output }
}
