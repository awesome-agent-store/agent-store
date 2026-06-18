'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface FormState {
  slug: string
  name: string
  description: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  readmeUrl: string
  icon: string
  compatibleWith: string[]
  tags: string
}

export default function SubmitPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [form, setForm] = useState<FormState>({
    slug: '',
    name: '',
    description: '',
    category: 'provider',
    version: '1.0.0',
    readmeUrl: '',
    icon: '',
    compatibleWith: ['claude'],
    tags: '',
  })

  function update(key: keyof FormState, value: string | string[]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const payload = {
      ...form,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }

    const res = await fetch('/api/items/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const body = await res.json() as { error?: string }

    if (!res.ok) {
      setError(body.error ?? 'Submission failed')
      setPending(false)
      return
    }

    setPending(false)
    router.push('/dashboard')
  }

  const inputClass =
    'w-full rounded-lg border border-ray-border bg-ray-surface-1 px-3 py-2 text-sm text-ray-fg placeholder:text-ray-fg-muted focus:border-ray-border-hover focus:outline-none'
  const labelClass = 'block text-xs font-medium text-ray-fg-secondary mb-1'

  return (
    <main className="py-8">
      <h1 className="mb-6 text-2xl font-semibold text-ray-fg">Submit item</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-xl">
        <div>
          <label htmlFor="field-slug" className={labelClass}>Slug <span className="text-ray-danger">*</span></label>
          <input id="field-slug" required className={inputClass} placeholder="openai-provider"
            value={form.slug} onChange={(e) => update('slug', e.target.value)} />
        </div>

        <div>
          <label htmlFor="field-name" className={labelClass}>Name <span className="text-ray-danger">*</span></label>
          <input id="field-name" required className={inputClass} placeholder="OpenAI Provider"
            value={form.name} onChange={(e) => update('name', e.target.value)} />
        </div>

        <div>
          <label htmlFor="field-description" className={labelClass}>Description <span className="text-ray-danger">*</span></label>
          <textarea id="field-description" required rows={2} className={inputClass} placeholder="Short description (1-2 sentences)"
            value={form.description} onChange={(e) => update('description', e.target.value)} />
        </div>

        <div>
          <label htmlFor="field-category" className={labelClass}>Category <span className="text-ray-danger">*</span></label>
          <select id="field-category" required className={inputClass}
            value={form.category} onChange={(e) => update('category', e.target.value as FormState['category'])}>
            <option value="provider">Provider</option>
            <option value="skill">Skill</option>
            <option value="mcp">MCP</option>
          </select>
        </div>

        <div>
          <label htmlFor="field-version" className={labelClass}>Version <span className="text-ray-danger">*</span></label>
          <input id="field-version" required className={inputClass} placeholder="1.0.0"
            value={form.version} onChange={(e) => update('version', e.target.value)} />
        </div>

        <div>
          <label htmlFor="field-readmeUrl" className={labelClass}>README URL <span className="text-ray-danger">*</span></label>
          <input id="field-readmeUrl" required type="url" className={inputClass} placeholder="https://..."
            value={form.readmeUrl} onChange={(e) => update('readmeUrl', e.target.value)} />
        </div>

        <div>
          <label htmlFor="field-icon" className={labelClass}>Icon URL <span className="text-ray-danger">*</span></label>
          <input id="field-icon" required type="url" className={inputClass} placeholder="https://..."
            value={form.icon} onChange={(e) => update('icon', e.target.value)} />
        </div>

        <div>
          <label htmlFor="field-tags" className={labelClass}>Tags (comma-separated)</label>
          <input id="field-tags" className={inputClass} placeholder="ai, openai, gpt"
            value={form.tags} onChange={(e) => update('tags', e.target.value)} />
        </div>

        {error && (
          <p className="rounded-lg border border-ray-danger/30 bg-ray-danger/10 px-3 py-2 text-sm text-ray-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-ray-accent px-4 py-2 text-sm font-medium text-ray-surface-0 hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Submitting…' : 'Submit for review'}
        </button>
      </form>
    </main>
  )
}
