import { t, type Locale, type StringKey } from '../../strings'
import type { EventAnnouncement } from '../SpaceScene'
import type { EventBody, EphemerisEntry } from '../../ephemerides.ts'
import type { SceneView } from '../../planets'

/** The event's label, one string per kind of sky moment; a conjunction
 * names its target and a periapsis names its world, so the entry carries
 * the body. Shared between the orbit chip, the cinema toast and the
 * ephemerides panel, which tell the same story with different chrome. */
export function ephemerisLabel(entry: Pick<EphemerisEntry, 'kind' | 'body'>): StringKey {
  if (entry.kind === 'transit') return 'eventTransit'
  if (entry.kind === 'eclipse') return 'eventEclipse'
  if (entry.kind === 'perihelion') return entry.body === 'erebus' ? 'eventPerihelionErebus' : 'eventPerihelion'
  if (entry.kind === 'storm') return 'eventStorm'
  if (entry.kind === 'shower') return 'eventShower'
  return entry.body === 'vesper' ? 'eventConjunctionVesper' : 'eventConjunctionAurelia'
}

/** The body the chip's view already knows: Cinder watches Vesper hide
 * behind Solis, Vesper watches Aurelia cross the disc, Erebus owns its
 * own plunge. */
function viewEventBody(view: SceneView): EventBody | undefined {
  if (view === 'erebus') return 'erebus'
  if (view === 'cinder') return 'vesper'
  if (view === 'vesper') return 'aurelia'
  return undefined
}

export function eventLabel(kind: EventAnnouncement['kind'], view: SceneView): StringKey {
  return ephemerisLabel({ kind, body: viewEventBody(view) })
}

/** The countdown text: minutes and seconds past the minute mark. */
export function formatDuration(seconds: number, locale: Locale) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0
    ? t(locale, 'eventDuration', { m, s })
    : t(locale, 'eventSeconds', { s })
}
