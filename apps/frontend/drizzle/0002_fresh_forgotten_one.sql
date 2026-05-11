CREATE TABLE "alert_translation" (
	"alert_id" uuid NOT NULL,
	"content" text NOT NULL,
	"locale" text NOT NULL,
	CONSTRAINT "alert_translation_unique" UNIQUE("alert_id","locale")
);
--> statement-breakpoint
ALTER TABLE "alert" DROP CONSTRAINT "alert_news_id_key";--> statement-breakpoint
ALTER TABLE "alert" DROP CONSTRAINT "alert_news_id_news_item_id_fk";
--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "enabled" boolean;--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN "author_id" text NOT NULL DEFAULT 'system';--> statement-breakpoint
ALTER TABLE "alert" ALTER COLUMN "author_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "alert_translation" ADD CONSTRAINT "alert_translation_alert_id_alert_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alert"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" DROP COLUMN "news_id";