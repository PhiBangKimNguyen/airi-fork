import type { Application } from '@pixi/app'
import type { Cubism2InternalModel, Cubism4InternalModel, Live2DModel } from 'pixi-live2d-display'

import { Renderer } from '@pixi/core'

/**
 * Measures the lower visible edge once, before model filters or user transforms are applied.
 * Returns a fraction of the model canvas height for stage fitting.
 * Restores sibling visibility and the complete stage before returning.
 */
export function measureModelBottom(app: Application, model: Live2DModel<Cubism2InternalModel | Cubism4InternalModel>): number {
  const renderer = app.renderer
  if (!(renderer instanceof Renderer))
    throw new Error('Live2D model measurement requires WebGL.')

  const siblings = app.stage.children.filter(child => child !== model)
  const visibility = siblings.map(child => child.renderable)
  try {
    siblings.forEach(child => child.renderable = false)
    renderer.render(app.stage)
    const bounds = model.getBounds()
    const width = renderer.view.width
    const height = renderer.view.height
    const pixels = new Uint8Array(width * height * 4)
    const gl = renderer.gl
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    // WebGL rows start at the bottom. Use the pixel's lower edge to keep its full area visible.
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        if (pixels[(row * width + column) * 4 + 3] > 0) {
          const bottom = (height - row) / renderer.resolution
          return (bottom - bounds.y) / bounds.height
        }
      }
    }
    // An invisible model has no visible edge. Retain its canvas edge until the model becomes visible.
    return 1
  }
  finally {
    siblings.forEach((child, index) => child.renderable = visibility[index])
    renderer.render(app.stage)
  }
}
