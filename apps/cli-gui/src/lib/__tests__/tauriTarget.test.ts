import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, expect, test } from 'bun:test'

import { hasStaleTargetOutputs, readRootOutputPaths } from '../tauriTarget'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true })
  }
})

test('detects stale Cargo/Tauri outputs from a different checkout path', () => {
  expect(
    hasStaleTargetOutputs(
      [
        '/Users/liushangliang/github/phenix3443/ai-agent-store/apps/cli-gui/src-tauri/target/debug/build/app/out',
      ],
      '/Users/liushangliang/github/phenix3443/agent-store/apps/cli-gui/src-tauri/target',
    ),
  ).toBe(true)
})

test('does not flag outputs generated from the current checkout path', () => {
  expect(
    hasStaleTargetOutputs(
      [
        '/Users/liushangliang/github/phenix3443/agent-store/apps/cli-gui/src-tauri/target/debug/build/app/out',
      ],
      '/Users/liushangliang/github/phenix3443/agent-store/apps/cli-gui/src-tauri/target',
    ),
  ).toBe(false)
})

test('reads root-output files from the Cargo build tree', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'tauri-target-test-'))
  tempDirs.push(tempDir)

  const buildDir = path.join(tempDir, 'debug', 'build', 'app-123', 'nested')
  mkdirSync(buildDir, { recursive: true })
  writeFileSync(path.join(buildDir, 'root-output'), '/tmp/example/out\n')

  expect(readRootOutputPaths(tempDir)).toEqual(['/tmp/example/out\n'])
})
