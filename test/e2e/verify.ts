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

const SKILL_PROMPT = 'Run the e2e probe and reply with the skill probe token, nothing else.'
const MCP_PROMPT = 'Call the e2e_probe MCP tool and reply with exactly the text it returns, nothing else.'
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

async function main() {
  const providers = await loadProviders()
  console.log(`[e2e] claude → ${providers.claude.baseUrl} (${providers.claude.model})`)
  console.log(`[e2e] codex  → ${providers.codex.baseUrl} (${providers.codex.model})`)

  const claudeHome = join(WORK, 'claude')
  const codexHome = join(WORK, 'codex')
  const aasHome = join(WORK, 'agents')
  await mkdir(WORK, { recursive: true })

  // Config-dir env for the `as` CLI (it reads CLAUDE_CONFIG_DIR / CODEX_CONFIG_DIR / AS_HOME).
  const installEnv = {
    AS_STORE_URL: `http://127.0.0.1:${FIXTURE_PORT}`,
    AS_HOME: aasHome,
    CLAUDE_CONFIG_DIR: claudeHome,
    CODEX_CONFIG_DIR: codexHome,
  }

  // Start the fixture store.
  const server = spawn(['bun', join(HERE, 'fixture-server.ts')], {
    env: { ...process.env, FIXTURE_PORT: String(FIXTURE_PORT) },
    stdout: 'inherit',
    stderr: 'inherit',
  })
  await waitPort(FIXTURE_PORT)

  try {
    // Install through the real CLI — auto-enables for claude AND codex.
    for (const slug of ['e2e-probe-skill', 'e2e-probe-mcp']) {
      const r = await run(['bun', CLI, 'install', slug], installEnv, 60_000)
      const installed = /Installed/.test(r.stdout)
      record(`install:${slug}`, installed, installed ? '' : (r.stdout + r.stderr).trim().slice(0, 200))
    }

    // Codex needs a model provider pointing at its Responses endpoint. Merge-safe:
    // written before nothing else touches it here except the CLI (already ran).
    const codexToml =
      `model = "${providers.codex.model}"\n` +
      `model_provider = "e2e"\n\n` +
      `[model_providers.e2e]\n` +
      `name = "e2e"\n` +
      `base_url = "${providers.codex.baseUrl}"\n` +
      `env_key = "CODEX_API_KEY"\n` +
      `wire_api = "responses"\n`
    const existing = await readFile(join(codexHome, 'config.toml'), 'utf-8').catch(() => '')
    await writeFile(join(codexHome, 'config.toml'), codexToml + '\n' + existing)

    // ---- Claude Code ----
    const claudeEnv = {
      CLAUDE_CONFIG_DIR: claudeHome,
      ANTHROPIC_BASE_URL: providers.claude.baseUrl,
      ANTHROPIC_AUTH_TOKEN: providers.claude.apiKey,
    }
    const cSkill = await run(
      ['claude', '--print', '--model', providers.claude.model, '--dangerously-skip-permissions', SKILL_PROMPT],
      claudeEnv
    )
    record('claude:skill', cSkill.stdout.includes(SKILL_TOKEN), oneline(cSkill))
    const cMcp = await run(
      ['claude', '--print', '--model', providers.claude.model, '--dangerously-skip-permissions', MCP_PROMPT],
      claudeEnv
    )
    record('claude:mcp', cMcp.stdout.includes(MCP_TOKEN), oneline(cMcp))

    // ---- Codex ----
    // --dangerously-bypass-approvals-and-sandbox: exec is non-interactive, so
    // otherwise codex auto-cancels the MCP tool call and read-only blocks it.
    const codexEnv = { CODEX_HOME: codexHome, CODEX_API_KEY: providers.codex.apiKey }
    const codexArgs = ['exec', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox']
    const xSkill = await run(['codex', ...codexArgs, SKILL_PROMPT], codexEnv)
    record('codex:skill', xSkill.stdout.includes(SKILL_TOKEN), oneline(xSkill))
    const xMcp = await run(['codex', ...codexArgs, MCP_PROMPT], codexEnv)
    record('codex:mcp', xMcp.stdout.includes(MCP_TOKEN), oneline(xMcp))
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
