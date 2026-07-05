import { useEffect, useMemo, useState } from 'react'
import type { Item, InstalledItem, ItemDetail, LocalRelayConfig, UpdateAvailable } from '@aas/types'
import { Search, Filter, Check, RadioTower } from 'lucide-react'
import { callRpc } from '../lib/rpc'
import { useAppState, type AgentApp, type ListFilter } from '../state/AppState'
import { useTerminalLog } from '../state/TerminalLog'
import { LOCAL_PROVIDER_SENTINEL } from './LocalProviderDetail'
import { CategoryIcon } from './CategoryIcon'
import {
  matchesCategoryFilter, matchesText, enrichInstalled, filterInstalledByListFilter,
  filterRecommendedByListFilter, showInstalledSection, showRecommendedSection,
  type EnrichedInstalledItem,
} from '../lib/resources'

const FOPTS: Record<Exclude<ListFilter, 'all'>, string> = {
  featured: '精选', popular: '最热门', recent: '最近发布', recommended: '推荐',
  installed: '已安装', updates: '可更新', enabled: '已启用', disabled: '已禁用',
}

const DISCOVERY_TOKENS: Exclude<ListFilter, 'all'>[] = ['featured', 'popular', 'recent', 'recommended']
const STATUS_TOKENS: Exclude<ListFilter, 'all'>[] = ['installed', 'updates', 'enabled', 'disabled']

const APP_OPTIONS: { key: AgentApp; label: string; letter: string; color: string }[] = [
  { key: 'claude', label: 'Claude Code', letter: 'C', color: '#d2785a' },
  { key: 'codex', label: 'Codex', letter: 'X', color: '#10a37f' },
]

export function ResourceList() {
  const {
    agentApp, setAgentApp, categoryFilter, listFilter, setListFilter,
    selectedSlug, setSelectedSlug, navView,
    installedVersion, bumpInstalledVersion,
    editingConfigSlug, setEditingConfigSlug,
  } = useAppState()
  const { appendLine } = useTerminalLog()
  const [installed, setInstalled] = useState<EnrichedInstalledItem[]>([])
  const [catalog, setCatalog] = useState<Item[]>([])
  const [updates, setUpdates] = useState<UpdateAvailable[]>([])
  const [textQuery, setTextQuery] = useState('')
  const [tokenMenuOpen, setTokenMenuOpen] = useState(false)
  const [localConfigs, setLocalConfigs] = useState<LocalRelayConfig[]>([])

  function openConfigEditor(slug: string) {
    setEditingConfigSlug(slug)
    setSelectedSlug(slug)
  }

  function selectResource(slug: string) {
    setEditingConfigSlug(null)
    setSelectedSlug(slug)
  }

  async function refreshLocal() {
    setLocalConfigs(await callRpc<LocalRelayConfig[]>('listLocalConfigs'))
  }

  async function addLocalPort() {
    await callRpc('addLocalConfig', ['新配置'])
    refreshLocal()
  }

  async function removeLocalPort(id: string) {
    await callRpc('removeLocalConfig', [id])
    refreshLocal()
  }

  async function refreshInstalled() {
    const result = await callRpc<InstalledItem[]>('list')
    const details = await Promise.all(result.map((item) => callRpc<ItemDetail>('info', [item.slug])))
    setInstalled(result.map((item, i) => enrichInstalled(item, details[i])))
  }

  async function refreshCatalog() {
    setCatalog(await callRpc<Item[]>('search', ['']))
  }

  async function refreshUpdates() {
    setUpdates(await callRpc<UpdateAvailable[]>('checkUpdates'))
  }

  useEffect(() => {
    refreshInstalled()
    refreshCatalog()
    refreshUpdates()
    refreshLocal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installedVersion])

  const installedSlugs = useMemo(() => new Set(installed.map((i) => i.slug)), [installed])
  const updatableSlugs = useMemo(() => new Set(updates.map((u) => u.slug)), [updates])

  const rootInstalled = useMemo(() => installed.filter((i) => !i.parentSlug), [installed])
  const childrenByParent = useMemo(() => {
    const map = new Map<string, EnrichedInstalledItem[]>()
    for (const item of installed) {
      if (!item.parentSlug) continue
      const list = map.get(item.parentSlug) ?? []
      list.push(item)
      map.set(item.parentSlug, list)
    }
    return map
  }, [installed])

  const visibleInstalled = useMemo(
    () =>
      filterInstalledByListFilter(
        rootInstalled.filter(
          (i) => matchesCategoryFilter(i.category, categoryFilter) && matchesText(i.name, i.description, textQuery)
        ),
        listFilter,
        agentApp,
        updatableSlugs
      ),
    [rootInstalled, categoryFilter, textQuery, listFilter, agentApp, updatableSlugs]
  )

  const recommendedBase = useMemo(
    () =>
      catalog.filter(
        (item) =>
          (!installedSlugs.has(item.slug) || item.category === 'provider') &&
          matchesCategoryFilter(item.category, categoryFilter) &&
          matchesText(item.name, item.description, textQuery)
      ),
    [catalog, installedSlugs, categoryFilter, textQuery]
  )

  const visibleRecommended = useMemo(
    () => filterRecommendedByListFilter(recommendedBase, listFilter),
    [recommendedBase, listFilter]
  )

  function handleSearchInput(value: string) {
    if (value.startsWith('@')) {
      setTokenMenuOpen(true)
      return
    }
    setTokenMenuOpen(false)
    setTextQuery(value)
    if (listFilter !== 'all') setListFilter('all')
  }

  function selectToken(key: Exclude<ListFilter, 'all'>) {
    setListFilter(key)
    setTextQuery('')
    setTokenMenuOpen(false)
  }

  function selectApp(key: AgentApp) {
    setAgentApp(key)
    setTokenMenuOpen(false)
  }

  function clearSearch() {
    setTextQuery('')
    setListFilter('all')
    setTokenMenuOpen(false)
  }

  async function uninstall(item: EnrichedInstalledItem) {
    appendLine(`$ aas uninstall ${item.slug}`)
    try {
      await callRpc('uninstall', [item.slug])
      appendLine(`✓ 已卸载 ${item.slug}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    if (selectedSlug === item.slug) setSelectedSlug(null)
    if (editingConfigSlug === item.slug) setEditingConfigSlug(null)
    bumpInstalledVersion()
  }

  async function install(item: Item) {
    appendLine(`$ aas install ${item.slug}`)
    try {
      const result = await callRpc<{ version: string }>('install', [item.slug])
      appendLine(`✓ 已安装 ${item.slug} ${result.version}`, 'green')
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    bumpInstalledVersion()
  }

  async function addChildConfig(item: EnrichedInstalledItem) {
    appendLine(`$ aas duplicate ${item.slug}`)
    try {
      const result = await callRpc<{ newSlug: string }>('duplicateProvider', [item.slug])
      appendLine(`✓ 已新增子配置 ${result.newSlug}`, 'green')
      openConfigEditor(result.newSlug)
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    bumpInstalledVersion()
  }

  async function configureProvider(item: Item) {
    appendLine(`$ aas configure ${item.slug}`)
    try {
      if (installedSlugs.has(item.slug)) {
        const result = await callRpc<{ newSlug: string }>('duplicateProvider', [item.slug])
        appendLine(`✓ 已新增子配置 ${result.newSlug}`, 'green')
        openConfigEditor(result.newSlug)
      } else {
        await callRpc('install', [item.slug])
        appendLine(`✓ 已安装 ${item.slug}`, 'green')
        openConfigEditor(item.slug)
      }
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
    bumpInstalledVersion()
  }

  const searchValue = listFilter === 'all' ? textQuery : `@${listFilter}`

  return (
    <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-store-border p-4">
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-store-text-3" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder="搜索，或用 @ 过滤…"
              className="w-full rounded-lg border border-store-border bg-store-panel py-2 pl-8 pr-8 font-mono text-sm text-store-accent"
            />
            {(textQuery !== '' || listFilter !== 'all') && (
              <button
                type="button"
                aria-label="清除"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-store-text-3 hover:text-store-text"
              >
                ×
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="筛选过滤"
            title="筛选过滤"
            onClick={() => setTokenMenuOpen((v) => !v)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
              tokenMenuOpen ? 'border-store-accent bg-store-accent-soft text-store-accent' : 'border-store-border bg-store-panel text-store-text-3 hover:text-store-text'
            }`}
          >
            <Filter size={14} />
          </button>
        </div>

        {tokenMenuOpen && (
          <div
            onMouseLeave={() => setTokenMenuOpen(false)}
            className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-store-border-strong bg-store-content p-1.5 shadow-lg"
          >
            <p className="px-2 pb-1 pt-1 text-[9.5px] font-bold uppercase tracking-wide text-store-text-3">发现</p>
            {DISCOVERY_TOKENS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => selectToken(key)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                  listFilter === key ? 'bg-store-accent-soft text-store-accent' : 'text-store-text hover:bg-store-panel-2'
                }`}
              >
                <span className="flex-1 text-xs font-medium">{FOPTS[key]}</span>
                <span className="font-mono text-[10px] text-store-text-3">@{key}</span>
              </button>
            ))}
            <div className="my-1 h-px bg-store-border" />
            <p className="px-2 pb-1 pt-1 text-[9.5px] font-bold uppercase tracking-wide text-store-text-3">状态</p>
            {STATUS_TOKENS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => selectToken(key)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                  listFilter === key ? 'bg-store-accent-soft text-store-accent' : 'text-store-text hover:bg-store-panel-2'
                }`}
              >
                <span className="flex-1 text-xs font-medium">{FOPTS[key]}</span>
                <span className="font-mono text-[10px] text-store-text-3">@{key}</span>
              </button>
            ))}
            <div className="my-1 h-px bg-store-border" />
            <p className="px-2 pb-1 pt-1 text-[9.5px] font-bold uppercase tracking-wide text-store-text-3">目标应用</p>
            {APP_OPTIONS.map((app) => (
              <button
                key={app.key}
                type="button"
                onClick={() => selectApp(app.key)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-store-panel-2"
              >
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
                  style={{ background: app.color }}
                >
                  {app.letter}
                </span>
                <span className="flex-1 text-xs font-medium text-store-text">{app.label}</span>
                {agentApp === app.key && <Check size={13} className="text-store-accent" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {navView === 'browse' && categoryFilter === 'provider' && showInstalledSection(listFilter) && (
        <div>
          <div
            onClick={() => selectResource(LOCAL_PROVIDER_SENTINEL)}
            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 ${
              selectedSlug === LOCAL_PROVIDER_SENTINEL ? 'border-store-accent bg-store-accent-soft' : 'border-store-border bg-store-panel'
            }`}
          >
            <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-store-accent-soft text-store-accent">
              <RadioTower size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="whitespace-nowrap font-mono text-sm font-bold text-store-text">local</span>
                <span className="whitespace-nowrap rounded-full bg-store-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-store-accent">
                  内置
                </span>
              </div>
              <div className="truncate text-[10.5px] text-store-text-3">
                {localConfigs.length} 个配置 · {localConfigs.filter((c) => c.enabled).length} 个运行中
              </div>
            </div>
            <button
              type="button"
              aria-label="新增本地监听配置"
              onClick={(e) => {
                e.stopPropagation()
                addLocalPort()
              }}
              className="shrink-0 text-store-text-2 hover:text-store-text"
            >
              +
            </button>
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {localConfigs.map((config) => (
              <div
                key={config.id}
                onClick={() => selectResource(`${LOCAL_PROVIDER_SENTINEL}:${config.id}`)}
                className={`relative flex cursor-pointer items-center gap-2 rounded-md py-1.5 pl-[30px] pr-2 text-xs ${
                  selectedSlug === `${LOCAL_PROVIDER_SENTINEL}:${config.id}` ? 'bg-store-accent-soft text-store-accent' : 'text-store-text-2 hover:bg-store-panel'
                }`}
              >
                <span className="pointer-events-none absolute left-4 top-0 h-1/2 w-2 rounded-bl-md border-b border-l border-store-border-strong" />
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.enabled ? 'bg-store-green' : 'bg-store-text-3'}`} />
                <span className="flex-1 truncate">{config.name}</span>
                <span className="font-mono text-store-text-3">:{config.port}</span>
                <button
                  type="button"
                  aria-label={`删除 ${config.name}`}
                  onClick={(e) => { e.stopPropagation(); removeLocalPort(config.id) }}
                  className="text-store-text-3 hover:text-store-red"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {navView === 'browse' && showInstalledSection(listFilter) && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-store-text-2">
            已添加 <span className="rounded-full bg-store-panel-2 px-1.5">{visibleInstalled.length}</span>
          </p>
          <div className="flex flex-col gap-1">
            {visibleInstalled.map((item) => {
              const outdated = updatableSlugs.has(item.slug)
              return (
                <div key={item.slug}>
                  <div
                    onClick={() => selectResource(item.slug)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 ${
                      selectedSlug === item.slug ? 'border-store-accent bg-store-accent-soft' : 'border-store-border bg-store-panel'
                    }`}
                  >
                    <CategoryIcon category={item.category} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-sm font-bold text-store-text">{item.name}</span>
                        {outdated && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-store-amber" />}
                      </div>
                      <p className="truncate text-xs text-store-text-3">
                        {item.publisher.name} · {item.category}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {item.category === 'provider' && (
                        <button
                          type="button"
                          aria-label={`新增子配置 ${item.slug}`}
                          onClick={() => addChildConfig(item)}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-store-text-3 hover:bg-store-panel-2 hover:text-store-text"
                        >
                          +
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`卸载 ${item.slug}`}
                        onClick={() => uninstall(item)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-store-text-3 hover:bg-store-panel-2 hover:text-store-red"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {item.category === 'provider' && (childrenByParent.get(item.slug)?.length ?? 0) > 0 && (
                    <div className="mt-1 flex flex-col gap-1">
                      {childrenByParent.get(item.slug)!.map((child) => (
                        <div
                          key={child.slug}
                          onClick={() => openConfigEditor(child.slug)}
                          className={`relative flex cursor-pointer items-center gap-2 rounded-md py-1.5 pl-[30px] pr-2 text-xs ${
                            selectedSlug === child.slug ? 'bg-store-accent-soft text-store-accent' : 'text-store-text-2 hover:bg-store-panel'
                          }`}
                        >
                          <span className="pointer-events-none absolute left-4 top-0 h-1/2 w-2 rounded-bl-md border-b border-l border-store-border-strong" />
                          <span className="flex-1 truncate font-mono">{child.slug}</span>
                          <button
                            type="button"
                            aria-label={`删除 ${child.slug}`}
                            onClick={(e) => { e.stopPropagation(); uninstall(child) }}
                            className="text-store-text-3 hover:text-store-red"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {navView === 'browse' && showRecommendedSection(listFilter) && (
        <div>
          <p className="mb-2 text-xs font-medium text-store-text-2">
            推荐 <span className="rounded-full bg-store-panel-2 px-1.5">{visibleRecommended.length}</span>
          </p>
          <div className="flex flex-col gap-1">
            {visibleRecommended.map((item) => (
              <div
                key={item.slug}
                onClick={() => selectResource(item.slug)}
                className={`cursor-pointer rounded-lg border px-3 py-2 ${
                  selectedSlug === item.slug ? 'border-store-accent bg-store-accent-soft' : 'border-store-border bg-store-panel'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-store-text">{item.name}</p>
                    <p className="text-xs text-store-text-3">
                      ★ {item.rating} · ↓ {item.downloads}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (item.category === 'provider') configureProvider(item)
                      else install(item)
                    }}
                    className="rounded-md bg-store-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    {item.category === 'provider' ? '配置' : '安装'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
