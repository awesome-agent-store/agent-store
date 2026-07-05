import { test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { UsageTrendChart } from '../UsageTrendChart'
import type { UsageSummaryRow } from '@aas/types'

afterEach(() => cleanup())

function row(overrides: Partial<UsageSummaryRow>): UsageSummaryRow {
  return {
    date: '2026-07-01', providerSlug: 'p', target: 'claude', model: 'm',
    requestCount: 0, successCount: 0, unpricedRequestCount: 0,
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0,
    ...overrides,
  }
}

test('renders an svg polyline and a filled area path with one point per distinct date', () => {
  const rows = [
    row({ date: '2026-07-01', costUsd: 1 }),
    row({ date: '2026-07-01', providerSlug: 'q', costUsd: 2 }),
    row({ date: '2026-07-02', costUsd: 3 }),
  ]

  const { container } = render(<UsageTrendChart rows={rows} />)

  const polyline = container.querySelector('polyline')
  expect(polyline).not.toBeNull()
  const points = polyline!.getAttribute('points')!.trim().split(' ')
  expect(points).toHaveLength(2)
  expect(container.querySelector('polygon')).not.toBeNull()
  expect(container.querySelectorAll('circle')).toHaveLength(2)
})

test('renders a flat line with no crash when there is no data', () => {
  const { container } = render(<UsageTrendChart rows={[]} />)
  expect(container.querySelector('svg')).not.toBeNull()
  expect(screen.getByText('暂无用量数据')).toBeInTheDocument()
})
