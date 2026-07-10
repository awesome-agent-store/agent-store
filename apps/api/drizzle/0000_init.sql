CREATE TABLE "item_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_slug" text NOT NULL,
	"version" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_versions_item_slug_version_key" UNIQUE("item_slug","version")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"version" text NOT NULL,
	"publisher_id" uuid NOT NULL,
	"compatible_with" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"rating" numeric(3, 2) DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"install_hook" jsonb DEFAULT '{"steps": []}' NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_slug_unique" UNIQUE("slug"),
	CONSTRAINT "items_category_check" CHECK ("items"."category" IN ('provider', 'skill', 'mcp')),
	CONSTRAINT "items_status_check" CHECK ("items"."status" IN ('published', 'pending', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "processed_webhooks" (
	"delivery_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publishers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text NOT NULL,
	"tier" text NOT NULL,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publishers_slug_unique" UNIQUE("slug"),
	CONSTRAINT "publishers_tier_check" CHECK ("publishers"."tier" IN ('official', 'verified', 'community'))
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_slug" text NOT NULL,
	"user_id" uuid NOT NULL,
	"author_name" text,
	"rating" integer NOT NULL,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_item_slug_user_id_key" UNIQUE("item_slug","user_id"),
	CONSTRAINT "reviews_rating_check" CHECK ("reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"waffo_order_id" text NOT NULL,
	"buyer_email" text NOT NULL,
	"buyer_identity" text,
	"plan" text DEFAULT 'pro' NOT NULL,
	"status" text NOT NULL,
	"product_name" text,
	"waffo_store_id" text NOT NULL,
	"mode" text DEFAULT 'prod' NOT NULL,
	"event_timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_waffo_order_id_unique" UNIQUE("waffo_order_id"),
	CONSTRAINT "subscriptions_plan_check" CHECK ("subscriptions"."plan" IN ('pro', 'team')),
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" IN ('active', 'canceling', 'canceled', 'past_due', 'trialing')),
	CONSTRAINT "subscriptions_mode_check" CHECK ("subscriptions"."mode" IN ('test', 'prod'))
);
--> statement-breakpoint
ALTER TABLE "item_versions" ADD CONSTRAINT "item_versions_item_slug_items_slug_fk" FOREIGN KEY ("item_slug") REFERENCES "public"."items"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_item_slug_items_slug_fk" FOREIGN KEY ("item_slug") REFERENCES "public"."items"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_versions_item_slug_idx" ON "item_versions" USING btree ("item_slug");--> statement-breakpoint
CREATE INDEX "items_category_status_idx" ON "items" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "items_publisher_idx" ON "items" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "items_downloads_idx" ON "items" USING btree ("downloads" DESC NULLS LAST) WHERE status = 'published';--> statement-breakpoint
CREATE INDEX "items_created_idx" ON "items" USING btree ("created_at" DESC NULLS LAST) WHERE status = 'published';--> statement-breakpoint
CREATE INDEX "reviews_item_slug_idx" ON "reviews" USING btree ("item_slug");--> statement-breakpoint
CREATE INDEX "subscriptions_buyer_email_idx" ON "subscriptions" USING btree (lower("buyer_email"));--> statement-breakpoint
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();--> statement-breakpoint
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
