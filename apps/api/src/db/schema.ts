import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

// Drizzle schema — the source of truth for the Neon Postgres database.
// Migrations are generated into ./drizzle and applied with `drizzle-kit migrate`.
//
// Scope: tables, columns, types, defaults, checks, foreign keys, unique
// constraints, and indexes — the structural schema. Deliberately NOT reproduced
// here:
//   • RLS policies + anon/authenticated GRANTs — Supabase/PostgREST specific;
//     authorization moves to the API layer (the Worker is the only DB client).
//   • The updated_at trigger + update_updated_at() function — kept for DB-level
//     parity but expressed in raw SQL, appended to the generated migration
//     (drizzle-kit does not model triggers). See drizzle/*_*.sql.

export const publishers = pgTable('publishers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url').notNull(),
  tier: text('tier').notNull(),
  bio: text('bio'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('publishers_tier_check', sql`${t.tier} IN ('official', 'verified', 'community')`),
])

export const items = pgTable('items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  version: text('version').notNull(),
  publisherId: uuid('publisher_id')
    .notNull()
    .references(() => publishers.id, { onDelete: 'restrict' }),
  compatibleWith: text('compatible_with').array().notNull().default(sql`'{}'`),
  tags: text('tags').array().notNull().default(sql`'{}'`),
  downloads: integer('downloads').notNull().default(0),
  rating: numeric('rating', { precision: 3, scale: 2 }).notNull().default(sql`0`),
  reviewCount: integer('review_count').notNull().default(0),
  status: text('status').notNull().default('pending'),
  installHook: jsonb('install_hook').notNull().default(sql`'{"steps": []}'`),
  metadata: jsonb('metadata').notNull().default(sql`'{}'`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('items_category_check', sql`${t.category} IN ('provider', 'skill', 'mcp')`),
  check('items_status_check', sql`${t.status} IN ('published', 'pending', 'rejected')`),
  index('items_category_status_idx').on(t.category, t.status),
  index('items_publisher_idx').on(t.publisherId),
  index('items_downloads_idx').on(t.downloads.desc()).where(sql`status = 'published'`),
  index('items_created_idx').on(t.createdAt.desc()).where(sql`status = 'published'`),
])

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  waffoOrderId: text('waffo_order_id').notNull().unique(),
  buyerEmail: text('buyer_email').notNull(),
  buyerIdentity: text('buyer_identity'),
  plan: text('plan').notNull().default('pro'),
  status: text('status').notNull(),
  productName: text('product_name'),
  waffoStoreId: text('waffo_store_id').notNull(),
  mode: text('mode').notNull().default('prod'),
  eventTimestamp: timestamp('event_timestamp', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('subscriptions_plan_check', sql`${t.plan} IN ('pro', 'team')`),
  check(
    'subscriptions_status_check',
    sql`${t.status} IN ('active', 'canceling', 'canceled', 'past_due', 'trialing')`,
  ),
  check('subscriptions_mode_check', sql`${t.mode} IN ('test', 'prod')`),
  index('subscriptions_buyer_email_idx').on(sql`lower(${t.buyerEmail})`),
])

export const processedWebhooks = pgTable('processed_webhooks', {
  deliveryId: text('delivery_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
})

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  itemSlug: text('item_slug')
    .notNull()
    .references(() => items.slug, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  authorName: text('author_name'),
  rating: integer('rating').notNull(),
  body: text('body'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('reviews_rating_check', sql`${t.rating} BETWEEN 1 AND 5`),
  unique('reviews_item_slug_user_id_key').on(t.itemSlug, t.userId),
  index('reviews_item_slug_idx').on(t.itemSlug),
])

export const itemVersions = pgTable('item_versions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  itemSlug: text('item_slug')
    .notNull()
    .references(() => items.slug, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('item_versions_item_slug_version_key').on(t.itemSlug, t.version),
  index('item_versions_item_slug_idx').on(t.itemSlug),
])
