import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'

import { airiTimePeriodKey } from '../libs/media-vision'
import { useMediaWatchMemoryStore } from './media-watch-memory'

describe('time-aware tease allowance', () => {
  it('limits successful teasing across videos and retains one night across midnight', () => {
    setActivePinia(createPinia())
    const memory = useMediaWatchMemoryStore()
    memory.clear()
    memory.enabled = true
    memory.timeAwareTeasing = true
    const afternoon = new Date('2026-10-08T06:00:00Z')
    expect(memory.canTimeTease(afternoon)).toBe(true)
    expect(memory.rememberTimeTease(airiTimePeriodKey(afternoon))).toBe(true)
    expect(memory.canTimeTease(new Date('2026-10-08T08:00:00Z'))).toBe(false)
    expect(memory.rememberTimeTease(airiTimePeriodKey(afternoon))).toBe(false)
    expect(memory.canTimeTease(new Date('2026-10-08T11:00:00Z'))).toBe(true)
    const night = new Date('2026-10-08T14:00:00Z')
    memory.rememberTimeTease(airiTimePeriodKey(night))
    expect(memory.canTimeTease(new Date('2026-10-08T20:00:00Z'))).toBe(false)
    expect(memory.canTimeTease(new Date('2026-10-08T22:00:00Z'))).toBe(true)
    expect(memory.canTimeTease(new Date('2026-10-09T06:00:00Z'))).toBe(true)
    memory.clear()
  })
})

describe('collected music storage', () => {
  it('prioritizes the playlist and retries unsuccessful output without losing new observations', () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const memory = useMediaWatchMemoryStore()
    const previousEnabled = memory.enabled
    const item = { url: 'https://www.youtube.com/watch?v=playlist2', title: 'Artist - Song 2 (Live)', channel: 'Shared channel', isPlaying: true }
    try {
      memory.clear()
      memory.enabled = true
      for (let index = 0; index < 3; index++) {
        const song = { ...item, url: `https://www.youtube.com/watch?v=playlist${index}`, title: `Artist - Song ${index} (Live)` }
        memory.observe(song)
        vi.advanceTimersByTime(30_000)
        memory.observe(song)
      }
      const failed = memory.takeHint(item.url)
      expect(failed?.kind).toBe('playlist')
      expect(memory.takeHint(item.url)).toBeUndefined()
      memory.releaseHint(item.url, failed!)
      vi.advanceTimersByTime(30_000)
      memory.observe(item)
      const retried = memory.takeHint(item.url)
      expect(retried?.kind).toBe('playlist')
      memory.observeMusic(item.url, ['MUSIC: GENRE: jazz.'])
      memory.completeHint(item.url, retried!)
      expect(memory.musicPreferences.genres[0].name).toBe('jazz')
      expect(memory.takeHint(item.url)).toBeUndefined()
      const restored = useMediaWatchMemoryStore(createPinia())
      vi.advanceTimersByTime(120_000)
      restored.observe(item)
      expect(restored.takeHint(item.url)).toBeUndefined()
    }
    finally {
      memory.clear()
      memory.enabled = previousEnabled
      vi.useRealTimers()
    }
  })

  it('persists evidence, stops learning when disabled, and forgets the playlist with history', () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const memory = useMediaWatchMemoryStore()
    const previousEnabled = memory.enabled
    const item = { url: 'https://www.youtube.com/watch?v=storefixture', title: 'Artist - Song (Live)', isPlaying: true }
    try {
      memory.clear()
      memory.enabled = true
      memory.observe(item)
      vi.advanceTimersByTime(30_000)
      memory.observe(item)
      memory.observeMusic(item.url, ['MUSIC: A folk arrangement.'])
      expect(memory.playlist).toHaveLength(1)
      expect(memory.musicPreferences.genres[0].name).toBe('folk')
      memory.enabled = false
      memory.observe({ ...item, url: 'https://www.youtube.com/watch?v=otherfixture' })
      memory.observeMusic(item.url, ['MUSIC: jazz'])
      expect(memory.playlist).toHaveLength(1)
      expect(memory.musicPreferences.genres).toHaveLength(1)
      expect(memory.takeHint(item.url)).toBeUndefined()
      memory.clear()
      expect(memory.playlist).toEqual([])
      expect(memory.musicPreferences.genres).toEqual([])
    }
    finally {
      memory.clear()
      memory.enabled = previousEnabled
      vi.useRealTimers()
    }
  })
})
