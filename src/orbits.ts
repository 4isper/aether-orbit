import { Euler, Quaternion, Vector3 } from 'three'
import { createKeplerOrbit, type KeplerElements } from './kepler.ts'
import type { PlanetId } from './planets'

/**
 * The honest unit system: one scene unit is one Earth radius (6371 km), one
 * time unit is one day. Aurelia is the Earth analog: its semi-major axis is
 * one astronomical unit — 149.6 million km = 23 483 Earth radii — and its
 * year is exactly 365.25 days. Every heliocentric lap — planets, belt,
 * comet, dwarf, dust — rides keplerSpeed at its own semi-major axis, so the
 * law stays one. The same axis is where starlight reads unity (starFlux)
 * and the pilot's eye meters (exposure.ts).
 */
export const AURELIA_SEMI_MAJOR = 23_483
const AURELIA_SPEED = (Math.PI * 2) / 365.25

/** The authored orbit ratios rescaled to the honest unit: every element
 * below keeps its old shape, multiplied by ORBIT_SCALE, so the
 * conjunction and synodic choreography is unchanged. */
export const ORBIT_SCALE = AURELIA_SEMI_MAJOR / 9

/**
 * The system's gravity constant in scene units, implied by Kepler-3 at
 * Aurelia's orbit: GM(Solis) = AURELIA_SPEED²·a³ ≈ 3.836e9. Planet masses
 * anchor to it by the honest mass ratios below — Aurelia 1.3 Earth masses
 * for a 1.12 R⊕ rocky world, Vesper 1.55 for its ringed 1.21 R⊕ frame.
 */
export const STAR_GM = AURELIA_SPEED ** 2 * AURELIA_SEMI_MAJOR ** 3
const EARTH_MASSES_PER_SUN = 332_946
const massRatio = (earthMasses: number) => earthMasses / EARTH_MASSES_PER_SUN

/**
 * Honest surface radii, scene units = Earth radii — the same numbers the
 * telemetry shows (planets.ts) and the meshes render. Solis keeps the IAU
 * nominal solar radius: 695 700 km = 109.2 Earth radii, 215 of which span
 * one astronomical unit.
 */
export const SOLIS_RADIUS = 109.2

/** Surface radii of the wandering bodies (Solis lives in SOLIS_RADIUS). */
export const BODY_RADII = {
  aurelia: 1.12,
  cinder: 1.03,
  vesper: 1.21,
  moon: 0.19,
  comet: 0.002,
  erebus: 0.98,
} as const

/**
 * Circular-orbit mean motion at a radius under the planets' Kepler-3 law:
 * speeds fall as a^-1.5 from Aurelia's calibration. Every heliocentric lap
 * outside the planet table rides this — one gravity constant for the whole
 * system, so the belt can never drift onto its own clock.
 */
export function keplerSpeed(radius: number) {
  return AURELIA_SPEED * (AURELIA_SEMI_MAJOR / radius) ** 1.5
}

/**
 * The planets' orbits: light ellipses on the shared Kepler-3 clock, in
 * honest Earth radii. Aurelia laps at exactly one astronomical unit per
 * 365.25 days; Cinder rides a Mars-like 1.56 AU, Vesper a ringed 2.22 AU.
 * Kepler II breathes through the inner system: every world runs fastest at
 * periapsis and the star's light at each of them sways with the year. The
 * periapsis longitudes are spread so no two conjunction clocks sync.
 */
const orbitConfig: Record<PlanetId, KeplerElements> = {
  aurelia: {
    periapsis: 8.811 * ORBIT_SCALE, // 1 AU·(1−0.021), Earth-like
    apoapsis: 9.189 * ORBIT_SCALE, // 1 AU·(1+0.021)
    argumentOfPeriapsis: 0.9,
    inclination: 0.028,
    meanAnomalyAtZero: 3.6,
  },
  cinder: {
    periapsis: 13.37 * ORBIT_SCALE, // 1.556 AU·(1−0.045)
    apoapsis: 14.63 * ORBIT_SCALE, // 1.556 AU·(1+0.045)
    argumentOfPeriapsis: 2.3,
    inclination: 0.05,
    meanAnomalyAtZero: 5.8,
  },
  vesper: {
    periapsis: 18.88 * ORBIT_SCALE, // 2.222 AU·(1−0.056), Saturn-like
    apoapsis: 21.12 * ORBIT_SCALE, // 2.222 AU·(1+0.056)
    argumentOfPeriapsis: 4.1,
    inclination: 0.075,
    meanAnomalyAtZero: 1.35,
  },
}

const orbitFactories = {
  aurelia: createKeplerOrbit(orbitConfig.aurelia),
  cinder: createKeplerOrbit(orbitConfig.cinder),
  vesper: createKeplerOrbit(orbitConfig.vesper),
} as const

/** Point on a planet's ellipse for a mean anomaly — the same solved-ellipse
 * machinery every eccentric wanderer rides. Uniform sampling traces the
 * whole curve (denser near periapsis, like the comet's orbit line). */
export function orbitPoint(id: PlanetId, meanAnomaly: number, target: Vector3) {
  return orbitFactories[id].orbitPoint(meanAnomaly, target)
}

export function planetPosition(id: PlanetId, time: number, target: Vector3) {
  return orbitFactories[id].position(time, target)
}

/** Mean anomaly on a planet's ellipse at simulation time — the same
 * parameter orbitPoint consumes. */
export function planetAngle(id: PlanetId, time: number) {
  return orbitConfig[id].meanAnomalyAtZero + time * orbitFactories[id].meanMotion
}

/** Orbital period of a planet, in time units. */
export function planetPeriod(id: PlanetId) {
  return orbitFactories[id].period
}

/**
 * Aurelia's L4 trojan: a captive of the gravity balance, riding the same
 * ellipse sixty degrees of *mean anomaly* ahead of the planet. On an
 * ellipse the pin librates in true longitude around ±60° — the tadpole
 * breathing real trojans show — and at the honest mass ratio below
 * (3.9e-6, far under the Routh limit 0.0385) the balance genuinely holds
 * the pin: L4/L5 are stable the way real trojans are.
 */
export const TROJAN_LEAD_ANGLE = Math.PI / 3
export const TROJAN_TRAIL_ANGLE = -Math.PI / 3

export function trojanPosition(time: number, target: Vector3) {
  return orbitPoint('aurelia', planetAngle('aurelia', time) + TROJAN_LEAD_ANGLE, target)
}

/** The trailing twin at L5: the same balance, sixty degrees behind the
 * planet, forever watching its back. */
export function trojanTrailingPosition(time: number, target: Vector3) {
  return orbitPoint('aurelia', planetAngle('aurelia', time) + TROJAN_TRAIL_ANGLE, target)
}

/**
 * Starlight flux at a world position, unity at Aurelia's orbit. Bodies
 * multiply their diffuse light by this so outer worlds are genuinely
 * dimmer than the inner ones — the honest inverse square now. The
 * legibility lives where it belongs: the pilot's eye meters the frame
 * (exposure.ts eyeAdaptation), so Vesper sits in real twilight instead of
 * reading as near-black.
 */
export function starFlux(position: Vector3) {
  return (AURELIA_SEMI_MAJOR / Math.max(position.length(), 1e-4)) ** 2
}

/**
 * Aurelia's own clock: how fast the planet spins and how fast its moon
 * orbits. The day is exactly one time unit — 24 hours. The moon flies the
 * real Moon's line, 60.3 planetary radii out (67.5 Earth radii), and its
 * month is *derived*, not declared: GM(Aurelia) = STAR_GM·(1.3 M⊕/M☉)
 * ≈ 1.50e4 gives ω = √(GM/r³) ≈ 0.2207 → a month of 28.5 days, a year of
 * 12.8 months. Every check of the old compact scale now passes honestly:
 * the mass ratio 3.9e-6 sits far under the Routh limit (0.0385) that keeps
 * L4/L5 trojans captive, and the moon rides at 0.26 of the Hill radius
 * (256 units) where prograde stability is comfortable. The moon is far
 * above the synchronous orbit (7.24 units for a 24-hour day), so tides
 * can never pull it down.
 */
export const AURELIA_GM = STAR_GM * massRatio(1.3)

export const aureliaClock = {
  /** Planet spin, radians per time unit: one lap per unit — a 24-hour day. */
  spin: Math.PI * 2,
  /** Moon mean motion, radians per time unit: derived from the planet's
   * honest GM at the real Moon's distance — a 28.5-day month. */
  moonAngularSpeed: Math.sqrt(AURELIA_GM / 67.5 ** 3),
  /** Moon orbit radius around Aurelia, in Earth radii: the real Moon's
   * 60.3 lunar distances from a 1.12 R⊕ planet. */
  moonOrbitRadius: 67.5,
  /** Moon phase at time zero: where in its orbit the month begins. */
  moonPhase: 2.1,
} as const

/**
 * Orientation of Aurelia's local frame in world space and of the moon orbit
 * inside it. Planet.tsx builds its scene graph from these same numbers, so
 * the pure geometry in eclipse.ts stays exact with a single source of truth.
 */
export const aureliaFrame = {
  /** Euler angles of the planet group in world space. */
  worldRotation: [0.08, 0, -0.09],
  /** Planet surface radius, scene units = Earth radii (telemetry is truth). */
  planetRadius: 1.12,
  /** Moon surface radius, scene units = Earth radii. */
  moonRadius: 0.19,
} as const

/**
 * The moon's orbit plane: 5.1° from the ecliptic — the real Moon's
 * inclination — with the nodes regressing a full circle in 18.6 years, the
 * real nodal precession. Without the regression a fixed node line lets
 * eclipse seasons cluster against the year-month beat (a shadow every few
 * years); with it the seasons come every ~173 days, the rhythm home keeps.
 */
export const MOON_INCLINATION = 0.089
export const MOON_NODE_PERIOD = 6_797

/** Azimuth of the ascending node at simulation time: regressing against
 * the moon's own motion, the way real nodes drift. */
export function moonNodeAngle(time: number) {
  return 2.1 - (Math.PI * 2 * time) / MOON_NODE_PERIOD
}

/** The base tilt: the orbit normal (local ŷ) leaned 5.1° off the world
 * vertical, node line on the world X axis. */
const MOON_TILT = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), MOON_INCLINATION)
const MOON_NODE_AXIS = new Vector3(0, 1, 0)

/** World orientation of the moon's orbit plane at simulation time: the
 * tilted plane swept around the ecliptic by the regressing node. */
export function moonOrbitWorldQuaternion(time: number, target: Quaternion) {
  return target.setFromAxisAngle(MOON_NODE_AXIS, moonNodeAngle(time)).multiply(MOON_TILT)
}

const qWorldInverse = new Quaternion()
  .setFromEuler(new Euler(...aureliaFrame.worldRotation))
  .invert()

/** Orientation of the moon-orbit group inside the planet frame: the world
 * plane expressed locally. Planet.tsx applies it per frame and eclipse.ts
 * mirrors the same composition, so the announced shadow and the rendered
 * shadow are one geometry. */
export function moonOrbitLocalQuaternion(time: number, target: Quaternion) {
  moonOrbitWorldQuaternion(time, target)
  return target.premultiply(qWorldInverse)
}

/** The moon's phase angle on Aurelia's shared clock: pure, so time reversal
 * and pause come for free and the tidal lock stays exact. */
export function moonPhaseAngle(time: number) {
  return aureliaClock.moonPhase + time * aureliaClock.moonAngularSpeed
}

/** Aurelia's surface phase on the same clock: pure like the moon's, so a
 * deep link lands on the same continents a live session would have brought
 * around, and reversed playback rewinds the ground. The cloud deck rides
 * 1.5x this rate — a slow gale over the ground (Planet.tsx). */
export function aureliaSpinPhase(time: number) {
  return time * aureliaClock.spin
}

/**
 * Cinder's own clock: how fast the ash world spins. Declared like every
 * satellite clock, but a pure phase of the shared time like Aurelia's —
 * pause freezes it, reversal rewinds it and a deep link lands on the same
 * face a live session would have brought around.
 */
export const cinderClock = {
  /** Planet spin, radians per time unit: a 1.03-day spin, Mars-like. */
  spin: (Math.PI * 2) / 1.03,
} as const

/** Cinder's surface phase on the shared clock: pure like Aurelia's spin. */
export function cinderSpinPhase(time: number) {
  return time * cinderClock.spin
}

/**
 * Vesper's rings in honest units: 1.5–2.4 planetary radii out from the
 * 1.21 R⊕ world — the span real ring systems keep around their Roche
 * zone (Saturn's rings reach 2.27 R). Vesper.tsx and ring-rocks.ts build
 * their geometry from this same span.
 */
export const VESPER_RING_INNER = 1.5 * 1.21 // 1.815
export const VESPER_RING_OUTER = 2.4 * 1.21 // 2.904
/** The Cassini gap's core as a fraction of the ring span — the density
 * zero shared by Vesper.tsx and plumes.ts. */
export const VESPER_GAP_CORE = 0.67

/**
 * Vesper's own clock: the shepherd moon pacing the Cassini gap. Its orbit
 * radius sits inside the gap's core of the honest ring span — one body,
 * one story: the moon is what keeps the gap swept clear. Its mean motion
 * is *derived* from the planet's honest GM (1.55 M⊕ for a 1.21 R⊕ rocky
 * frame) exactly the way keplerSpeedAroundVesper drives the ring ice, so
 * the shepherd co-moves with the material it guards: a 4.6-hour lap, the
 * pace real ring shepherds keep.
 */
export const VESPER_GM = STAR_GM * massRatio(1.55)

export const vesperClock = {
  /** Shepherd orbit radius in Vesper's local frame, scene units: the gap's
   * core of the honest ring span. */
  shepherdOrbitRadius: VESPER_RING_INNER + (VESPER_RING_OUTER - VESPER_RING_INNER) * VESPER_GAP_CORE,
  /** Shepherd mean motion, radians per time unit: derived from Vesper's
   * honest GM at the gap radius. */
  shepherdAngularSpeed: Math.sqrt(VESPER_GM / (VESPER_RING_INNER + (VESPER_RING_OUTER - VESPER_RING_INNER) * VESPER_GAP_CORE) ** 3),
  /** Where in its lap the shepherd starts. */
  shepherdPhase: 1.9,
  /** Planet spin, radians per time unit: a 0.44-day lap, Saturn-fast. */
  spin: (Math.PI * 2) / 0.44,
} as const

/** Vesper's surface phase on the shared clock: pure like Aurelia's spin. */
export function vesperSpinPhase(time: number) {
  return time * vesperClock.spin
}

/**
 * Erebus's own clock: the dark dwarf turns slowly, most of its year spent
 * far out past the belt. A pure phase of the shared time like the rest.
 */
export const erebusClock = {
  /** Dwarf spin, radians per time unit: a slow 1.5-day tumble. */
  spin: (Math.PI * 2) / 1.5,
} as const

/** Erebus's surface phase on the shared clock: pure like Aurelia's spin. */
export function erebusSpinPhase(time: number) {
  return time * erebusClock.spin
}

/** The shepherd's angle on the shared clock: pure like the moon's phase. */
export function shepherdAngle(time: number) {
  return vesperClock.shepherdPhase + time * vesperClock.shepherdAngularSpeed
}

/** Shepherd position in Vesper's local frame: the ring plane is local XZ. */
export function shepherdLocalPosition(time: number, target: Vector3) {
  const angle = shepherdAngle(time)
  const radius = vesperClock.shepherdOrbitRadius
  return target.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
}

/**
 * Vesper's gravity in scene units (≈ 1.79e4, from the honest mass ratio):
 * the ring's ice rides the same pull, so every rock's mean motion follows
 * keplerSpeedAroundVesper at its own radius — the ring shears, and the
 * shepherd co-moves with the material it guards.
 */
export const vesperGM = VESPER_GM

/** Circular-orbit mean motion at a radius around Vesper: Kepler with the
 * planet's implied GM. */
export function keplerSpeedAroundVesper(radius: number) {
  return Math.sqrt(vesperGM / radius ** 3)
}

export type BeltRingConfig = {
  /** Inner edge of the ring, scene units. */
  inner: number
  /** Outer edge of the ring, scene units. */
  outer: number
  /** Number of instanced rocks in the ring. */
  count: number
  /** Mean motion at the ring's midline, radians per time unit. */
  speed: number
  /** Vertical scatter of the rocks, scene units. */
  spread: number
  /** Deterministic seed of the rock placement. */
  seed: number
}

/** The belt's three debris rings between Cinder and Vesper: 1.72–2.07 AU,
 * the inner main belt. Ringlet thickness rides the same scale (~0.04 AU). */
const beltRingShapes = [
  { inner: 15.5 * ORBIT_SCALE, outer: 16.7 * ORBIT_SCALE, count: 640, spread: 0.34 * ORBIT_SCALE, seed: 907 },
  { inner: 16.7 * ORBIT_SCALE, outer: 17.7 * ORBIT_SCALE, count: 540, spread: 0.42 * ORBIT_SCALE, seed: 2903 },
  { inner: 17.7 * ORBIT_SCALE, outer: 18.6 * ORBIT_SCALE, count: 440, spread: 0.34 * ORBIT_SCALE, seed: 4409 },
] as const

/** The belt's three debris rings between Cinder and Vesper. The speed is not
 * authored: each ring rides keplerSpeed at its midline, the planets' own
 * Kepler-3. Belt.tsx instances the rocks; the clock lives here with every
 * other clock of the system. */
export const beltRings: BeltRingConfig[] = beltRingShapes.map((ring) => ({
  ...ring,
  speed: keplerSpeed((ring.inner + ring.outer) / 2),
}))

/**
 * The belt's own clock: where the camera anchor drifts inside the debris
 * rings. The anchor rides the middle ring's mean motion, so the rocks around
 * the viewpoint stay companions for a while instead of streaming past.
 */
export const beltClock = {
  /** Anchor orbit radius, scene units — the middle ring's midline. */
  anchorRadius: (beltRings[1].inner + beltRings[1].outer) / 2,
  /** Anchor mean motion, radians per time unit — the middle ring's speed. */
  anchorSpeed: beltRings[1].speed,
  /** Where the anchor starts on its lap. */
  anchorPhase: 4.2,
} as const

/** The camera anchor's angle on the shared clock: pure like every other. */
export function beltAnchorAngle(time: number) {
  return beltClock.anchorPhase + time * beltClock.anchorSpeed
}

/** Anchor position in world space: the belt plane is the world XZ plane. */
export function beltAnchorPosition(time: number, target: Vector3) {
  const angle = beltAnchorAngle(time)
  const radius = beltClock.anchorRadius
  return target.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
}
