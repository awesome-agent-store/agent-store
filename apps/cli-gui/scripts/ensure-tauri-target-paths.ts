import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { hasStaleTargetOutputs, readRootOutputPaths } from '../src/lib/tauriTarget'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const tauriDir = path.resolve(scriptDir, '../src-tauri')
const targetDir = path.join(tauriDir, 'target')
const rootOutputPaths = readRootOutputPaths(targetDir)

if (!hasStaleTargetOutputs(rootOutputPaths, targetDir)) {
  process.exit(0)
}

console.log('Detected stale Cargo/Tauri target outputs from another checkout. Running cargo clean...')

const result = spawnSync('cargo', ['clean', '--manifest-path', path.join(tauriDir, 'Cargo.toml')], {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
