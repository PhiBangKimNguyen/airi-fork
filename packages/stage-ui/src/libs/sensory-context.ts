import type { MediaAudioKind } from './media-vision'

/** Listening metadata contains evidence only. Unavailable speech and confidence fields remain absent. */
export interface AuditoryObservation {
  kind: MediaAudioKind
  summary: string
  speech_detected?: boolean
  transcript?: string
  lyricEvidence: { source: 'audio-model', confidence: 'clear' | 'uncertain' | 'unavailable', text?: string }
}

/**
 * Separates model-heard words from acoustic observations. Missing confidence never establishes clear lyrics.
 * @example
 * normalizeAuditoryObservation('MUSIC: WORDS: unavailable.')
 * // => { kind: 'music', summary: 'MUSIC: WORDS: unavailable.', speech_detected: false, lyricEvidence: { source: 'audio-model', confidence: 'unavailable' } }
 */
export function normalizeAuditoryObservation(text: string): AuditoryObservation {
  const label = /^(MUSIC|SPEECH|MIXED|SILENCE):/i.exec(text.trim())?.[1]?.toLowerCase()
  const kind = label === 'music' || label === 'speech' || label === 'mixed' || label === 'silence' ? label : 'unknown'
  const words = /\bWORDS:([\s\S]*?)(?=\b[A-Z_]+:|$)/i.exec(text)?.[1]?.trim().replace(/[.\s]+$/u, '')
  const confidenceLabel = /\bWORDS_CONFIDENCE:\s*(clear|uncertain|unavailable)\b/i.exec(text)?.[1]?.toLowerCase()
  const unavailable = !words || /^(?:unavailable|none|uncertain)$/i.test(words)
  const confidence = unavailable ? 'unavailable' : confidenceLabel === 'clear' ? 'clear' : 'uncertain'
  return {
    kind,
    summary: text.replace(/\bWORDS:[\s\S]*?(?=\b[A-Z_]+:|$)/gi, 'WORDS: unavailable. ').trim().slice(0, 1400),
    speech_detected: kind === 'unknown' ? undefined : kind === 'speech' || kind === 'mixed',
    lyricEvidence: { source: 'audio-model', confidence, text: confidence === 'clear' ? words?.slice(0, 200) : undefined },
  }
}

/** A short line needs agreement between clear audio words and captions before it enters the reaction prompt. */
export function corroboratedLyrics(observations: string[], captions: string) {
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const caption = ` ${normalize(captions)} `
  return observations.flatMap((observation) => {
    const evidence = normalizeAuditoryObservation(observation).lyricEvidence
    const words = evidence.text ? normalize(evidence.text) : ''
    if (evidence.confidence !== 'clear' || words.split(' ').length < 2 || !caption.includes(` ${words} `))
      return []
    return [{ source: 'audio-and-captions' as const, confidence: 'corroborated' as const, text: evidence.text! }]
  }).slice(-2)
}

/** Uncorroborated song-subject claims are discarded before TTS. Acoustic opinions remain available. */
export function unsupportedLyricClaim(text: string, lyricsAvailable: boolean) {
  return !lyricsAvailable && /(?:brother|sister)[^.!?]*lyrics?|lyric[^.!?]*(?:about|say|mention|words|brother|sister)|sing(?:ing|s)?\s+about|song\s+is\s+about|歌詞[^。！？]*(?:[言兄妹弟姉]|について)|(?:歌って|歌う)[^。！？]*について/iu.test(text)
}

/**
 * Rejects trivial and repeated sensory events before scheduling a model request.
 * Only the latest evidence per source stays in RAM. Clear this state when sharing ends.
 */
export class SensoryEventGate {
  private readonly recent = new Map<string, string>()

  clear() {
    this.recent.clear()
  }

  accept(payload: Record<string, unknown> | undefined): boolean {
    if (!payload)
      return true
    const source = typeof payload.source === 'string' ? payload.source : ''
    if (['mouse-move', 'cursor-move', 'window-resize', 'dom-mutation', 'app-heartbeat'].includes(source)) {
      console.info('Event discarded', { reason: 'trivial' })
      return false
    }
    if (!source.startsWith('web-extension-'))
      return true
    const key = JSON.stringify([source, payload.sharingId, payload.url])
    const evidence = JSON.stringify([payload.title, payload.channel, payload.text, payload.frames, payload.audioObservations])
    if (this.recent.get(key) === evidence) {
      console.info('Event discarded', { reason: 'unchanged-sensory-context' })
      return false
    }
    this.recent.set(key, evidence)
    if (this.recent.size > 16)
      this.recent.delete(this.recent.keys().next().value!)
    return true
  }
}
