import type { InstalledItem, RegistryJson, ToolTarget } from '@aas/types'
import { itemDir } from '../paths'
import { readProviderConnection, type ProviderConnection } from '../config/provider'

export interface OrderedProviderCandidate {
  item: InstalledItem
  connection: ProviderConnection
}

export async function findOrderedProvidersForTarget(
  aasHome: string,
  registry: RegistryJson,
  target: ToolTarget
): Promise<OrderedProviderCandidate[]> {
  const enabled = registry.installed.filter(
    (entry) =>
      entry.category === 'provider' &&
      entry.compatibleWith.includes(target) &&
      entry.enabledFor[target] === true
  )
  const candidates = await Promise.all(
    enabled.map(async (item) => ({
      item,
      connection: await readProviderConnection(itemDir(aasHome, 'provider', item.slug)),
    }))
  )
  return candidates.sort((a, b) => (a.connection.level ?? 1) - (b.connection.level ?? 1))
}
