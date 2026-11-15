/**
 * The pilot's exposure: how hard the star burns on their screen. A personal
 * viewing preference, persisted like the locale and the ambience — the deep
 * link carries the sky, the screen carries its brightness. The value feeds
 * the renderer's tone-mapping exposure (SceneCanvas), which multiplies the
 * whole frame before the ACES curve clips it.
 */

export const EXPOSURE_DEFAULT = 1.1
export const EXPOSURE_MIN = 0.6
export const EXPOSURE_MAX = 1.8

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
