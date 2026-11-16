import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { aureliaClock, aureliaSpinPhase, beltAnchorAngle, beltAnchorPosition, beltClock, beltRings, keplerSpeedAroundVesper, moonPhaseAngle, orbitPoint, planetPeriod, planetPosition, starFlux, vesperClock } from './orbits.ts'
import { planetIds } from './planets.ts'

const scratch = new Vector3()

test('planets stay on their ellipse between periapsis and apoapsis', () => {
  for (const id of planetIds) {
    // Mean anomaly 0 is the periapsis, π the apoapsis — the solved
    // ellipse's own extremes, whatever the periapsis longitude says.
    const peri = orbitPoint(id, 0, new Vector3()).length()
    const apo = orbitPoint(id, Math.PI, new Vector3()).length()
    assert.ok(apo > peri, `${id} elements are inverted`)
    for (let t = 0; t <= 500; t += 7.3) {
      const distance = planetPosition(id, t, scratch).length()
      assert.ok(
        distance >= peri - 1e-6 && distance <= apo + 1e-6,
        `${id} left its ellipse at t=${t}: ${distance}`,
      )
    }
    // The ellipse repeats exactly on its own period.
    const start = planetPosition(id, 120, new Vector3())
    const lap = planetPosition(id, 120 + planetPeriod(id), scratch)
    assert.ok(start.distanceTo(lap) < 1e-6, `${id} period drift ${start.distanceTo(lap)}`)
  }
})

test('orbits are tilted but stay close to the ecliptic', () => {
  for (const id of planetIds) {
    const radius = orbitPoint(id, 0, new Vector3()).length()
    let maxLift = 0
    for (let i = 0; i < 360; i++) {
      maxLift = Math.max(maxLift, Math.abs(orbitPoint(id, (i / 360) * Math.PI * 2, scratch).y))
    }
    assert.ok(maxLift > 0, `${id} orbit should be tilted`)
    assert.ok(maxLift < 0.15 * radius, `${id} tilt should stay shallow`)
  }
})

test('mean anomaly 0 sits at the periapsis radius', () => {
  // The elements pin Aurelia at a = 9, e = 0.021: mean anomaly 0 must land
  // on the periapsis, π on the apoapsis, whatever the longitude says.
  const peri = orbitPoint('aurelia', 0, new Vector3()).length()
  const apo = orbitPoint('aurelia', Math.PI, new Vector3()).length()
  assert.ok(Math.abs(peri - 8.811) < 1e-6, `periapsis ${peri}`)
  assert.ok(Math.abs(apo - 9.189) < 1e-6, `apoapsis ${apo}`)
})

test('planet positions move continuously', () => {
  for (const id of planetIds) {
    const previous = planetPosition(id, 100, new Vector3())
    for (let t = 100.5; t < 140; t += 0.5) {
      const next = planetPosition(id, t, scratch)
      const step = previous.distanceTo(next)
      assert.ok(step < 1, `${id} jumped ${step} units between t=${t - 0.5} and t=${t}`)
      previous.copy(next)
    }
  }
})

test('the moon orbits outside the synchronous orbit', () => {
  // Below the synchronous orbit the tide keeps pulling the moon in: no
  // stable satellite can orbit faster than its planet spins.
  const day = (Math.PI * 2) / aureliaClock.spin
  const month = (Math.PI * 2) / aureliaClock.moonAngularSpeed
  assert.ok(month > day, `moon period ${month.toFixed(1)} is not above the ${day.toFixed(1)} day`)
})

test('the moon makes a handful of orbits per year, Earth-scale', () => {
  const year = planetPeriod('aurelia')
  const month = (Math.PI * 2) / aureliaClock.moonAngularSpeed
  const monthsPerYear = year / month
  assert.ok(
    monthsPerYear > 2 && monthsPerYear < 7,
    `${monthsPerYear.toFixed(1)} months per year is outside the plausible band`,
  )
})

test('the surface phase rides the shared clock like the moon does', () => {
  // The continents must face the same way for a deep link as for a session
  // that ran there — pure phase of t, never an accumulator.
  assert.ok(Math.abs(aureliaSpinPhase(0)) < 1e-12)
  const day = (Math.PI * 2) / aureliaClock.spin
  const gain = aureliaSpinPhase(day) - aureliaSpinPhase(0)
  assert.ok(Math.abs(gain - Math.PI * 2) < 1e-9, `per-day gain ${gain}`)
  // Negative time (reversed playback) rewinds the phase by the same law.
  assert.ok(Math.abs(aureliaSpinPhase(-day) - aureliaSpinPhase(0) + Math.PI * 2) < 1e-9)
})

test('the moon phase angle advances exactly with the shared clock', () => {
  assert.ok(Math.abs(moonPhaseAngle(0) - aureliaClock.moonPhase) < 1e-12)
  const month = (Math.PI * 2) / aureliaClock.moonAngularSpeed
  // One month later the angle has gained exactly one full turn, whatever the
  // starting phase: the tidal lock depends on this being exact.
  const gain = moonPhaseAngle(month) - moonPhaseAngle(0)
  assert.ok(Math.abs(gain - Math.PI * 2) < 1e-9, `per-month gain ${gain}`)
  // Negative time (reversed playback) rewinds the phase by the same law.
  assert.ok(Math.abs(moonPhaseAngle(-month) - moonPhaseAngle(0) + Math.PI * 2) < 1e-9)
})

test('a year of Aurelia holds several day-night cycles', () => {
  const year = planetPeriod('aurelia')
  const day = (Math.PI * 2) / aureliaClock.spin
  const daysPerYear = year / day
  assert.ok(
    daysPerYear > 2 && daysPerYear < 60,
    `${daysPerYear.toFixed(1)} days per year is outside the plausible band`,
  )
})

test('planet speeds follow Kepler-3 at their semi-major axes', () => {
  // T ∝ a^1.5 at the ellipse's semi-major axis — the same law the belt,
  // the comet and the dwarf ride, now exact for the planets too.
  const aureliaSpeed = (Math.PI * 2) / planetPeriod('aurelia')
  const expected = {
    cinder: aureliaSpeed * (9 / 14) ** 1.5,
    vesper: aureliaSpeed * (9 / 20) ** 1.5,
  }
  for (const id of ['cinder', 'vesper'] as const) {
    const speed = (Math.PI * 2) / planetPeriod(id)
    const deviation = Math.abs(speed / expected[id] - 1)
    assert.ok(
      deviation < 1e-9,
      `${id} speed deviates ${(deviation * 1e9).toFixed(3)}e-9 from Kepler-3`,
    )
  }
})

test('starlight falls off with the honest inverse square, unity at Aurelia', () => {
  assert.ok(Math.abs(starFlux(new Vector3(9, 0, 0)) - 1) < 1e-9)
  const cinder = starFlux(new Vector3(14, 0, 0))
  const vesper = starFlux(new Vector3(20, 0, 0))
  assert.ok(Math.abs(cinder - (9 / 14) ** 2) < 1e-9, `Cinder flux ${cinder}`)
  assert.ok(Math.abs(vesper - (9 / 20) ** 2) < 1e-9, `Vesper flux ${vesper}`)
  assert.ok(cinder > vesper, 'inner worlds must receive more light')
  // The legibility compensation lives in the pilot's eye, not in the law.
  assert.ok(vesper > 0.19 && vesper < 0.21, `Vesper sits in twilight: ${vesper}`)
})

test('the belt anchor rides the middle ring between Cinder and Vesper', () => {
  for (const time of [0, 137.4, -240, 900]) {
    const anchor = beltAnchorPosition(time, new Vector3())
    const radius = anchor.length()
    assert.ok(
      Math.abs(radius - beltClock.anchorRadius) < 1e-9,
      `anchor radius ${radius} drifted off the middle ring`,
    )
    assert.ok(Math.abs(anchor.y) < 1e-9, 'the anchor left the belt plane')
    // Two full laps back lands on the same spot: the anchor is a pure
    // function of the clock, matching to a rounding hair.
    const sameLap = beltAnchorPosition(time - 2 * ((Math.PI * 2) / beltClock.anchorSpeed), new Vector3())
    assert.ok(
      anchor.distanceTo(sameLap) < 1e-6,
      `reversal drifted at t=${time}`,
    )
  }
  // The anchor stays between the worlds it sits among.
  const cinderRadius = orbitPoint('cinder', 0, new Vector3()).length()
  const vesperRadius = orbitPoint('vesper', 0, new Vector3()).length()
  assert.ok(beltClock.anchorRadius > cinderRadius && beltClock.anchorRadius < vesperRadius)
  // It drifts forward with the ring, not backwards with it.
  assert.ok(beltAnchorAngle(10) > beltAnchorAngle(0))
})

test('satellite clocks imply the declared compact-scale masses', () => {
  // The satellite speeds are declared, not derived from a mass table — the
  // scene's scale is artistic (see the fictions note in orbits.ts). Pin the
  // GMs their clocks imply, so any retune shows up here as a deliberate
  // change of the planets' implied masses, never as a silent drift.
  const starGM = ((Math.PI * 2) / planetPeriod('aurelia')) ** 2 * 9 ** 3
  const moonGM = aureliaClock.moonAngularSpeed ** 2 * aureliaClock.moonOrbitRadius ** 3
  const shepherdGM = vesperClock.shepherdAngularSpeed ** 2 * vesperClock.shepherdOrbitRadius ** 3
  assert.ok(Math.abs(starGM - 0.2916) < 1e-3, `star GM ${starGM}`)
  assert.ok(Math.abs(moonGM - 0.2986) < 1e-3, `Aurelia GM ${moonGM}`)
  assert.ok(Math.abs(shepherdGM - 0.1811) < 1e-3, `Vesper GM ${shepherdGM}`)
  // The trojans ride a kinematic pin: the implied mass ratio breaks the
  // Routh limit (0.0385) that keeps real L4/L5 captives stable. Documented
  // fiction — this assertion keeps it declared rather than forgotten.
  const routhLimit = 0.0385
  const aureliaRatio = moonGM / (starGM + moonGM)
  assert.ok(aureliaRatio > routhLimit, `Aurelia ratio ${aureliaRatio} slipped under Routh — update the trojan story`)
})

test('Vesper ring ice rides the shepherd\'s own Kepler law', () => {
  // The ring's ice obeys the planet's implied GM: mean motion falls as
  // r^-1.5, and at the shepherd's radius it moves exactly with the shepherd.
  assert.ok(
    Math.abs(keplerSpeedAroundVesper(vesperClock.shepherdOrbitRadius) - vesperClock.shepherdAngularSpeed) < 1e-12,
    'the shepherd lost the ring material it guards',
  )
  const inner = keplerSpeedAroundVesper(2.5)
  const outer = keplerSpeedAroundVesper(4)
  assert.ok(inner > outer, 'ring ice must shear: inner rocks overtake outer ones')
  assert.ok(
    Math.abs(keplerSpeedAroundVesper(5) * Math.pow(2, 1.5) - keplerSpeedAroundVesper(2.5)) < 1e-12,
    'ring mean motion must fall as r^-1.5',
  )
})

test('the belt rides the same Kepler-3 as the planets', () => {
  // T ∝ a^1.5 holds for the planets; the debris rings orbit the same star,
  // so one gravity constant must govern their midlines too. The
  // calibration lives at Aurelia's semi-major axis (9), not the momentary
  // radius the ellipse happens to be at.
  const aureliaSpeed = (Math.PI * 2) / planetPeriod('aurelia')
  const calibration = aureliaSpeed * 9 ** 1.5
  for (const ring of beltRings) {
    const midline = (ring.inner + ring.outer) / 2
    const own = ring.speed * midline ** 1.5
    const deviation = Math.abs(own / calibration - 1)
    assert.ok(
      deviation < 0.001,
      `ring seed=${ring.seed} deviates ${(deviation * 100).toFixed(1)}% from Kepler-3`,
    )
  }
  // Differential rotation: every ring overtakes the one outside it.
  for (let i = 1; i < beltRings.length; i++) {
    assert.ok(beltRings[i - 1].speed > beltRings[i].speed, `ring ${i} overtook the ring inside it`)
  }
  // The anchor rides the middle ring: its midline and its mean motion.
  const middle = beltRings[1]
  assert.ok(Math.abs(beltClock.anchorSpeed - middle.speed) < 1e-12, 'the anchor lost the middle ring')
  assert.ok(
    Math.abs(beltClock.anchorRadius - (middle.inner + middle.outer) / 2) < 1e-9,
    'the anchor left the middle ring midline',
  )
})
