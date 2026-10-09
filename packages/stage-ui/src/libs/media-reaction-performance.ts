import * as v from 'valibot'

import { cleanReplyTemplate, speechCaption } from './speech/japanese-reply-speech'

const emotionSchema = v.picklist(['happy', 'curious', 'surprised', 'awkward', 'think', 'neutral'])

/** Media providers choose a cue independently of speech prosody. Neutral sends no new gesture. */
export const mediaReactionPerformancePrompt = 'Prefix each nonempty reply with [emotion=NAME]. Use happy for delight. Use curious for wonder or a thoughtful observation. Use surprised for a sudden discovery. Use awkward for bashfulness. Use think for a dreamy, zoned-out, or unfocused moment. Use neutral for a calm or sincere moment. Match your reaction, not the video genre. The think cue never means anger or protest. The cue controls the avatar and is never spoken. Silence has no cue.'

/**
 * Removes provider cues before duplicate checks, captions, and speech. Unknown cues never dispatch a performance action.
 * @example
 * parseMediaReaction('[emotion=surprised]えっ！\n(Whoa!)')
 * // => { text: 'えっ！\n(Whoa!)', emotion: 'surprised' }
 */
export function parseMediaReaction(text: string): { text: string, emotion?: v.InferOutput<typeof emotionSchema> } {
  const reply = cleanReplyTemplate(text).text
  // The gateway also requests a speech prosody prefix. Both metadata orders are supported.
  const cue = /^(\s*(?:\[prosody[^\]\r\n]*\]\s*)?)\[emotion=([^\]\r\n]*)\]\s*/.exec(reply)
  if (!cue) {
    // An unfinished metadata prefix contains no complete reaction to speak.
    return { text: /^\s*(?:\[prosody[^\]\r\n]*\]\s*)?\[emotion(?:=|$)/.test(reply) ? '' : reply }
  }

  const reaction = cue[1].trimStart() + reply.slice(cue[0].length)
  const emotion = v.safeParse(emotionSchema, cue[2].trim())
  if (!speechCaption(reaction).trim() || !emotion.success || emotion.output === 'neutral')
    return { text: reaction }
  return { text: reaction, emotion: emotion.output }
}
