import type { Cubism4InternalModel } from 'pixi-live2d-display'

import { Cubism2InternalModel, MotionPriority } from './live2d-runtime'

// Cubism 2 has no shared eye smile parameter, so one standard id can write several Cubism 2 ids.
const cubism2ParameterIds: Readonly<Record<string, string | readonly string[]>> = {
  ParamAngleX: 'PARAM_ANGLE_X',
  ParamAngleY: 'PARAM_ANGLE_Y',
  ParamAngleZ: 'PARAM_ANGLE_Z',
  ParamEyeLOpen: 'PARAM_EYE_L_OPEN',
  ParamEyeROpen: 'PARAM_EYE_R_OPEN',
  ParamEyeSmile: ['PARAM_EYE_L_SMILE', 'PARAM_EYE_R_SMILE'],
  ParamBrowLX: 'PARAM_BROW_L_X',
  ParamBrowRX: 'PARAM_BROW_R_X',
  ParamBrowLY: 'PARAM_BROW_L_Y',
  ParamBrowRY: 'PARAM_BROW_R_Y',
  ParamBrowLAngle: 'PARAM_BROW_L_ANGLE',
  ParamBrowRAngle: 'PARAM_BROW_R_ANGLE',
  ParamBrowLForm: 'PARAM_BROW_L_FORM',
  ParamBrowRForm: 'PARAM_BROW_R_FORM',
  ParamMouthOpenY: 'PARAM_MOUTH_OPEN_Y',
  ParamMouthForm: 'PARAM_MOUTH_FORM',
  ParamCheek: 'PARAM_CHEEK',
  ParamBodyAngleX: 'PARAM_BODY_ANGLE_X',
  ParamBodyAngleY: 'PARAM_BODY_ANGLE_Y',
  ParamBodyAngleZ: 'PARAM_BODY_ANGLE_Z',
  ParamBreath: 'PARAM_BREATH',
}

/** Writes a standard parameter through the selected Cubism runtime. */
export function setLive2DParameter(model: Cubism2InternalModel | Cubism4InternalModel, id: string, value: number): void {
  if (model instanceof Cubism2InternalModel) {
    const parameterIds = cubism2ParameterIds[id]
    if (parameterIds) {
      for (const parameterId of typeof parameterIds === 'string' ? [parameterIds] : parameterIds)
        model.coreModel.setParamFloat(parameterId, value)
      model.coreModel.saveParam()
    }
  }
  else {
    model.coreModel.setParameterValueById(id, value)
  }
}

interface Cubism2Controls {
  idleEnabled: () => boolean
  blinkEnabled: () => boolean
  forceBlink: () => boolean
  expressionsEnabled: () => boolean
  speaking: () => boolean
  mouthOpen: () => number
}

/** Owns AIRI controls at the Cubism 2 update boundary. */
export class Cubism2Controller {
  private readonly updateMotion: Cubism2InternalModel['motionManager']['update']
  private readonly updateNaturalMovements: Cubism2InternalModel['updateNaturalMovements']
  private readonly eyeBlink: Cubism2InternalModel['eyeBlink']
  private readonly expressionManager: Cubism2InternalModel['motionManager']['expressionManager']
  private wasSpeaking = false
  private motionUpdated = false

  constructor(private readonly model: Cubism2InternalModel, private readonly controls: Cubism2Controls) {
    const manager = model.motionManager
    this.updateMotion = manager.update
    this.updateNaturalMovements = model.updateNaturalMovements
    this.eyeBlink = model.eyeBlink
    this.expressionManager = manager.expressionManager
    manager.update = (core, now) => {
      if (!controls.idleEnabled() && manager.state.currentPriority < MotionPriority.NORMAL) {
        this.motionUpdated = false
        manager.stopAllMotions()
        return false
      }
      this.motionUpdated = this.updateMotion.call(manager, core, now)
      return this.motionUpdated
    }
    model.updateNaturalMovements = (dt, now) => {
      if (controls.idleEnabled())
        this.updateNaturalMovements.call(model, dt, now)
      if (this.motionUpdated && controls.forceBlink() && controls.blinkEnabled())
        this.eyeBlink?.update(dt)
    }
    model.on('beforeMotionUpdate', this.configureManagers)
    model.on('beforeModelUpdate', this.applySpeech)
  }

  private readonly configureManagers = () => {
    this.model.eyeBlink = this.controls.blinkEnabled() ? this.eyeBlink : undefined
    this.model.motionManager.expressionManager = this.controls.expressionsEnabled() ? this.expressionManager : undefined
  }

  private readonly applySpeech = () => {
    if (this.controls.speaking() || this.wasSpeaking)
      this.model.coreModel.setParamFloat('PARAM_MOUTH_OPEN_Y', this.controls.speaking() ? this.controls.mouthOpen() : 0)
    this.wasSpeaking = this.controls.speaking()
  }

  dispose(): void {
    this.model.off('beforeMotionUpdate', this.configureManagers)
    this.model.off('beforeModelUpdate', this.applySpeech)
    this.model.motionManager.update = this.updateMotion
    this.model.updateNaturalMovements = this.updateNaturalMovements
    this.model.eyeBlink = this.eyeBlink
    this.model.motionManager.expressionManager = this.expressionManager
  }
}
