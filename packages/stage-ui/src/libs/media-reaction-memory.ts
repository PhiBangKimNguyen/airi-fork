import type { SharedVideo } from './media-vision'

import { speechCaption } from './speech/japanese-reply-speech'

const fillerWords = new Set(['なんか', 'すごく', 'この', 'その', 'あの', 'これ', 'それ', 'ちょっと', 'みたい', 'だね', 'よね', 'じゃん', 'って', 'から', 'まで', 'だけ', 'ない', 'いる', 'する', 'なる', 'ある'])
const wordSegmenter = new Intl.Segmenter('ja', { granularity: 'word' })

/**
 * Compares translated meaning without formatting or speech metadata.
 * @example
 * normalizeMediaReply('いいね。 (Nice!)')
 * // => 'nice'
 */
export function normalizeMediaReply(value: string) {
  const clean = speechCaption(value)
  const translation = /\(([\s\S]*)\)\s*$/.exec(clean)?.[1]
  return (translation ?? clean).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** Extracts a grammatical ending without retaining or forwarding the rest of the Japanese reply. */
function sentenceEnding(value: string) {
  const japanese = speechCaption(value).split('(')[0].normalize('NFKC').replace(/[\p{P}\sー]+$/gu, '')
  return /[\p{Script=Hiragana}\p{Script=Katakana}]{2}$/u.exec(japanese)?.[0]
}

/** Recent media comments have separate private and cloud-safe scopes. They never become general chat memory. */
export class MediaReactionMemory {
  private readonly comments = new Map<string, string[]>()
  private sessionId = ''
  private readonly styles = new Map<'local' | 'cloud', { count: number, habits: number, replies: string[] }>()

  /** Navigation within one grant retains style hints. A new grant clears both scopes. */
  setSession(sessionId: string) {
    if (sessionId !== this.sessionId) {
      this.clear()
      this.sessionId = sessionId
    }
  }

  hints(scope: 'local' | 'cloud') {
    const recent = this.styles.get(scope)
    const modes: SharedVideo['modeHint'][] = ['wonder', 'spark', 'poke', 'trivia', 'heart']
    const words = (recent?.replies ?? []).flatMap(reply => [...wordSegmenter.segment(speechCaption(reply).split('(')[0])]
      .filter(word => word.isWordLike && word.segment.length >= 2 && word.segment.length <= 24 && !fillerWords.has(word.segment))
      .map(word => word.segment))
    return {
      modeHint: modes[(recent?.count ?? 0) % modes.length],
      reactionSound: (recent?.count ?? 0) % 2 === 0,
      habitWarm: (recent?.habits ?? 0) % 2 === 0,
      recentWords: this.sessionId ? [...new Set(words)].slice(0, 16) : [],
      // Endings are a prompt hint. A reply with a repeated ending is still spoken.
      recentEndings: this.sessionId
        ? [...new Set((recent?.replies ?? []).map(sentenceEnding).filter((ending): ending is string => !!ending))].slice(0, 3)
        : [],
    }
  }

  /** Only accepted speech updates variety. Private replies never become cloud hints. */
  rememberStyle(scope: 'local' | 'cloud', text: string, habit: boolean) {
    const previous = this.styles.get(scope) ?? { count: 0, habits: 0, replies: [] }
    this.styles.set(scope, {
      count: previous.count + 1,
      habits: previous.habits + Number(habit),
      replies: [...previous.replies, text.slice(0, 1000)].slice(-3),
    })
  }

  recent(scope: 'local' | 'cloud', sharingId: string, url: string) {
    return [...(this.comments.get(JSON.stringify([scope, sharingId, url])) ?? [])]
  }

  /** Returns false for silence or a repeated comment, before a speech intent is opened. */
  remember(scope: 'local' | 'cloud', sharingId: string, url: string, text: string) {
    const normalized = normalizeMediaReply(text)
    const recent = this.recent(scope, sharingId, url)
    if (!normalized || recent.some(previous => normalizeMediaReply(previous) === normalized))
      return false
    this.comments.set(JSON.stringify([scope, sharingId, url]), [...recent, text.slice(0, 1000)].slice(-6))
    return true
  }

  /** Per-video duplicate checks reset on navigation. Session style hints remain bounded. */
  clearVideo() {
    this.comments.clear()
  }

  /** Stop sharing removes both scopes. In-flight generations cannot restore a revoked scope. */
  clear() {
    this.clearVideo()
    this.styles.clear()
    this.sessionId = ''
  }
}
