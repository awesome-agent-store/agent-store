import { test, expect, mock, afterEach, beforeEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const refresh = mock(() => {})
mock.module('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => '/store',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => ({ zh: '中文', en: 'English' }[key.split('.').pop() ?? '']),
}))

beforeEach(() => { document.cookie = 'locale=zh' })
afterEach(() => { cleanup() })

const { LangSwitcher } = await import('../LangSwitcher')

test('renders zh and en options', () => {
  render(<LangSwitcher />)
  expect(screen.getByText('中文')).toBeInTheDocument()
  expect(screen.getByText('English')).toBeInTheDocument()
})

test('selecting English sets the locale cookie and refreshes', () => {
  render(<LangSwitcher />)
  fireEvent.click(screen.getByText('English'))
  expect(document.cookie).toContain('locale=en')
  expect(refresh).toHaveBeenCalled()
})
