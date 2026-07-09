import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { Check, X, Github } from 'lucide-react'
import { useAppState, type AgentApp } from '../state/AppState'
import { useAuth } from '../state/Auth'
import { useEntitlement } from '../state/Entitlement'
import { callRpc } from '../lib/rpc'
import { openExternal } from '../lib/openExternal'

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Tab = 'account' | 'general' | 'about'

const TABS: { key: Tab; label: string }[] = [
  { key: 'account', label: '账户' },
  { key: 'general', label: '通用' },
  { key: 'about', label: '关于' },
]

const APP_META: Record<AgentApp, { label: string; letter: string; color: string; path: string }> = {
  claude: { label: 'Claude Code', letter: 'C', color: '#d2785a', path: '~/.claude' },
  codex: { label: 'Codex', letter: 'X', color: '#10a37f', path: '~/.codex' },
}

const LANGUAGES = [
  { code: 'zh', label: '简体中文', sub: '当前语言', enabled: true },
  { code: 'en', label: 'English', sub: 'Available', enabled: true },
  { code: 'ja', label: '日本語', sub: '即将支持', enabled: false },
  { code: 'ko', label: '한국어', sub: '即将支持', enabled: false },
  { code: 'es', label: 'Español', sub: '即将支持', enabled: false },
]

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { agentApp, theme, toggleTheme } = useAppState()
  const { email, signedIn, accessToken, configured, signIn, signOut } = useAuth()
  const { entitlements } = useEntitlement()
  const [tab, setTab] = useState<Tab>('account')
  const [authBusy, setAuthBusy] = useState(false)
  const [langCode, setLangCode] = useState('zh')
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)

  async function checkForUpdates() {
    setUpdateMsg('检查中…')
    try {
      const updates = await callRpc<unknown[]>('checkUpdates')
      setUpdateMsg(updates.length > 0 ? `有 ${updates.length} 个可更新` : '已是最新')
    } catch {
      setUpdateMsg('检查失败')
    }
  }

  const currentLang = LANGUAGES.find((l) => l.code === langCode) ?? LANGUAGES[0]
  const appMeta = APP_META[agentApp]

  const isPro = entitlements.plan !== 'free'
  const avatarLetter = (email ?? 'A').charAt(0).toUpperCase()

  async function handleAuth() {
    if (authBusy) return
    setAuthBusy(true)
    try {
      if (signedIn) await signOut()
      else await signIn('github')
    } catch (err) {
      console.error('[auth] sign-in/out failed:', err)
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleUpgrade() {
    if (authBusy) return
    setAuthBusy(true)
    try {
      const { checkoutUrl } = await callRpc<{ checkoutUrl: string }>('createCheckout', [
        'monthly',
        accessToken ?? undefined,
      ])
      await openExternal(checkoutUrl)
    } catch (err) {
      console.error('[billing] checkout failed:', err)
    } finally {
      setAuthBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] flex h-[440px] w-[620px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-store-border-strong bg-store-win shadow-2xl">
          <Dialog.Title className="sr-only">设置</Dialog.Title>

          {/* left nav */}
          <div className="flex w-[168px] shrink-0 flex-col gap-[3px] border-r border-store-border bg-store-sidebar p-[18px_12px]">
            <div className="px-2 pb-3.5 text-sm font-bold text-store-text">设置</div>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-[11px] py-[9px] text-left text-[13px] font-semibold ${
                  tab === t.key ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* content */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-[50px] shrink-0 items-center justify-end px-4">
              <Dialog.Close
                aria-label="关闭"
                className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-store-text-3 hover:bg-store-panel"
              >
                <X size={15} />
              </Dialog.Close>
            </div>

            <div className="flex-1 overflow-y-auto px-[26px] pb-[26px] pt-1">
              {tab === 'account' && (
                <div>
                  <div className="flex items-center gap-3.5 rounded-xl border border-store-border bg-store-panel px-[18px] py-4">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[19px] font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #7c82ff, #b06ad9)' }}
                    >
                      {avatarLetter}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-bold text-store-text">{email ?? '未登录'}</div>
                      <div className="mt-[3px] flex items-center gap-[5px]">
                        <span
                          className="h-[7px] w-[7px] rounded-full"
                          style={{ background: signedIn ? 'var(--green)' : 'var(--text-3)' }}
                        />
                        <span className="text-xs text-store-text-2">{signedIn ? '已登录' : '未连接'}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAuth}
                      disabled={!configured || authBusy}
                      className="flex items-center gap-1.5 rounded-[9px] border border-store-border-strong px-4 py-2 text-[12.5px] font-semibold text-store-text hover:border-store-accent hover:text-store-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {!signedIn && <Github size={13} />}
                      {signedIn ? '退出登录' : 'GitHub 登录'}
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-xl border border-store-border bg-store-panel px-[18px] py-3.5">
                    <div>
                      <div className="text-[13px] font-semibold text-store-text">订阅计划</div>
                      <div className="mt-0.5 text-[11.5px] text-store-text-3">
                        {isPro ? 'Pro · 无限私有资源 + 高级用量分析' : 'Free · 升级解锁预算告警等 Pro 功能'}
                      </div>
                    </div>
                    {isPro ? (
                      <span className="rounded-md bg-store-accent-soft px-2.5 py-1 text-[11px] font-bold text-store-accent">
                        PRO
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleUpgrade}
                        disabled={authBusy}
                        className="rounded-[9px] bg-store-accent px-3.5 py-2 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        升级 Pro
                      </button>
                    )}
                  </div>

                  {!configured && (
                    <p className="mt-3 text-[11.5px] leading-relaxed text-store-red">
                      登录未配置：缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。
                    </p>
                  )}
                  <p className="mt-3.5 text-[11.5px] leading-relaxed text-store-text-3">
                    登录后可发布私有资源、跨设备同步已安装的技能 / MCP / 供应商 / 插件，并接收更新推送。
                  </p>
                </div>
              )}

              {tab === 'general' && (
                <div className="flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex items-center gap-3 rounded-xl border border-store-border bg-store-panel px-[18px] py-3.5 text-left hover:border-store-border-strong"
                  >
                    <span className="text-base">{theme === 'dark' ? '🌙' : '☀️'}</span>
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-store-text">主题</div>
                      <div className="mt-0.5 text-[11.5px] text-store-text-3">
                        当前：{theme === 'dark' ? '暗色' : '亮色'}模式
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-store-accent">切换</span>
                  </button>

                  <div className="flex items-center gap-3 rounded-xl border border-store-border bg-store-panel px-[18px] py-3.5">
                    <div
                      className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-xs font-bold text-white"
                      style={{ background: appMeta.color }}
                    >
                      {appMeta.letter}
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-store-text">默认目标应用</div>
                      <div className="mt-0.5 text-[11.5px] text-store-text-3">
                        {appMeta.label} · {appMeta.path}
                      </div>
                    </div>
                  </div>

                  <div className="relative flex items-center gap-3 rounded-xl border border-store-border bg-store-panel px-[18px] py-3.5">
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-store-text">界面语言</div>
                      <div className="mt-0.5 text-[11.5px] text-store-text-3">
                        Language · 目前支持中英文，更多语言即将上线
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLangMenuOpen((v) => !v)}
                      className="flex min-w-[118px] items-center gap-2 rounded-[9px] border border-store-border-strong bg-store-content px-3 py-2"
                    >
                      <span className="flex-1 text-[12.5px] font-semibold text-store-text">{currentLang.label}</span>
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M3 4.5L6 7.5L9 4.5"
                          stroke="var(--text-3)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    {langMenuOpen && (
                      <div className="absolute right-[18px] top-[62px] z-20 w-[190px] rounded-[11px] border border-store-border-strong bg-store-panel p-[5px] shadow-2xl">
                        {LANGUAGES.map((l) => (
                          <button
                            key={l.code}
                            type="button"
                            disabled={!l.enabled}
                            onClick={() => {
                              if (!l.enabled) return
                              setLangCode(l.code)
                              setLangMenuOpen(false)
                            }}
                            className={`flex w-full items-center gap-[9px] rounded-md px-2.5 py-2 text-left ${
                              l.enabled ? 'cursor-pointer' : 'cursor-not-allowed'
                            } ${l.code === langCode ? 'bg-store-panel-2' : ''}`}
                          >
                            <div className="flex-1">
                              <div
                                className={`text-[12.5px] font-semibold ${
                                  l.enabled ? 'text-store-text' : 'text-store-text-3'
                                }`}
                              >
                                {l.label}
                              </div>
                              <div className="mt-px text-[10px] text-store-text-3">{l.sub}</div>
                            </div>
                            {l.code === langCode && <Check size={13} className="text-store-accent" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'about' && (
                <div className="flex flex-col items-center justify-center gap-3 py-[30px]">
                  <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-store-accent">
                    <svg width="28" height="28" viewBox="0 0 18 18" fill="none">
                      <path d="M9 2l5.5 3v8L9 16l-5.5-3V5z" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
                      <path d="M9 2v14M3.5 5L9 8l5.5-3" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="text-[15px] font-bold text-store-text">Agent Store CLI</div>
                  <div className="font-mono text-xs text-store-text-3">v0.0.1 · registry client</div>
                  <div className="mt-1.5 flex items-center gap-4.5">
                    <button
                      type="button"
                      onClick={() => openExternal('https://agent-store.panghuli.tech/docs')}
                      className="cursor-pointer text-xs font-semibold text-store-accent"
                    >
                      文档
                    </button>
                    <button
                      type="button"
                      onClick={() => openExternal('https://github.com/ai-agent-store')}
                      className="cursor-pointer text-xs font-semibold text-store-accent"
                    >
                      GitHub
                    </button>
                    <button
                      type="button"
                      onClick={checkForUpdates}
                      className="cursor-pointer text-xs font-semibold text-store-accent"
                    >
                      检查更新
                    </button>
                    {updateMsg && <span className="text-xs text-store-text-3">{updateMsg}</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
