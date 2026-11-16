/**
 * The pilot's exposure: how hard the star burns on their screen. A personal
 * viewing preference, persisted like the locale and the ambience — the deep
 * link carries the sky, the screen carries its brightness. The value feeds
 * the renderer's tone-mapping exposure (SceneCanvas), which multiplies the
 * whole frame before the ACES curve clips it. On top of the preference the
 * eye meters the frame: the honest inverse-square falloff of starFlux is
 * partially compensated by the camera's distance from Solis, like an eye
 * opening in the dark — the outer worlds stay genuinely darker, the inner
 * system genuinely brighter, and nothing turns black.
 */

import { AURELIA_SEMI_MAJOR } from './orbits.ts'

export const EXPOSURE_DEFAULT = 1.1
export const EXPOSURE_MIN = 0.6
export const EXPOSURE_MAX = 1.8

/** A third of full auto-exposure: the effective falloff becomes
 * (r/9)^1.7 — a real twilight at Vesper, not the black of an
 * uncompensated square. */
const EYE_EXPONENT = 0.3
export const EYE_MIN = 0.75
export const EYE_MAX = 1.55

/** How much the pilot's eye opens at a distance from Solis, in scene
 * units: 1 at Aurelia's orbit, ~1.26 at Vesper, ~0.81 diving at the
 * comet's perihelion. Junk distances read as unity. */
export function eyeAdaptation(distance: number): number {
  if (!Number.isFinite(distance)) return 1
  const opened = (Math.max(distance, 1e-4) / AURELIA_SEMI_MAJOR) ** EYE_EXPONENT
  return Math.min(EYE_MAX, Math.max(EYE_MIN, opened))
}

const STORAGE_KEY = 'aether-exposure'

type ExposureStorage = Pick<Storage, 'getItem' | 'setItem'>

/** Clamp any candidate into the honest range; junk reads as the default. */
export function clampExposure(value: number): number {
  if (!Number.isFinite(value)) return EXPOSURE_DEFAULT
  return Math.min(EXPOSURE_MAX, Math.max(EXPOSURE_MIN, value))
}

/** Read the stored preference, clamped; the default when absent or junk. */
export function readStoredExposure(storage: ExposureStorage = window.localStorage): number {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null || raw === '') return EXPOSURE_DEFAULT
    return clampExposure(Number(raw))
  } catch {
    return EXPOSURE_DEFAULT
  }
}

/** Persist the preference; failures keep the old one (private mode). */
export function storeExposure(value: number, storage: ExposureStorage = window.localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, String(clampExposure(value)))
  } catch {
    // private mode: the choice just does not persist
  }
}
