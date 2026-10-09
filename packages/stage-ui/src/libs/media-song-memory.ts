/** Title evidence identifies a candidate song, not an audio fingerprint. */
export interface SongIdentity {
  title: string
  key: string
  artist: string
  version: string
  adaptation: boolean
}

/** A genre label retains the quoted title or audio evidence that supplied it. */
export interface GenreEvidence {
  name: string
  evidence: string
}

function isVersionLabel(value: string) {
  const words = value.toLowerCase().trim().split(/\s+/u)
  if (words[0] === 'official' || words[0] === 'original')
    words.shift()
  if (['jazz', 'blues', 'rock', 'pop', 'folk', 'metal', 'acoustic', 'piano', 'orchestral'].includes(words[0]) && words.length > 1) {
    if (words[1] === 'version')
      return true
    words.shift()
  }
  if (['version', 'hd', 'hq', '4k', '1080p'].includes(words.at(-1)!))
    words.pop()
  const label = words.join(' ')
  return ['live', 'cover', 'adaptation', 'remix', 'acoustic', 'концерт', 'кавер', 'адаптация'].some(marker => label === marker || label.startsWith(`${marker} `))
    || ['music video', 'video clip', 'audio', 'video', 'lyric', 'lyrics', 'lyric video', 'visualizer', 'visualiser', 'mv', 'instrumental', 'karaoke', 'клип', 'живая версия'].includes(label)
}

/**
 * Keeps Unicode letters and digits while removing case, spacing, and punctuation differences.
 *
 * @example
 * titleKey('«Летний дождь»')
 * // => 'летний дождь'
 */
function titleKey(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/**
 * Extracts a candidate song title and retains version evidence for commentary.
 * Unknown subtitles remain part of the title to avoid speculative matches.
 *
 * @example
 * identifySong('Artist — Летний дождь (Live)')
 * // => { title: 'Летний дождь', key: 'летний дождь', artist: 'artist', version: 'Live', adaptation: false }
 */
export function identifySong(value: string): SongIdentity | undefined {
  const versions: string[] = []
  let title = value.slice(0, 300).normalize('NFKC').trim()
  title = title.replace(/\(([^()]*)\)|\[([^[\]]*)\]/gu, (match, round: string | undefined, square: string | undefined) => {
    const label = (round ?? square ?? '').trim()
    if (!isVersionLabel(label))
      return match
    versions.push(label)
    return ''
  }).trim()
  const parts = title.split(/\s+[-–—|]\s+/u)
  while (parts.length > 1 && isVersionLabel(parts.at(-1)!))
    versions.push(parts.pop()!)
  let artist = ''
  if (parts.length === 2) {
    artist = titleKey(parts[0])
    title = parts[1]
  }
  else {
    title = parts.join(' - ')
  }
  title = title.replace(/^["'«“]+|["'»”]+$/gu, '').trim()
  const key = titleKey(title)
  if (key.length < 3)
    return undefined
  const version = versions.join(', ')
  const adaptation = versions.some(label => /(?:^|\s)(?:cover|adaptation|remix|кавер|адаптация)(?:\s|$)/iu.test(label))
  return { title, key, artist, version, adaptation }
}

/** Explicit artist conflicts prevent homonymous songs from merging unless a version declares an adaptation. */
export function sameSong(left: SongIdentity, right: SongIdentity) {
  return left.key === right.key && (!left.artist || !right.artist || left.artist === right.artist || left.adaptation || right.adaptation)
}

/**
 * Collects explicit genre words from music evidence. Language and performer identity never imply a genre.
 * Audio summaries remain quoted evidence, not verified classifications.
 */
export function collectGenres(title: string, observations: readonly string[]): GenreEvidence[] {
  const genres = [
    ['rock', 'rock|рок'],
    ['pop', 'pop|поп'],
    ['jazz', 'jazz|джаз'],
    ['blues', 'blues|блюз'],
    ['classical', 'classical|классическая'],
    ['electronic', 'electronic|электронная'],
    ['folk', 'folk|фолк'],
    ['metal', 'metal|метал'],
    ['hip-hop', 'hip[ -]?hop|rap|рэп|хип[ -]?хоп'],
    ['rnb', 'r&b|rhythm and blues'],
    ['country', 'country|кантри'],
    ['reggae', 'reggae|регги'],
    ['soul', 'soul|соул'],
    ['ambient', 'ambient|эмбиент'],
    ['synthwave', 'synthwave|синтвейв'],
    ['soundtrack', 'soundtrack|саундтрек'],
  ]
  const identity = identifySong(title)
  // Performer names, such as Pop Smoke, do not establish a genre.
  const musicTitle = identity ? `${identity.title} ${identity.version}` : title
  const evidence = [musicTitle, ...observations.filter(text => /^MUSIC:/iu.test(text))]
  return genres.flatMap(([name, pattern]) => {
    const expression = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${pattern})(?=$|[^\\p{L}\\p{N}])`, 'iu')
    const source = evidence.find(text => expression.test(text))
    return source ? [{ name, evidence: (source === musicTitle ? title : source).slice(0, 300) }] : []
  })
}
