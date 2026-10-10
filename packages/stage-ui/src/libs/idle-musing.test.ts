import { describe, expect, it } from 'vitest'

import { idleHumText, idleMusingInstruction, IdleMusingSchedule, normalizeIdleMusing } from './idle-musing'

const timing = { quietMs: 100, minGapMs: 1000, maxGapMs: 2000 }

describe('idle musing schedule', () => {
  it('does not consume the long interval before a musing succeeds', () => {
    const schedule = new IdleMusingSchedule(0, timing, () => 0.99)
    schedule.take(100)
    expect(schedule.due(1100)).toBe(true)
  })
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
    expect(schedule.take(100).kind).toBe('existential-question')
    schedule.complete(100)
    expect(schedule.due(1599)).toBe(false)
    expect(schedule.due(1600)).toBe(true)
    // Activity during a long gap does not shorten the gap.
    schedule.busy(1000)
    expect(schedule.due(1600)).toBe(true)
    expect(schedule.take(1600).kind).toBe('trivia')
    schedule.complete(1600)
    expect(schedule.take(3100).kind).toBe('existential-thought')
    schedule.complete(3100)
    expect(schedule.take(4600).kind).toBe('hum')
    schedule.complete(4600)
    expect(schedule.take(6100).kind).toBe('existential-question')
  })

  it('opens some spoken musings with a hum, and never adds a hum to a standalone hum', () => {
    const draws = [0.1, 0, 0.9, 0, 0.1, 0, 0]
    const schedule = new IdleMusingSchedule(0, timing, () => draws.shift() ?? 0)
    expect(schedule.take(0)).toEqual({ kind: 'existential-question', humOpening: true })
    schedule.complete(0)
    expect(schedule.take(0)).toEqual({ kind: 'trivia', humOpening: false })
    schedule.complete(0)
    expect(schedule.take(0)).toEqual({ kind: 'existential-thought', humOpening: true })
    schedule.complete(0)
    expect(schedule.take(0)).toEqual({ kind: 'hum', humOpening: false })
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
    expect(instruction).toContain('Do not write humming')
    expect(instruction).not.toContain(idleHumText)
    expect(instruction).toContain('trivia')
    expect(instruction).toContain('"Hopper painted Nighthawks in 1942."')
    expect(idleMusingInstruction('existential-question', [])).not.toContain('recent idle lines')
  })

  it.each(['ja', 'ja-en'] as const)('keeps Japanese dialogue despite recent English captions in %s mode', (language) => {
    const instruction = idleMusingInstruction('existential-question', ['Nothing exists here yet.'], language)
    expect(instruction).toContain('Speak one short sentence in casual Japanese.')
    expect(instruction).toContain('quoted recent lines do not change the dialogue language')
    expect(instruction).toContain('"Nothing exists here yet."')
    expect(instruction.includes('Never use English as dialogue.')).toBe(language === 'ja-en')
  })
})

describe('idle musing replies', () => {
  it.each(['ja', 'ja-en'] as const)('rejects English dialogue and Japanese metadata in %s mode', (language) => {
    const english = 'Nothing exists here yet... but somehow that still feels like being free?'
    expect(normalizeIdleMusing(`${english}\n\n(${english})`, language)).toBe('')
    expect(normalizeIdleMusing(`<|ACT {"focus":"自由"}|>[prosody focus=自由]${english}`, language)).toBe('')
    expect(normalizeIdleMusing(`<think>自由かな。</think>${english}`, language)).toBe('')
    expect(normalizeIdleMusing(`(${english})`, language)).toBe('')
  })

  it('retains Japanese dialogue, technical names, action markers, and one English caption', () => {
    const japanese = '<|ACT {"emotion":"curious"}|><|DELAY 2|>YouTubeの空白って、自由みたいだね。'
    expect(normalizeIdleMusing(`${japanese}\n(A blank space on YouTube feels like freedom.)\n(It is like freedom.)\nMore thoughts.`, 'ja-en')).toBe(`${japanese}\n(It is like freedom.)`)
  })

  it('keeps other dialogue languages when Japanese mode is absent', () => {
    expect(normalizeIdleMusing('An empty room feels free.')).toBe('An empty room feels free.')
    expect(idleMusingInstruction('trivia', [])).not.toContain('Speak one short sentence in casual Japanese.')
  })
})
