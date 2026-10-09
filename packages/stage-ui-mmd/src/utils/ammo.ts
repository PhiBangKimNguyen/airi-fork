import type { PhysicsFactory } from '@moeru/three-mmd'

let physics: Promise<PhysicsFactory> | undefined

/**
 * Lazily initializes three-mmd's Ammo adapter.
 *
 * The memoized promise gives every mounted model the same WASM runtime while
 * leaving preview generation physics-free.
 * Physics advances by at most one 60 Hz frame after a render hitch. Excess
 * catch-up time is discarded so large rigs can recover their render cadence.
 */
export function ensureAmmo(): Promise<PhysicsFactory> {
  physics ??= import('@moeru/three-mmd-physics-ammo')
    .then(async ({ initAmmo, MMDAmmoPhysics }) => {
      await initAmmo()
      return (mmd) => {
        const physics = MMDAmmoPhysics(mmd)
        return {
          ...physics,
          update(delta) {
            // NOTICE:
            // Catch-up substeps can keep large PMX rigs below their render budget.
            // The Ammo adapter simulates additional steps after slow frames.
            // Source: @moeru/three-mmd-physics-ammo 0.2.0-beta, PhysicsWorld.step.
            // Remove this cap when the adapter exposes a bounded catch-up policy.
            physics.update(Math.min(delta, 1 / 60))
          },
        }
      }
    })

  return physics
}
