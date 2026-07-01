import { useEffect, useState } from 'react'
import type { InstalledItem, ToolTarget } from '@aas/types'
import { callRpc } from '../lib/rpc'
import { useAppState } from '../state/AppState'
import { useTerminalLog } from '../state/TerminalLog'

export function InstalledList() {
  const { agentApp } = useAppState()
  const { appendLine } = useTerminalLog()
  const [items, setItems] = useState<InstalledItem[]>([])

  async function refresh() {
    const result = await callRpc<InstalledItem[]>('list')
    setItems(result)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggleEnabled(item: InstalledItem, target: ToolTarget) {
    const isEnabled = !!item.enabledFor[target]
    appendLine(`$ aas ${isEnabled ? 'disable' : 'enable'} ${item.slug} --for ${target}`)
    try {
      await callRpc(isEnabled ? 'disable' : 'enable', [item.slug, target])
      appendLine(`✓ ${item.slug} ${isEnabled ? '已禁用' : '已启用'} (${target})`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    refresh()
  }

  async function uninstall(item: InstalledItem) {
    appendLine(`$ aas uninstall ${item.slug}`)
    try {
      await callRpc('uninstall', [item.slug])
      appendLine(`✓ 已卸载 ${item.slug}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const enabled = !!item.enabledFor[agentApp]
        return (
          <div
            key={item.slug}
            className="flex items-center justify-between rounded-lg border border-store-border bg-store-panel px-3 py-2"
          >
            <div>
              <p className="text-sm text-store-text">{item.slug}</p>
              <p className="text-xs text-store-text-3">{item.version}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label={`为 ${agentApp} ${enabled ? '禁用' : '启用'} ${item.slug}`}
                onClick={() => toggleEnabled(item, agentApp)}
                className={`rounded-md px-2 py-1 text-xs ${
                  enabled ? 'bg-store-green/10 text-store-green' : 'bg-store-panel-2 text-store-text-2'
                }`}
              >
                {enabled ? '已启用' : '已禁用'}
              </button>
              <button
                type="button"
                onClick={() => uninstall(item)}
                className="text-xs text-store-red hover:opacity-80"
              >
                卸载
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
