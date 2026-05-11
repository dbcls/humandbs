  UPDATE site_navigation_config
  SET config = jsonb_set(
    config,
    '{zones,navbar,groups}',
    (
      SELECT jsonb_agg(
        CASE
          WHEN grp ? 'linkedItemId' OR jsonb_array_length(grp->'items') = 0
          THEN grp
          ELSE grp || jsonb_build_object('linkedItemId', grp->'items'->0->>'id')
        END
      )
      FROM jsonb_array_elements(config->'zones'->'navbar'->'groups') AS grp
    )
  );
