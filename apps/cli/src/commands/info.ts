import type { AASEngine } from '@aas/types'

export async function runInfo(
  engine: AASEngine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<void> {
  const slug = args[0]
  if (!slug) {
    out('Usage: aas info <slug>')
    return
  }

  const detail = await engine.info(slug)
  const enabledStatus = detail.compatibleWith
    .map(t => `${t}: ${detail.enabledFor[t] ? 'enabled' : 'disabled'}`)
    .join('  |  ')

  out('')
  out(`  ${detail.slug}  ${detail.version}   ${detail.publisher.tier}`)
  out(`  ${detail.description}`)
  out('')
  out(`  Publisher    ${detail.publisher.name} (${detail.publisher.slug})`)
  out(`  Compatible   ${detail.compatibleWith.join(' · ')}`)
  out(`  Installed    ${detail.installedAt.slice(0, 10)}  (updated ${detail.updatedAt.slice(0, 10)})`)
  out(`  Status       ${enabledStatus}`)

  if (detail.supportedModels?.length) {
    out('')
    out('  Models')
    out(`    ${detail.supportedModels.join(' · ')}`)
  }

  if (detail.category === 'provider' || detail.category === 'mcp') {
    out('')
    out(`  Run \`aas config ${slug}\` to update configuration.`)
  }
}
