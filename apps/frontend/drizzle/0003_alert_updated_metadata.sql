ALTER TABLE "alert" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "updated_by" text NOT NULL DEFAULT 'system';--> statement-breakpoint
UPDATE "alert"
SET
	"updated_at" = "created_at",
	"updated_by" = "author_id";--> statement-breakpoint
ALTER TABLE "alert" ALTER COLUMN "updated_by" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
