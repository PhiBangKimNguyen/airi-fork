import type { BackgroundToContentMessage, ContentToBackgroundMessage, PageContextPayload, SubtitlePayload, VideoContextPayload, VideoSite, VisionFramePayload } from '../shared/types'

import { detectSiteFromUrl, extractVideoId, normalizeText } from '../shared/sites'
import { YoutubeMetadataGate } from './youtube-metadata'

const VIDEO_PROGRESS_INTERVAL = 15000
const TITLE_POLL_INTERVAL = 2000
const SUBTITLE_DEDUPE_WINDOW = 2000

const lastPayloadByType = new Map<string, string>()
let youtubeMetadata = new YoutubeMetadataGate()

function metadataReady(site: VideoSite) {
  return site !== 'youtube' || youtubeMetadata.ready({
    url: location.href,
    renderedId: document.querySelector('ytd-watch-flexy')?.getAttribute('video-id'),
    canonicalUrl: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    title: normalizeText(findVideoTitle(site)),
    documentTitle: document.title,
  }, Date.now())
}

function safeSend(message: ContentToBackgroundMessage) {
  if ('payload' in message && message.payload.site === 'youtube' && !metadataReady('youtube'))
    return
  const serialized = JSON.stringify('payload' in message ? message.payload : null)
  const lastSerialized = lastPayloadByType.get(message.type)
  if (serialized === lastSerialized)
    return

  lastPayloadByType.set(message.type, serialized)
  void browser.runtime.sendMessage(message).catch(() => {})
}

function buildPageContext(site: VideoSite): PageContextPayload {
  const description = normalizeText(document.querySelector('meta[name="description"]')?.getAttribute('content'))
  const ogDescription = normalizeText(document.querySelector('meta[property="og:description"]')?.getAttribute('content'))

  return {
    site,
    url: location.href,
    title: normalizeText(document.title),
    // YouTube keeps the previous video's meta description during playlist navigation. Omit that unverified field.
    description: site === 'youtube' ? undefined : description || ogDescription || undefined,
    language: document.documentElement.lang || undefined,
    visibleText: site === 'youtube' ? undefined : readVisibleText(),
  }
}

/** Reads rendered paragraphs in the shared tab. Form values and off-screen history are excluded. */
function readVisibleText() {
  const lines: string[] = []
  let length = 0
  const roots: ParentNode[] = [document]
  for (const root of roots) {
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot)
        roots.push(element.shadowRoot)
    }
    for (const element of root.querySelectorAll('h1, h2, h3, p, [slot="text-body"], [data-test-id="post-content"]')) {
      if (element.closest('form, nav, header, footer, [contenteditable], textarea, input, [hidden], [aria-hidden="true"]'))
        continue
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight)
        continue
      if (!(element instanceof HTMLElement) || getComputedStyle(element).visibility === 'hidden')
        continue
      // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- Rendered text excludes hidden descendants in the shared page.
      const text = normalizeText(element.innerText).slice(0, 1000)
      if (!text || lines.includes(text))
        continue
      lines.push(text)
      length += text.length
      if (length >= 4000)
        return lines.join('\n').slice(0, 4000)
    }
  }
  return lines.join('\n').slice(0, 4000)
}

function buildVideoContext(site: VideoSite, video: HTMLVideoElement, includeProgress = false): VideoContextPayload {
  const title = normalizeText(findVideoTitle(site))
  const channel = normalizeText(findChannelName(site))
  const url = location.href
  const videoId = extractVideoId(site, url)
  const durationSec = Number.isFinite(video.duration) ? Math.floor(video.duration) : undefined
  const currentTimeSec = includeProgress && Number.isFinite(video.currentTime) ? Math.floor(video.currentTime) : undefined
  const rect = video.getBoundingClientRect()

  return {
    site,
    url,
    title: title || normalizeText(document.title),
    channel: channel || undefined,
    videoId,
    durationSec,
    currentTimeSec,
    isPlaying: !video.paused && !video.ended,
    isMuted: video.muted,
    volume: Number.isFinite(video.volume) ? Number(video.volume.toFixed(2)) : undefined,
    playbackRate: Number.isFinite(video.playbackRate) ? Number(video.playbackRate.toFixed(2)) : undefined,
    playerSize: rect.width && rect.height ? { width: Math.round(rect.width), height: Math.round(rect.height) } : undefined,
  }
}

function findVideoTitle(site: VideoSite) {
  if (site === 'youtube') {
    return (
      document.querySelector('ytd-watch-metadata h1 yt-formatted-string')?.textContent
      || document.querySelector('h1.title yt-formatted-string')?.textContent
      || document.querySelector('h1.title')?.textContent
    )
  }

  if (site === 'bilibili') {
    return (
      document.querySelector('h1.video-title')?.textContent
      || document.querySelector('.video-title')?.textContent
      || document.querySelector('h1')?.textContent
    )
  }

  return document.querySelector('h1')?.textContent
}

function findChannelName(site: VideoSite) {
  if (site === 'youtube') {
    return (
      document.querySelector('ytd-watch-flexy #owner #channel-name a')?.textContent
      || document.querySelector('ytd-watch-flexy #owner ytd-channel-name a')?.textContent
      || document.querySelector('ytd-watch-flexy #owner ytd-channel-name')?.textContent
    )
  }

  if (site === 'bilibili') {
    return (
      document.querySelector('.up-name')?.textContent
      || document.querySelector('.username')?.textContent
      || document.querySelector('.up-info .name')?.textContent
    )
  }

  return undefined
}

function observeTextTracks(site: VideoSite, video: HTMLVideoElement, onSubtitle: (payload: SubtitlePayload) => void) {
  const seen = new Map<string, number>()

  const handleCueChange = (track: TextTrack) => {
    const cues = Array.from(track.activeCues ?? []) as TextTrackCue[]
    for (const cue of cues) {
      const text = normalizeText((cue as VTTCue).text ?? '')
      if (!text)
        continue

      const key = `${text}:${Math.floor(cue.startTime * 1000)}`
      const now = Date.now()
      const lastSeen = seen.get(key)
      if (lastSeen && now - lastSeen < SUBTITLE_DEDUPE_WINDOW)
        continue

      seen.set(key, now)
      onSubtitle({
        site,
        url: location.href,
        title: normalizeText(findVideoTitle(site)) || undefined,
        videoId: extractVideoId(site, location.href),
        text,
        language: (track.language || track.label || undefined),
        startMs: Math.floor(cue.startTime * 1000),
        endMs: Math.floor(cue.endTime * 1000),
      })
    }
  }

  const attach = () => {
    const tracks = Array.from(video.textTracks ?? [])
    for (const track of tracks) {
      if (track.kind && !['subtitles', 'captions'].includes(track.kind))
        continue

      if (track.mode === 'disabled')
        track.mode = 'hidden'
      track.oncuechange = () => handleCueChange(track)
    }
  }

  attach()

  const observer = new MutationObserver(() => attach())
  observer.observe(video, { attributes: true, childList: true, subtree: true })

  return () => {
    observer.disconnect()
    for (const track of Array.from(video.textTracks))
      track.oncuechange = null
  }
}

function observeSubtitleDom(site: VideoSite, onSubtitle: (payload: SubtitlePayload) => void) {
  let selector = ''
  if (site === 'youtube')
    selector = '.caption-window .caption-window-text, .ytp-caption-segment'
  if (site === 'bilibili')
    selector = '.bpx-player-subtitle-panel-text, .bpx-player-subtitle-text'

  if (!selector)
    return () => {}

  let lastText = ''

  const read = () => {
    const nodes = Array.from(document.querySelectorAll(selector))
    const text = normalizeText(nodes.map(node => node.textContent).join(' '))
    if (!text || text === lastText)
      return

    lastText = text
    onSubtitle({
      site,
      url: location.href,
      title: normalizeText(findVideoTitle(site)) || undefined,
      videoId: extractVideoId(site, location.href),
      text,
      language: Array.from(document.querySelector('video')?.textTracks ?? []).find(track => track.mode === 'showing')?.language || undefined,
    })
  }

  const observer = new MutationObserver(read)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  const interval = window.setInterval(read, 1200)

  return () => {
    observer.disconnect()
    window.clearInterval(interval)
  }
}

function captureVisionFrame(site: VideoSite, video: HTMLVideoElement): VisionFramePayload | null {
  if (!metadataReady(site))
    return null
  const canvas = document.createElement('canvas')
  const width = Math.min(480, Math.max(1, Math.floor(video.videoWidth)))
  const height = Math.min(270, Math.max(1, Math.floor(video.videoHeight)))

  if (!width || !height)
    return null

  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx)
    return null

  try {
    ctx.drawImage(video, 0, 0, width, height)
    return {
      site,
      url: location.href,
      videoId: extractVideoId(site, location.href),
      title: normalizeText(findVideoTitle(site)) || undefined,
      capturedAt: Date.now(),
      width,
      height,
      dataUrl: canvas.toDataURL('image/jpeg', 0.6),
    }
  }
  catch {
    return null
  }
}

function observeVideo(site: VideoSite) {
  let video: HTMLVideoElement | null = null
  let stopTracks: (() => void) | null = null
  let stopDomSubtitles: (() => void) | null = null
  let listenersAttached = false

  const sendVideo = (includeProgress: boolean) => {
    if (!video)
      return

    safeSend({ type: 'content:video', payload: buildVideoContext(site, video, includeProgress) })
  }

  const sendPage = () => {
    safeSend({ type: 'content:page', payload: buildPageContext(site) })
  }

  const onPlayback = () => sendVideo(true)

  const attach = () => {
    const found = document.querySelector('video') as HTMLVideoElement | null
    if (!found || found === video)
      return

    if (video && listenersAttached) {
      video.removeEventListener('play', onPlayback)
      video.removeEventListener('pause', onPlayback)
      video.removeEventListener('loadedmetadata', onPlayback)
      listenersAttached = false
    }

    video = found
    stopTracks?.()
    stopDomSubtitles?.()

    stopTracks = observeTextTracks(site, video, payload => safeSend({ type: 'content:subtitle', payload }))
    stopDomSubtitles = observeSubtitleDom(site, payload => safeSend({ type: 'content:subtitle', payload }))

    sendPage()
    sendVideo(false)
  }

  const interval = window.setInterval(attach, 1000)

  const progressInterval = window.setInterval(() => {
    if (!video)
      return
    sendVideo(true)
  }, VIDEO_PROGRESS_INTERVAL)

  const titleInterval = window.setInterval(() => {
    sendPage()
    sendVideo(false)
  }, TITLE_POLL_INTERVAL)

  const cleanup = () => {
    window.clearInterval(interval)
    window.clearInterval(progressInterval)
    window.clearInterval(titleInterval)
    if (video) {
      video.removeEventListener('play', onPlayback)
      video.removeEventListener('pause', onPlayback)
      video.removeEventListener('loadedmetadata', onPlayback)
      listenersAttached = false
    }
    stopTracks?.()
    stopDomSubtitles?.()
  }

  const attachListeners = () => {
    if (!video)
      return
    if (listenersAttached)
      return

    video.addEventListener('play', onPlayback)
    video.addEventListener('pause', onPlayback)
    video.addEventListener('loadedmetadata', onPlayback)
    listenersAttached = true
  }

  const observer = new MutationObserver(() => {
    attach()
    attachListeners()
  })

  observer.observe(document.documentElement, { childList: true, subtree: true })

  attach()
  attachListeners()

  return () => {
    cleanup()
    observer.disconnect()
  }
}

export function startContentObserver() {
  lastPayloadByType.clear()
  youtubeMetadata = new YoutubeMetadataGate()
  const site = detectSiteFromUrl(location.href)
  safeSend({ type: 'content:page', payload: buildPageContext(site) })
  const stopVideo = observeVideo(site)

  const onMessage = (message: BackgroundToContentMessage) => {
    if (message.type === 'background:request-vision-frame') {
      const video = document.querySelector('video') as HTMLVideoElement | null
      if (!video)
        return

      const frame = captureVisionFrame(site, video)
      if (frame)
        safeSend({ type: 'content:vision:frame', payload: frame })
      else
        safeSend({ type: 'content:vision:error' })
    }
  }
  browser.runtime.onMessage.addListener(onMessage)

  return () => {
    stopVideo?.()
    browser.runtime.onMessage.removeListener(onMessage)
    lastPayloadByType.clear()
  }
}
