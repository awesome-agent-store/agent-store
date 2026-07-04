import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ProviderEditModal } from '../ProviderEditModal'
import * as rpcModule from '../../lib/rpc'

afterEach(() => { cleanup(); mock.restore() })

const publisher = { id: 'p', slug: 'yls', name: 'yls', avatarUrl: '', tier: 'community' as const }

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) =>
    handlers[method]?.(...args)) as typeof rpcModule.callRpc)
}

function renderModal(handlers?: Record<string, (...args: unknown[]) => unknown>) {
  mockRpc({
    info: () => ({
      slug: 'yls-me', category: 'provider', version: '0.9.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude', 'codex'], enabledFor: { claude: false, codex: true },
      name: 'yls-me', description: 'desc', readmeUrl: '', icon: '', publisher, tags: [], downloads: 0,
      currentConfig: { apiKey: 'sk-real', baseUrl: 'https://code.ylsagi.com/codex', authType: 'bearer', level: 2, whitelist: ['claude-*'], healthCheck: true },
    }),
    setConfig: () => undefined,
    enable: () => undefined,
    disable: () => undefined,
    ...handlers,
  })
  return render(<ProviderEditModal slug="yls-me" open onOpenChange={() => {}} />)
}

test('shows the required fields grid with current values from info()', async () => {
  renderModal()
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  expect(screen.getByText('API 密钥')).toBeInTheDocument()
  expect(screen.getByText('适用客户端')).toBeInTheDocument()
})

test('targets picker reflects enabledFor and toggling calls enable/disable', async () => {
  const enable = mock(() => undefined)
  renderModal({ enable })
  await waitFor(() => screen.getByLabelText('Claude Code'))
  fireEvent.click(screen.getByLabelText('Claude Code'))
  await waitFor(() => expect(enable).toHaveBeenCalledWith('yls-me', 'claude'))
})

test('更多设置 is collapsed by default and expands to show baseUrl/homepage/endpoint/upstreamProtocol/level', async () => {
  renderModal()
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  expect(screen.queryByText('API 地址')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('更多设置'))
  expect(screen.getByText('API 地址')).toBeInTheDocument()
  expect(screen.getByText('官网地址')).toBeInTheDocument()
  expect(screen.getByText('API 端点')).toBeInTheDocument()
  expect(screen.getByText('上游协议')).toBeInTheDocument()
  expect(screen.getByText('优先级分组')).toBeInTheDocument()
})

test('高级设置 is collapsed by default and expands to show whitelist/mapping/healthCheck', async () => {
  renderModal()
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  expect(screen.queryByText('模型白名单')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('高级设置'))
  expect(screen.getByText('模型白名单')).toBeInTheDocument()
  expect(screen.getByText('模型映射')).toBeInTheDocument()
  expect(screen.getByText('可用性监控')).toBeInTheDocument()
  expect(screen.getByText('claude-*')).toBeInTheDocument()
})

test('adding a whitelist entry and saving calls setConfig with the updated whitelist array', async () => {
  const setConfig = mock(() => undefined)
  renderModal({ setConfig })
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.click(screen.getByText('高级设置'))
  fireEvent.change(screen.getByPlaceholderText('输入模型名称，如 claude-*'), { target: { value: 'gpt-4o' } })
  fireEvent.click(screen.getByText('添加'))
  await waitFor(() => expect(setConfig).toHaveBeenCalled())
  const [, values] = setConfig.mock.calls[setConfig.mock.calls.length - 1] as [string, Record<string, unknown>]
  expect(values.whitelist).toEqual(['claude-*', 'gpt-4o'])
})

test('toggling 可用性监控 calls setConfig with healthCheck flipped', async () => {
  const setConfig = mock(() => undefined)
  renderModal({ setConfig })
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.click(screen.getByText('高级设置'))
  fireEvent.click(screen.getByLabelText('可用性监控'))
  await waitFor(() => expect(setConfig).toHaveBeenCalled())
  const [, values] = setConfig.mock.calls[setConfig.mock.calls.length - 1] as [string, Record<string, unknown>]
  expect(values.healthCheck).toBe(false)
})

test('解析定价 button calls parsePricingFromUrl and fills the pricing table for review', async () => {
  const parsePricingFromUrl = mock(() => ({ 'gpt-5-codex': { input: 1.75, output: 14 } }))
  renderModal({ parsePricingFromUrl })
  await waitFor(() => screen.getByDisplayValue('sk-real'))
  fireEvent.click(screen.getByText('更多设置'))
  fireEvent.change(screen.getByPlaceholderText('https://docs.example.com/pricing'), { target: { value: 'https://example.com/pricing' } })
  fireEvent.click(screen.getByText('解析定价'))
  await waitFor(() => expect(parsePricingFromUrl).toHaveBeenCalledWith('https://example.com/pricing'))
  await waitFor(() => screen.getByDisplayValue('gpt-5-codex'))
  expect(screen.getByText('示例数据，请核对后保存')).toBeInTheDocument()
})
