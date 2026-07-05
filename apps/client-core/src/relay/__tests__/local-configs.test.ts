import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { join } from 'path'
import {
  listLocalConfigs, addLocalConfig, removeLocalConfig, updateLocalConfig,
  setLocalConfigEnabled, toggleLocalConfig,
} from '../local-configs'

let aasHome: string

beforeEach(async () => {
  aasHome = await mkdtemp('/tmp/aas-local-configs-test-')
})

afterEach(async () => {
  await rm(aasHome, { recursive: true, force: true })
})

test('listLocalConfigs seeds a default config when no file exists', async () => {
  const configs = await listLocalConfigs(aasHome)
  expect(configs).toEqual([{ id: 'default', name: '默认', port: 18780, enabled: true, enabledFor: { claude: true, codex: true } }])
})

test('addLocalConfig picks the next free port in +100 increments', async () => {
  const first = await addLocalConfig(aasHome, 'Second')
  expect(first.port).toBe(18880)
  expect(first.name).toBe('Second')
  expect(first.enabled).toBe(true)
  expect(typeof first.id).toBe('string')
  expect(first.id.length).toBeGreaterThan(0)

  const second = await addLocalConfig(aasHome, 'Third')
  expect(second.port).toBe(18980)

  const all = await listLocalConfigs(aasHome)
  expect(all.map((c) => c.port)).toEqual([18780, 18880, 18980])
})

test('addLocalConfig skips a port already used by a disabled config', async () => {
  const added = await addLocalConfig(aasHome, 'Second')
  await setLocalConfigEnabled(aasHome, added.id, false)

  const third = await addLocalConfig(aasHome, 'Third')
  expect(third.port).toBe(18980)
})

test('removeLocalConfig removes the matching entry', async () => {
  const added = await addLocalConfig(aasHome, 'Second')
  await removeLocalConfig(aasHome, added.id)
  const all = await listLocalConfigs(aasHome)
  expect(all).toEqual([{ id: 'default', name: '默认', port: 18780, enabled: true, enabledFor: { claude: true, codex: true } }])
})

test('removeLocalConfig throws when trying to remove the last remaining config', async () => {
  await expect(removeLocalConfig(aasHome, 'default')).rejects.toThrow(
    'Cannot remove the last local relay configuration'
  )
})

test('removeLocalConfig throws for an unknown id', async () => {
  await addLocalConfig(aasHome, 'Second')
  await expect(removeLocalConfig(aasHome, 'nonexistent')).rejects.toThrow(
    'Local relay configuration not found: nonexistent'
  )
})

test('updateLocalConfig patches name and/or port independently', async () => {
  const added = await addLocalConfig(aasHome, 'Second')

  const renamed = await updateLocalConfig(aasHome, added.id, { name: 'Renamed' })
  expect(renamed.name).toBe('Renamed')
  expect(renamed.port).toBe(added.port)

  const reported = await updateLocalConfig(aasHome, added.id, { port: 19999 })
  expect(reported.name).toBe('Renamed')
  expect(reported.port).toBe(19999)
})

test('updateLocalConfig throws for an unknown id', async () => {
  await expect(updateLocalConfig(aasHome, 'nonexistent', { name: 'X' })).rejects.toThrow(
    'Local relay configuration not found: nonexistent'
  )
})

test('setLocalConfigEnabled sets the enabled flag explicitly', async () => {
  const updated = await setLocalConfigEnabled(aasHome, 'default', false)
  expect(updated.enabled).toBe(false)
  const all = await listLocalConfigs(aasHome)
  expect(all[0]!.enabled).toBe(false)
})

test('toggleLocalConfig flips the current enabled state', async () => {
  const first = await toggleLocalConfig(aasHome, 'default')
  expect(first.enabled).toBe(false)
  const second = await toggleLocalConfig(aasHome, 'default')
  expect(second.enabled).toBe(true)
})

test('configs persist to relay-configs.json in aasHome', async () => {
  await addLocalConfig(aasHome, 'Second')
  const raw = JSON.parse(await readFile(join(aasHome, 'relay-configs.json'), 'utf-8'))
  expect(raw).toHaveLength(2)
})
