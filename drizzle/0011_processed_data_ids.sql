-- The analysis method's "Dataset ID of processed data" held two things in one
-- value: the processed datasets' IDs, and a line linking the article on how
-- they were processed. On a processed dataset it also named the dataset
-- itself. This splits it by what each part says:
--
-- - The line linking the article becomes "Processing method", the article's
--   title linked to it.
-- - On a dataset whose value names other datasets, "Dataset ID of processed
--   data" keeps those lines.
-- - On a dataset whose value names only itself, "Dataset ID of processed data"
--   goes, and "Dataset ID of original data" names the datasets whose values in
--   a published version of the same research name it.
--
-- Every published version, draft and search row is rewritten.
INSERT INTO "content_key" ("code", "scope", "value_type", "label_ja", "label_en", "position")
SELECT 'original-data-dataset-id', 'experiment', 'text', '元データのデータセットID', 'Dataset ID of original data', "position" + 1
FROM "content_key" WHERE "code" = 'processed-data-dataset-id';--> statement-breakpoint
INSERT INTO "content_key" ("code", "scope", "value_type", "label_ja", "label_en", "position")
SELECT 'processing-method', 'experiment', 'text', '加工方法', 'Processing method', "position" + 2
FROM "content_key" WHERE "code" = 'processed-data-dataset-id';--> statement-breakpoint
UPDATE "content_key" SET "position" = "position" + 2
WHERE "scope" = 'experiment'
  AND "code" NOT IN ('original-data-dataset-id', 'processing-method')
  AND "position" > (SELECT "position" FROM "content_key" WHERE "code" = 'processed-data-dataset-id');--> statement-breakpoint
CREATE FUNCTION pg_temp.key_id(code text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT "id"::text FROM "content_key" WHERE "code" = key_id.code $$;--> statement-breakpoint
CREATE FUNCTION pg_temp.links_article(line jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(line) AS s WHERE s->>'href' LIKE '/%') $$;--> statement-breakpoint
CREATE FUNCTION pg_temp.id_lines(side jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('state', 'value', 'value', coalesce(jsonb_agg(l ORDER BY i) FILTER (WHERE NOT pg_temp.links_article(l)), '[]'::jsonb))
  FROM jsonb_array_elements(side->'value') WITH ORDINALITY AS x(l, i)
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.named_ids(side jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg(DISTINCT m[1] ORDER BY m[1]), '{}')
  FROM jsonb_array_elements(side->'value') AS l, jsonb_array_elements(l) AS s, regexp_matches(s->>'text', '(JGAD[0-9]{6})', 'g') AS m
  WHERE NOT pg_temp.links_article(l)
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.article_slug(text_value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(s->>'href', '^/(en/)?', '')
  FROM jsonb_array_elements(text_value->'ja'->'value') AS l, jsonb_array_elements(l) AS s
  WHERE s->>'href' LIKE '/%' LIMIT 1
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.method_value(slug text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('kind', 'text', 'text', jsonb_build_object(
    'ja', jsonb_build_object('state', 'value', 'value', jsonb_build_array(jsonb_build_array(jsonb_build_object(
      'text', (SELECT c."content"->>'title' FROM "document" AS d JOIN "document_content" AS c ON c."document_id" = d."id" WHERE d."slug" = method_value.slug AND c."locale"::text = 'ja'),
      'href', '/' || slug)))),
    'en', jsonb_build_object('state', 'value', 'value', jsonb_build_array(jsonb_build_array(jsonb_build_object(
      'text', (SELECT c."content"->>'title' FROM "document" AS d JOIN "document_content" AS c ON c."document_id" = d."id" WHERE d."slug" = method_value.slug AND c."locale"::text = 'en'),
      'href', '/en/' || slug))))
  ))
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.originals_value(originals text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('kind', 'text', 'text', jsonb_build_object('ja', side, 'en', side))
  FROM (SELECT jsonb_build_object('state', 'value', 'value', jsonb_agg(
    jsonb_build_array(jsonb_build_object('text', o, 'href', 'https://ddbj.nig.ac.jp/resource/jga-dataset/' || o)) ORDER BY o)) AS side
    FROM unnest(originals) AS o) AS built
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.dataset_label(dataset_id text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT "label" FROM "label_pin" WHERE "dataset_id"::text = dataset_label.dataset_id AND "is_primary" LIMIT 1
$$;--> statement-breakpoint
-- Which datasets' values in a published version name each processed dataset.
CREATE TEMPORARY TABLE "processed_originals" AS
SELECT named AS "processed", array_agg(DISTINCT own ORDER BY own) AS "originals"
FROM (
  SELECT pg_temp.dataset_label(d->>'datasetId') AS own, unnest(pg_temp.named_ids(v->'value'->'text'->'ja')) AS named
  FROM "research_version", jsonb_array_elements("content"->'datasets') AS d,
    jsonb_array_elements(d->'experiments') AS x, jsonb_array_elements(x->'values') AS v
  WHERE v->>'keyId' = pg_temp.key_id('processed-data-dataset-id')
) AS mentions
WHERE own IS DISTINCT FROM named
GROUP BY named;--> statement-breakpoint
CREATE FUNCTION pg_temp.split_values(slots jsonb, own text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  processed_key text := pg_temp.key_id('processed-data-dataset-id');
  slot jsonb;
  text_value jsonb;
  slug text;
  named text[];
  naming text[];
  written jsonb := '[]'::jsonb;
  added jsonb := '[]'::jsonb;
BEGIN
  FOR slot IN SELECT s FROM jsonb_array_elements(slots) WITH ORDINALITY AS x(s, i) ORDER BY i LOOP
    text_value := slot->'value'->'text';
    IF slot->>'keyId' IS DISTINCT FROM processed_key
      OR text_value->'ja'->>'state' IS DISTINCT FROM 'value'
      OR text_value->'en'->>'state' IS DISTINCT FROM 'value' THEN
      written := written || jsonb_build_array(slot);
      CONTINUE;
    END IF;
    slug := pg_temp.article_slug(text_value);
    named := pg_temp.named_ids(text_value->'ja');
    IF own IS NOT NULL AND named = ARRAY[own] THEN
      SELECT p."originals" INTO naming FROM "processed_originals" AS p WHERE p."processed" = own;
      IF naming IS NOT NULL THEN
        added := added || jsonb_build_array(jsonb_build_object('keyId', pg_temp.key_id('original-data-dataset-id'), 'value', pg_temp.originals_value(naming)));
      END IF;
    ELSE
      written := written || jsonb_build_array(jsonb_set(slot, '{value,text}', jsonb_build_object(
        'ja', pg_temp.id_lines(text_value->'ja'),
        'en', pg_temp.id_lines(text_value->'en'))));
    END IF;
    IF slug IS NOT NULL THEN
      added := added || jsonb_build_array(jsonb_build_object('keyId', pg_temp.key_id('processing-method'), 'value', pg_temp.method_value(slug)));
    END IF;
  END LOOP;
  RETURN written || added;
END
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.split_dataset(d jsonb, own text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT d || jsonb_build_object('experiments', (
    SELECT coalesce(jsonb_agg(e || jsonb_build_object('values', pg_temp.split_values(e->'values', own)) ORDER BY i), '[]'::jsonb)
    FROM jsonb_array_elements(d->'experiments') WITH ORDINALITY AS x(e, i)
  ))
$$;--> statement-breakpoint
UPDATE "research_version" SET "content" = jsonb_set("content", '{datasets}', (
  SELECT coalesce(jsonb_agg(pg_temp.split_dataset(d, pg_temp.dataset_label(d->>'datasetId')) ORDER BY i), '[]'::jsonb)
  FROM jsonb_array_elements("content"->'datasets') WITH ORDINALITY AS x(d, i)
))
WHERE "content"::text LIKE '%' || pg_temp.key_id('processed-data-dataset-id') || '%';--> statement-breakpoint
UPDATE "draft_dataset_entry" SET "content" = pg_temp.split_dataset("content", pg_temp.dataset_label("dataset_id"::text))
WHERE "content"::text LIKE '%' || pg_temp.key_id('processed-data-dataset-id') || '%';--> statement-breakpoint
UPDATE "search_doc" SET "content" = pg_temp.split_dataset("content", pg_temp.dataset_label("target_id"::text))
WHERE "content" ? 'experiments' AND "content"::text LIKE '%' || pg_temp.key_id('processed-data-dataset-id') || '%';
