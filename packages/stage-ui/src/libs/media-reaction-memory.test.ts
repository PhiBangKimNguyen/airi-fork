import { describe, expect, it } from 'vitest'

import { MediaReactionMemory } from './media-reaction-memory'
import { PrivacyRouter } from './privacy-routing'

describe('media reaction memory', () => {
  it('accepts a third repeated Japanese ending and hints the ending in the next prompt', () => {
    const memory = new MediaReactionMemory()
    memory.setSession('grant')
    for (const reply of ['あの入り方、いいよね。\n\n(That entrance hits.)', 'この歌詞、沁みるよねー。\n\n(Those lyrics sting.)', 'このピアノ、ずるいよね！\n\n(That piano is unfair.)']) {
      expect(memory.remember('cloud', 'share', 'video', reply)).toBe(true)
      memory.rememberStyle('cloud', reply, false)
    }
    expect(memory.remember('cloud', 'share', 'video', 'また冒険に出る？\n\n(Another adventure?)')).toBe(true)
    const hints = memory.hints('cloud')
    expect(hints.recentEndings).toEqual(['よね'])
    expect(memory.hints('local').recentEndings).toEqual([])
    const router = new PrivacyRouter({ provider: 'gemini', sessions: {}, cloudHistory: {} })
    const url = 'https://www.youtube.com/watch?v=video'
    router.setPublicSharing({ sessionId: 'grant', sharingId: 'share', url, continuity: true, chat: true })
    const request = router.captureMedia('next', { frames: ['data:image/jpeg;base64,YWJj'] }, undefined, { sharingId: 'share', url, recentWords: hints.recentWords, recentEndings: hints.recentEndings })
    expect(JSON.stringify(router.mediaConversation(request))).toContain('Recently used sentence endings, prefer another ending: [\\"よね\\"]')
  })
  it('varies modes and openings without forcing questions, and keeps session words scoped', () => {
    const memory = new MediaReactionMemory()
    memory.setSession('grant')
    const modes = []
    for (let i = 0; i < 5; i++) {
      modes.push(memory.hints('cloud').modeHint)
      expect(memory.hints('cloud').reactionSound).toBe(i % 2 === 0)
      memory.rememberStyle('cloud', '[prosody tone=plain focus=ピアノ]ピアノ、雨みたい。\n\n(That piano sounds like rain.)', false)
    }
    expect(new Set(modes).size).toBe(5)
    expect(memory.hints('cloud').modeHint).not.toBe('heart')
    expect(memory.hints('cloud').recentWords).toContain('ピアノ')
    expect(memory.hints('cloud').recentWords).not.toContain('prosody')
    expect(memory.hints('cloud').recentWords).not.toContain('piano')
    expect(memory.hints('local').recentWords).toEqual([])
    memory.clearVideo()
    expect(memory.hints('cloud').recentWords).toContain('ピアノ')
    memory.setSession('new-grant')
    expect(memory.hints('cloud').recentWords).toEqual([])
    expect(memory.hints('cloud').habitWarm).toBe(true)
    memory.rememberStyle('cloud', 'また聴きたい。\n\n(One more listen.)', true)
    expect(memory.hints('cloud').habitWarm).toBe(false)
    memory.clear()
    expect(memory.hints('cloud').recentWords).toEqual([])
  })
  it('remembers recent comments and suppresses a repeated English translation before speech', () => {
    const memory = new MediaReactionMemory()
    expect(memory.remember('cloud', 'share', 'video', 'かわいいね。\n\n(The cat is cute.)')).toBe(true)
    expect(memory.recent('cloud', 'share', 'video')).toHaveLength(1)
    expect(memory.remember('cloud', 'share', 'video', '猫がかわいい。\n\n(The cat is cute!)')).toBe(false)
    expect(memory.remember('cloud', 'share', 'video', 'ドアを開けた。\n\n(The cat opened the door.)')).toBe(true)
  })

  it('never imports private comments into a cloud video or a new share', () => {
    const memory = new MediaReactionMemory()
    memory.remember('local', 'share', 'video', 'PRIVATE_COMMENT')
    expect(memory.recent('cloud', 'share', 'video')).toEqual([])
    expect(memory.recent('local', 'new-share', 'video')).toEqual([])
    expect(memory.recent('local', 'share', 'other-video')).toEqual([])
    memory.clear()
    expect(memory.recent('local', 'share', 'video')).toEqual([])
  })

  it('bounds short-term memory and rejects silence', () => {
    const memory = new MediaReactionMemory()
    expect(memory.remember('cloud', 'share', 'video', '  ')).toBe(false)
    expect(memory.remember('cloud', 'share', 'video', '[prosody tone=plain focus=]')).toBe(false)
    for (let i = 0; i < 10; i++)
      memory.remember('cloud', 'share', 'video', `Comment ${i}`)
    expect(memory.recent('cloud', 'share', 'video')).toHaveLength(6)
    expect(memory.recent('cloud', 'share', 'video')).not.toContain('Comment 0')
  })
})
