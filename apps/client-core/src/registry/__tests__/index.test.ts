import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { readRegistry, writeRegistry, findEntry, upsertEntry, removeEntry } from '../index'
import type { InstalledItem } from '@aas/types'

const entry: InstalledItem = {
  slug: 'test-provider',
  category: 'provider',
  version: '1.0.0',
  installedAt: '2026-06-18T00:00:00Z',
  updatedAt: '2026-06-18T00:00:00Z',
  compatibleWith: ['claude'],
  enabledFor: { claude: true },
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp('/tmp/aas-test-')
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

test('readRegistry returns empty registry when file absent', async () => {
  const reg = await readRegistry(tmpDir)
  expect(reg).toEqual({ installed: [] })
})

test('writeRegistry creates registry.json and readRegistry reads it back', async () => {
  await writeRegistry(tmpDir, { installed: [entry] })
  const reg = await readRegistry(tmpDir)
  expect(reg.installed).toHaveLength(1)
  expect(reg.installed[0].slug).toBe('test-provider')
})

test('upsertEntry adds new entry', () => {
  const reg = upsertEntry({ installed: [] }, entry)
  expect(reg.installed).toHaveLength(1)
  expect(reg.installed[0].slug).toBe('test-provider')
})

test('upsertEntry updates existing entry without duplicating', () => {
  const initial = { installed: [entry] }
  const updated = upsertEntry(initial, { ...entry, version: '2.0.0' })
  expect(updated.installed).toHaveLength(1)
  expect(updated.installed[0].version).toBe('2.0.0')
})

test('upsertEntry does not mutate the input', () => {
  const original = { installed: [entry] }
  upsertEntry(original, { ...entry, version: '2.0.0' })
  expect(original.installed[0].version).toBe('1.0.0')
})

test('removeEntry removes by slug', () => {
  const reg = removeEntry({ installed: [entry] }, 'test-provider')
  expect(reg.installed).toHaveLength(0)
})

test('removeEntry is a no-op for unknown slug', () => {
  const reg = removeEntry({ installed: [entry] }, 'unknown')
  expect(reg.installed).toHaveLength(1)
})

test('findEntry returns undefined for missing slug', () => {
  expect(findEntry({ installed: [] }, 'missing')).toBeUndefined()
})

test('findEntry returns matching entry', () => {
  expect(findEntry({ installed: [entry] }, 'test-provider')).toEqual(entry)
})
