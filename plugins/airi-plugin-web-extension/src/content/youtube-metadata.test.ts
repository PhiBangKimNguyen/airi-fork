import { describe, expect, it } from 'vitest'

import { YoutubeMetadataGate } from './youtube-metadata'

describe('youTube metadata ownership', () => {
  it('withholds the previous title during playlist navigation and accepts coherent settled metadata', () => {
    const gate = new YoutubeMetadataGate()
    const previous = { url: 'https://www.youtube.com/watch?v=old-video', renderedId: 'old-video', canonicalUrl: 'https://www.youtube.com/watch?v=old-video', title: 'Летний дождь', documentTitle: 'Летний дождь - YouTube' }
    expect(gate.ready(previous, 0)).toBe(false)
    expect(gate.ready(previous, 500)).toBe(true)
    const next = { ...previous, url: 'https://www.youtube.com/watch?v=new-video' }
    expect(gate.ready(next, 1000)).toBe(false)
    expect(gate.ready({ ...next, renderedId: 'new-video' }, 2000)).toBe(false)
    expect(gate.ready({ ...next, renderedId: 'new-video', canonicalUrl: next.url, documentTitle: 'Ib Memory - YouTube' }, 2500)).toBe(false)
    const settled = { ...next, renderedId: 'new-video', canonicalUrl: next.url, title: 'Ib Memory', documentTitle: 'Ib Memory - YouTube' }
    expect(gate.ready(settled, 3000)).toBe(false)
    expect(gate.ready(settled, 3500)).toBe(true)
  })

  it('accepts another upload with the same title only after its own DOM identity settles', () => {
    const gate = new YoutubeMetadataGate()
    const input = { url: 'https://www.youtube.com/watch?v=live-video', renderedId: 'live-video', canonicalUrl: 'https://www.youtube.com/watch?v=live-video', title: 'Летний дождь', documentTitle: 'Летний дождь - YouTube' }
    expect(gate.ready(input, 0)).toBe(false)
    expect(gate.ready(input, 500)).toBe(true)
  })
})
