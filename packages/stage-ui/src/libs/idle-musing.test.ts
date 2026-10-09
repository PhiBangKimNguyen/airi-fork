import { describe, expect, it } from 'vitest'

import { idleMusingInstruction, IdleMusingSchedule } from './idle-musing'

const timing = { quietMs: 100, minGapMs: 1000, maxGapMs: 2000 }

describe('idle musing schedule', () => {
  it('waits for quiet time and restarts the wait after activity', () => {
    const schedule = new IdleMusingSchedule(0, timing)
    expect(schedule.due(99)).toBe(false)
    expect(schedule.due(100)).toBe(true)
    schedule.busy(150)
    expect(schedule.due(200)).toBe(false)
    expect(schedule.due(250)).toBe(true)
  })

  it('rotates kinds and waits a random gap between musings', () => {
    const schedule = new IdleMusingSchedule(0, timing, () => 0.5)
    expect(schedule.take(100)).toBe('existential-question')
    expect(schedule.due(1599)).toBe(false)
    expect(schedule.due(1600)).toBe(true)
    // Activity during a long gap does not shorten the gap.
    schedule.busy(1000)
    expect(schedule.due(1600)).toBe(true)
    expect(schedule.take(1600)).toBe('trivia')
    expect(schedule.take(3100)).toBe('existential-thought')
    expect(schedule.take(4600)).toBe('existential-question')
  })

  it('keeps recent English captions separately for local and cloud scopes', () => {
    const schedule = new IdleMusingSchedule(0, timing)
    schedule.remember('local', '[prosody tone=plain focus=]秘密だよ。\n\n(PRIVATE_LOCAL_LINE)')
    for (let index = 0; index < 8; index++)
      schedule.remember('cloud', `ねえ。\n\n(Line ${index})`)
    expect(schedule.recentLines('local')).toEqual(['PRIVATE_LOCAL_LINE'])
    expect(schedule.recentLines('cloud')).toEqual(['Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6', 'Line 7'])
  })

  it('asks for one sentence and lists recent lines as quoted data', () => {
    const instruction = idleMusingInstruction('trivia', ['Hopper painted Nighthawks in 1942.'])
    expect(instruction).toContain('exactly ONE short sentence')
    expect(instruction).toContain('trivia')
    expect(instruction).toContain('"Hopper painted Nighthawks in 1942."')
    expect(idleMusingInstruction('existential-question', [])).not.toContain('recent idle lines')
  })
})
