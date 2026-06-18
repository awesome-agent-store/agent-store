import type { AASEngine, InstalledItem, ToolTarget } from '@aas/types'
import { SYMBOLS, padEnd, formatTable } from '../utils/format'

function getFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : undefined
}

function enabledCell(entry: InstalledItem, tool: ToolTarget): string {
  if (!entry.compatibleWith.includes(tool)) return ''
  return entry.enabledFor[tool] === true ? SYMBOLS.enabled : SYMBOLS.disabled
}

export async function runList(
  engine: AASEngine,
  args: string[],
  out: (s: string) => void = console.log,
  updates: Map<string, string> = new Map()
): Promise<void> {
  const forTarget = getFlag(args, '--for') as ToolTarget | undefined
  const items = await engine.list(forTarget ? { enabledFor: undefined } : undefined)

  const filtered = forTarget
    ? items.filter(e => e.compatibleWith.includes(forTarget))
    : items

  if (!filtered.length) {
    out('No items installed.')
    return
  }

  if (forTarget) {
    const WIDTHS = [20, 10, 8, 10, 20]
    const headers = ['NAME', 'VERSION', forTarget.toUpperCase(), 'TYPE', 'STATUS']
    const rows = filtered.map(e => [
      e.slug,
      e.version,
      enabledCell(e, forTarget),
      e.category,
      updates.has(e.slug) ? `${SYMBOLS.update} ${updates.get(e.slug)} available` : '',
    ])
    formatTable(headers, rows, WIDTHS).forEach(out)
  } else {
    const WIDTHS = [20, 10, 8, 7, 10, 20]
    const headers = ['NAME', 'VERSION', 'CLAUDE', 'CODEX', 'TYPE', 'STATUS']
    const rows = filtered.map(e => [
      e.slug,
      e.version,
      enabledCell(e, 'claude'),
      enabledCell(e, 'codex'),
      e.category,
      updates.has(e.slug) ? `${SYMBOLS.update} ${updates.get(e.slug)} available` : '',
    ])
    formatTable(headers, rows, WIDTHS).forEach(out)
  }
}
