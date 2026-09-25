ALTER TABLE "research_draft" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "research_draft" AS "d" SET "name" = 'v' || (COALESCE((SELECT max("v"."number") FROM "research_version" AS "v" WHERE "v"."research_id" = "d"."research_id"), 0) + 1) || ' 予定' WHERE "d"."replaces_version_id" IS NULL;--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "display_from" timestamp;--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "display_until" timestamp;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_display_period_ordered" CHECK ("alert"."display_from" IS NULL OR "alert"."display_until" IS NULL OR "alert"."display_from" < "alert"."display_until");