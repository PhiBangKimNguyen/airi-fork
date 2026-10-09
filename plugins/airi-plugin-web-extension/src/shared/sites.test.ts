import { describe, expect, it } from 'vitest'

import { canFollowYouTubeVideo } from './sites'

describe('following an explicitly shared YouTube tab', () => {
  const current = 'https://www.youtube.com/watch?v=fixtureFirst'
  it('continues to another video, playlist entry, or Short', () => {
    expect(canFollowYouTubeVideo(current, 'https://www.youtube.com/watch?v=fixtureNext&list=playlist')).toBe(true)
    expect(canFollowYouTubeVideo(current, 'https://www.youtube.com/shorts/fixtureNext')).toBe(true)
    expect(canFollowYouTubeVideo(current, current)).toBe(true)
  })
  it.each(['https://accounts.google.com/', 'https://www.youtube.com/account', 'https://www.youtube.com/', 'https://youtube.com.private.example/watch?v=fixtureNext', 'http://www.youtube.com/watch?v=fixtureNext'])('stops at %s', (next) => {
    expect(canFollowYouTubeVideo(current, next)).toBe(false)
  })
  it('cannot turn an unrelated page share into video sharing', () => {
    expect(canFollowYouTubeVideo('https://private.example/', current)).toBe(false)
  })
})
