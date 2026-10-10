import { createPlaybackManager, createSpeechPipeline } from '@proj-airi/pipelines-audio'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'

import { useCharacterStore } from './character'
import { useSpeechRuntimeStore } from './speech-runtime'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('character reaction performance', () => {
  it('sends one emotion through the real speech intent while keeping captions and TTS clean', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const specials: string[] = []
    const requests: string[] = []
    const turns: string[] = []
    const pipeline = createSpeechPipeline<AudioBuffer>({
      playback: createPlaybackManager<AudioBuffer>({ play: async () => {} }),
      tts: async (request) => {
        requests.push(request.text)
        return null
      },
    })
    pipeline.on('onSpecial', segment => specials.push(segment.special!))
    pipeline.on('onTurnEnd', turn => turns.push(turn))
    const speech = useSpeechRuntimeStore()
    await speech.registerHost(pipeline)
    try {
      const character = useCharacterStore()
      character.onSparkNotifyReactionStreamEvent('video-motion', 'えっ！', { emotion: 'surprised' })
      character.onSparkNotifyReactionStreamEvent('video-motion', '\n(Whoa!)', { emotion: 'surprised' })
      character.onSparkNotifyReactionStreamEnd('video-motion', 'えっ！\n(Whoa!)')
      await expect.poll(() => turns).toContain('spark:video-motion')
      expect(specials).toEqual(['<|ACT {"emotion":{"name":"surprised","intensity":1}}|>'])
      expect(requests.join('')).toContain('えっ！')
      expect(requests.join('')).not.toContain('emotion')
      expect(character.reactionCaption).toBe('えっ！\n(Whoa!)')
      expect(character.reactions.at(-1)?.message).toBe('えっ！\n(Whoa!)')
    }
    finally {
      await speech.dispose()
      pinia._s.forEach(store => store.$dispose())
    }
  })
})
