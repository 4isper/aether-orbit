import { useCallback, useEffect, useState } from 'react'
import { isAmbienceOn, readStoredAmbience, setAmbience, storeAmbience } from '../audio'

/** The synthesized ambience: the choice persists, and a remembered intent
 * starts on the first gesture anywhere — browsers hold the AudioContext
 * until one, so the choice resumes instead of restarting. */
export function useAmbience() {
  const [sound, setSound] = useState(readStoredAmbience)

  const toggleSound = useCallback(() => {
    // The audio call stays outside the state updater: StrictMode double-
    // invokes updaters and the ambience toggle must run exactly once.
    setAmbience(!sound)
    setSound(!sound)
    storeAmbience(!sound)
  }, [sound])

  useEffect(() => {
    if (!sound) return
    const resume = () => {
      if (!isAmbienceOn()) setAmbience(true)
    }
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
  }, [sound])

  return { sound, toggleSound }
}
