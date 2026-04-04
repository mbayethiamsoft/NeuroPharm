'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { fr, en, type Translations, type Locale } from '@/lib/i18n'

const translations: Record<Locale, Translations> = { fr, en }

interface I18nContextType {
  locale: Locale
  t: Translations
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nContextType>({
  locale: 'fr',
  t: fr,
  setLocale: () => {},
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('fr')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('neuropharm-locale') as Locale
      if (saved && (saved === 'fr' || saved === 'en')) {
        setLocaleState(saved)
      }
    } catch { /* ignore */ }
  }, [])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    try {
      localStorage.setItem('neuropharm-locale', newLocale)
    } catch { /* ignore */ }
  }, [])

  return (
    <I18nContext.Provider value={{ locale, t: translations[locale], setLocale }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}
