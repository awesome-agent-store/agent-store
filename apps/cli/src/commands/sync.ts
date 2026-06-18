import type { AASEngine, ToolTarget } from '@aas/types'

function getFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

export async function runSync(
  engine: AASEngine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<void> {
  const target = getFlag(args, '--for') as ToolTarget | undefined
  const targets = target ? [target] : undefined
  const result = await engine.sync(targets)
  out(`  Synced ${result.synced.length} item${result.synced.length === 1 ? '' : 's'}`)
  for (const e of result.errors) {
    out(`  Error syncing ${e.slug}: ${e.error}`)
  }
}
