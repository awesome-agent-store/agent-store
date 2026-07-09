import { test, expect } from 'bun:test'
import { PRICING, formatPrice } from '../pricing'

test('formatPrice keeps cents but drops trailing .00', () => {
  expect(formatPrice('monthly')).toBe('$9.99')
  expect(formatPrice('yearly')).toBe('$99')
  expect(formatPrice('lifetime')).toBe('$199')
})

test('PRICING exposes a non-negative trial length', () => {
  expect(PRICING.trialDays).toBeGreaterThanOrEqual(0)
})
