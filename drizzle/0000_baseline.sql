-- The full-text indexes are PGroonga's. A database made by the image already has
-- the extension; one made any other way gets it here.
CREATE EXTENSION IF NOT EXISTS pgroonga;--> statement-breakpoint
CREATE TYPE "public"."event_action" AS ENUM('publish-version', 'replace-version', 'publish-dataset', 'withdraw-version', 'delete-research', 'delete-dataset', 'discard-draft', 'pin-label', 'unpin-label', 'publish-file', 'unpublish-file', 'delete-file', 'publish-site-content', 'unpublish-site-content', 'grant-admin', 'revoke-admin', 'pass-publish-gate');--> statement-breakpoint
CREATE TYPE "public"."accession_kind" AS ENUM('jga-study', 'jga-dataset');--> statement-breakpoint
CREATE TYPE "public"."upstream_source" AS ENUM('cau', 'hum-accession', 'jgad-date', 'archive-date');--> statement-breakpoint
CREATE TYPE "public"."content_key_scope" AS ENUM('dataset', 'experiment');--> statement-breakpoint
CREATE TYPE "public"."content_value_type" AS ENUM('text', 'single', 'accession', 'vocabulary', 'number', 'disease');--> statement-breakpoint
CREATE TYPE "public"."file_publish_action" AS ENUM('publish', 'unpublish');--> statement-breakpoint
CREATE TYPE "public"."file_publish_job_state" AS ENUM('pending', 'running', 'failed');--> statement-breakpoint
CREATE TYPE "public"."label_kind" AS ENUM('hum', 'dataset');--> statement-breakpoint
CREATE TYPE "public"."search_target_type" AS ENUM('research', 'research-version', 'dataset');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('ja', 'en');--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_sub" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" "event_action" NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"keycloak_sub" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_keycloakSub_unique" UNIQUE("keycloak_sub")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"token_hash" text NOT NULL,
	"keycloak_sub" text NOT NULL,
	"display_name" text NOT NULL,
	"id_token" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "accession_date" (
	"accession" text PRIMARY KEY NOT NULL,
	"date_published" date,
	"date_modified" date,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cau_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"hum_label" text NOT NULL,
	"application_id" text NOT NULL,
	"pi_name_ja" text DEFAULT '' NOT NULL,
	"pi_name_en" text DEFAULT '' NOT NULL,
	"affiliation_ja" text DEFAULT '' NOT NULL,
	"affiliation_en" text DEFAULT '' NOT NULL,
	"country_ja" text DEFAULT '' NOT NULL,
	"country_en" text DEFAULT '' NOT NULL,
	"research_title_ja" text DEFAULT '' NOT NULL,
	"research_title_en" text DEFAULT '' NOT NULL,
	"period_start" date,
	"period_end" date,
	"dataset_accessions" text[] NOT NULL,
	CONSTRAINT "cau_entry_unique" UNIQUE("hum_label","application_id")
);
--> statement-breakpoint
CREATE TABLE "hum_accession" (
	"accession" text PRIMARY KEY NOT NULL,
	"hum_label" text NOT NULL,
	"kind" "accession_kind" NOT NULL,
	"study" text
);
--> statement-breakpoint
CREATE TABLE "upstream_refresh" (
	"source" "upstream_source" PRIMARY KEY NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL,
	"succeeded_at" timestamp with time zone,
	"row_count" integer,
	"failure" text
);
--> statement-breakpoint
CREATE TABLE "content_key" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"scope" "content_key_scope" NOT NULL,
	"value_type" "content_value_type" NOT NULL,
	"label_ja" text NOT NULL,
	"label_en" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"vocabulary_set_id" uuid,
	"multiple" boolean DEFAULT false NOT NULL,
	"canonical_unit" text,
	"input_units" text[],
	"facet_category_id" uuid,
	CONSTRAINT "content_key_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "facet_category" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"label_ja" text,
	"label_en" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "facet_category_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_set" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"label_ja" text NOT NULL,
	"label_en" text NOT NULL,
	"hierarchical" boolean DEFAULT false NOT NULL,
	CONSTRAINT "vocabulary_set_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_term" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"set_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label_ja" text,
	"label_en" text NOT NULL,
	"maker" text,
	"parent_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "vocabulary_term_code_unique" UNIQUE("set_id","code")
);
--> statement-breakpoint
CREATE TABLE "file_publish_job" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"action" "file_publish_action" NOT NULL,
	"research_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"state" "file_publish_job_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_publish_job_file_unique" UNIQUE("research_id","file_name")
);
--> statement-breakpoint
CREATE TABLE "label_pin" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" "label_kind" NOT NULL,
	"label" text NOT NULL,
	"research_id" uuid,
	"dataset_id" uuid,
	"is_primary" boolean NOT NULL,
	CONSTRAINT "label_pin_label_unique" UNIQUE("kind","label"),
	CONSTRAINT "label_pin_subject_matches_kind" CHECK (("label_pin"."kind" = 'hum' AND "label_pin"."research_id" IS NOT NULL AND "label_pin"."dataset_id" IS NULL)
     OR ("label_pin"."kind" = 'dataset' AND "label_pin"."dataset_id" IS NOT NULL AND "label_pin"."research_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "dataset" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"research_id" uuid NOT NULL,
	"origin_draft_id" uuid
);
--> statement-breakpoint
CREATE TABLE "draft_dataset_entry" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"draft_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "draft_dataset_entry_unique" UNIQUE("draft_id","dataset_id")
);
--> statement-breakpoint
CREATE TABLE "research" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_draft" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"research_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"replaces_version_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"share_token" text NOT NULL,
	"share_enabled" boolean DEFAULT false NOT NULL,
	"share_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_draft_shareToken_unique" UNIQUE("share_token"),
	CONSTRAINT "research_draft_replaces_version_unique" UNIQUE("replaces_version_id")
);
--> statement-breakpoint
CREATE TABLE "research_version" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"research_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"content" jsonb NOT NULL,
	"release_date" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_version_number_unique" UNIQUE("research_id","number")
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"draft_id" uuid NOT NULL,
	"anchor" jsonb NOT NULL,
	"author_sub" text,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_sub" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_acknowledgement" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"draft_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_sub" text,
	"actor_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_doc" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"target_type" "search_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"research_id" uuid NOT NULL,
	"hum_label" text NOT NULL,
	"version_number" integer,
	"dataset_label" text,
	"date_published" date,
	"date_modified" date,
	"content" jsonb NOT NULL,
	"title" text NOT NULL,
	"text_ja" text NOT NULL,
	"text_en" text NOT NULL,
	"text_all" text GENERATED ALWAYS AS (text_ja || ' ' || text_en) STORED,
	CONSTRAINT "search_doc_target_unique" UNIQUE("target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "search_facet_number" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"doc_id" uuid NOT NULL,
	"key_id" uuid NOT NULL,
	"value" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_facet_term" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"doc_id" uuid NOT NULL,
	"key_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"ancestor_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	CONSTRAINT "search_facet_term_unique" UNIQUE("doc_id","key_id","term_id")
);
--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"content" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "document_content" (
	"document_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"content" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" date,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_content_document_id_locale_pk" PRIMARY KEY("document_id","locale")
);
--> statement-breakpoint
CREATE TABLE "document_series" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"current_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_series_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_content" (
	"news_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"content" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_content_news_id_locale_pk" PRIMARY KEY("news_id","locale")
);
--> statement-breakpoint
ALTER TABLE "content_key" ADD CONSTRAINT "content_key_vocabulary_set_id_vocabulary_set_id_fk" FOREIGN KEY ("vocabulary_set_id") REFERENCES "public"."vocabulary_set"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_key" ADD CONSTRAINT "content_key_facet_category_id_facet_category_id_fk" FOREIGN KEY ("facet_category_id") REFERENCES "public"."facet_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_term" ADD CONSTRAINT "vocabulary_term_set_id_vocabulary_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."vocabulary_set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_term" ADD CONSTRAINT "vocabulary_term_parent_id_vocabulary_term_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."vocabulary_term"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_publish_job" ADD CONSTRAINT "file_publish_job_research_id_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_pin" ADD CONSTRAINT "label_pin_research_id_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_pin" ADD CONSTRAINT "label_pin_dataset_id_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_research_id_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_origin_draft_id_research_draft_id_fk" FOREIGN KEY ("origin_draft_id") REFERENCES "public"."research_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_dataset_entry" ADD CONSTRAINT "draft_dataset_entry_draft_id_research_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."research_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_dataset_entry" ADD CONSTRAINT "draft_dataset_entry_dataset_id_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_draft" ADD CONSTRAINT "research_draft_research_id_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_draft" ADD CONSTRAINT "research_draft_replaces_version_id_research_version_id_fk" FOREIGN KEY ("replaces_version_id") REFERENCES "public"."research_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_version" ADD CONSTRAINT "research_version_research_id_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_draft_id_research_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."research_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_acknowledgement" ADD CONSTRAINT "review_acknowledgement_draft_id_research_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."research_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_doc" ADD CONSTRAINT "search_doc_research_id_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_facet_number" ADD CONSTRAINT "search_facet_number_doc_id_search_doc_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."search_doc"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_facet_number" ADD CONSTRAINT "search_facet_number_key_id_content_key_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."content_key"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_facet_term" ADD CONSTRAINT "search_facet_term_doc_id_search_doc_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."search_doc"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_facet_term" ADD CONSTRAINT "search_facet_term_key_id_content_key_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."content_key"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_facet_term" ADD CONSTRAINT "search_facet_term_term_id_vocabulary_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."vocabulary_term"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_content" ADD CONSTRAINT "document_content_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_current_id_document_id_fk" FOREIGN KEY ("current_id") REFERENCES "public"."document"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_content" ADD CONSTRAINT "news_content_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_subject_type_subject_id_index" ON "event" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "event_occurred_at_index" ON "event" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "session_keycloak_sub_index" ON "session" USING btree ("keycloak_sub");--> statement-breakpoint
CREATE INDEX "cau_entry_hum_label_index" ON "cau_entry" USING btree ("hum_label");--> statement-breakpoint
CREATE INDEX "hum_accession_hum_label_index" ON "hum_accession" USING btree ("hum_label");--> statement-breakpoint
CREATE INDEX "content_key_scope_position_index" ON "content_key" USING btree ("scope","position");--> statement-breakpoint
CREATE INDEX "vocabulary_term_parent_id_index" ON "vocabulary_term" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "file_publish_job_state_created_at_index" ON "file_publish_job" USING btree ("state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "label_pin_research_id_index" ON "label_pin" USING btree ("research_id") WHERE "label_pin"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "label_pin_dataset_id_index" ON "label_pin" USING btree ("dataset_id") WHERE "label_pin"."is_primary";--> statement-breakpoint
CREATE INDEX "dataset_research_id_index" ON "dataset" USING btree ("research_id");--> statement-breakpoint
CREATE INDEX "dataset_origin_draft_id_index" ON "dataset" USING btree ("origin_draft_id");--> statement-breakpoint
CREATE INDEX "research_draft_research_id_index" ON "research_draft" USING btree ("research_id");--> statement-breakpoint
CREATE INDEX "research_version_research_id_index" ON "research_version" USING btree ("research_id");--> statement-breakpoint
CREATE INDEX "comment_draft_id_resolved_index" ON "comment" USING btree ("draft_id","resolved");--> statement-breakpoint
CREATE INDEX "comment_draft_id_created_at_index" ON "comment" USING btree ("draft_id","created_at");--> statement-breakpoint
CREATE INDEX "review_acknowledgement_draft_id_index" ON "review_acknowledgement" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "search_doc_research_id_index" ON "search_doc" USING btree ("research_id");--> statement-breakpoint
CREATE INDEX "search_doc_target_type_date_published_index" ON "search_doc" USING btree ("target_type","date_published");--> statement-breakpoint
CREATE INDEX "search_doc_full_text_index" ON "search_doc" USING pgroonga ("text_all" pgroonga_text_full_text_search_ops_v2) WITH (tokenizer='TokenNgram("unify_alphabet", false, "unify_symbol", false, "unify_digit", false)',normalizers='NormalizerNFKC150');--> statement-breakpoint
CREATE INDEX "search_facet_number_key_id_value_index" ON "search_facet_number" USING btree ("key_id","value");--> statement-breakpoint
CREATE INDEX "search_facet_number_doc_id_index" ON "search_facet_number" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "search_facet_term_key_id_term_id_index" ON "search_facet_term" USING btree ("key_id","term_id");--> statement-breakpoint
CREATE INDEX "search_facet_term_ancestor_ids_index" ON "search_facet_term" USING gin ("ancestor_ids");--> statement-breakpoint
CREATE INDEX "news_published_at_index" ON "news" USING btree ("published_at");