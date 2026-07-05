import { useEffect, useState } from 'react'
import { TrendingUp, RadioTower } from 'lucide-react'
import type { InstalledItem, LocalRelayConfig, RecentRequestRow, RelayStatus, UpdateAvailable, UsageSummaryRow } from '@aas/types'
import { callRpc } from '../lib/rpc'
import { useAppState } from '../state/AppState'
import { CategoryIcon } from './CategoryIcon'
import { LOCAL_PROVIDER_SENTINEL } from './LocalProviderDetail'
import { ProxyLogModal } from './ProxyLogModal'
import { UsageTrendChart } from './UsageTrendChart'

const CATEGORY_CARDS: { category: InstalledItem['category']; label: string }[] = [
  { category: 'provider', label: '供应商' },
  { category: 'skill', label: '技能' },
  { category: 'mcp', label: 'MCP' },
]

export function Overview() {
  const { setNavView, setCategoryFilter, setSelectedSlug } = useAppState()
  const [installed, setInstalled] = useState<InstalledItem[]>([])
  const [today, setToday] = useState<UsageSummaryRow[]>([])
  const [last7Days, setLast7Days] = useState<UsageSummaryRow[]>([])
  const [last30Days, setLast30Days] = useState<UsageSummaryRow[]>([])
  const [relayStatus, setRelayStatus] = useState<RelayStatus>({ running: false })
  const [localConfigs, setLocalConfigs] = useState<LocalRelayConfig[]>([])
  const [recentRequests, setRecentRequests] = useState<RecentRequestRow[]>([])
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [updates, setUpdates] = useState<UpdateAvailable[]>([])
  const [trendPeriod, setTrendPeriod] = useState<'today' | 'last7Days' | 'last30Days'>('today')

  useEffect(() => {
    callRpc<InstalledItem[]>('list').then(setInstalled)
  }, [])

  useEffect(() => {
    callRpc<UsageSummaryRow[]>('getUsageSummary', [{ days: 1 }]).then(setToday)
    callRpc<UsageSummaryRow[]>('getUsageSummary', [{ days: 7 }]).then(setLast7Days)
    callRpc<UsageSummaryRow[]>('getUsageSummary', [{ days: 30 }]).then(setLast30Days)
  }, [])

  useEffect(() => {
    callRpc<RelayStatus>('getRelayStatus').then(setRelayStatus)
    callRpc<LocalRelayConfig[]>('listLocalConfigs').then(setLocalConfigs)
  }, [])

  useEffect(() => {
    callRpc<RecentRequestRow[]>('getRecentRequests', [{ limit: 5 }]).then(setRecentRequests)
  }, [])

  useEffect(() => {
    callRpc<UpdateAvailable[]>('checkUpdates').then(setUpdates)
  }, [])

  function summarize(rows: UsageSummaryRow[]) {
    return {
      requestCount: rows.reduce((sum, r) => sum + r.requestCount, 0),
      successCount: rows.reduce((sum, r) => sum + r.successCount, 0),
      costUsd: rows.reduce((sum, r) => sum + r.costUsd, 0),
      tokens: rows.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0),
      modelCount: new Set(rows.map((r) => r.model)).size,
    }
  }

  function successRateLabel(summary: ReturnType<typeof summarize>) {
    if (summary.requestCount === 0) return '—'
    return `${Math.round((summary.successCount / summary.requestCount) * 100)}%`
  }

  function goToCategory(category: InstalledItem['category']) {
    setCategoryFilter(category)
    setNavView('browse')
  }

  async function updateOne(slug: string) {
    await callRpc('update', [slug])
    callRpc<UpdateAvailable[]>('checkUpdates').then(setUpdates)
  }

  function activePeriodRows(): UsageSummaryRow[] {
    if (trendPeriod === 'today') return today
    if (trendPeriod === 'last7Days') return last7Days
    return last30Days
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
      <div className="rounded-xl border border-store-border bg-store-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-store-panel-2 text-store-text">
              <TrendingUp size={16} />
            </div>
            <div>
              <p className="text-sm font-medium text-store-text">消耗趋势</p>
              <p className="text-xs text-store-text-2">用量数据统计</p>
            </div>
          </div>
          <div className="flex gap-1 rounded-lg border border-store-border bg-store-panel-2 p-1 text-xs">
            {(
              [
                { key: 'today', label: '今日' },
                { key: 'last7Days', label: '近 7 天' },
                { key: 'last30Days', label: '近 30 天' },
              ] as const
            ).map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setTrendPeriod(p.key)}
                className={`rounded-md px-2 py-1 ${trendPeriod === p.key ? 'bg-store-panel text-store-text' : 'text-store-text-2'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <UsageTrendChart rows={activePeriodRows()} />

        <div className="mt-3 grid grid-cols-4 gap-3 border-t border-store-border pt-3 text-xs">
          <div className="rounded-lg bg-store-accent-soft p-3">
            <p className="text-store-text-2">总费用</p>
            <p className="mt-1 text-base font-semibold text-store-text">${summarize(activePeriodRows()).costUsd.toFixed(4)}</p>
          </div>
          <div className="rounded-lg bg-store-panel-2 p-3">
            <p className="text-store-text-2">总 Tokens</p>
            <p className="mt-1 text-base font-semibold text-store-text">{summarize(activePeriodRows()).tokens}</p>
          </div>
          <div className="rounded-lg bg-store-green-soft p-3">
            <p className="text-store-text-2">总请求数</p>
            <p className="mt-1 text-base font-semibold text-store-text">{summarize(activePeriodRows()).requestCount}</p>
          </div>
          <div className="rounded-lg bg-store-purple-soft p-3">
            <p className="text-store-text-2">模型分布</p>
            <p className="mt-1 text-base font-semibold text-store-text">{summarize(activePeriodRows()).modelCount}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {CATEGORY_CARDS.map(({ category, label }) => (
          <button
            key={category}
            type="button"
            onClick={() => goToCategory(category)}
            className="flex items-center gap-3 rounded-xl border border-store-border bg-store-panel p-4 text-left hover:border-store-border-strong"
          >
            <CategoryIcon category={category} />
            <span className="flex-1 text-xs font-medium text-store-text-2">{label}</span>
            <span className="text-2xl font-semibold text-store-text">
              {installed.filter((i) => i.category === category).length}
            </span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-3" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('provider')
              setNavView('browse')
              setSelectedSlug(LOCAL_PROVIDER_SENTINEL)
            }}
            className="flex flex-col gap-3 rounded-xl border border-store-border bg-store-panel p-4 text-left hover:border-store-border-strong"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
                  style={{ background: 'linear-gradient(135deg, #7c82ff, #b06ad9)' }}
                >
                  <RadioTower size={15} />
                </div>
                <p className="font-mono text-sm font-semibold text-store-text">local</p>
              </div>
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${relayStatus.running ? 'text-store-green' : 'text-store-text-3'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${relayStatus.running ? 'bg-store-green' : 'bg-store-text-3'}`} />
                {relayStatus.running ? '运行中' : '已停止'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs text-store-text-2">
              <div>
                <p>监听地址</p>
                <p className="mt-1 font-mono text-sm font-semibold text-store-accent">
                  127.0.0.1{localConfigs[0] ? `:${localConfigs[0].port}` : ''}
                </p>
              </div>
              <div>
                <p>今日请求</p>
                <p className="mt-1 text-sm font-semibold text-store-text">{summarize(today).requestCount}</p>
              </div>
              <div>
                <p>成功率</p>
                <p className="mt-1 text-sm font-semibold text-store-green">{successRateLabel(summarize(today))}</p>
              </div>
            </div>
          </button>

          <div className="rounded-xl border border-store-border bg-store-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-store-text">最近请求</p>
              <button type="button" onClick={() => setLogModalOpen(true)} className="text-xs text-store-accent hover:opacity-80">
                查看全部
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {recentRequests.map((row) => (
                <div key={row.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${row.statusCode < 400 ? 'bg-store-green' : 'bg-store-red'}`} />
                    <span className="font-medium text-store-text">{row.target === 'claude' ? 'Claude Code' : 'Codex'}</span>
                    <span className="font-mono text-store-text-2">
                      {row.model} → {row.providerSlug}
                      {row.isFallback ? '（降级）' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-store-text-3">
                    <span>{row.latencyMs}ms</span>
                    <span className={row.statusCode < 400 ? 'text-store-green' : 'text-store-red'}>{row.statusCode}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-store-border bg-store-panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-store-text">可更新</p>
              {updates.length > 0 && (
                <span className="rounded-full bg-store-amber-soft px-1.5 py-0.5 text-[10px] font-medium text-store-amber">
                  {updates.length}
                </span>
              )}
            </div>
            <button type="button" onClick={() => goToCategory('provider')} className="text-xs font-medium text-store-accent hover:underline">
              全部
            </button>
          </div>
          {updates.length > 0 && (
            <div className="flex flex-col gap-2">
              {updates.slice(0, 4).map((item) => {
                const category = installed.find((i) => i.slug === item.slug)?.category ?? 'mcp'
                return (
                  <div key={item.slug} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CategoryIcon category={category} size="sm" />
                      <div className="flex flex-col">
                        <span className="text-store-text">{item.slug}</span>
                        <span className="text-store-text-3">
                          v{item.currentVersion} → v{item.latestVersion}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateOne(item.slug)}
                      className="rounded-md bg-store-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                    >
                      更新
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ProxyLogModal open={logModalOpen} onOpenChange={setLogModalOpen} />
    </div>
  )
}
