import { describe, expect, it } from 'vitest'

import { collectGenres, identifySong, sameSong } from './media-song-memory'

describe('song title evidence', () => {
  it.each([
    'Летний дождь (Live)',
    'ЛЕТНИЙ ДОЖДЬ [Official Music Video]',
    'Artist — «Летний дождь» - Cover',
    'Artist - Летний дождь (адаптация)',
    'Artist - Летний дождь (Jazz Cover)',
    'Artist - Летний дождь (Acoustic Version)',
  ])('recognizes the candidate song in %s', (title) => {
    expect(identifySong(title)?.key).toBe('летний дождь')
    expect(identifySong(title)?.version).toBeTruthy()
  })

  it('preserves unknown subtitles and song names containing live', () => {
    expect(identifySong('Live Forever')?.title).toBe('Live Forever')
    expect(identifySong('Artist - Song (Part Two)')?.key).toBe('song part two')
    expect(sameSong(identifySong('Song')!, identifySong('Song (Part Two)')!)).toBe(false)
    expect(identifySong('!!!')).toBeUndefined()
  })

  it('rejects explicit artist conflicts but permits a declared cover', () => {
    const original = identifySong('Artist One - Rain (Official Video)')!
    expect(sameSong(original, identifySong('Artist Two - Rain (Live)')!)).toBe(false)
    expect(sameSong(original, identifySong('Artist Two - Rain (Cover)')!)).toBe(true)
    expect(sameSong(original, identifySong('Rain (Acoustic)')!)).toBe(true)
  })

  it('collects explicit genres without inferring them from language or speech', () => {
    expect(collectGenres('Летний дождь', ['MUSIC: A Russian vocal with guitar.'])).toEqual([])
    expect(collectGenres('Song', ['SPEECH: An explanation of jazz.'])).toEqual([])
    expect(collectGenres('Pop Smoke - Song (Official Video)', ['MUSIC: A vocal with guitar.'])).toEqual([])
    expect(collectGenres('Jazz cover', ['MUSIC: A jazz arrangement with blues guitar.']).map(genre => genre.name)).toEqual(['jazz', 'blues'])
    expect(collectGenres('Song', ['MUSIC: поп и рок.']).map(genre => genre.name)).toEqual(['rock', 'pop'])
  })
})
