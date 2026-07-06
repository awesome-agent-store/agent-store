import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

function normalizeDir(input: string) {
  const normalized = path.resolve(input).replaceAll('\\', '/')
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

export function hasStaleTargetOutputs(rootOutputPaths: string[], targetDir: string) {
  if (rootOutputPaths.length === 0) {
    return false
  }

  const expectedPrefix = normalizeDir(targetDir)

  return rootOutputPaths.some((outputPath) => {
    const trimmed = outputPath.trim()
    if (!trimmed) {
      return false
    }

    return !normalizeDir(trimmed).startsWith(expectedPrefix)
  })
}

export function readRootOutputPaths(targetDir: string) {
  const buildDir = path.join(targetDir, 'debug', 'build')
  if (!existsSync(buildDir)) {
    return []
  }

  const rootOutputs: string[] = []
  const stack = [buildDir]

  while (stack.length > 0) {
    const currentDir = stack.pop() as string
    const entries = readdirSync(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        stack.push(entryPath)
        continue
      }

      if (entry.isFile() && entry.name === 'root-output') {
        rootOutputs.push(readFileSync(entryPath, 'utf8'))
      }
    }
  }

  return rootOutputs
}
