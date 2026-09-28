-- A number's label and note become what is written before and after it, by the
-- rule `migration/number-words.ts` (`prefixedNumber`) follows: the label `X`
-- becomes the prefix `X: `, and the note `Y` the suffix ` (Y)`. A key with no
-- canonical unit counts, and its "unit" held the word written after the count:
-- that word goes into the suffix in front of the note (English for the three
-- Japanese words), and the unit is left empty. A number already in the new
-- shape is left as it is.
CREATE FUNCTION pg_temp.prefixed_number(n jsonb, counts boolean) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  word text := CASE WHEN counts THEN n->>'inputUnit' END;
  word_en text := CASE word WHEN 'プローブ' THEN 'probes' WHEN '遺伝子' THEN 'genes' WHEN 'バリアント' THEN 'variants' ELSE word END;
  label_ja text := coalesce(n->'label'->>'ja', '');
  label_en text := coalesce(n->'label'->>'en', '');
  note_ja text := coalesce(n->'note'->>'ja', '');
  note_en text := coalesce(n->'note'->>'en', '');
  prefix_ja text;
  prefix_en text;
  suffix_ja text;
  suffix_en text;
BEGIN
  IF n ? 'prefix' AND NOT n ? 'label' THEN
    RETURN n;
  END IF;
  prefix_ja := CASE WHEN label_ja = '' THEN '' ELSE label_ja || ': ' END;
  prefix_en := CASE WHEN label_en = '' THEN '' ELSE label_en || ': ' END;
  suffix_ja := CASE WHEN word IS NULL THEN '' WHEN word ~* '^[x×%倍]$' THEN word ELSE ' ' || word END
    || CASE WHEN note_ja = '' THEN '' ELSE ' (' || note_ja || ')' END;
  suffix_en := CASE WHEN word_en IS NULL THEN '' WHEN word_en ~* '^[x×%倍]$' THEN word_en ELSE ' ' || word_en END
    || CASE WHEN note_en = '' THEN '' ELSE ' (' || note_en || ')' END;
  RETURN (n - 'label' - 'note')
    || jsonb_build_object(
      'prefix', CASE WHEN prefix_ja = '' AND prefix_en = '' THEN 'null'::jsonb ELSE jsonb_build_object('ja', prefix_ja, 'en', prefix_en) END,
      'suffix', CASE WHEN suffix_ja = '' AND suffix_en = '' THEN 'null'::jsonb ELSE jsonb_build_object('ja', suffix_ja, 'en', suffix_en) END
    )
    || CASE WHEN counts THEN jsonb_build_object('unit', NULL, 'inputUnit', NULL) ELSE '{}'::jsonb END;
END
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.prefixed_slots(slots jsonb, counting text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(
    CASE WHEN s->'value'->>'kind' = 'number' AND s->'value'->'values'->>'state' = 'value'
      THEN jsonb_set(s, '{value,values,value}', (
        SELECT coalesce(jsonb_agg(pg_temp.prefixed_number(r, (s->>'keyId') = ANY(counting)) ORDER BY o), '[]'::jsonb)
        FROM jsonb_array_elements(s->'value'->'values'->'value') WITH ORDINALITY AS t(r, o)
      ))
      ELSE s
    END ORDER BY i), '[]'::jsonb)
  FROM jsonb_array_elements(slots) WITH ORDINALITY AS x(s, i)
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.prefixed_dataset(d jsonb, counting text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT d || jsonb_build_object(
    'values', pg_temp.prefixed_slots(d->'values', counting),
    'experiments', (
      SELECT coalesce(jsonb_agg(e || jsonb_build_object('values', pg_temp.prefixed_slots(e->'values', counting)) ORDER BY i), '[]'::jsonb)
      FROM jsonb_array_elements(d->'experiments') WITH ORDINALITY AS x(e, i)
    )
  )
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.counting_keys() RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg("id"::text), '{}') FROM "content_key" WHERE "value_type" = 'number' AND "canonical_unit" IS NULL
$$;--> statement-breakpoint
UPDATE "research_version" SET "content" = jsonb_set("content", '{datasets}', (
  SELECT coalesce(jsonb_agg(pg_temp.prefixed_dataset(d, pg_temp.counting_keys()) ORDER BY i), '[]'::jsonb)
  FROM jsonb_array_elements("content"->'datasets') WITH ORDINALITY AS x(d, i)
)) WHERE jsonb_typeof("content"->'datasets') = 'array';--> statement-breakpoint
UPDATE "draft_dataset_entry" SET "content" = pg_temp.prefixed_dataset("content", pg_temp.counting_keys());--> statement-breakpoint
UPDATE "search_doc" SET "content" = pg_temp.prefixed_dataset("content", pg_temp.counting_keys()) WHERE "content" ? 'experiments';
