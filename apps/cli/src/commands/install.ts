import type { AASEngine } from '@aas/types'
import { formatStep } from '../utils/format'

export async function runInstall(
  engine: AASEngine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<void> {
  const slug = args[0]
  if (!slug) {
    out('Usage: aas install <slug>')
    return
  }

  try {
    out(formatStep(`Fetching ${slug}...`))
    const result = await engine.install(slug)
    out(formatStep(`Fetching ${slug}@${result.version}...`, 'done'))
    out(formatStep('Running install hooks...', 'done'))

    const detail = await engine.info(slug)
    out(formatStep(`Writing to ~/.agents/${detail.category}s/${slug}/`))

    for (const target of detail.compatibleWith) {
      await engine.enable(slug, target)
      out(formatStep(`Syncing to ${target}...`, 'done'))
    }

    out('')
    out(`  Installed ${slug} ${result.version}`)

    if (detail.category === 'provider' || detail.category === 'mcp') {
      out(`  ⚠ Configuration required — run: aas config ${slug}`)
    }
  } catch (err) {
    out(`  Error: ${err instanceof Error ? err.message : String(err)}`)
  }
}
