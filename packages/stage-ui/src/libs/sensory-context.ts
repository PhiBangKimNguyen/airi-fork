import type { MediaAudioKind } from './media-vision'

/** Listening metadata contains evidence only. Unavailable speech and confidence fields remain absent. */
export interface AuditoryObservation {
  kind: MediaAudioKind
  summary: string
  speech_detected?: boolean
  transcript?: string
}

/** Existing Gemini labels supply reliable context without requiring speculative tone or confidence fields. */
export function normalizeAuditoryObservation(text: string): AuditoryObservation {
  const label = /^(MUSIC|SPEECH|MIXED|SILENCE):/i.exec(text.trim())?.[1]?.toLowerCase()
  const kind = label === 'music' || label === 'speech' || label === 'mixed' || label === 'silence' ? label : 'unknown'
  return {
    kind,
    summary: text.slice(0, 1400),
    speech_detected: kind === 'unknown' ? undefined : kind === 'speech' || kind === 'mixed',
  }
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
