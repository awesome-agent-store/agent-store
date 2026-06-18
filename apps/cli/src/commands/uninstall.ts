import type { AASEngine } from '@aas/types'

export async function runUninstall(
  engine: AASEngine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<void> {
  const slug = args[0]
  if (!slug) {
    out('Usage: aas uninstall <slug>')
    return
  }
  try {
    await engine.uninstall(slug)
    out(`  Uninstalled ${slug}`)
  } catch (err) {
    out(`  Error: ${err instanceof Error ? err.message : String(err)}`)
  }
}
