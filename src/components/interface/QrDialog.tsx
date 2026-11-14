import { useEffect, useMemo, useRef } from 'react'
import { qrCode } from '../../qr'
import { t, type Locale } from '../../strings'

/**
 * The frame link as a scannable code. The address bar already carries the
 * full state — view, pose and moment — so the code alone hands the frame to
 * a phone. A modal like the shortcuts dialog: focus enters on the close
 * button and Tab stays inside, Escape closes it from App's global handler.
 */
export function QrDialog({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const url = window.location.href
  const code = useMemo(() => qrCode(url), [url])

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <div
      className="shortcuts-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-title"
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
      <div className="shortcuts-card qr-card">
        <button
          ref={closeRef}
          type="button"
          className="shortcuts-close"
          aria-label={t(locale, 'qrClose')}
          onClick={onClose}
        >
          ×
        </button>
        <h2 id="qr-title">{t(locale, 'qrTitle')}</h2>
        <div className="qr-plate" aria-hidden="true">
          <svg viewBox={`0 0 ${code.size} ${code.size}`} shapeRendering="crispEdges">
            <path d={code.path} />
          </svg>
        </div>
        <p className="qr-hint">{t(locale, 'qrHint')}</p>
        <p className="qr-url">{url}</p>
      </div>
    </div>
  )
}
