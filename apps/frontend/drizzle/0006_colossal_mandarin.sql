ALTER TABLE "document_version" RENAME COLUMN "translated_by" TO "author_id";--> statement-breakpoint
ALTER TABLE "document_version" DROP CONSTRAINT "document_version_translated_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;