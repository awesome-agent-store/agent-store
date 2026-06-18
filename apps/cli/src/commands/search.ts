import type { AASEngine } from '@aas/types'
import { formatDownloads } from '../utils/format'

export async function runSearch(
  engine: AASEngine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<void> {
  const query = args[0]
  if (!query) {
    out('Usage: aas search <query>')
    return
  }
  const items = await engine.search(query)
  if (!items.length) {
    out('No results.')
    return
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const compat = item.compatibleWith.join(' ')
    out(`${item.slug}   ${item.publisher.tier} · ${item.category} · ${compat}   ${formatDownloads(item.downloads)} installs`)
    out(`  ${item.description}`)
    if (i < items.length - 1) out('')
  }
}
