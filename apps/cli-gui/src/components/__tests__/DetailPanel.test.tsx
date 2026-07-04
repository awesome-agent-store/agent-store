import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AppStateProvider, useAppState } from '../../state/AppState'
import { TerminalLogProvider } from '../../state/TerminalLog'
import * as rpcModule from '../../lib/rpc'
import { DetailPanel } from '../DetailPanel'

afterEach(() => { cleanup(); mock.restore() })

const publisher = { id: 'p', slug: 'anthropic', name: 'anthropic', avatarUrl: '', tier: 'official' as const }

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) =>
    handlers[method]?.(...args)) as typeof rpcModule.callRpc)
}

function Select({ slug }: { slug: string }) {
  const { setSelectedSlug } = useAppState()
  return <button onClick={() => setSelectedSlug(slug)}>select</button>
}

function renderPanel(slug = 'filesystem') {
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <Select slug={slug} />
        <DetailPanel />
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

test('shows the empty state with no selection', () => {
  renderPanel()
  expect(screen.getByText('从左侧选择一个资源查看详情')).toBeInTheDocument()
})

test('shows an installed item detail from the info RPC', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: { claude: true },
      name: 'filesystem', description: '读写本地文件系统', readmeUrl: '', icon: '',
      publisher, tags: ['fs'], downloads: 388000,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => expect(screen.getByText('filesystem')).toBeInTheDocument())
  expect(screen.getByText('✓ 已安装')).toBeInTheDocument()
})

test('shows an install button for a not-yet-installed item and installs it', async () => {
  const install = mock(() => ({ version: '1.0.0' }))
  mockRpc({
    info: () => { throw new Error('Item not installed: filesystem') },
    search: () => [{
      id: 'i1', slug: 'filesystem', name: 'filesystem', description: '读写本地文件系统',
      readmeUrl: '', icon: '', category: 'mcp', version: '0.8.1', publisher,
      compatibleWith: ['claude'], tags: [], downloads: 10, rating: 4.5, status: 'published',
      installHook: { steps: [] }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      configSchema: {},
    }],
    install,
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByText('安装'))
  fireEvent.click(screen.getByText('安装'))
  await waitFor(() => expect(install).toHaveBeenCalledWith('filesystem'))
})

test('switching to the 评价 tab shows the empty state', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', readmeUrl: '', icon: '', publisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.click(screen.getByText('评价'))
  expect(screen.getByText('暂无评价')).toBeInTheDocument()
})

test('switching to the 版本 tab shows the current version', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', readmeUrl: '', icon: '', publisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByText('filesystem'))
  fireEvent.click(screen.getByText('版本'))
  expect(screen.getByText('当前版本：v0.8.1')).toBeInTheDocument()
})

test('clicking the heart button toggles favorite state', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', readmeUrl: '', icon: '', publisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByLabelText('收藏'))
  fireEvent.click(screen.getByLabelText('收藏'))
  expect(screen.getByLabelText('取消收藏')).toBeInTheDocument()
})

test('shows an 官方 badge for an official-tier publisher and no 已发布 badge for an installed item', async () => {
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', readmeUrl: '', icon: '', publisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByText('filesystem'))
  expect(screen.getByText('官方')).toBeInTheDocument()
  expect(screen.queryByText('已发布')).not.toBeInTheDocument()
})

test('does not show an 官方 badge for a community-tier publisher', async () => {
  const communityPublisher = { ...publisher, tier: 'community' as const }
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', readmeUrl: '', icon: '', publisher: communityPublisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByText('filesystem'))
  expect(screen.queryByText('官方')).not.toBeInTheDocument()
})

test('shows a 已发布 badge for a not-yet-installed published catalog item', async () => {
  mockRpc({
    info: () => { throw new Error('Item not installed: filesystem') },
    search: () => [{
      id: 'i1', slug: 'filesystem', name: 'filesystem', description: '读写本地文件系统',
      readmeUrl: '', icon: '', category: 'mcp', version: '0.8.1', publisher,
      compatibleWith: ['claude'], tags: [], downloads: 10, rating: 4.5, status: 'published',
      installHook: { steps: [] }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      configSchema: {},
    }],
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByText('filesystem'))
  expect(screen.getByText('已发布')).toBeInTheDocument()
})

test('clicking the copy button copies the install command to the clipboard', async () => {
  const writeText = mock(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  mockRpc({
    info: () => ({
      slug: 'filesystem', category: 'mcp', version: '0.8.1', installedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z', compatibleWith: ['claude'], enabledFor: {},
      name: 'filesystem', description: 'desc', readmeUrl: '', icon: '', publisher, tags: [], downloads: 0,
    }),
  })
  renderPanel()
  fireEvent.click(screen.getByText('select'))
  await waitFor(() => screen.getByLabelText('复制安装命令'))
  fireEvent.click(screen.getByLabelText('复制安装命令'))
  expect(writeText).toHaveBeenCalledWith('agent-store add filesystem')
})
