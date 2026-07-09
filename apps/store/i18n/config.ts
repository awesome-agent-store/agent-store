export const SUPPORTED_LOCALES = ['zh', 'en', 'ja', 'ko', 'es'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = 'zh'

export function resolveLocale(raw: string | undefined): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as SupportedLocale)
    : DEFAULT_LOCALE
}
