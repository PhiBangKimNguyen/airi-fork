import type { PageContextPayload, SubtitlePayload, VideoContextPayload, VisionFramePayload } from '../shared/types'

/** Keeps only recent shared-tab text. New content can trigger one reaction every 45 seconds. */
export class MediaReactions {
  private url = ''
  private page?: PageContextPayload
  private video?: VideoContextPayload
  private captions: string[] = []
  private captionLanguage?: string
  private frames: VisionFramePayload[] = []
  private pending = false
  private readyAt = 0
  private lastReactionAt = -Infinity

  reset() {
    this.url = ''
    this.page = undefined
    this.video = undefined
    this.captions = []
    this.captionLanguage = undefined
    this.frames = []
    this.pending = false
    this.readyAt = 0
    this.lastReactionAt = -Infinity
  }

  private navigate(url: string) {
    if (url === this.url)
      return
    // Navigation drops previous captions. Keep the cooldown across pages to avoid a burst of speech.
    this.url = url
    this.page = undefined
    this.video = undefined
    this.captions = []
    this.captionLanguage = undefined
    this.frames = []
    this.pending = false
  }

  observePage(page: PageContextPayload, now: number) {
    this.navigate(page.url)
    if (page.visibleText && page.visibleText !== this.page?.visibleText) {
      if (!this.pending)
        this.readyAt = now + 6000
      this.pending = true
    }
    this.page = page
  }

  observeVideo(video: VideoContextPayload) {
    this.navigate(video.url)
    this.video = video
  }

  observeSubtitle(subtitle: SubtitlePayload, now: number) {
    this.navigate(subtitle.url)
    const text = subtitle.text.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 600)
    if (!text || this.captions.includes(text))
      return
    const last = this.captions.at(-1)
    if (last?.startsWith(text))
      return
    this.captions = last && text.startsWith(last)
      ? [...this.captions.slice(0, -1), text]
      : [...this.captions, text].slice(-4)
    if (subtitle.language)
      this.captionLanguage = subtitle.language.slice(0, 80)
    if (!this.pending)
      this.readyAt = now + 6000
    this.pending = true
  }

  /** Two recent cropped video frames stay in RAM and are discarded on stop or navigation. */
  observeFrame(frame: VisionFramePayload, now: number) {
    if (frame.url !== this.url || !this.video?.isPlaying)
      return
    if (!/^data:image\/jpeg;base64,[A-Z0-9+/]+=*$/i.test(frame.dataUrl) || frame.dataUrl.length > 750_000)
      return
    this.frames = [...this.frames, frame].slice(-2)
    if (!this.pending)
      this.readyAt = now + 6000
    this.pending = true
  }

  take(now: number, cloudVideoVision = false, localVideoVision = false) {
    if (!this.pending || now < this.readyAt || now - this.lastReactionAt < 45_000)
      return
    if (this.video && !this.video.isPlaying)
      return
    const frames = this.frames.filter(frame => now - frame.capturedAt <= 30_000 && frame.capturedAt <= now).map(frame => frame.dataUrl)
    const vision = cloudVideoVision || localVideoVision
    if (this.video && vision && !frames.length)
      return
    // Video titles alone cannot support commentary about events in a video.
    const text = this.video ? this.captions.join('\n').slice(-2400) : this.page?.visibleText
    if (!text && (!this.video || !vision))
      return
    this.pending = false
    this.lastReactionAt = now
    return {
      source: this.video && vision ? (cloudVideoVision ? 'web-extension-cloud-video' : 'web-extension-local-video') : 'web-extension-watch',
      url: this.url,
      title: (this.video?.title ?? this.page?.title)?.slice(0, 300),
      channel: this.video?.channel?.slice(0, 160),
      captionLanguage: this.captionLanguage,
      site: this.video?.site ?? this.page?.site,
      text: text ?? '',
      ...(this.video && vision ? { frames } : {}),
      currentTimeSec: this.video?.currentTimeSec,
    }
  }
}
