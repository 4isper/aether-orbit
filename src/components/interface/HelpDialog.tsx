import { useEffect, useRef } from 'react'
import { t, type Locale, type StringKey } from '../../strings'

/** Rows of the "?" help dialog, in the order users will scan them. */
const SHORTCUT_ROWS: Array<{ keys: string; label: StringKey }> = [
  { keys: '1–9', label: 'shortcutViews' },
  { keys: 'Space', label: 'shortcutPause' },
  { keys: 'WASD', label: 'shortcutFree' },
  { keys: 'R', label: 'shortcutReset' },
  { keys: 'H', label: 'shortcutCinema' },
  { keys: '?', label: 'shortcutHelp' },
]

/**
 * The shortcuts dialog. A modal: focus enters on the close button and Tab
 * stays inside (the close button is the card's only focusable), so the rest
 * of the interface is unreachable while the dialog is up — Escape still
 * closes it from App's global handler.
 */
export function HelpDialog({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <div
      className="shortcuts-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
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
      <div className="shortcuts-card">
        <button
          ref={closeRef}
          type="button"
          className="shortcuts-close"
          aria-label={t(locale, 'shortcutsClose')}
          onClick={onClose}
        >
          ×
        </button>
        <h2 id="shortcuts-title">{t(locale, 'shortcutsTitle')}</h2>
        <dl className="shortcuts-list">
          {SHORTCUT_ROWS.map((row) => (
            <div className="shortcuts-row" key={row.label}>
              <dt>{t(locale, row.label)}</dt>
              <dd><kbd>{row.keys}</kbd></dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
