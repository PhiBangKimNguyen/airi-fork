# AIRI Live2D

This package provides Live2D rendering, model imports, validation, previews, and runtime controls for AIRI stage apps.

## Use

Import scene components from `@proj-airi/stage-ui-live2d/components/scenes`.
Import validation functions from `@proj-airi/stage-ui-live2d`.

The scene exposes `setMotion(group, index)` for automatic performance cues.
Each request uses native motion priority without changing persisted settings. An identical active motion continues until it finishes.
After a motion finishes, another call can play it again.
Paused or loading models ignore the call and return `false`.

The app must load the Cubism 4 core before it imports scene components.
The shared runtime loads the Cubism 2 core before it registers both runtimes.

## Supported models

| Format | Required files | Animation |
| --- | --- | --- |
| Cubism 2 | `model.json` or `*.model.json`, `.moc`, and referenced textures | `.mtn`, native expressions, physics, and pose |
| Cubism 3 and later | `*.model3.json`, `.moc3`, and referenced textures | `.motion3.json` and AIRI motion plugins |
| Loose MOC3 archive | One `.moc3` and its textures | Inferred model settings |

Import each model as a ZIP. Keep resource paths relative to the settings file.
At scale 1 and position zero, AIRI fits the complete model and centers it horizontally.
The lower visible edge touches the bottom border. AIRI measures the model without shadows and excludes transparent bottom padding.
Scale and position controls can enlarge or move the model after fitting.
Cubism 2 requires its settings file. A `.moc` file cannot replace a `.moc3` file by renaming it.

Cubism 2 supports native idle motions, motion selection, eye tracking, blink controls, speech mouth movement, and standard parameter sliders.
The AIRI expression controller, beat sync, manual motion spring, and manual breath plugins use the Cubism 4 runtime.
Cubism 2 uses expressions declared by its own model settings.
Click a declared head or body hit area to play a reaction.
Named `tap_head` and `tap_body` groups take priority.
Models with numbered `touch_*.mtn` motions cycle through those motions on each click.
Blank space, drags, interface controls, and paused scenes do not trigger reactions.
Click reactions remain available when idle animation is disabled.
Head anchors for Cubism 2 require a declared `head` or `face` hit area.

Use this package for Live2D models. Use the separate VRM, MMD, Spine, or image packages for other model formats.

## Cubism 2 core source

`src/assets/js/cubism2-core.js` contains the unmodified Live2D WebGL 2.1 core.
The core is proprietary, so git ignores it. `scripts/fetch-cubism2-core.mjs` downloads it and verifies it.
Source: [dylanNew/live2d at fd9fd400845e9a00bb194fdac0b6635c753a1e8a](https://github.com/dylanNew/live2d/blob/fd9fd400845e9a00bb194fdac0b6635c753a1e8a/webgl/Live2D/lib/live2d.min.js).
SHA-256: `e4ea1f18bdd44b65394ffd5a1bab16982e88757d45134d1bd0737c8a6b3ddd08`.
On a checksum mismatch, the script fails and writes no file.

Before a typecheck, a test, or a build, run this command from the repository root:

```sh
node scripts/fetch-cubism2-core.mjs
```

`scripts/setup-hybrid.ps1` runs it after `pnpm install`.

The [pixi-live2d-display runtime guide](https://github.com/guansss/pixi-live2d-display#cubism) documents this core and the combined runtime.
The fetched core remains subject to the upstream Live2D terms.

## Checks

Run `pnpm -F @proj-airi/stage-ui-live2d typecheck`.
Run `pnpm -F @proj-airi/stage-ui-live2d exec vitest run`.
Browser tests use real Cubism runtimes and Chromium.

For the optional Cubism 2 rendering test, set `VITE_LIVE2D_TEST_ZIP_URL` to a served ZIP URL.
The ZIP must contain standard mouth and head angle parameters, an `idle` motion group, head/body hit areas, and numbered touch motions.
