import type { EventAnnouncement } from '../SpaceScene'
import { t, type Locale } from '../../strings'
import type { SceneView } from '../../planets'
import { eventLabel, formatDuration } from './event-copy'

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
