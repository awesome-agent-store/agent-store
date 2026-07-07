import Link from 'next/link'
import { getFeaturedItems } from '@/lib/catalog'
import { CATEGORY_META, CategoryGlyph } from '@/lib/item-meta'

const RELEASES_URL = 'https://github.com/phenix3443/agent-store/releases'
// The repo is public, so GitHub Releases serve the installers for free (built by
// .github/workflows/release.yml on tag push). Until direct asset URLs are wired,
// the buttons fall back to the latest release page. Optionally override with a CDN
// URL (e.g. Cloudflare R2) via these env vars on Vercel.
const DOWNLOAD_MAC_URL = process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL ?? `${RELEASES_URL}/latest`
const DOWNLOAD_WIN_URL = process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL ?? `${RELEASES_URL}/latest`

function Feature({
  color,
  soft,
  title,
  body,
  icon,
}: {
  color: string
  soft: string
  title: string
  body: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div
        className="flex h-[42px] w-[42px] items-center justify-center rounded-[11px]"
        style={{ background: soft, color }}
      >
        {icon}
      </div>
      <div className="mt-4 text-[17px] font-bold text-white">{title}</div>
      <div className="mt-2 text-[13.5px] leading-relaxed text-[#a9a9bd]">{body}</div>
    </div>
  )
}

export default async function LandingPage() {
  const featured = await getFeaturedItems()
  const teaser = featured.slice(0, 3)

  return (
    <div
      className="relative overflow-hidden"
      style={{ background: 'radial-gradient(150% 100% at 50% -12%, #191430 0%, #0c0b13 48%, #08070c 100%)' }}
    >
      {/* ambient light */}
      <div
        className="pointer-events-none absolute -top-[120px] left-1/2 h-[560px] w-[1000px] -translate-x-1/2 blur-[24px]"
        style={{ background: 'radial-gradient(closest-side, rgba(124,130,255,0.32), transparent 72%)' }}
      />

      {/* hero */}
      <div className="relative mx-auto flex max-w-[840px] flex-col items-center px-8 pb-10 pt-[104px] text-center">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[rgba(124,130,255,0.35)] bg-[rgba(124,130,255,0.10)] px-3.5 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-store-accent" />
          <span className="text-xs font-semibold text-[#c9ccff]">面向 Claude Code、Codex 等 AI Agent 的资源中心</span>
        </div>
        <h1 className="text-[clamp(40px,8vw,74px)] font-extrabold leading-[1.02] tracking-[-0.035em] text-white">
          一个入口，
          <br />
          装齐所有 Agent 能力
        </h1>
        <p className="mt-6 max-w-[540px] text-lg leading-relaxed text-[#a9a9bd]">
          发现并一键安装技能、MCP 与模型供应商。本地代理统一转发、自动降级，全部收进一个可扩展的客户端。
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href={DOWNLOAD_MAC_URL}
            className="flex h-[50px] items-center gap-2.5 rounded-[13px] bg-white px-6 shadow-[0_8px_30px_rgba(255,255,255,0.12)] hover:brightness-95"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="#111" aria-hidden>
              <path d="M11 1.5c.1.9-.25 1.75-.8 2.35-.55.6-1.4 1.05-2.2.99-.11-.86.3-1.75.82-2.3.57-.63 1.5-1.06 2.18-1.04zM13.4 11.6c-.35.82-.52 1.18-.97 1.9-.63 1-1.52 2.25-2.62 2.26-.98 0-1.23-.64-2.56-.63-1.33 0-1.6.64-2.58.64-1.1 0-1.94-1.12-2.57-2.13C.34 11.2.16 8 1.24 6.36c.76-1.17 1.96-1.85 3.09-1.85 1.15 0 1.87.63 2.82.63.92 0 1.48-.63 2.81-.63 1 0 2.07.55 2.83 1.5-2.49 1.36-2.08 4.92.61 5.19z" />
            </svg>
            <span className="text-[15px] font-semibold text-[#111]">下载 for Mac</span>
          </a>
          <a
            href={DOWNLOAD_WIN_URL}
            className="flex h-[50px] items-center gap-2.5 rounded-[13px] border border-white/[0.16] bg-white/[0.05] px-6 hover:border-white/40 hover:bg-white/[0.09]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="#e7e7ee" aria-hidden>
              <path d="M1 3.2l6-.85V7.5H1V3.2zM7 2.25L15 1.1V7.5H7V2.25zM1 8.5h6v4.15l-6-.85V8.5zM7 8.5h8v6.4L7 13.75V8.5z" />
            </svg>
            <span className="text-[15px] font-semibold text-[#e7e7ee]">下载 for Windows</span>
          </a>
        </div>
      </div>

      {/* product visual: command palette mock */}
      <div className="relative mx-auto max-w-[680px] px-8 pb-24 pt-2">
        <div
          className="overflow-hidden rounded-[18px] border border-white/[0.12] backdrop-blur-[12px]"
          style={{
            background: 'rgba(16,16,21,0.86)',
            boxShadow: '0 50px 130px rgba(96,70,200,0.30), 0 12px 40px rgba(0,0,0,0.55)',
          }}
        >
          <div className="flex items-center gap-3 border-b border-white/[0.07] px-[18px] py-4">
            <svg width="18" height="18" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="6" cy="6" r="4.3" stroke="#6b6b78" strokeWidth="1.4" />
              <path d="M9.2 9.2l3 3" stroke="#6b6b78" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="flex-1 text-left text-[15px] text-[#8a8a98]">搜索 技能、MCP、供应商…</span>
            <span className="rounded-md bg-white/[0.06] px-2 py-[3px] font-mono text-[11px] text-[#6b6b78]">⌘K</span>
          </div>
          <div className="p-2">
            <div className="px-3 pb-1.5 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-[#5f5f6c]">推荐</div>
            <div className="flex items-center gap-3 rounded-[10px] bg-[rgba(124,130,255,0.14)] px-3 py-2.5">
              <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[rgba(88,166,240,0.18)] text-[#58a6f0]">
                <CategoryGlyph category="provider" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-mono text-[13.5px] font-bold text-[#f0f0f4]">local</div>
                <div className="text-[11px] text-[#8a8a98]">内置本地代理 · 按 Level 转发</div>
              </div>
              <span className="rounded-md bg-[rgba(88,166,240,0.16)] px-2 py-[3px] text-[9.5px] font-bold text-[#58a6f0]">供应商</span>
              <span className="font-mono text-[11px] text-[#6b6b78]">↵ 安装</span>
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[rgba(58,210,159,0.16)] text-[#3ad29f]">
                <CategoryGlyph category="skill" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-mono text-[13.5px] font-bold text-[#f0f0f4]">superpowers</div>
                <div className="text-[11px] text-[#8a8a98]">一组高频编码技能合集</div>
              </div>
              <span className="rounded-md bg-[rgba(58,210,159,0.16)] px-2 py-[3px] text-[9.5px] font-bold text-[#3ad29f]">技能</span>
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[rgba(240,179,74,0.16)] text-[#f0b34a]">
                <CategoryGlyph category="mcp" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-mono text-[13.5px] font-bold text-[#f0f0f4]">filesystem</div>
                <div className="text-[11px] text-[#8a8a98]">读写本地文件系统的 MCP 服务器</div>
              </div>
              <span className="rounded-md bg-[rgba(240,179,74,0.16)] px-2 py-[3px] text-[9.5px] font-bold text-[#f0b34a]">MCP</span>
            </div>
          </div>
          <div className="flex items-center gap-4 border-t border-white/[0.07] px-4 py-2.5 font-mono text-[11px] text-[#6b6b78]">
            <span>↑↓ 选择</span>
            <span>↵ 安装</span>
            <span className="ml-auto">agent-store</span>
          </div>
        </div>
      </div>

      {/* features */}
      <div className="relative mx-auto max-w-[1000px] px-8 pb-5 pt-10">
        <div className="mb-10 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-store-accent">为什么选择 Agent Store</div>
          <div className="mt-3 text-[34px] font-bold tracking-tight text-white">把碎片化的配置，收进一个客户端</div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Feature
            color="#58a6f0"
            soft="rgba(88,166,240,0.16)"
            title="统一转发，自动降级"
            body="内置本地代理把 Claude Code / Codex 的请求按 Level 顺序转发到上游供应商，遇错自动切换下一家，无需手动改配置。"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 8.5h13l-3.2-3.2" />
                <path d="M20 15.5H7l3.2 3.2" />
              </svg>
            }
          />
          <Feature
            color="#3ad29f"
            soft="rgba(58,210,159,0.16)"
            title="一键安装，跨端同步"
            body="技能、MCP、供应商在商店里点一下即装，登录后跨设备同步已安装的资源，随时可更新。"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2.6c.55 4.9 2.9 7.25 7.8 7.8-4.9.55-7.25 2.9-7.8 7.8-.55-4.9-2.9-7.25-7.8-7.8 4.9-.55 7.25-2.9 7.8-7.8Z" />
              </svg>
            }
          />
          <Feature
            color="#f0b34a"
            soft="rgba(240,179,74,0.16)"
            title="用量与成本尽在掌握"
            body="每次请求记录 token、费用、状态码与是否降级，汇总成消耗趋势与统计，成本一目了然。"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" />
              </svg>
            }
          />
        </div>
      </div>

      {/* store teaser */}
      <div className="relative mx-auto max-w-[1000px] px-8 pb-5 pt-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-store-accent">商店</div>
            <div className="mt-2.5 text-3xl font-bold tracking-tight text-white">热门资源，即刻上手</div>
          </div>
          <Link href="/store" className="group flex shrink-0 items-center gap-1.5 pb-1.5 text-store-accent">
            <span className="text-sm font-semibold">浏览全部</span>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {teaser.map((item) => {
            const cat = CATEGORY_META[item.category]
            return (
              <Link
                key={item.id}
                href={`/store/${item.category}/${item.slug}`}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition-[transform,border-color] duration-150 hover:-translate-y-[3px] hover:border-white/[0.22]"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-[19px]"
                    style={{ background: cat.soft, color: cat.color }}
                  >
                    <CategoryGlyph category={item.category} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm font-bold text-white">{item.name}</div>
                    <div className="text-[11px] text-[#8a8a98]">{item.publisher.name}</div>
                  </div>
                  <span className="rounded-md px-2 py-[3px] text-[9.5px] font-bold" style={{ background: cat.soft, color: cat.color }}>
                    {cat.label}
                  </span>
                </div>
                <div className="mt-3 line-clamp-2 h-[39px] text-[12.5px] leading-[1.55] text-[#a9a9bd]">{item.description}</div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* footer */}
      <div className="relative border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-[1000px] flex-wrap gap-10 px-8 py-11">
          <div className="min-w-[200px] flex-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-store-accent text-white">
                <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M9 2l5.5 3v8L9 16l-5.5-3V5z" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M9 2v14M3.5 5L9 8l5.5-3" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-sm font-bold text-white">Agent Store</span>
            </div>
            <div className="mt-3 text-xs leading-relaxed text-[#6b6b78]">
              AI Agent 的资源中心。
              <br />© 2026 Agent Store
            </div>
          </div>
          <div className="flex flex-wrap gap-14">
            <div className="flex flex-col gap-2.5">
              <div className="text-xs font-bold text-[#8a8a98]">产品</div>
              <Link href="/store" className="text-[13px] text-[#a9a9bd] hover:text-white">商店</Link>
              <Link href="/docs" className="text-[13px] text-[#a9a9bd] hover:text-white">文档</Link>
              <span className="cursor-pointer text-[13px] text-[#a9a9bd] hover:text-white">定价</span>
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="text-xs font-bold text-[#8a8a98]">资源</div>
              <Link href="/docs" className="text-[13px] text-[#a9a9bd] hover:text-white">开始使用</Link>
              <a href={RELEASES_URL} className="text-[13px] text-[#a9a9bd] hover:text-white">GitHub</a>
              <span className="cursor-pointer text-[13px] text-[#a9a9bd] hover:text-white">更新日志</span>
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="text-xs font-bold text-[#8a8a98]">公司</div>
              <span className="cursor-pointer text-[13px] text-[#a9a9bd] hover:text-white">关于</span>
              <span className="cursor-pointer text-[13px] text-[#a9a9bd] hover:text-white">博客</span>
              <span className="cursor-pointer text-[13px] text-[#a9a9bd] hover:text-white">联系</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
