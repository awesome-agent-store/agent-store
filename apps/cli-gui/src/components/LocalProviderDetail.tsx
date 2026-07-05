export const LOCAL_PROVIDER_SENTINEL = '__local__'

export function isLocalProviderSlug(slug: string | null): boolean {
  return slug === LOCAL_PROVIDER_SENTINEL || (slug?.startsWith(`${LOCAL_PROVIDER_SENTINEL}:`) ?? false)
}

export function localConfigIdFromSlug(slug: string): string | null {
  if (slug === LOCAL_PROVIDER_SENTINEL) return null
  return slug.slice(`${LOCAL_PROVIDER_SENTINEL}:`.length)
}

import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { LocalRelayConfig, ToolTarget } from '@aas/types'
import { callRpc } from '../lib/rpc'
import { useAppState } from '../state/AppState'

const APP_OPTIONS: { target: ToolTarget; label: string }[] = [
  { target: 'claude', label: 'Claude Code' },
  { target: 'codex', label: 'Codex' },
]

function AppIcon({ target, on }: { target: ToolTarget; on: boolean }) {
  const dim = { filter: on ? 'none' : 'grayscale(1)', opacity: on ? 1 : 0.4 }
  if (target === 'claude') {
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" style={dim}>
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x={11.1} y={2.4} width={1.8} height={19.2} rx={0.9} fill="#D97757" transform={`rotate(${i * 22.5} 12 12)`} />
        ))}
      </svg>
    )
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" style={dim}>
      {Array.from({ length: 6 }).map((_, i) => (
        <rect key={i} x={10.4} y={2.6} width={3.2} height={8.4} rx={1.6} fill={on ? '#ececf1' : '#a1a1aa'} transform={`rotate(${i * 60} 12 12)`} />
      ))}
    </svg>
  )
}

export function LocalProviderDetail({ selectedSlug }: { selectedSlug: string }) {
  const { setSelectedSlug } = useAppState()
  const [configs, setConfigs] = useState<LocalRelayConfig[]>([])

  async function refresh() {
    setConfigs(await callRpc<LocalRelayConfig[]>('listLocalConfigs'))
  }

  useEffect(() => {
    refresh()
  }, [])

  const configId = localConfigIdFromSlug(selectedSlug)

  if (configId === null) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[18px] bg-store-accent-soft text-store-accent">
            <svg width="34" height="34" viewBox="0 0 20 20" fill="none">
              <path
                d="M10 2.5c-2 2.2-3 4.7-3 7.5s1 5.3 3 7.5c2-2.2 3-4.7 3-7.5s-1-5.3-3-7.5z"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <path d="M2.7 7h14.6M2.7 13h14.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-2xl font-bold tracking-tight text-store-text">local</span>
              <span className="rounded-full bg-store-accent-soft px-2 py-0.5 text-[11px] font-bold text-store-accent">
                内置 Provider
              </span>
            </div>
            <p className="mt-1 text-xs text-store-text-3">by Agent Store</p>
            <p className="mt-3 max-w-[620px] text-sm leading-relaxed text-store-text-2">
              Claude / Codex 指向 local 的某个监听端口，请求经该配置按 Level 顺序转发到上游供应商，失败自动降级。
            </p>
          </div>
        </div>
      </div>
    )
  }

  const config = configs.find((c) => c.id === configId)
  if (!config) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <button
          type="button"
          onClick={() => setSelectedSlug(LOCAL_PROVIDER_SENTINEL)}
          title="返回 local"
          aria-label="返回 local"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-store-border-strong text-store-text-2 hover:border-store-accent hover:text-store-accent"
        >
          <ArrowLeft size={15} />
        </button>
      </div>
    )
  }

  async function toggle() {
    await callRpc('toggleLocalConfig', [configId])
    refresh()
  }

  async function changePort(port: number) {
    if (!Number.isInteger(port) || port <= 0) return
    await callRpc('updateLocalConfig', [configId, { port }])
    refresh()
  }

  async function rename(name: string) {
    await callRpc('updateLocalConfig', [configId, { name }])
    refresh()
  }

  async function toggleTarget(target: ToolTarget) {
    const enabledFor = { ...(config?.enabledFor ?? {}), [target]: !config?.enabledFor?.[target] }
    await callRpc('updateLocalConfig', [configId, { enabledFor }])
    refresh()
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-5 flex items-center gap-3.5 border-b border-store-border pb-[18px]">
        <button
          type="button"
          onClick={() => setSelectedSlug(LOCAL_PROVIDER_SENTINEL)}
          title="返回 local"
          aria-label="返回 local"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-store-border-strong text-store-text-2 hover:border-store-accent hover:text-store-accent"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-store-text-3">local /</span>
            <input
              value={config.name}
              onChange={(e) => rename(e.target.value)}
              className="border-b-[1.5px] border-transparent bg-transparent text-lg font-bold text-store-text outline-none focus:border-store-border-strong hover:border-store-border-strong"
            />
          </div>
          <p className="mt-0.5 text-xs text-store-text-3">启用后自动将所选客户端的请求转发到此端口，无需手动配置。</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={config.enabled ? 'text-xs font-semibold text-store-green' : 'text-xs font-semibold text-store-text-2'}>
            {config.enabled ? '运行中' : '已停止'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            aria-label={`${config.name} 启用状态`}
            onClick={toggle}
            className={`h-6 w-11 rounded-full p-0.5 transition-colors ${config.enabled ? 'bg-store-accent' : 'bg-store-border-strong'}`}
          >
            <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </div>

      <div className="max-w-[520px]">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-store-text-3">适用客户端</p>
        <div className="mb-[22px] flex gap-2.5">
          {APP_OPTIONS.map(({ target, label }) => {
            const on = !!config.enabledFor?.[target]
            return (
              <button
                key={target}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={on}
                onClick={() => toggleTarget(target)}
                className={`flex h-[46px] w-[54px] items-center justify-center rounded-[10px] border-[1.5px] transition-colors ${
                  on ? 'border-store-accent bg-store-accent-soft' : 'border-store-border bg-store-panel'
                }`}
              >
                <AppIcon target={target} on={on} />
              </button>
            )
          })}
        </div>

        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-store-text-3">监听端口</p>
        <div className="flex items-center gap-2 rounded-lg border border-store-border bg-store-panel px-4 py-3.5 font-mono text-sm">
          <span className="font-bold text-store-text-3">127.0.0.1 :</span>
          <input
            value={config.port}
            onChange={(e) => changePort(Number(e.target.value))}
            className="w-20 rounded-md border border-store-border bg-store-panel-2 px-2 py-1.5 font-bold text-store-accent outline-none focus:border-store-accent"
          />
        </div>
      </div>
    </div>
  )
}
