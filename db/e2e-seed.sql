-- E2E-only fixtures for scripts/local-e2e.sh (Test Co publisher + 3 items exercising
-- the config/script/file install-hook paths). Kept OUT of the main seed.sql so the
-- store catalog only shows real offerings. Applied by local-e2e.sh against the local
-- Supabase DB before the test. Idempotent (ON CONFLICT DO NOTHING).

INSERT INTO publishers (slug, name, avatar_url, tier)
VALUES ('test-co', 'Test Co', 'https://placehold.co/64x64', 'official')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO items (
  slug, name, description,
  category, version, publisher_id,
  compatible_with, tags, downloads, status,
  install_hook, metadata
) VALUES (
  'openai-provider-test',
  'OpenAI Provider Test',
  'Test provider for local E2E verification.',
  'provider', '1.0.0',
  (SELECT id FROM publishers WHERE slug = 'test-co'),
  ARRAY['claude','codex'], ARRAY['ai','test'], 1000, 'published',
  $${"steps":[{"type":"config","patch":{"apiKey":"","baseUrl":"https://api.openai.com/v1","model":"gpt-4o"}}]}$$,
  $${"configSchema":{"type":"object","required":["apiKey"],"properties":{"apiKey":{"type":"string","description":"OpenAI API Key"},"baseUrl":{"type":"string","description":"Base URL","default":"https://api.openai.com/v1"},"model":{"type":"string","description":"Model","default":"gpt-4o"}}},"supportedModels":["gpt-4o","gpt-4o-mini"]}$$
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO items (
  slug, name, description,
  category, version, publisher_id,
  compatible_with, tags, downloads, status,
  install_hook, metadata
) VALUES (
  'hello-skill',
  'Hello Skill',
  'Test skill for local E2E verification.',
  'skill', '1.0.0',
  (SELECT id FROM publishers WHERE slug = 'test-co'),
  ARRAY['claude'], ARRAY['test'], 500, 'published',
  $${"steps":[{"type":"script","command":"echo '# Hello Skill' > skill.md"}]}$$,
  $${}$$
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO items (
  slug, name, description,
  category, version, publisher_id,
  compatible_with, tags, downloads, status,
  install_hook, metadata
) VALUES (
  'fs-mcp-test',
  'FS MCP Test',
  'Test MCP server for local E2E verification.',
  'mcp', '1.0.0',
  (SELECT id FROM publishers WHERE slug = 'test-co'),
  ARRAY['claude'], ARRAY['mcp','test'], 200, 'published',
  $${"steps":[{"type":"script","command":"echo '#!/bin/sh' > server; echo 'echo hello' >> server; chmod +x server"},{"type":"config","patch":{"allowedPaths":["/tmp"]}}]}$$,
  $${"transport":"stdio","serverCommand":"./server","configSchema":{"type":"object","properties":{"allowedPaths":{"type":"array","description":"Allowed filesystem paths"}}}}$$
) ON CONFLICT (slug) DO NOTHING;
