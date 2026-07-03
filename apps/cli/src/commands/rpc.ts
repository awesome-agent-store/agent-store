import type { AASEngine, ListOptions, SearchOptions, ToolTarget } from '@aas/types'

type RpcHandler = (engine: AASEngine, args: unknown[]) => Promise<unknown>

const RPC_METHODS: Record<string, RpcHandler> = {
  search: (e, a) => e.search(a[0] as string, a[1] as SearchOptions | undefined),
  install: (e, a) => e.install(a[0] as string),
  uninstall: (e, a) => e.uninstall(a[0] as string),
  enable: (e, a) => e.enable(a[0] as string, a[1] as ToolTarget),
  disable: (e, a) => e.disable(a[0] as string, a[1] as ToolTarget),
  getConfigSchema: (e, a) => e.getConfigSchema(a[0] as string),
  setConfig: (e, a) => e.setConfig(a[0] as string, a[1] as Record<string, unknown>),
  sync: (e, a) => e.sync(a[0] as ToolTarget[] | undefined),
  checkUpdates: (e, a) => e.checkUpdates(a[0] as string[] | undefined),
  update: (e, a) => e.update(a[0] as string | undefined),
  list: (e, a) => e.list(a[0] as ListOptions | undefined),
  info: (e, a) => e.info(a[0] as string),
  duplicateProvider: (e, a) => e.duplicateProvider(a[0] as string),
}

export async function runRpc(
  engine: AASEngine,
  args: string[],
  out: (s: string) => void = console.log
): Promise<number> {
  const [method, jsonArgs] = args
  const handler = method ? RPC_METHODS[method] : undefined

  if (!handler) {
    out(JSON.stringify({ ok: false, error: `Unknown RPC method: ${method}` }))
    return 1
  }

  let parsedArgs: unknown[]
  try {
    parsedArgs = jsonArgs ? (JSON.parse(jsonArgs) as unknown[]) : []
  } catch {
    out(JSON.stringify({ ok: false, error: 'Invalid JSON arguments' }))
    return 1
  }

  try {
    const data = await handler(engine, parsedArgs)
    out(JSON.stringify({ ok: true, data: data ?? null }))
    return 0
  } catch (err) {
    out(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }))
    return 1
  }
}
