CREATE OR REPLACE FUNCTION pg_temp.migrate_navigation_flowchart_config(old_config jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN old_config ? 'en' AND old_config ? 'ja'
    THEN (
      SELECT jsonb_build_object(
        'steps',
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', en_step ->> 'id',
              'title', jsonb_build_object(
                'en', en_step ->> 'titleEn',
                'ja', COALESCE(ja_step ->> 'titleJa', en_step ->> 'titleJa')
              ),
              'text', jsonb_build_object(
                'en', en_step ->> 'textEn',
                'ja', COALESCE(ja_step ->> 'textJa', en_step ->> 'textJa')
              ),
              'options', COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', en_opt ->> 'id',
                      'title', jsonb_build_object(
                        'en', en_opt ->> 'titleEn',
                        'ja', COALESCE(ja_opt ->> 'titleJa', en_opt ->> 'titleJa')
                      )
                    )
                    || CASE
                      WHEN en_opt ? 'nextStep'
                      THEN jsonb_build_object('nextStep', en_opt ->> 'nextStep')
                      ELSE '{}'::jsonb
                    END
                    || CASE
                      WHEN en_opt ? 'linkedFlowchartId'
                      THEN jsonb_build_object('linkedFlowchartId', en_opt ->> 'linkedFlowchartId')
                      ELSE '{}'::jsonb
                    END
                    || CASE
                      WHEN en_opt ? 'link'
                      THEN jsonb_build_object('link', en_opt ->> 'link')
                      ELSE '{}'::jsonb
                    END
                    || CASE
                      WHEN en_opt ? 'linkTextEn'
                        OR en_opt ? 'linkTextJa'
                        OR ja_opt ? 'linkTextJa'
                      THEN jsonb_build_object(
                        'linkText',
                        jsonb_build_object(
                          'en', en_opt ->> 'linkTextEn',
                          'ja', COALESCE(ja_opt ->> 'linkTextJa', en_opt ->> 'linkTextJa')
                        )
                      )
                      ELSE '{}'::jsonb
                    END
                    ORDER BY en_opt_ord
                  )
                  FROM jsonb_array_elements(en_step -> 'options') WITH ORDINALITY AS en_options(en_opt, en_opt_ord)
                  LEFT JOIN LATERAL (
                    SELECT ja_option AS ja_opt
                    FROM jsonb_array_elements(COALESCE(ja_step -> 'options', '[]'::jsonb)) AS ja_options(ja_option)
                    WHERE ja_option ->> 'id' = en_opt ->> 'id'
                    LIMIT 1
                  ) matched_ja_option ON true
                ),
                '[]'::jsonb
              )
            )
            ORDER BY en_step_ord
          ),
          '[]'::jsonb
        )
      )
      FROM jsonb_array_elements(old_config -> 'en' -> 'steps') WITH ORDINALITY AS en_steps(en_step, en_step_ord)
      LEFT JOIN LATERAL (
        SELECT ja_step_candidate AS ja_step
        FROM jsonb_array_elements(COALESCE(old_config -> 'ja' -> 'steps', '[]'::jsonb)) AS ja_steps(ja_step_candidate)
        WHERE ja_step_candidate ->> 'id' = en_step ->> 'id'
        LIMIT 1
      ) matched_ja_step ON true
    )
    ELSE old_config
  END
$$;
--> statement-breakpoint
UPDATE "navigation_flowchart"
SET "config" = pg_temp.migrate_navigation_flowchart_config("config")
WHERE "config" ? 'en'
  AND "config" ? 'ja';
--> statement-breakpoint
UPDATE "navigation_flowchart_revision"
SET "config" = pg_temp.migrate_navigation_flowchart_config("config")
WHERE "config" ? 'en'
  AND "config" ? 'ja';
