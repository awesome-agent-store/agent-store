import { test, expect, afterEach, mock, spyOn } from 'bun:test'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import * as rpcModule from '../../lib/rpc'

const openMock = mock(async () => {})
mock.module('../../lib/openExternal', () => ({ openExternal: openMock }))
mock.module('../../lib/deepLink', () => ({ onDeepLink: async () => () => {} }))

mock.module('../../lib/neonAuth', () => ({
  getStoreBaseUrl: () => 'https://store.test',
  getAuthScheme: () => 'agent-store',
  emailFromJwt: () => 'dev@example.com',
  AUTH_REDIRECT_URL: 'agent-store://auth-callback',
}))

const { SettingsModal } = await import('../SettingsModal')
const { AppStateProvider } = await import('../../state/AppState')
const { EntitlementProvider } = await import('../../state/Entitlement')
const { AuthProvider } = await import('../../state/Auth')

afterEach(() => {
  cleanup()
  mock.restore()
  openMock.mockClear()
})

function renderModal() {
  spyOn(rpcModule, 'callRpc').mockImplementation((async (method: string) => {
    if (method === 'getEntitlements') return { plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }
    if (method === 'createCheckout') return { checkoutUrl: 'https://pay.example/cs_1' }
    if (method === 'syncEntitlement') return { plan: 'pro', advancedUsageAnalytics: true, smartRouting: true, keyRotation: true }
    if (method === 'clearEntitlement') return { plan: 'free', advancedUsageAnalytics: false, smartRouting: false, keyRotation: false }
    throw new Error(`unexpected RPC in SettingsModal test: ${method}`)
  }) as typeof rpcModule.callRpc)

  return render(
    <AppStateProvider>
      <EntitlementProvider>
        <AuthProvider>
          <SettingsModal open onOpenChange={() => {}} />
        </AuthProvider>
      </EntitlementProvider>
    </AppStateProvider>
  )
}

test('defaults to the account tab, showing logged-out state and a free-plan upgrade CTA', async () => {
  renderModal()
  expect(await screen.findByText('未登录')).toBeInTheDocument()
  expect(screen.getByText('使用 GitHub 登录')).toBeInTheDocument()
  expect(screen.getByText('使用 Google 登录')).toBeInTheDocument()
  expect(screen.getByText('订阅计划')).toBeInTheDocument()
  expect(screen.getByText('升级 Pro')).toBeInTheDocument()
})

test('clicking 使用 GitHub 登录 opens the store relay page with the github provider', async () => {
  renderModal()
  fireEvent.click(await screen.findByText('使用 GitHub 登录'))
  await waitFor(() => expect(openMock).toHaveBeenCalledWith('https://store.test/auth/desktop?provider=github&scheme=agent-store'))
})

test('clicking 使用 Google 登录 opens the store relay page with the google provider', async () => {
  renderModal()
  fireEvent.click(await screen.findByText('使用 Google 登录'))
  await waitFor(() => expect(openMock).toHaveBeenCalledWith('https://store.test/auth/desktop?provider=google&scheme=agent-store'))
})

test('clicking 升级 Pro creates a checkout session and opens the checkout url', async () => {
  renderModal()
  fireEvent.click(await screen.findByText('升级 Pro'))
  await waitFor(() => expect(openMock).toHaveBeenCalledWith('https://pay.example/cs_1'))
})

test('switching to the general tab shows theme, default app, and language rows', async () => {
  renderModal()
  fireEvent.click(await screen.findByText('通用'))
  expect(screen.getByText('主题')).toBeInTheDocument()
  expect(screen.getByText('当前：暗色')).toBeInTheDocument()
  expect(screen.getByText('默认目标应用')).toBeInTheDocument()
  expect(screen.getByText('界面语言')).toBeInTheDocument()
})

test('theme toggle switches the displayed label', async () => {
  renderModal()
  fireEvent.click(await screen.findByText('通用'))
  fireEvent.click(screen.getByText('主题').closest('button')!)
  expect(screen.getByText('当前：亮色')).toBeInTheDocument()
})

test('language dropdown lists all five locales, none disabled', async () => {
  renderModal()
  fireEvent.click(await screen.findByText('通用'))
  fireEvent.click(screen.getByText('中文')) // the dropdown trigger shows the active locale
  expect(screen.getByText('English')).toBeInTheDocument()
  expect(screen.getByText('日本語')).toBeInTheDocument()
  expect(screen.getByText('한국어')).toBeInTheDocument()
  expect(screen.getByText('Español')).toBeInTheDocument()
  expect(screen.getByText('日本語').closest('button')).not.toBeDisabled()
})

test('switching to the about tab shows app name, version, and links', async () => {
  renderModal()
  fireEvent.click(await screen.findByText('关于'))
  expect(screen.getByText('Agent Store CLI')).toBeInTheDocument()
  expect(screen.getByText('文档')).toBeInTheDocument()
  expect(screen.getByText('检查更新')).toBeInTheDocument()
})
