import type { ExtensionSettings } from '../shared/types'

import { browser } from 'wxt/browser'

import { DEFAULT_SETTINGS, STORAGE_KEY } from '../shared/constants'

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.local.get(STORAGE_KEY)
  const value = stored[STORAGE_KEY] as ExtensionSettings | undefined
  const settings = {
    ...DEFAULT_SETTINGS,
    ...value,
  }
  if (!settings.token || value?.cloudVideoVision === undefined || value?.audioEars === undefined) {
    // Local pairing seeds this profile's authorized vision preference; explicit popup choices persist.
    try {
      const response = await fetch(new URL('pairing.json', browser.runtime.getURL('/popup.html')))
      if (response.ok) {
        const pairing: unknown = await response.json()
        if (pairing && typeof pairing === 'object') {
          if (!settings.token && 'token' in pairing && typeof pairing.token === 'string')
            settings.token = pairing.token
          if (value?.cloudVideoVision === undefined && 'cloudVideoVision' in pairing)
            settings.cloudVideoVision = pairing.cloudVideoVision === true
          if (value?.audioEars === undefined && 'audioEars' in pairing)
            settings.audioEars = pairing.audioEars === true
        }
      }
    }
    catch {
      // Unpaired builds use the explicit Access Token field in the popup.
    }
  }
  return settings
}

export async function saveSettings(partial: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = {
    ...DEFAULT_SETTINGS,
    ...(await loadSettings()),
    ...partial,
  }

  await browser.storage.local.set({ [STORAGE_KEY]: next })
  return next
}
