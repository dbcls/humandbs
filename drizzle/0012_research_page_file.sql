CREATE TABLE "research_page_file" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"research_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_page_file_file_unique" UNIQUE("research_id","file_name")
);
--> statement-breakpoint
ALTER TABLE "research_page_file" ADD CONSTRAINT "research_page_file_research_id_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."research"("id") ON DELETE cascade ON UPDATE no action;