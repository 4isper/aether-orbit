import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { SceneView } from '../planets'

const TOUR_STOPS: SceneView[] = ['aurelia', 'cinder', 'vesper', 'belt', 'comet', 'erebus', 'star', 'system']
const TOUR_DWELL_MS = 7000

/** The guided tour: ~7 seconds per stop, looping around the system. A
 * hidden tab holds the timer; any manual move (travelling flips on) stops
 * the clock. */
export function useTour({
  tour,
  ready,
  travelling,
  tabVisible,
  activeView,
  setDestination,
}: {
  tour: boolean
  ready: boolean
  travelling: boolean
  tabVisible: boolean
  activeView: SceneView
  setDestination: Dispatch<SetStateAction<SceneView>>
}) {
  useEffect(() => {
    if (!tour || !ready || travelling || !tabVisible) return
    const timer = window.setTimeout(() => {
      const index = TOUR_STOPS.indexOf(activeView)
      setDestination(TOUR_STOPS[(index + 1) % TOUR_STOPS.length])
    }, TOUR_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [tour, ready, travelling, tabVisible, activeView, setDestination])
}
