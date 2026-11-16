import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { cometPosition } from './comet.ts'
import { STAR_GM, cometDustPosition, dustOrbit, dustPositionAt } from './dust.ts'

/** The comet's real state of motion at a moment: position plus a centered
 * finite-difference velocity, the same way the component feeds the tail. */
function cometState(time: number) {
  const position = cometPosition(time, new Vector3())
  const before = cometPosition(time - 0.05, new Vector3())
  const after = cometPosition(time + 0.05, new Vector3())
  const velocity = after.clone().sub(before).divideScalar(0.1)
  return { position, velocity }
}

test('a grain released by the comet starts on the comet', () => {
  // The elements must read the release state back exactly: evaluating the
  // orbit at the release moment returns the release position.
  const { position, velocity } = cometState(77.7)
  const orbit = dustOrbit(position, velocity, 0.2)
  const back = dustPositionAt(orbit, 0, new Vector3())
  assert.ok(back.distanceTo(position) < 1e-6, `roundtrip off by ${back.distanceTo(position)}`)
})

test('the grain\'s flight agrees with numeric integration', () => {
  // The closed-form solver must match a brute-force leapfrog through the
  // same reduced-gravity two-body problem.
  const { position, velocity } = cometState(77.7)
  const beta = 0.2
  const orbit = dustOrbit(position, velocity, beta)
  const mu = (1 - beta) * STAR_GM
  const r = position.clone()
  const v = velocity.clone()
  const dt = 0.015
  for (let i = 0; i < 2000; i++) {
    // velocity Verlet: 30 time units of flight
    v.addScaledVector(r, (-mu / Math.pow(r.length(), 3)) * dt / 2)
    r.addScaledVector(v, dt)
    v.addScaledVector(r, (-mu / Math.pow(r.length(), 3)) * dt / 2)
  }
  const flown = dustPositionAt(orbit, 30, new Vector3())
  assert.ok(flown.distanceTo(r) < 0.05, `solver drifted ${flown.distanceTo(r)} from integration`)
})

test('strong radiation pressure lets the grain escape, mild keeps it bound', () => {
  // Released near perihelion (t ≈ 452.6, r = 4.6), a grain escapes once β
  // passes 1 − r/(2a) ≈ 0.15: radiation pressure buys it a lighter sun.
  const { position, velocity } = cometState(452.6)
  const escaping = dustOrbit(position, velocity, 0.4)
  assert.ok(escaping.hyperbolic, 'the grain should be on an escape path')
  assert.ok(escaping.eccentricity > 1)
  const bound = dustOrbit(position, velocity, 0.12)
  assert.ok(!bound.hyperbolic, 'the mild grain should stay bound')
  assert.ok(bound.eccentricity < 1)
})

test('the dust trails behind the comet along the path of motion', () => {
  // The whole point of the ballistic tail: a grain released eight units ago
  // near perihelion hangs behind the head along the orbit's wake — its true
  // anomaly never catches up with the comet's. (Near perihelion the radial
  // motion dominates, so a velocity dot-product would read ~zero.)
  const beta = 0.4
  const now = 455
  const { position, velocity } = cometState(now - 8)
  const comet = dustOrbit(position, velocity, 0)
  const grain = cometDustPosition(now - 8, beta, now, new Vector3())
  const head = cometPosition(now, new Vector3())
  const trueAnomaly = (p: Vector3) => Math.atan2(
    new Vector3().crossVectors(comet.periapsis, p).dot(comet.planeNormal),
    comet.periapsis.dot(p),
  )
  const anomalyGrain = trueAnomaly(grain)
  const anomalyHead = trueAnomaly(head)
  assert.ok(
    anomalyHead - anomalyGrain > 0.01,
    `the grain caught up with the head: ${anomalyGrain.toFixed(3)} vs ${anomalyHead.toFixed(3)}`,
  )
})

test('one grain is a pure function of the clock', () => {
  const a = cometDustPosition(74, 0.3, 78.5, new Vector3())
  const b = cometDustPosition(74, 0.3, 78.5, new Vector3())
  assert.ok(a.distanceTo(b) < 1e-12)
  // Reversing the clock rewinds the grain along its own orbit.
  const forward = cometDustPosition(74, 0.3, 78.5, new Vector3())
  const past = cometDustPosition(74, 0.3, 74.5, new Vector3())
  assert.ok(forward.distanceTo(past) > 1e-6, 'the grain refuses to move')
})

test('the elliptic solver stays on the ellipse past half a lap', () => {
  // The mean anomaly grows unboundedly with flight time; the wrapped
  // anomaly must keep landing on the same periodic point, not on the
  // bisection bracket's edge.
  const { position, velocity } = cometState(77.7)
  const orbit = dustOrbit(position, velocity, 0.2)
  const period = (Math.PI * 2) / orbit.meanMotion
  const reference = dustPositionAt(orbit, 10, new Vector3())
  for (const laps of [1, 2, 5]) {
    const later = dustPositionAt(orbit, 10 + laps * period, new Vector3())
    assert.ok(reference.distanceTo(later) < 1e-6, `wrap drift ${reference.distanceTo(later)} after ${laps} laps`)
  }
})

test('the near-parabolic edge lands on the true Kepler solution', () => {
  // e → 1 flattens the equation's gradient near periapsis and stalls the
  // Newton starter: whatever branch or fallback the solver takes, the
  // position must match an independently bisected eccentric anomaly.
  const semiMajor = 5000
  const eccentricity = 0.99999
  const mu = (1 - 0.15) * STAR_GM
  const meanMotion = Math.sqrt(mu / semiMajor ** 3)
  const orbit = {
    semiMajor,
    eccentricity,
    periapsis: new Vector3(1, 0, 0),
    planeNormal: new Vector3(0, 0, 1),
    meanAnomaly: 0,
    meanMotion,
    hyperbolic: false,
  }
  const bisectedE = (m: number) => {
    let lo = -Math.PI
    let hi = Math.PI
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2
      if (mid - eccentricity * Math.sin(mid) < m) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  for (const m of [1e-5, 1e-3, 0.05, 0.5, Math.PI - 0.01, -0.5, -Math.PI + 0.01]) {
    const point = dustPositionAt(orbit, m / meanMotion, new Vector3())
    const e = bisectedE(m)
    const expected = new Vector3(
      semiMajor * (Math.cos(e) - eccentricity),
      semiMajor * Math.sqrt(1 - eccentricity ** 2) * Math.sin(e),
      0,
    )
    assert.ok(point.distanceTo(expected) < semiMajor * 1e-6, `M=${m}: off by ${point.distanceTo(expected)}`)
  }
})
