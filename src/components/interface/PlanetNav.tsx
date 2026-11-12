import { bodies, planetIds, type SceneView } from '../../planets'
import { t, type Locale } from '../../strings'
import { OrbitMark } from './OrbitMark'

/** Destination buttons: the overview, the tour, free flight, every body. */
export function PlanetNav({
  locale,
  ready,
  travelling,
  overview,
  activeView,
  tour,
  freeFlight,
  onTravel,
  onToggleTour,
  onToggleFreeFlight,
}: {
  locale: Locale
  ready: boolean
  travelling: boolean
  overview: boolean
  activeView: SceneView
  tour: boolean
  freeFlight: boolean
  onTravel: (view: SceneView) => void
  onToggleTour: () => void
  onToggleFreeFlight: () => void
}) {
  const disabled = !ready || travelling
  return (
    <nav className="planet-nav reveal" aria-label={t(locale, 'navLabel')} aria-busy={travelling}>
      <button
        type="button"
        className="planet-link system-link"
        aria-pressed={overview}
        aria-label={t(locale, 'systemOverview')}
        disabled={disabled}
        onClick={() => onTravel('system')}
      >
        <OrbitMark className="system-icon" />
        {t(locale, 'systemOverviewLabel')}
      </button>
      <button
        type="button"
        className="planet-link tour-link"
        aria-pressed={tour}
        aria-label={tour ? t(locale, 'tourStop') : t(locale, 'tourStart')}
        disabled={!ready}
        onClick={onToggleTour}
      >
        {t(locale, 'tour')}
      </button>
      <button
        type="button"
        className="planet-link tour-link"
        aria-pressed={freeFlight}
        aria-label={freeFlight ? t(locale, 'freeFlightStop') : t(locale, 'freeFlightStart')}
        disabled={disabled}
        onClick={onToggleFreeFlight}
      >
        {t(locale, 'freeFlight')}
      </button>
      <button
        type="button"
        className="planet-link planet-link--star"
        aria-pressed={activeView === 'star'}
        aria-label={t(locale, 'flyToStar', { name: bodies.star.name })}
        disabled={disabled}
        onClick={() => onTravel('star')}
      >
        <span className="planet-dot" aria-hidden="true" />
        <span className="planet-number">{bodies.star.code}</span>
        {bodies.star.name}
      </button>
      {planetIds.map((id) => (
        <button
          key={id}
          type="button"
          className={`planet-link planet-link--${id}`}
          aria-pressed={activeView === id}
          aria-label={t(locale, 'flyToPlanet', { name: bodies[id].name })}
          disabled={disabled}
          onClick={() => onTravel(id)}
        >
          <span className="planet-dot" aria-hidden="true" />
          <span className="planet-number">{bodies[id].code}</span>
          {bodies[id].name}
        </button>
      ))}
      <button
        type="button"
        className="planet-link planet-link--moon"
        aria-pressed={activeView === 'moon'}
        aria-label={t(locale, 'flyToMoon', { name: bodies.moon.name })}
        disabled={disabled}
        onClick={() => onTravel('moon')}
      >
        <span className="planet-dot" aria-hidden="true" />
        <span className="planet-number">{bodies.moon.code}</span>
        {bodies.moon.name}
      </button>
      <button
        type="button"
        className="planet-link planet-link--comet"
        aria-pressed={activeView === 'comet'}
        aria-label={t(locale, 'flyToComet', { name: bodies.comet.name })}
        disabled={disabled}
        onClick={() => onTravel('comet')}
      >
        <span className="planet-dot" aria-hidden="true" />
        <span className="planet-number">{bodies.comet.code}</span>
        {bodies.comet.name}
      </button>
    </nav>
  )
}
