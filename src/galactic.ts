import { Vector3 } from 'three'

/**
 * Milky Way band sampling: directions concentrated along a great circle -
 * the galactic plane - with a triangular latitude falloff away from it.
 * Pure and testable; Starfield.tsx mixes these with its uniform stars so
 * the sky gathers toward the band.
 */

const scratchHelper = new Vector3()
const scratchU = new Vector3()
const scratchV = new Vector3()

/**
 * One direction inside the band around `normal` (unit): a random azimuth
 * along the great circle plus a small latitude drawn from a triangular
 * distribution whose extremes reach about `latitudeSigma * 2.2` radians.
 */
export function galacticBandDirection(
  random: () => number,
  normal: Vector3,
  latitudeSigma: number,
  target: Vector3,
): Vector3 {
  scratchHelper.set(0, 1, 0)
  if (Math.abs(normal.dot(scratchHelper)) > 0.9) scratchHelper.set(1, 0, 0)
  const u = scratchU.crossVectors(scratchHelper, normal).normalize()
  const v = scratchV.crossVectors(normal, u)

  const azimuth = random() * Math.PI * 2
  const latitude = (random() + random() - 1) * latitudeSigma * 2.2
  const cosLatitude = Math.cos(latitude)

  return target
    .copy(u)
    .multiplyScalar(Math.cos(azimuth) * cosLatitude)
    .addScaledVector(v, Math.sin(azimuth) * cosLatitude)
    .addScaledVector(normal, Math.sin(latitude))
    .normalize()
}
