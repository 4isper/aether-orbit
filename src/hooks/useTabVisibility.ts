import { useEffect, useState } from 'react'

/** Whether the scene tab can still play: a hidden tab holds the tour timer. */
export function useTabVisibility() {
  const [tabVisible, setTabVisible] = useState(() => !document.hidden)

  useEffect(() => {
    const onVisibilityChange = () => setTabVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  return tabVisible
}
