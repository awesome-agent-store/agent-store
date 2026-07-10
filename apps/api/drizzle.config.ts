import { defineConfig } from 'drizzle-kit'

// drizzle-kit reads DATABASE_URL from apps/api/.dev.vars (Workers-style local
// secrets). Run migrations with:  bun --env-file=.dev.vars drizzle-kit migrate
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  casing: 'snake_case',
  strict: true,
  verbose: true,
})
