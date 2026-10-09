import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'

import { DEFAULT_SETTINGS, STORAGE_KEY } from '../shared/constants'
import { loadSettings, saveSettings } from './storage'

vi.mock('wxt/browser', () => ({
  browser: { storage: { local: { get: vi.fn(), set: vi.fn() } } },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(browser.storage.local.get).mockImplementation(async () => ({ [STORAGE_KEY]: { ...DEFAULT_SETTINGS, token: 'paired-local-fixture' } }))
  vi.mocked(browser.storage.local.set).mockResolvedValue(undefined)
})

describe('extension cloud video settings', () => {
  it('uses Gemini when the video model has no saved choice', async () => {
    vi.mocked(browser.storage.local.get).mockImplementation(async () => ({ [STORAGE_KEY]: { token: 'paired-local-fixture', cloudVideoVision: false, audioEars: false } }))
    expect((await loadSettings()).cloudVideoProvider).toBe('gemini')
  })

  it('persists the selected video model without changing audio ears', async () => {
    vi.mocked(browser.storage.local.get).mockImplementation(async () => ({ [STORAGE_KEY]: { ...DEFAULT_SETTINGS, token: 'paired-local-fixture', audioEars: true } }))
    const saved = await saveSettings({ cloudVideoVision: true, cloudVideoProvider: 'gemma26' })
    expect(saved.cloudVideoProvider).toBe('gemma26')
    expect(saved.audioEars).toBe(true)
    expect(browser.storage.local.set).toHaveBeenCalledWith({ [STORAGE_KEY]: expect.objectContaining({ cloudVideoVision: true, cloudVideoProvider: 'gemma26', audioEars: true }) })
    vi.mocked(browser.storage.local.get).mockImplementation(async () => ({ [STORAGE_KEY]: saved }))
    expect((await loadSettings()).cloudVideoProvider).toBe('gemma26')
  })
})
