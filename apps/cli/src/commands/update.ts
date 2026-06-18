import type { AASEngine } from '@aas/types'

export async function runUpdate(
  engine: AASEngine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<void> {
  const slug = args[0]
  const results = await engine.update(slug)
  if (!results.length) {
    out('  No updates available.')
    return
  }
  for (const r of results) {
    out(`  Updated ${r.slug} from ${r.fromVersion} to ${r.toVersion}`)
  }
}
