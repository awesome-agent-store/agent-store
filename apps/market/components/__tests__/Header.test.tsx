import { test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'

mock.module('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))
mock.module('next/navigation', () => ({
  usePathname: () => '/store',
  useRouter: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => ({ explore: '探索', docs: '文档', publish: '发布' }[key.split('.').pop() ?? ''] ?? key),
}))

afterEach(() => { cleanup() })

const { Header } = await import('../Header')

test('renders brand name', () => {
  render(<Header />)
  expect(screen.getByText('Agent Store')).toBeInTheDocument()
})

test('renders nav links', () => {
  render(<Header />)
  expect(screen.getByText('探索')).toBeInTheDocument()
  expect(screen.getByText('文档')).toBeInTheDocument()
})

test('publish button links to ?publish=1', () => {
  render(<Header />)
  const publishLink = screen.getByText('发布').closest('a')
  expect(publishLink?.getAttribute('href')).toBe('/store?publish=1')
})
