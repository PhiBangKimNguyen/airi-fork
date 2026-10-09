import type { PhysicsService } from '@moeru/three-mmd'

import { MMD, PmxObject } from '@moeru/three-mmd'
import { BufferGeometry, MeshBasicMaterial, Skeleton, SkinnedMesh, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { ensureAmmo } from './ammo'

const backend = vi.hoisted(() => ({
  initAmmo: vi.fn(async () => {}),
  update: vi.fn<(delta: number) => void>(),
  dispose: vi.fn(),
  reset: vi.fn(),
  setGravity: vi.fn<(gravity: Vector3) => void>(),
  createHelper: vi.fn(() => {
    throw new Error('This test does not create a physics helper')
  }),
}))

vi.mock('@moeru/three-mmd-physics-ammo', () => ({
  initAmmo: backend.initAmmo,
  MMDAmmoPhysics: () => ({
    affectsIK: true,
    update: backend.update,
    dispose: backend.dispose,
    reset: backend.reset,
    setGravity: backend.setGravity,
    createHelper: backend.createHelper,
  } satisfies PhysicsService),
}))

function createModel() {
  const mesh = new SkinnedMesh(new BufferGeometry(), new MeshBasicMaterial())
  mesh.bind(new Skeleton())
  return new MMD({
    bones: [],
    displayFrames: [],
    header: {
      additionalVec4Count: 0,
      boneIndexSize: 4,
      comment: '',
      encoding: PmxObject.Header.Encoding.Utf8,
      englishComment: '',
      englishModelName: '',
      materialIndexSize: 4,
      modelName: '',
      morphIndexSize: 4,
      rigidBodyIndexSize: 4,
      signature: 'PMX',
      textureIndexSize: 4,
      version: 2,
      vertexIndexSize: 4,
    },
    indices: new Uint8Array(),
    joints: [],
    materials: [],
    morphs: [],
    rigidBodies: [],
    softBodies: [],
    textures: [],
    vertices: [],
  }, mesh)
}

describe('ensureAmmo', () => {
  it('bounds physics catch-up after a render hitch and preserves normal frame time', async () => {
    const factory = await ensureAmmo()
    const physics = factory(createModel())

    physics.update(1 / 15)
    physics.update(1 / 75)

    expect(backend.update).toHaveBeenNthCalledWith(1, 1 / 60)
    expect(backend.update).toHaveBeenNthCalledWith(2, 1 / 75)
  })

  it('preserves physics-aware IK, gravity, reset, helpers, and disposal', async () => {
    const first = ensureAmmo()
    const second = ensureAmmo()
    const factory = await first
    const physics = factory(createModel())
    const gravity = new Vector3(0, -98, 0)

    physics.setGravity?.(gravity)
    physics.reset?.()
    physics.dispose?.()

    expect(second).toBe(first)
    expect(backend.initAmmo).toHaveBeenCalledTimes(1)
    expect(physics.affectsIK).toBe(true)
    expect(physics.createHelper).toBe(backend.createHelper)
    expect(backend.setGravity).toHaveBeenCalledWith(gravity)
    expect(backend.reset).toHaveBeenCalledOnce()
    expect(backend.dispose).toHaveBeenCalledOnce()
  })
})
