import { useCallback, useEffect, useState } from 'react'
import { readStoredLocale, storeLocale, type Locale } from '../strings'

/** The interface language: persisted between visits, and mirrored into the
 * document element and title. */
export function useLocale() {
  const [locale, setLocale] = useState<Locale>(readStoredLocale)

  const toggleLocale = useCallback(() => {
    setLocale((value) => {
      const next: Locale = value === 'ru' ? 'en' : 'ru'
      storeLocale(next)
      return next
    })
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = locale === 'ru'
      ? 'Aether — Тихая орбита'
      : 'Aether — The Quiet Orbit'
  }, [locale])

  return { locale, toggleLocale }
}
