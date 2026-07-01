import { test, expect, mock, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const push = mock(() => {})
mock.module('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/store',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) =>
    ({ all: '全部', new: '最近新增', popular: '最流行', rating: '评分最高' }[key.split('.').pop() ?? '']),
}))

afterEach(() => { cleanup() })

const { SortSelect } = await import('../SortSelect')

test('renders all sort options', () => {
  render(<SortSelect active="downloads" />)
  expect(screen.getByText('全部')).toBeInTheDocument()
  expect(screen.getByText('最近新增')).toBeInTheDocument()
  expect(screen.getByText('最流行')).toBeInTheDocument()
  expect(screen.getByText('评分最高')).toBeInTheDocument()
})

test('selecting an option pushes ?sort= to the router', () => {
  render(<SortSelect active="downloads" />)
  fireEvent.click(screen.getByText('评分最高'))
  expect(push).toHaveBeenCalledWith('/store?sort=rating')
})
