import { test, expect, afterEach, beforeEach, spyOn, mock } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import * as rpcModule from '../lib/rpc'
import { App } from '../App'

// Pin the UI language so these assertions don't depend on the host's OS locale
// (I18nProvider auto-detects the browser locale on first run).
beforeEach(() => { try { localStorage.setItem('as-locale', 'zh') } catch { /* ignore */ } })
afterEach(() => { cleanup(); mock.restore(); try { localStorage.clear() } catch { /* ignore */ } })

function mockAllRpcs() {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'list') return []
    if (method === 'search') return []
    if (method === 'getUsageSummary') return []
    if (method === 'getRelayStatus') return { running: false }
    if (method === 'listLocalConfigs') return []
    if (method === 'getRecentRequests') return []
    if (method === 'checkUpdates') return []
    throw new Error(`unexpected RPC in smoke test: ${method}`)
  }) as typeof rpcModule.callRpc)
}

test('renders the icon rail and the Overview dashboard by default', async () => {
  mockAllRpcs()

  render(<App />)

  expect(screen.getByLabelText('概览')).toBeInTheDocument()
  expect(screen.getByLabelText('供应商')).toBeInTheDocument()
  expect(await screen.findByText('消耗趋势')).toBeInTheDocument()
  expect(await screen.findByText('供应商')).toBeInTheDocument()
})

test('clicking 供应商 switches to the browse three-pane layout', async () => {
  mockAllRpcs()

  render(<App />)

  await screen.findByText('供应商')
  screen.getByLabelText('供应商').click()

  expect(await screen.findByPlaceholderText('搜索，或用 @ 过滤…')).toBeInTheDocument()
  expect(screen.getByText('从左侧选择一个资源查看详情')).toBeInTheDocument()
})
