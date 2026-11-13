import { t, type Locale, type StringKey } from '../../strings'
import type { EventAnnouncement } from '../SpaceScene'
import type { SceneView } from '../../planets'

/** The event's label, one string per kind of sky moment; a conjunction
 * names its pair, which the announcing view already knows. Shared between
 * the orbit chip and the cinema toast, which tell the same story with
 * different chrome. */
export function eventLabel(kind: EventAnnouncement['kind'], view: SceneView): StringKey {
  if (kind === 'transit') return 'eventTransit'
  if (kind === 'eclipse') return 'eventEclipse'
  if (kind === 'perihelion') return view === 'erebus' ? 'eventPerihelionErebus' : 'eventPerihelion'
  if (kind === 'storm') return 'eventStorm'
  if (kind === 'shower') return 'eventShower'
  return view === 'cinder' ? 'eventConjunctionVesper' : 'eventConjunctionAurelia'
}

/** The countdown text: minutes and seconds past the minute mark. */
export function formatDuration(seconds: number, locale: Locale) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0
    ? t(locale, 'eventDuration', { m, s })
    : t(locale, 'eventSeconds', { s })
}
