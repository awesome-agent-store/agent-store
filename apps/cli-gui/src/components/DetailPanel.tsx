import { useState } from 'react'
import { Copy, Heart } from 'lucide-react'
import { callRpc } from '../lib/rpc'
import { useAppState } from '../state/AppState'
import { useTerminalLog } from '../state/TerminalLog'
import { useSelectedDetail } from '../lib/useSelectedDetail'

const CATEGORY_LABEL: Record<string, string> = { provider: '供应商', skill: '技能', mcp: 'MCP' }

const USE_CASE_COPY: Record<string, string> = {
  provider: '安装后作为可切换的 API 端点预设，一键切换即可对全部会话生效。',
  skill: '安装后 agent 会在相关任务中自动加载该技能，无需额外配置。',
  mcp: '安装后自动注册为 MCP 服务器，agent 可直接调用其暴露的工具。',
}

type Tab = 'overview' | 'reviews' | 'versions'

export function DetailPanel() {
  const { favoriteSlugs, toggleFavorite, bumpInstalledVersion } = useAppState()
  const { appendLine } = useTerminalLog()
  const detail = useSelectedDetail()
  const [tab, setTab] = useState<Tab>('overview')

  if (!detail) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-store-text-2">
        从左侧选择一个资源查看详情
      </div>
    )
  }

  async function install() {
    if (!detail || detail.installed) return
    appendLine(`$ aas install ${detail.slug}`)
    try {
      const result = await callRpc<{ version: string }>('install', [detail.slug])
      appendLine(`✓ 已安装 ${detail.slug} ${result.version}`, 'green')
      bumpInstalledVersion()
    } catch (err) {
      appendLine(`✗ ${err instanceof Error ? err.message : String(err)}`, 'red')
    }
  }

  const isFavorite = favoriteSlugs.has(detail.slug)
  const rating = 'rating' in detail ? detail.rating : 0

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 shrink-0 rounded-xl bg-store-panel-2" />
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-store-text">{detail.name}</h2>
            {detail.publisher.tier === 'official' && (
              <span className="rounded-full bg-store-amber/10 px-2 py-0.5 text-[10px] font-medium text-store-amber">
                官方
              </span>
            )}
            {!detail.installed && detail.status === 'published' && (
              <span className="rounded-full bg-store-green/10 px-2 py-0.5 text-[10px] font-medium text-store-green">
                已发布
              </span>
            )}
          </div>
          <p className="text-xs text-store-text-2">
            {detail.publisher.name} · ↓ {detail.downloads} · ★ {rating} · {CATEGORY_LABEL[detail.category]}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-store-text-2">{detail.description}</p>

      <div className="mt-3 flex items-center gap-2">
        {detail.installed ? (
          <span className="rounded-lg border border-store-green px-3 py-1.5 text-xs font-medium text-store-green">
            ✓ 已安装
          </span>
        ) : (
          <button
            type="button"
            onClick={install}
            className="rounded-lg bg-store-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            安装
          </button>
        )}
        <button
          type="button"
          aria-label={isFavorite ? '取消收藏' : '收藏'}
          onClick={() => toggleFavorite(detail.slug)}
          className={`rounded-lg border px-2 py-1.5 ${
            isFavorite ? 'border-store-red text-store-red' : 'border-store-border text-store-text-2'
          }`}
        >
          <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg bg-black px-3 py-2 font-mono text-xs text-store-text-2">
        <span>$ agent-store add {detail.slug}</span>
        <button
          type="button"
          aria-label="复制安装命令"
          onClick={() => navigator.clipboard?.writeText(`agent-store add ${detail.slug}`)}
          className="text-store-text-3 hover:text-store-text"
        >
          <Copy size={12} />
        </button>
      </div>

      <div className="mt-4 flex gap-4 border-b border-store-border text-sm">
        {(
          [
            { key: 'overview', label: '概览' },
            { key: 'reviews', label: '评价' },
            { key: 'versions', label: '版本' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`pb-2 ${tab === t.key ? 'border-b-2 border-store-accent text-store-text' : 'text-store-text-2'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <h3 className="mb-1 text-sm font-medium text-store-text">概述</h3>
            <p className="text-sm text-store-text-2">{detail.description}</p>
          </div>
          {'installHook' in detail && detail.installHook.steps.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-medium text-store-text">安装步骤</h3>
              <ul className="flex flex-col gap-1 text-sm text-store-text-2">
                {detail.installHook.steps.map((step, i) => (
                  <li key={i}>
                    ▹{' '}
                    {step.type === 'script'
                      ? `script · ${step.command}`
                      : step.type === 'config'
                        ? 'config · 写入配置'
                        : `file · ${step.dest}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="mb-1 text-sm font-medium text-store-text">适用场景</h3>
            <p className="text-sm text-store-text-2">{USE_CASE_COPY[detail.category]}</p>
          </div>
        </div>
      )}

      {tab === 'reviews' && <p className="mt-4 text-sm text-store-text-2">暂无评价</p>}

      {tab === 'versions' && (
        <p className="mt-4 text-sm text-store-text-2">当前版本：v{detail.version}</p>
      )}
    </div>
  )
}
