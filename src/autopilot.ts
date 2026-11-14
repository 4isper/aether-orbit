/**
 * The free-flight autopilot, as pure functions of the ship's state: given
 * where the ship is, how fast it moves and where the target body sits, it
 * answers with the same commands a pilot's hands would issue — a look
 * direction and forward/brake thrust. The rig damps the look and steps the
 * flight with its own tuning, so the autopilot steers the ship instead of
 * replacing it; any manual key or drag overrides it in the rig.
 */
import { Vector3 } from 'three'

export type AutopilotParams = {
  /** The flight's velocity damping: the passive brake the ship always has. */
  damping: number
}

export type AutopilotSteer = {
  /** Where the ship should face this frame (world yaw/pitch). */
  yaw: number
  pitch: number
  /** Thrust toward the target while the nose is settling. */
  forward: boolean
  /** Reverse thrust inside the braking zone. */
  brake: boolean
  /** Stopped at the arrival ring: the rig hands the ship back. */
  done: boolean
}

/** Map any angle into (-π, π]: the shortest turn crosses no seam. */
export function wrapPi(angle: number): number {
  const wrapped = (angle + Math.PI) % (Math.PI * 2)
  return wrapped < 0 ? wrapped + Math.PI * 2 - Math.PI : wrapped - Math.PI
}

const scratch = new Vector3()

/**
 * Steer one frame of the approach. `arrival` is the distance from the
 * target's center the ship should stop at — the caller adds the body's
 * radius and a margin, so the ring sits above the surface. The braking
 * zone rides the passive damping: inside `speed / damping + margin` the
 * reverse thrust takes over, and the ship is done when it hangs at the
 * ring nearly still.
 */
export function stepAutopilot(
  position: Vector3,
  velocity: Vector3,
  target: Vector3,
  arrival: number,
  damping: number,
): AutopilotSteer {
  scratch.subVectors(target, position)
  const distance = scratch.length()
  const surfaceDistance = distance - arrival
  const speed = velocity.length()

  // The brake zone stops the ship just shy of the ring (~0.5 out); done
  // reads that rest, not an exact landing.
  const done = surfaceDistance <= 0.75 && speed < 0.4
  const brakingZone = speed / Math.max(damping, 1e-4) + 1.2
  const brake = !done && speed > 0.3 && surfaceDistance <= brakingZone
  const forward = !done && !brake && surfaceDistance > brakingZone * 0.5

  const yaw = Math.atan2(scratch.x, scratch.z)
  const pitch = Math.asin(Math.max(-1, Math.min(1, scratch.y / Math.max(distance, 1e-6))))
  return { yaw, pitch, forward, brake, done }
}
