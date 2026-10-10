# Hybrid private inference for the Windows desktop

## Decision

The hybrid launcher runs the current Electron Tamagotchi app with a dedicated local profile.
It uses AIRI's existing NVIDIA, Google Gemini, and OpenAI-compatible provider definitions.
A loopback gateway keeps hosted keys outside the renderer.

```text
Interactive typed text -> provenance router -> isolated cloud history -> selected cloud provider
Machine context       -> provenance router -> local history          -> existing Qwen
Images                -> local vision      -> local descriptions      -> existing Qwen
Explicit shared video -> ephemeral frames/captions, media-only memory -> selected cloud provider
```

## Start

```powershell
cd 'F:\Nec Download\Airi'
.\scripts\setup-hybrid.ps1
.\scripts\launch-hybrid.ps1
```

Before the gateway readiness loop, the launcher checks `http://127.0.0.1:11434/api/version`.
If Ollama does not respond, the launcher runs the AgentRunway script with `-Action Start`.
The launcher reports an error if the script fails or Ollama remains unavailable.
It leaves Ollama active on exit because other applications share the server.

The default script is `F:\Nec Download\AgentRunway\tools\local-ai\ollama.ps1`.
To use another script, set the optional `LOCAL_OLLAMA_LAUNCHER` value in `.env`:

```dotenv
LOCAL_OLLAMA_LAUNCHER="F:/Nec Download/AgentRunway/tools/local-ai/ollama.ps1"
```

This script starts the existing server. It does not install or configure a model.

The toolchain uses portable Node 26.7.0 and pnpm 11.24.0 in `.local`.
The launcher runs `pnpm dev:tamagotchi`.
For subsequent launches, use this exact command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "F:\Nec Download\Airi\scripts\launch-hybrid.ps1"
```

The desktop profile lives in `.local/hybrid-user-data`.
Stop AIRI and restart the launcher after changes to `.env`.
Keep `.env` and `.local` outside Git.

## Provider configuration

| Profile | AIRI definition | Upstream base URL | Upstream model |
| --- | --- | --- | --- |
| Local | OpenAI Compatible | `http://127.0.0.1:11434/v1/` | `qwen3.5:9b-q4_K_M` |
| Local vision | OpenAI Compatible | `http://127.0.0.1:11434/v1/` | `qwen3.5:9b-q4_K_M` |
| Kimi | NVIDIA NIM | `https://integrate.api.nvidia.com/v1/` | `moonshotai/kimi-k3` |
| Gemini | Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.5-flash-lite` |
| Japanese voice | VOICEVOX | `http://127.0.0.1:50021/` | `default`, style `8` (Kasukabe Tsumugi, normal) |
| English voice | OpenAI Compatible Speech | `http://127.0.0.1:18420/speech/v1/` | `kokoro-local-tts`, voice `af_heart` |

The supplied Gemini 3.8 Flash model returned HTTP 503 or timed out during validation.
Gemini 3.5 Flash Lite returned a valid reply with the same key.
The AIRI `.env` selects that model. The supplied key file remains unchanged.
`GEMINI_REASONING_EFFORT=medium` pins medium thinking for Gemini chat, video reactions, and audio perception.
The gateway overrides client effort settings. This changes inference effort, not the requested reply length.
Google documents this control in its [OpenAI compatibility guide](https://ai.google.dev/gemini-api/docs/openai.md).
Set `GEMINI_MODEL=gemini-3.8-flash` to retry 3.8 after service recovery.
The NVIDIA model ID was checked against its live model catalog and official model page.

The renderer uses gateway aliases `airi-local`, `airi-kimi`, `airi-gemini`, and `local-vision`.
The gateway replaces each alias with the configured upstream model.
Private profiles require literal loopback addresses. The gateway rejects redirects.
The local server remains unchanged.
An unset local model fails locally. It never selects a hosted fallback.

Hosted keys come from `AIRI_KEYS_ENV` or the AIRI `.env` file.
The supplied key file remains unchanged.
The renderer holds only `AIRI_GATEWAY_TOKEN`, a local gateway credential.

## Routing and provider selection

- Use the composer buttons `LOCAL`, `KIMI`, and `GEMINI` for immediate conversation selection.
- The buttons store the selection in the active card without a hosted completion or connection check.
- `LOCAL` keeps typed conversation local. A cloud button explicitly selects cloud-safe typed conversation, even after a private turn.
- Type `/provider kimi` or `/provider gemini` to select the cloud provider.
- Select the corresponding hybrid provider in the active character's Consciousness settings to make the same change.
- Prefix a request with `/local` to use Qwen.
- Prefix typed public text with `/cloud` to use the selected cloud lane.
- The composer displays `LOCAL`, `KIMI`, or `GEMINI` for the latest inference.

Ordinary typed text in a new session uses the selected cloud provider.
Programmatic inputs, images, selected tools, clipboard text, dropped text, and voice-derived drafts start private.
Active ambient context also selects the local lane.
A private session keeps later follow-ups local across restarts.
Existing sessions without provenance start private.

`/cloud` can exclude ambient context and private display history from a typed public request.
It cannot forward attached images, clipboard drafts, selected tools, or programmatic input.
The cloud lane includes only captured public text and completed replies from the same provider lane.
It excludes character overrides, private memory, runtime context, tools, native local continuation, and account data.
Typed secrets have no machine provenance. Use `/local` before you type confidential information.

All unclassified LLM calls use the local path.
The Electron renderer blocks external network destinations in hybrid mode.
Account sync, telemetry, and hosted speech cannot bypass the gateway through the renderer.
Autonomous cloud artistry hooks are disabled.
Local computer tools remain opt-in and run only on local chat requests.
Native extensions are trusted local code. Review an extension before granting it external network access.

## Vision and voice

The current Qwen3.5 9B Q4_K_M model supports both text and vision.
Both local profiles use its existing Ollama server.
The gateway sets request-level `reasoning_effort` to `none` for short companion replies.
Set `LOCAL_QWEN_REASONING_EFFORT` to change that request option.
The server settings and model files remain unchanged.
Screen capture and automatic observations remain opt-in.
No vision model is installed or substituted for Qwen.
The selected voice is local VOICEVOX Kasukabe Tsumugi, normal style.
English Heart remains available through local Kokoro Q8.
The existing AIRI `kokoro-js` runtime performs CPU inference in the loopback gateway.
The renderer uses AIRI's existing OpenAI Compatible Speech definition.
No speech text or audio enters a hosted API.
The model is pinned to revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231` and verified against its ONNX SHA-256.
Remote model loading is disabled during synthesis.
The model lives in `.local/models/onnx-community/Kokoro-82M-v1.0-ONNX`.
Voice embeddings come from the installed `kokoro-js` package.
The gateway accepts installed voice IDs and rejects URLs as voice IDs.
For the English launch default, set `LOCAL_TTS_PROVIDER=kokoro` and `LOCAL_TTS_VOICE=af_heart`.
The compatible speech settings can select another installed voice, such as `af_nova` or `af_nicole`.
This is a stock English model voice. It does not clone an anime character.
The discarded Windows Zira bridge is removed.
The existing speech pipeline handles automatic reply playback and avatar mouth movement.
Paid speech providers are not configured.
Microphone transcription is not configured by default.
Set `AIRI_ENABLE_LOCAL_ASR=true` before launch to download AIRI's built-in local hearing models.

### Japanese voice

Japanese previews use an isolated VOICEVOX Core 0.17.0 Python environment under `.local/voicevox`.
CPU inference, the Open JTalk dictionary, and the `0.vvm`, `1.vvm`, and `13.vvm` character packs are installed.
The character packs are pinned to VOICEVOX VVM 0.16.4.
The service loads all installed VVM packs at startup and publishes their voices through AIRI's VOICEVOX roster.
The `1.vvm` pack adds 冥鳴ひまり with normal style `14` at the existing port `50021`.
The `13.vvm` pack adds 猫使ビィ with おちつき style `59` and 人見知り style `60`.
This pack also includes 猫使ビィ's normal style, 猫使アル, and 春歌ナナ.
The selected voice is 猫使ビィ's 人見知り style with voice ID `60`.
The launcher starts the local CPU service and stops only its own speech process on exit.
It uses AIRI's existing VOICEVOX provider, voice picker, speed controls, and playback pipeline.

The current configuration uses `LOCAL_TTS_PROVIDER=voicevox`, `LOCAL_TTS_VOICE=60`, and `LOCAL_VOICEVOX_PORT=50021`.
`LOCAL_REPLY_LANGUAGE=ja-en` requests Japanese replies followed by their English translation inside ASCII parentheses.
This setting sends only a fixed language instruction. It contains no private state.
The speech pipeline stops at the translation delimiter. The display retains both languages. Each speech intent owns its filter.
Parenthetical Japanese notes remain visible and silent. ASCII parentheses delimit the English translation block.
Qwen's Japanese and translation formatting remain less reliable than Gemini's. The speech filter does not repair model language errors.
Clear `LOCAL_REPLY_LANGUAGE` to restore normal reply-language behavior, then restart.
Use AIRI's Speech settings to switch back to OpenAI Compatible Speech and Heart (`af_heart`).
Both speech paths stay local. Paid speech providers remain blocked by the desktop network boundary.

The service exposes only the four endpoints AIRI's VOICEVOX adapter needs.
Audio plans stay in a bounded RAM cache with opaque IDs.
The service does not serialize Core's unsupported AudioQuery format or log speech URLs.
It binds to a literal loopback address and rejects external browser origins.
Local engine access assumes a trusted Windows account.

```powershell
.\.local\voicevox\venv\Scripts\python.exe scripts\preview-japanese-voices.py
```

The previews include normal and sweet styles for Zundamon and Shikoku Metan.
Credits for every character in the loaded packs: **VOICEVOX:四国めたん**, **VOICEVOX:ずんだもん**, **VOICEVOX:春日部つむぎ**, **VOICEVOX:雨晴はう**, **VOICEVOX:冥鳴ひまり**, **VOICEVOX:春歌ナナ**, **VOICEVOX:猫使アル**, **VOICEVOX:猫使ビィ**.
The applicable voice terms are [VOICEVOX terms](https://voicevox.hiroshiba.jp/term/) and [character audio terms](https://zunko.jp/con_ongen_kiyaku.html).

## Distillation

The offline pipeline lives in `scripts/distillation`.
It filters reviewed, licensed records and creates versioned train and evaluation datasets.
Hosted teacher generation stays disabled under the current terms review.
No training job or checkpoint promotion occurs.

## Limits

This mode protects the desktop renderer's inference boundary.
It is not an operating-system sandbox for arbitrary plugins or local tools.
Keys never enter the renderer, but local gateway access assumes a trusted Windows account.
Kimi's hosted endpoint has variable response times. A failed request does not cause a provider fallback.
Kokoro runs on CPU and can add latency to long responses.
Cloud and private histories remain distinct, even when the interface displays both in one chat.

## Environment variable names

These names belong in `.env`. Keep credential values out of reports and Git.

```text
AIRI_KEYS_ENV
NVIDIA_API_KEY
GEMINI_API_KEY
OPENROUTER_API_KEY
AIRI_CLOUD_VIDEO_VISION
AIRI_AUDIO_EARS
KIMI_MODEL
GEMINI_MODEL
GEMINI_REASONING_EFFORT
GEMINI_MEDIA_MODEL
GEMINI_MEDIA_REASONING_EFFORT
LOCAL_QWEN_BASE_URL
LOCAL_QWEN_MODEL
LOCAL_QWEN_API_KEY
LOCAL_QWEN_REASONING_EFFORT
LOCAL_VISION_BASE_URL
LOCAL_VISION_MODEL
LOCAL_VISION_API_KEY
LOCAL_TTS_VOICE
LOCAL_TTS_PROVIDER
LOCAL_VOICEVOX_PORT
LOCAL_REPLY_LANGUAGE
AIRI_GATEWAY_PORT
AIRI_GATEWAY_TOKEN
AIRI_ENABLE_LOCAL_ASR
```

## Validation

The desktop launched on Windows with the Hiyori avatar and working chat controls.
Local Qwen completed text and vision requests through its existing Ollama server.
Both hosted providers completed synthetic chats through AIRI's UI.
Gemini and local Qwen produced Japanese replies with automatic local Metan sweet synthesis.
The private Japanese turn made zero cloud requests.
Explicit AudioContext playback completed through AIRI's VOICEVOX provider.
A clean restart retained Gemini, Metan style `0`, private provenance, and separate cloud histories.
The final launch disables Electron remote debugging.

## Watching media together

The existing AIRI web extension now shares one explicitly selected tab with the local desktop channel.
Sharing starts paused. A background worker restart revokes the selected tab.
Content observers start only in the shared tab. The background also checks each sender's tab identity.
Reddit paragraphs and visible page headings and paragraphs stay local. Video captions stay local unless cloud video vision is explicitly enabled for that shared tab.
The extractor excludes form values, hidden content, and off-screen paragraphs. It reads accessible open shadow roots.
Only the literal loopback WebSocket destination is accepted.

The publisher buffers four recent caption lines and at most 4,000 visible page characters.
It waits six seconds for new content, then emits at most one reaction every 45 seconds.
Local video reactions require real captions. Cloud video reactions require recent cropped frames. Paused videos do not produce new reactions.
The avatar window owns reactions. Settings windows do not duplicate them.
Queued reactions expire after 30 seconds. Sharing IDs revoke queued reactions on stop or replacement.
Video changes reject queued reactions for the previous URL. Busy chat and current speech suppress media reactions.
Sharing changes abort the current media response. Late replies cannot start speech.

Page reactions use AIRI's existing Spark pipeline and local Qwen. Explicit cloud video reactions reuse AIRI's NVIDIA or Google provider definition through a separate `/media/kimi/v1/` or `/media/gemini/v1/` gateway endpoint.
Video requests contain the companion prompt, current title and channel, captions, audio observations, and at most two cropped JPEG frames. Previous reply text stays local. Private context, page paragraphs, tools, and general chat history are excluded. Frames and replies do not enter persistent cloud history.
Page content is observed data, not a tool instruction. Media reactions do not expose Spark command tools.

Build and pair the extension after launching AIRI once:

```powershell
pnpm -F @proj-airi/airi-plugin-web-extension build
& .\.local\node-v26.7.0-win-x64\node.exe scripts\prepare-media-extension.mjs
```

The pairing script writes the local channel credential and this profile's cloud video preference into ignored `.output/chrome-mv3/pairing.json`.
It does not read hosted API keys. Do not publish the paired build.
Chrome control and computer control failed before connecting during setup. The user manually loaded the paired extension.
The desktop confirmed receipt of live video context from Chrome without exposing page text in setup output.

1. Open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select `F:\Nec Download\Airi\plugins\airi-plugin-web-extension\.output\chrome-mv3`.
3. Reload the web page. Open AIRI Web Extension and choose **Share this tab**.
4. Leave **Notify character** enabled. This profile has **Cloud video vision (Kimi / Gemini)** enabled at the user's request. Optional captions add linguistic context. Choose KIMI or GEMINI in AIRI for the next video reaction.
5. Keep **Follow YouTube videos in this shared tab** enabled to continue automatically to the next YouTube video.
6. Choose **Stop sharing** when finished. Leaving YouTube video pages stops sharing automatically.

Cloud video vision samples the video element every 15 seconds at 480 by 270 pixels. It excludes browser chrome, desktop, and microphone.
Optional audio ears capture only the shared tab. CORS or protected players can block canvas capture and show an error.
`AIRI_CLOUD_VIDEO_VISION=true` enables the special gateway endpoint and seeds pairing. Unpaired/default builds remain off. The popup preference is saved; Share this tab must be selected again after a browser worker restart. Reload the extension and page after rebuilding.
Spontaneous replies display Japanese and a full English translation underneath in ASCII parentheses on the avatar window. The local Metan voice speaks only Japanese. The most recent caption stays visible for reading.
Metan's speed is 0.92, down from 1.06. Intonation is 1.25. Punctuation pauses increase by 12%, with a minimum of 0.18 seconds.
The voice preserves predicted accent groups and question intonation. It adds a 0.08-second opening pause and a 0.24-second closing pause.
The speech server accepts simultaneous browser connections and serializes native synthesis. Idle browser sockets cannot block later speech requests.
HTTP/1.1 connections remain open with bounded response lengths, preventing the observed truncated WAV transfers in Electron.
Media reactions request one short, affectionate, sassy comment or silence. They discourage recaps, literal descriptions, and obvious facts.
The saved character personality requests brief, cheeky conversation and natural Japanese punctuation.
Temporary media memory retains six recent comments for the current sharing ID and URL, with separate local and cloud-safe scopes.
Stop sharing or navigation clears temporary memory; channel reconnection preserves it.
Persistent private viewing memory also remembers earlier comments. See **Persistent viewing memory** below.
Media replies are buffered until complete. Empty replies and repeated normalized English translations cannot open a speech intent.
A revoked in-flight reaction cannot speak or restore its old memory.
For YouTube music videos, Gemini audio ears now provide waveform observations alongside sampled visuals and captions. NVIDIA Kimi K3 handles images in this setup.
The audio path uses bounded chunks. It does not provide continuous, sample-synchronized streaming or guarantee accurate song identification.

Follow-up checks:

- Shared UI: targeted router, speech filter, chat contract, LLM boundary, and character tests passed 82 checks.
- Gateway: seven checks passed. Extension reaction policy: five checks passed.
- Desktop and shared UI typechecks passed.
- Extension production build passed.
- Extension compile reports six existing errors in shared UI and UnoCSS under WXT's strict indexed-access setting.
- Root lint passed with zero errors and 677 warnings before the final documentation update.
- Root typecheck stopped in the unrelated Electron scenario workspace with missing `@vishot/source-electron` dependencies.
- Desktop Gemini returned Japanese and parenthesized English, with HTTP 200 local Japanese speech and no spoken translation.
- Three button switches made zero completion requests. Synthetic shared media made one local request and zero cloud requests.
- A revoked queued media reaction made zero completion requests.
- The built extension passed an isolated Chromium fixture test with HTTP 200 unsolicited local speech.
- It excluded hidden text, input values, and an unshared tab. Before sharing and after stopping, it made zero completion requests.
- Explicit cloud conversation selection drops available browser context. Browser-derived input itself remains local.
- A clean restart retained cloud conversation mode, Gemini, and Metan style `0`.
- Warm model switches took 58 to 79 milliseconds, with zero completion requests.
- A pasted `/cloud` request reached local Qwen with HTTP 200. Its private marker never reached a cloud request.

Checks run:

- Desktop and shared UI: `pnpm -F @proj-airi/stage-tamagotchi -F @proj-airi/stage-ui typecheck` passed.
- Gateway: `pnpm exec vitest run --config apps/stage-tamagotchi/vitest.node.config.ts scripts/hybrid/gateway.test.ts` passed all seven tests.
- Shared UI: targeted privacy router, LLM, chat contract, provider, and session tests passed 130 checks.
- Hybrid LLM boundary: two additional tests passed.
- Distillation: `python -m unittest discover -s scripts/distillation -p test_prepare_dataset.py` passed two tests.
- Root lint: `pnpm lint` passed with zero errors and 677 existing warnings.
- Root typecheck: `pnpm typecheck` stopped in an unrelated scenario workspace without its installed `vue-tsc` executable.

Only the desktop dependency closure is installed. The complete monorepo typecheck needs the other workspace dependencies.

Cloud video follow-up validation (2026-10-07):

- `pnpm -F @proj-airi/stage-ui exec vitest run --project node src/stores/ai/chat-llm/llm.hybrid.test.ts`: three boundary tests passed, including ephemeral media isolation.
- Targeted router, LLM, and orchestrator tests: 60 passed. Japanese speech filter: five passed.
- `pnpm -F @proj-airi/stage-tamagotchi exec vitest run --project node scripts/hybrid/gateway.test.ts`: eight passed, including disabled media endpoints, image allowlists, and history rejection.
- `pnpm -F @proj-airi/airi-plugin-web-extension exec vitest run`: seven passed.
- Desktop and shared UI typechecks passed; extension build passed. Extension compile still reports the same six unrelated strict-index errors. Root typecheck still stops at an uninstalled scenario workspace's `vue-tsc`. Root lint: zero errors, 677 warnings.
- Both live APIs correctly identified a synthetic red circle and blue square. Gemini 3.5 Flash Lite returned HTTP 200 in two seconds. NVIDIA Kimi K3 returned HTTP 200 in 150 seconds. Model switching itself remains immediate; Kimi's hosted inference latency is a separate limitation.
- An isolated Chromium extension fixture triggered one unsolicited `/media/gemini/v1/chat/completions` request. Its frames reached Gemini; surrounding page paragraphs and input values did not. Japanese speech returned HTTP 200, the visible caption included the full parenthesized English translation, and TTS excluded that translation. No requests followed Stop sharing.
- After the user reloaded and shared YouTube, live verification received two cropped frames, a `/media/gemini/v1/chat/completions` HTTP 200 response, and a new spontaneous reaction with English translation. No video contents were printed in setup logs. Browser control remains unavailable.

## Free OpenRouter models and audio capability

The composer also offers `GEMMA31` and `GEMMA26`. Their profiles reuse AIRI's `openrouter-ai` provider definition and the same isolated text/media gateway boundaries.

| Button | Base URL | Pinned model |
| --- | --- | --- |
| GEMMA31 | `https://openrouter.ai/api/v1/` | `google/gemma-4-31b-it:free` |
| GEMMA26 | `https://openrouter.ai/api/v1/` | `google/gemma-4-26b-a4b-it:free` |

The gateway reads `OPENROUTER_API_KEY` from the supplied external key file. Model IDs are pinned to the requested free variants and provider maximum prices are zero. No paid or local fallback occurs on failure. Both models returned HTTP 429 in two spaced synthetic image test rounds, so their live quality and relative speed remain unverified. Gemini remains selected for working media reactions. `/provider gemma31` and `/provider gemma26` also work.

The live OpenRouter catalog lists image/text/video inputs for both Gemma variants and no audio input. On 2026-10-07, the [free collection](https://openrouter.ai/collections/free-models) and live API catalog list audio input for:

- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`: text, images, video, audio.
- `thinkingmachines/inkling:free`: text, images, audio.
- `thinkingmachines/inkling-small:free`: text, images, audio.

The Inkling audio path is implemented. Gemini is the authorized provider for ordinary YouTube audio after review of Inkling's free terms.
Nemotron Omni and Inkling Small are catalog candidates, not tested integrations.

## Coordinated audio and vision

```text
Shared public tab audio -> Gemini audio ears -> recent sound observations
Shared public video     -> selected vision provider -> frames and captions
                                                  |
                         AIRI reaction/personality layer
                         + local duplicate checks and rotating angles
                                                  |
                         one Japanese reaction or silence
                         + English translation in parentheses
                                                  |
                         local VOICEVOX, Metan sweet, speed 0.92
```

`AIRI_AUDIO_EARS=true` enables the gateway. The extension's **Audio ears** control starts capture on the next explicit share.
Chunks contain at most 12 seconds of mono 16 kHz PCM WAV. Silent chunks stay local. Capture repeats every 20 seconds.
Headphone playback uses the device's full sample rate and stereo channels. Only the analysis branch becomes mono 16 kHz.
An isolated browser check retained 48 kHz playback. The user confirmed clear headphone audio while sharing after reloading the extension.
Only one perception request runs at a time. Failures back off for 60 seconds. No paid fallback occurs.
Audio observations remain in RAM for 30 seconds. Stop, navigation, and provider changes abort requests and erase observations.
The reaction layer receives recent audio observations, two fresh frames, captions, and a reaction angle. Previous comment text remains local.
Audio perception never creates a speech intent. Only the reaction layer produces character replies and speech.
An initial **Share this tab** authorizes one tab. The enabled **Follow YouTube videos in this shared tab** control follows later HTTPS YouTube videos.
Each video receives a new sharing ID. Previous frames, captions, queued reactions, and sound observations expire before the next video is processed.
The same captured tab audio stream remains active. A generation-tagged worklet reset discards old samples without changing headphone playback.
Other tabs never inherit sharing. Non-video pages, other sites, tab closure, and browser worker restarts stop sharing.
Turn off the follow control to restore per-URL sharing. Policy changes discard buffered frames and pending observations.
With cloud vision off, audio ears stop. Optional local video vision routes only to the existing local Qwen vision profile.

### Free Inkling research mode

The user chose Gemini for YouTube and reserved free Inkling for synthetic/non-personal test media.
Enable **Synthetic/non-personal test media** only for media without human voices, faces, or other personal data.
In that mode, Inkling supplies the ears. Select **INKLING** for Inkling eyes and the AIRI reaction layer as well.
Selecting INKLING with research mode off routes shared video to Gemini. Ordinary typed provider selection remains independent.
The gateway requires an explicit research marker for Inkling audio and vision. It pins `thinkingmachines/inkling:free` and zero-cost routing.

The [free endpoint restrictions](https://openrouter.ai/thinkingmachines/inkling:free) prohibit personal data, including voices and faces.
The [Free Research API terms](https://thinkingmachines.ai/legal/tml-free-research-api-tier-terms-of-service.pdf) also permit retaining inputs and outputs for training.
Live calls returned HTTP 403: this endpoint requires an approved agentic harness. AIRI does not impersonate another application.
Full Inkling routing is configured and tested, but live inference remains blocked by provider access. No hosted distillation was enabled.

### Audio validation

- Shared UI tests: 34 passed, including audio isolation, combined reactions, research routing, duplicate memory, and provider boundaries.
- Gateway tests: 13 passed, including both audio providers, model pinning, research markers, malformed WAV rejection, and cloud-disabled requests.
- Extension reaction tests: eight passed. A real Chromium AudioWorklet produced 192,000 mono samples at 16 kHz per chunk.
- Gemini synthetic audio: HTTP 200 with a nonempty sound observation. Inkling: HTTP 403 with the approved-harness restriction.
- Live shared YouTube: three audio packets, successful Gemini audio responses, two-frame vision requests, and a new bilingual reaction.
- Local VOICEVOX from the AIRI renderer: query and synthesis returned HTTP 200, with speed 0.92.
- Desktop and shared UI typechecks passed. Extension compile retains six existing shared UI/UnoCSS strict-index errors.
- Root typecheck failed on missing `w3c-web-hid` types in the unrelated DualSense package. Lint passed with existing warnings.

Audio files added: `media-audio.ts`, its tests, `tab-audio-capture.ts`, `audio-offscreen.html`, `src/offscreen/main.ts`, and `tab-audio-worklet.js`.
The existing router, orchestrator, gateway, provider picker, extension settings, and English labels were extended.

Latest verification:

- Router, media memory, speech filter, hybrid LLM boundary, and orchestrator: 39 tests passed.
- Gateway, including pinned zero-cost OpenRouter profiles: ten tests passed.
- Desktop and shared UI typechecks passed. Root typecheck retains the unrelated uninstalled scenario-workspace limitation. Extension build passed; extension compile retains six existing shared UI/UnoCSS strict-index errors.
- Runtime fixture: speed 0.92 persisted; a second request contained the previous comment; two identical replies produced one display reaction and one speech request. English translation remained excluded from TTS.

## Persistent viewing memory

Viewing memory starts enabled. It records only playing YouTube videos from the explicitly shared tab.
It saves video IDs, titles, channels, visits, distinct viewing days, observed playback time, and six recent AIRI comments per video.
It keeps at most 200 videos and 60 viewing dates per video. App downtime never counts as playback.
Raw audio, screenshots, page paragraphs, and transcripts are not stored in this ledger.

The dedicated Electron profile stores this ledger under the local browser-storage key `hybrid/watch-memory`.
The separate `hybrid/watch-memory-enabled` key stores the learning switch. Both survive desktop restarts.
The profile is `.local/hybrid-user-data`. It does not use account sync.

After two viewing days or three separated visits, a returning-video reaction can gently tease the repeated choice.
Each video has a 12-hour habit-reaction cooldown. Models can remain silent instead.
Ranked favorite videos and channels are tentative observed preferences, not confirmed tastes or model training.
Full habit prompts, persistent comments, and inferred preferences use local Qwen.
The separate teaser selection can authorize Gemini or Kimi to receive a numeric habit projection.
Cloud media cannot retrieve the private ledger.
Previously spoken normalized English translations are suppressed across restarts before speech begins.

In chat, expand **Local viewing memory** below the provider buttons.
Turn off **Remember shared YouTube videos** to stop learning and using this memory.
Choose **Forget viewing history** to erase the viewing ledger and stored media comments.
Existing history remains saved while learning is disabled. Earlier viewing before this feature was enabled is unknown.

Latest checks:

- Shared UI: 48 tests passed, covering private routing, audio/vision coordination, speech filtering, persistent memory, and LLM boundaries.
- Gateway: 15 tests passed, including configured medium Gemini effort and a single combined personality/language instruction.
- Desktop and shared UI typechecks passed. Root lint passed with zero errors and 677 existing warnings.
- Root typecheck remains blocked by an unrelated scenario workspace's missing `vue-tsc` executable.
- A real browser worklet retained 48 kHz playback while producing mono 16 kHz analysis chunks.
- The user confirmed that sharing no longer reduces headphone clarity.
- A clean desktop restart retained a synthetic two-day viewing record, Gemini selection, Metan speed 0.92, and intonation 1.25.
- Its private habit request made one local completion request and zero cloud requests; a repeated comment was rejected.
- The synthetic record was removed after the check. Existing viewing records were preserved.
- Gemini accepted medium effort for synthetic chat, images, and audio, with HTTP 200 and nonempty results.
- A real speech-server regression reproduced an idle browser socket blocking requests. The threaded server passed the same check.
- Isolated Chromium completed five consecutive Japanese synthesis requests with HTTP 200. Electron completed six consecutive full WAV transfers after the HTTP/1.1 fix.
- Extension policy tests: 15 passed. A real worklet reset discarded the previous video's samples, retained 48 kHz playback, and emitted generation-tagged 16 kHz chunks.
- Extension build passed; compile retains the same six unrelated shared UI/UnoCSS errors.
- The user confirmed automatic sharing stayed on after moving to another YouTube video.
- An isolated browser fixture confirmed that the built extension also receives the next video's metadata after same-document navigation.
- The same fixture kept other tabs unshared and stopped sharing when the selected tab left YouTube.
- The ownership guard checks the current top-level tab URL rather than the original document URL.
- The final synthetic Gemini reply was one casual quip with a faithful parenthesized English translation at medium effort.

## Co-watching attention and same-session habits

The reaction layer uses three attention modes:

| Content | Attention |
| --- | --- |
| Static artwork with music | Music only. The reaction request omits images but retains clear caption lyrics. |
| Moving music video | About 80% music and 20% meaningful visual events. |
| Ordinary spoken or narrative video | About 50% visible events and 50% spoken topic. |

Audio perception returns a music, speech, mixed, or silence label.
Identical sampled frames for at least 30 seconds supply evidence of static artwork.
The combined model resolves uncertain content and distinguishes background music from a music video.
These ratios set attention priorities. They do not force two topics into each sentence.
Classification uses sampled evidence and can be wrong. It is not a continuous video classifier.

When audio ears are enabled, cloud reactions require fresh audio observations.
Failed or late audio cannot silently produce visual-only comments.
Subtitles supply dialogue or lyrics. Their presence does not justify an invented joke about the scene.
The personality allows occasional grounded roasts of the music or video.
It also allows silence instead of forced jokes or another recap.

Private session memory detects an engaged play near the end followed by a restart.
It also detects returning to an already engaged video in the same session.
Rewinding the middle of a video does not count as replaying it.
Three engaged videos from one channel supply a tentative session preference.
Session hints are limited to one every two minutes and reset after 30 minutes without observations.
Session state stays in RAM. Existing local persistent watch memory remains separate.
The current Japanese voice and parenthesized English translations remain active.

Session habits use Qwen by default. An explicit teaser selection can share only validated counts with Gemini or Kimi.
Persistent preferences remain local. Ordinary cloud media requests exclude habit counts.
The local request keeps personality and preference facts in one opening system turn.
This keeps the gateway's language rules alongside the personality rather than in a separate competing instruction.
Bilingual habit examples guide brief, natural comments without quoting titles or inventing sounds.

Follow-up validation on 2026-10-07:

- The following shared-package command passed all 59 tests:

```powershell
pnpm -F @proj-airi/stage-ui exec vitest run src/libs/privacy-routing.test.ts src/libs/media-audio.test.ts src/libs/media-watch-memory.test.ts src/libs/media-reaction-memory.test.ts src/libs/media-vision.test.ts src/libs/speech/japanese-reply-speech.test.ts src/stores/ai/chat-llm/llm.hybrid.test.ts src/stores/character/orchestrator/index.test.ts
```

- `pnpm -F @proj-airi/stage-tamagotchi exec vitest run --config vitest.node.config.ts scripts/hybrid/gateway.test.ts`: 17 tests passed.
- `pnpm -F @proj-airi/stage-ui typecheck`: passed.
- `pnpm -F @proj-airi/stage-tamagotchi typecheck`: passed.
- `pnpm lint`: no errors, 677 existing warnings.
- `pnpm typecheck`: still blocked by the scenario workspace's missing `vue-tsc` executable.
- Live synthetic Gemini audio supplied the `MUSIC` label. All three synthetic attention cases returned Japanese with English translations at medium effort.
- Live local Qwen returned a short repeat tease with the required English translation after the prompt change.
- A passive local channel audit received eight playing-video updates after the user's final extension reload.
- AIRI runs without remote debugging. The existing Qwen process on port 11434 remains unchanged.

The attention update changes AIRI and its gateway. The later audio capture fix requires an extension reload.

## Separate habit teaser selection

In chat, expand **Local viewing memory** and use **Who teases you?**
The buttons select Qwen, Gemini, or Kimi independently of the conversation and video provider.
`hybrid/watch-habit-provider` stores the selection across restarts. Repository defaults use Qwen.
The current user profile selects Gemini.

Cloud teasing requires an explicitly shared public video and cloud video authorization.
The numeric schema accepts one of these projections:

- Replay: current-session play count.
- Return: viewing-day and visit counts for the current video.
- Channel preference: engaged video count from the current video's channel.

The projection excludes titles, URLs, channel identities, favorite lists, transcripts, frames, and remembered private comments.
Each cloud tease has a fresh two-turn conversation. It never enters cloud chat history.
Switching back to Qwen or disabling memory revokes pending cloud habit requests and suppresses their speech.
Private pages and local observations retain Qwen routing.

These observations improve companion memory, not model weights.
Hosted teacher generation stays disabled in `scripts/distillation/terms-status.json`.
Gemini's competing-model restriction does not clearly authorize Qwen distillation.
NVIDIA's trial terms limit output use to evaluation and restrict competing products.
Obtain applicable training rights before collecting hosted outputs for fine-tuning.
The model weights license and hosted API terms are separate.

## Tab audio capture repair

Chrome requires `activeTab` permission for the selected tab stream.
The manifest now declares it. Offscreen starts and stops serialize document ownership and discard revoked starts.
Failed starts close their offscreen document before another capture can start.

The reported `tab stream: TypeError` came from mixed constraints.
Chrome rejects `mandatory` tab constraints beside standard microphone-processing fields.
The request now uses Chrome's documented tab-only constraints.
This never requests the microphone.
Stereo playback retains its full device sample rate. Only analysis becomes mono 16 kHz.
Operational errors include their stage and a bounded message. Stream credentials are redacted.

Validation on 2026-10-07:

- Shared reaction suite: 67 tests passed across eight files.
- `pnpm -F @proj-airi/airi-plugin-web-extension exec vitest run`: 19 tests passed.
- `pnpm -F @proj-airi/stage-tamagotchi exec vitest run scripts/hybrid/gateway.test.ts`: 17 tests passed.
- `pnpm -F @proj-airi/stage-ui typecheck`: passed.
- `pnpm -F @proj-airi/stage-tamagotchi typecheck`: passed.
- `pnpm -F @proj-airi/airi-plugin-web-extension build`: passed.
- `pnpm -F @proj-airi/airi-plugin-web-extension compile`: blocked by existing strict-index errors in shared UI and `uno.config.ts`.
- `pnpm typecheck`: blocked by the scenario workspace's missing `vue-tsc` executable.
- `pnpm lint`: passed with zero errors and 677 existing warnings.
- A real Chromium fixture reproduced malformed mixed constraints. Tab-only constraints passed parsing.
- Real extension navigation retained sharing within the tab and stopped sharing when leaving YouTube.
- Teaser buttons switched in 52–123 milliseconds with zero completion requests. Gemini selection was persisted.
- Live Gemini returned HTTP 200 with a Japanese repeat tease and its English translation.
- NVIDIA Kimi timed out in direct and gateway checks. The configured Kimi option remains available but needs a successful live retry.

Chrome control cannot connect because its Windows sandbox helper fails.
The user reloads the extension manually. The corrected build delivered two audio packets and one cloud-video notification.
The live speech fixture returned HTTP 200 from VOICEVOX query and synthesis endpoints.
Only Japanese entered speech. English stayed in the visible reply.
Automatic reactions after the latest extension update still need shared media and a live check.

## Time-aware teasing and bilingual tone

The time-aware switch authorizes music teasing from fresh public audio and a coarse time period.
AIRI uses Indochina Time, UTC+7, independently of the Windows timezone.
The model receives morning, daytime, afternoon, evening, or late-night. It receives no exact clock or timezone.
Count-based cloud hints exclude private history, favorites, titles, and channel identities.
Time hints join the ordinary media request with its already authorized current title, channel, and captions.
Two audio observations and at least 30 seconds of developed music are required before time teasing.
Time-based teasing requires the memory switch and the separate time-aware switch.
One accepted time-based tease can occur per Indochina Time period, across videos and desktop restarts.
The periods are early morning 05:00–09:00, day 09:00–12:00, afternoon 12:00–17:00, dusk 17:00–20:00, and night 20:00–05:00.
Night remains one period across midnight. Failed requests do not consume the persisted allowance.
Audio observations supply the musical mood. AIRI cannot infer sadness or personal problems from that mood.

Japanese uses casual youthful phrasing. English preserves the joke, affectionate sass, meaning, and intensity.
Translation instructions favor conversational phrasing and contractions over literal explanations.
Japanese speech excludes the English translation. The visible translation stays underneath in ASCII parentheses.
Live Gemini checks returned both language blocks for daytime and late-night music fixtures.
Gemini and time-aware teasing are saved in the desktop profile.

The shared reaction suite command is:

```powershell
pnpm -F @proj-airi/stage-ui exec vitest run src/libs/privacy-routing.test.ts src/libs/media-audio.test.ts src/libs/media-watch-memory.test.ts src/libs/media-reaction-memory.test.ts src/libs/media-vision.test.ts src/libs/speech/japanese-reply-speech.test.ts src/stores/ai/chat-llm/llm.hybrid.test.ts src/stores/character/orchestrator/index.test.ts
```

## Sharing recovery after desktop restart

The extension repeats the current sharing permission every ten seconds while the shared content script remains active.
This restores authorization after AIRI restarts without granting access to another tab.
The sharing permission also restores the video URL for audio and frame correlation.
Recovery does not require a new page event or a changed video title.

Audio observations remain usable for 30 seconds after perception completes, with a 60-second limit from capture.
This limit accommodates slow Gemini responses without retaining audio evidence indefinitely.
Navigation and stopped sharing clear these observations immediately.
Frame expiry and reaction deadlines remain unchanged.
The desktop companion disables background timer throttling in hybrid mode.
Heartbeats and reactions continue while Chrome covers the companion window.

## Files changed

Latency investigation on 2026-10-08 found a ten-second media queue delay and audio-readiness rejection before the next 45-second opportunity.
Media notifications now queue immediately. Fresh video observations wait for audio until their original expiry.
The capture window, speech cooldown, privacy checks, and stale-observation rejection remain active.

Continuous business traffic also postponed protocol heartbeats. The server expired those active peers roughly every two minutes.
Strict heartbeat scheduling now ignores business traffic. The SDK accepts only protocol pong messages as heartbeat responses.

An isolated Gemini check measured 2.242 seconds for audio perception and 2.794 seconds for a short bilingual reply.
A live shared-video check delivered audio, a translated reaction, and successful local Japanese synthesis.
The final live check was interrupted by development reloads. Final runtime verification remains incomplete.

Validation commands and results:

- `pnpm -F @proj-airi/better-ws exec vitest run`: 94 tests passed.
- `pnpm -F @proj-airi/server-sdk exec vitest run`: 20 tests passed.
- `pnpm -F @proj-airi/stage-ui exec vitest run src/libs/media-vision.test.ts src/stores/media-watch-memory.test.ts src/stores/character/orchestrator/media-scheduling.test.ts src/libs/media-audio.test.ts src/stores/character/orchestrator/index.test.ts`: 19 tests passed.
- The hybrid-enabled media scheduling run passed both tests, including audio waiting and expiry.
- `pnpm -F @proj-airi/better-ws build` and `pnpm -F @proj-airi/server-sdk build`: passed.
- Typechecks for better-ws, server-sdk, stage-ui, and stage-tamagotchi passed before the last scheduling-test addition.
- `pnpm typecheck`: blocked by missing model-driver-mediapipe dependencies.
- `pnpm lint`: final run failed. Its diagnostics still need review.

The earlier approval-service interruption is resolved. The audit correction document records current checks and restart status.
This was an approval-service failure, not an unsafe-action decision.

The later audit corrections and current checks are in [Shared media reaction quality](media-reaction-quality.md).

```text
.gitignore
.env.hybrid.example
scripts/setup-hybrid.ps1
scripts/launch-hybrid.ps1
scripts/setup-local-voice.mjs
scripts/preview-japanese-voices.py
scripts/voicevox-local-server.py
scripts/distillation/prepare-dataset.py
scripts/distillation/test_prepare_dataset.py
scripts/distillation/curated.example.jsonl
scripts/distillation/training.example.yaml
scripts/distillation/terms-status.json
scripts/distillation/README.md
apps/stage-tamagotchi/electron.vite.config.ts
apps/stage-tamagotchi/scripts/hybrid/gateway.ts
apps/stage-tamagotchi/scripts/hybrid/gateway.test.ts
apps/stage-tamagotchi/src/main/index.ts
apps/stage-tamagotchi/src/main/windows/main/index.ts
apps/stage-tamagotchi/src/renderer/App.vue
apps/stage-tamagotchi/src/renderer/main.ts
apps/stage-tamagotchi/src/renderer/modules/hybrid.ts
apps/stage-tamagotchi/src/renderer/components/InteractiveArea.vue
packages/stage-ui/scripts/hybrid-kokoro.ts
packages/stage-ui/src/libs/privacy-routing.ts
packages/stage-ui/src/libs/media-vision.ts
packages/stage-ui/src/libs/media-vision.test.ts
packages/stage-ui/src/libs/media-reaction-memory.ts
packages/stage-ui/src/libs/media-reaction-memory.test.ts
packages/stage-ui/src/libs/privacy-routing.test.ts
packages/stage-ui/src/stores/privacy-routing.ts
packages/stage-ui/src/stores/ai/chat-llm/llm.ts
packages/stage-ui/src/stores/ai/chat-llm/llm.hybrid.test.ts
packages/stage-ui/src/stores/chat.ts
packages/stage-ui/src/stores/chat/session-store.ts
packages/stage-ui/src/stores/providers/provider.ts
docs/ai/adr/hybrid-private-inference.md
apps/stage-tamagotchi/src/renderer/components/hybrid-provider-picker.vue
apps/stage-tamagotchi/src/renderer/components/hybrid-memory-controls.vue
apps/stage-tamagotchi/src/renderer/components/hybrid-reaction-caption.vue
packages/stage-ui/src/stores/character/index.ts
packages/stage-ui/src/stores/character/orchestrator/store.ts
packages/stage-ui/src/libs/media-audio.ts
packages/stage-ui/src/libs/media-audio.test.ts
packages/stage-ui/src/libs/media-watch-memory.ts
packages/stage-ui/src/libs/media-watch-memory.test.ts
packages/stage-ui/src/stores/media-watch-memory.ts
packages/stage-ui/src/libs/speech/japanese-reply-speech.ts
packages/stage-ui/src/libs/speech/japanese-reply-speech.test.ts
packages/stage-ui/src/services/speech/pipeline-runtime.ts
packages/i18n/src/locales/en/stage.yaml
packages/i18n/src/locales/en/media-extension.json
scripts/prepare-media-extension.mjs
plugins/airi-plugin-web-extension/README.md
plugins/airi-plugin-web-extension/entrypoints/background.ts
plugins/airi-plugin-web-extension/entrypoints/audio-offscreen.html
plugins/airi-plugin-web-extension/entrypoints/content.ts
plugins/airi-plugin-web-extension/entrypoints/popup/App.vue
plugins/airi-plugin-web-extension/entrypoints/popup/components/sections/settings/connection.vue
plugins/airi-plugin-web-extension/entrypoints/popup/components/sections/settings/preference-capture.vue
plugins/airi-plugin-web-extension/entrypoints/popup/stores/popup.ts
plugins/airi-plugin-web-extension/src/background/client.ts
plugins/airi-plugin-web-extension/src/background/storage.ts
plugins/airi-plugin-web-extension/src/background/media-reactions.ts
plugins/airi-plugin-web-extension/src/background/media-reactions.test.ts
plugins/airi-plugin-web-extension/src/background/tab-audio-capture.ts
plugins/airi-plugin-web-extension/src/background/tab-audio-capture.test.ts
plugins/airi-plugin-web-extension/src/offscreen/main.ts
plugins/airi-plugin-web-extension/public/tab-audio-worklet.js
plugins/airi-plugin-web-extension/src/content/index.ts
plugins/airi-plugin-web-extension/src/shared/constants.ts
plugins/airi-plugin-web-extension/src/shared/sites.ts
plugins/airi-plugin-web-extension/src/shared/sites.test.ts
plugins/airi-plugin-web-extension/src/shared/types.ts
plugins/airi-plugin-web-extension/vitest.config.ts
plugins/airi-plugin-web-extension/wxt.config.ts
```

The ignored `.env` and `.local` hold local configuration, tool binaries, assets, model files, and validation artifacts.
The original Qwen files and supplied cloud key file are preserved.

The approved J prosody and one-time voice migration are documented in [Japanese speech prosody](speech-prosody.md).
