ALTER TABLE "document_version" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "document_version" ADD COLUMN "publisher_id" text;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_publisher_id_user_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;