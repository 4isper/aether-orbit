/**
 * The last session, persisted like the locale and the ambience choice: the
 * address bar carries a shared frame, the storage carries where the visitor
 * actually left off. One record, merged on every save, validated once on
 * load — the scene's own views are the boundary, anything else is dropped.
 */
import type { CameraPose } from './camera-math.ts'
import type { SceneView } from './planets.ts'

const STORAGE_KEY = 'aether-session'
/** Same sanity bound as the deep link's t=: beyond it the record is noise. */
const MAX_TIME = 1e9

export type StoredSession = {
  view?: SceneView
  pose?: CameraPose
  time?: number
}

type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>

function validPose(pose: unknown): pose is CameraPose {
  if (typeof pose !== 'object' || pose === null) return false
  const { yaw, pitch, zoom } = pose as Record<string, unknown>
  return [yaw, pitch, zoom].every((value) => typeof value === 'number' && Number.isFinite(value))
}

/** The raw record as stored; null when absent or unreadable. */
function readRaw(storage: SessionStorage): StoredSession | null {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as StoredSession
  } catch {
    // malformed JSON: the record just does not persist
    return null
  }
}

/**
 * Read the stored session, or null when it is absent, malformed, or names a
 * view the scene does not know — a stale record outliving a renamed view
 * must not restore a pose against the wrong body, so the record as a whole
 * is rejected. `views` is the scene's own list, the single boundary.
 */
export function loadSession(storage: SessionStorage, views: readonly SceneView[]): StoredSession | null {
  const raw = readRaw(storage)
  if (!raw) return null
  const session: StoredSession = {}
  if (typeof raw.view === 'string' && views.includes(raw.view as SceneView)) {
    session.view = raw.view as SceneView
  }
  if (validPose(raw.pose)) session.pose = raw.pose
  if (typeof raw.time === 'number' && Number.isFinite(raw.time) && Math.abs(raw.time) < MAX_TIME) {
    session.time = raw.time
  }
  return Object.keys(session).length > 0 ? session : null
}

/** Merge `patch` into the stored record; failures keep the old one. */
export function saveSession(storage: SessionStorage, patch: StoredSession): void {
  try {
    const session = { ...readRaw(storage), ...patch }
    storage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // private mode: the session just does not persist
  }
}
