# Stage UI

Shared core for stage

## Japanese reading aids

Assistant chat replies and desktop captions show hiragana above known kanji through native ruby annotations.
User messages, code blocks, inline code, mathematical formulas, and existing ruby annotations stay unchanged.
The original reply remains in message storage, copy actions, model context, and speech requests. Speech never receives display readings.
Kuroshiro and Kuromoji generate readings locally. No additional model request or external reading service runs.
The dictionary loads lazily when kanji first appear. Unknown words retain their original text without an invented reading.
Dictionary readings can differ from the intended pronunciation of names or ambiguous words.
Replies appear immediately. Readings follow a short pause in streaming updates. A dictionary failure retains the original display.
The `FuriganaDictionary` Vite plugin serves development assets and bundles all dictionary files and redistribution notices for offline builds.
Register it in each renderer host. `MarkdownRenderer` enables reading aids through its `furigana` prop. `FuriganaText` accepts plain caption text.

## Vue DevTools in settings

The web and Electron developer settings pages host the Vue DevTools launcher during development.
The launcher stays hidden on the character stage. Its inspection panel retains the plugin controls.
`VueDevtools` moves the plugin root into settings and returns it to the hidden body location when settings close.

## Collected music memory

`MediaWatchMemory` stores explicitly shared YouTube playback in the local profile, with a limit of 200 videos.
`MediaWatchPlaylist` shows candidate songs, links to watched versions, and genre evidence under the desktop's local viewing memory controls.
Song identity uses Unicode title matching. Version labels remain available for commentary.
Explicit artist conflicts prevent homonymous songs from merging. Declared adaptations can use different performers.
Genre summaries count engaged songs once per genre. Title and audio evidence supply tentative labels, and absent evidence stays unknown.
Song comparisons and genre commentary route locally. They never enter the approved cloud habit projection.
Use this memory for shared playback habits. It does not fingerprint audio or import a YouTube account playlist.
Disable viewing memory to stop collection. Forget viewing history to delete songs, genre evidence, and remembered comments.

## Video reaction motions

Video and viewing-habit replies choose an emotion cue with their spoken reaction.
The media boundary removes `[emotion=NAME]` before duplicate checks, captions, and speech.
It removes cues from any reply position. The first cue controls the gesture, and repeated cues remain hidden.
Caption filtering also hides incomplete emotion tags during streaming.
Bilingual replies retain one English caption, including when emotion or prosody tags follow an embedded draft translation.
Watching replies retain the first completed Japanese/English pair. Consecutive English revisions replace its caption.
Later Japanese paragraphs and English commentary are discarded before duplicate checks, captions, and speech.
The retained dialogue still obeys the spoken length limit. An overlong first reply remains silent.
Reasoning blocks remain hidden during streaming. An orphan closing reasoning tag discards the malformed continuation after it.
English captions use the requested title “Ib's Memory” for イブの記憶. Japanese dialogue and unrelated song titles remain unchanged.
Empty Japanese quotation marks disappear before captions and speech. Quoted song titles remain intact.
The speech intent carries an ACT token through the existing Eventa bus.
The stage applies the cue once when that reply starts playback. Failed or canceled speech discards the cue.
Automatic reactions call the scene directly without changing the persisted motion selection.
An identical active motion continues. After it finishes, the same cue can play it again.

AK-Alfa archives with an `akalfa`, `ak-alfa`, or `ak_alfa` file name use their authored touch motions.
The profile maps the five authored motions to these cues:

| Reaction | Motion |
| --- | --- |
| Bashful | `touch_1.mtn` |
| Dreamy or zoned out | `touch_2.mtn` |
| Surprised | `touch_3.mtn` |
| Delighted | `touch_4.mtn` |
| Curious | `touch_5.mtn` |

The internal `think` cue selects the dreamy animation. It does not select anger or protest.
Motion file names determine the loaded group and index. Other models retain their existing emotion handling.
Neutral reactions send no new gesture. Silence and repeated replies trigger no new motion.
Login, wedding, and wait animations remain manual.

## Experimental features

Register flags in `libs/feature-flags.ts`. Read their state through `useFeatureFlagsStore().isEnabled(key)`.
Set `availability` to `local` or `cloud`. Local flags expose device switches without Cloud access.
Cloud decides whether each granted Cloud flag allows account opt-in or uses direct control. Client registrations do not duplicate this mode.
`cloud-opt-in` flags expose switches only after Cloud grants access to a verified account. They start disabled and retain choices per account on this device.
`cloud-controlled` flags follow Cloud grants directly and never expose a switch.
Missing Cloud grants disable Cloud features. Refresh failures and account changes clear grants, not local choices.
`useCloudFetch()` in `composables/cloud.ts` shares the Cloud origin and authenticated fetch boundary. The store reads `GET /v1/feature-flags`.
Set `VITE_CLOUD_URL` for a custom Cloud origin. Deploy its migration and API before the client.
Keep authorization checks on the server.

## Message times

Chat history shows a centered timestamp before the first dated message and after five minutes without a message.
Timestamps use stored message times, the interface locale, and the device timezone. Messages without valid timestamps have no separator.
Today's separators show only the time. Yesterday and the day before use relative labels.
Older separators show the month and day. Dates outside the current year also show the year.
Click a separator to toggle its full date and time. Relative labels refresh every minute while the history is open.
`date-fns` handles calendar comparisons and localized formatting through `intlFormat` and `intlFormatDistance`.
The session list displays and sorts by the latest valid user or assistant message timestamp.
Sessions without dated conversation messages use their creation time. Loading messages updates the list from the stored history.
Saving or synchronizing a session does not change its displayed activity time unless its messages change.

## Startup progress

`useStartupResourcesStore` records each resource as queued, loading, ready, failed, or skipped.
The apps register the complete resource list before work starts. Their startup flows report each module's result through the store.
The app roots reset the store before registration. This also stops an old load from updating a new registration after hot reload.
`StartupOverlay` reads the store and shows splash, progress, or an error with a retry action.
`useStartupResourceTimeout` fails a resource that stays loading past its deadline. Web and Pocket apply it to character model loading.
The optional Mods server connects outside the tracked startup work. Its connection does not block onboarding.
Each app's HTML shows the first splash before Vue mounts. CSS hides it when Vue renders into `#app`.
The home page reports when its character model is ready or fails. A failed model keeps the overlay visible.
If the model fails, the user can retry the app or continue without a character.
The overlay emits `finished` when all resources are ready. Apps open onboarding at that point.

## Chat sampling

In **Settings → Modules → Consciousness**, custom temperature and Top P are off
by default. Enable each parameter only when the selected model supports it.
Some models accept only one sampling parameter at a time.

Disabling a parameter keeps its slider value but omits it from chat requests.
Previously saved values remain disabled until the user enables them. Explicit
per-request overrides still take precedence over these settings.

## Chat images

Web and Electron composers share image drafts and previews. They accept PNG,
JPEG, WebP, and GIF files up to 20 MB each, through file selection or paste.
Previews own their Object URLs. Session changes discard pending image reads.
Failed sends restore the draft through the shared composer.

Choose a provider and model in **Settings → Modules → Vision** and enable
**Use the vision model for chat images**. The vision model describes images before
the selected chat model replies. This flow runs when the chat provider does not
report image input for the selected model. Most providers do not report it.
Local history keeps the images. Provider prompts replace images with descriptions,
including images from earlier turns and retries. Cloud history currently stores only message text.
A failed read of an image in the current turn fails the send. The leader keeps a
failed read of an earlier image in memory for its session and vision selection,
so later turns do not read that image again.

**Use the vision model for tool images** applies the same flow to images that tools
return, such as `computer_use_read_image` screenshots and MCP image content. The
vision model reads each image when the tool runs, and a tool rerun reads it too.
While the vision model reads tool images, provider prompts replace stored tool
images with a short note. Stored history keeps the images.

Disable these options to send images directly to a chat model that supports them.
Without a configured vision model, images also go directly to the chat model.
Use this flow for chat attachments and tool images, not periodic screen capture.

## Character-card module settings

The card store owns three distinct states:

- `moduleDefaults` stores global provider, model, voice, and display selections.
- Each card stores explicit overrides. An empty string means inherit.
- Module stores expose the resolved runtime selections used by the application.

Use `configureForAuthentication` for login and logout. It updates global
defaults, then reapplies the active card without saving defaults into that card.
Use card commands for activation and explicit edits. Settings pages must not
save cards from watchers: authentication and remote snapshots also trigger them.
The synchronization leader owns these commands; followers receive snapshots.

Models inherit only within the same provider. Voices also require the same
model. Selecting a vision provider on the vision page stores the catalog default
model of that provider on the active card. A different provider without a model stays unconfigured rather than
receiving an unrelated model id. The editor requires a model for an explicit
chat or vision provider unless that model can be inherited safely.

Defaults are seeded once from the current runtime on upgrade. This cannot
recover historical global values that an older card already overwrote.
Existing `speech-noop` selections are preserved because they may represent
intentional silence. Users can explicitly choose **Inherit global settings**
in the editor; importing or saving an unrelated card field does not change it.

## Button analytics

Register the shared plugin once in each Vue application:

```ts
import { trackButtonPlugin } from '@proj-airi/stage-ui/directives/track-button'

createApp(App)
  .use(trackButtonPlugin)
  .mount('#app')
```

Buttons that represent a product-analysis click intent can then declare a
typed event without wrapping their business handler:

```vue
<Button
  v-track-button="{ name: 'update_check_clicked', channel: selectedChannel }"
  @click="checkForUpdates()"
/>
```

Keep async outcomes, confirmed state changes, impressions, and lifecycle events
in their owning business flows instead of attaching them to the initial click.

## Histoire (UI storyboard)

https://histoire.dev/

```shell
pnpm -F @proj-airi/stage-ui run story:dev
```

The **Misc → Swipe Actions** story renders one row with two start actions and three end actions. Its **Show labels** control switches between
text labels and surfaces that fill the available height. Use this story to
compare gesture presentation, not conversation storage behavior.

### Project structure

1. If a story is bound to a specific component, it can be placed beside the component in the `src` folder. e.g., `MyComponent.story.vue`
2. If a story is not bound to a specific component, then it should be placed in the `stories` folder. e.g., `MyStory.story.vue`

## Local Hearing with Sherpaw

Select **Sherpaw** in Hearing settings. Choose a language to see models that support it, then choose a model.
For a new Sherpaw configuration, the interface language sets the filter and selects a compatible model.
Chinese and English start with X-ASR on desktop and Paraformer on mobile Web or Stage Pocket.
An existing model selection stays in place. Choosing a language switches to a compatible model when needed.
The model detects one of its supported languages. Changing the model saves
the Provider configuration and replaces its runtime.
Each speech session currently owns a Worker, released when the session ends or is cancelled.

Hosts must enable `@proj-airi/vite-plugin-sherpaw` to expose model assets.
`provider-inference` owns recognition and Worker cleanup. `stage-ui` supplies model URLs, cached fetching, the Worker URL, and the Hearing view.
The Provider is unavailable when the host does not include models.
Use this Provider for local streaming recognition without API credentials.
It requires Workers and WebAssembly. Web and Pocket load the selected model from its pinned remote URL.
Desktop development uses cached local files. Desktop releases bundle all three models.
Use a remote Provider when model download size or local memory makes that unsuitable.
The existing VAD pipeline has separate model and runtime downloads.

### Compact Stage status

`HearingStatus` shows the shared, always-on microphone session. Place it above a
mobile composer or at the bottom of a desktop Stage. It reads local request
activity, microphone amplitude, the last transcript, and device or provider
errors.

`StatusCapsule` owns the capsule surface and expandable details. Its indicator
slot receives business content: Hearing owns the audio bars, while sign-in owns
its waiting and result icons. The shell has no request or microphone state. Its details
stay inside its layout bounds so Electron can include them in mouse hit testing.
`HearingStatus` uses the details slot to match chat error cards without adding
microphone failures to chat history.
The component supports reduced motion. Desktop users can enable Streamer mode in
General settings to hide these overlays without stopping microphone input or sign-in.
Streamer mode is off by default.

## Chat stickers

Open **Settings → Modules → Stickers**, then enable stickers. This preference is off by default and applies to this device.
Select a frequency: 25%, 50%, 75%, or 100%. The default is 50% when enabled.
The percentage controls reply eligibility. It does not force an image or guarantee an exact observed ratio.
The model selects one catalog ID from the image names and emotion tags. No separate emotion classifier runs.
Each prepared or queued request retains its catalog, provider, prompt, and eligibility.
No extra provider, API request, character card, or memory module is required.

### Manage the library

Import a PNG, JPG, WebP, or GIF image. Files must decode successfully and remain within 2 MB and 4096 × 4096 pixels.
Preview the image, enter a name with 1–80 characters, and select at least one emotion tag.
Each image can use several tags. Bundled and imported images use the same catalog format.
Edit any image's name or tags. Imported images also support replacement.
Deletion removes the entry from future catalogs. It does not remove images from existing or already prepared replies.
Unknown saved IDs display a translated placeholder and never become image URLs.

IndexedDB stores metadata and immutable image versions on this device.
Replacement creates a new image ID. Chat slices retain the ID selected when their request was prepared.
Deleted entries retain their images. Archived images use storage until the application's site data is cleared.
Web Locks serialize edits across renderer windows. BroadcastChannel signals refresh the local snapshots without transferring image bytes.
The toggle and frequency follow existing same-origin storage events. Reset restores these preferences without clearing the library.
Cloud chat sync transfers text only. Neither imported images nor sticker slices transfer to another device.
Runtime generation does not require an image service or image-generation model.

### Bundled artwork

The default pack contains twelve generated chibi reactions of AIRI's official blue-haired Live2D character.
See [artwork provenance](src/assets/stickers/README.md) for references, exact prompts, and inspection notes.
These are static assets. No runtime image-generation dependency is included.
The four development-only Fluent Emoji images are removed. No old-ID migration is included.
