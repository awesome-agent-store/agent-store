import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { I18nProvider, useT, detectLocale } from '../index'

afterEach(() => {
  cleanup()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})

function Probe() {
  const t = useT()
  return <span>{t('nav.settings')}</span>
}

test('detectLocale maps a regional browser locale to a supported base locale', () => {
  expect(detectLocale(['ko-KR'])).toBe('ko')
  expect(detectLocale(['ja'])).toBe('ja')
  expect(detectLocale(['es-419', 'en-US'])).toBe('es')
  expect(detectLocale(['zh-TW'])).toBe('zh')
})

test('detectLocale falls back to Chinese for an unsupported locale', () => {
  expect(detectLocale(['fr-FR', 'de'])).toBe('zh')
})

test('a stored locale choice is honored on mount', () => {
  localStorage.setItem('as-locale', 'ja')
  render(
    <I18nProvider>
      <Probe />
    </I18nProvider>
  )
  // ja: nav.settings === '設定'
  expect(screen.getByText('設定')).toBeInTheDocument()
})
