/**
 * The dust tail's ballistic grains: each one leaves the nucleus with the
 * comet's own state of motion and then flies its private Kepler orbit under
 * radiation-reduced gravity μ' = (1−β)·STAR_GM — radiation pressure buys the
 * grain a lighter sun. Near perihelion a big enough β pushes the grain past
 * escape velocity, so the solver carries both branches: the elliptic
 * E − e·sin E = M and the hyperbolic e·sinh F − F = M. Everything is a pure
 * function of the shared clock, so pause, reversal and deep links replay
 * the same tail.
 */
import { Vector3 } from 'three'
import { cometPosition } from './comet.ts'
import { keplerSpeed } from './orbits.ts'

/** Solis's gravity in scene units, straight from the planets' Kepler-3
 * calibration: one law of gravity for the dust too. */
export const STAR_GM = keplerSpeed(1) ** 2

/** How widely the release state samples the comet's motion for its
 * velocity: a centered finite difference, like the component's old tail. */
const VELOCITY_STEP = 0.05

export type DustOrbit = {
  /** Positive semi-major axis; eccentricity ≥ 1 means the grain escapes. */
  semiMajor: number
  eccentricity: number
  /** Unit vector toward the orbit's periapsis (world frame). */
  periapsis: Vector3
  /** Unit normal of the orbital plane, along the angular momentum. */
  planeNormal: Vector3
  /** Mean anomaly at the release moment, signed radians. */
  meanAnomaly: number
  /** Mean motion, radians per time unit. */
  meanMotion: number
  hyperbolic: boolean
}

/**
 * Kepler elements of one grain from its release state under reduced
 * gravity. The eccentricity vector aims at periapsis; the mean anomaly is
 * read back from the true anomaly of the release position, signed along the
 * motion direction.
 */
export function dustOrbit(releasePosition: Vector3, releaseVelocity: Vector3, beta: number): DustOrbit {
  const mu = (1 - beta) * STAR_GM
  const r = releasePosition.length()
  const v2 = releaseVelocity.lengthSq()
  const energy = v2 / 2 - mu / r
  const hyperbolic = energy >= 0
  // ε → 0 (a grain right at escape) would blow the semi-major axis up; a
  // huge, nearly-frozen orbit is the honest limit, so clamp the magnitude.
  const semiMajor = mu / (2 * Math.max(Math.abs(energy), 1e-9))
  const planeNormal = new Vector3().crossVectors(releasePosition, releaseVelocity)
  if (planeNormal.lengthSq() < 1e-12) planeNormal.set(0, 0, 1)
  else planeNormal.normalize()
  const eccVec = new Vector3()
    .copy(releasePosition)
    .multiplyScalar(v2 - mu / r)
    .addScaledVector(releaseVelocity, -releasePosition.dot(releaseVelocity))
    .divideScalar(mu)
  const eccentricity = eccVec.length()
  const periapsis = eccentricity > 1e-8
    ? eccVec.clone().divideScalar(eccentricity)
    : releasePosition.clone().normalize()
  // True anomaly of the release point, signed toward the motion direction.
  const cosNu = Math.max(-1, Math.min(1, periapsis.dot(releasePosition) / r))
  const sinNu = Math.max(-1, Math.min(1,
    new Vector3().crossVectors(periapsis, releasePosition).dot(planeNormal) / r))
  const nu = Math.atan2(sinNu, cosNu)
  let meanAnomaly: number
  if (hyperbolic) {
    const halfTan = Math.tanh(nu / 2) * Math.sqrt((eccentricity - 1) / (eccentricity + 1))
    const F = 2 * Math.atanh(Math.max(-0.999999, Math.min(0.999999, halfTan)))
    meanAnomaly = eccentricity * Math.sinh(F) - F
  } else {
    const E = 2 * Math.atan2(
      Math.sqrt(1 - eccentricity) * Math.sin(nu / 2),
      Math.sqrt(1 + eccentricity) * Math.cos(nu / 2),
    )
    meanAnomaly = E - eccentricity * Math.sin(E)
  }
  const meanMotion = Math.sqrt(mu / semiMajor ** 3)
  return { semiMajor, eccentricity, periapsis, planeNormal, meanAnomaly, meanMotion, hyperbolic }
}

/** The grain's position `timeSinceRelease` after release. Newton carries
 * both Kepler branches from close starters; a bisection fallback pins the
 * pathological near-parabolic edge the starters stall on. */
export function dustPositionAt(orbit: DustOrbit, timeSinceRelease: number, target: Vector3): Vector3 {
  const M = orbit.meanAnomaly + orbit.meanMotion * timeSinceRelease
  let px: number
  let py: number
  if (orbit.hyperbolic) {
    let F = Math.asinh(M / orbit.eccentricity)
    for (let i = 0; i < 10; i++) {
      const gradient = orbit.eccentricity * Math.cosh(F) - 1
      F -= (orbit.eccentricity * Math.sinh(F) - F - M) / gradient
    }
    if (Math.abs(orbit.eccentricity * Math.sinh(F) - F - M) > 1e-9) {
      let lo = F - 4
      let hi = F + 4
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2
        if (orbit.eccentricity * Math.sinh(mid) - mid < M) lo = mid
        else hi = mid
      }
      F = (lo + hi) / 2
    }
    px = orbit.semiMajor * (orbit.eccentricity - Math.cosh(F))
    py = orbit.semiMajor * Math.sqrt(orbit.eccentricity ** 2 - 1) * Math.sinh(F)
  } else {
    let E = M + orbit.eccentricity * Math.sin(M)
    for (let i = 0; i < 10; i++) {
      const gradient = 1 - orbit.eccentricity * Math.cos(E)
      E -= (E - orbit.eccentricity * Math.sin(E) - M) / gradient
    }
    if (Math.abs(E - orbit.eccentricity * Math.sin(E) - M) > 1e-9) {
      let lo = -Math.PI
      let hi = Math.PI
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2
        if (mid - orbit.eccentricity * Math.sin(mid) < M) lo = mid
        else hi = mid
      }
      E = (lo + hi) / 2
    }
    px = orbit.semiMajor * (Math.cos(E) - orbit.eccentricity)
    py = orbit.semiMajor * Math.sqrt(1 - orbit.eccentricity ** 2) * Math.sin(E)
  }
  const sideways = new Vector3().crossVectors(orbit.planeNormal, orbit.periapsis)
  return target
    .copy(orbit.periapsis)
    .multiplyScalar(px)
    .addScaledVector(sideways, py)
}

/** One grain: released by the comet at `releaseTime` with the comet's own
 * state of motion, flying under radiation-reduced gravity, evaluated at
 * `now`. */
export function cometDustPosition(releaseTime: number, beta: number, now: number, target: Vector3): Vector3 {
  const releasePosition = cometPosition(releaseTime, target)
  const before = cometPosition(releaseTime - VELOCITY_STEP, new Vector3())
  const after = cometPosition(releaseTime + VELOCITY_STEP, new Vector3())
  const releaseVelocity = after.sub(before).divideScalar(VELOCITY_STEP * 2)
  const orbit = dustOrbit(releasePosition, releaseVelocity, beta)
  return dustPositionAt(orbit, now - releaseTime, target)
}
