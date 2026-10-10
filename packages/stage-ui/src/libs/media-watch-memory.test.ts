import { describe, expect, it } from 'vitest'

import { MediaWatchMemory, MediaWatchSession } from './media-watch-memory'
import { PrivacyRouter } from './privacy-routing'

const start = new Date('2026-10-01T12:00:00').getTime()
const video = { url: 'https://www.youtube.com/watch?v=fixture1234', title: 'PRIVATE_FAVORITE_VIDEO', channel: 'PRIVATE_FAVORITE_CHANNEL', isPlaying: true }

describe('private co-watching session', () => {
  it('notices a second play in the same session without needing another viewing day', () => {
    const session = new MediaWatchSession()
    for (let seconds = 0; seconds <= 90; seconds += 15)
      session.observe({ ...video, currentTimeSec: seconds, durationSec: 100 }, start + seconds * 1000)
    session.observe({ ...video, currentTimeSec: 4, durationSec: 100 }, start + 105_000)
    const hint = session.takeHint(video.url, start + 105_000)
    expect(hint?.privateText).toContain('"playsThisSession":2')
    expect(hint?.privateText).toContain('PRIVATE_FAVORITE_VIDEO')
    session.completeHint(video.url, hint!, start + 105_000)
    expect(session.takeHint(video.url, start + 120_000)).toBeUndefined()
    const router = new PrivacyRouter({ provider: 'gemini', sessions: {}, cloudHistory: {} })
    const request = router.capture({ sessionId: 'private-session', turnId: 'replay', text: hint!.privateText, privateInput: true, ambient: true, historyExists: false, mode: 'cloud' })
    expect(request.lane).toBe('local')
    expect(() => router.cloudConversation(request)).toThrow('Private requests')
  })

  it('distinguishes a normal rewind from replay and ignores startup near the end', () => {
    const session = new MediaWatchSession()
    session.observe({ ...video, currentTimeSec: 90, durationSec: 100 }, start)
    session.observe({ ...video, currentTimeSec: 2, durationSec: 100 }, start + 1000)
    expect(session.takeHint(video.url, start + 1000)).toBeUndefined()
    session.observe({ ...video, currentTimeSec: 55, durationSec: 100 }, start + 16_000)
    session.observe({ ...video, currentTimeSec: 10, durationSec: 100 }, start + 31_000)
    expect(session.takeHint(video.url, start + 31_000)).toBeUndefined()
  })

  it('notices returning to an engaged video and starts fresh after a long idle gap', () => {
    const session = new MediaWatchSession()
    session.observe(video, start)
    session.observe(video, start + 30_000)
    session.observe({ ...video, url: 'https://www.youtube.com/watch?v=fixture5678' }, start + 31_000)
    session.observe(video, start + 32_000)
    expect(session.takeHint(video.url, start + 32_000)?.privateText).toContain('"playsThisSession":2')
    session.observe(video, start + 31 * 60_000 + 32_000)
    expect(session.takeHint(video.url, start + 31 * 60_000 + 32_000)).toBeUndefined()
  })

  it('infers a tentative channel preference only after engaging with three videos', () => {
    const session = new MediaWatchSession()
    for (let index = 0; index < 3; index++) {
      const item = { ...video, url: `https://www.youtube.com/watch?v=fixture${index}` }
      session.observe(item, start + index * 60_000)
      session.observe(item, start + index * 60_000 + 30_000)
    }
    const hint = session.takeHint('https://www.youtube.com/watch?v=fixture2', start + 150_000)
    expect(hint?.privateText).toContain('"engagedVideosFromChannel":3')
    expect(hint?.privateText).toContain('tentative')
    session.completeHint('https://www.youtube.com/watch?v=fixture2', hint!, start + 150_000)
    expect(session.takeHint('https://www.youtube.com/watch?v=fixture2', start + 160_000)).toBeUndefined()
  })
})

describe('persistent private viewing memory', () => {
  it('rejects a reported paraphrase after a restart and more than six intervening comments', () => {
    const memory = new MediaWatchMemory({ version: 1, videos: [] })
    memory.observe(video, start)
    expect(memory.remember(video.url, 'Looks like a Russian song.')).toBe(true)
    for (let index = 0; index < 10; index++)
      expect(memory.remember(video.url, `Arrangement detail ${index}`)).toBe(true)
    const restored = new MediaWatchMemory(memory.snapshot())
    expect(restored.remember(video.url, 'Ah, this is a Russian song, right?')).toBe(false)
    expect(restored.remember(video.url, 'That piano gives me old-radio nostalgia.')).toBe(true)
  })
  it('remembers replay days, comments, and inferred favorites after a clean reload', () => {
    const memory = new MediaWatchMemory({ version: 1, videos: [] })
    memory.observe(video, start)
    memory.observe(video, start + 15_000)
    expect(memory.takeHint(video.url, start + 15_000)).toBeUndefined()
    expect(memory.remember(video.url, 'またこれ？ (This again?)')).toBe(true)
    const restarted = new MediaWatchMemory(JSON.parse(JSON.stringify(memory.snapshot())))
    restarted.observe(video, start + 24 * 60 * 60_000)
    const hint = restarted.takeHint(video.url, start + 24 * 60 * 60_000)
    expect(hint?.privateText).toContain('"distinctViewingDays":2')
    expect(hint?.privateText).toContain('PRIVATE_FAVORITE_CHANNEL')
    expect(hint?.privateText).not.toContain('This again?')
    expect(restarted.recent(video.url)).toContain('またこれ？ (This again?)')
    expect(restarted.preferences().favorites[0].days).toBe(2)
    expect(restarted.snapshot().videos[0].watchSeconds).toBe(15)
    restarted.completeHint(video.url, hint!, start + 24 * 60 * 60_000)
    expect(restarted.takeHint(video.url, start + 24 * 60 * 60_000 + 45_000)).toBeUndefined()
    expect(restarted.remember(video.url, 'また？ (THIS AGAIN!)')).toBe(false)
  })

  it('routes habit context locally while cloud video context excludes persistent preferences and comments', () => {
    const memory = new MediaWatchMemory({ version: 1, videos: [] })
    memory.observe(video, start)
    memory.observe(video, start + 24 * 60 * 60_000)
    const hint = memory.takeHint(video.url, start + 24 * 60 * 60_000)
    const router = new PrivacyRouter({ provider: 'gemini', sessions: {}, cloudHistory: {} })
    const local = router.capture({ sessionId: 'watch-memory', turnId: 'habit', text: hint!.privateText, privateInput: true, ambient: true, historyExists: false, mode: 'cloud' })
    expect(local.lane).toBe('local')
    expect(() => router.cloudConversation(local)).toThrow('Private requests')
    const publicVideo = router.captureMedia('public', { title: 'Public video', frames: ['data:image/jpeg;base64,YWJj'] })
    expect(JSON.stringify(router.cloudConversation(publicVideo))).not.toContain('PRIVATE_FAVORITE_CHANNEL')
    expect(JSON.stringify(router.cloudConversation(publicVideo))).not.toContain('distinctViewingDays')
  })

  it('does not learn from paused or unshared-domain observations and bounds stored history', () => {
    const memory = new MediaWatchMemory({ version: 1, videos: [] })
    expect(memory.observe({ ...video, isPlaying: false }, start)).toBe(false)
    expect(memory.observe({ ...video, url: 'https://private.example/file' }, start)).toBe(false)
    for (let i = 0; i < 205; i++)
      memory.observe({ ...video, url: `https://www.youtube.com/watch?v=fixture${i}` }, start + i * 1000)
    expect(memory.snapshot().videos).toHaveLength(200)
    expect(memory.snapshot().videos.some(item => item.id === 'fixture0')).toBe(false)
    const empty = new MediaWatchMemory({ invalid: 'PRIVATE_UNTRUSTED_STORAGE' })
    expect(empty.preferences().favorites).toEqual([])
  })
})

describe('collected song versions and genres', () => {
  const song = { ...video, title: 'Artist - Летний дождь (Official Music Video)' }
  const live = { ...video, url: 'https://www.youtube.com/watch?v=livefixture', title: 'Artist - ЛЕТНИЙ ДОЖДЬ (Live)' }

  it('comments on a different upload of the same song after a reload', () => {
    const memory = new MediaWatchMemory({ version: 1, videos: [] })
    memory.observe(song, start)
    memory.observe(song, start + 30_000)
    memory.remember(song.url, 'That chorus again!')
    const restarted = new MediaWatchMemory(memory.snapshot())
    restarted.observe(live, start + 24 * 60 * 60_000)
    expect(restarted.takeHint(live.url, start + 24 * 60 * 60_000)).toBeUndefined()
    restarted.observe(live, start + 24 * 60 * 60_000 + 30_000)
    const hint = restarted.takeHint(live.url, start + 24 * 60 * 60_000 + 30_000)
    expect(hint?.privateText).toContain('PRIVATE song comparison')
    expect(hint?.privateText).toContain(song.title)
    expect(hint?.privateText).toContain(live.title)
    expect(hint?.privateText).not.toContain('That chorus again!')
    expect(restarted.recent(live.url)).toContain('That chorus again!')
    expect(hint?.shared).toBeUndefined()
    expect(restarted.playlist()).toHaveLength(1)
    expect(restarted.playlist()[0].versions).toHaveLength(2)
    expect(restarted.playlist()[0].versions[0].url).toBe(live.url)
    expect(restarted.remember(live.url, 'THAT CHORUS AGAIN!')).toBe(false)
    restarted.completeHint(live.url, hint!, start + 24 * 60 * 60_000 + 30_000)
    expect(restarted.takeHint(live.url, start + 24 * 60 * 60_000 + 60_000)).toBeUndefined()
    const router = new PrivacyRouter({ provider: 'gemini', sessions: {}, cloudHistory: {} })
    const request = router.capture({ sessionId: 'song', turnId: 'comparison', text: hint!.privateText, privateInput: true, ambient: true, historyExists: false, mode: 'cloud' })
    expect(request.lane).toBe('local')
    expect(() => router.cloudConversation(request)).toThrow('Private requests')
  })

  it('matches bare historical titles when the current version supplies music evidence', () => {
    const memory = new MediaWatchMemory({ version: 1, videos: [] })
    memory.observe({ ...song, title: 'Летний дождь' }, start)
    memory.observe({ ...song, title: 'Летний дождь' }, start + 30_000)
    memory.observe(live, start + 60_000)
    memory.observe(live, start + 90_000)
    expect(memory.playlist()[0].versions).toHaveLength(2)
    expect(memory.takeHint(live.url, start + 90_000)?.privateText).toContain('PRIVATE song comparison')
  })

  it('separates homonymous songs with different artists', () => {
    const memory = new MediaWatchMemory({ version: 1, videos: [] })
    memory.observe(song, start)
    memory.observe(song, start + 30_000)
    const other = { ...live, title: 'Different Artist - Летний дождь (Live)' }
    memory.observe(other, start + 60_000)
    memory.observe(other, start + 90_000)
    expect(memory.playlist()).toHaveLength(2)
    expect(memory.takeHint(other.url, start + 90_000)).toBeUndefined()
    const unidentified = { ...video, url: 'https://www.youtube.com/watch?v=barefixture', title: 'Летний дождь (Acoustic)' }
    memory.observe(unidentified, start + 120_000)
    memory.observe(unidentified, start + 150_000)
    expect(memory.playlist()).toHaveLength(3)
    expect(memory.takeHint(unidentified.url, start + 150_000)?.kind).toBe('playlist')
    expect(memory.takeHint(unidentified.url, start + 150_000)?.privateText).not.toContain('PRIVATE song comparison')
  })

  it('aggregates engaged songs once per genre and persists their evidence', () => {
    const memory = new MediaWatchMemory({ version: 1, videos: [] })
    for (const [index, item] of [song, live, { ...video, url: 'https://www.youtube.com/watch?v=othersong1', title: 'Other Song' }, { ...video, url: 'https://www.youtube.com/watch?v=othersong2', title: 'Third Song' }].entries()) {
      const now = start + index * 60_000
      memory.observe(item, now)
      memory.observe(item, now + 30_000)
      memory.observeMusic(item.url, ['MUSIC: A jazz arrangement.'], now + 30_000)
    }
    const restarted = new MediaWatchMemory(memory.snapshot())
    expect(restarted.playlist()).toHaveLength(3)
    expect(restarted.musicPreferences().songs).toBe(3)
    expect(restarted.musicPreferences().genres[0].songs).toBe(3)
    expect(restarted.musicPreferences().genres[0].evidence).toContain('MUSIC: A jazz arrangement.')
    const hint = restarted.takeHint('https://www.youtube.com/watch?v=othersong2', start + 210_000)
    expect(hint?.privateText).toContain('PRIVATE listening preferences')
    expect(hint?.privateText).toContain('jazz')
    expect(hint?.shared).toBeUndefined()
    restarted.completeHint('https://www.youtube.com/watch?v=othersong2', hint!, start + 210_000)
    expect(restarted.takeHint('https://www.youtube.com/watch?v=othersong1', start + 240_000)).toBeUndefined()
  })

  it('leaves unknown genres unclassified and rejects stale or unobserved audio', () => {
    const memory = new MediaWatchMemory({ version: 1, videos: [] })
    expect(memory.observeMusic(video.url, ['MUSIC: jazz'], start)).toBe(false)
    memory.observe({ ...video, isPlaying: false }, start)
    expect(memory.playlist()).toEqual([])
    memory.observe(video, start)
    expect(memory.observeMusic(video.url, ['SPEECH: rock'], start)).toBe(false)
    expect(memory.observeMusic(video.url, ['MUSIC: jazz'], start + 46_000)).toBe(false)
    memory.observe(video, start + 30_000)
    expect(memory.observeMusic(video.url, ['MUSIC: Singing with a guitar.'], start + 30_000)).toBe(true)
    expect(memory.musicPreferences().unknownGenreSongs).toBe(1)
    expect(memory.musicPreferences().genres).toEqual([])
  })

  it('offers a playlist remark with unknown genres and keeps failed attempts available', () => {
    const memory = new MediaWatchMemory({ version: 1, videos: [] })
    for (let index = 0; index < 3; index++) {
      const item = { ...video, url: `https://www.youtube.com/watch?v=unknown${index}`, title: `Artist - Song ${index} (Live)` }
      memory.observe(item, start + index * 60_000)
      memory.observe(item, start + index * 60_000 + 30_000)
    }
    const url = 'https://www.youtube.com/watch?v=unknown2'
    const hint = memory.takeHint(url, start + 150_000)
    expect(hint?.kind).toBe('playlist')
    expect(hint?.privateText).toContain('Song 0')
    expect(hint?.privateText).toContain('"unknownGenreSongs":3')
    expect(memory.musicPreferences().artists).toEqual([{ name: 'artist', songs: 3 }])
    expect(hint?.shared).toBeUndefined()
    expect(new MediaWatchMemory(memory.snapshot()).takeHint(url, start + 160_000)?.kind).toBe('playlist')
    memory.completeHint(url, hint!, start + 160_000)
    expect(new MediaWatchMemory(memory.snapshot()).takeHint(url, start + 170_000)).toBeUndefined()
    memory.observe({ ...video, url, title: 'Artist - Song 2 (Live)' }, start + 760_000)
    expect(new MediaWatchMemory(memory.snapshot()).takeHint(url, start + 760_000)?.kind).toBe('playlist')
  })

  it('does not let an accepted version comparison consume the playlist allowance', () => {
    const memory = new MediaWatchMemory({ version: 1, videos: [] })
    const items = [song, { ...video, url: 'https://www.youtube.com/watch?v=secondmusic', title: 'Other - Second Song (Live)' }, { ...video, url: 'https://www.youtube.com/watch?v=thirdmusic', title: 'Other - Third Song (Live)' }, live]
    for (const [index, item] of items.entries()) {
      memory.observe(item, start + index * 60_000)
      memory.observe(item, start + index * 60_000 + 30_000)
    }
    const hint = memory.takeHint(live.url, start + 210_000)
    expect(hint?.kind).toBe('version')
    memory.completeHint(live.url, hint!, start + 210_000)
    expect(memory.takeHint(live.url, start + 220_000)?.kind).toBe('playlist')
  })
})
// https://github.com/PhiBangKimNguyen/airi-fork/pull/1
// ROOT CAUSE:
// Generated comments entered later prompts as facts. Keep them only for duplicate checks and reject unsupported claims before storage.
describe('grounded watch comments', () => {
  it('rejects incorrect titles and replay claims before saving them', () => {
    const memory = new MediaWatchMemory({ version: 1, videos: [] })
    const url = 'https://www.youtube.com/watch?v=NhINs_fS2Us'
    memory.observe({ url, title: 'Город, которого нет', isPlaying: true }, start)
    expect(memory.remember(url, '「Ladies\' Choice」を聴いてるね。')).toBe(false)
    expect(memory.remember(url, 'この曲を10回も再生したね。')).toBe(false)
    expect(memory.recent(url)).toEqual([])
    expect(memory.remember(url, '「Город, которого нет」って、いい曲だね。')).toBe(true)
  })

  it('removes only the confirmed incorrect comment without changing observations', () => {
    const url = 'https://www.youtube.com/watch?v=NhINs_fS2Us'
    const memory = new MediaWatchMemory({ version: 1, videos: [{ id: 'NhINs_fS2Us', title: 'Город, которого нет', channel: 'Artist', days: ['2026-10-10'], visits: 1, watchSeconds: 235, lastSeen: start, lastHint: 0, comments: ['「Ladies\' Choice」を聴いてるね。', '静かな曲だね。'] }] })
    const before = memory.snapshot().videos[0]
    expect(memory.forgetComment(url, '「Ladies\' Choice」を聴いてるね。')).toBe(true)
    expect(memory.forgetComment(url, '「Ladies\' Choice」を聴いてるね。')).toBe(false)
    expect(memory.snapshot().videos[0]).toEqual({ ...before, comments: ['静かな曲だね。'] })
  })

  it('withholds previous generated claims from later playlist prompts', () => {
    const memory = new MediaWatchMemory({ version: 1, videos: [] })
    for (let index = 0; index < 3; index++) {
      const url = `https://www.youtube.com/watch?v=unknown${index}`
      memory.observe({ url, title: `Artist - Song ${index} (Live)`, isPlaying: true }, start + index * 60_000)
      memory.observe({ url, title: `Artist - Song ${index} (Live)`, isPlaying: true }, start + index * 60_000 + 30_000)
      memory.remember(url, 'REPEATED_COMMENT_CLAIM')
    }
    const url = 'https://www.youtube.com/watch?v=unknown2'
    const hint = memory.takeHint(url, start + 150_000)
    expect(hint?.privateText).not.toContain('REPEATED_COMMENT_CLAIM')
    expect(hint?.evidence.titles).toContain('Artist - Song 2 (Live)')
    expect(memory.recent(url)).toContain('REPEATED_COMMENT_CLAIM')
  })
})
