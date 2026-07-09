import { ExternalLink } from 'lucide-react'
import type { SelectedDetail } from '../lib/useSelectedDetail'
import { TYPE_META } from '../lib/detailContent'
import { openExternal } from '../lib/openExternal'

const STORE_BASE = 'https://agent-store.panghuli.tech'

/** Real, openable links for a resource — only ones we actually have a URL for. */
function resourceLinks(detail: SelectedDetail): { label: string; url: string }[] {
  const links = [{ label: 'Store 页面', url: `${STORE_BASE}/store/${detail.category}/${detail.slug}` }]
  if (detail.category === 'skill' && 'contentUrl' in detail && detail.contentUrl) {
    links.push({ label: '源码 (SKILL.md)', url: detail.contentUrl })
  }
  return links
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2.5">
      <dt className="text-xs text-store-text-3">{label}</dt>
      <dd className={`max-w-[150px] truncate text-xs ${accent ? 'font-mono text-store-accent' : 'font-mono text-store-text'}`}>
        {value}
      </dd>
    </div>
  )
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h3 className="mb-3 border-b border-store-border pb-2 text-[14.5px] font-bold text-store-text">{children}</h3>
  )
}

function Pill({ children }: { children: string }) {
  return (
    <span className="rounded-md border border-store-border-strong px-2.5 py-1 text-[11px] font-medium text-store-text-2">
      {children}
    </span>
  )
}

function formatDate(value?: string): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

export function InfoSidebar({ detail }: { detail: SelectedDetail }) {
  const createdAt = 'createdAt' in detail ? detail.createdAt : undefined
  const categories = [TYPE_META[detail.category].label, ...detail.tags.slice(0, 3)]

  return (
    <aside className="flex w-[248px] shrink-0 flex-col gap-6 overflow-y-auto border-l border-store-border bg-store-sidebar p-4">
      <div>
        <SectionHeading>安装信息</SectionHeading>
        <dl>
          <Row label="标识" value={detail.slug} />
          <Row label="版本" value={`v${detail.version}`} />
          <Row label="更新时间" value={formatDate(detail.updatedAt)} />
        </dl>
      </div>

      <div>
        <SectionHeading>市场</SectionHeading>
        <dl>
          <Row label="发布" value={formatDate(createdAt)} />
          <Row label="最近发布" value={formatDate(detail.updatedAt)} />
        </dl>
      </div>

      <div>
        <SectionHeading>分类</SectionHeading>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((tag, i) => (
            <Pill key={`${tag}-${i}`}>{tag}</Pill>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading>资源</SectionHeading>
        <div className="flex flex-col gap-2.5">
          {resourceLinks(detail).map(({ label, url }) => (
            <button
              key={label}
              type="button"
              onClick={() => openExternal(url)}
              className="flex items-center gap-2 text-store-text-2 hover:text-store-accent"
            >
              <ExternalLink size={13} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
