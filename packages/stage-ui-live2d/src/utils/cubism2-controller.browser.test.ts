import type { Cubism2Spec } from 'pixi-live2d-display'

import JSZip from 'jszip'

import { Application } from '@pixi/app'
import { Renderer } from '@pixi/core'
import { extensions } from '@pixi/extensions'
import { Point } from '@pixi/math'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { describe, expect, it } from 'vitest'

import { useFitModel } from '../composables/live2d/fit-model'
import { Cubism2Controller, setLive2DParameter } from './cubism2-controller'
import { Cubism2InternalModel, Live2DFactory, Live2DModel, MotionPriority } from './live2d-runtime'
import { measureModelBottom } from './model-bottom'
import { ModelInteraction } from './model-interaction'

import './live2d-zip-loader'

const fixtureUrl: string | undefined = import.meta.env.VITE_LIVE2D_TEST_ZIP_URL

describe.skipIf(!fixtureUrl)('cubism 2 rendering and AIRI controls', () => {
  it('places the visible feet at the bottom row, excluding transparent model padding', async () => {
    extensions.add(TickerPlugin)
    Live2DModel.registerTicker(Ticker)
    const response = await fetch(fixtureUrl!)
    expect(response.ok).toBe(true)
    const file = new File([await response.blob()], 'cubism2-model.zip')
    const app = new Application({ width: 640, height: 960, backgroundAlpha: 0, autoStart: false })
    app.stage.scale.set(2)
    const model = new Live2DModel<Cubism2InternalModel>()
    try {
      await Live2DFactory.setupLive2DModel(model, [file], { autoUpdate: false, autoInteract: false })
      app.stage.addChild(model)
      const dimensions = { width: model.width, height: model.height }
      const canvas = { width: 320, height: 480 }
      model.anchor.set(0.5)
      const initial = useFitModel(canvas, dimensions).value
      model.scale.set(initial.scale)
      model.position.set(initial.x, initial.y)
      model.update(1)
      const bottom = measureModelBottom(app, model)
      expect(bottom).toBeLessThan(1)
      expect(bottom).toBeGreaterThan(0.5)
      const fit = useFitModel(canvas, dimensions, bottom).value
      model.position.set(fit.x, fit.y)
      app.renderer.render(app.stage)
      if (!(app.renderer instanceof Renderer))
        throw new Error('The Cubism 2 rendering test requires WebGL.')
      const gl = app.renderer.gl
      const floor = new Uint8Array(640 * 2 * 4)
      gl.readPixels(0, 0, 640, 2, gl.RGBA, gl.UNSIGNED_BYTE, floor)
      expect(floor.some((value, index) => index % 4 === 3 && value > 0)).toBe(true)
      expect(model.getBounds().y).toBeGreaterThan(0)
    }
    finally {
      app.stage.removeChild(model)
      if (model.internalModel)
        model.destroy({ texture: true, baseTexture: true })
      app.destroy()
    }
  })

  it('renders a ZIP model, plays MTN idle motion, and applies speech and parameter controls', async () => {
    extensions.add(TickerPlugin)
    Live2DModel.registerTicker(Ticker)
    const response = await fetch(fixtureUrl!)
    expect(response.ok).toBe(true)
    const file = new File([await response.blob()], 'cubism2-model.zip')
    const app = new Application({ width: 320, height: 480, backgroundAlpha: 0, preserveDrawingBuffer: true, autoStart: false })
    const model = new Live2DModel<Cubism2InternalModel>()
    let controller: Cubism2Controller | undefined
    try {
      await Live2DFactory.setupLive2DModel(model, [file], { autoUpdate: false, autoInteract: false })
      expect(model.internalModel).toBeInstanceOf(Cubism2InternalModel)
      app.stage.addChild(model)
      model.scale.set(Math.min(300 / model.width, 460 / model.height))
      model.anchor.set(0.5)
      model.position.set(160, 240)
      const controls = { idle: true, speaking: true, mouthOpen: 0.7 }
      controller = new Cubism2Controller(model.internalModel, {
        idleEnabled: () => controls.idle,
        blinkEnabled: () => true,
        forceBlink: () => false,
        expressionsEnabled: () => true,
        speaking: () => controls.speaking,
        mouthOpen: () => controls.mouthOpen,
      })
      let renderedMouth = 0
      model.internalModel.on('beforeModelUpdate', () => {
        renderedMouth = model.internalModel.coreModel.getParamFloat('PARAM_MOUTH_OPEN_Y')
      })
      expect(await model.motion('idle', 0, MotionPriority.IDLE)).toBe(true)
      model.update(16)
      app.renderer.render(app.stage)
      const core = model.internalModel.coreModel
      expect(renderedMouth).toBeCloseTo(0.7)
      if (!(app.renderer instanceof Renderer))
        throw new Error('The Cubism 2 rendering test requires WebGL.')
      const gl = app.renderer.gl
      const pixels = new Uint8Array(320 * 480 * 4)
      gl.readPixels(0, 0, 320, 480, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      expect(pixels.some((value, index) => index % 4 === 3 && value > 0)).toBe(true)
      controls.speaking = false
      model.update(16)
      app.renderer.render(app.stage)
      expect(renderedMouth).toBe(0)
      controls.idle = false
      setLive2DParameter(model.internalModel, 'ParamAngleX', 12)
      model.update(16)
      app.renderer.render(app.stage)
      expect(core.getParamFloat('PARAM_ANGLE_X')).toBeCloseTo(12)
      setLive2DParameter(model.internalModel, 'ParamEyeSmile', 0.6)
      expect(core.getParamFloat('PARAM_EYE_L_SMILE')).toBeCloseTo(0.6)
      expect(core.getParamFloat('PARAM_EYE_R_SMILE')).toBeCloseTo(0.6)
      expect(model.internalModel.motionManager.isFinished()).toBe(true)
    }
    finally {
      controller?.dispose()
      app.stage.removeChild(model)
      if (model.internalModel)
        model.destroy({ texture: true, baseTexture: true })
      app.destroy()
    }
  })

  it('reacts to scaled head and body clicks while ignoring blank space, dragging, pause, and disposed listeners', async () => {
    extensions.add(TickerPlugin)
    Live2DModel.registerTicker(Ticker)
    const response = await fetch(fixtureUrl!)
    expect(response.ok).toBe(true)
    const file = new File([await response.blob()], 'cubism2-model.zip')
    const app = new Application({ width: 640, height: 960, backgroundAlpha: 0, autoStart: false })
    const canvas = app.view as HTMLCanvasElement
    canvas.style.width = '320px'
    canvas.style.height = '480px'
    document.body.appendChild(canvas)
    app.stage.scale.set(2)
    const model = new Live2DModel<Cubism2InternalModel>()
    let interaction: ModelInteraction | undefined
    let controller: Cubism2Controller | undefined
    let paused = false
    const started: string[] = []
    try {
      await Live2DFactory.setupLive2DModel(model, [file], { autoUpdate: false, autoInteract: false })
      app.stage.addChild(model)
      model.scale.set(Math.min(300 / model.width, 460 / model.height))
      model.anchor.set(0.5)
      model.position.set(160, 240)
      controller = new Cubism2Controller(model.internalModel, {
        idleEnabled: () => false,
        blinkEnabled: () => true,
        forceBlink: () => false,
        expressionsEnabled: () => true,
        speaking: () => false,
        mouthOpen: () => 0,
      })
      model.update(16)
      app.renderer.render(app.stage)
      interaction = new ModelInteraction(model, app, () => paused)
      model.internalModel.motionManager.on('motionStart', (group: string, index: number) => {
        started.push(model.internalModel.motionManager.definitions[group]![index].file)
      })
      function clickArea(areaName: string, drag = false) {
        const area = model.internalModel.hitAreas[areaName]
        expect(area).toBeDefined()
        const bounds = model.internalModel.getDrawableBounds(area.index)
        const local = new Point(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        const global = model.worldTransform.apply(model.internalModel.localTransform.apply(local))
        const rect = canvas.getBoundingClientRect()
        const clientX = rect.left + global.x * rect.width / app.renderer.screen.width
        const clientY = rect.top + global.y * rect.height / app.renderer.screen.height
        canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: clientX - (drag ? 20 : 0), clientY, button: 0, isPrimary: true }))
        canvas.dispatchEvent(new MouseEvent('click', { clientX, clientY, button: 0 }))
      }
      clickArea('head')
      await expect.poll(() => started.length).toBe(1)
      expect(started[0]).toMatch(/(?:^|\/)touch_\d+\.mtn$/)
      model.update(16)
      app.renderer.render(app.stage)
      expect(model.internalModel.motionManager.isFinished()).toBe(false)
      clickArea('head')
      await expect.poll(() => started.length).toBe(2)
      expect(started[1]).not.toBe(started[0])
      clickArea('body')
      await expect.poll(() => started.length).toBe(3)
      expect(started[2]).toMatch(/(?:^|\/)touch_\d+\.mtn$/)
      canvas.dispatchEvent(new MouseEvent('click', { clientX: -100, clientY: -100, button: 0 }))
      clickArea('head', true)
      paused = true
      clickArea('head')
      paused = false
      interaction.dispose()
      clickArea('head')
      await new Promise(resolve => requestAnimationFrame(resolve))
      expect(started).toHaveLength(3)
    }
    finally {
      interaction?.dispose()
      controller?.dispose()
      app.stage.removeChild(model)
      if (model.internalModel)
        model.destroy({ texture: true, baseTexture: true })
      app.destroy()
      canvas.remove()
    }
  })

  it.each(['named', 'none'] as const)('uses authored reaction groups: %s', async (mode) => {
    extensions.add(TickerPlugin)
    Live2DModel.registerTicker(Ticker)
    const response = await fetch(fixtureUrl!)
    const zip = await JSZip.loadAsync(await response.arrayBuffer())
    const settingsPath = Object.keys(zip.files).find(path => /(?:^|\/)model\.json$/.test(path) || path.endsWith('.model.json'))!
    const settings: Cubism2Spec.ModelJSON = JSON.parse(await zip.file(settingsPath)!.async('text'))
    const authoredMotion = Object.values(settings.motions!).flat().find(motion => /touch_\d+\.mtn$/.test(motion.file))!
    settings.motions = mode === 'named'
      ? { ...settings.motions, tap_head: [authoredMotion] }
      : {}
    zip.file(settingsPath, JSON.stringify(settings))
    const file = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'cubism2-reactions.zip')
    const app = new Application({ width: 320, height: 480, backgroundAlpha: 0, autoStart: false })
    const canvas = app.view as HTMLCanvasElement
    canvas.style.width = '320px'
    canvas.style.height = '480px'
    document.body.appendChild(canvas)
    const model = new Live2DModel<Cubism2InternalModel>()
    let interaction: ModelInteraction | undefined
    const started: string[] = []
    try {
      await Live2DFactory.setupLive2DModel(model, [file], { autoUpdate: false, autoInteract: false })
      app.stage.addChild(model)
      model.scale.set(Math.min(300 / model.width, 460 / model.height))
      model.anchor.set(0.5)
      model.position.set(160, 240)
      model.update(16)
      app.renderer.render(app.stage)
      interaction = new ModelInteraction(model, app, () => false)
      model.internalModel.motionManager.on('motionStart', (group: string) => {
        if (group !== 'idle')
          started.push(group)
      })
      const bounds = model.internalModel.getDrawableBounds(model.internalModel.hitAreas.head.index)
      const local = new Point(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      const global = model.worldTransform.apply(model.internalModel.localTransform.apply(local))
      const rect = canvas.getBoundingClientRect()
      canvas.dispatchEvent(new MouseEvent('click', { clientX: rect.left + global.x, clientY: rect.top + global.y, button: 0 }))
      if (mode === 'named') {
        await expect.poll(() => started).toEqual(['tap_head'])
      }
      else {
        await new Promise(resolve => requestAnimationFrame(resolve))
        expect(started).toHaveLength(0)
      }
    }
    finally {
      interaction?.dispose()
      app.stage.removeChild(model)
      if (model.internalModel)
        model.destroy({ texture: true, baseTexture: true })
      app.destroy()
      canvas.remove()
    }
  })
})
