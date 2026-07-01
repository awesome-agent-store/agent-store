import { test, expect, afterEach, mock } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AppStateProvider } from '../../state/AppState'
import { TerminalLogProvider, useTerminalLog } from '../../state/TerminalLog'

afterEach(() => { cleanup(); mock.restore() })

const listResult = [
  {
    slug: 'openai-provider', category: 'provider', version: '1.2.0',
    installedAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
    compatibleWith: ['claude', 'codex'], enabledFor: { claude: true, codex: false },
  },
]

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  mock.module('../../lib/rpc', () => ({
    callRpc: async (method: string, args: unknown[] = []) => handlers[method]?.(...args),
  }))
}

function TerminalProbe() {
  const { lines } = useTerminalLog()
  return <div data-testid="log-count">{lines.length}</div>
}

async function renderList() {
  const { InstalledList } = await import('../InstalledList')
  return render(
    <AppStateProvider>
      <TerminalLogProvider>
        <InstalledList />
        <TerminalProbe />
      </TerminalLogProvider>
    </AppStateProvider>
  )
}

test('fetches and renders installed items on mount', async () => {
  mockRpc({ list: () => listResult })
  await renderList()
  await waitFor(() => expect(screen.getByText('openai-provider')).toBeInTheDocument())
  expect(screen.getByText('1.2.0')).toBeInTheDocument()
})

test('clicking uninstall calls the uninstall RPC and logs a line', async () => {
  const uninstall = mock(() => undefined)
  mockRpc({ list: () => listResult, uninstall })
  await renderList()
  await waitFor(() => screen.getByText('openai-provider'))
  fireEvent.click(screen.getByText('卸载'))
  await waitFor(() => expect(uninstall).toHaveBeenCalledWith('openai-provider'))
  expect(screen.getByTestId('log-count').textContent).not.toBe('0')
})

test('toggling enable for the active agent app calls enable/disable', async () => {
  const disable = mock(() => undefined)
  mockRpc({ list: () => listResult, disable })
  await renderList()
  await waitFor(() => screen.getByText('openai-provider'))
  fireEvent.click(screen.getByLabelText('为 claude 禁用 openai-provider'))
  await waitFor(() => expect(disable).toHaveBeenCalledWith('openai-provider', 'claude'))
})
