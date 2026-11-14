import { t, type Locale } from '../../strings'
import { OrbitMark } from './OrbitMark'

/** Header: brand, what the scene is doing right now, the schedule switch
 * and the locale toggle. */
export function TopBar({
  locale,
  travelling,
  freeFlight,
  overview,
  bodyCode,
  ephemerisOpen,
  onToggleEphemeris,
  onToggleLocale,
}: {
  locale: Locale
  travelling: boolean
  freeFlight: boolean
  overview: boolean
  bodyCode: string | null
  ephemerisOpen: boolean
  onToggleEphemeris: () => void
  onToggleLocale: () => void
}) {
  return (
    <header className="topbar reveal">
      <div className="brand">
        <OrbitMark className="brand-mark" />
        <span>AETHER</span>
      </div>
      <div className="scene-status">
        <span className="status-dot" />
        <span>{travelling
          ? t(locale, 'inFlight')
          : freeFlight
            ? t(locale, 'freeFlightStatus')
            : overview
              ? t(locale, 'systemOverview')
              : t(locale, 'simActive')}</span>
        <span className="status-code">{bodyCode ? `SC—${bodyCode}` : 'SYS—01'}</span>
      </div>
      <div className="topbar-actions">
        <button
          type="button"
          className={`ephemeris-toggle ${ephemerisOpen ? 'is-open' : ''}`}
          aria-label={t(locale, 'ephemerides')}
          aria-pressed={ephemerisOpen}
          onClick={onToggleEphemeris}
        >
          {t(locale, 'ephemerides')}
        </button>
        <button
          type="button"
          className="locale-toggle"
          aria-label={t(locale, 'localeSwitch')}
          onClick={onToggleLocale}
        >
          <span className={locale === 'ru' ? 'is-active' : ''}>RU</span>
          <span className={locale === 'en' ? 'is-active' : ''}>EN</span>
        </button>
      </div>
    </header>
  )
}
