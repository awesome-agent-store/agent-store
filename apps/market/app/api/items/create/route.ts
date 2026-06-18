import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface CreateItemBody {
  slug: string
  name: string
  description: string
  category: 'provider' | 'skill' | 'mcp'
  version: string
  readmeUrl: string
  icon: string
  compatibleWith: string[]
  tags: string[]
}

export async function POST(request: NextRequest) {
  const supabase = createClient()

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateItemBody
  try {
    body = await request.json() as CreateItemBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate required fields
  const required: (keyof CreateItemBody)[] = ['slug', 'name', 'description', 'category', 'version', 'readmeUrl', 'icon']
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 422 })
    }
  }

  const validCategories = ['provider', 'skill', 'mcp']
  if (!validCategories.includes(body.category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 422 })
  }

  // Look up publisher by GitHub username
  const githubUsername = user.user_metadata['user_name'] as string | undefined
  if (!githubUsername) {
    return NextResponse.json({ error: 'GitHub username not found' }, { status: 422 })
  }

  const { data: publisher, error: pubError } = await supabase
    .from('publishers')
    .select('id')
    .eq('slug', githubUsername)
    .limit(1)
    .single()

  if (pubError || !publisher) {
    return NextResponse.json(
      { error: 'Publisher profile not found. Please create one first.' },
      { status: 422 }
    )
  }

  const { error: insertError } = await supabase.from('items').insert({
    slug: body.slug,
    name: body.name,
    description: body.description,
    category: body.category,
    version: body.version,
    readme_url: body.readmeUrl,
    icon: body.icon,
    publisher_id: (publisher as { id: string }).id,
    compatible_with: body.compatibleWith ?? [],
    tags: body.tags ?? [],
    install_hook: { steps: [] },
    metadata: {},
    status: 'pending',
  })

  if (insertError) {
    // slug uniqueness violation
    if ((insertError as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'An item with this slug already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
