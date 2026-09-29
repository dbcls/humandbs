ALTER TYPE "public"."upstream_source" ADD VALUE 'ds-branch';--> statement-breakpoint
ALTER TYPE "public"."upstream_source" ADD VALUE 'jgad-registration';--> statement-breakpoint
CREATE TABLE "ds_branch" (
	"application_id" text PRIMARY KEY NOT NULL,
	"hum_label" text,
	"application_type" text NOT NULL,
	"approved_on" date,
	"title_ja" text DEFAULT '' NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"pi_name_ja" text DEFAULT '' NOT NULL,
	"pi_name_en" text DEFAULT '' NOT NULL,
	"aims_ja" text DEFAULT '' NOT NULL,
	"aims_en" text DEFAULT '' NOT NULL,
	"methods_ja" text DEFAULT '' NOT NULL,
	"methods_en" text DEFAULT '' NOT NULL,
	"targets_ja" text DEFAULT '' NOT NULL,
	"targets_en" text DEFAULT '' NOT NULL,
	"affiliation_ja" text DEFAULT '' NOT NULL,
	"affiliation_en" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"data_access" integer,
	"icd10" text DEFAULT '' NOT NULL,
	"accessions" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jgad_registration" (
	"accession" text PRIMARY KEY NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"dataset_type" text DEFAULT '' NOT NULL
);
