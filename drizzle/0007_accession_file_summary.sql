ALTER TYPE "public"."upstream_source" ADD VALUE 'jgad-file';--> statement-breakpoint
ALTER TYPE "public"."upstream_source" ADD VALUE 'archive-file';--> statement-breakpoint
CREATE TABLE "accession_file_summary" (
	"accession" text PRIMARY KEY NOT NULL,
	"byte_count" bigint NOT NULL,
	"formats" text[] NOT NULL,
	"source" text NOT NULL
);
