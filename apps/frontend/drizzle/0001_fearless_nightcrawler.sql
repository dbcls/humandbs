CREATE TABLE "seed_history" (
	"seed_name" text PRIMARY KEY NOT NULL,
	"executed_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_version_translations" DROP CONSTRAINT "document_version_translations_document_version_id_document_id_fk";
--> statement-breakpoint
ALTER TABLE "document_version_translations" ALTER COLUMN "translated_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE "public"."role";--> statement-breakpoint
ALTER TABLE "document_version_translations" ADD CONSTRAINT "document_version_translations_document_version_id_document_version_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_version"("id") ON DELETE cascade ON UPDATE no action;