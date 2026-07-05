import { test, expect } from 'bun:test'
import { checkUpdates, applyUpdate } from '../index'
import type { RegistryJson, Item, InstalledItem } from '@aas/types'
import type { AASClient } from '@aas/sdk'

const installedEntry: InstalledItem = {
  slug: 'openai-provider',
  category: 'provider',
  version: '1.0.0',
  installedAt: '2026-06-18T00:00:00Z',
  updatedAt: '2026-06-18T00:00:00Z',
  compatibleWith: ['claude'],
  enabledFor: { claude: true },
}

const registry: RegistryJson = { installed: [installedEntry] }

const storeItemV2 = { slug: 'openai-provider', version: '2.0.0' } as unknown as Item
const storeItemV1 = { slug: 'openai-provider', version: '1.0.0' } as unknown as Item

function makeClient(item: Item | null, error: string | null = null): AASClient {
  return {
    getItemBySlug: async () =>
      error ? { data: null, error } : { data: item, error: null },
  } as unknown as AASClient
}

test('checkUpdates returns UpdateAvailable when store version is newer', async () => {
  const updates = await checkUpdates(registry, makeClient(storeItemV2))
  expect(updates).toHaveLength(1)
  expect(updates[0]).toEqual({
    slug: 'openai-provider',
    currentVersion: '1.0.0',
    latestVersion: '2.0.0',
  })
})

test('checkUpdates returns empty array when already up to date', async () => {
  const updates = await checkUpdates(registry, makeClient(storeItemV1))
  expect(updates).toHaveLength(0)
})

test('checkUpdates filters to specified slugs', async () => {
  const registry2: RegistryJson = {
    installed: [
      installedEntry,
      { ...installedEntry, slug: 'other-mcp', category: 'mcp' },
    ],
  }
  const updates = await checkUpdates(registry2, makeClient(storeItemV2), ['openai-provider'])
  expect(updates).toHaveLength(1)
  expect(updates[0].slug).toBe('openai-provider')
})

test('checkUpdates skips entries when store returns error', async () => {
  const updates = await checkUpdates(registry, makeClient(null, 'Not found'))
  expect(updates).toHaveLength(0)
})

test('applyUpdate returns latestItem and fromVersion', async () => {
  const result = await applyUpdate('openai-provider', makeClient(storeItemV2), installedEntry)
  expect(result.fromVersion).toBe('1.0.0')
  expect(result.latestItem.version).toBe('2.0.0')
})

test('applyUpdate throws when store returns error', async () => {
  await expect(
    applyUpdate('openai-provider', makeClient(null, 'Not found'), installedEntry)
  ).rejects.toThrow('Not found')
})

test('applyUpdate throws when store returns null without error string', async () => {
  await expect(
    applyUpdate('openai-provider', makeClient(null), installedEntry)
  ).rejects.toThrow('openai-provider')
})
