import type { StreamingControlEmotion } from '@proj-airi/pipelines-audio'
import type { useLive2dParams } from '@proj-airi/stage-ui-live2d/stores/model-parameters'

type AuthoredMotion = ReturnType<typeof useLive2dParams>['availableMotions'][number]

/** Maps the inspected AK-Alfa touch animations to emotion cues. File names determine indices within the loaded model. */
const akAlfaMotions = {
  awkward: 'touch_1.mtn',
  think: 'touch_2.mtn',
  surprised: 'touch_3.mtn',
  happy: 'touch_4.mtn',
  curious: 'touch_5.mtn',
} satisfies Partial<Record<StreamingControlEmotion, string>>

/**
 * Resolves an AK-Alfa cue against the loaded motion inventory. Other models retain their existing emotion handling.
 * Login, wedding, and wait motions never qualify for automatic reactions.
 */
export function resolveLive2DReactionMotion(modelName: string, motions: readonly AuthoredMotion[], emotion: StreamingControlEmotion): { group: string, index: number } | undefined {
  if (!/(?:^|[/\\])ak[-_ ]?alfa(?:[-_ .]|$)/i.test(modelName) || !(emotion in akAlfaMotions))
    return undefined
  const file = akAlfaMotions[emotion as keyof typeof akAlfaMotions]
  const motion = motions.find(motion => motion.fileName.split(/[/\\]/).at(-1)?.toLowerCase() === file)
  return motion ? { group: motion.motionName, index: motion.motionIndex } : undefined
}
