import { createEngine } from './engine'
import { runSearch } from './commands/search'
import { runList } from './commands/list'
import { runInfo } from './commands/info'
import { runInstall } from './commands/install'
import { runUninstall } from './commands/uninstall'
import { runEnable } from './commands/enable'
import { runDisable } from './commands/disable'
import { runConfig } from './commands/config'
import { runSync } from './commands/sync'
import { runUpdate } from './commands/update'
import { runRpc } from './commands/rpc'
import { runRelay } from './commands/relay'
import { runUsage } from './commands/usage'
import { runRelayDaemon, resolvePaths } from '@aas/client-core'
import { readFile, writeFile, rm, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { homedir } from 'os'

const USAGE = `aas — AI Agent Store CLI

Usage: aas <command> [options]

Commands:
  search <query>                   Search the store
  install <slug>                   Install an item (or update if already installed)
  uninstall <slug>                 Uninstall an item
  enable <slug> --for <tool>       Enable for claude or codex
  disable <slug> --for <tool>      Disable for claude or codex
  config <slug>                    Configure an item's settings
  sync [--for <tool>]              Sync enabled items to tool configs
  relay <start|stop|status>        Manage the local provider relay
  usage [--days N] [--provider <slug>] [--for <claude|codex>]   Show usage and cost summary
  update [slug]                    Update installed items
  list [--for <tool>]              List installed items
  info <slug>                      Show item details`

// Re-invokes this same CLI (whether running via `bun run src/index.ts` or as a
// `bun build --compile` binary) with a hidden `__relay-daemon` argument, so the
// spawned process resolves correctly in both forms. `import.meta.url`-based
// script paths don't survive `--compile` (the file isn't on disk in the
// bundled binary), so self-re-invocation via argv is the only form that works
// in both.
function selfInvocation(): string[] {
  const looksLikeScript = process.argv[1]?.endsWith('.ts') || process.argv[1]?.endsWith('.js')
  return looksLikeScript ? [process.execPath, process.argv[1] as string] : [process.execPath]
}

function realRelayOps() {
  const pidFile = join(process.env['AAS_HOME'] ?? join(homedir(), '.agents'), 'relay.pid')
  return {
    spawnDetached: () => {
      const proc = Bun.spawn([...selfInvocation(), '__relay-daemon'], { stdio: ['ignore', 'ignore', 'ignore'] })
      proc.unref()
      return proc.pid
    },
    isRunning: (pid: number) => {
      try { process.kill(pid, 0); return true } catch { return false }
    },
    kill: (pid: number) => { try { process.kill(pid, 'SIGTERM') } catch { /* already dead */ } },
    readPidFile: async () => {
      try { return Number((await readFile(pidFile, 'utf-8')).trim()) } catch { return null }
    },
    writePidFile: async (pid: number) => {
      await mkdir(dirname(pidFile), { recursive: true })
      await writeFile(pidFile, String(pid))
    },
    removePidFile: async () => { await rm(pidFile, { force: true }) },
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE)
    return
  }

  const engine = createEngine()

  switch (command) {
    case 'search':    await runSearch(engine, rest); break
    case 'list':      await runList(engine, rest); break
    case 'info':      await runInfo(engine, rest); break
    case 'install':   await runInstall(engine, rest); break
    case 'uninstall': await runUninstall(engine, rest); break
    case 'enable':    await runEnable(engine, rest); break
    case 'disable':   await runDisable(engine, rest); break
    case 'config':    await runConfig(engine, rest); break
    case 'sync':      await runSync(engine, rest); break
    case 'update':    await runUpdate(engine, rest); break
    case 'relay':     await runRelay(rest, realRelayOps()); break
    case 'usage':     await runUsage(engine, rest); break
    case '__relay-daemon': {
      const paths = resolvePaths()
      await runRelayDaemon(paths.aasHome)
      return
    }
    case '__rpc': {
      const code = await runRpc(engine, rest)
      process.exit(code)
    }
    default:
      console.error(`Unknown command: ${command}`)
      console.log(USAGE)
      process.exit(1)
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
