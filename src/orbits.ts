import { Vector3 } from 'three'
import { createKeplerOrbit, type KeplerElements } from './kepler.ts'
import type { PlanetId } from './planets'

/** Aurelia's calibration, the system's gravity constant in scene units:
 * every heliocentric lap — planets, belt, comet, dwarf, dust — rides
 * keplerSpeed at its own semi-major axis, so the law stays one. The same
 * axis is where starlight reads unity (starFlux) and the pilot's eye
 * meters (exposure.ts). */
export const AURELIA_SEMI_MAJOR = 9
const AURELIA_SPEED = 0.02

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
 * The planets' orbits: light ellipses on the shared Kepler-3 clock. The
 * semi-major axes keep the old circular radii, so every period stays at its
 * calibration — Aurelia's lap is exactly the 0.02 the whole system is
 * scaled to (mean motion rides keplerSpeed at the semi-major axis, which
 * the authored circle speeds approximated to 0.7%). Kepler II now breathes
 * through the inner system too: every world runs fastest at periapsis and
 * the star's light at each of them sways with the year. The periapsis
 * longitudes are spread so no two conjunction clocks sync.
 */
const orbitConfig: Record<PlanetId, KeplerElements> = {
  aurelia: {
    periapsis: 8.811, // 9·(1−0.021), Earth-like
    apoapsis: 9.189, // 9·(1+0.021)
    argumentOfPeriapsis: 0.9,
    inclination: 0.028,
    meanAnomalyAtZero: 3.6,
  },
  cinder: {
    periapsis: 13.37, // 14·(1−0.045)
    apoapsis: 14.63, // 14·(1+0.045)
    argumentOfPeriapsis: 2.3,
    inclination: 0.05,
    meanAnomalyAtZero: 5.8,
  },
  vesper: {
    periapsis: 18.88, // 20·(1−0.056), Saturn-like
    apoapsis: 21.12, // 20·(1+0.056)
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
 * breathing real trojans show — while the satellite-clock fiction of the
 * aureliaClock note keeps it captive.
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
 * orbits. The moon must orbit above the synchronous orbit (its period above
 * the planet's day) or tides would pull it down; with these numbers the day
 * lasts ~60 units, the moon's month ~79, and a year holds ~4 months.
 *
 * Declared compact-scale fictions (the scene's scale is artistic, see
 * README): this clock implies GM(Aurelia) = moonAngularSpeed²·moonOrbitRadius³
 * ≈ 0.299 scene units against the star's GM ≈ 0.292 (ω²a³ of the planets) —
 * a mass ratio ≈ 0.51 that breaks the Routh stability limit (0.0385) which
 * keeps real L4/L5 trojans captive, and puts the moon at ~0.72 of the Hill
 * radius where prograde long-term stability wants ≲ 0.5. A real planet shows
 * ~12 months per year, not 4. The trojans below are therefore pinned
 * kinematically, and the satellite clocks are declared, not derived.
 */
export const aureliaClock = {
  /** Planet spin, radians per time unit. */
  spin: 0.105,
  /** Moon mean motion, radians per time unit. */
  moonAngularSpeed: 0.08,
  /** Moon orbit radius around Aurelia, in scene units. */
  moonOrbitRadius: 3.6,
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
  /** Euler angles of the moon-orbit group inside the planet frame. */
  moonOrbitRotation: [0.24, 0, 0.09],
  /** Planet surface radius, scene units (before the compact-scale). */
  planetRadius: 2,
  /** Moon surface radius, scene units (before the compact-scale). */
  moonRadius: 0.34,
} as const

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
  /** Planet spin, radians per time unit. */
  spin: 0.004,
} as const

/** Cinder's surface phase on the shared clock: pure like Aurelia's spin. */
export function cinderSpinPhase(time: number) {
  return time * cinderClock.spin
}

/**
 * Vesper's own clock: the shepherd moon pacing the Cassini gap. Its orbit
 * radius sits inside the gap's core (the ring t in [0.64, 0.70] of the
 * density shared by Vesper.tsx) — one body, one story: the moon is what
 * keeps the gap swept clear.
 */
export const vesperClock = {
  /** Shepherd orbit radius in Vesper's local frame, scene units. */
  shepherdOrbitRadius: 3.5,
  /** Shepherd mean motion, radians per time unit — orbital-fast against the
   * planet's day, far slower than Aurelia's moon, as befits a lighter world. */
  shepherdAngularSpeed: 0.065,
  /** Where in its lap the shepherd starts. */
  shepherdPhase: 1.9,
  /** Planet spin, radians per time unit — pure phase, like the rest. */
  spin: 0.005,
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
  /** Dwarf spin, radians per time unit. */
  spin: 0.02,
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
 * Vesper's gravity in scene units, implied by the shepherd's own clock
 * (shepherdAngularSpeed² · shepherdOrbitRadius³ ≈ 0.181): the ring's ice
 * rides the same pull, so every rock's mean motion follows
 * keplerSpeedAroundVesper at its own radius — the ring shears, and the
 * shepherd co-moves with the material it guards.
 */
export const vesperGM = vesperClock.shepherdAngularSpeed ** 2 * vesperClock.shepherdOrbitRadius ** 3

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

const beltRingShapes = [
  { inner: 15.5, outer: 16.7, count: 640, spread: 0.34, seed: 907 },
  { inner: 16.7, outer: 17.7, count: 540, spread: 0.42, seed: 2903 },
  { inner: 17.7, outer: 18.6, count: 440, spread: 0.34, seed: 4409 },
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
