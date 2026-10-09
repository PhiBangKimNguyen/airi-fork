# Japanese speech prosody

Date: 2026-10-08
Status: Implemented. User listening remains open.

## Decision

The owner accepted up to one second of extra startup delay for complete Japanese sentences.
The owner approved the J reel and requested LLM tone and punch-word tags now.
A one-time profile migration selects 春日部つむぎ, style 8, and applies the four J controls.
Later launches preserve voice selection, provider addresses, and edited speech controls.

## Speech path

The hybrid `ja-en` lane splits at sentence punctuation and line breaks.
Japanese commas, elongated vowels, and hesitation marks stay inside the sentence.
Word limits and opening boosts do not split these sentences.
Explicit flush and special tokens retain their existing behavior.
The speech pipeline still generates upcoming sentences concurrently and plays them in order.
Parenthetical Japanese notes stay visible but remain silent, including `(笑)`, `（笑）`, and mixed-width parentheses.
The filter handles nested notes and notes split across streamed chunks.
Japanese speech resumes after a note. The trailing English translation remains silent.

The local server ports the approved J rules from the speech audit.
The controls are speed 0.9, pitch 0, intonation 1.0, and volume 1.
The plan applies intonation manually, limits the pitch to the range of the style, and rotates ending contours.
The server disables engine question upspeak and raises the real final morae.
At startup, the server calibrates a pitch range for each loaded talk style from the seven audit sentences.
The soft limit is the 95th percentile of the raw voiced log-F0, and the cap is the maximum. Both are rounded to 3 decimals.
This formula gives the approved style 8 range `(6.074, 6.154)`. Style 60 gets about `(5.998, 6.081)`.
Text and plans stay in RAM. The server does not log them.

## Original and J voicing

The hybrid VOICEVOX settings page has a `Use J reel voicing` switch.
On selects J pitch and timing. Off selects the native VOICEVOX plan and engine question upspeak.
The selected speaker, speed, pitch, intonation, and volume stay the same in both modes.
The existing provider configuration owner saves the choice and propagates it across renderer windows.
Changes apply to subsequent synthesis requests. Cached plans retain their original mode until synthesis completes.
Japanese sentence segmentation and silent parenthetical notes apply in both modes.
The server removes prosody tags in both modes. Only J uses their tone and focus values.

The optional `voiceSettings.prosody` field accepts `original` or `j`.
The provider sends an explicit selection as `airi_prosody` on `/audio_query`.
Without this query parameter, AIRI's local server uses J. This is the local server's default protocol policy.
Standard VOICEVOX configuration omits this field and sends the standard engine requests.
The switch is available only for the hybrid VOICEVOX provider.

## Media metadata

Each bilingual media sentence can start with `[prosody tone=KIND focus=WORD]`.
The tone is `sassy`, `curious`, `cheeky`, or `plain`.
The focus is an exact Japanese substring. An empty focus uses the J heuristic.
The gateway requests these tags only for bilingual media replies.
Reaction and playback captions hide complete and incomplete tags. The Japanese speech filter preserves tags for the local server.
The server removes tags before OpenJTalk reads the sentence.
It matches the focus through the engine mora sequence and emphasizes the matching accent phrases.
Unknown focus words retain the J heuristic. Question punctuation retains a rising contour with a statement tone tag.
Untagged replies reproduce J unchanged.
The tags add no shared data, providers, downloads, or consent changes.

## Shy voicing for style 60

Date: 2026-10-08
Status: Implemented. The owner approved each part by listening to preview reels.

On style 60 (VOICEVOX:猫使ビィ, 人見知り), the J rules sounded robotic and fast.
J cut every pause to 0.15 seconds, and its contours widened the pitch range to 8–11 semitones.
In J mode, the server now gives style 60 a shy profile instead. `SHY_STYLES` holds the style IDs.
Original mode and other styles do not change. The style 8 J parity test still passes.

The shy profile does these steps:

1. It replaces `〜` and `～` with `ー`. OpenJTalk drops a wave dash, so the held vowel of ほんと〜？ was lost.
2. It adds one soft break at the middle of each clause of 12 or more morae.
   The server writes `、` into the plan kana and plans again, so the engine shapes the break like a real comma.
   A pause inserted into an existing plan stopped the previous mora abruptly, and the owner heard a stutter.
3. It extends pauses: 0.34 seconds at a comma, 0.45 seconds after a filler or stutter, and 0.6 seconds at `…`.
4. It slows each mora by 1.12 and extends the mora before a comma by 1.25.
5. It compresses pitch to 0.8 around each clause mean, lowers it by 0.06 log-F0, and lets it drift down in each clause.
   Pitch resets after each break. The sentence drops a little from clause to clause.
6. A question rises about 1.2 semitones on its last mora. An exclamation is a little brighter and does not trail.
   A held exclamation such as すごい〜！ follows the engine fall on the held vowel.
7. It moves the whole sentence down when the sentence exceeds the style cap, or its mean exceeds the soft limit minus 0.08.
   A clamp on single morae flattened the question rise of ほんと〜？.
8. A hum phrase inside a sentence, such as ん〜、, is 0.1 log-F0 lower and held 1.4 times longer.

The profile ignores tone and focus tags. It does not rotate ending contours.

A standalone laugh, such as ふふ〜, へへ〜, or えへへ〜, gives the engine too little context.
Alone, OpenJTalk also reads へへ〜 as the particle へ and ヘエ.
The server plans the laugh in an approved carrier sentence, such as `へへ〜、褒められちゃった。`, and keeps only the laugh.

A standalone hum, ん〜 or ん〜…, has a fixed plan.
A whispered ウ comes first. Then 13 voiced morae of 35 ms each glide through ウ into ン.
The pitch rises a little and then falls from 332 Hz to 311 Hz in steps of about 0.3 semitones.
A long ン with one pitch per mora sounded static. The owner accepted the remaining synthetic fade as an engine limit.
A bare ん is a short reply, not a hum. It uses the sentence rules.

## Foreign words

Date: 2026-10-08
Status: Implemented. The owner approved the preview reels by listening.

OpenJTalk spells an unknown English word with letter names and pauses after each word.
For example, 「Can't take my eyes off you」 became キャン、ティイ、ティイエエケエイイ、マイ、イイワイイイエス、オフ、ユウ.
OpenJTalk drops Cyrillic. A line with only Cyrillic failed with no audio.

The server now rewrites foreign phrases in the text that OpenJTalk receives. Captions do not change.
The rewrite runs after `read_prosody` and before planning. It applies in original mode, in J mode, and in the shy profile.
The focus text gets the same rewrite, so a focus match still works.
A line without Latin or Cyrillic letters skips the rewrite, so the J parity audio stays byte-identical.

Latin words follow VOICEVOX ENGINE `voicevox_engine/tts_pipeline/katakana_english.py`:

1. The server removes apostrophes inside a word, so Can't becomes cant. NFKD removes accents, and NFKC makes full-width letters ASCII.
2. A word is unknown when OpenJTalk reads it the same as its letter names. This matches the engine policy.
   Known words, such as Jazz → ジャズ and YouTube, keep their dictionary reading.
3. An unknown word is split at camelCase. A 1-letter or ALL-CAPS part gets letter names.
   Other parts go to `kanalizer.convert(word.lower())`, from `kanalizer==0.1.1` (VOICEVOX, MIT).
4. Words joined by spaces or hyphens form one phrase. A phrase of two or more words becomes one katakana run.
   Known words in the run use their OpenJTalk reading. The run has no pause between words.
5. One plain word that OpenJTalk already reads, or spells as letter names, keeps its text and accent.

Cyrillic words use a built-in rule table without a dependency:

- Each consonant has a hard row for а ы у э о and a soft row for я и ю е ё. For example, дя → ジャ and тё → チョ.
- At a syllable start, я, е, ё, and ю add the y glide: ヤ, イェ, ヨ, and ユ.
- й before a vowel gives ヤ, ユ, ヨ, or イェ. Otherwise it gives イ.
- ь palatalizes the consonant, as in мать → マチ. ъ keeps it hard and separates the next vowel, as in объём → オブヨム.
- A doubled consonant gives ッ, or ン for нн.
- Stress is unknown, so each vowel keeps its written quality. Спасибо becomes スパシボ, not スパシーバ.

French phrases use a built-in rule table. kanalizer reads French with English rules, as in croissant → クロワッサント.
The owner chose these rules over a variant that holds the last syllable, as in メルシーボクー.

- A phrase is French when a word has a French accent, starts with an elision such as c' or l', or is in `FRENCH_WORDS`.
  The list holds words that are rare in English, such as la, je, très, merci, and croissant. Other Latin phrases keep the English path.
- A final mute e and most final consonants are silent. They still decide the letters before them: rose → ロズ and madame → マダム.
- Nasal vowels are the vowel plus ン: an and en → アン, on → オン, in and ain → アン.
- ou, oi, eau, au, ai, and eu are single sounds. u is ュ, as in nuit → ニュイ.
- ch, gn, qu, soft c and g, and s between vowels follow French spelling.
- A doubled consonant gives ッ, as in croissant → クロワッサン. The ill and eil endings give イユ, as in soleil → ソレイユ.
- Elision joins the consonant to the next word: c'est → セ and l'amour → ラムール. A final r gives ール, as in amour → アムール.
- `FRENCH_EXCEPTIONS` holds irregular words, such as monsieur → ムッシュー.

The ENGINE gives each converted word accent 1 at the NJD level. Core 0.17 accepts only text or kana, so the katakana uses the OpenJTalk default accent.
`kanalizer==0.1.1` is installed in `.local/voicevox/venv` from the hash-pinned `win_amd64` wheel.

## Profile migration

`initializeHybrid` seeds an absent VOICEVOX provider and applies J controls once before Pinia reads the profile.
The `hybrid/tsumugi-j-controls-configured` marker prevents later control resets.
`initializeHybridVoice` updates the active character through its persisted speech owner.
The `hybrid/tsumugi-j-voice-configured` marker records a successful voice update.
A failed character update leaves the voice migration pending.
The launch default for VOICEVOX is `LOCAL_TTS_VOICE=60` (VOICEVOX:猫使ビィ, 人見知り). Kokoro retains `af_heart`.
The current local `.env` also selects style 8.

## Credits

VOICEVOX:四国めたん
VOICEVOX:ずんだもん
VOICEVOX:春日部つむぎ
VOICEVOX:雨晴はう
VOICEVOX:冥鳴ひまり
VOICEVOX:春歌ナナ
VOICEVOX:猫使アル
VOICEVOX:猫使ビィ

## Verification

The native HTTP parity test starts a fresh contour session on an ephemeral loopback port.
It submits all seven audit sentences through `/audio_query` and `/synthesis`, with the J controls.
It concatenates the results with 0.9 seconds of silence after each clip.
The result equals the approved WAV: 878,240 samples, maximum sample difference 0.
Additional checks cover tags, focus selection, contour rotation, pitch limits, questions, and a finite calibrated range for every loaded style.

Run the native test with the installed VOICEVOX Python:

```powershell
.local/voicevox/venv/Scripts/python.exe -I scripts/test-voicevox-prosody.py --audit-dir .claude/worktrees/airi-live-run-audit-de29c7/audit/speech-prosody
```

The audit path is test evidence. Product code does not import files from that worktree.
Browser tests cover one-time control migration and user settings after another initialization.
Chunker tests cover Japanese commas, elongated vowels, hesitation, multiple sentences, and Windows line breaks.
A pipeline test verifies that sentence options reach synthesis.
Gateway tests verify that ordinary chat does not request media tags.

## Final check results

Commands used the installed Node 26 and pnpm shims under `.local`.
Git trust applied only to child processes. The global Git configuration did not change.

| Command | Result |
| --- | --- |
| `pnpm -F @proj-airi/pipelines-audio exec vitest run` | Passed. 85 tests. |
| `pnpm -F @proj-airi/pipelines-audio typecheck` | Passed. |
| `pnpm -F @proj-airi/pipelines-audio build` | Passed. Runtime and declarations rebuilt. |
| `pnpm -F @proj-airi/stage-ui exec vitest run --project node src/libs/speech/japanese-reply-speech.test.ts src/stores/character/orchestrator/media-scheduling.test.ts` | Passed. 15 tests with hybrid enabled and a test gateway configuration. |
| `pnpm exec vitest run --config apps/stage-tamagotchi/vitest.node.config.ts scripts/hybrid/gateway.test.ts` | Passed. 20 tests. |
| `pnpm exec vitest run --config .local/prosody-browser.config.mts --project browser src/renderer/modules/hybrid.browser.test.ts` | Passed. 2 browser tests. |
| `pnpm -F @proj-airi/stage-ui typecheck` | Passed after the final parenthetical fix. |
| `pnpm -F @proj-airi/stage-tamagotchi typecheck` | Passed after the final parenthetical fix. |
| Native parity command in the previous section | Passed. 6 tests. Maximum sample difference 0. |
| `pnpm typecheck` | Failed on missing dependencies in unrelated workspaces, including MediaPipe and `w3c-web-hid`. |
| `pnpm lint` | Reported 0 errors and 677 warnings, then exited with native Windows error 3221225477. |
| `git diff --check` | Passed. |

The default browser run lacked the Playwright headless-shell executable.
A temporary local configuration retained the repository test projects and selected the installed Chromium executable. No browser download occurred.
Targeted lint fixes passed with warnings from existing comments and helpers.

## Live verification

AIRI was relaunched with `scripts/launch-hybrid.ps1 -Debug`.
The effective voice is style 8. The saved controls are 0.9, 0, 1, and 1.
A synthetic reply made exactly two complete-sentence `/audio_query` calls and two `/synthesis` calls. All four returned HTTP 200.
The requests excluded the Japanese notes and English translation.
Both reaction and playback captions excluded the prosody tags.
The second clip was ready before the first clip finished. Playback began immediately after the first clip ended.
The synthetic fixture reaction was removed after verification.
The optional live Gemini tag-generation fixture returned upstream HTTP 503. Mock gateway tag tests and live local tagged synthesis passed.

## Voicing switch verification

The switch update passed these checks:

| Command | Result |
| --- | --- |
| `pnpm -F @proj-airi/provider-inference exec vitest run src/providers/local/voicevox/engine.test.ts src/providers/local/voicevox/define.test.ts` | Passed. 34 tests. |
| `pnpm exec vitest run --config .local/voice-toggle-ui.config.mts --project browser src/components/scenarios/providers/voicevox-family-settings.browser.test.ts` | Passed. 8 browser tests. |
| Native parity command above | Passed. 7 tests, including both modes with overlapping HTTP plans. J remains byte-identical. |
| `pnpm -F @proj-airi/provider-inference build` | Passed. |
| `pnpm -F @proj-airi/provider-inference typecheck` | Passed. |
| `pnpm -F @proj-airi/stage-ui typecheck` | Passed. |
| `pnpm -F @proj-airi/stage-tamagotchi typecheck` | Passed. |
| `pnpm typecheck` | Failed. The unrelated scenario browser workspace cannot find `vue-tsc`. |
| `pnpm lint` | Passed. 0 errors and 677 warnings. |
| `git diff --check` | Passed. |

The temporary browser configuration selects the installed Chromium and retains the stage-ui test projects and plugins.
The browser test clicks the real switch, verifies both persisted modes, and restores original mode after remounting.
The native HTTP test compares original mode with an untouched engine plan and retains engine question upspeak.
It submits overlapping original and J plans, then synthesizes them in reverse order.
It also rejects invalid modes. Requests without a mode retain the approved J output.

The local speech server was restarted to load both modes.
The live settings window displayed the switch with J enabled and controls 0.9, 0, 1, and 1.
AIRI then relaunched without the debug endpoint. Live preview and cross-window checks did not finish.
Automated browser persistence tests and native synthesis checks passed.

## Shy voicing verification

| Command | Result |
| --- | --- |
| Native parity command above | Passed. 13 tests. J remains byte-identical: 878,240 samples, maximum difference 0. |
| Comparison of the server plans with the approved preview builders | Passed. 26 of 26 approved lines give byte-identical audio. |

Six new native tests cover the shy profile:

- Pace, pitch level, and pitch spread against the native and J plans.
- Hesitation, stutter, and ellipsis pauses.
- Question rises, held vowels, held exclamations, and the style cap.
- Standalone laughs and the standalone hum glide.
- The J mode request for style 60, which does not rotate contours.

## Foreign word verification

| Command | Result |
| --- | --- |
| Native parity command above | Passed. 16 tests. J remains byte-identical: 878,240 samples, maximum difference 0. |
| Comparison of the server plans with the approved previews for style 60 in J mode | Passed. 7 of 7 lines give byte-identical audio. |

Three new native tests cover these foreign word cases:

- Unknown English becomes one katakana run without word pauses. Known words and letter names keep their text.
- Accents, full-width letters, camelCase, and ALL-CAPS words.
- The Cyrillic rules for е, ё, ю, я, й, ь, ъ, palatalization, and doubled consonants.
- A line with only Cyrillic gives audio in both modes for styles 8 and 60.

French rules, added 2026-10-09:

| Command | Result |
| --- | --- |
| Comparison of the server rules with the approved preview builder on 123 French words | Passed. 0 differences in katakana and French detection. |
| Native parity command above | Passed. 20 tests. J remains byte-identical: 878,240 samples, maximum difference 0. |
| Comparison of the server plans with approved reel B for style 60 in J mode | Passed. 8 of 8 lines give byte-identical audio. |

One new native test covers the approved preview lines, word rules, and French detection. English phrases stay on the kanalizer path.

## Follow-up

Compare live speech with the J reel by listening.
The focus rule operates at accent phrase boundaries, not inside one phrase.
VOICEVOX Core 0.17 uses discrete mora pitches. A true pitch glide requires a separate approved engine or postprocessor.
The style 60 hum fade stays synthetic for this reason. Core 0.17 accepts frame-level pitch only for sing styles. Style 60 has none.
A sung hum uses 猫使ビィ おちつき (3059) from the song pack instead. See `Sung hum` below.
Listen to the shy profile in live chat. The previews used fixed test lines.
Restart the local speech server to load the foreign word rewrite.
kanalizer misreads some words, for example cafe → ケーフ. OpenJTalk knows cafe, so café reads カフェ.
The Cyrillic table has no stress or vowel reduction. A Russian stress dictionary needs a separate decision.
The French rules read verbs in -ent as nasal, as in parlent → パルラン. A French word without a cue goes to kanalizer.

## Sung hum

The owner asked AIRI to hum softly at the start of an idle musing, or as a whole musing.
A hum never comes in the middle or at the end of a sentence.

The desktop pack `s0.vvm` has 猫使ビィ song styles ノーマル (3058) and おちつき (3059).
The singing teacher 波音リツ (6000) plans pitch and timing only. 猫使ビィ is always the voice.
The server loads the pack from `.local/voicevox/runtime/models/song/s0.vvm` when it exists.
Song and teacher styles never appear in `/speakers`.

Only a whole chunk that equals `ん〜ん、ん〜ん〜♪` in style 60 with J voicing becomes a hum plan.
Any other text, and the same text in another style, is speech.
The hum uses 3059 for that clip only. The next shy line returns to style 60.

The owner approved step 4 of the v4 transition preview after three rounds.
Raw song output sounded synthetic. The teacher gave flat held notes, pitch glitches near consonants, flat loudness, and a bright ん.
The approved chain fixes them in this order:

1. Pitch is rebuilt from the score keys. An 80 ms S-curve crosses each key change, with a small overshoot upward and a scoop after silence.
2. Vibrato starts after about 0.25 s. Its rate and depth wander. Slow drift and micro jitter follow.
3. Each voiced run swells in, sags a little, and the last run fades over about 0.3 s. Volume has small shimmer.
4. Two low-pass filters at 2.2 kHz and 3 kHz muffle the hum like a closed mouth. A faint inhale and air follow its loudness.
5. A small dark room adds three early reflections and a short damped tail.

The hum key matches the lower shy speaking range. Shy lines sit near MIDI 66 to 67, start near 67 to 68, and end near 60 to 63.
A shy line that follows a hum within 20 seconds eases in. Its first two voiced morae start 1.6 and 0.7 semitones lower.
That line also starts with 0.18 s of silence, a 0.26 s inhale, and 0.05 s of silence.
The ease and the inhale apply once.

The teacher model gives a slightly different volume curve on each call. Each hum is a new take, like a human hum.
With the same teacher draw and seed, the server output is byte-identical to the approved preview code.
