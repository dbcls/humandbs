CREATE TABLE "moldata_key_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moldata_key_catalog_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"english" text NOT NULL,
	"japanese" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ALTER COLUMN "hide_from_nav" SET DEFAULT true;--> statement-breakpoint
CREATE INDEX "moldata_key_catalog_entry_position_idx" ON "moldata_key_catalog_entry" USING btree ("position");--> statement-breakpoint
CREATE UNIQUE INDEX "moldata_key_catalog_entry_english_lower_unique" ON "moldata_key_catalog_entry" USING btree (lower("english"));
