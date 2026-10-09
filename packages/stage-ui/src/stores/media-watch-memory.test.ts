import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

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
