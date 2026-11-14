/**
 * The frame journal, persisted like the session and the locale: every saved
 * frame leaves a small preview and the address that reproduces it. One
 * bounded log, newest first — the oldest frames fall off as new ones land,
 * so the gallery never outgrows the storage. Each entry is validated once
 * on read, alone: one broken frame falls out, the rest survive.
 */
import type { CameraPose } from './camera-math.ts'
import type { SceneView } from './planets.ts'

const STORAGE_KEY = 'aether-journal'
/** Same sanity bound as the deep link's t=: beyond it the record is noise. */
const MAX_TIME = 1e9
/** A preview is a downscaled data URL; anything bigger would crowd the
 * storage quota and is treated as malformed rather than stored. */
const MAX_THUMBNAIL_CHARS = 200_000

/** How many frames the logbook keeps. */
export const JOURNAL_LIMIT = 12

export type JournalFrame = {
  view: SceneView
  pose?: CameraPose
  time?: number
  thumbnail: string
  takenAt: number
}

type JournalStorage = Pick<Storage, 'getItem' | 'setItem'>

function validPose(pose: unknown): pose is CameraPose {
  if (typeof pose !== 'object' || pose === null) return false
  const { yaw, pitch, zoom } = pose as Record<string, unknown>
  return [yaw, pitch, zoom].every((value) => typeof value === 'number' && Number.isFinite(value))
}

function validFrame(raw: unknown, views: readonly SceneView[]): JournalFrame | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (typeof record.view !== 'string' || !views.includes(record.view as SceneView)) return null
  if (typeof record.thumbnail !== 'string'
    || !record.thumbnail.startsWith('data:image/')
    || record.thumbnail.length > MAX_THUMBNAIL_CHARS) return null
  if (typeof record.takenAt !== 'number' || !Number.isFinite(record.takenAt) || record.takenAt <= 0) return null
  const frame: JournalFrame = {
    view: record.view as SceneView,
    thumbnail: record.thumbnail,
    takenAt: record.takenAt,
  }
  if (validPose(record.pose)) frame.pose = record.pose
  // Unlike the session record, a frame with an implausible moment is
  // rejected whole: the gallery must not show a preview it cannot
  // reproduce — restore would land on "now" instead of the frame.
  if (typeof record.time === 'number'
    && (!Number.isFinite(record.time) || Math.abs(record.time) >= MAX_TIME)) return null
  if (typeof record.time === 'number') frame.time = record.time
  return frame
}

/** The identity a frame repeats when the same moment is saved twice: the
 * logbook updates the entry's place instead of growing a duplicate. */
function frameIdentity(frame: Pick<JournalFrame, 'view' | 'time' | 'pose'>) {
  return JSON.stringify({ view: frame.view, time: frame.time ?? null, pose: frame.pose ?? null })
}

/** Read the logbook, newest first. Entries are judged one by one against
 * the scene's own views — the single boundary, as in the session record. */
export function readJournal(storage: JournalStorage, views: readonly SceneView[]): JournalFrame[] {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => validFrame(entry, views))
      .filter((entry): entry is JournalFrame => entry !== null)
  } catch {
    // malformed JSON: the logbook just does not persist
    return []
  }
}

/** Prepend a frame to the logbook and cap it; failures keep the old log. */
export function addJournalFrame(storage: JournalStorage, frame: JournalFrame, views: readonly SceneView[]): void {
  try {
    const known = validFrame(frame, views)
    if (!known) return
    const identity = frameIdentity(known)
    const rest = readJournal(storage, views).filter((entry) => frameIdentity(entry) !== identity)
    const log = [known, ...rest].slice(0, JOURNAL_LIMIT)
    storage.setItem(STORAGE_KEY, JSON.stringify(log))
  } catch {
    // private mode or a full quota: the logbook just does not persist
  }
}
