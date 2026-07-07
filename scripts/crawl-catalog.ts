// scripts/crawl-catalog.ts
//
// Catalog crawler (small-scale validation). Scrapes the CURRENTLY POPULAR, REAL
// provider / skill / mcp entries from public web sources and regenerates
// supabase/seed.sql. No fake / mock / example.com data — the only deterministic
// placeholder allowed is a DiceBear icon URL.
//
// Sources (verified reachable):
//   - MCP      → PulseMCP  https://api.pulsemcp.com/v0beta/servers   (rank by github_stars, npm-installable only)
//   - Provider → OpenRouter https://openrouter.ai/api/v1/providers
//   - Skill    → GitHub Search (unauthenticated) https://api.github.com/search/repositories?q=claude+skill
//
// Output: writes the full supabase/seed.sql = header + publishers + the 3 fixed
// TEST providers (local / yls / skyapi, real configs, tagged 'test') + all
// crawled items, ordered by (category, downloads desc).
//
// Run: bun scripts/crawl-catalog.ts   (or: bun run crawl:catalog)

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── The single knob: bump to 50 for the full-scale pass ───────────────────────
const PER_CATEGORY_LIMIT = 10

// Well-known publisher slugs that map to the 'official' tier.
const OFFICIAL_PUBLISHERS = new Set([
  'anthropic',
  'anthropics',
  'openai',
  'google',
  'googleapis',
  'openrouter',
  'modelcontextprotocol',
])

// ── Normalized row shapes ─────────────────────────────────────────────────────
interface CrawledPublisher {
  slug: string
  name: string
  avatarUrl: string
  tier: 'official' | 'verified' | 'community'
  bio: string | null
}

interface CrawledItem {
  slug: string
  name: string
  description: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  publisherSlug: string
  compatibleWith: string[]
  tags: string[]
  downloads: number
  installHook: Record<string, unknown>
  metadata: Record<string, unknown>
}

// ── Small utilities ───────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function sanitizeSlug(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item'
  )
}

/** Ensure slug uniqueness across the whole catalog by suffixing collisions. */
function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base
  let n = 2
  while (taken.has(slug)) slug = `${base}-${n++}`
  taken.add(slug)
  return slug
}

function githubOwnerFrom(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/github\.com\/([^/]+)\/[^/]+/i)
  return m ? m[1] : null
}

function tierFor(slug: string): 'official' | 'community' {
  return OFFICIAL_PUBLISHERS.has(slug) ? 'official' : 'community'
}

async function fetchJson<T>(
  url: string,
  { retries = 3, retryDelayMs = 400, headers = {} }: { retries?: number; retryDelayMs?: number; headers?: Record<string, string> } = {}
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'agent-store-crawler', ...headers } })
      const body = await res.json()
      // PulseMCP v0beta returns HTTP 200 with an { error: { code: 'API_SUNSET' } }
      // body when it randomly fails a request as part of its sunset process.
      if (body && typeof body === 'object' && 'error' in body && (body as { error: unknown }).error) {
        throw new Error(`API error from ${url}: ${JSON.stringify((body as { error: unknown }).error)}`)
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
      return body as T
    } catch (err) {
      lastErr = err
      if (attempt < retries) await sleep(retryDelayMs)
    }
  }
  throw lastErr
}

/** Run async tasks with a bounded concurrency pool. */
async function pool<I, O>(items: I[], limit: number, fn: (item: I) => Promise<O>): Promise<O[]> {
  const out: O[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

// ── MCP: PulseMCP ─────────────────────────────────────────────────────────────
interface PulseServer {
  name: string
  url: string
  external_url: string | null
  short_description: string | null
  source_code_url: string | null
  github_stars: number | null
  package_registry: string | null
  package_name: string | null
  package_download_count: number | null
  EXPERIMENTAL_ai_generated_description?: string | null
}
interface PulsePage {
  servers: PulseServer[]
  total_count: number
  next: string | null
}

async function crawlMcp(publishers: Map<string, CrawledPublisher>, taken: Set<string>): Promise<CrawledItem[]> {
  const COUNT_PER_PAGE = 100
  const base = 'https://api.pulsemcp.com/v0beta/servers'
  // v0beta is in its sunset window (~50% of requests randomly rejected as of
  // mid-2026), so every page gets generous retries.
  const pageOpts = { retries: 14, retryDelayMs: 350 }

  const first = await fetchJson<PulsePage>(`${base}?count_per_page=${COUNT_PER_PAGE}`, pageOpts)
  const total = first.total_count
  const offsets: number[] = []
  for (let off = COUNT_PER_PAGE; off < total; off += COUNT_PER_PAGE) offsets.push(off)

  const collected: PulseServer[] = [...first.servers]
  const pages = await pool(offsets, 6, async (off) => {
    try {
      const p = await fetchJson<PulsePage>(`${base}?count_per_page=${COUNT_PER_PAGE}&offset=${off}`, pageOpts)
      return p.servers
    } catch (err) {
      console.warn(`  [mcp] page offset=${off} failed after retries: ${(err as Error).message}`)
      return [] as PulseServer[]
    }
  })
  for (const s of pages) collected.push(...s)
  console.log(`  [mcp] fetched ${collected.length}/${total} servers from PulseMCP`)

  // Prefer genuinely installable entries: npm package with a package name.
  const installable = collected.filter((s) => s.package_registry === 'npm' && s.package_name)
  installable.sort((a, b) => (b.github_stars ?? -1) - (a.github_stars ?? -1) || (b.package_download_count ?? 0) - (a.package_download_count ?? 0))

  const rows: CrawledItem[] = []
  for (const s of installable) {
    if (rows.length >= PER_CATEGORY_LIMIT) break
    const owner = githubOwnerFrom(s.source_code_url)
    const pubSlug = owner ? sanitizeSlug(owner) : 'community'
    if (!publishers.has(pubSlug)) {
      publishers.set(pubSlug, {
        slug: pubSlug,
        name: owner ?? 'Community',
        avatarUrl: owner ? `https://github.com/${owner}.png` : `https://api.dicebear.com/9.x/shapes/svg?seed=${pubSlug}`,
        tier: tierFor(pubSlug),
        bio: null,
      })
    }
    const slug = uniqueSlug(sanitizeSlug(s.package_name || s.name), taken)
    rows.push({
      slug,
      name: s.name,
      description: s.short_description || s.EXPERIMENTAL_ai_generated_description || s.name,
      category: 'mcp',
      version: '1.0.0',
      publisherSlug: pubSlug,
      compatibleWith: ['claude', 'codex'],
      tags: ['mcp', s.package_registry].filter(Boolean) as string[],
      downloads: s.package_download_count ?? s.github_stars ?? 0,
      installHook: { steps: [] },
      metadata: { transport: 'stdio', serverCommand: `npx -y ${s.package_name}`, configSchema: {} },
    })
  }
  return rows
}

// ── Provider: OpenRouter ──────────────────────────────────────────────────────
interface ORProvider {
  name: string
  slug: string
  privacy_policy_url: string | null
  terms_of_service_url: string | null
  status_page_url: string | null
  headquarters: string | null
}

async function crawlProviders(publishers: Map<string, CrawledPublisher>, taken: Set<string>): Promise<CrawledItem[]> {
  const { data } = await fetchJson<{ data: ORProvider[] }>('https://openrouter.ai/api/v1/providers', { retries: 3 })
  console.log(`  [provider] fetched ${data.length} providers from OpenRouter`)

  const rows: CrawledItem[] = []
  for (const p of data) {
    if (rows.length >= PER_CATEGORY_LIMIT) break
    const pubSlug = sanitizeSlug(p.slug)
    if (!publishers.has(pubSlug)) {
      publishers.set(pubSlug, {
        slug: pubSlug,
        name: p.name,
        avatarUrl: `https://api.dicebear.com/9.x/shapes/svg?seed=${pubSlug}`,
        tier: tierFor(pubSlug),
        bio: null,
      })
    }
    const slug = uniqueSlug(sanitizeSlug(`${p.slug}-provider`), taken)
    const hq = p.headquarters ? `（总部 ${p.headquarters}）` : ''
    rows.push({
      slug,
      name: p.name,
      description: `${p.name}：OpenRouter 上的真实推理服务供应商${hq}。`,
      category: 'provider',
      version: '1.0.0',
      publisherSlug: pubSlug,
      compatibleWith: ['claude', 'codex'],
      tags: ['provider', p.headquarters?.toLowerCase()].filter(Boolean) as string[],
      downloads: 0,
      installHook: { steps: [] },
      metadata: { configSchema: {}, supportedModels: [] },
    })
  }
  return rows
}

// ── Skill: GitHub Search (unauthenticated) ────────────────────────────────────
interface GHRepo {
  name: string
  full_name: string
  html_url: string
  description: string | null
  stargazers_count: number
  topics?: string[]
  default_branch?: string
  owner: { login: string; avatar_url: string }
}

interface GHTree {
  tree: Array<{ path: string; type: string }>
  truncated: boolean
}

// A single SKILL.md discovered inside a repo (a repo may hold many).
interface SkillCandidate {
  owner: string
  repo: string
  branch: string
  path: string
  dir: string
  rawUrl: string
  ownerAvatar: string
  stars: number
}

// Parse the leading YAML frontmatter of a SKILL.md for its name / description.
function parseSkillFrontmatter(md: string): { name?: string; description?: string } {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!m) return {}
  const block = m[1]
  const strip = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, '')
  return {
    name: strip(block.match(/^name:\s*(.+)$/m)?.[1]),
    description: strip(block.match(/^description:\s*(.+)$/m)?.[1]),
  }
}

// Genuinely real Claude-skill repos, used only if GitHub is rate-limited.
const SKILL_FALLBACK = ['anthropics/skills', 'obra/superpowers']

async function crawlSkills(publishers: Map<string, CrawledPublisher>, taken: Set<string>): Promise<CrawledItem[]> {
  let repos: GHRepo[] = []
  let usedFallback = false
  const url = 'https://api.github.com/search/repositories?q=claude+skill&sort=stars&order=desc&per_page=15'
  const headers = { Accept: 'application/vnd.github+json' }
  try {
    const res = await fetchJson<{ items: GHRepo[] }>(url, { retries: 0, headers })
    repos = res.items
  } catch (err) {
    console.warn(`  [skill] GitHub search failed (${(err as Error).message}); retrying once after 3s`)
    await sleep(3000)
    try {
      const res = await fetchJson<{ items: GHRepo[] }>(url, { retries: 0, headers })
      repos = res.items
    } catch (err2) {
      console.warn(`  [skill] GitHub still failing (${(err2 as Error).message}); using hardcoded real-repo fallback`)
      usedFallback = true
      repos = await pool(SKILL_FALLBACK, 2, async (fullName) =>
        fetchJson<GHRepo>(`https://api.github.com/repos/${fullName}`, { retries: 2, headers })
      )
    }
  }

  const filtered = usedFallback ? repos : repos.filter((r) => r.description && r.description.trim())
  console.log(`  [skill] scanning ${filtered.length} repos from GitHub${usedFallback ? ' (fallback)' : ''}`)

  // Walk each repo's tree (1 API call per repo) and collect every SKILL.md — a repo
  // may be a single skill or a collection of many. Stop once we have enough.
  const candidates: SkillCandidate[] = []
  for (const r of filtered) {
    if (candidates.length >= PER_CATEGORY_LIMIT) break
    const [owner, repo] = r.full_name.split('/')
    const branch = r.default_branch || 'main'
    let tree: GHTree
    try {
      tree = await fetchJson<GHTree>(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        { retries: 1, headers }
      )
    } catch (err) {
      console.warn(`  [skill] tree for ${r.full_name} failed: ${(err as Error).message}`)
      continue
    }
    for (const entry of tree.tree) {
      if (entry.type !== 'blob') continue
      if (entry.path !== 'SKILL.md' && !entry.path.endsWith('/SKILL.md')) continue
      const dir = entry.path === 'SKILL.md' ? repo : entry.path.slice(0, -'/SKILL.md'.length).split('/').pop()!
      candidates.push({
        owner,
        repo,
        branch,
        path: entry.path,
        dir,
        rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${entry.path}`,
        ownerAvatar: r.owner.avatar_url,
        stars: r.stargazers_count,
      })
    }
  }
  console.log(`  [skill] found ${candidates.length} SKILL.md files`)

  // For each chosen skill, fetch its raw SKILL.md (not rate-limited) for real
  // name/description from frontmatter, and emit a file install step that fetches it.
  const rows: CrawledItem[] = []
  for (const c of candidates.slice(0, PER_CATEGORY_LIMIT)) {
    const pubSlug = sanitizeSlug(c.owner)
    if (!publishers.has(pubSlug)) {
      publishers.set(pubSlug, { slug: pubSlug, name: c.owner, avatarUrl: c.ownerAvatar, tier: tierFor(pubSlug), bio: null })
    }
    let name = c.dir
    let description = `来自 ${c.owner}/${c.repo} 的 skill。`
    try {
      const md = await (await fetch(c.rawUrl, { headers: { 'user-agent': 'agent-store-crawler' } })).text()
      const fm = parseSkillFrontmatter(md)
      if (fm.name) name = fm.name
      if (fm.description) description = fm.description.slice(0, 300)
    } catch { /* keep dir-derived defaults */ }
    const slug = uniqueSlug(sanitizeSlug(c.dir === c.repo ? c.repo : `${c.repo}-${c.dir}`), taken)
    rows.push({
      slug,
      name,
      description,
      category: 'skill',
      version: '1.0.0',
      publisherSlug: pubSlug,
      compatibleWith: ['claude'],
      tags: ['skill'],
      downloads: c.stars,
      installHook: { steps: [{ type: 'file', url: c.rawUrl, dest: 'skill.md' }] },
      metadata: { contentUrl: c.rawUrl, source: { repo: `${c.owner}/${c.repo}`, ref: c.branch, path: c.path } },
    })
  }
  return rows
}

// ── SQL generation ────────────────────────────────────────────────────────────
function sqlText(s: string | null): string {
  if (s === null) return 'NULL'
  return `'${s.replace(/'/g, "''")}'`
}
function sqlArray(arr: string[]): string {
  if (arr.length === 0) return `'{}'`
  return `ARRAY[${arr.map((v) => sqlText(v)).join(',')}]`
}
function sqlJson(obj: Record<string, unknown>): string {
  return `${sqlText(JSON.stringify(obj))}::jsonb`
}

function publisherInsert(pubs: CrawledPublisher[]): string {
  const values = pubs
    .map((p) => `  (${sqlText(p.slug)}, ${sqlText(p.name)}, ${sqlText(p.avatarUrl)}, ${sqlText(p.tier)}, ${sqlText(p.bio)})`)
    .join(',\n')
  return `INSERT INTO publishers (slug, name, avatar_url, tier, bio) VALUES\n${values};`
}

function itemInsert(it: CrawledItem): string {
  return `INSERT INTO items (
  slug, name, description,
  category, version, publisher_id,
  compatible_with, tags, downloads, rating, status,
  install_hook, metadata
) VALUES (
  ${sqlText(it.slug)}, ${sqlText(it.name)}, ${sqlText(it.description)},
  ${sqlText(it.category)}, ${sqlText(it.version)}, (SELECT id FROM publishers WHERE slug = ${sqlText(it.publisherSlug)}),
  ${sqlArray(it.compatibleWith)}, ${sqlArray(it.tags)}, ${it.downloads}, 0, 'published',
  ${sqlJson(it.installHook)}, ${sqlJson(it.metadata)}
);`
}

// The 3 TEST providers (local / yls / skyapi) with their REAL configs, copied
// verbatim from the original seed.sql and tagged 'test' so they're identifiable.
// ALWAYS emitted — the user has live yls/skyapi subscriptions used for installs.
const TEST_PUBLISHERS: CrawledPublisher[] = [
  { slug: 'agent-store', name: 'Agent Store', avatarUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=agent-store', tier: 'official', bio: 'Agent Store 官方内置组件。' },
  { slug: 'yls-me', name: 'YLS.me', avatarUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=yls', tier: 'verified', bio: '已验证的第三方模型中转服务。' },
  { slug: 'skyapi', name: 'SkyAPI', avatarUrl: 'https://api.dicebear.com/9.x/shapes/svg?seed=skyapi', tier: 'community', bio: '稳定线路、免翻墙接入 Claude Code 的第三方中转服务。' },
]

const TEST_PROVIDERS_SQL = `-- Provider: local (built-in relay) — the endpoint Claude/Codex point at; forwards
-- to upstream providers by level. No upstream API key. Rendered specially in the
-- CLI client (LOCAL_PROVIDER_SENTINEL __local__); this catalog row is its store listing.
INSERT INTO items (
  slug, name, description,
  category, version, publisher_id,
  compatible_with, tags, downloads, rating, status,
  install_hook, metadata
) VALUES (
  'local',
  '本地中转',
  '内置本地中转：将 Claude Code / Codex 的 baseURL 指向本机监听端口，请求按 Level 优先级转发到已配置的上游供应商，失败自动降级。无需 API 密钥。',
  'provider', '1.0.0',
  (SELECT id FROM publishers WHERE slug = 'agent-store'),
  ARRAY['claude','codex'], ARRAY['relay','local','内置','test'], 0, 5.0, 'published',
  $\${"steps":[]}$$,
  $\${"configSchema":{},"supportedModels":[]}$$
);

-- Provider: yls (伊莉思 Code) — real China relay for Codex CLI. Pre-fills the codex
-- endpoint connection on install; user supplies the Bearer API key.
INSERT INTO items (
  slug, name, description,
  category, version, publisher_id,
  compatible_with, tags, downloads, rating, status,
  install_hook, metadata
) VALUES (
  'yls',
  'YLS Code 中转',
  '伊莉思 Code 中转服务，国内直连免翻墙接入 Codex CLI（GPT-5 Code）与 Claude Code；此预设接入其 Codex 端点，按订阅计费。',
  'provider', '1.0.0',
  (SELECT id FROM publishers WHERE slug = 'yls-me'),
  ARRAY['codex'], ARRAY['relay','codex','国产中转','test'], 32000, 4.7, 'published',
  $\${"steps":[{"type":"config","patch":{"apiKey":"","baseUrl":"https://code.ylsagi.com/codex","authType":"bearer","upstreamProtocol":"auto","level":1}}]}$$,
  $\${"configSchema":{"type":"object","required":["apiKey"],"properties":{"apiKey":{"type":"string","description":"API 密钥 (Bearer)"},"baseUrl":{"type":"string","description":"API 地址","default":"https://code.ylsagi.com/codex"},"authType":{"type":"string","default":"bearer"},"upstreamProtocol":{"type":"string","default":"auto"},"level":{"type":"number","default":1}}},"supportedModels":["gpt-5-codex","gpt-5"]}$$
);

-- Provider: skyapi — real China relay for Claude Code (Anthropic protocol). Pre-fills
-- the claude endpoint connection on install; user supplies the x-api-key.
INSERT INTO items (
  slug, name, description,
  category, version, publisher_id,
  compatible_with, tags, downloads, rating, status,
  install_hook, metadata
) VALUES (
  'skyapi',
  'SkyAPI 中转',
  'SkyAPI 中转服务，稳定线路免翻墙接入 Claude Code，兼容 Cursor / Cline / Windsurf 等客户端。',
  'provider', '1.0.0',
  (SELECT id FROM publishers WHERE slug = 'skyapi'),
  ARRAY['claude'], ARRAY['relay','claude','国产中转','test'], 21000, 4.5, 'published',
  $\${"steps":[{"type":"config","patch":{"apiKey":"","baseUrl":"http://150.158.2.79:8888","authType":"anthropic","upstreamProtocol":"auto","level":1}}]}$$,
  $\${"configSchema":{"type":"object","required":["apiKey"],"properties":{"apiKey":{"type":"string","description":"API 密钥 (x-api-key)"},"baseUrl":{"type":"string","description":"API 地址","default":"http://150.158.2.79:8888"},"authType":{"type":"string","default":"anthropic"},"upstreamProtocol":{"type":"string","default":"auto"},"level":{"type":"number","default":1}}},"supportedModels":["claude-opus-4-8","claude-sonnet-5","claude-haiku-4-5-20251001","claude-opus-4-5"]}$$
);`

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Crawling catalog (PER_CATEGORY_LIMIT=${PER_CATEGORY_LIMIT})...`)

  const publishers = new Map<string, CrawledPublisher>()
  // Reserve the test slugs so crawled entries never collide with them.
  const takenSlugs = new Set<string>(['local', 'yls', 'skyapi'])
  const takenPublishers = new Set<string>(TEST_PUBLISHERS.map((p) => p.slug))

  // Each adapter is independently guarded: one source failing must not abort the run.
  const guard = async (label: string, fn: () => Promise<CrawledItem[]>): Promise<CrawledItem[]> => {
    try {
      return await fn()
    } catch (err) {
      console.warn(`  [${label}] adapter failed entirely: ${(err as Error).message}`)
      return []
    }
  }

  const [mcp, providers, skills] = await Promise.all([
    guard('mcp', () => crawlMcp(publishers, takenSlugs)),
    guard('provider', () => crawlProviders(publishers, takenSlugs)),
    guard('skill', () => crawlSkills(publishers, takenSlugs)),
  ])

  const items = [...mcp, ...providers, ...skills]
  // Deterministic ordering: category asc, then downloads desc.
  items.sort((a, b) => a.category.localeCompare(b.category) || b.downloads - a.downloads)

  // Crawled publishers, excluding any that collide with the fixed test publishers.
  const crawledPublishers = [...publishers.values()]
    .filter((p) => !takenPublishers.has(p.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug))

  const header = `-- supabase/seed.sql
-- GENERATED by scripts/crawl-catalog.ts — DO NOT EDIT BY HAND.
-- Regenerate with: bun run crawl:catalog
--
-- Point-in-time snapshot (${new Date().toISOString()}) of the currently popular,
-- REAL provider / skill / mcp entries crawled from public sources:
--   provider → OpenRouter, skill → GitHub, mcp → PulseMCP.
-- Plus the 3 fixed TEST providers (local / yls / skyapi, tagged 'test').
-- Counts: mcp=${mcp.length}, provider=${providers.length}, skill=${skills.length} (+3 test providers).
`

  const parts: string[] = [
    header,
    '-- ── Publishers (test publishers + crawled) ──────────────────────────────────',
    publisherInsert([...TEST_PUBLISHERS, ...crawledPublishers]),
    '',
    '-- ── TEST providers (always present, real configs) ───────────────────────────',
    TEST_PROVIDERS_SQL,
    '',
    '-- ── Crawled items (real, popularity-ranked) ─────────────────────────────────',
    ...items.map(itemInsert),
    '',
  ]

  const seedPath = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'supabase', 'seed.sql')
  writeFileSync(seedPath, parts.join('\n') + '\n')

  console.log('')
  console.log(`Wrote ${seedPath}`)
  console.log(`  publishers: ${TEST_PUBLISHERS.length} test + ${crawledPublishers.length} crawled`)
  console.log(`  items: mcp=${mcp.length}, provider=${providers.length}, skill=${skills.length}, +3 test providers`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
