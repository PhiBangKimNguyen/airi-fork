# Music commentary evidence and memory

Date: 2026-10-09

## Context

Exact text comparison accepted the reported Russian-song paraphrase.
The idle scheduler consumed its long interval before generation succeeded.
New regression tests reproduced both failures before production changes.

YouTube playlist navigation reused the player while the URL and metadata updated separately.
The content observer combined the new URL with the previous rendered title.
The saved sibling lyric claim establishes an output error, but its original input source remains unknown.

## Decisions

`MediaReactionMemory` and `MediaWatchMemory` share a lexical subject filter.
It compares normalized translations, ignores conversational filler, and retains different concrete details.
Each video retains at most 32 comments.
The authorized cloud continuity prompt receives at most eight comments from its current cloud scope.
Private saved comments never enter this projection.

`MediaWatchMemory` groups candidate songs by normalized title and artist evidence.
Version labels distinguish live, cover, adaptation, and official uploads.
Explicit artist conflicts prevent grouping, except for labeled adaptations.
Matching remains tentative because different songs can share a title.
The local playlist links each observed upload and summarizes explicit genre evidence.
Each engaged candidate song counts once per genre.
Unknown genres remain unknown.
Song comparison and genre commentary use local inference.

Audio observations carry a source and word confidence.
Missing confidence remains uncertain.
Music commentary receives lyric lines only when clear audio words agree with current captions.
Uncorroborated words and music captions are withheld from the commentary prompt.
Recognizable unsupported lyric claims are rejected before speech intent creation.
Acoustic opinions and nostalgia remain available.
An agreed short line does not establish the whole song subject.

The YouTube observer requires matching URL, rendered video ID, canonical video ID, and rendered/document titles.
The identity snapshot must remain stable for 500 milliseconds.
The same guard applies to page, video, caption, and frame publication.
Channel lookup stays inside the current watch owner.
Missing or inconsistent metadata prevents publication until a coherent snapshot arrives.

An idle reservation schedules a one-minute retry after the first unsuccessful slot.
Further unsuccessful slots back off to two, four, and eight minutes.
Accepted nonempty speech or a supported hum advances the kind and starts the normal eight-to-twenty-minute interval.
An unsupported standalone hum is skipped in favor of a spoken kind.
The existing five-minute quiet requirement still applies after external activity.
Idle generation does not count as external activity.

Sharing expires after 45 seconds without an extension context heartbeat.
Server-channel disconnect also revokes sharing and aborts its pending generation.
Revocation clears sensory state and public identity before idle scheduling resumes.
The orchestrator exposes current idle blockers and next due time.
Blocker changes produce logs without private content.

The gateway and brain roles share the English rendering policy.
Existential dialogue retains its poetic image and emotional tone.
Figurative 残像 becomes a lingering trace, memory, or presence.
The policy changes English rendering without rewriting Japanese dialogue.

The first policy-only update still delivered literal English after restart.
Its complete Japanese example also appeared in a reported idle line.
Generation prompts now omit that complete example.

For bilingual brain speech, `ModelRoleRouter` renders English in a separate call after dialogue generation.
Only the completed Japanese dialogue enters this request.
History, sensor observations, character instructions, and the draft English remain excluded.
Public replies use the configured reasoning role for English rendering.
If reasoning is absent, the successful dialogue role performs rendering.
Private replies remain on their successful local role, including a local fallback.
The rendering response can replace only the English field.
Japanese dialogue and speech markers remain unchanged.

Each accepted bilingual brain reply adds one rendering call, capped at 512 completion tokens and ten seconds.
Groq Qwen rendering disables thinking, so the short completion budget remains available for English JSON.
This uses the supported instruct mode in [Groq's API contract](https://console.groq.com/docs/api-reference).
Silence and Japanese-only replies require no rendering call.
Cancellation prevents delivery.
If rendering fails or returns invalid English, the original bilingual draft remains available without another provider call.
Other direct gateway providers continue to use the shared prompt policy.

## Limits

Lexical matching does not provide general semantic equivalence.
The bounded comment history still evicts old subjects.
Audio-caption agreement reduces unsupported lyric claims but does not establish lyric accuracy.
The runtime claim filter recognizes specific wording patterns and cannot identify every invented assertion.
Live YouTube DOM changes require another extension verification after markup changes.
Accepted speech intent does not prove successful audio playback.
Prompt guidance does not guarantee translation quality for every model output.
The historical lyric source and idle blocker remain unproven without a recorded failing turn.
The selected brain route and the existing humming voice restriction remain intentional configuration behavior.

## Verification

Regression tests cover reported paraphrases, persistence, lyric evidence, privacy consent, metadata transitions, idle retry, and sharing cleanup.
A browser test covers playlist expansion, upload links, and genre counts.
The pull request records exact commands, results, visual evidence, and remaining runtime gaps.
