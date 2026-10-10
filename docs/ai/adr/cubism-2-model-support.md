# Cubism 2 model support

## Context

AIRI accepted Cubism 4 archives but rejected Cubism 2 models with `model.json`, `.moc`, and `.mtn` files.
The installed `pixi-live2d-display` package provides both runtimes.

## Decision

Use its combined runtime through one shared entry point.
Load the Cubism 2 core before runtime registration.
Keep the existing app script for the Cubism 4 core.

Treat Cubism 2 as a supported model format.
Validate lowercase settings fields, MOC headers, referenced resources, and MTN headers.
Use the same runtime instance for ZIP imports, OPFS restoration, previews, and scenes.

Select controls by the internal model type.
Cubism 2 uses its native motion, expression, physics, and pose managers.
AIRI applies speech mouth movement after native motion updates.
Standard parameter sliders map to Cubism 2 parameter identifiers.
Cubism 4 retains the AIRI motion and expression plugins.

Route canvas clicks through the model's authored head and body hit areas.
Use named `tap_head` and `tap_body` motion groups when available.
For numbered `touch_*.mtn` motions, cycle through the declared entries without playing unrelated animations.
Convert client coordinates to renderer coordinates before hit testing.
Ignore drags and paused scenes, and remove listeners when the model changes.

At scale 1 and position zero, fit the complete model within the stage.
Center the model horizontally and align its visible lower edge with the bottom border.
Measure the rendered model once before filters and user transforms. Exclude transparent bottom padding from the alignment.
Keep room for shadows and idle movements.

## Consequences

The Cubism 2 core is proprietary. The repository does not commit it.
`scripts/fetch-cubism2-core.mjs` downloads a pinned copy and verifies its SHA-256 before it writes the file.
Run the script before a typecheck, a test, or a build. `scripts/setup-hybrid.ps1` runs it after `pnpm install`.
Cubism 2 model ZIPs require a settings file.
The Cubism 4 expression controller and advanced AIRI motion plugins do not process Cubism 2 models.
Browser loader tests use real platform APIs and both Cubism runtimes.
