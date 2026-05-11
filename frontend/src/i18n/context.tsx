import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import { en } from './en'
import { zh } from './zh'

export type Language = 'en' | 'zh'

const STORAGE_KEY = 'mole-lang'

const translations: Record<Language, Record<string, string>> = { en, zh }

function getInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'zh') return stored
  } catch {}
  return 'en'
}

type LanguageContextValue = {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function resolve(obj: Record<string, string>, key: string): string | undefined {
  return obj[key]
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const v = params[k]
    return v !== undefined ? String(v) : `{{${k}}}`
  })
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage)

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {}
  }, [])

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const dict = translations[language]

    // Pluralization: if count param exists, try .one / .other
    if (params && 'count' in params) {
      const count = Number(params.count)
      const variant = count === 1 ? `${key}.one` : `${key}.other`
      const resolved = resolve(dict, variant)
      if (resolved) return interpolate(resolved, params)
    }

    const value = resolve(dict, key)
    if (value) return params ? interpolate(value, params) : value

    // Fallback to English
    const fallback = resolve(translations.en, key)
    if (fallback) return params ? interpolate(fallback, params) : key

    return key
  }, [language])

  const ctx = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return (
    <LanguageContext.Provider value={ctx}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useTranslation must be used within LanguageProvider')
  return ctx
}
