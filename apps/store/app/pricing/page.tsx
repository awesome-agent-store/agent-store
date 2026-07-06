'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { StoreClient } from '@as/sdk'
import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001'

type Period = 'monthly' | 'yearly'

const FREE_FEATURES = ['浏览、搜索、安装全部资源', '基础用量统计', '本地代理（单 / 双上游 + 失败降级）']
const PRO_FEATURES = [
  'Free 的全部功能',
  '预算与超支告警',
  '高级用量分析 + 账单导出',
  '智能路由（即将）',
  '多 Key 轮换（即将）',
]
const LIFETIME_FEATURES = ['Pro 的全部本地功能', '一次付清、永久使用', '无订阅、无月费']

export default function PricingPage() {
  const [period, setPeriod] = useState<Period>('yearly')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upgrade(plan: 'monthly' | 'yearly' | 'lifetime') {
    if (busy) return
    setBusy(plan)
    setError(null)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const result = await new StoreClient(API_URL).createCheckout({ period: plan }, { token: session?.access_token })
      if (result.data?.checkoutUrl) window.open(result.data.checkoutUrl, '_blank', 'noopener,noreferrer')
      else setError(result.error ?? '发起支付失败')
    } catch {
      setError('发起支付失败')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-store-text">简单透明的定价</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-store-text-2">
          Pro 每月帮你省下的 API 花费，通常远超订阅费本身。先免费用，随时升级。
        </p>
      </div>

      {/* 月 / 年 切换 */}
      <div className="mt-8 flex items-center justify-center gap-1 rounded-full border border-store-border bg-store-panel p-1 text-sm mx-auto w-fit">
        {(['monthly', 'yearly'] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full px-4 py-1.5 font-medium ${period === p ? 'bg-store-accent text-white' : 'text-store-text-2'}`}
          >
            {p === 'monthly' ? '按月' : '按年（省 2 个月）'}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-center text-xs text-store-red">{error}</p>}

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {/* Free */}
        <Card title="Free" price="$0" sub="永久免费">
          <FeatureList items={FREE_FEATURES} />
          <a href="/store" className="mt-6 block rounded-lg border border-store-border-strong px-4 py-2.5 text-center text-sm font-semibold text-store-text hover:border-store-accent">
            免费开始
          </a>
        </Card>

        {/* Pro */}
        <Card title="Pro" price={period === 'monthly' ? '$7' : '$70'} sub={period === 'monthly' ? '/ 月' : '/ 年'} highlighted>
          <FeatureList items={PRO_FEATURES} />
          <button
            type="button"
            onClick={() => upgrade(period)}
            disabled={busy != null}
            className="mt-6 w-full rounded-lg bg-store-accent px-4 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy === period ? '发起中…' : '升级 Pro'}
          </button>
        </Card>

        {/* Lifetime */}
        <Card title="终身买断" price="$99" sub="一次性">
          <FeatureList items={LIFETIME_FEATURES} />
          <button
            type="button"
            onClick={() => upgrade('lifetime')}
            disabled={busy != null}
            className="mt-6 w-full rounded-lg border border-store-border-strong px-4 py-2.5 text-center text-sm font-semibold text-store-text hover:border-store-accent disabled:opacity-50"
          >
            {busy === 'lifetime' ? '发起中…' : '买断'}
          </button>
        </Card>
      </div>

      <p className="mt-8 text-center text-xs text-store-text-3">
        由 Waffo（Merchant of Record）代收，价格含税。终身买断覆盖全部本地 Pro 功能。
      </p>
    </main>
  )
}

function Card({ title, price, sub, highlighted, children }: { title: string; price: string; sub: string; highlighted?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col rounded-2xl border bg-store-panel p-6 ${highlighted ? 'border-store-accent' : 'border-store-border'}`}>
      <div className="text-sm font-semibold text-store-text-2">{title}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-bold text-store-text">{price}</span>
        <span className="text-sm text-store-text-3">{sub}</span>
      </div>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </div>
  )
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2 text-[13px] text-store-text-2">
          <Check size={15} className="mt-0.5 shrink-0 text-store-accent" />
          <span>{f}</span>
        </li>
      ))}
    </ul>
  )
}
