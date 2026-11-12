import { t, type Locale } from '../../strings'
import { OrbitMark } from './OrbitMark'

/** Header: brand, what the scene is doing right now, the locale switch. */
export function TopBar({
  locale,
  travelling,
  freeFlight,
  overview,
  bodyCode,
  onToggleLocale,
}: {
  locale: Locale
  travelling: boolean
  freeFlight: boolean
  overview: boolean
  bodyCode: string | null
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
      <button
        type="button"
        className="locale-toggle"
        aria-label={t(locale, 'localeSwitch')}
        onClick={onToggleLocale}
      >
        <span className={locale === 'ru' ? 'is-active' : ''}>RU</span>
        <span className={locale === 'en' ? 'is-active' : ''}>EN</span>
      </button>
    </header>
  )
}
