/**
 * Deterministic LCG random: same seed always yields the same sequence, which
 * keeps procedurally scattered bodies (belt, starfield) stable between runs.
 */
export function createRandom(seed: number) {
  let value = seed
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}
