import type { EventAnnouncement } from '../SpaceScene'
import { type BodyInfo, type SceneView } from '../../planets'
import { t, type Locale } from '../../strings'
import { EventChip } from './EventChip'

function worldEyebrow(view: SceneView, locale: Locale) {
  if (view === 'star') return t(locale, 'orbitOfStar')
  if (view === 'cinder') return t(locale, 'worldDesert')
  if (view === 'vesper') return t(locale, 'worldIce')
  if (view === 'comet') return t(locale, 'worldComet')
  if (view === 'moon') return t(locale, 'worldMoon')
  if (view === 'belt') return t(locale, 'worldBelt')
  if (view === 'erebus') return t(locale, 'worldErebus')
  return t(locale, 'worldExo')
}

/** Everything the interface says about the framed body: intro, telemetry,
 * the event chip when one is announced, the control hint and view actions. */
export function BodyPanel({
  body,
  activeView,
  locale,
  travelling,
  ready,
  event,
  onSeekEvent,
  onReset,
  onSaveFrame,
  onShare,
  copied,
}: {
  body: BodyInfo
  activeView: SceneView
  locale: Locale
  travelling: boolean
  ready: boolean
  event: EventAnnouncement | null
  onSeekEvent: () => void
  onReset: () => void
  onSaveFrame: () => void
  onShare: () => void
  copied: boolean
}) {
  const isStar = activeView === 'star'
  return (
    <>
      <section className="intro reveal" aria-labelledby="scene-title" aria-hidden={travelling}>
        <p className="eyebrow"><span />{body.name} / {worldEyebrow(activeView, locale)}</p>
        <h1 id="scene-title">
          <span>{body.copy[locale].title[0]}</span>
          <em>{body.copy[locale].title[1]}</em>
        </h1>
        <p className="intro-copy">
          {body.copy[locale].description[0]}<br />
          {body.copy[locale].description[1]}
        </p>
      </section>

      <aside className="telemetry reveal" aria-label={t(locale, 'bodyTelemetry')} aria-hidden={travelling}>
        <div className="telemetry-item">
          <span className="telemetry-label">{t(locale, 'radius')}</span>
          <strong>{body.radius} <small>{isStar ? 'R☉' : 'R⊕'}</small></strong>
        </div>
        <span className="telemetry-divider" />
        <div className="telemetry-item">
          <span className="telemetry-label">{body.copy[locale].metricLabel}</span>
          <strong>{body.metricValue} <small>{body.copy[locale].metricUnit}</small></strong>
        </div>
        <span className="telemetry-divider" />
        <div className="telemetry-item telemetry-item--facts">
          <span className="telemetry-label">{t(locale, 'observations')}</span>
          {body.copy[locale].facts.map((fact) => (
            <span className="telemetry-fact" key={fact}>{fact}</span>
          ))}
        </div>
      </aside>

      {event && !travelling && (
        <EventChip event={event} view={activeView} locale={locale} ready={ready} onSeek={onSeekEvent} />
      )}

      <div className="control-hint reveal" aria-hidden="true">
        <svg viewBox="0 0 24 32" fill="none">
          <rect x="4.5" y="2.5" width="15" height="25" rx="7.5" stroke="currentColor" />
          <path d="M12 7v5" stroke="currentColor" strokeLinecap="round" />
        </svg>
        <div>
          <span>{t(locale, 'exploreOrbit')}</span>
          <small>{t(locale, 'exploreHint')}</small>
        </div>
      </div>

      <div className="view-actions reveal">
        <button className="reset-view" type="button" onClick={onReset} disabled={!ready || travelling} aria-label={t(locale, 'resetCamera')}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4.8 8.2A8 8 0 1 1 4 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M4.8 3.8v4.4h4.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{t(locale, 'resetCameraShort')}</span>
        </button>
        <span className="view-actions-divider" aria-hidden="true" />
        <button className="reset-view" type="button" onClick={onSaveFrame} disabled={!ready} aria-label={t(locale, 'saveFrame')}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3.5" y="6" width="17" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="12" cy="12.5" r="3.4" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9 6l1.2-2h3.6L15 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{t(locale, 'saveFrameShort')}</span>
        </button>
        <span className="view-actions-divider" aria-hidden="true" />
        <button
          className="reset-view"
          type="button"
          onClick={onShare}
          disabled={!ready}
          aria-label={t(locale, copied ? 'linkCopied' : 'shareFrame')}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="17" cy="5.5" r="2.4" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="17" cy="18.5" r="2.4" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8.1 10.9l6.8-4M8.1 13.1l6.8 4" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          <span>{copied ? t(locale, 'linkCopied') : t(locale, 'shareFrameShort')}</span>
        </button>
      </div>
    </>
  )
}
