import type { CloudProvider } from '../../../../packages/stage-ui/src/types/cloud-provider'

export type VideoSite = 'youtube' | 'bilibili' | 'reddit' | 'unknown'

export interface PageContextPayload {
  site: VideoSite
  url: string
  title: string
  description?: string
  language?: string
  visibleText?: string
}

export interface VideoContextPayload {
  site: VideoSite
  url: string
  title: string
  channel?: string
  videoId?: string
  durationSec?: number
  currentTimeSec?: number
  isPlaying?: boolean
  isMuted?: boolean
  volume?: number
  playbackRate?: number
  isLive?: boolean
  playerSize?: { width: number, height: number }
}

export interface SubtitlePayload {
  site: VideoSite
  url: string
  videoId?: string
  title?: string
  text: string
  language?: string
  startMs?: number
  endMs?: number
  isAuto?: boolean
}

export interface VisionFramePayload {
  site: VideoSite
  url: string
  videoId?: string
  title?: string
  capturedAt: number
  width: number
  height: number
  dataUrl: string
}

export type ContentToBackgroundMessage
  = | { type: 'content:page', payload: PageContextPayload }
    | { type: 'content:video', payload: VideoContextPayload }
    | { type: 'content:subtitle', payload: SubtitlePayload }
    | { type: 'content:vision:frame', payload: VisionFramePayload }
    | { type: 'content:vision:error' }

export interface ExtensionSettings {
  wsUrl: string
  token: string
  enabled: boolean
  sendPageContext: boolean
  sendVideoContext: boolean
  sendSubtitles: boolean
  sendSparkNotify: boolean
  enableVision: boolean
  cloudVideoVision: boolean
  cloudVideoProvider: Exclude<CloudProvider, 'brain'>
  audioEars: boolean
  inklingResearchMedia: boolean
  followYouTubeVideos: boolean
}

export interface ExtensionStatus {
  connected: boolean
  lastError?: string
  settings: ExtensionSettings
  lastPage?: PageContextPayload
  lastVideo?: VideoContextPayload
  lastSubtitle?: SubtitlePayload
  lastVisionFrameAt?: number
  sharedTabId?: number
  audioCapturing?: boolean
}

/** Offscreen capture carries the share it was started for, so navigation and stop revoke every chunk. */
export type TabAudioMessage
  = | { type: 'audio:start', target: 'offscreen', streamId: string, sharingId: string, url: string }
    | { type: 'audio:scope', target: 'offscreen', sharingId: string, url: string }
    | { type: 'audio:stop', target: 'offscreen' }
    | { type: 'audio:chunk', sharingId: string, url: string, capturedAt: number, audio: string }

/** Only operational startup errors return to the popup. Audio and stream credentials stay inside capture messages. */
export type TabAudioStartResult = { ok: true } | { ok: false, error: string }

export type BackgroundToContentMessage
  = | { type: 'background:request-vision-frame' }
    | { type: 'background:set-sharing', enabled: boolean }
