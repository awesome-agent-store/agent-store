-- Publishers table
CREATE TABLE publishers (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text    UNIQUE NOT NULL,
  name        text    NOT NULL,
  avatar_url  text    NOT NULL,
  tier        text    NOT NULL CHECK (tier IN ('official', 'verified', 'community')),
  bio         text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Items table
-- metadata JSONB holds category-specific fields:
--   provider: { configSchema, supportedModels }
--   skill:    { contentUrl }
--   mcp:      { transport, serverCommand, configSchema }
CREATE TABLE items (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text    UNIQUE NOT NULL,
  name            text    NOT NULL,
  description     text    NOT NULL,
  readme_url      text    NOT NULL,
  icon            text    NOT NULL,
  category        text    NOT NULL CHECK (category IN ('provider', 'skill', 'mcp')),
  version         text    NOT NULL,
  publisher_id    uuid    NOT NULL REFERENCES publishers(id) ON DELETE RESTRICT,
  compatible_with text[]  NOT NULL DEFAULT '{}',
  tags            text[]  NOT NULL DEFAULT '{}',
  downloads       integer NOT NULL DEFAULT 0,
  rating          numeric(3,2) NOT NULL DEFAULT 0,
  status          text    NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('published', 'pending', 'rejected')),
  install_hook    jsonb   NOT NULL DEFAULT '{"steps": []}',
  metadata        jsonb   NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes for common query patterns
CREATE INDEX items_category_status_idx ON items(category, status);
CREATE INDEX items_publisher_idx       ON items(publisher_id);
CREATE INDEX items_downloads_idx       ON items(downloads DESC) WHERE status = 'published';
CREATE INDEX items_created_idx         ON items(created_at DESC) WHERE status = 'published';

-- Row Level Security
ALTER TABLE publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE items      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published items are readable by all"
  ON items FOR SELECT USING (status = 'published');

CREATE POLICY "Publishers are readable by all"
  ON publishers FOR SELECT USING (true);

-- Grant SELECT to anon and authenticated roles (required for PostgREST)
GRANT SELECT ON publishers TO anon, authenticated;
GRANT SELECT ON items      TO anon, authenticated;
