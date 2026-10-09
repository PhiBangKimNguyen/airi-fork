import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useFitModel } from './fit-model'

describe('full model fit', () => {
  it.each([
    [{ width: 450, height: 600 }, { width: 800, height: 1600 }],
    [{ width: 1200, height: 600 }, { width: 1600, height: 800 }],
    [{ width: 320, height: 640 }, { width: 1600, height: 800 }],
  ])('keeps the complete model within the viewport', (canvas, model) => {
    const fit = useFitModel(canvas, model).value
    expect(fit.x).toBe(canvas.width / 2)
    expect(fit.x - model.width * fit.scale / 2).toBeGreaterThan(0)
    expect(fit.x + model.width * fit.scale / 2).toBeLessThan(canvas.width)
    expect(fit.y - model.height * fit.scale / 2).toBeGreaterThan(0)
    expect(fit.y + model.height * fit.scale / 2).toBeCloseTo(canvas.height)
  })

  it('updates the fit after a resize and handles dimensions before loading', () => {
    const canvas = ref({ width: 450, height: 600 })
    const model = ref({ width: 0, height: 0 })
    const fit = useFitModel(canvas, model)
    expect(Number.isFinite(fit.value.scale)).toBe(true)
    model.value = { width: 800, height: 1600 }
    const initialScale = fit.value.scale
    canvas.value = { width: 900, height: 1200 }
    expect(fit.value.scale).toBe(initialScale * 2)
    expect(fit.value.x).toBe(450)
    expect(fit.value.y + model.value.height * fit.value.scale / 2).toBeCloseTo(1200)
  })

  it('places the visible feet on the border when the model has transparent bottom padding', () => {
    const canvas = { width: 450, height: 600 }
    const model = { width: 800, height: 1600 }
    const fit = useFitModel(canvas, model, 0.9).value
    expect(fit.y + model.height * (0.9 - 0.5) * fit.scale).toBeCloseTo(canvas.height)
    expect(fit.y - model.height * fit.scale / 2).toBeGreaterThan(0)
  })
})
