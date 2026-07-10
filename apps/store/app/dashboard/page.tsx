import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/server'
import { StoreClient } from '@as/sdk'
import type { Item, Plan } from '@as/types'
import { CATEGORY_META, formatDownloads } from '@/lib/item-meta'
import { UpgradeProButton } from '@/components/UpgradeProButton'

// All catalog/publisher data goes through the standalone API server.
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

const STATUS_META: Record<Item['status'], { label: string; color: string; soft: string }> = {
  published: { label: '已发布', color: 'var(--green)', soft: 'var(--green-soft)' },
  pending: { label: '审核中', color: 'var(--amber)', soft: 'rgba(240, 179, 74, 0.14)' },
  rejected: { label: '未通过', color: 'var(--red)', soft: 'rgba(243, 103, 95, 0.14)' },
}

const PLAN_META: Record<Plan, { label: string; premium: boolean }> = {
  free: { label: 'Free', premium: false },
  pro: { label: 'Pro', premium: true },
  team: { label: 'Team', premium: true },
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      className="rounded-2xl border border-store-border p-[18px]"
      style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.028), transparent 42%), var(--panel)' }}
    >
      <div className="text-[11.5px] font-medium uppercase tracking-wider text-store-text-3">{label}</div>
      <div className="mt-2 font-mono text-[26px] font-bold leading-none tracking-tight text-store-text">{value}</div>
      {hint && <div className="mt-1.5 text-[11.5px] text-store-text-3">{hint}</div>}
    </div>
  )
}

export default async function DashboardPage() {
  const { data: sessionData } = await auth().getSession()
  const user = sessionData?.user
  if (!user) redirect('/')

  const githubUsername = user.name ?? undefined
  if (!githubUsername) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-4 text-2xl font-semibold text-store-text">我的仪表盘</h1>
        <div className="flex h-32 items-center justify-center rounded-xl border border-store-border bg-store-panel">
          <p className="text-store-text-3">未在你的资料中找到 GitHub 用户名，请退出后重新登录。</p>
        </div>
      </main>
    )
  }

  const avatarUrl = user.image ?? undefined
  const email = user.email ?? ''
  const initial = (githubUsername || email || 'U').charAt(0).toUpperCase()

  // Fetch this publisher's submissions and plan via the API server, authenticated
  // with the Neon Auth JWT (the API resolves the publisher from the token). Pull
  // the JWT from the same-origin proxy's /token endpoint, forwarding our cookie.
  const h = await headers()
  const host = h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'http'
  let token: string | undefined
  try {
    const tokRes = await fetch(`${proto}://${host}/api/auth/token`, {
      headers: { cookie: h.get('cookie') ?? '' },
    })
    if (tokRes.ok) token = ((await tokRes.json()) as { token?: string }).token
  } catch {
    token = undefined
  }
  const client = new StoreClient(API_URL)
  const [itemsResult, entResult] = token
    ? await Promise.all([client.getMyItems(token), client.getMyEntitlements(token)])
    : [{ data: [] as Item[], error: null }, { data: null, error: null }]

  const items: Item[] = itemsResult.data ?? []
  const plan: Plan = entResult.data?.plan ?? 'free'
  const planMeta = PLAN_META[plan]

  const totalItems = items.length
  const totalDownloads = items.reduce((sum, it) => sum + it.downloads, 0)
  const pendingCount = items.filter((it) => it.status === 'pending').length
  const publishedCount = items.filter((it) => it.status === 'published').length

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Account + subscription header */}
      <section
        className="mb-6 flex flex-col gap-4 rounded-2xl border border-store-border p-5 sm:flex-row sm:items-center"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.028), transparent 42%), var(--panel)' }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={githubUsername}
            className="h-14 w-14 shrink-0 rounded-full border border-store-border object-cover"
          />
        ) : (
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[18px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #7c82ff, #b06ad9)' }}
          >
            {initial}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-mono text-[18px] font-bold tracking-tight text-store-text">
              {githubUsername}
            </h1>
            <span
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold"
              style={
                planMeta.premium
                  ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' }
                  : { background: 'var(--panel-2)', color: 'var(--text-2)', borderColor: 'var(--border-strong)' }
              }
            >
              {planMeta.label}
            </span>
          </div>
          {email && <p className="mt-0.5 truncate text-[12.5px] text-store-text-3">{email}</p>}
        </div>

        {plan === 'free' ? (
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <UpgradeProButton />
            <span className="text-[11px] text-store-text-3">解锁高级用量分析、智能路由与多密钥轮换</span>
          </div>
        ) : (
          <span className="text-[12px] font-medium text-store-green">Pro 权益已生效</span>
        )}
      </section>

      {/* Overview stat tiles */}
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="我的资源" value={String(totalItems)} hint="全部提交" />
        <StatTile label="总下载量" value={formatDownloads(totalDownloads)} hint="所有已发布资源" />
        <StatTile label="待审核" value={String(pendingCount)} hint="等待人工审核" />
        <StatTile label="已发布" value={String(publishedCount)} hint="正在商店展示" />
      </div>

      {/* My submissions */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-store-text-2">我的提交</h2>
        <Link
          href="/store?publish=1"
          className="rounded-lg bg-store-accent px-4 py-2 text-[12.5px] font-semibold text-white hover:brightness-110"
        >
          发布资源
        </Link>
      </div>

      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-store-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-store-border bg-store-panel">
                <th className="px-4 py-3 text-left font-medium text-store-text-2">名称</th>
                <th className="px-4 py-3 text-left font-medium text-store-text-2">类型</th>
                <th className="px-4 py-3 text-left font-medium text-store-text-2">版本</th>
                <th className="px-4 py-3 text-right font-medium text-store-text-2">下载量</th>
                <th className="px-4 py-3 text-right font-medium text-store-text-2">评分</th>
                <th className="px-4 py-3 text-left font-medium text-store-text-2">状态</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const cat = CATEGORY_META[item.category]
                const status = STATUS_META[item.status] ?? STATUS_META.pending
                return (
                  <tr key={item.id} className="border-b border-store-border bg-store-panel-2 last:border-0">
                    <td className="px-4 py-3 font-mono font-medium text-store-text">{item.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded-md px-2 py-[3px] text-[10.5px] font-bold"
                        style={{ background: cat.soft, color: cat.color }}
                      >
                        {cat.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-store-text-2">{item.version}</td>
                    <td className="px-4 py-3 text-right font-mono text-store-text-2">
                      ↓ {formatDownloads(item.downloads)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-store-text-2">
                      {item.rating > 0 ? <span className="text-store-star">★ {item.rating.toFixed(1)}</span> : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: status.soft, color: status.color, borderColor: status.color }}
                      >
                        {status.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-store-border-strong bg-store-panel px-6 py-14 text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-[22px]"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            +
          </div>
          <p className="text-[14px] font-medium text-store-text">还没有任何提交</p>
          <p className="max-w-sm text-[12.5px] text-store-text-3">
            发布你的第一个供应商、技能或 MCP，让社区在 Agent Store 中发现并安装它。
          </p>
          <Link
            href="/store?publish=1"
            className="mt-1 rounded-lg bg-store-accent px-4 py-2 text-[12.5px] font-semibold text-white hover:brightness-110"
          >
            发布第一个资源
          </Link>
        </div>
      )}
    </main>
  )
}
