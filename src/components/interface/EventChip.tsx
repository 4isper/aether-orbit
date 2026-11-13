import type { EventAnnouncement } from '../SpaceScene'
import { t, type Locale, type StringKey } from '../../strings'
import type { SceneView } from '../../planets'

/** The event chip's label, one string per kind of sky moment; a conjunction
 * names its pair, which the announcing view already knows. */
function eventLabel(kind: EventAnnouncement['kind'], view: SceneView): StringKey {
  if (kind === 'transit') return 'eventTransit'
  if (kind === 'eclipse') return 'eventEclipse'
  if (kind === 'perihelion') return 'eventPerihelion'
  if (kind === 'storm') return 'eventStorm'
  return view === 'cinder' ? 'eventConjunctionVesper' : 'eventConjunctionAurelia'
}

function formatDuration(seconds: number, locale: Locale) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0
    ? t(locale, 'eventDuration', { m, s })
    : t(locale, 'eventSeconds', { s })
}

/** The countdown chip: which moment, when, and the jump to its peak. */
export function EventChip({
  event,
  view,
  locale,
  ready,
  onSeek,
}: {
  event: EventAnnouncement
  view: SceneView
  locale: Locale
  ready: boolean
  onSeek: () => void
}) {
  return (
    <div className="event-chip reveal" role="status">
      <span className="event-label">
        {t(locale, eventLabel(event.kind, view))}
      </span>
      <strong>
        {event.inProgress
          ? t(locale, 'eventNow')
          : t(locale, 'eventIn', { time: formatDuration(event.seconds, locale) })}
      </strong>
      <button type="button" className="event-go" onClick={onSeek} disabled={!ready}>
        {t(locale, 'eventGo')}
      </button>
    </div>
  )
}
