import { t, type Locale } from '../../strings'
import type { EventAnnouncement } from '../SpaceScene'
import { EventChip } from './EventChip'

/** The overview's copy: what the map is and how to leave it. The map has no
 * sky moment of its own, but a shower rains over it — the chip announces it. */
export function SystemPanel({
  locale,
  travelling,
  ready,
  event,
  onSeekEvent,
}: {
  locale: Locale
  travelling: boolean
  ready: boolean
  event: EventAnnouncement | null
  onSeekEvent: () => void
}) {
  return (
    <>
      <section className="system-intro reveal" aria-labelledby="scene-title" aria-hidden={travelling}>
        <p className="eyebrow">{t(locale, 'threeWorlds')}</p>
        <h1 id="scene-title">{t(locale, 'systemOverview')}</h1>
        <p>{t(locale, 'choosePlanet')}</p>
      </section>
      <p className="system-note reveal" aria-hidden={travelling}>{t(locale, 'orbitsNote')}</p>
      {event && !travelling && (
        <EventChip event={event} view="system" locale={locale} ready={ready} onSeek={onSeekEvent} />
      )}
    </>
  )
}
