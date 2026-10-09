import { describe, expect, it } from 'vitest'

import { MediaReactions } from './media-reactions'

const page = { site: 'reddit' as const, url: 'https://www.reddit.com/r/example/1', title: 'Example', visibleText: 'A kitten learned to ring a bell.' }
const video = { site: 'youtube' as const, url: 'https://www.youtube.com/watch?v=example', title: 'Example video', isPlaying: true }

describe('shared-tab reactions', () => {
  it('keeps complete captions instead of growing prefixes and ignores bracket-only tags', () => {
    const reactions = new MediaReactions()
    reactions.observeVideo(video)
    for (const text of ['в', 'в эту', 'в эту минуту', 'в эту минуту твоя', 'в эту', '[музыка]', '[applause]'])
      reactions.observeSubtitle({ ...video, text, language: 'ru' }, 0)
    const output = reactions.take(6000)
    expect(output?.text).toBe('в эту минуту твоя')
    expect(output?.captionLanguage).toBe('ru')
  })
  it('does not trigger a text reaction for tags alone', () => {
    const reactions = new MediaReactions()
    reactions.observeVideo(video)
    reactions.observeSubtitle({ ...video, text: '[music] [applause]' }, 0)
    expect(reactions.take(6000)).toBeUndefined()
  })
  it('routes private frames only to the local video source', () => {
    const reactions = new MediaReactions()
    reactions.observeVideo(video)
    reactions.observeFrame({ ...video, capturedAt: 0, width: 480, height: 270, dataUrl: 'data:image/jpeg;base64,YWJj' }, 0)
    const observation = reactions.take(6000, false, true)
    expect(observation?.source).toBe('web-extension-local-video')
    expect(observation?.frames).toEqual(['data:image/jpeg;base64,YWJj'])
  })
  it('reacts to cropped frames without captions only with cloud video vision enabled', () => {
    const reactions = new MediaReactions()
    reactions.observeVideo(video)
    reactions.observeFrame({ ...video, capturedAt: 0, width: 480, height: 270, dataUrl: 'data:image/jpeg;base64,YWJj' }, 0)
    expect(reactions.take(6000)).toBeUndefined()
    const output = reactions.take(6000, true)
    expect(output?.source).toBe('web-extension-cloud-video')
    expect(output?.frames).toEqual(['data:image/jpeg;base64,YWJj'])
    expect(output?.text).toBe('')
  })

  it('discards stale frames and does not forward page text alongside video frames', () => {
    const reactions = new MediaReactions()
    reactions.observePage({ ...page, url: video.url, visibleText: 'PRIVATE_SIDE_PANEL' }, 0)
    reactions.observeVideo(video)
    reactions.observeFrame({ ...video, capturedAt: 0, width: 480, height: 270, dataUrl: 'data:image/jpeg;base64,YWJj' }, 0)
    expect(reactions.take(31_000, true)).toBeUndefined()
    reactions.observeFrame({ ...video, capturedAt: 32_000, width: 480, height: 270, dataUrl: 'data:image/jpeg;base64,YWJj' }, 32_000)
    expect(JSON.stringify(reactions.take(32_001, true))).not.toContain('PRIVATE_SIDE_PANEL')
  })
  it('coalesces new visible text and does not repeat unchanged content', () => {
    const reactions = new MediaReactions()
    reactions.observePage(page, 0)
    expect(reactions.take(5999)).toBeUndefined()
    expect(reactions.take(6000)?.text).toBe(page.visibleText)
    reactions.observePage(page, 7000)
    expect(reactions.take(90_000)).toBeUndefined()
  })

  it('limits changing pages to one reaction every 45 seconds', () => {
    const reactions = new MediaReactions()
    reactions.observePage(page, 0)
    reactions.take(6000)
    reactions.observePage({ ...page, visibleText: 'Another interesting detail.' }, 7000)
    expect(reactions.take(50_999)).toBeUndefined()
    expect(reactions.take(51_000)?.text).toContain('Another')
  })

  it('requires real captions and pauses with the video', () => {
    const reactions = new MediaReactions()
    reactions.observeVideo(video)
    expect(reactions.take(9000)).toBeUndefined()
    reactions.observeSubtitle({ ...video, text: 'The cat opens the door.' }, 9000)
    reactions.observeVideo({ ...video, isPlaying: false })
    expect(reactions.take(20_000)).toBeUndefined()
    reactions.observeVideo(video)
    expect(reactions.take(20_001)?.text).toContain('cat opens')
  })

  it('drops previous-page captions and all state when sharing stops', () => {
    const reactions = new MediaReactions()
    reactions.observeVideo(video)
    reactions.observeSubtitle({ ...video, text: 'PRIVATE_OLD_CAPTION' }, 0)
    reactions.observePage(page, 2000)
    expect(reactions.take(10_000)?.text).not.toContain('PRIVATE_OLD_CAPTION')
    reactions.observePage({ ...page, visibleText: 'New text' }, 11_000)
    reactions.reset()
    expect(reactions.take(90_000)).toBeUndefined()
  })

  it('bounds caption memory and omits stale early lines', () => {
    const reactions = new MediaReactions()
    reactions.observeVideo(video)
    for (let i = 0; i < 20; i++)
      reactions.observeSubtitle({ ...video, text: `Line ${i} ${'x'.repeat(600)}` }, i)
    const output = reactions.take(10_000)
    expect(output?.text.length).toBeLessThanOrEqual(2400)
    expect(output?.text).not.toContain('Line 0 ')
    expect(output?.text).toContain('Line 19 ')
  })
})
