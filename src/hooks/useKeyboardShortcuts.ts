import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { SceneView } from '../planets'

/** The global key handler: H works on both layouts (latin H and Cyrillic Р
 * sit on the same key). Space and digits must not hijack an interactive
 * element that has focus: buttons already activate on Space. */
export function useKeyboardShortcuts({
  views,
  travelTo,
  setPaused,
  setCinema,
  setHelp,
  setFreeFlight,
  setQr,
}: {
  views: SceneView[]
  travelTo: (view: SceneView) => void
  setPaused: Dispatch<SetStateAction<boolean>>
  setCinema: Dispatch<SetStateAction<boolean>>
  setHelp: Dispatch<SetStateAction<boolean>>
  setFreeFlight: Dispatch<SetStateAction<boolean>>
  setQr: Dispatch<SetStateAction<boolean>>
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key === 'h' || key === 'р') setCinema((value) => !value)
      if (event.key === 'Escape') {
        setCinema(false)
        setHelp(false)
        setQr(false)
        setFreeFlight(false)
      }
      if (event.key === '?') setHelp((value) => !value)
      // Space and digits must not hijack an interactive element that has
      // focus: buttons already activate on Space.
      const target = event.target as HTMLElement | null
      const onControl = Boolean(
        target
          && (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
            || target.isContentEditable),
      )
      if (!onControl && event.key === ' ' && !event.repeat) {
        event.preventDefault()
        setPaused((value) => !value)
      }
      if (!onControl && /^[1-9]$/.test(event.key)) {
        const view = views[Number(event.key) - 1]
        if (view) travelTo(view)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [views, travelTo, setPaused, setCinema, setHelp, setFreeFlight, setQr])
}
