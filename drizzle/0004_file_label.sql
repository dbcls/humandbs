ALTER TYPE "public"."event_action" ADD VALUE 'edit-file-label' BEFORE 'publish-site-content';--> statement-breakpoint
CREATE TABLE "file_label" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"research_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"label_ja" text DEFAULT '' NOT NULL,
	"label_en" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_label_file_unique" UNIQUE("research_id","file_name"),
	CONSTRAINT "file_label_has_text" CHECK ("file_label"."label_ja" <> '' OR "file_label"."label_en" <> '')
);
--> statement-breakpoint
ALTER TABLE "file_label" ADD CONSTRAINT "file_label_research_id_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."research"("id") ON DELETE cascade ON UPDATE no action;