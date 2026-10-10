import { extractVideoId, normalizeText } from '../shared/sites'

/** YouTube reuses its player during navigation. Metadata needs matching URL, rendered identity, and title. */
export class YoutubeMetadataGate {
  private candidate = ''
  private candidateSince = 0

  ready(input: { url: string, renderedId?: string | null, canonicalUrl?: string | null, title: string, documentTitle: string }, now: number) {
    const id = extractVideoId('youtube', input.url)
    const canonicalId = input.canonicalUrl ? extractVideoId('youtube', input.canonicalUrl) : undefined
    const documentTitle = normalizeText(input.documentTitle.replace(/\s*[-–—|]\s*YouTube\s*$/i, ''))
    if (!id || input.renderedId !== id || canonicalId !== id || !input.title || normalizeText(input.title) !== documentTitle) {
      this.candidate = ''
      return false
    }
    const candidate = JSON.stringify([id, input.title])
    if (candidate !== this.candidate) {
      this.candidate = candidate
      this.candidateSince = now
      return false
    }
    // DOM identity fields update separately. Require a stable snapshot before any content reaches the background.
    return now - this.candidateSince >= 500
  }
}
