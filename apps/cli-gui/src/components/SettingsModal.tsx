import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { Check, X, Github } from 'lucide-react'
import { useAppState, type AgentApp } from '../state/AppState'
import { useAuth, type AuthProviderName } from '../state/Auth'
import { useEntitlement } from '../state/Entitlement'
import { useI18n, LOCALES, LOCALE_NAMES } from '../i18n'
import { callRpc } from '../lib/rpc'
import { openExternal } from '../lib/openExternal'

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Google's brand mark (lucide has no Google icon); mirrors docs/ui design source.
function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 010-4.2V7.06H2.18a11 11 0 000 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 00-9.82 6.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  )
}

type Tab = 'account' | 'general' | 'about'

const APP_META: Record<AgentApp, { label: string; letter: string; color: string; path: string }> = {
  claude: { label: 'Claude Code', letter: 'C', color: '#d2785a', path: '~/.claude' },
  codex: { label: 'Codex', letter: 'X', color: '#10a37f', path: '~/.codex' },
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { agentApp, theme, toggleTheme } = useAppState()
  const { email, signedIn, accessToken, configured, signIn, signOut } = useAuth()
  const { entitlements } = useEntitlement()
  const { locale, setLocale, t } = useI18n()
  const [tab, setTab] = useState<Tab>('account')
  const [authBusy, setAuthBusy] = useState(false)
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)

  const TABS: { key: Tab; label: string }[] = [
    { key: 'account', label: t('settings.tabs.account') },
    { key: 'general', label: t('settings.tabs.general') },
    { key: 'about', label: t('settings.tabs.about') },
  ]

  async function checkForUpdates() {
    setUpdateMsg(t('settings.about.checking'))
    try {
      const updates = await callRpc<unknown[]>('checkUpdates')
      setUpdateMsg(updates.length > 0 ? `${updates.length} ${t('settings.about.updatesSuffix')}` : t('settings.about.upToDate'))
    } catch {
      setUpdateMsg(t('settings.about.checkFailed'))
    }
  }

  const appMeta = APP_META[agentApp]
  const isPro = entitlements.plan !== 'free'
  const avatarLetter = (email ?? 'A').charAt(0).toUpperCase()

  async function handleSignIn(provider: AuthProviderName) {
    if (authBusy) return
    setAuthBusy(true)
    try {
      await signIn(provider)
    } catch (err) {
      console.error('[auth] sign-in failed:', err)
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleSignOut() {
    if (authBusy) return
    setAuthBusy(true)
    try {
      await signOut()
    } catch (err) {
      console.error('[auth] sign-out failed:', err)
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
          <Dialog.Title className="sr-only">{t('settings.title')}</Dialog.Title>

          {/* left nav */}
          <div className="flex w-[168px] shrink-0 flex-col gap-[3px] border-r border-store-border bg-store-sidebar p-[18px_12px]">
            <div className="px-2 pb-3.5 text-sm font-bold text-store-text">{t('settings.title')}</div>
            {TABS.map((tb) => (
              <button
                key={tb.key}
                type="button"
                onClick={() => setTab(tb.key)}
                className={`rounded-lg px-[11px] py-[9px] text-left text-[13px] font-semibold ${
                  tab === tb.key ? 'bg-store-panel-2 text-store-text' : 'text-store-text-2'
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {/* content */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-[50px] shrink-0 items-center justify-end px-4">
              <Dialog.Close
                aria-label={t('settings.close')}
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
                      <div className="truncate text-[15px] font-bold text-store-text">{email ?? t('settings.account.notSignedIn')}</div>
                      <div className="mt-[3px] flex items-center gap-[5px]">
                        <span
                          className="h-[7px] w-[7px] rounded-full"
                          style={{ background: signedIn ? 'var(--green)' : 'var(--text-3)' }}
                        />
                        <span className="text-xs text-store-text-2">{signedIn ? t('settings.account.signedIn') : t('settings.account.disconnected')}</span>
                      </div>
                    </div>
                    {signedIn && (
                      <button
                        type="button"
                        onClick={handleSignOut}
                        disabled={!configured || authBusy}
                        className="flex items-center gap-1.5 rounded-[9px] border border-store-border-strong px-4 py-2 text-[12.5px] font-semibold text-store-text hover:border-store-accent hover:text-store-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t('settings.account.logout')}
                      </button>
                    )}
                  </div>

                  {!signedIn && (
                    <div className="mt-3 flex flex-col gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleSignIn('github')}
                        disabled={!configured || authBusy}
                        className="flex items-center justify-center gap-2 rounded-[9px] border border-store-border-strong px-4 py-2.5 text-[12.5px] font-semibold text-store-text hover:border-store-accent hover:text-store-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Github size={14} />
                        {t('settings.account.signInGithub')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSignIn('google')}
                        disabled={!configured || authBusy}
                        className="flex items-center justify-center gap-2 rounded-[9px] border border-store-border-strong px-4 py-2.5 text-[12.5px] font-semibold text-store-text hover:border-store-accent hover:text-store-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <GoogleIcon />
                        {t('settings.account.signInGoogle')}
                      </button>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between rounded-xl border border-store-border bg-store-panel px-[18px] py-3.5">
                    <div>
                      <div className="text-[13px] font-semibold text-store-text">{t('settings.account.plan')}</div>
                      <div className="mt-0.5 text-[11.5px] text-store-text-3">
                        {isPro ? t('settings.account.planPro') : t('settings.account.planFree')}
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
                        {t('settings.account.upgrade')}
                      </button>
                    )}
                  </div>

                  {!configured && (
                    <p className="mt-3 text-[11.5px] leading-relaxed text-store-red">
                      {t('settings.account.notConfigured')}
                    </p>
                  )}
                  <p className="mt-3.5 text-[11.5px] leading-relaxed text-store-text-3">
                    {t('settings.account.hint')}
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
                      <div className="text-[13px] font-semibold text-store-text">{t('settings.general.theme')}</div>
                      <div className="mt-0.5 text-[11.5px] text-store-text-3">
                        {t('common.currentPrefix')}{theme === 'dark' ? t('settings.general.dark') : t('settings.general.light')}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-store-accent">{t('settings.general.toggle')}</span>
                  </button>

                  <div className="flex items-center gap-3 rounded-xl border border-store-border bg-store-panel px-[18px] py-3.5">
                    <div
                      className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-xs font-bold text-white"
                      style={{ background: appMeta.color }}
                    >
                      {appMeta.letter}
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-store-text">{t('settings.general.targetApp')}</div>
                      <div className="mt-0.5 text-[11.5px] text-store-text-3">
                        {appMeta.label} · {appMeta.path}
                      </div>
                    </div>
                  </div>

                  <div className="relative flex items-center gap-3 rounded-xl border border-store-border bg-store-panel px-[18px] py-3.5">
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-store-text">{t('settings.general.language')}</div>
                      <div className="mt-0.5 text-[11.5px] text-store-text-3">{t('settings.general.languageSub')}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLangMenuOpen((v) => !v)}
                      className="flex min-w-[118px] items-center gap-2 rounded-[9px] border border-store-border-strong bg-store-content px-3 py-2"
                    >
                      <span className="flex-1 text-[12.5px] font-semibold text-store-text">{LOCALE_NAMES[locale]}</span>
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
                        {LOCALES.map((code) => (
                          <button
                            key={code}
                            type="button"
                            onClick={() => {
                              setLocale(code)
                              setLangMenuOpen(false)
                            }}
                            className={`flex w-full cursor-pointer items-center gap-[9px] rounded-md px-2.5 py-2 text-left ${
                              code === locale ? 'bg-store-panel-2' : ''
                            }`}
                          >
                            <span className="flex-1 text-[12.5px] font-semibold text-store-text">{LOCALE_NAMES[code]}</span>
                            {code === locale && <Check size={13} className="text-store-accent" />}
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
                  <div className="font-mono text-xs text-store-text-3">v0.0.1 · {t('settings.about.subtitle')}</div>
                  <div className="mt-1.5 flex items-center gap-4.5">
                    <button
                      type="button"
                      onClick={() => openExternal('https://agent-store.panghuli.tech/docs')}
                      className="cursor-pointer text-xs font-semibold text-store-accent"
                    >
                      {t('settings.about.docs')}
                    </button>
                    <button
                      type="button"
                      onClick={() => openExternal('https://github.com/ai-agent-store')}
                      className="cursor-pointer text-xs font-semibold text-store-accent"
                    >
                      {t('settings.about.github')}
                    </button>
                    <button
                      type="button"
                      onClick={checkForUpdates}
                      className="cursor-pointer text-xs font-semibold text-store-accent"
                    >
                      {t('settings.about.checkUpdates')}
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
