-- supabase/seed.sql
-- Local E2E test data. Applied by: supabase db reset (after migrations).

INSERT INTO publishers (slug, name, avatar_url, tier)
VALUES ('test-co', 'Test Co', 'https://placehold.co/64x64', 'official');

-- Provider: tests config step + claude/codex sync
INSERT INTO items (
  slug, name, description, readme_url, icon,
  category, version, publisher_id,
  compatible_with, tags, downloads, status,
  install_hook, metadata
) VALUES (
  'openai-provider-test',
  'OpenAI Provider Test',
  'Test provider for local E2E verification.',
  'https://example.com/readme',
  'https://placehold.co/64x64',
  'provider', '1.0.0',
  (SELECT id FROM publishers WHERE slug = 'test-co'),
  ARRAY['claude','codex'], ARRAY['ai','test'], 1000, 'published',
  $${"steps":[{"type":"config","patch":{"apiKey":"","model":"gpt-4o"}}]}$$,
  $${"configSchema":{"type":"object","required":["apiKey"],"properties":{"apiKey":{"type":"string","description":"OpenAI API Key"},"model":{"type":"string","description":"Model","default":"gpt-4o"}}},"supportedModels":["gpt-4o","gpt-4o-mini"]}$$
);

-- Skill: tests script step + skill.md copy to claude skills dir
INSERT INTO items (
  slug, name, description, readme_url, icon,
  category, version, publisher_id,
  compatible_with, tags, downloads, status,
  install_hook, metadata
) VALUES (
  'hello-skill',
  'Hello Skill',
  'Test skill for local E2E verification.',
  'https://example.com/readme',
  'https://placehold.co/64x64',
  'skill', '1.0.0',
  (SELECT id FROM publishers WHERE slug = 'test-co'),
  ARRAY['claude'], ARRAY['test'], 500, 'published',
  $${"steps":[{"type":"script","command":"echo '# Hello Skill' > skill.md"}]}$$,
  $${}$$
);

-- MCP: tests script step + binary chmod + mcpServers sync
INSERT INTO items (
  slug, name, description, readme_url, icon,
  category, version, publisher_id,
  compatible_with, tags, downloads, status,
  install_hook, metadata
) VALUES (
  'fs-mcp-test',
  'FS MCP Test',
  'Test MCP server for local E2E verification.',
  'https://example.com/readme',
  'https://placehold.co/64x64',
  'mcp', '1.0.0',
  (SELECT id FROM publishers WHERE slug = 'test-co'),
  ARRAY['claude'], ARRAY['mcp','test'], 200, 'published',
  $${"steps":[{"type":"script","command":"echo '#!/bin/sh' > server; echo 'echo hello' >> server; chmod +x server"},{"type":"config","patch":{"allowedPaths":["/tmp"]}}]}$$,
  $${"transport":"stdio","serverCommand":"./server","configSchema":{"type":"object","properties":{"allowedPaths":{"type":"array","description":"Allowed filesystem paths"}}}}$$
);
