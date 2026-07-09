import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { messages, type Locale, LOCALES } from './messages'

export type { Locale }
export { LOCALES }

/** Native display names for the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
}

const STORAGE_KEY = 'as-locale'

function readStored(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && (LOCALES as readonly string[]).includes(v)) return v as Locale
  } catch {
    /* localStorage unavailable */
  }
  return null
}

/** Best-effort match of the OS/browser locale to a supported one; Chinese otherwise. */
export function detectLocale(langs: readonly string[] = navigator.languages?.length ? navigator.languages : [navigator.language]): Locale {
  try {
    for (const lang of langs) {
      const base = lang.toLowerCase().split('-')[0]
      if ((LOCALES as readonly string[]).includes(base)) return base as Locale
    }
  } catch {
    /* navigator unavailable */
  }
  return 'zh'
}

/** Stored choice wins; first run falls back to the detected OS locale. */
function initialLocale(): Locale {
  return readStored() ?? detectLocale()
}

function resolve(dict: Record<string, unknown>, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dict)
  return typeof value === 'string' ? value : undefined
}

interface I18nValue {
  locale: Locale
  setLocale: (l: Locale) => void
  /** Translate a dotted key; falls back to Chinese, then the raw key. */
  t: (key: string) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  const setLocale = useCallback((l: Locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* ignore */
    }
    setLocaleState(l)
  }, [])

  const t = useCallback(
    (key: string) => resolve(messages[locale], key) ?? resolve(messages.zh, key) ?? key,
    [locale]
  )

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>
}

// Default (Chinese) context so components render outside a provider — e.g. in
// unit tests — without needing every test to wrap I18nProvider.
const DEFAULT: I18nValue = {
  locale: 'zh',
  setLocale: () => {},
  t: (key) => resolve(messages.zh, key) ?? key,
}

export function useI18n(): I18nValue {
  return useContext(I18nContext) ?? DEFAULT
}

/** The translate function type. */
export type TFn = (key: string) => string

/** Convenience hook returning just the translate function. */
export function useT(): TFn {
  return useI18n().t
}
