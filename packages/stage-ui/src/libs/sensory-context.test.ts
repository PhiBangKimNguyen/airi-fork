import { describe, expect, it } from 'vitest'

import { corroboratedLyrics, normalizeAuditoryObservation, unsupportedLyricClaim } from './sensory-context'

describe('lyric evidence', () => {
  it('withholds guessed words and requires clear audio and matching captions', () => {
    const guessed = 'MUSIC: VOCALS: sung Russian. INSTRUMENTS: piano. WORDS: brother and sister. MOOD: soft.'
    const observation = normalizeAuditoryObservation(guessed)
    expect(observation.summary).not.toContain('brother and sister')
    expect(observation.lyricEvidence).toEqual({ source: 'audio-model', confidence: 'uncertain', text: undefined })
    expect(corroboratedLyrics([guessed], 'brother and sister')).toEqual([])
    const clear = 'MUSIC: WORDS: Летний дождь. WORDS_CONFIDENCE: clear. MOOD: soft.'
    expect(corroboratedLyrics([clear], 'Другие слова')).toEqual([])
    expect(corroboratedLyrics([clear], 'Летний дождь, летний дождь')).toEqual([{ source: 'audio-and-captions', confidence: 'corroborated', text: 'Летний дождь' }])
  })

  it('rejects unsupported lyric claims and retains sound opinions and nostalgia', () => {
    expect(unsupportedLyricClaim('Whoa, \'brother and sister\' are all over the lyrics, huh.', false)).toBe(true)
    expect(unsupportedLyricClaim('Ah, so you\'re singing about brothers and sisters.', false)).toBe(true)
    expect(unsupportedLyricClaim('That piano gives me old-radio nostalgia.', false)).toBe(false)
    expect(unsupportedLyricClaim('This lyric says summer rain.', true)).toBe(false)
  })
})
