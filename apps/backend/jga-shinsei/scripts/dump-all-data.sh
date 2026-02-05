#!/bin/bash
# Dump all JGA Shinsei data to JSON files
#
# Output:
#   - $JGA_OUTPUT_DIR/relations.json       : ID マッピング + 階層関係
#   - $JGA_OUTPUT_DIR/ds-applications.json : J-DS (データ提供申請) 詳細
#   - $JGA_OUTPUT_DIR/du-applications.json : J-DU (データ利用申請) 詳細
#
# Usage:
#   ./scripts/dump-all-data.sh
#
# Environment (see env.template):
#   JGA_CONTAINER_NAME - Docker container name
#   JGA_DB_USER        - PostgreSQL user
#   JGA_DB_NAME        - PostgreSQL database name
#   JGA_OUTPUT_DIR     - JSON output directory

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$SCRIPT_DIR/.."

# Load .env if exists
if [[ -f "$BASE_DIR/.env" ]]; then
  # shellcheck source=/dev/null
  source "$BASE_DIR/.env"
fi

# Set defaults
CONTAINER_NAME="${JGA_CONTAINER_NAME:-humandbs-jga-shinsei-db}"
DB_USER="${JGA_DB_USER:-postgres}"
DB_NAME="${JGA_DB_NAME:-jgadb}"

# Resolve output dir (relative to BASE_DIR or absolute)
if [[ "${JGA_OUTPUT_DIR:-}" == /* ]]; then
  OUTPUT_DIR="${JGA_OUTPUT_DIR}"
else
  OUTPUT_DIR="$BASE_DIR/${JGA_OUTPUT_DIR:-json-data}"
fi

mkdir -p "$OUTPUT_DIR"

echo "=== JGA Shinsei Data Dump ==="
echo "Container: $CONTAINER_NAME"
echo "Database:  $DB_NAME (user: $DB_USER)"
echo "Output:    $OUTPUT_DIR"
echo ""

# ==============================================================================
# 1. relations.json - ID マッピング + 階層関係
# ==============================================================================
echo "[1/3] Exporting relations.json..."

docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
WITH
-- JGA ID 親子関係
jga_hierarchy AS (
  SELECT json_agg(
    json_build_object(
      'child', s.accession,
      'parent', p.accession,
      'child_type', substring(s.accession from '^[A-Z]+'),
      'parent_type', substring(p.accession from '^[A-Z]+')
    )
    ORDER BY substring(s.accession from '^[A-Z]+'), s.accession
  )
  FROM ts_jgasys.relation r
  JOIN ts_jgasys.accession s ON r.self = s.accession_id
  JOIN ts_jgasys.accession p ON r.parent = p.accession_id
  WHERE s.accession NOT LIKE 'JSUB%'
    AND p.accession NOT LIKE 'JSUB%'
),

-- JGA <-> hum_id
jga_to_hum AS (
  SELECT json_agg(
    json_build_object(
      'jga_accession', a.accession,
      'hum_id', substring(m.metadata from 'nbdc_number=\"([^\"]+)\"')
    )
    ORDER BY substring(m.metadata from 'nbdc_number=\"([^\"]+)\"'), a.accession
  )
  FROM ts_jgasys.metadata m
  JOIN ts_jgasys.accession a ON m.accession_id = a.accession_id
  WHERE m.metadata LIKE '%nbdc_number%'
    AND a.accession LIKE 'JGA%'
    AND a.accession NOT LIKE 'JGAC%'
    AND a.accession NOT LIKE 'JGAP%'
),

-- JSUB <-> JGA
jsub_to_jga AS (
  SELECT json_agg(
    json_build_object(
      'jsub_id', substring(alias from 'JSUB[0-9]+'),
      'type', substring(alias from '_([A-Za-z]+)_'),
      'jga_accession', accession
    )
    ORDER BY substring(alias from 'JSUB[0-9]+'), substring(alias from '_([A-Za-z]+)_'), accession
  )
  FROM ts_jgasys.accession
  WHERE alias LIKE 'JSUB%'
    AND accession NOT LIKE 'JSUB%'
),

-- J-DS <-> JGA (via submission_permission - direct link)
jds_to_jga AS (
  SELECT json_agg(
    json_build_object(
      'jds_id', na.ds_du_id,
      'jga_accession', a.accession
    )
    ORDER BY na.ds_du_id, a.accession
  )
  FROM ts_jgasys.submission_permission sp
  JOIN ts_jgasys.nbdc_application na ON sp.appl_id = na.appl_id
  JOIN ts_jgasys.entry e ON sp.submission_id = e.submission_id
  JOIN ts_jgasys.relation r ON e.entry_id = r.entry_id
  JOIN ts_jgasys.accession a ON r.self = a.accession_id
  WHERE na.ds_du_id LIKE 'J-DS%'
    AND a.accession NOT LIKE 'JSUB%'
),

-- J-DU <-> JGAD (via use_permission - direct link)
jdu_to_jgad AS (
  SELECT json_agg(
    json_build_object(
      'jdu_id', na.ds_du_id,
      'jgad_accession', a.accession
    )
    ORDER BY na.ds_du_id, a.accession
  )
  FROM ts_jgasys.use_permission up
  JOIN ts_jgasys.nbdc_application na ON up.appl_id = na.appl_id
  JOIN ts_jgasys.accession a ON up.dataset_id = a.accession_id
  WHERE na.ds_du_id LIKE 'J-DU%'
)

SELECT json_build_object(
  'jga_hierarchy', COALESCE((SELECT * FROM jga_hierarchy), '[]'::json),
  'jga_to_hum', COALESCE((SELECT * FROM jga_to_hum), '[]'::json),
  'jsub_to_jga', COALESCE((SELECT * FROM jsub_to_jga), '[]'::json),
  'jds_to_jga', COALESCE((SELECT * FROM jds_to_jga), '[]'::json),
  'jdu_to_jgad', COALESCE((SELECT * FROM jdu_to_jgad), '[]'::json)
);
" | jq '.' > "$OUTPUT_DIR/relations.json"

echo "  -> $(jq '.jga_hierarchy | length' "$OUTPUT_DIR/relations.json") hierarchy records"
echo "  -> $(jq '.jsub_to_jga | length' "$OUTPUT_DIR/relations.json") JSUB-JGA mappings"

# ==============================================================================
# 2. ds-applications.json - J-DS (データ提供申請) 詳細
# ==============================================================================
echo "[2/3] Exporting ds-applications.json..."

docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
WITH jds_base AS (
  SELECT DISTINCT
    nam.ds_du_id as jds_id,
    na.appl_id,
    na.study_title,
    na.study_title_en,
    na.pi_last_name,
    na.pi_first_name,
    na.pi_last_name_en,
    na.pi_first_name_en,
    na.pi_institution,
    na.pi_institution_en,
    na.pi_division,
    na.pi_division_en,
    na.create_date
  FROM ts_jgasys.nbdc_application_master nam
  JOIN ts_jgasys.nbdc_application na ON nam.ds_du_id = na.ds_du_id
  WHERE nam.data_type = 1
),
-- JSUB via submission_permission (direct link)
jds_jsub AS (
  SELECT
    na.ds_du_id as jds_id,
    array_agg(DISTINCT substring(a.alias from 'JSUB[0-9]+')) FILTER (WHERE a.alias LIKE 'JSUB%') as jsub_ids
  FROM ts_jgasys.submission_permission sp
  JOIN ts_jgasys.nbdc_application na ON sp.appl_id = na.appl_id
  JOIN ts_jgasys.entry e ON sp.submission_id = e.submission_id
  JOIN ts_jgasys.relation r ON e.entry_id = r.entry_id
  JOIN ts_jgasys.accession a ON r.self = a.accession_id
  WHERE na.ds_du_id LIKE 'J-DS%'
  GROUP BY na.ds_du_id
),
-- hum_id via submission_permission (direct link)
jds_hum AS (
  SELECT
    na.ds_du_id as jds_id,
    array_agg(DISTINCT substring(m.metadata from 'nbdc_number=\"([^\"]+)\"')) FILTER (WHERE m.metadata LIKE '%nbdc_number%') as hum_ids
  FROM ts_jgasys.submission_permission sp
  JOIN ts_jgasys.nbdc_application na ON sp.appl_id = na.appl_id
  JOIN ts_jgasys.entry e ON sp.submission_id = e.submission_id
  JOIN ts_jgasys.relation r ON e.entry_id = r.entry_id
  JOIN ts_jgasys.accession a ON r.self = a.accession_id
  JOIN ts_jgasys.metadata m ON a.accession_id = m.accession_id
  WHERE na.ds_du_id LIKE 'J-DS%'
  GROUP BY na.ds_du_id
),
-- JGA IDs via submission_permission (direct link)
jds_jga AS (
  SELECT
    na.ds_du_id as jds_id,
    array_agg(DISTINCT a.accession) FILTER (WHERE a.accession NOT LIKE 'JSUB%') as jga_ids
  FROM ts_jgasys.submission_permission sp
  JOIN ts_jgasys.nbdc_application na ON sp.appl_id = na.appl_id
  JOIN ts_jgasys.entry e ON sp.submission_id = e.submission_id
  JOIN ts_jgasys.relation r ON e.entry_id = r.entry_id
  JOIN ts_jgasys.accession a ON r.self = a.accession_id
  WHERE na.ds_du_id LIKE 'J-DS%'
  GROUP BY na.ds_du_id
),
jds_components AS (
  SELECT
    jb.jds_id,
    COALESCE(
      json_agg(
        json_build_object('key', nc.key, 'value', nc.value)
        ORDER BY nc.t_order
      ) FILTER (WHERE nc.appl_component_id IS NOT NULL),
      '[]'::json
    ) as components
  FROM jds_base jb
  LEFT JOIN ts_jgasys.nbdc_application_submit ns ON jb.appl_id = ns.appl_id
  LEFT JOIN ts_jgasys.nbdc_application_component nc ON ns.appl_submit_id = nc.appl_submit_id
  GROUP BY jb.jds_id
),
jds_status AS (
  SELECT
    jb.jds_id,
    COALESCE(
      json_agg(
        json_build_object('status', sh.appl_status_type, 'date', sh.history_date)
        ORDER BY sh.history_date
      ) FILTER (WHERE sh.appl_status_history_id IS NOT NULL),
      '[]'::json
    ) as status_history
  FROM jds_base jb
  LEFT JOIN ts_jgasys.nbdc_application_status_history sh ON jb.appl_id = sh.appl_id
  GROUP BY jb.jds_id
),
jds_submit AS (
  SELECT
    jb.jds_id,
    MIN(ns.submit_date) as submit_date
  FROM jds_base jb
  LEFT JOIN ts_jgasys.nbdc_application_submit ns ON jb.appl_id = ns.appl_id
  GROUP BY jb.jds_id
)
SELECT json_agg(
  json_build_object(
    'jds_id', jb.jds_id,
    'jsub_ids', COALESCE(jsub.jsub_ids, ARRAY[]::text[]),
    'hum_ids', COALESCE(hum.hum_ids, ARRAY[]::text[]),
    'jga_ids', COALESCE(jga.jga_ids, ARRAY[]::text[]),
    'application', json_build_object(
      'study_title', jb.study_title,
      'study_title_en', jb.study_title_en,
      'pi', json_build_object(
        'last_name', jb.pi_last_name,
        'first_name', jb.pi_first_name,
        'last_name_en', jb.pi_last_name_en,
        'first_name_en', jb.pi_first_name_en,
        'institution', jb.pi_institution,
        'institution_en', jb.pi_institution_en,
        'division', jb.pi_division,
        'division_en', jb.pi_division_en
      ),
      'create_date', jb.create_date
    ),
    'components', comp.components,
    'status_history', stat.status_history,
    'submit_date', sub.submit_date
  )
  ORDER BY jb.jds_id
)
FROM jds_base jb
LEFT JOIN jds_jsub jsub ON jb.jds_id = jsub.jds_id
LEFT JOIN jds_hum hum ON jb.jds_id = hum.jds_id
LEFT JOIN jds_jga jga ON jb.jds_id = jga.jds_id
LEFT JOIN jds_components comp ON jb.jds_id = comp.jds_id
LEFT JOIN jds_status stat ON jb.jds_id = stat.jds_id
LEFT JOIN jds_submit sub ON jb.jds_id = sub.jds_id;
" | jq '.' > "$OUTPUT_DIR/ds-applications.json"

echo "  -> $(jq 'length' "$OUTPUT_DIR/ds-applications.json") J-DS records"

# ==============================================================================
# 3. du-applications.json - J-DU (データ利用申請) 詳細
# ==============================================================================
echo "[3/3] Exporting du-applications.json..."

docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
WITH jdu_base AS (
  SELECT DISTINCT
    na.ds_du_id as jdu_id,
    na.appl_id,
    na.study_title,
    na.study_title_en,
    na.pi_last_name,
    na.pi_first_name,
    na.pi_last_name_en,
    na.pi_first_name_en,
    na.pi_institution,
    na.pi_institution_en,
    na.pi_division,
    na.pi_division_en,
    na.create_date
  FROM ts_jgasys.nbdc_application na
  WHERE na.ds_du_id LIKE 'J-DU%'
),
jdu_jgad AS (
  SELECT
    jb.jdu_id,
    array_agg(DISTINCT a.accession) FILTER (WHERE a.accession LIKE 'JGAD%') as jgad_ids
  FROM jdu_base jb
  LEFT JOIN ts_jgasys.use_permission up ON jb.appl_id = up.appl_id
  LEFT JOIN ts_jgasys.accession a ON up.dataset_id = a.accession_id
  GROUP BY jb.jdu_id
),
jdu_jgas AS (
  SELECT
    jb.jdu_id,
    array_agg(DISTINCT parent_acc.accession) FILTER (WHERE parent_acc.accession LIKE 'JGAS%') as jgas_ids
  FROM jdu_base jb
  LEFT JOIN ts_jgasys.use_permission up ON jb.appl_id = up.appl_id
  LEFT JOIN ts_jgasys.accession a ON up.dataset_id = a.accession_id
  LEFT JOIN ts_jgasys.relation r ON a.accession_id = r.self
  LEFT JOIN ts_jgasys.accession parent_acc ON r.parent = parent_acc.accession_id
  GROUP BY jb.jdu_id
),
jdu_hum AS (
  SELECT
    jb.jdu_id,
    array_agg(DISTINCT substring(m.metadata from 'nbdc_number=\"([^\"]+)\"')) FILTER (WHERE m.metadata LIKE '%nbdc_number%') as hum_ids
  FROM jdu_base jb
  LEFT JOIN ts_jgasys.use_permission up ON jb.appl_id = up.appl_id
  LEFT JOIN ts_jgasys.accession a ON up.dataset_id = a.accession_id
  LEFT JOIN ts_jgasys.relation r ON a.accession_id = r.self
  LEFT JOIN ts_jgasys.accession parent_acc ON r.parent = parent_acc.accession_id
  LEFT JOIN ts_jgasys.metadata m ON parent_acc.accession_id = m.accession_id
  GROUP BY jb.jdu_id
),
jdu_components AS (
  SELECT
    jb.jdu_id,
    COALESCE(
      json_agg(
        json_build_object('key', nc.key, 'value', nc.value)
        ORDER BY nc.t_order
      ) FILTER (WHERE nc.appl_component_id IS NOT NULL),
      '[]'::json
    ) as components
  FROM jdu_base jb
  LEFT JOIN ts_jgasys.nbdc_application_submit ns ON jb.appl_id = ns.appl_id
  LEFT JOIN ts_jgasys.nbdc_application_component nc ON ns.appl_submit_id = nc.appl_submit_id
  GROUP BY jb.jdu_id
),
jdu_status AS (
  SELECT
    jb.jdu_id,
    COALESCE(
      json_agg(
        json_build_object('status', sh.appl_status_type, 'date', sh.history_date)
        ORDER BY sh.history_date
      ) FILTER (WHERE sh.appl_status_history_id IS NOT NULL),
      '[]'::json
    ) as status_history
  FROM jdu_base jb
  LEFT JOIN ts_jgasys.nbdc_application_status_history sh ON jb.appl_id = sh.appl_id
  GROUP BY jb.jdu_id
),
jdu_submit AS (
  SELECT
    jb.jdu_id,
    MIN(ns.submit_date) as submit_date
  FROM jdu_base jb
  LEFT JOIN ts_jgasys.nbdc_application_submit ns ON jb.appl_id = ns.appl_id
  GROUP BY jb.jdu_id
)
SELECT json_agg(
  json_build_object(
    'jdu_id', jb.jdu_id,
    'jgad_ids', COALESCE(jgad.jgad_ids, ARRAY[]::text[]),
    'jgas_ids', COALESCE(jgas.jgas_ids, ARRAY[]::text[]),
    'hum_ids', COALESCE(hum.hum_ids, ARRAY[]::text[]),
    'application', json_build_object(
      'study_title', jb.study_title,
      'study_title_en', jb.study_title_en,
      'pi', json_build_object(
        'last_name', jb.pi_last_name,
        'first_name', jb.pi_first_name,
        'last_name_en', jb.pi_last_name_en,
        'first_name_en', jb.pi_first_name_en,
        'institution', jb.pi_institution,
        'institution_en', jb.pi_institution_en,
        'division', jb.pi_division,
        'division_en', jb.pi_division_en
      ),
      'create_date', jb.create_date
    ),
    'components', comp.components,
    'status_history', stat.status_history,
    'submit_date', sub.submit_date
  )
  ORDER BY jb.jdu_id
)
FROM jdu_base jb
LEFT JOIN jdu_jgad jgad ON jb.jdu_id = jgad.jdu_id
LEFT JOIN jdu_jgas jgas ON jb.jdu_id = jgas.jdu_id
LEFT JOIN jdu_hum hum ON jb.jdu_id = hum.jdu_id
LEFT JOIN jdu_components comp ON jb.jdu_id = comp.jdu_id
LEFT JOIN jdu_status stat ON jb.jdu_id = stat.jdu_id
LEFT JOIN jdu_submit sub ON jb.jdu_id = sub.jdu_id;
" | jq '.' > "$OUTPUT_DIR/du-applications.json"

echo "  -> $(jq 'length' "$OUTPUT_DIR/du-applications.json") J-DU records"

# ==============================================================================
# Summary
# ==============================================================================
echo ""
echo "=== Export Complete ==="
echo "Output files:"
ls -lh "$OUTPUT_DIR"/*.json
