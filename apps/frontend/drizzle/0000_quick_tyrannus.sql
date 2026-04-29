-- Add uuid id column to document (nullable first so existing rows get a value)
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();--> statement-breakpoint

-- Align document with current schema
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "hide_toc" boolean DEFAULT true;--> statement-breakpoint

-- Align content_item with current schema
ALTER TABLE "content_item" ADD COLUMN IF NOT EXISTS "hide_toc" boolean DEFAULT true;--> statement-breakpoint

-- Populate id for any rows that don't have one yet
UPDATE "document" SET "id" = gen_random_uuid() WHERE "id" IS NULL;--> statement-breakpoint

-- Make id NOT NULL now that all rows have a value
ALTER TABLE "document" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint

-- Add the unique constraint on name (contentId) if not already present
ALTER TABLE "document" ADD CONSTRAINT "document_name_unique" UNIQUE ("name");--> statement-breakpoint

-- Drop the FK on document_version BEFORE dropping the PK it depends on
ALTER TABLE "document_version" DROP CONSTRAINT "document_version_content_id_document_name_fk";--> statement-breakpoint

-- Drop the old primary key on document (was "name")
ALTER TABLE "document" DROP CONSTRAINT "document_pkey";--> statement-breakpoint

-- Make id the new primary key
ALTER TABLE "document" ADD PRIMARY KEY ("id");--> statement-breakpoint

-- Drop the PK on document_version so we can drop the content_id column
ALTER TABLE "document_version" DROP CONSTRAINT "document_version_content_id_version_number_locale_status_pk";--> statement-breakpoint

-- Add a uuid column to hold the resolved document id
ALTER TABLE "document_version" ADD COLUMN "document_id" uuid;--> statement-breakpoint

-- Fill it from the document table
UPDATE "document_version" dv
SET "document_id" = d."id"
FROM "document" d
WHERE d."name" = dv."content_id";--> statement-breakpoint

-- Drop the old text content_id column
ALTER TABLE "document_version" DROP COLUMN "content_id";--> statement-breakpoint

-- Make document_id NOT NULL
ALTER TABLE "document_version" ALTER COLUMN "document_id" SET NOT NULL;--> statement-breakpoint

-- Add the FK constraint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_document_id_document_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE CASCADE;--> statement-breakpoint

-- Restore the primary key
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_document_id_version_number_locale_status_pk"
  PRIMARY KEY ("document_id", "version_number", "locale", "status");
