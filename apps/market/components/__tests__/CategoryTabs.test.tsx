import { test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'

const push = mock(() => {})
mock.module('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/store',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) =>
    ({ all: '探索', provider: '供应商', skill: '技能', mcp: 'MCP' }[key.split('.').pop() ?? '']),
}))

afterEach(() => { cleanup() })

const { CategoryTabs } = await import('../CategoryTabs')

test('renders all four category labels', () => {
  render(<CategoryTabs active="all" />)
  expect(screen.getByText('探索')).toBeInTheDocument()
  expect(screen.getByText('供应商')).toBeInTheDocument()
  expect(screen.getByText('技能')).toBeInTheDocument()
  expect(screen.getByText('MCP')).toBeInTheDocument()
})

test('marks the active tab as selected', () => {
  render(<CategoryTabs active="skill" />)
  expect(screen.getByText('技能').closest('button')?.getAttribute('aria-selected')).toBe('true')
})
