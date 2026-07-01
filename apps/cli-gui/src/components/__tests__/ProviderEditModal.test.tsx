import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'

afterEach(() => { cleanup(); mock.restore() })

const schema = {
  properties: {
    apiKey: { type: 'string', description: 'API Key' },
    baseUrl: { type: 'string', description: 'Base URL', default: 'https://api.openai.com' },
  },
  required: ['apiKey'],
}

function mockRpc(handlers: Record<string, (...args: unknown[]) => unknown>) {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string, args: unknown[] = []) =>
    handlers[method]?.(...args)) as typeof rpcModule.callRpc)
}

async function renderModal(onOpenChange = () => {}) {
  const { ProviderEditModal } = await import('../ProviderEditModal')
  return render(<ProviderEditModal slug="openai-provider" open onOpenChange={onOpenChange} />)
}

test('renders one field per schema property, pre-filled from current config', async () => {
  mockRpc({ getConfigSchema: () => ({ schema, current: { apiKey: 'sk-test' } }) })
  await renderModal()
  await waitFor(() => expect(screen.getByLabelText('API Key')).toBeInTheDocument())
  expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe('sk-test')
  expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe('https://api.openai.com')
})

test('saving calls setConfig with the edited values and closes', async () => {
  const setConfig = mock(() => undefined)
  mockRpc({ getConfigSchema: () => ({ schema, current: { apiKey: 'sk-test' } }), setConfig })
  const onOpenChange = mock(() => {})
  await renderModal(onOpenChange)
  await waitFor(() => screen.getByLabelText('API Key'))
  fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-new' } })
  fireEvent.click(screen.getByText('保存'))
  await waitFor(() => expect(setConfig).toHaveBeenCalledWith('openai-provider', {
    apiKey: 'sk-new',
    baseUrl: 'https://api.openai.com',
  }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
