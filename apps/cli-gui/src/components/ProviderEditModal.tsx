import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import type { ItemDetail, ModelPricing, ToolTarget } from '@aas/types'
import { X } from 'lucide-react'
import { callRpc } from '../lib/rpc'

interface ProviderEditModalProps {
  slug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface EditValues {
  apiKey: string
  baseUrl: string
  homepage: string
  endpoint: string
  upstreamProtocol: string
  authType: 'bearer' | 'anthropic' | 'custom'
  customHeader: string
  level: string
  whitelist: string[]
  modelMapping: Array<{ from: string; to: string }>
  healthCheck: boolean
  pricingUrl: string
  pricing: Record<string, ModelPricing>
}

const UPSTREAM_PROTOCOLS = ['自动检测', 'openai_chat', 'claude_messages', 'codex_responses']
const LEVELS = Array.from({ length: 10 }, (_, i) => String(i + 1))

function toEditValues(current: Record<string, unknown> | undefined): EditValues {
  const c = current ?? {}
  const rawAuthType = c['authType']
  const authType: EditValues['authType'] =
    rawAuthType === 'anthropic' ? 'anthropic' : rawAuthType && typeof rawAuthType === 'object' ? 'custom' : 'bearer'
  const customHeader =
    rawAuthType && typeof rawAuthType === 'object' ? String((rawAuthType as Record<string, unknown>)['header'] ?? '') : ''
  const mapping = c['modelMapping']
  const modelMapping =
    mapping && typeof mapping === 'object'
      ? Object.entries(mapping as Record<string, unknown>).map(([from, to]) => ({ from, to: String(to) }))
      : []
  const whitelist = Array.isArray(c['whitelist']) ? (c['whitelist'] as string[]) : []
  const pricing = c['pricing'] && typeof c['pricing'] === 'object' ? (c['pricing'] as Record<string, ModelPricing>) : {}

  return {
    apiKey: String(c['apiKey'] ?? ''),
    baseUrl: String(c['baseUrl'] ?? ''),
    homepage: String(c['homepage'] ?? ''),
    endpoint: String(c['endpoint'] ?? ''),
    upstreamProtocol: String(c['upstreamProtocol'] ?? '自动检测'),
    authType,
    customHeader,
    level: String(c['level'] ?? '1'),
    whitelist,
    modelMapping,
    healthCheck: c['healthCheck'] === true,
    pricingUrl: String(c['pricingUrl'] ?? ''),
    pricing,
  }
}

function toConfigPayload(values: EditValues): Record<string, unknown> {
  const authType =
    values.authType === 'custom' ? { header: values.customHeader } : values.authType

  return {
    apiKey: values.apiKey,
    baseUrl: values.baseUrl,
    homepage: values.homepage,
    endpoint: values.endpoint,
    upstreamProtocol: values.upstreamProtocol,
    authType,
    level: Number(values.level),
    whitelist: values.whitelist,
    modelMapping: Object.fromEntries(values.modelMapping.map((m) => [m.from, m.to])),
    healthCheck: values.healthCheck,
    pricingUrl: values.pricingUrl,
    pricing: values.pricing,
  }
}

export function ProviderEditModal({ slug, open, onOpenChange }: ProviderEditModalProps) {
  const [targets, setTargets] = useState<Partial<Record<ToolTarget, boolean>>>({})
  const [values, setValues] = useState<EditValues>(toEditValues(undefined))
  const [moreOpen, setMoreOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [wlDraft, setWlDraft] = useState('')
  const [mapFromDraft, setMapFromDraft] = useState('')
  const [mapToDraft, setMapToDraft] = useState('')

  useEffect(() => {
    if (!open) return
    callRpc<ItemDetail>('info', [slug]).then((detail) => {
      setTargets(detail.enabledFor)
      setValues(toEditValues(detail.currentConfig))
    })
  }, [open, slug])

  async function persist(next: EditValues) {
    setValues(next)
    await callRpc('setConfig', [slug, toConfigPayload(next)])
  }

  async function toggleTarget(target: ToolTarget) {
    const isEnabled = !!targets[target]
    await callRpc(isEnabled ? 'disable' : 'enable', [slug, target])
    setTargets((prev) => ({ ...prev, [target]: !isEnabled }))
  }

  function addWhitelist() {
    const trimmed = wlDraft.trim()
    if (!trimmed) return
    void persist({ ...values, whitelist: [...values.whitelist, trimmed] })
    setWlDraft('')
  }

  function removeWhitelist(index: number) {
    void persist({ ...values, whitelist: values.whitelist.filter((_, i) => i !== index) })
  }

  function addMapping() {
    if (!mapFromDraft.trim() || !mapToDraft.trim()) return
    void persist({ ...values, modelMapping: [...values.modelMapping, { from: mapFromDraft, to: mapToDraft }] })
    setMapFromDraft('')
    setMapToDraft('')
  }

  function removeMapping(index: number) {
    void persist({ ...values, modelMapping: values.modelMapping.filter((_, i) => i !== index) })
  }

  async function parsePricing() {
    const pricing = await callRpc<Record<string, ModelPricing>>('parsePricingFromUrl', [values.pricingUrl])
    setValues((prev) => ({ ...prev, pricing }))
  }

  function updatePricingRow(model: string, field: keyof ModelPricing, raw: string) {
    const num = Number(raw)
    void persist({
      ...values,
      pricing: { ...values.pricing, [model]: { ...values.pricing[model], [field]: Number.isNaN(num) ? 0 : num } },
    })
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-store-border bg-store-content p-6">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-store-text">编辑 {slug}</Dialog.Title>
            <Dialog.Close aria-label="关闭" className="text-store-text-2 hover:text-store-text">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-store-text-2">适用客户端</label>
              <div className="flex gap-2">
                {(['claude', 'codex'] as const).map((target) => (
                  <button
                    key={target}
                    type="button"
                    aria-label={target === 'claude' ? 'Claude Code' : 'Codex'}
                    aria-pressed={!!targets[target]}
                    onClick={() => toggleTarget(target)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                      targets[target] ? 'border-store-accent bg-store-accent-soft text-store-accent' : 'border-store-border text-store-text-2'
                    }`}
                  >
                    {target === 'claude' ? 'Claude Code' : 'Codex'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="provider-apiKey" className="mb-1 block text-xs font-medium text-store-text-2">
                API 密钥
              </label>
              <input
                id="provider-apiKey"
                value={values.apiKey}
                onChange={(e) => persist({ ...values, apiKey: e.target.value })}
                className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
              />
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-store-border">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-store-text"
            >
              <span aria-hidden="true">{moreOpen ? '▾' : '▸'}</span> <span>更多设置</span>
            </button>
            {moreOpen && (
              <div className="flex flex-col gap-3 border-t border-store-border p-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">API 地址</label>
                  <input
                    value={values.baseUrl}
                    onChange={(e) => persist({ ...values, baseUrl: e.target.value })}
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">官网地址</label>
                  <input
                    value={values.homepage}
                    onChange={(e) => persist({ ...values, homepage: e.target.value })}
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">API 端点</label>
                  <input
                    value={values.endpoint}
                    onChange={(e) => persist({ ...values, endpoint: e.target.value })}
                    placeholder="留空使用默认，如 /v1/chat/completions"
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">上游协议</label>
                  <select
                    value={values.upstreamProtocol}
                    onChange={(e) => persist({ ...values, upstreamProtocol: e.target.value })}
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  >
                    {UPSTREAM_PROTOCOLS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">认证方式</label>
                  <select
                    value={values.authType}
                    onChange={(e) => persist({ ...values, authType: e.target.value as EditValues['authType'] })}
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  >
                    <option value="bearer">Bearer</option>
                    <option value="anthropic">X-API-Key</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
                {values.authType === 'custom' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-store-text-2">自定义 Header 名称</label>
                    <input
                      value={values.customHeader}
                      onChange={(e) => persist({ ...values, customHeader: e.target.value })}
                      className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">优先级分组</label>
                  <select
                    value={values.level}
                    onChange={(e) => persist({ ...values, level: e.target.value })}
                    className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-store-text-2">定价页面链接</label>
                  <div className="flex gap-2">
                    <input
                      value={values.pricingUrl}
                      onChange={(e) => persist({ ...values, pricingUrl: e.target.value })}
                      placeholder="https://docs.example.com/pricing"
                      className="flex-1 rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                    />
                    <button
                      type="button"
                      onClick={parsePricing}
                      className="rounded-lg border border-store-border-strong px-3 py-2 text-xs font-medium text-store-text"
                    >
                      解析定价
                    </button>
                  </div>
                  {Object.keys(values.pricing).length > 0 && (
                    <div className="mt-2 flex flex-col gap-2">
                      <p className="text-[10px] text-store-amber">示例数据，请核对后保存</p>
                      {Object.entries(values.pricing).map(([model, rate]) => (
                        <div key={model} className="flex items-center gap-2 text-xs">
                          <input value={model} disabled className="w-32 rounded-md border border-store-border bg-store-panel-2 px-2 py-1 text-store-text-2" />
                          <input
                            value={rate.input}
                            onChange={(e) => updatePricingRow(model, 'input', e.target.value)}
                            className="w-16 rounded-md border border-store-border bg-store-panel px-2 py-1 text-store-text"
                          />
                          <input
                            value={rate.output}
                            onChange={(e) => updatePricingRow(model, 'output', e.target.value)}
                            className="w-16 rounded-md border border-store-border bg-store-panel px-2 py-1 text-store-text"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 rounded-lg border border-store-border">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-store-text"
            >
              <span aria-hidden="true">{advancedOpen ? '▾' : '▸'}</span> <span>高级设置</span>
            </button>
            {advancedOpen && (
              <div className="flex flex-col gap-4 border-t border-store-border p-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-store-text-2">模型白名单</p>
                  <div className="flex gap-2">
                    <input
                      value={wlDraft}
                      onChange={(e) => setWlDraft(e.target.value)}
                      placeholder="输入模型名称，如 claude-*"
                      className="flex-1 rounded-lg border border-store-border bg-store-panel px-3 py-2 text-xs text-store-text"
                    />
                    <button type="button" onClick={addWhitelist} className="rounded-lg border border-store-border-strong px-3 py-2 text-xs font-medium text-store-text">
                      添加
                    </button>
                  </div>
                  {values.whitelist.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {values.whitelist.map((w, i) => (
                        <span key={`${w}-${i}`} className="flex items-center gap-1 rounded-md bg-store-panel-2 px-2 py-1 font-mono text-xs text-store-text">
                          {w}
                          <button type="button" onClick={() => removeWhitelist(i)} className="text-store-text-3 hover:text-store-red">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium text-store-text-2">模型映射</p>
                  <div className="flex items-center gap-2">
                    <input
                      value={mapFromDraft}
                      onChange={(e) => setMapFromDraft(e.target.value)}
                      placeholder="CLI 模型（如 claude-*）"
                      className="min-w-0 flex-1 rounded-lg border border-store-border bg-store-panel px-3 py-2 text-xs text-store-text"
                    />
                    <span className="text-store-text-3">→</span>
                    <input
                      value={mapToDraft}
                      onChange={(e) => setMapToDraft(e.target.value)}
                      placeholder="供应商模型（如 kimi-k2）"
                      className="min-w-0 flex-1 rounded-lg border border-store-border bg-store-panel px-3 py-2 text-xs text-store-text"
                    />
                    <button type="button" onClick={addMapping} className="rounded-lg border border-store-border-strong px-3 py-2 text-xs font-medium text-store-text">
                      添加映射
                    </button>
                  </div>
                  {values.modelMapping.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {values.modelMapping.map((m, i) => (
                        <div key={`${m.from}-${i}`} className="flex items-center gap-2 text-xs text-store-text">
                          <span className="font-mono">{m.from} → {m.to}</span>
                          <button type="button" onClick={() => removeMapping(i)} className="text-store-text-3 hover:text-store-red">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-store-text">可用性监控</p>
                    <p className="text-[10px] text-store-text-3">启用后会定期健康检查，监控此供应商的可用性</p>
                  </div>
                  <button
                    type="button"
                    aria-label="可用性监控"
                    aria-pressed={values.healthCheck}
                    onClick={() => persist({ ...values, healthCheck: !values.healthCheck })}
                    className={`h-6 w-11 rounded-full p-0.5 ${values.healthCheck ? 'bg-store-accent' : 'bg-store-border-strong'}`}
                  >
                    <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${values.healthCheck ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
