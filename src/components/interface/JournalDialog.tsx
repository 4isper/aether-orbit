import { useEffect, useRef } from 'react'
import type { JournalFrame } from '../../journal.ts'
import { bodies, type SceneView } from '../../planets'
import { t, type Locale } from '../../strings'

/** The name a frame's caption shows: the body it framed, or the overview. */
function frameName(view: SceneView, locale: Locale): string {
  return view === 'system' ? t(locale, 'systemOverview') : bodies[view].name
}

/**
 * The frame journal as a gallery: every saved frame shows its preview and
 * the body it framed, and opens that exact frame — the deep link the log
 * stores restores view, pose and moment in one navigation. A modal like
 * the QR dialog: focus enters on the close button, Escape closes it from
 * App's global handler.
 */
export function JournalDialog({
  locale,
  frames,
  onOpenFrame,
  onClose,
}: {
  locale: Locale
  frames: JournalFrame[]
  onOpenFrame: (frame: JournalFrame) => void
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <div
      className="shortcuts-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="journal-title"
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault()
          closeRef.current?.focus()
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="shortcuts-card journal-card">
        <button
          ref={closeRef}
          type="button"
          className="shortcuts-close"
          aria-label={t(locale, 'journalClose')}
          onClick={onClose}
        >
          ×
        </button>
        <h2 id="journal-title">{t(locale, 'journal')}</h2>
        {frames.length === 0 ? (
          <p className="journal-empty">{t(locale, 'journalEmpty')}</p>
        ) : (
          <div className="journal-grid">
            {frames.map((frame) => (
              <button
                type="button"
                className="journal-frame"
                key={`${frame.takenAt}-${frame.view}-${frame.time ?? ''}`}
                aria-label={t(locale, 'journalFrame', { name: frameName(frame.view, locale) })}
                onClick={() => onOpenFrame(frame)}
              >
                <img className="journal-thumb" src={frame.thumbnail} alt="" width={160} height={90} />
                <span className="journal-caption">
                  {frameName(frame.view, locale)}
                  {frame.time !== undefined && <small> · t {Math.round(frame.time * 10) / 10}</small>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
