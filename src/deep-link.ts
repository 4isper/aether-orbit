import type { CameraPose } from './camera-math.ts'
import { poseParams } from './camera-math.ts'
import type { SceneView } from './planets.ts'

/**
 * The deep-link URL contract in one place: which body is framed (view), how
 * the camera orbits it (pose) and which simulation moment is on screen (time,
 * seconds on the shared deterministic clock). The address bar alone must be
 * enough to reproduce a frame.
 */

/** Sanity bound for a shared time: anything beyond it is a malformed link,
 * not a moment anyone could reach by watching the sky. */
const MAX_TIME = 1e9

/** Query-string fragment for the shared sim time, e.g. "t=128.4"; one decimal
 * keeps roundtrips exact while the address stays short. Null when the moment
 * is not shareable. */
export function formatTimeParam(time: number): string | null {
  if (!Number.isFinite(time) || Math.abs(time) >= MAX_TIME) return null
  // String, not toLocaleString: a thousands separator would poison the URL.
  return String(Math.round(time * 10) / 10)
}

/** Parse the shared time from URL params; null when missing or malformed. */
export function parseTimeParam(params: URLSearchParams): number | null {
  const raw = params.get('t')
  if (raw === null || raw === '') return null
  const time = Number(raw)
  if (!Number.isFinite(time) || Math.abs(time) >= MAX_TIME) return null
  return time
}

/** Sanity bounds for a pinned renderer resolution: outside them the value is
 * a malformed link, not a screen anyone holds. */
const MIN_PINNED_DPR = 0.5
const MAX_PINNED_DPR = 4

/**
 * Parse a pinned renderer resolution from URL params (?dpr=1); null when
 * missing or malformed. A pinned link freezes the quality ladder: the frame
 * renders at the resolution the address asks for, not at whatever the frame
 * rate meter happens to settle on this machine — the golden-frame harness
 * hangs its whole reproducibility contract on this.
 */
export function parseDprParam(params: URLSearchParams): number | null {
  const raw = params.get('dpr')
  if (raw === null || raw === '') return null
  const dpr = Number(raw)
  if (!Number.isFinite(dpr) || dpr < MIN_PINNED_DPR || dpr > MAX_PINNED_DPR) return null
  return dpr
}

/** The modes a link can ask for. 'idle' turns the scene into living
 * wallpaper: an endless tour in cinema mode, starting on arrival. */
export type ViewMode = 'idle'

/** Parse the mode from URL params; null when missing or unknown — a mode
 * the scene does not know is simply not asked for, never an error. */
export function parseModeParam(params: URLSearchParams): ViewMode | null {
  return params.get('mode') === 'idle' ? 'idle' : null
}

/** The address for a view with optional camera pose and shared moment.
 * Aurelia stays the bare home view; everything else names itself. */
export function deepLinkUrl(view: SceneView, pose?: CameraPose | null, time?: number | null): string {
  const parts: string[] = []
  if (view !== 'aurelia') parts.push(`view=${view}`)
  if (pose) parts.push(poseParams(pose))
  const timeParam = time == null ? null : formatTimeParam(time)
  if (timeParam !== null) parts.push(`t=${timeParam}`)
  if (parts.length === 0) return '/'
  return `/?${parts.join('&')}`
}
