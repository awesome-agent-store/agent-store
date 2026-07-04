import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { findOrderedProvidersForTarget } from '../provider-order'
import { itemDir } from '../../paths'
import type { InstalledItem, RegistryJson } from '@aas/types'

let aasHome: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-provider-order-test-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
})

async function installProvider(slug: string, enabledFor: Record<string, boolean>, config: Record<string, unknown>) {
  const dir = itemDir(aasHome, 'provider', slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'config.json'), JSON.stringify(config))
}

function providerEntry(slug: string, enabledFor: Record<string, boolean>): InstalledItem {
  return {
    slug, category: 'provider', version: '1.0.0',
    installedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    compatibleWith: ['claude', 'codex'], enabledFor,
  }
}

test('sorts enabled providers by level ascending, defaulting unset level to 1', async () => {
  await installProvider('low-priority', { claude: true }, { apiKey: 'k1', baseUrl: 'https://one.example', level: 5 })
  await installProvider('no-level', { claude: true }, { apiKey: 'k2', baseUrl: 'https://two.example' })
  await installProvider('high-priority', { claude: true }, { apiKey: 'k3', baseUrl: 'https://three.example', level: 1 })

  const registry: RegistryJson = {
    installed: [
      providerEntry('low-priority', { claude: true }),
      providerEntry('no-level', { claude: true }),
      providerEntry('high-priority', { claude: true }),
    ],
  }

  const ordered = await findOrderedProvidersForTarget(aasHome, registry, 'claude')

  expect(ordered.map((c) => c.item.slug)).toEqual(['high-priority', 'no-level', 'low-priority'])
})

test('excludes providers not enabled for the requested target', async () => {
  await installProvider('enabled-claude', { claude: true, codex: false }, { apiKey: 'k1', baseUrl: 'https://one.example' })
  await installProvider('enabled-codex', { claude: false, codex: true }, { apiKey: 'k2', baseUrl: 'https://two.example' })

  const registry: RegistryJson = {
    installed: [
      providerEntry('enabled-claude', { claude: true, codex: false }),
      providerEntry('enabled-codex', { claude: false, codex: true }),
    ],
  }

  const ordered = await findOrderedProvidersForTarget(aasHome, registry, 'claude')

  expect(ordered.map((c) => c.item.slug)).toEqual(['enabled-claude'])
})

test('excludes non-provider categories and returns an empty array when nothing is enabled', async () => {
  const registry: RegistryJson = {
    installed: [
      { slug: 'a-skill', category: 'skill', version: '1.0.0', installedAt: '', updatedAt: '', compatibleWith: ['claude'], enabledFor: { claude: true } },
    ],
  }

  const ordered = await findOrderedProvidersForTarget(aasHome, registry, 'claude')

  expect(ordered).toEqual([])
})

test('keeps registry order among providers that share the same level', async () => {
  await installProvider('first', { claude: true }, { apiKey: 'k1', baseUrl: 'https://one.example', level: 3 })
  await installProvider('second', { claude: true }, { apiKey: 'k2', baseUrl: 'https://two.example', level: 3 })

  const registry: RegistryJson = {
    installed: [
      providerEntry('first', { claude: true }),
      providerEntry('second', { claude: true }),
    ],
  }

  const ordered = await findOrderedProvidersForTarget(aasHome, registry, 'claude')

  expect(ordered.map((c) => c.item.slug)).toEqual(['first', 'second'])
})
