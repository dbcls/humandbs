-- The application keeps the keys, the vocabulary terms and the slugs of the documents a term links to in memory, and reads them again when this channel is notified. A notification is sent when the statement's transaction commits, and not at all when it rolls back.
CREATE FUNCTION "catalog_changed"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('catalog_changed', '');
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER "content_key_changed" AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "content_key" FOR EACH STATEMENT EXECUTE FUNCTION "catalog_changed"();--> statement-breakpoint
CREATE TRIGGER "vocabulary_term_changed" AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "vocabulary_term" FOR EACH STATEMENT EXECUTE FUNCTION "catalog_changed"();--> statement-breakpoint
CREATE TRIGGER "document_changed" AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "document" FOR EACH STATEMENT EXECUTE FUNCTION "catalog_changed"();
