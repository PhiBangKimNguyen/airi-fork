# Social nuance in shared media reactions

Status: implemented, with live listening review pending.

## Context

The October 8 audit found repeated questions about mood, insensitive joke targets, and narrow reaction styles.
The user approved public media continuity and current-title context for cloud chat.
The user kept the current Gemini model and a curious, cheeky personality during the audit.
After repeated Gemini quota failures, the user requested the local Qwen 9B model.

## Decision

Media, habit, and cloud chat prompts share a fixed identity.
This identity matches the lab-born AI character without exporting the private character card.
The user selected AK-Alfa as the default stage model.
Its cozy appearance and five authored tap motions inform the shared personality.
Dry affectionate sass mixes with bashfulness, sleepy whimsy, surprise, and quiet warmth.
The local character card uses the same style.
The five existing tap motions remain visual reactions. This change adds no automatic cloud requests for taps.
Actual tap activity remains machine-derived context and stays local.
The fixed public persona exports no live gestures, private card fields, or model files.

The reaction prompt checks the moment, emotional weight, style, and evidence.
Heavy material changes the joke target.
The prompt permits silence and the character's own feelings.
It removes forced mood questions and named joke phrases.

Style hints vary between wonder, spark, poke, trivia, and heart.
Accepted reactions advance the hints and alternate reaction-sound openings.
These hints guide generation. They do not classify the resulting sentence.
The prompt limits consecutive heart reactions and keeps questions about the work rare.

Replay-habit hints alternate warm acknowledgment and light teasing.
The existing replay counts, duplicate guards, and time-period limits remain active.
English translations preserve the tone, whether playful or sincere.
Unknown speech tone tags map to plain and never reach spoken audio.

## Public continuity boundary

The extension creates one session ID for an explicitly shared tab.
YouTube navigation changes the video correlation ID and retains the session ID.
Stop sharing or a new tab grant clears the session.

Two saved controls start disabled in a new profile.
The current user approved enabling both controls.

- Remember public video transitions during sharing.
- Give cloud chat the current shared video title.

Only an active public YouTube watch page supplies this context.
Media requests receive the previous title and at most 16 content words from three accepted cloud reactions.
Japanese word segmentation removes speech tags, English translations, and filler words.
Full previous replies remain local.
Private reactions use a separate scope.

Cloud chat receives the current title and channel only.
It receives no frames, captions, audio observations, URLs, private history, or viewing-memory records through this feature.
Free Inkling chat receives no public media identity.
Chats with title context remain ephemeral in cloud history, including their generated replies.
The display history stays local.

Title context exists only in RAM.
Stop sharing, private navigation, permission revocation, and application shutdown clear it.
Provider changes preserve the active public identity without importing another provider's chat history.
Request construction checks current ownership again after provider resolution.

An extension without a session ID supplies no title continuity or cloud-chat title context.
Reload the rebuilt extension to activate this contract.

## Timing and captions

Fresh vocal observations can delay a reaction for up to eight seconds from enqueue time.
Instrumental gaps and reported section changes bypass that delay.
The existing observation expiry and stream deadline remain unchanged.
Chunk observations cannot guarantee precise timing at lyric boundaries.
The prompt also permits silence over key lines.

## Local fallback

The current user profile selects LOCAL for conversation and habit reactions.
The LOCAL picker also routes explicitly shared frames and captions through the existing local vision profile.
Selecting LOCAL aborts in-flight media generation and cloud audio observation.
It clears public chat title context and skips the cloud audio wait.
Audio packets remain captured by the extension but cause no hosted audio request in this mode.
The existing Qwen server advertises vision capability.
Both local chat and vision profiles use `qwen3.5:9b-q4_K_M` at `http://127.0.0.1:11434/v1/`.
No Qwen server configuration changed.
Local chat and image probes succeeded in 17.5 and 13.3 seconds.
Local Qwen receives frames, titles, and captions. It has no direct music-audio ears in this configuration.
The user can select GEMINI or KIMI in the same picker later.
This change does not implement automatic provider recovery or periodic hosted retries.

## Caption controls

The main spontaneous transcription bubble disappears after ten seconds of inactivity.
An updated reaction renews this timer. Active speech holds the bubble until speech ends, then starts the timer.
The separate caption window uses one ten-second timer for updates from either speaker.
An empty update clears only its source in that window.
A saved Show transcription bubble control hides the overlay without stopping speech.
Open Chat to reach this control and the public continuity controls.

## Reply length and translation tone

The user reported long replies and literal English translations that lost the character's Japanese tone.
The brain prompt had a thin translation rule and a flat example, 猫だね。 to "A cat."

The gateway now gives all bilingual routes one shared length rule and one shared style rule.
A reply has one or two short spoken sentences. This limit overrides longer character card guidance.
A longer reply is allowed only when the user explicitly asks for an explanation, steps, or code.
The English carries intent, attitude, and rhythm, not dictionary words.
Example pairs show how sentence endings and interjections become English tone.
The prompt says that these pairs guide the translation only, not the Japanese word choice.
The rule also asks for sincere comfort after a failure, loss, or bad news.
The brain and local examples now show a natural translation.

A scratchpad comparison sent eleven chat lines to the configured GLM 4.7 Flash brain with the stand-in public identity.
The previous prompt gave two to four sentences, stage directions, and glosses such as "Your brain melting into Elden Ring ingredients."
The final prompt gave one or two sentences, natural English such as "Cats are cute, but they're a handful. You ready for that?", and a sincere reply to grief.
An earlier draft listed やるじゃない as an example pair. The model reused it in Japanese, so the final pairs use a rarer phrase.
The model still sometimes returns a literal clause or an emoticon.

## Validation

Focused tests cover grant transitions, stop, private URLs, permission revocation, and ephemeral chat replies.
Speech tests cover unknown tone tags and metadata removal.
Caption tests cover inactivity renewal, streaming replacement, and timer disposal.

The audit's recorded Arm B2 sample contains four replies and HTTP 429 failures.
It does not establish the proposed 16-reply quality criteria.
A synthetic evaluation sent fictional media descriptions through the revised production prompt.
The first reply succeeded in 4.3 seconds. The next request returned HTTP 429, so the evaluation stopped.
This sample does not establish the 16-reply quality criteria.
Live capture delivered audio and video packets after the extension reload.
Gemini audio observation returned HTTP 429. No new live reaction arrived during the 55-second check.
Actual canvas clicks started all five motions, from `touch_1.mtn` through `touch_5.mtn`.
Screenshots confirmed the active AK-Alfa model and its authored gestures.
The main transcription bubble passed bilingual display, hide/show persistence, and ten-second inactivity checks.
An application restart retained AK-Alfa, its stage and tap personality, LOCAL selection, caption visibility, and both continuity preferences.
The local connection server reconnected after startup.
Human listening remains necessary to assess social timing and taste.

Full-repository typechecking still encounters workspaces without installed dependencies.
The extension-only typecheck still reports six existing errors in shared UI and UnoCSS.
The desktop and shared stage UI typechecks pass.

Checks completed:

- `pnpm -F @proj-airi/stage-ui exec vitest run` with six related files: 67 tests passed.
- `pnpm -F @proj-airi/stage-tamagotchi exec vitest run --project node` with caption and gateway files: 24 tests passed.
- `pnpm -F @proj-airi/airi-plugin-web-extension exec vitest run`: 21 tests passed.
- `.local/voicevox/venv/Scripts/python.exe scripts/test-voicevox-prosody.py`: six tests passed and one skipped.
- `pnpm -F @proj-airi/stage-ui typecheck`: passed.
- `pnpm -F @proj-airi/stage-tamagotchi typecheck`: passed.
- `pnpm -F @proj-airi/i18n typecheck`: passed.
- `pnpm -F @proj-airi/airi-plugin-web-extension build`: passed.
- `node scripts/prepare-media-extension.mjs`: passed.
- `pnpm lint`: zero errors and 676 existing warnings.
- `pnpm typecheck`: blocked by missing workspace dependencies.
- `pnpm -F @proj-airi/airi-plugin-web-extension exec vue-tsc --noEmit`: six existing shared UI and UnoCSS errors.
- `git diff --check`: passed.

Runtime checks use the owned Electron debugging endpoint. Chrome extension control failed before connecting.

## Audit disposition

N1 through N7 change the identity, emotional weight, question policy, style hints, speech fragments, and tone parsing.
N8 adds approved session continuity.
N9 alternates habit warmth and teasing.
N10 adds approved current-title chat context.
N11 adds bounded timing preferences and a silence rule.

The saved Gemini model remains unchanged. The active response provider is now LOCAL.
This work creates no teacher dataset, training job, or automatic distillation pipeline.
