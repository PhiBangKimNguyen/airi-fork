import type { MaybeRefOrGetter } from 'vue'

import { computed, toValue } from 'vue'

/**
 * Fits the complete model at user scale 1 and position zero.
 * Aligns the visible lower edge with the stage bottom, excluding transparent model padding.
 * @param canvasDim - Stage dimensions before render resolution scaling.
 * @param modelDim - Unscaled model canvas dimensions.
 * @param visibleBottom - Lower visible edge as a fraction of the model canvas height. Defaults to 1.
 */
export function useFitModel(
  canvasDim: MaybeRefOrGetter<{ width: number, height: number }>,
  modelDim: MaybeRefOrGetter<{ width: number, height: number }>,
  visibleBottom: MaybeRefOrGetter<number> = 1,
) {
  const normalizedParam = computed(() => {
    const canvas = toValue(canvasDim)
    const model = toValue(modelDim)

    const heightScale = canvas.height / model.height * 0.9
    const widthScale = canvas.width / model.width * 0.9
    let minScale = Math.min(heightScale, widthScale)

    if (!Number.isFinite(minScale) || minScale <= 0) {
      minScale = 1e-6
    }
    return {
      scale: minScale,
      x: canvas.width / 2,
      y: canvas.height - model.height * (toValue(visibleBottom) - 0.5) * minScale,
    }
  })

  return normalizedParam
}
