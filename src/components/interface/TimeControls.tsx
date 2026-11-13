import { useRef, useState } from 'react'
import { t, type Locale } from '../../strings'

const SPEED_OPTIONS = [0.5, 1, 2, 4]

/** The jog wheel's reach: half a moon-month in either direction. */
const SCRUB_REACH = 45

function formatSpeed(speed: number) {
  return speed === 0.5 ? '½' : String(speed)
}

/** The clock: pause, reverse, speed, the time scrub and the ambience switch. */
export function TimeControls({
  locale,
  ready,
  paused,
  speed,
  reversed,
  sound,
  onPause,
  onReverse,
  onSpeed,
  onToggleSound,
  onScrub,
}: {
  locale: Locale
  ready: boolean
  paused: boolean
  speed: number
  reversed: boolean
  sound: boolean
  onPause: () => void
  onReverse: () => void
  onSpeed: (speed: number) => void
  onToggleSound: () => void
  onScrub: (delta: number) => void
}) {
  // The scrub is a jog wheel: it reads as an offset from the moment the
  // drag started, and it re-centers on release — the clock always flows on
  // from wherever the scrub left it.
  const grabbed = useRef(0)
  const [thumb, setThumb] = useState(0)
  const scrub = (value: number) => {
    onScrub(value - grabbed.current)
    grabbed.current = value
    setThumb(value)
  }
  const release = () => {
    grabbed.current = 0
    setThumb(0)
  }
  return (
    <div className="time-controls reveal" role="group" aria-label={t(locale, 'timeControls')}>
      <button
        type="button"
        className="time-button"
        aria-pressed={paused}
        aria-label={paused ? t(locale, 'resume') : t(locale, 'pause')}
        disabled={!ready}
        onClick={onPause}
      >
        {paused ? (
          <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M3 1.4v9.2L10.2 6z" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="2.4" y="1.8" width="2.4" height="8.4" fill="currentColor" />
            <rect x="7.2" y="1.8" width="2.4" height="8.4" fill="currentColor" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="time-button"
        aria-pressed={reversed}
        aria-label={reversed ? t(locale, 'unreverse') : t(locale, 'reverse')}
        disabled={!ready}
        onClick={onReverse}
      >
        <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6.4 1.6v8.8L1.6 6z" fill="currentColor" />
          <path d="M11 1.6v8.8L6.2 6z" fill="currentColor" />
        </svg>
      </button>
      <div className="speed-group" role="group" aria-label={t(locale, 'speedGroup')}>
        {SPEED_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className="time-button speed-option"
            aria-pressed={speed === option}
            aria-label={t(locale, 'speed', { value: formatSpeed(option) })}
            disabled={!ready}
            onClick={() => onSpeed(option)}
          >
            <strong>×{formatSpeed(option)}</strong>
          </button>
        ))}
      </div>
      <input
        type="range"
        className="time-scrub"
        min={-SCRUB_REACH}
        max={SCRUB_REACH}
        step={0.25}
        value={thumb}
        aria-label={t(locale, 'scrubLabel')}
        title={t(locale, 'scrubLabel')}
        disabled={!ready}
        onChange={(event) => scrub(Number(event.target.value))}
        onPointerUp={release}
        onBlur={release}
        onKeyUp={release}
      />
      <button
        type="button"
        className="time-button"
        aria-pressed={sound}
        aria-label={t(locale, sound ? 'ambienceOff' : 'ambienceOn')}
        disabled={!ready}
        onClick={onToggleSound}
      >
        <svg viewBox="0 0 16 12" fill="none" aria-hidden="true">
          <path d="M2 4.6v2.8h2.2L7 9.6V2.4L4.2 4.6H2z" fill="currentColor" />
          <path d="M9.6 3.4c1.5 1.4 1.5 3.8 0 5.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M11.8 1.8c2.5 2.3 2.5 6.1 0 8.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
