import { test, expect, afterEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'
import { AppStateProvider } from '../../state/AppState'
import { LocalProviderDetail, LOCAL_PROVIDER_SENTINEL } from '../LocalProviderDetail'

afterEach(() => { cleanup(); mock.restore() })

function mockRpc(overrides: Record<string, (args?: unknown[]) => unknown> = {}) {
  const configs = [
    { id: 'default', name: '默认', port: 18780, enabled: true, enabledFor: { claude: true, codex: false } },
    { id: 'extra', name: '测试环境', port: 18880, enabled: false, enabledFor: {} },
  ]
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args?: unknown[]) => {
    if (overrides[method]) return overrides[method](args)
    if (method === 'listLocalConfigs') return configs
    if (method === 'getRelayStatus') return { running: true, pid: 123 }
    if (method === 'getRecentRequests') return []
    throw new Error(`unexpected RPC in LocalProviderDetail test: ${method}`)
  }) as typeof rpcModule.callRpc)
}

test('parent view shows only the header and description, no invented stats or log button', async () => {
  mockRpc()
  render(<AppStateProvider><LocalProviderDetail selectedSlug={LOCAL_PROVIDER_SENTINEL} /></AppStateProvider>)
  expect(await screen.findByText('local')).toBeInTheDocument()
  expect(await screen.findByText('内置 Provider')).toBeInTheDocument()
  expect(
    await screen.findByText('Claude / Codex 指向 local 的某个监听端口，请求经该配置按 Level 顺序转发到上游供应商，失败自动降级。')
  ).toBeInTheDocument()
  expect(screen.queryByText(/个配置/)).not.toBeInTheDocument()
  expect(screen.queryByText(/个运行中/)).not.toBeInTheDocument()
  expect(screen.queryByText('查看代理日志')).not.toBeInTheDocument()
})

test('child view shows an icon-only back button, editable name, and an editable port field', async () => {
  mockRpc()
  render(<AppStateProvider><LocalProviderDetail selectedSlug={`${LOCAL_PROVIDER_SENTINEL}:default`} /></AppStateProvider>)
  await screen.findByDisplayValue('默认')
  const backButton = screen.getByTitle('返回 local')
  expect(backButton).toBeInTheDocument()
  expect(backButton).not.toHaveTextContent('local')
  expect(screen.getByText('local /')).toBeInTheDocument()
  expect(screen.getByRole('switch')).toBeInTheDocument()
  expect(screen.getByDisplayValue('18780')).toBeInTheDocument()
})

test('child view shows 运行中/已停止 status labels', async () => {
  mockRpc()
  render(<AppStateProvider><LocalProviderDetail selectedSlug={`${LOCAL_PROVIDER_SENTINEL}:default`} /></AppStateProvider>)
  expect(await screen.findByText('运行中')).toBeInTheDocument()

  cleanup()
  render(<AppStateProvider><LocalProviderDetail selectedSlug={`${LOCAL_PROVIDER_SENTINEL}:extra`} /></AppStateProvider>)
  expect(await screen.findByText('已停止')).toBeInTheDocument()
})

test('toggling the child view switch calls toggleLocalConfig', async () => {
  let toggledId: string | undefined
  mockRpc({ toggleLocalConfig: (args) => { toggledId = args?.[0] as string; return { id: 'default', name: '默认', port: 18780, enabled: false, enabledFor: {} } } })
  render(<AppStateProvider><LocalProviderDetail selectedSlug={`${LOCAL_PROVIDER_SENTINEL}:default`} /></AppStateProvider>)
  fireEvent.click(await screen.findByRole('switch'))
  await waitFor(() => expect(toggledId).toBe('default'))
})

test('editing the name field in the child view calls updateLocalConfig with the new name', async () => {
  let updatedName: string | undefined
  mockRpc({
    updateLocalConfig: (args) => {
      updatedName = (args?.[1] as { name?: string })?.name
      return { id: 'default', name: '新名称', port: 18780, enabled: true, enabledFor: {} }
    },
  })
  render(<AppStateProvider><LocalProviderDetail selectedSlug={`${LOCAL_PROVIDER_SENTINEL}:default`} /></AppStateProvider>)
  const nameInput = await screen.findByDisplayValue('默认')
  fireEvent.change(nameInput, { target: { value: '新名称' } })
  await waitFor(() => expect(updatedName).toBe('新名称'))
})

test('editing the port field in the child view calls updateLocalConfig', async () => {
  let updatedPort: number | undefined
  mockRpc({
    updateLocalConfig: (args) => {
      updatedPort = (args?.[1] as { port?: number })?.port
      return { id: 'default', name: '默认', port: 19999, enabled: true, enabledFor: {} }
    },
  })
  render(<AppStateProvider><LocalProviderDetail selectedSlug={`${LOCAL_PROVIDER_SENTINEL}:default`} /></AppStateProvider>)
  const portInput = await screen.findByDisplayValue('18780')
  fireEvent.change(portInput, { target: { value: '19999' } })
  await waitFor(() => expect(updatedPort).toBe(19999))
})

test('child view shows a 适用客户端 selector with a toggle button per client', async () => {
  mockRpc()
  render(<AppStateProvider><LocalProviderDetail selectedSlug={`${LOCAL_PROVIDER_SENTINEL}:default`} /></AppStateProvider>)
  expect(await screen.findByText('适用客户端')).toBeInTheDocument()
  const claudeButton = screen.getByTitle('Claude Code')
  const codexButton = screen.getByTitle('Codex')
  expect(claudeButton).toHaveAttribute('aria-pressed', 'true')
  expect(codexButton).toHaveAttribute('aria-pressed', 'false')
})

test('clicking a target-app button calls updateLocalConfig with the toggled enabledFor', async () => {
  let updatedEnabledFor: Record<string, boolean> | undefined
  mockRpc({
    updateLocalConfig: (args) => {
      updatedEnabledFor = (args?.[1] as { enabledFor?: Record<string, boolean> })?.enabledFor
      return { id: 'default', name: '默认', port: 18780, enabled: true, enabledFor: { claude: true, codex: true } }
    },
  })
  render(<AppStateProvider><LocalProviderDetail selectedSlug={`${LOCAL_PROVIDER_SENTINEL}:default`} /></AppStateProvider>)
  fireEvent.click(await screen.findByTitle('Codex'))
  await waitFor(() => expect(updatedEnabledFor).toEqual({ claude: true, codex: true }))
})
