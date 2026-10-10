import { conversationToChatMessages } from '@proj-airi/core-agent'
import { describe, expect, it } from 'vitest'

import { airiTimeOfDay, MediaAttention, mediaTimeOfDay } from './media-vision'
import { PrivacyRouter } from './privacy-routing'

const still = 'data:image/jpeg;base64,YWJj'
const changed = 'data:image/jpeg;base64,ZGVm'

describe('co-watching attention policy', () => {
  it('keeps identity and lyrics with an approved time hint, excludes previous replies, and preserves provider isolation', () => {
    const router = new PrivacyRouter({ provider: 'kimi', sessions: {}, cloudHistory: { private: [] } })
    const request = router.captureMedia('time-aware', {
      frames: [still],
      title: 'Игорь Тальков - Память',
      channel: 'Current public channel',
      text: 'в эту минуту',
      captionLanguage: 'ru',
      attention: 'static-music',
      audioObservations: ['MUSIC: VOCALS: sung, Russian. WORDS: в эту минуту. WORDS_CONFIDENCE: clear.'],
      timeOfDay: 'afternoon',
      reactionAngle: 'time-choice',
      recentReplies: ['OLD_FAIRYTALE_ANCHOR'],
    }, 'gemini')
    const context = JSON.stringify(router.mediaConversation(request))
    expect(request.lane).toBe('gemini')
    expect(context).toContain('Игорь Тальков')
    expect(context).toContain('в эту минуту')
    expect(context).toContain('afternoon')
    expect(context).not.toContain('OLD_FAIRYTALE_ANCHOR')
    expect(context).not.toContain('data:image')
    router.complete(request, 'A response')
    expect(router.snapshot().cloudHistory).toEqual({ private: [] })
  })
  it('uses Indochina Time across UTC midnight and ignores the supplied date timezone', () => {
    expect(airiTimeOfDay(new Date('2026-10-07T12:59:00Z'))).toBe('evening')
    expect(airiTimeOfDay(new Date('2026-10-07T13:00:00Z'))).toBe('late-night')
    expect(airiTimeOfDay(new Date('2026-10-07T17:00:00Z'))).toBe('late-night')
    expect(airiTimeOfDay(new Date('2026-10-07T23:00:00Z'))).toBe('morning')
    expect(airiTimeOfDay(new Date('2026-10-07T05:00:00Z'))).toBe('afternoon')
    expect(airiTimeOfDay(new Date('2026-10-06T22:00:00-07:00'))).toBe('afternoon')
  })
  it('uses coarse local periods with clear midnight, morning, daytime, and evening boundaries', () => {
    expect(mediaTimeOfDay(0)).toBe('late-night')
    expect(mediaTimeOfDay(4)).toBe('late-night')
    expect(mediaTimeOfDay(5)).toBe('morning')
    expect(mediaTimeOfDay(6)).toBe('morning')
    expect(mediaTimeOfDay(9)).toBe('daytime')
    expect(mediaTimeOfDay(11)).toBe('daytime')
    expect(mediaTimeOfDay(12)).toBe('afternoon')
    expect(mediaTimeOfDay(16)).toBe('afternoon')
    expect(mediaTimeOfDay(17)).toBe('evening')
    expect(mediaTimeOfDay(18)).toBe('evening')
    expect(mediaTimeOfDay(20)).toBe('late-night')
    expect(mediaTimeOfDay(23)).toBe('late-night')
    expect(() => mediaTimeOfDay(24)).toThrow('valid local clock')
  })
  it('focuses stable music artwork entirely on sound and resets after a visual change or new share', () => {
    const attention = new MediaAttention()
    expect(attention.resolve([still, still], 'music', 1000)).toBe('auto')
    expect(attention.resolve([still, still], 'music', 31_000)).toBe('static-music')
    expect(attention.resolve([still, changed], 'music', 46_000)).toBe('music-video')
    attention.clear()
    expect(attention.resolve([still, still], 'music', 100_000)).toBe('auto')
  })

  it('keeps spoken videos balanced even when the scene is static and avoids guessing mixed audio', () => {
    const attention = new MediaAttention()
    expect(attention.resolve([still, still], 'speech', 1000)).toBe('ordinary-video')
    expect(attention.resolve([still, still], 'speech', 40_000)).toBe('ordinary-video')
    expect(attention.resolve([still, changed], 'mixed', 50_000)).toBe('auto')
    expect(attention.resolve([still, changed], 'unknown', 60_000)).toBe('auto')
  })

  it.each([
    ['static-music', 'Focus 100% on music and lyrics'],
    ['music-video', '80% attention to the music and 20%'],
    ['ordinary-video', '50/50'],
  ] as const)('carries the %s attention policy into the actual cloud conversation', (attention, instruction) => {
    const router = new PrivacyRouter({ provider: 'gemini', sessions: {}, cloudHistory: {} })
    const request = router.captureMedia('reaction', { frames: [still], attention, audioPriority: true, audioObservations: ['MUSIC: A steady bass groove.'] })
    const context = JSON.stringify(router.mediaConversation(request))
    expect(context).toContain(instruction)
    expect(context).toContain('FRESH AUDIO REQUIRED')
    expect(context).not.toContain('PRIVATE current co-watching session')
    if (attention === 'static-music') {
      expect(context).not.toContain('data:image')
      const messages = conversationToChatMessages(router.mediaConversation(request))
      // The production adapter flattens text-only content. The gateway must accept that string representation.
      expect(typeof messages.find(message => message.role === 'user')?.content).toBe('string')
    }
  })
})
