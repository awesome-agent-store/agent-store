import type { AASEngine, JsonSchema } from '@as/types'
import type { ClosablePrompter, Prompter } from '../utils/prompt'
import { createReadlinePrompter } from '../utils/prompt'

interface SchemaProperty {
  type?: string
  description?: string
  default?: unknown
}

function sortSchemaProperties(
  properties: Record<string, SchemaProperty>,
  required: string[],
): Array<[string, SchemaProperty]> {
  const requiredSet = new Set(required)
  return Object.entries(properties).sort(([leftKey], [rightKey]) => {
    const leftRequired = requiredSet.has(leftKey)
    const rightRequired = requiredSet.has(rightKey)
    if (leftRequired !== rightRequired) {
      return leftRequired ? -1 : 1
    }
    return leftKey.localeCompare(rightKey)
  })
}

export async function runConfig(
  engine: AASEngine,
  args: string[],
  prompter: Prompter = createReadlinePrompter(),
  out: (s: string) => void = console.log
): Promise<void> {
  const slug = args[0]
  if (!slug) {
    out('Usage: aas config <slug>')
    return
  }

  const { schema, current } = await engine.getConfigSchema(slug)
  const properties = (schema as { properties?: Record<string, SchemaProperty>; required?: string[] }).properties ?? {}
  const required = (schema as { required?: string[] }).required ?? []

  out(`  ${slug} — configuration`)

  const values: Record<string, unknown> = { ...current }

  try {
    for (const [key, prop] of sortSchemaProperties(properties, required)) {
      const isRequired = required.includes(key)
      const label = prop.description ?? key
      const qualifier = isRequired ? 'required' : prop.default != null ? `optional, default: ${String(prop.default)}` : 'optional'
      const question = `  ${label} (${qualifier})\n  > `
      const answer = await prompter(question)
      if (answer === '' && prop.default != null) {
        values[key] = prop.default
      } else if (answer !== '') {
        values[key] = answer
      }
    }

    await engine.setConfig(slug, values)
    out('')
    out('  Saved. Run `aas sync` to apply changes.')
  } finally {
    ;(prompter as ClosablePrompter).close?.()
  }
}
