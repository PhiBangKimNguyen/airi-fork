import type { ExtensionSettings } from './types'

import mediaMessages from '../../../../packages/i18n/src/locales/en/media-extension.json'

export { mediaMessages }

export const DEFAULT_WS_URL = 'ws://127.0.0.1:6121/ws'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  wsUrl: DEFAULT_WS_URL,
  token: '',
  enabled: false,
  sendPageContext: true,
  sendVideoContext: true,
  sendSubtitles: true,
  sendSparkNotify: true,
  enableVision: false,
  cloudVideoVision: false,
  cloudVideoProvider: 'gemini',
  audioEars: false,
  inklingResearchMedia: false,
  followYouTubeVideos: true,
}

export const STORAGE_KEY = 'airi:web-extension:settings'
