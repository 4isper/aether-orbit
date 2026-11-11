import { Vector3 } from 'three'

/**
 * Geometry and lifecycle math for Solis prominences: plasma loops arcing
 * between two footpoints on the photosphere, living on their own slow clocks.
 * Pure and testable; the shader in Star.tsx only renders what this decides.
 */

// Lifecycle shares one period: rise while the loop fills with plasma, hold at
// full brightness, decay, then stay dormant for the rest of the cycle.
const RISE_END = 0.2
const HOLD_END = 0.4
const ACTIVE_END = 0.6

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * Brightness of one prominence at phase `phase` (one full period maps to [0, 1),
 * phase may be any real number): 0 while dormant, 1 while held.
 */
export function prominenceEnvelope(phase: number) {
  const p = ((phase % 1) + 1) % 1
  if (p >= ACTIVE_END) return 0
  const rise = smoothstep(0, RISE_END, p)
  const fall = 1 - smoothstep(HOLD_END, ACTIVE_END, p)
  return Math.min(rise, fall)
}

/** Slerp between unit directions, with fallbacks for near-parallel inputs. */
function slerpDirection(a: Vector3, b: Vector3, t: number, target: Vector3): Vector3 {
  const dot = Math.min(Math.max(a.dot(b), -1), 1)
  const omega = Math.acos(dot)
  if (omega < 1e-6) return target.copy(a).lerp(b, t).normalize()
  if (Math.PI - omega < 1e-6) return target.copy(a)
  const sinOmega = Math.sin(omega)
  const weightA = Math.sin((1 - t) * omega) / sinOmega
  const weightB = Math.sin(t * omega) / sinOmega
  return target.copy(a).multiplyScalar(weightA).addScaledVector(b, weightB)
}

/**
 * A point of the plasma loop between unit footpoint directions `a` and `b`:
 * it walks the great arc between them while rising by `apex` (in photosphere
 * radii) on a half-sine, so the ends sit on the surface and the middle tops
 * out 1 + apex away from the star's center.
 */
export function arcPoint(a: Vector3, b: Vector3, apex: number, s: number, target: Vector3): Vector3 {
  const direction = slerpDirection(a, b, s, target)
  return direction.multiplyScalar(1 + apex * Math.sin(Math.PI * s))
}
