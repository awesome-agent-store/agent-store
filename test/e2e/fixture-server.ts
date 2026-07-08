// A tiny stand-in for the Agent Store API, serving two deterministic test
// packages so the real `as install` path can be exercised offline in the e2e
// container. Point the CLI at it with AS_STORE_URL=http://127.0.0.1:<port>.
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const FIXTURES_DIR = process.env.FIXTURES_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const PORT = Number(process.env.FIXTURE_PORT ?? 4599)
const SELF = `http://127.0.0.1:${PORT}`

const publisher = {
  slug: 'agent-store-e2e',
  name: 'Agent Store E2E',
  tier: 'official' as const,
  avatarUrl: 'https://github.com/github.png',
  bio: null,
}

// The MCP server runs from the repo checkout inside the image.
const PROBE_MCP_CMD = `node ${join(FIXTURES_DIR, 'probe-mcp.mjs')}`

const ITEMS: Record<string, unknown> = {
  'e2e-probe-skill': {
    slug: 'e2e-probe-skill',
    name: 'E2E Probe Skill',
    description: 'Deterministic skill used by the e2e harness to prove skills install and load.',
    category: 'skill',
    version: '1.0.0',
    compatibleWith: ['claude', 'codex'],
    tags: ['skill', 'e2e'],
    downloads: 0,
    installHook: { steps: [{ type: 'file', url: `${SELF}/skill.md`, dest: 'skill.md' }] },
    metadata: { contentUrl: `${SELF}/skill.md` },
    publisher,
  },
  'e2e-probe-mcp': {
    slug: 'e2e-probe-mcp',
    name: 'E2E Probe MCP',
    description: 'Deterministic stdio MCP used by the e2e harness to prove MCP servers install and are callable.',
    category: 'mcp',
    version: '1.0.0',
    compatibleWith: ['claude', 'codex'],
    tags: ['mcp', 'e2e'],
    downloads: 0,
    installHook: { steps: [] },
    transport: 'stdio',
    serverCommand: PROBE_MCP_CMD,
    configSchema: {},
    metadata: {},
    publisher,
  },
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

Bun.serve({
  port: PORT,
  async fetch(req) {
    const { pathname } = new URL(req.url)

    if (pathname === '/skill.md') {
      return new Response(await Bun.file(join(FIXTURES_DIR, 'skill.md')).text(), {
        headers: { 'content-type': 'text/markdown' },
      })
    }
    if (pathname === '/api/items') return json({ items: Object.values(ITEMS) })

    const detail = pathname.match(/^\/api\/items\/([^/]+)$/)
    if (detail) {
      const item = ITEMS[decodeURIComponent(detail[1])]
      return item ? json({ item }) : json({ error: 'not found' }, 404)
    }

    const install = pathname.match(/^\/api\/items\/([^/]+)\/install$/)
    if (install && req.method === 'POST') return new Response(null, { status: 204 })

    return json({ error: 'not found' }, 404)
  },
})

console.log(`[fixture-server] serving e2e packages on ${SELF}`)
