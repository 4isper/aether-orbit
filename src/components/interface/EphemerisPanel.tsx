import { t, type Locale } from '../../strings'
import type { EphemerisPayload } from '../../ephemerides.ts'
import { ephemerisLabel, formatDuration } from './event-copy'

/**
 * The ephemerides panel: every sky moment the scanners promise, one list
 * whatever view holds the camera. The scene recasts the schedule once per
 * second while it is open, so the countdowns breathe with the clock; each
 * row's "skip" lands on that moment's peak, exactly like the orbit chip.
 */
export function EphemerisPanel({
  locale,
  payload,
  onSeek,
  onClose,
}: {
  locale: Locale
  payload: EphemerisPayload | null
  onSeek: (moment: number) => void
  onClose: () => void
}) {
  return (
    <aside className="ephemeris-panel reveal" role="region" aria-label={t(locale, 'ephemerides')}>
      <div className="ephemeris-head">
        <span>{t(locale, 'ephemerides')}</span>
        <button
          type="button"
          className="ephemeris-close"
          aria-label={t(locale, 'ephemeridesClose')}
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {payload && (
        <div className="ephemeris-rows">
          {payload.entries.map((entry) => {
            const inProgress = entry.entry <= payload.now && payload.now <= entry.exit
            const wait = Math.max(entry.entry - payload.now, 0)
            return (
              <div className="ephemeris-row" key={`${entry.kind}-${entry.body ?? ''}-${entry.peak}`}>
                <span className="ephemeris-label">{t(locale, ephemerisLabel(entry))}</span>
                <strong className={inProgress ? 'is-now' : ''}>
                  {inProgress
                    ? t(locale, 'eventNow')
                    : t(locale, 'eventIn', { time: formatDuration(wait, locale) })}
                </strong>
                <button
                  type="button"
                  className="event-go"
                  onClick={() => onSeek(entry.peak)}
                >
                  {t(locale, 'eventGo')}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )
}
