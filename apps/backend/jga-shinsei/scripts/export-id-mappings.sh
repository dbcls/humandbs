#!/bin/bash
# Export various ID mappings (hum_id, JSUB, J-DS, J-DU)
# Output:
#   - jga-hum-mapping.json      : JGA ↔ hum_id
#   - jsub-jga-mapping.json     : JSUB ↔ JGA accession
#   - jds-jga-mapping.json      : J-DS ↔ JGA accession
#   - jdu-jgad-mapping.json     : J-DU ↔ JGAD
#   - jsub-relations.json       : JSUB → hum_id, J-DS, J-DU (JSUB 基準)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../output"
CONTAINER_NAME="${1:-humandbs-jga-shinsei-db}"

mkdir -p "$OUTPUT_DIR"

# 1. hum_id <-> JGA mapping
echo "Exporting hum_id <-> JGA mapping..."
docker exec "$CONTAINER_NAME" psql -U postgres -d jgadb -t -A -F'	' -c "
SELECT DISTINCT
  a.accession as jga_accession,
  substring(m.metadata from 'nbdc_number=\"([^\"]+)\"') as hum_id
FROM ts_jgasys.metadata m
JOIN ts_jgasys.accession a ON m.accession_id = a.accession_id
WHERE m.metadata LIKE '%nbdc_number%'
  AND a.accession LIKE 'JGA%'
  AND a.accession NOT LIKE 'JGAC%'
  AND a.accession NOT LIKE 'JGAP%'
ORDER BY hum_id, a.accession;
" | jq -R -s '
  split("\n") | map(select(length > 0)) | map(split("\t")) |
  map({
    jga_accession: .[0],
    hum_id: .[1]
  })
' > "$OUTPUT_DIR/jga-hum-mapping.json"
echo "  Records: $(jq length "$OUTPUT_DIR/jga-hum-mapping.json")"

# 2. JSUB <-> JGA mapping
echo "Exporting JSUB <-> JGA mapping..."
docker exec "$CONTAINER_NAME" psql -U postgres -d jgadb -t -A -F'	' -c "
SELECT
  substring(alias from 'JSUB[0-9]+') as jsub_id,
  substring(alias from '_([A-Za-z]+)_') as type,
  accession as jga_accession
FROM ts_jgasys.accession
WHERE alias LIKE 'JSUB%'
  AND accession NOT LIKE 'JSUB%'
ORDER BY jsub_id, type, accession;
" | jq -R -s '
  split("\n") | map(select(length > 0)) | map(split("\t")) |
  map({
    jsub_id: .[0],
    type: .[1],
    jga_accession: .[2]
  })
' > "$OUTPUT_DIR/jsub-jga-mapping.json"
echo "  Records: $(jq length "$OUTPUT_DIR/jsub-jga-mapping.json")"

# 3. J-DS <-> JGA mapping
echo "Exporting J-DS <-> JGA mapping..."
docker exec "$CONTAINER_NAME" psql -U postgres -d jgadb -t -A -F'	' -c "
SELECT DISTINCT
  nam.ds_du_id as jds_id,
  a.accession as jga_accession
FROM ts_jgasys.nbdc_application_master nam
JOIN ts_jgasys.submission s ON nam.account_group = s.group_id
JOIN ts_jgasys.entry e ON s.submission_id = e.submission_id
JOIN ts_jgasys.relation r ON e.entry_id = r.entry_id
JOIN ts_jgasys.accession a ON r.self = a.accession_id
WHERE nam.data_type = 1
  AND a.accession NOT LIKE 'JSUB%'
ORDER BY nam.ds_du_id, a.accession;
" | jq -R -s '
  split("\n") | map(select(length > 0)) | map(split("\t")) |
  map({
    jds_id: .[0],
    jga_accession: .[1]
  })
' > "$OUTPUT_DIR/jds-jga-mapping.json"
echo "  Records: $(jq length "$OUTPUT_DIR/jds-jga-mapping.json")"

# 4. J-DU <-> JGAD mapping
echo "Exporting J-DU <-> JGAD mapping..."
docker exec "$CONTAINER_NAME" psql -U postgres -d jgadb -t -A -F'	' -c "
SELECT DISTINCT
  na.ds_du_id as jdu_id,
  a.accession as jgad_accession
FROM ts_jgasys.use_permission up
JOIN ts_jgasys.nbdc_application na ON up.appl_id = na.appl_id
JOIN ts_jgasys.accession a ON up.dataset_id = a.accession_id
WHERE na.ds_du_id LIKE 'J-DU%'
ORDER BY na.ds_du_id, a.accession;
" | jq -R -s '
  split("\n") | map(select(length > 0)) | map(split("\t")) |
  map({
    jdu_id: .[0],
    jgad_accession: .[1]
  })
' > "$OUTPUT_DIR/jdu-jgad-mapping.json"
echo "  Records: $(jq length "$OUTPUT_DIR/jdu-jgad-mapping.json")"

# 5. JSUB -> hum_id mapping
echo "Exporting JSUB -> hum_id mapping..."
docker exec "$CONTAINER_NAME" psql -U postgres -d jgadb -t -A -F'	' -c "
SELECT DISTINCT
  substring(a.alias from 'JSUB[0-9]+') as jsub_id,
  substring(m.metadata from 'nbdc_number=\"([^\"]+)\"') as hum_id
FROM ts_jgasys.accession a
JOIN ts_jgasys.metadata m ON a.accession_id = m.accession_id
WHERE a.alias LIKE 'JSUB%'
  AND m.metadata LIKE '%nbdc_number%'
ORDER BY jsub_id, hum_id;
" | jq -R -s '
  split("\n") | map(select(length > 0)) | map(split("\t")) |
  map({
    jsub_id: .[0],
    hum_id: .[1]
  })
' > "$OUTPUT_DIR/jsub-hum-mapping.json"
echo "  Records: $(jq length "$OUTPUT_DIR/jsub-hum-mapping.json")"

# 6. JSUB -> J-DS mapping (via group_id)
echo "Exporting JSUB -> J-DS mapping..."
docker exec "$CONTAINER_NAME" psql -U postgres -d jgadb -t -A -F'	' -c "
SELECT DISTINCT
  substring(a.alias from 'JSUB[0-9]+') as jsub_id,
  nam.ds_du_id as jds_id,
  s.group_id
FROM ts_jgasys.accession a
JOIN ts_jgasys.relation r ON a.accession_id = r.self
JOIN ts_jgasys.entry e ON r.entry_id = e.entry_id
JOIN ts_jgasys.submission s ON e.submission_id = s.submission_id
JOIN ts_jgasys.nbdc_application_master nam ON nam.account_group = s.group_id
WHERE a.alias LIKE 'JSUB%'
  AND nam.data_type = 1
ORDER BY jsub_id, jds_id;
" | jq -R -s '
  split("\n") | map(select(length > 0)) | map(split("\t")) |
  map({
    jsub_id: .[0],
    jds_id: .[1],
    group_id: .[2]
  })
' > "$OUTPUT_DIR/jsub-jds-mapping.json"
echo "  Records: $(jq length "$OUTPUT_DIR/jsub-jds-mapping.json")"

# 7. JSUB -> J-DU mapping (via JGAD)
echo "Exporting JSUB -> J-DU mapping..."
docker exec "$CONTAINER_NAME" psql -U postgres -d jgadb -t -A -F'	' -c "
SELECT DISTINCT
  substring(a.alias from 'JSUB[0-9]+') as jsub_id,
  na.ds_du_id as jdu_id,
  a.accession as jgad_accession
FROM ts_jgasys.accession a
JOIN ts_jgasys.use_permission up ON a.accession_id = up.dataset_id
JOIN ts_jgasys.nbdc_application na ON up.appl_id = na.appl_id
WHERE a.alias LIKE 'JSUB%_Dataset_%'
  AND a.accession LIKE 'JGAD%'
  AND na.ds_du_id LIKE 'J-DU%'
ORDER BY jsub_id, jdu_id;
" | jq -R -s '
  split("\n") | map(select(length > 0)) | map(split("\t")) |
  map({
    jsub_id: .[0],
    jdu_id: .[1],
    jgad_accession: .[2]
  })
' > "$OUTPUT_DIR/jsub-jdu-mapping.json"
echo "  Records: $(jq length "$OUTPUT_DIR/jsub-jdu-mapping.json")"

# 8. JSUB relations summary (aggregated)
echo "Exporting JSUB relations summary..."
docker exec "$CONTAINER_NAME" psql -U postgres -d jgadb -t -A -F'	' -c "
WITH jsub_hum AS (
  SELECT DISTINCT
    substring(a.alias from 'JSUB[0-9]+') as jsub_id,
    substring(m.metadata from 'nbdc_number=\"([^\"]+)\"') as hum_id
  FROM ts_jgasys.accession a
  JOIN ts_jgasys.metadata m ON a.accession_id = m.accession_id
  WHERE a.alias LIKE 'JSUB%'
    AND m.metadata LIKE '%nbdc_number%'
),
jsub_jds AS (
  SELECT DISTINCT
    substring(a.alias from 'JSUB[0-9]+') as jsub_id,
    nam.ds_du_id as jds_id
  FROM ts_jgasys.accession a
  JOIN ts_jgasys.relation r ON a.accession_id = r.self
  JOIN ts_jgasys.entry e ON r.entry_id = e.entry_id
  JOIN ts_jgasys.submission s ON e.submission_id = s.submission_id
  JOIN ts_jgasys.nbdc_application_master nam ON nam.account_group = s.group_id
  WHERE a.alias LIKE 'JSUB%'
    AND nam.data_type = 1
),
jsub_jdu AS (
  SELECT DISTINCT
    substring(a.alias from 'JSUB[0-9]+') as jsub_id,
    na.ds_du_id as jdu_id
  FROM ts_jgasys.accession a
  JOIN ts_jgasys.use_permission up ON a.accession_id = up.dataset_id
  JOIN ts_jgasys.nbdc_application na ON up.appl_id = na.appl_id
  WHERE a.alias LIKE 'JSUB%_Dataset_%'
    AND a.accession LIKE 'JGAD%'
    AND na.ds_du_id LIKE 'J-DU%'
),
jsub_list AS (
  SELECT DISTINCT substring(alias from 'JSUB[0-9]+') as jsub_id
  FROM ts_jgasys.accession
  WHERE alias LIKE 'JSUB%'
    AND accession NOT LIKE 'JSUB%'
)
SELECT
  j.jsub_id,
  COALESCE(string_agg(DISTINCT h.hum_id, ','), '') as hum_ids,
  COALESCE(string_agg(DISTINCT ds.jds_id, ','), '') as jds_ids,
  COALESCE(string_agg(DISTINCT du.jdu_id, ','), '') as jdu_ids
FROM jsub_list j
LEFT JOIN jsub_hum h ON j.jsub_id = h.jsub_id
LEFT JOIN jsub_jds ds ON j.jsub_id = ds.jsub_id
LEFT JOIN jsub_jdu du ON j.jsub_id = du.jsub_id
GROUP BY j.jsub_id
ORDER BY j.jsub_id;
" | jq -R -s '
  split("\n") | map(select(length > 0)) | map(split("\t")) |
  map({
    jsub_id: .[0],
    hum_ids: (.[1] | if . == "" then [] else split(",") end),
    jds_ids: (.[2] | if . == "" then [] else split(",") end),
    jdu_ids: (.[3] | if . == "" then [] else split(",") end)
  })
' > "$OUTPUT_DIR/jsub-relations.json"
echo "  Records: $(jq length "$OUTPUT_DIR/jsub-relations.json")"

echo ""
echo "All mappings exported to: $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR/"
