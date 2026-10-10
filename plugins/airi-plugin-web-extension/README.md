# AIRI Plugin - Web Extension

> Read what you are reading!

This is a plugin for the AIRI to understand what you are reading, looking at, or listening to on the web.

## What it does now

- Shares one selected tab with local AIRI. It starts paused.
- Reads YouTube and Bilibili captions, Reddit text, and visible page paragraphs.
- Extracts subtitles from text tracks or DOM overlays.
- Sends context updates and optional `spark:notify` events to the character.
- Exposes a popup to configure WebSocket, toggles, and quick status.
- Coalesces new content into a reaction at most once every 45 seconds.
- Stops video reactions while paused. Video titles alone do not trigger commentary.
- Keeps browser context on a literal loopback channel. It never connects to a hosted model endpoint.
- With explicit cloud video vision enabled, samples only the playing video element every 15 seconds. The desktop sends at most two recent frames and captions. **Cloud video model** selects the model for these reactions.

## Quick start

1. Run `pnpm -F @proj-airi/airi-plugin-web-extension build`.
2. For the hybrid profile, launch AIRI once. Run `node scripts/prepare-media-extension.mjs` from the repository root.
3. In `chrome://extensions`, enable Developer mode. Load the unpacked `.output/chrome-mv3` folder.
4. Reload the page. Open the popup and choose **Share this tab**.
5. Leave **Notify character** enabled. Enable **Cloud video vision**. Choose **Cloud video model**, then apply settings. Captions are optional. For local text-only reactions, turn cloud vision off and enable captions.
6. Enable **Audio ears** for listening. Apply settings, then stop and share again to start capture.
7. Leave **Synthetic/non-personal test media** off for YouTube. Turn it on only for synthetic media without human voices or faces.
8. Leave **Follow YouTube videos in this shared tab** on to follow the next video automatically. The initial share is still required.
9. Choose **Stop sharing** when finished. Leaving YouTube video pages or a background worker restart also stops sharing.

The cloud video model defaults to Gemini. The popup also offers Kimi K3, Gemma 4 31B, and Gemma 4 26B A4B.
Inkling requires **Synthetic/non-personal test media**. Typed chat and local viewing-memory choices remain independent.
The gateway pins each provider to its configured model.

The default WebSocket URL is `ws://127.0.0.1:6121/ws`.
Unpaired builds require AIRI's local channel access token in the popup.
The paired build contains a local credential. Do not publish it.

The hybrid desktop routes page text to Qwen. The explicit cloud video mode excludes page text, private history, tools, and memory; its frames remain ephemeral. The desktop must also enable `AIRI_CLOUD_VIDEO_VISION` for this endpoint. Default builds leave it off.
Cloud video reactions show Japanese with an English translation on the avatar window and speak Japanese only.
Audio ears capture the shared tab only, without microphone or desktop audio. Non-silent 12-second WAV chunks run at a 20-second cadence.
Headphone playback retains the device's full sample rate and stereo channels. Only the analysis branch becomes mono 16 kHz.
Gemini describes public YouTube audio. The reaction layer combines recent audio observations, video frames, captions, and six recent replies.
The ears never speak independently. The reaction layer decides whether to speak, using the existing 45-second cooldown.
Private mode disables hosted ears. **Local video vision** sends frames to the existing local vision profile when cloud vision is off.
Synthetic media uses free Inkling ears. Select **Inkling** under **Cloud video model** for synthetic video reactions.
Free Inkling prohibits personal data and logs inputs and outputs for training. OpenRouter currently rejects AIRI with HTTP 403 because it requires an approved agentic harness.
Protected or cross-origin players can block frame capture. Revoked reactions cannot update memory or speak after sharing stops.
Following keeps the same tab audio stream. Each video gets a new sharing ID and a worklet generation reset, so old context cannot follow it.
Other tabs never inherit sharing. Disable the follow control to stop sharing on every URL change.
The desktop remembers explicitly shared YouTube playback across restarts in its local profile. Inferred preferences and full history stay local.
The collected music playlist groups candidate songs by normalized title and retains links to each watched version.
Live, cover, adaptation, and music-video labels describe versions. Explicit artist conflicts prevent matches unless a version declares an adaptation.
After 30 seconds of observed playback, AIRI can comment on another version of a previously watched song.
Title matches are tentative. They do not establish differences in sound or lyrics.
Audio ears mark music and supply genre evidence. Version labels can also identify candidate music titles.
Genre summaries count each engaged song once. Repeated uploads do not increase the genre count.
After three engaged songs, AIRI can comment on genres with explicit title or audio evidence.
Unknown genres remain unknown. Language and channel names never establish a genre.
Song comparisons and genre commentary use Qwen locally, including when a cloud habit provider is selected.
Open **Collected music playlist** under **Local viewing memory** to inspect songs, versions, and observed genres.
**Forget viewing history** also deletes the collected playlist and genre evidence.
Under **Local viewing memory**, **Who teases you?** selects Qwen, Gemini, or Kimi.
Cloud teasing shares only approved replay, return, or channel engagement counts for an explicitly shared public video.
The time-aware switch adds fresh public audio and a broad period based on Indochina Time (UTC+7).
Exact time and private viewing history stay local.
The extension repeats sharing permission for the same shared tab, so AIRI can recover after a desktop restart.
Cloud teasing excludes titles, URLs, channel identities, favorite lists, and remembered private comments.
Open **Local viewing memory** below the desktop's model buttons to disable learning or forget viewing history.
After an audio capture update, reload the extension and page. Open the toolbar popup on the playing video and share again.
The manifest declares `activeTab`. Tab audio uses Chrome's tab-only constraints, without microphone-processing fields.
