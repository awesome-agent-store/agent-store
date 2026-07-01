import { test, expect, mock, spyOn, afterEach } from 'bun:test'
import * as fsModule from '@tauri-apps/plugin-fs'

afterEach(() => { mock.restore() })

function mockFs(existingContent: string | null) {
  const written: { path: string; content: string }[] = []
  spyOn(fsModule, 'exists').mockImplementation(async () => existingContent !== null)
  spyOn(fsModule, 'readTextFile').mockImplementation(async () => existingContent as string)
  spyOn(fsModule, 'writeTextFile').mockImplementation(async (path: string | URL, content: string) => {
    written.push({ path: String(path), content })
  })
  spyOn(fsModule, 'mkdir').mockImplementation(async () => undefined)
  return written
}

test('readLocalState returns the fallback when no file exists', async () => {
  mockFs(null)
  const { readLocalState } = await import('../LocalPersistence')
  const result = await readLocalState('favorites', {})
  expect(result).toEqual({})
})

test('readLocalState parses existing JSON content', async () => {
  mockFs(JSON.stringify({ 'item-1': true }))
  const { readLocalState } = await import('../LocalPersistence')
  const result = await readLocalState<Record<string, boolean>>('favorites', {})
  expect(result).toEqual({ 'item-1': true })
})

test('writeLocalState serializes the value to JSON', async () => {
  const written = mockFs(null)
  const { writeLocalState } = await import('../LocalPersistence')
  await writeLocalState('favorites', { 'item-1': true })
  expect(written).toHaveLength(1)
  expect(JSON.parse(written[0].content)).toEqual({ 'item-1': true })
})
