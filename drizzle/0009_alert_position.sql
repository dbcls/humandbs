ALTER TABLE "alert" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "alert" AS "a" SET "position" = "o"."n" FROM (SELECT "id", (row_number() OVER (ORDER BY "created_at", "id") - 1)::int AS "n" FROM "alert") AS "o" WHERE "a"."id" = "o"."id";
