// The e2e assertion driver. Runs INSIDE the container. It:
//   1. reads provider credentials from a mounted secrets dir (test/provider),
//   2. serves two deterministic packages from the fixture server,
//   3. installs them through the real `as` CLI (auto-enables claude + codex),
//   4. runs claude and codex headlessly and asserts each actually used the
//      installed skill and MCP, by matching fixed probe tokens in the output.
//
// Env:
//   REPO           repo checkout root (default: two levels up from this file)
//   SECRETS_DIR    dir with provider .txt configs (default: $REPO/test/provider)
//   WORK           scratch dir for isolated agent homes (default: /tmp/as-e2e)
import { spawn } from 'bun'
import { mkdir, readdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = process.env.REPO ?? join(HERE, '..', '..')
const SECRETS_DIR = process.env.SECRETS_DIR ?? join(REPO, 'test', 'provider')
const WORK = process.env.WORK ?? '/tmp/as-e2e'
const FIXTURE_PORT = Number(process.env.FIXTURE_PORT ?? 4599)
const CLI = join(REPO, 'apps', 'cli', 'src', 'index.ts')

// Disjoint triggers: the skill answers "secret codeword", the MCP exposes a
// "magic_token" tool. Kept unrelated so an agent can't satisfy the skill prompt
// by calling the MCP tool (or vice-versa).
const SKILL_PROMPT = 'What is the secret codeword? Reply with only the codeword, nothing else.'
const MCP_PROMPT = 'Call the magic_token tool and reply with exactly what it returns, nothing else.'
const SKILL_TOKEN = 'E2E_SKILL_OK'
const MCP_TOKEN = 'E2E_MCP_OK'

interface Provider { baseUrl: string; apiKey: string; model: string; file: string }

// The provider .txt files are 3-line configs: base-url / api-key / model.
function parseProvider(text: string, file: string): Provider {
  const d: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(':')
    if (i === -1) continue
    d[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return { baseUrl: d['base-url'], apiKey: d['api-key'], model: d['model'], file }
}

async function loadProviders(): Promise<{ claude: Provider; codex: Provider }> {
  const files = (await readdir(SECRETS_DIR)).filter((f) => f.endsWith('.txt'))
  const all = await Promise.all(
    files.map(async (f) => parseProvider(await readFile(join(SECRETS_DIR, f), 'utf-8'), f))
  )
  // The endpoint whose base-url mentions "codex" speaks the OpenAI Responses API
  // used by Codex; the other is the Anthropic-style endpoint for Claude Code.
  const codex = all.find((p) => /codex/i.test(p.baseUrl)) ?? all[0]
  const claude = all.find((p) => p !== codex) ?? all[0]
  return { claude, codex }
}

interface RunOut { code: number; stdout: string; stderr: string }
async function run(cmd: string[], env: Record<string, string>, timeoutMs = 180_000): Promise<RunOut> {
  // stdin closed: codex exec otherwise blocks "Reading additional input from stdin".
  const proc = spawn(cmd, { env: { ...process.env, ...env }, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
  const timer = setTimeout(() => proc.kill(), timeoutMs)
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  clearTimeout(timer)
  return { code, stdout, stderr }
}

async function waitPort(port: number, tries = 50): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/items`)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  throw new Error(`fixture server never came up on :${port}`)
}

const results: { name: string; ok: boolean; detail: string }[] = []
function record(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// Real LLM calls are nondeterministic (a model may greet instead of acting, or
// drop the exact token); retry a few times before failing.
const MAX_ATTEMPTS = 3
async function checkAgent(name: string, cmd: string[], env: Record<string, string>, token: string) {
  let last: RunOut = { code: -1, stdout: '', stderr: '' }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await run(cmd, env)
    if (last.stdout.includes(token)) {
      record(name, true, attempt > 1 ? `(attempt ${attempt})` : oneline(last).slice(0, 40))
      return
    }
  }
  record(name, false, oneline(last))
}

async function main() {
  const providers = await loadProviders()
  console.log(`[e2e] claude → ${providers.claude.baseUrl} (${providers.claude.model})`)
  console.log(`[e2e] codex  → ${providers.codex.baseUrl} (${providers.codex.model})`)

  // Each package gets its OWN config dirs so a check has exactly one valid
  // mechanism — otherwise codex tends to satisfy the skill prompt by calling the
  // MCP tool (both installed → cross-contamination).
  const d = {
    claudeSkill: join(WORK, 'claude-skill'),
    claudeMcp: join(WORK, 'claude-mcp'),
    codexSkill: join(WORK, 'codex-skill'),
    codexMcp: join(WORK, 'codex-mcp'),
  }
  const aasHome = join(WORK, 'agents')
  await mkdir(WORK, { recursive: true })
  const baseInstall = { AS_STORE_URL: `http://127.0.0.1:${FIXTURE_PORT}`, AS_HOME: aasHome }

  // Start the fixture store.
  const server = spawn(['bun', join(HERE, 'fixture-server.ts')], {
    env: { ...process.env, FIXTURE_PORT: String(FIXTURE_PORT) },
    stdout: 'inherit',
    stderr: 'inherit',
  })
  await waitPort(FIXTURE_PORT)

  try {
    // Install each package into its own claude + codex config dirs (auto-enables both).
    const installs = [
      { slug: 'e2e-probe-skill', claude: d.claudeSkill, codex: d.codexSkill },
      { slug: 'e2e-probe-mcp', claude: d.claudeMcp, codex: d.codexMcp },
    ]
    for (const it of installs) {
      const r = await run(
        ['bun', CLI, 'install', it.slug],
        { ...baseInstall, CLAUDE_CONFIG_DIR: it.claude, CODEX_CONFIG_DIR: it.codex },
        60_000
      )
      const installed = /Installed/.test(r.stdout)
      record(`install:${it.slug}`, installed, installed ? '' : (r.stdout + r.stderr).trim().slice(0, 200))
    }

    // Codex needs a model provider in each of its config dirs (merge-safe with any MCP entry).
    const codexToml =
      `model = "${providers.codex.model}"\n` +
      `model_provider = "e2e"\n\n` +
      `[model_providers.e2e]\n` +
      `name = "e2e"\n` +
      `base_url = "${providers.codex.baseUrl}"\n` +
      `env_key = "CODEX_API_KEY"\n` +
      `wire_api = "responses"\n`
    for (const home of [d.codexSkill, d.codexMcp]) {
      const existing = await readFile(join(home, 'config.toml'), 'utf-8').catch(() => '')
      await writeFile(join(home, 'config.toml'), codexToml + '\n' + existing)
    }

    // ---- Claude Code ----
    const claudeBase = { ANTHROPIC_BASE_URL: providers.claude.baseUrl, ANTHROPIC_AUTH_TOKEN: providers.claude.apiKey }
    const claudeCmd = (prompt: string) =>
      ['claude', '--print', '--model', providers.claude.model, '--dangerously-skip-permissions', prompt]
    await checkAgent('claude:skill', claudeCmd(SKILL_PROMPT), { ...claudeBase, CLAUDE_CONFIG_DIR: d.claudeSkill }, SKILL_TOKEN)
    await checkAgent('claude:mcp', claudeCmd(MCP_PROMPT), { ...claudeBase, CLAUDE_CONFIG_DIR: d.claudeMcp }, MCP_TOKEN)

    // ---- Codex ----
    // --dangerously-bypass-approvals-and-sandbox: exec is non-interactive, so
    // otherwise codex auto-cancels the MCP tool call and read-only blocks it.
    const codexArgs = ['exec', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox']
    const codexBase = { CODEX_API_KEY: providers.codex.apiKey }
    await checkAgent('codex:skill', ['codex', ...codexArgs, SKILL_PROMPT], { ...codexBase, CODEX_HOME: d.codexSkill }, SKILL_TOKEN)
    await checkAgent('codex:mcp', ['codex', ...codexArgs, MCP_PROMPT], { ...codexBase, CODEX_HOME: d.codexMcp }, MCP_TOKEN)
  } finally {
    server.kill()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n[e2e] ${results.length - failed.length}/${results.length} checks passed`)
  process.exit(failed.length ? 1 : 0)
}

function oneline(r: RunOut): string {
  return (r.stdout + ' ' + r.stderr).replace(/\s+/g, ' ').trim().slice(0, 160)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
