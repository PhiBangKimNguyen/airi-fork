# Shared media reaction quality

Date: 2026-10-08

## Decision

The shared media pipeline uses one reaction personality for Gemini, Kimi, and LOCAL.
AIRI stays curious and cheeky, without invented favorite genres.
Familiar games and music can invite warm nostalgia and gentle questions about the user's mood.
The personality separates these invitations from claims about personal memories or feelings.

The user retains `gemini-3.5-flash-lite` and medium effort.
Optional `GEMINI_MEDIA_MODEL` and `GEMINI_MEDIA_REASONING_EFFORT` affect media reactions only.
Without these overrides, media requests retain the main Gemini configuration.
Media sampling uses temperature 1.05.

## Audit corrections

| Finding | Correction |
| --- | --- |
| F1: generic reactions | Current title, channel, clear lyrics, and confident knowledge can support specific reactions. Evidence-supported angles rotate. |
| F2: intro-based time jokes | Time hints join the ordinary media request. Two observations and at least 30 seconds of scoped audio are required. |
| F3: output anchoring | Perception receives one previous observation. Reaction prompts receive no previous reply text. Duplicate checks stay local. |
| F4: partial captions | Growing prefixes replace earlier prefixes. Bracket tags disappear. Four recent lines and the known language remain. |
| F5: stalled reactions | A 20-second renderer deadline aborts and releases the request. Media gateway requests expire after 30 seconds. |
| F6: repeated phrasing | Angle instructions vary sentence shapes. A local filter rejects a third matching Japanese ending among recent same-video comments. |
| F7: stale description | YouTube page context omits its unverified meta description. Other sites retain their existing description behavior. |

The queue retains only the newest pending media observation for each sharing ID.
Expired media leaves the queue even during another request.
Late stream events and completion cannot restore a canceled reaction or start speech.
Scope changes abort the current media request.

Audio perception describes each chunk independently and corrects earlier errors.
Its compact fields cover vocals, language, instruments, tempo, changes, short audible words, and two mood words.
A short instrumental passage cannot establish an instrumental version of the whole track.
Static music excludes images after classification but retains clear caption lyrics.

## Privacy and memory

Shared media requests contain current authorized media only.
They contain no private chat history, private viewing history, page paragraphs, or tools.
The time hint contains only the coarse Indochina Time period.
The selected approved habit provider owns that time-aware media request without changing general provider selection.
Revoked memory, habit-provider, or time-sharing consent prevents delivery.

Replay and channel-return hints retain the existing bounded count projection.
The ordinary media request retains the current media identity under existing cloud-video consent.
Private media still uses the local provider without cloud fallback.
The once-per-period time-tease limit remains persistent across videos and restarts.

The user replaced the local model with `qwen3.5:9b-q4_K_M`.
Both local profiles use this existing vision-capable model at `http://127.0.0.1:11434/v1/`.
The obsolete 4B vision reference was removed from the ignored AIRI configuration.
The Ollama server and model files remain intact.

## Files changed for this audit

```text
.env.hybrid.example
apps/stage-tamagotchi/scripts/hybrid/gateway.ts
apps/stage-tamagotchi/scripts/hybrid/gateway.test.ts
packages/stage-ui/src/libs/media-vision.ts
packages/stage-ui/src/libs/media-vision.test.ts
packages/stage-ui/src/libs/media-audio.ts
packages/stage-ui/src/libs/media-audio.test.ts
packages/stage-ui/src/libs/media-reaction-memory.ts
packages/stage-ui/src/libs/media-reaction-memory.test.ts
packages/stage-ui/src/libs/privacy-routing.ts
packages/stage-ui/src/stores/ai/chat-llm/llm.ts
packages/stage-ui/src/stores/ai/chat-llm/llm.hybrid.test.ts
packages/stage-ui/src/stores/character/orchestrator/store.ts
packages/stage-ui/src/stores/character/orchestrator/media-scheduling.test.ts
plugins/airi-plugin-web-extension/src/background/media-reactions.ts
plugins/airi-plugin-web-extension/src/background/media-reactions.test.ts
plugins/airi-plugin-web-extension/src/content/index.ts
docs/ai/adr/hybrid-private-inference.md
docs/ai/adr/media-reaction-quality.md
```

The ignored `.env` and desktop character profile contain local configuration changes.
The ignored `.local` contains evaluation scripts, replay outputs, and runtime checks.
No dataset generation or training occurs.

## Evaluation

The user approved 24 Gemini requests using the audit's recorded public titles, captions, and audio descriptions.
The replay used production prompt builders and caption processing.
Images were omitted because the audit retained sizes instead of image data.
The first-chunk time request became an ordinary media reaction because it fails the new readiness rule.

All 24 requests returned HTTP 200 with bilingual replies.
Response times ranged from 2.444 to 4.221 seconds.
The first replay of the seven media cases produced five work-specific, artist-specific, or lyric-specific reactions.
Earlier audio errors remain in this replay because the audit retained no source waveforms.
The initial replay still overused unfairness jokes and rhetorical questions.
The final prompt adds stronger angle and short-chunk instructions.
The local ending filter limits repetition without forwarding earlier reply text.
Broad phrasing diversity remains a model-quality limitation rather than a proven audit acceptance pass.

Three synthetic game-theme checks returned bilingual nostalgic or work-specific replies in 2.642 to 3.332 seconds.
The Ib fixture linked the music box to the game's art gallery.
These fixtures contain invented audio observations, not captured user media.

## Commands and results

```powershell
pnpm -F @proj-airi/stage-ui exec vitest run src/libs/media-vision.test.ts src/libs/media-audio.test.ts src/libs/media-reaction-memory.test.ts src/libs/media-watch-memory.test.ts src/libs/privacy-routing.test.ts src/stores/ai/chat-llm/llm.hybrid.test.ts src/stores/character/orchestrator/media-scheduling.test.ts --maxWorkers=1 --testTimeout=60000
```

The command uses a longer test timeout for cold TypeScript module imports under concurrent local inference.
The separate media deadline test still enforces 20 seconds with a controlled clock.
Result: 64 tests passed, with one skipped without hybrid environment variables.

```powershell
$env:VITE_AIRI_HYBRID_ENABLED='true'
$env:VITE_AIRI_GATEWAY_URL='http://127.0.0.1:18420'
$env:VITE_AIRI_GATEWAY_TOKEN='test-local-token'
pnpm -F @proj-airi/stage-ui exec vitest run src/stores/character/orchestrator/media-scheduling.test.ts
```

Result: all three passed with hybrid routing enabled.

```powershell
pnpm -F @proj-airi/stage-tamagotchi exec vitest run scripts/hybrid/gateway.test.ts
pnpm -F @proj-airi/airi-plugin-web-extension exec vitest run
pnpm -F @proj-airi/airi-plugin-web-extension build
node scripts/prepare-media-extension.mjs
```

Results: 19 gateway tests passed, 21 extension tests passed, and the paired extension built successfully.
The gateway test stalls after SSE headers and verifies stream failure after its deadline.
The renderer test stalls indefinitely and verifies queue recovery and suppression of a late reply.
An isolated Chromium test retained sharing across YouTube navigation and stopped sharing when the tab left YouTube.
The built content script also omitted stale YouTube descriptions across navigation and retained the Reddit description.

```powershell
pnpm -F @proj-airi/stage-ui typecheck
pnpm -F @proj-airi/stage-tamagotchi typecheck
pnpm -F @proj-airi/airi-plugin-web-extension compile
pnpm typecheck
pnpm lint
```

Shared UI and desktop typechecks passed. Root lint passed with existing warnings.
Extension compile retains six shared UI and UnoCSS strict-index errors outside this change.
Root typecheck stops on missing model-driver-mediapipe dependencies and unrelated uninstalled workspaces.

The user reloaded the paired extension.
Chrome control still fails before connecting, so browser automation stopped without a computer-control fallback.
The desktop character profile retains the nostalgic style across sessions.

The seven-minute live check received 62 video updates, six audio packets, and four media triggers.
It produced four bilingual reactions with successful local Japanese speech requests.
The longest sampled processing interval was 11.996 seconds. The pending queue never exceeded one item.
The desktop connection stayed active throughout the check.
Pauses in playback limited the number of reactions available for quality assessment.
This run preceded the final ending filter, which has a focused unit test.

The 9B server returned a short direct request in 15.292 seconds.
Longer bilingual gateway checks timed out after 90 and 120 seconds.
The latest synthetic Kimi request timed out after 35 seconds.
These paths remain configured, but their latency prevents a full successful runtime claim.
No server reconfiguration or cloud fallback occurred.

## Run command

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "F:\Nec Download\Airi\scripts\launch-hybrid.ps1"
```

The desktop shortcut remains `C:\Users\Gaming\Desktop\AIRI.lnk`.
The provider buttons and `/provider kimi`, `/provider gemini`, `/local`, and `/cloud` retain their existing behavior.
The final normal launch runs the desktop, gateway, and local voice service with remote debugging disabled.
The existing Ollama server remains running. The extension reconnects to the desktop after restart.
