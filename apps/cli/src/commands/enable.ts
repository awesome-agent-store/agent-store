import type { AASEngine, ToolTarget } from '@aas/types'

function getFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

export async function runEnable(
  engine: AASEngine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<void> {
  const slug = args[0]
  const target = getFlag(args, '--for') as ToolTarget | undefined
  if (!slug || !target) {
    out('Usage: aas enable <slug> --for <claude|codex>')
    return
  }
  try {
    await engine.enable(slug, target)
    out(`  ${slug} enabled for ${target}`)
  } catch (err) {
    out(`  Error: ${err instanceof Error ? err.message : String(err)}`)
  }
}
