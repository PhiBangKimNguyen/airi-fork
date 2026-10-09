import type { Application } from '@pixi/app'
import type { Cubism2InternalModel, Cubism2Spec, Cubism4InternalModel, CubismSpec, Live2DModel } from 'pixi-live2d-display'

import { errorMessageFrom } from '@moeru/std'

import { MotionPriority } from './live2d-runtime'

/**
 * Routes canvas clicks to authored hit areas and reaction motions.
 * Each model owns one listener set. Dispose it before replacing the model or canvas.
 */
export class ModelInteraction {
  private readonly canvas: HTMLCanvasElement
  private pointerStart: { x: number, y: number } | undefined
  private readonly nextMotion = new Map<string, number>()
  private disposed = false

  constructor(
    private readonly model: Live2DModel<Cubism2InternalModel | Cubism4InternalModel>,
    private readonly app: Application,
    private readonly paused: () => boolean,
  ) {
    this.canvas = app.view as HTMLCanvasElement
    this.canvas.addEventListener('pointerdown', this.startPointer)
    this.canvas.addEventListener('pointercancel', this.cancelPointer)
    this.canvas.addEventListener('click', this.click)
  }

  private readonly startPointer = (event: PointerEvent) => {
    this.pointerStart = event.isPrimary && event.button === 0
      ? { x: event.clientX, y: event.clientY }
      : undefined
  }

  private readonly cancelPointer = () => {
    this.pointerStart = undefined
  }

  private readonly click = (event: MouseEvent) => {
    const start = this.pointerStart
    this.pointerStart = undefined
    if (this.disposed || this.paused() || event.button !== 0)
      return
    // A drag can end with a click event. Keep repositioning separate from reactions.
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6)
      return
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height)
      return
    // Hit testing expects renderer coordinates, including the stage render scale.
    const x = (event.clientX - rect.left) * this.app.renderer.screen.width / rect.width
    const y = (event.clientY - rect.top) * this.app.renderer.screen.height / rect.height
    const hitAreas = this.model.hitTest(x, y)
    const area = hitAreas.find(name => name.toLowerCase() === 'head')
      ?? hitAreas.find(name => name.toLowerCase() === 'body')
    if (!area)
      return
    const reaction = this.selectReaction(area.toLowerCase())
    if (reaction) {
      void this.model.motion(reaction.group, reaction.index, MotionPriority.FORCE).catch((error) => {
        if (!this.disposed)
          console.warn('[Live2D] Click reaction failed:', errorMessageFrom(error))
      })
    }
  }

  private selectReaction(area: string): { group: string, index: number } | undefined {
    const definitions: Partial<Record<string, (Cubism2Spec.Motion | CubismSpec.Motion)[]>> = this.model.internalModel.motionManager.definitions
    const namedGroup = Object.keys(definitions).find(group => group.toLowerCase() === `tap_${area}`)
    if (namedGroup && definitions[namedGroup]?.length) {
      const index = this.nextMotion.get(namedGroup) ?? 0
      this.nextMotion.set(namedGroup, (index + 1) % definitions[namedGroup]!.length)
      return { group: namedGroup, index }
    }

    // Some Cubism 2 exports place numbered touch motions in an unnamed group.
    // Only these explicit touch names qualify. Login and wedding motions stay manual.
    const touchMotions = Object.entries(definitions).flatMap(([group, motions]) =>
      motions?.flatMap((motion, index) => {
        const file = 'file' in motion ? motion.file : motion.File
        return /(?:^|[/\\])touch_\d+\.mtn$/i.test(file) ? [{ group, index }] : []
      }) ?? [],
    )
    if (!touchMotions.length)
      return undefined
    const key = `touch:${area}`
    const index = this.nextMotion.get(key) ?? 0
    this.nextMotion.set(key, (index + 1) % touchMotions.length)
    return touchMotions[index]
  }

  dispose(): void {
    this.disposed = true
    this.canvas.removeEventListener('pointerdown', this.startPointer)
    this.canvas.removeEventListener('pointercancel', this.cancelPointer)
    this.canvas.removeEventListener('click', this.click)
    this.pointerStart = undefined
  }
}
