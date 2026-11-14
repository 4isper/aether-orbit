import { useCallback, useRef, useState } from 'react'

/** The Share button: the address bar already carries the current view and
 * camera pose, kept fresh by the camera rig, so the URL alone is enough to
 * reproduce a view. The native share sheet when available, the clipboard
 * otherwise, with a short "copied" confirmation. */
export function useShareLink() {
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef(0)

  const shareLink = useCallback(() => {
    const url = window.location.href
    const markCopied = () => {
      setCopied(true)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2400)
    }
    if (navigator.canShare?.({ url })) {
      navigator.share({ url, title: document.title })
        .catch((error: unknown) => {
          if ((error as DOMException)?.name === 'AbortError') return
          navigator.clipboard?.writeText(url).then(markCopied).catch(() => {})
        })
    } else {
      navigator.clipboard?.writeText(url).then(markCopied).catch(() => {})
    }
  }, [])

  return { copied, shareLink }
}
