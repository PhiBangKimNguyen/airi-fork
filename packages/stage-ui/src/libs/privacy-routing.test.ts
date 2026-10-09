import { describe, expect, it } from 'vitest'

import { isLoopbackUrl, PrivacyRouter } from './privacy-routing'

function setup() {
  const router = new PrivacyRouter({ provider: 'kimi', sessions: {}, cloudHistory: {} })
  const input = { sessionId: 'session', turnId: 'first', text: 'Explain gravity.', privateInput: false, ambient: false, historyExists: false }
  return { router, input }
}

describe('privacy routing', () => {
  it('withholds uncorroborated music lyrics while preserving acoustic evidence', () => {
    const router = new PrivacyRouter({ provider: 'gemini', sessions: {}, cloudHistory: {} })
    const request = router.captureMedia('lyrics', { title: 'Song', text: 'brother and sister', audioObservations: ['MUSIC: INSTRUMENTS: piano. WORDS: brother and sister. WORDS_CONFIDENCE: uncertain.'], frames: ['data:image/jpeg;base64,YWJj'] })
    const prompt = JSON.stringify(router.mediaConversation(request))
    expect(prompt).not.toContain('brother and sister')
    expect(prompt).toContain('piano')
    expect(prompt).toContain('acoustic opinion')
  })

  it('includes only current authorized cloud comments and drops them after revocation', () => {
    const router = new PrivacyRouter({ provider: 'gemini', sessions: {}, cloudHistory: {} })
    const url = 'https://www.youtube.com/watch?v=fixture'
    const owner = { sharingId: 'share', url, recentWords: [], recentEndings: [], recentComments: ['PUBLIC_REACTION'] }
    router.setPublicSharing({ sessionId: 'grant', sharingId: 'share', url, continuity: false, chat: true })
    expect(JSON.stringify(router.mediaConversation(router.captureMedia('no-consent', { frames: ['data:image/jpeg;base64,YWJj'] }, undefined, owner)))).not.toContain('PUBLIC_REACTION')
    router.setPublicSharing({ sessionId: 'grant', sharingId: 'share', url, continuity: true, chat: true })
    const request = router.captureMedia('approved', { frames: ['data:image/jpeg;base64,YWJj'] }, undefined, owner)
    expect(JSON.stringify(router.mediaConversation(request))).toContain('PUBLIC_REACTION')
    router.setPublicSharing()
    expect(JSON.stringify(router.mediaConversation(request))).not.toContain('PUBLIC_REACTION')
  })
  it('uses the configured public brain character without sharing private context', () => {
    const router = new PrivacyRouter({ provider: 'brain', sessions: {}, cloudHistory: {} }, 'PUBLIC_CONFIGURED_CHARACTER')
    const request = router.capture({ sessionId: 'public', turnId: 'turn', text: 'Hello.', privateInput: false, ambient: false, historyExists: false })
    expect(request.lane).toBe('brain')
    expect(JSON.stringify(router.cloudConversation(request))).toContain('PUBLIC_CONFIGURED_CHARACTER')
    const privateRequest = router.capture({ sessionId: 'private', turnId: 'turn', text: 'PRIVATE_SCREEN', privateInput: true, ambient: true, historyExists: false })
    expect(privateRequest.lane).toBe('local')
    expect(() => router.cloudConversation(privateRequest)).toThrow('Private requests')
    const media = router.captureMedia('public-media', { frames: ['data:image/jpeg;base64,YWJj'] })
    expect(JSON.stringify(router.mediaConversation(media))).toContain('PUBLIC_CONFIGURED_CHARACTER')
  })

  it('retains bounded recent history for brain context', () => {
    const router = new PrivacyRouter({ provider: 'brain', sessions: {}, cloudHistory: {} })
    for (let index = 0; index < 10; index++) {
      const request = router.capture({ sessionId: 'public', turnId: String(index), text: `User ${index}`, privateInput: false, ambient: false, historyExists: false })
      router.complete(request, `Reply ${index}`)
    }
    const next = router.capture({ sessionId: 'public', turnId: 'last', text: 'Current request', privateInput: false, ambient: false, historyExists: false })
    const conversation = JSON.stringify(router.cloudConversation(next))
    expect(conversation).toContain('Reply 9')
    expect(conversation).toContain('Current request')
    expect(conversation).not.toContain('Reply 0')
  })

  it('gives a shared user card to cloud chat only, never to local or free Inkling lanes', () => {
    const router = new PrivacyRouter({ provider: 'gemini', sessions: {}, cloudHistory: {} })
    const userProfile = 'USER_CARD_CANARY'
    const cloud = router.capture({ sessionId: 'public', turnId: 'cloud', text: 'Hello.', privateInput: false, ambient: false, historyExists: false, userProfile })
    expect(cloud.userProfile).toBe(userProfile)
    expect(JSON.stringify(router.cloudConversation(cloud).turns[0])).toContain(userProfile)
    const unshared = router.capture({ sessionId: 'public', turnId: 'unshared', text: 'Hello.', privateInput: false, ambient: false, historyExists: false })
    expect(JSON.stringify(router.cloudConversation(unshared))).not.toContain(userProfile)
    const local = router.capture({ sessionId: 'private', turnId: 'local', text: 'Hello.', privateInput: true, ambient: true, historyExists: false, userProfile })
    expect(local.userProfile).toBeUndefined()
    router.switchProvider('inkling')
    const inkling = router.capture({ sessionId: 'public', turnId: 'inkling', text: 'Hello.', privateInput: false, ambient: false, historyExists: false, userProfile })
    expect(JSON.stringify(router.cloudConversation(inkling))).not.toContain(userProfile)
    const media = router.captureMedia('media', { frames: ['data:image/jpeg;base64,YWJj'] }, undefined, undefined, 'gemini')
    expect(JSON.stringify(router.mediaConversation(media))).not.toContain(userProfile)
  })
  it.each(['gemini', 'kimi', 'gemma31', 'gemma26'] as const)('pins the extension video choice to %s independently of typed chat', (provider) => {
    const { router, input } = setup()
    const media = router.captureMedia('selected-video', { frames: ['data:image/jpeg;base64,YWJj'] }, undefined, undefined, provider)
    expect(media.lane).toBe(provider)
    expect(router.capture(input).lane).toBe('kimi')
    router.switchProvider('gemma31')
    expect(media.lane).toBe(provider)
  })

  it('keeps the Inkling synthetic-media policy for the extension video choice', () => {
    const { router } = setup()
    const frames = ['data:image/jpeg;base64,YWJj']
    expect(router.captureMedia('public-video', { frames }, undefined, undefined, 'inkling').lane).toBe('gemini')
    expect(router.captureMedia('synthetic-video', { frames, researchMedia: true }, undefined, undefined, 'inkling').lane).toBe('inkling')
  })

  it('shares approved session continuity and removes it on stop, new grant, or permission revocation', () => {
    const { router } = setup()
    const first = { sessionId: 'tab-grant', sharingId: 'first-video', url: 'https://www.youtube.com/watch?v=first', continuity: true, chat: true }
    router.setPublicSharing(first)
    router.updatePublicIdentity(first.sharingId, first.url, { title: 'First public theme', channel: 'Public channel', privateText: 'PRIVATE_PAGE' })
    const second = { ...first, sharingId: 'second-video', url: 'https://www.youtube.com/watch?v=second' }
    router.setPublicSharing(second)
    router.updatePublicIdentity(second.sharingId, second.url, { title: 'Second public theme' })
    const owner = { sharingId: second.sharingId, url: second.url, recentWords: ['ピアノ'], recentEndings: [] }
    const media = router.captureMedia('transition', { frames: ['data:image/jpeg;base64,YWJj'] }, undefined, owner)
    expect(JSON.stringify(router.mediaConversation(media))).toContain('First public theme')
    expect(JSON.stringify(router.mediaConversation(media))).toContain('ピアノ')
    expect(JSON.stringify(router.snapshot())).not.toContain('public theme')
    const stale = router.captureMedia('stale-owner', { frames: ['data:image/jpeg;base64,YWJj'] }, undefined, { ...owner, sharingId: first.sharingId })
    expect(JSON.stringify(router.mediaConversation(stale))).not.toContain('First public theme')
    router.setPublicSharing({ ...second, continuity: false })
    expect(JSON.stringify(router.mediaConversation(media))).not.toContain('ピアノ')
    router.setPublicSharing({ ...second, sessionId: 'another-grant' })
    expect(JSON.stringify(router.mediaConversation(media))).not.toContain('First public theme')
    router.setPublicSharing()
    expect(JSON.stringify(router.mediaConversation(media))).not.toContain('ピアノ')
  })

  it.each(['kimi', 'gemini'] as const)('gives %s chat only the current public title while active, without durable media history', (provider) => {
    const { router, input } = setup()
    router.switchProvider(provider)
    const share = { sessionId: 'grant', sharingId: 'video', url: 'https://www.youtube.com/watch?v=public', continuity: true, chat: true }
    router.setPublicSharing(share)
    router.updatePublicIdentity(share.sharingId, share.url, { title: 'Current public song', channel: 'Music channel', captions: 'PRIVATE_CAPTION', audio: 'PRIVATE_AUDIO' })
    const chat = router.capture({ ...input, text: 'This song is nice.' })
    const projection = JSON.stringify(router.cloudConversation(chat))
    expect(projection).toContain('Current public song')
    expect(projection).toContain('Music channel')
    expect(projection).not.toContain('PRIVATE_')
    const local = router.capture({ ...input, turnId: 'private', text: '/local Tell me about it.' })
    expect(local.sharedIdentity).toBeUndefined()
    router.setPublicSharing()
    expect(JSON.stringify(router.cloudConversation(chat))).not.toContain('Current public song')
    router.complete(chat, 'A reply mentioning Current public song')
    expect(router.snapshot().cloudHistory).toEqual({})
    const restarted = new PrivacyRouter(router.snapshot())
    const next = restarted.capture({ ...input, turnId: 'restart', text: '/cloud What is playing?' })
    expect(JSON.stringify(restarted.cloudConversation(next))).not.toContain('Current public song')
  })

  it.each(['https://mail.google.com/mail/u/0/', 'https://www.youtube.com/account', 'https://youtube.com.evil.example/watch?v=x'])('excludes private or unapproved page identity: %s', (url) => {
    const { router, input } = setup()
    router.setPublicSharing({ sessionId: 'grant', sharingId: 'video', url, continuity: true, chat: true })
    router.updatePublicIdentity('video', url, { title: 'PRIVATE_TITLE' })
    expect(JSON.stringify(router.cloudConversation(router.capture(input)))).not.toContain('PRIVATE_TITLE')
  })

  it('keeps shared video ephemeral and separate from private and cloud chat history', () => {
    const { router, input } = setup()
    router.capture({ ...input, text: '/local PRIVATE_MEMORY' })
    const chat = router.capture({ ...input, turnId: 'cloud-chat', text: '/cloud PUBLIC_CHAT' })
    router.complete(chat, 'PUBLIC_REPLY')
    const media = router.captureMedia('video', { title: 'Video fixture', text: 'Caption fixture', frames: ['data:image/jpeg;base64,YWJj'], visibleText: 'PRIVATE_PAGE_TEXT' })
    router.switchProvider('gemini')
    expect(media.lane).toBe('kimi')
    const conversation = JSON.stringify(router.cloudConversation(media))
    expect(conversation).toContain('Caption fixture')
    expect(conversation).toContain('data:image/jpeg;base64,YWJj')
    expect(conversation).not.toContain('PRIVATE_MEMORY')
    expect(conversation).not.toContain('PRIVATE_PAGE_TEXT')
    expect(conversation).not.toContain('PUBLIC_CHAT')
    router.complete(media, 'VIDEO_REPLY')
    expect(JSON.stringify(router.snapshot())).not.toContain('VIDEO_REPLY')
    expect(JSON.stringify(router.snapshot())).not.toContain('data:image')
    expect(router.get('shared-video', 'video')).toBeUndefined()
  })

  it('rejects external image URLs and unbounded observations', () => {
    const { router } = setup()
    expect(() => router.captureMedia('video', { frames: ['https://private.example/image'] })).toThrow('Invalid shared video')
    expect(() => router.captureMedia('video', { frames: Array.from({ length: 3 }).fill('data:image/jpeg;base64,YWJj') })).toThrow('Invalid shared video')
  })
  it('sends new authored text to the selected cloud provider', () => {
    const { router, input } = setup()
    expect(router.capture(input).lane).toBe('kimi')
    router.switchProvider('gemini')
    expect(router.capture({ ...input, turnId: 'second' }).lane).toBe('gemini')
  })

  it.each(['screen', 'clipboard', 'browser', 'files', 'tools', 'proactive'])('keeps %s inputs local even with /cloud', () => {
    const { router, input } = setup()
    expect(router.capture({ ...input, text: '/cloud private observation', privateInput: true }).lane).toBe('local')
  })

  it('keeps private follow-ups local after a clean restart', () => {
    const { router, input } = setup()
    router.capture({ ...input, text: '/local summarize my code' })
    const restarted = new PrivacyRouter(router.snapshot())
    expect(restarted.capture({ ...input, turnId: 'follow-up', text: 'Explain that again.' }).lane).toBe('local')
  })

  it('treats pre-existing and ambient context as private', () => {
    const { router, input } = setup()
    expect(router.capture({ ...input, historyExists: true }).lane).toBe('local')
    expect(router.capture({ ...input, sessionId: 'other', ambient: true }).lane).toBe('local')
  })

  it('builds cloud history solely from captured cloud turns', () => {
    const { router, input } = setup()
    const cloud = router.capture(input)
    router.complete(cloud, 'A public answer.')
    router.capture({ ...input, turnId: 'private', privateInput: true, text: 'PRIVATE_CANARY_123' })
    const next = router.capture({ ...input, turnId: 'next', text: '/cloud Explain stars.' })
    const conversation = JSON.stringify(router.cloudConversation(next))
    expect(conversation).toContain('A public answer.')
    expect(conversation).toContain('Explain stars.')
    expect(conversation).not.toContain('PRIVATE_CANARY_123')
    expect(conversation).not.toContain('runtime-context')
    expect(conversation).not.toContain('toolInvocations":[{')
  })

  it('isolates provider histories and pins queued selections', () => {
    const { router, input } = setup()
    const kimi = router.capture(input)
    router.switchProvider('gemini')
    router.complete(kimi, 'Kimi-only history.')
    const gemini = router.capture({ ...input, turnId: 'gemini' })
    expect(gemini.lane).toBe('gemini')
    expect(JSON.stringify(router.cloudConversation(gemini))).not.toContain('Kimi-only history.')
  })

  it('rejects private cloud projection and erases provenance on deletion', () => {
    const { router, input } = setup()
    const local = router.capture({ ...input, privateInput: true })
    expect(() => router.cloudConversation(local)).toThrow('Private requests')
    router.clear(input.sessionId)
    expect(router.snapshot().sessions).toEqual({})
    expect(router.get(input.sessionId, input.turnId)).toBeUndefined()
  })

  it.each(['https://example.com/v1/', 'http://localhost/v1/', 'http://127.0.0.1.example.com/v1/'])('rejects non-literal private destination %s', (url) => {
    expect(isLoopbackUrl(url)).toBe(false)
  })

  it('accepts literal IPv4 and IPv6 loopback', () => {
    expect(isLoopbackUrl('http://127.0.0.1:11434/v1/')).toBe(true)
    expect(isLoopbackUrl('http://[::1]:1234/v1/')).toBe(true)
  })

  it('keeps observations local with either explicit cloud override', () => {
    const { router, input } = setup()
    expect(router.capture({ ...input, privateInput: true, ambient: true, mode: 'cloud', text: '/cloud browser content' }).lane).toBe('local')
    expect(router.capture({ ...input, turnId: 'paste', privateInput: true, mode: 'cloud' }).lane).toBe('local')
  })

  it('switches authored conversation mode without including private history', () => {
    const { router, input } = setup()
    router.capture({ ...input, mode: 'local', text: 'PRIVATE_MODE_CANARY' })
    const cloud = router.capture({ ...input, turnId: 'cloud', mode: 'cloud' })
    expect(cloud.lane).toBe('kimi')
    expect(JSON.stringify(router.cloudConversation(cloud))).not.toContain('PRIVATE_MODE_CANARY')
    expect(router.capture({ ...input, turnId: 'local', mode: 'local' }).lane).toBe('local')
    expect(router.capture({ ...input, turnId: 'override', mode: 'local', text: '/cloud General question' }).lane).toBe('kimi')
  })

  it('drops available browser context when cloud conversation is explicitly selected', () => {
    const { router, input } = setup()
    expect(router.capture({ ...input, ambient: true }).lane).toBe('local')
    const cloud = router.capture({ ...input, turnId: 'public', ambient: true, mode: 'cloud' })
    expect(cloud.lane).toBe('kimi')
    expect(JSON.stringify(router.cloudConversation(cloud))).toContain('Explain gravity.')
    expect(router.cloudConversation(cloud).turns).toHaveLength(2)
  })
})
