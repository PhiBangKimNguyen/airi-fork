import { identifySong } from './media-song-memory'
import { normalizeEnglishTitles } from './speech/bilingual-style'
import { speechCaption } from './speech/japanese-reply-speech'

/** Only supplied observations authorize titles and playback claims. Generated comments never supply evidence. */
export interface MediaReactionEvidence {
  titles: readonly string[]
  /** A session loop or return counter, never viewing visits, days, or listening duration. */
  playsThisSession?: number
  lyricLines?: readonly string[]
}

/** Media names retain their supplied spelling. The existing user-approved Ib title translation remains supported. */
export const mediaGroundingPrompt = [
  'Name only works listed in the supplied title fields. Preserve their spelling, including Cyrillic titles.',
  'Use Japanese title brackets for named works. Preserve those names in the English caption.',
  'Use only the configured Ib title translation. Invent no other translated or romanized song name.',
  'Claim replay counts only from playsThisSession. Viewing visits, days, songs, versions, and listening duration are not replay counts.',
  'Without playsThisSession, make no claim about repeated playback.',
  'Treat earlier generated comments as repetition hints, never evidence about titles, counts, lyrics, or user intentions.',
  'Ask no question about hidden meaning in the user\'s listening habits.',
].join(' ')

function identityKey(text: string) {
  return normalizeEnglishTitles(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

const quotedText = /「([^「」\r\n]+)」|『([^『』\r\n]+)』|"([^"\r\n]+)"|“([^“”\r\n]+)”|«([^«»\r\n]+)»/gu
const japaneseDigits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
const englishCounts: Record<string, number> = { once: 1, twice: 2, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 }
const japaneseUnits: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }

function playbackCount(value: string): number | undefined {
  const text = value.normalize('NFKC').toLowerCase()
  if (/^\d+$/.test(text))
    return Number(text)
  if (englishCounts[text] !== undefined)
    return englishCounts[text]
  if (!/^[零〇一二三四五六七八九十百千]+$/u.test(text))
    return undefined
  let count = 0
  let digit = 0
  for (const char of text) {
    const unit = japaneseUnits[char]
    if (unit) {
      count += (digit || 1) * unit
      digit = 0
    }
    else {
      digit = digit * 10 + japaneseDigits[char]
    }
  }
  return count + digit
}

/** Returns the unsupported claim category before a complete media reply can reach captions, speech, or memory. */
export function unsupportedMediaClaim(text: string, evidence: MediaReactionEvidence): 'title' | 'replay' | undefined {
  const caption = speechCaption(text)
  const titles = new Set(evidence.titles.flatMap(title => [
    identityKey(title),
    identityKey(identifySong(title)?.title ?? title),
    ...[...title.matchAll(quotedText)].map(quote => identityKey(quote.slice(1).find(part => part !== undefined) ?? '')),
  ]).filter(Boolean))
  const lyrics = evidence.lyricLines?.map(identityKey)
  for (const quote of caption.matchAll(quotedText)) {
    const quoted = quote.slice(1).find(part => part !== undefined) ?? ''
    const key = identityKey(quoted)
    if (key && !titles.has(key) && !lyrics?.some(line => line.includes(key)))
      return 'title'
  }
  // Quoted names can contain numbers or the word replay. They are identity, not playback claims.
  const dialogue = caption.replace(quotedText, '').normalize('NFKC').toLowerCase()
  const counts = [...dialogue.matchAll(/([\d零〇一二三四五六七八九十百千]+)\s*回|\b([\w-]+)\s*(?:\+\s*)?(?:times|plays|replays)\b|\b(once|twice)\b/gu)]
  const countedPlayback = counts.length > 0 && /再生|[聴聞流]|\b(?:play(?:ed|ing)?|listen(?:ed|ing)?)\b/u.test(dialogue)
  const claim = countedPlayback || /リピート|繰り返し[聴聞流]|何度も(?:聴|聞)|聴き直|聞き直|\b(?:replays?|replayed|replaying|repeats?|repeated|repeating)\b|\bon repeat\b|\b(?:play(?:ed|ing)?|listen(?:ed|ing)?)\b[^.!?\n]+\bagain\b/u.test(dialogue)
  if (!claim)
    return undefined
  if (!evidence.playsThisSession || evidence.playsThisSession < 2)
    return 'replay'
  if (counts.some(match => playbackCount(match[1] ?? match[2] ?? match[3]) !== evidence.playsThisSession))
    return 'replay'
}
