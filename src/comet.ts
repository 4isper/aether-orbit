import { Vector3 } from 'three'

export const cometOrbit = {
  periapsis: 4.6,
  apoapsis: 26,
  period: 90,
  argumentOfPeriapsis: 2.0,
  inclination: 0.21,
  meanAnomalyAtZero: 2.2,
}

const semiMajor = (cometOrbit.periapsis + cometOrbit.apoapsis) / 2
const eccentricity = (cometOrbit.apoapsis - cometOrbit.periapsis) / (cometOrbit.apoapsis + cometOrbit.periapsis)
const meanMotion = (Math.PI * 2) / cometOrbit.period

/**
 * Position on the comet's ellipse for a given mean anomaly. Kepler's equation
 * is solved with Newton iterations; eccentricity stays below 0.8 so this
 * converges everywhere.
 */
export function cometOrbitPoint(meanAnomaly: number, target: Vector3) {
  const normalized = meanAnomaly % (Math.PI * 2)
  let eccentric = normalized
  for (let i = 0; i < 10; i++) {
    eccentric -= (eccentric - eccentricity * Math.sin(eccentric) - normalized)
      / (1 - eccentricity * Math.cos(eccentric))
  }

  const planeX = semiMajor * (Math.cos(eccentric) - eccentricity)
  const planeY = semiMajor * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentric)
  const cosW = Math.cos(cometOrbit.argumentOfPeriapsis)
  const sinW = Math.sin(cometOrbit.argumentOfPeriapsis)
  const rotatedX = planeX * cosW - planeY * sinW
  const rotatedY = planeX * sinW + planeY * cosW
  const cosI = Math.cos(cometOrbit.inclination)
  const sinI = Math.sin(cometOrbit.inclination)

  return target.set(rotatedX, rotatedY * sinI, rotatedY * cosI)
}

export function cometPosition(time: number, target: Vector3) {
  return cometOrbitPoint(cometOrbit.meanAnomalyAtZero + meanMotion * time, target)
}
