import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useState } from 'react'
import type { JsonSchema } from '@aas/types'
import { X } from 'lucide-react'
import { callRpc } from '../lib/rpc'

interface ProviderEditModalProps {
  slug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SchemaProperty {
  type?: string
  description?: string
  default?: unknown
}

export function ProviderEditModal({ slug, open, onOpenChange }: ProviderEditModalProps) {
  const [properties, setProperties] = useState<Record<string, SchemaProperty>>({})
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    callRpc<{ schema: JsonSchema; current: Record<string, unknown> }>('getConfigSchema', [slug]).then(
      ({ schema, current }) => {
        const props = (schema as { properties?: Record<string, SchemaProperty> }).properties ?? {}
        setProperties(props)
        const initial: Record<string, string> = {}
        for (const [key, prop] of Object.entries(props)) {
          initial[key] = String(current[key] ?? prop.default ?? '')
        }
        setValues(initial)
      }
    )
  }, [open, slug])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    await callRpc('setConfig', [slug, values])
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-store-border bg-store-content p-6">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-store-text">编辑 {slug}</Dialog.Title>
            <Dialog.Close aria-label="关闭" className="text-store-text-2 hover:text-store-text">
              <X size={18} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSave} className="flex flex-col gap-3">
            {Object.entries(properties).map(([key, prop]) => (
              <div key={key}>
                <label htmlFor={`provider-${key}`} className="mb-1 block text-xs font-medium text-store-text-2">
                  {prop.description ?? key}
                </label>
                <input
                  id={`provider-${key}`}
                  value={values[key] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full rounded-lg border border-store-border bg-store-panel px-3 py-2 text-sm text-store-text"
                />
              </div>
            ))}

            <button
              type="submit"
              className="mt-2 rounded-lg bg-store-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              保存
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
