import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Item } from '@aas/types'
import { FeaturedCarousel } from '../FeaturedCarousel'

function makeItem(id: string, name: string): Item {
  return {
    id, slug: id, name, description: `${name} desc`,
    readmeUrl: '', icon: '', category: 'skill', version: '1.0.0',
    publisher: { id: 'p', slug: 'p', name: 'P', avatarUrl: '', tier: 'official' },
    compatibleWith: ['claude'], tags: [], downloads: 0, rating: 5,
    status: 'published', installHook: { steps: [] },
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    contentUrl: '',
  }
}

const items = [makeItem('a', 'Alpha'), makeItem('b', 'Beta'), makeItem('c', 'Gamma')]

afterEach(() => { cleanup() })

test('renders the first item initially', () => {
  render(<FeaturedCarousel items={items} />)
  expect(screen.getByText('Alpha')).toBeInTheDocument()
})

test('clicking next advances to the next item', () => {
  render(<FeaturedCarousel items={items} />)
  fireEvent.click(screen.getByLabelText('下一个'))
  expect(screen.getByText('Beta')).toBeInTheDocument()
})

test('clicking prev wraps around to the last item', () => {
  render(<FeaturedCarousel items={items} />)
  fireEvent.click(screen.getByLabelText('上一个'))
  expect(screen.getByText('Gamma')).toBeInTheDocument()
})

test('clicking a dot jumps to that item', () => {
  render(<FeaturedCarousel items={items} />)
  fireEvent.click(screen.getByLabelText('跳转到第 3 项'))
  expect(screen.getByText('Gamma')).toBeInTheDocument()
})

test('renders nothing for an empty item list', () => {
  const { container } = render(<FeaturedCarousel items={[]} />)
  expect(container.firstChild).toBeNull()
})
