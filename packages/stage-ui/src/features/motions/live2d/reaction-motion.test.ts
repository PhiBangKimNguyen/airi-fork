import { describe, expect, it } from 'vitest'

import { resolveLive2DReactionMotion } from './reaction-motion'

const motions = [
  { motionName: '', motionIndex: 0, fileName: 'motions/wedding_touch.mtn' },
  { motionName: '', motionIndex: 1, fileName: 'motions/touch_3.mtn' },
  { motionName: 'touch', motionIndex: 0, fileName: 'motions/touch_5.mtn' },
  { motionName: 'touch', motionIndex: 1, fileName: 'motions/touch_1.mtn' },
  { motionName: 'touch', motionIndex: 2, fileName: 'motions/touch_4.mtn' },
  { motionName: '', motionIndex: 2, fileName: 'motions/touch_2.mtn' },
]

describe('aK-Alfa reaction motions', () => {
  it('uses actual group indices even when the archive order changes', () => {
    expect(resolveLive2DReactionMotion('akalfa-4601-normal.zip', motions, 'surprised')).toEqual({ group: '', index: 1 })
    expect(resolveLive2DReactionMotion('AK-Alfa.zip', motions, 'curious')).toEqual({ group: 'touch', index: 0 })
    expect(resolveLive2DReactionMotion('ak_alfa.zip', motions, 'awkward')).toEqual({ group: 'touch', index: 1 })
    expect(resolveLive2DReactionMotion('akalfa.zip', motions, 'happy')).toEqual({ group: 'touch', index: 2 })
    expect(resolveLive2DReactionMotion('akalfa.zip', motions, 'think')).toEqual({ group: '', index: 2 })
    expect(resolveLive2DReactionMotion('akalfa.zip', motions, 'angry')).toBeUndefined()
  })

  it('does not assign the profile to unrelated models with the same motion names', () => {
    expect(resolveLive2DReactionMotion('hiyori.zip', motions, 'happy')).toBeUndefined()
  })

  it('leaves idle, missing motions, and unrelated authored animations alone', () => {
    expect(resolveLive2DReactionMotion('akalfa.zip', motions, 'neutral')).toBeUndefined()
    expect(resolveLive2DReactionMotion('akalfa.zip', motions.slice(0, 1), 'happy')).toBeUndefined()
  })
})
