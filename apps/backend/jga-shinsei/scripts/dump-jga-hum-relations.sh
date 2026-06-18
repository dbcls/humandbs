#!/bin/bash
# Dump JGA Study/Dataset <-> hum-id relations as preserve-format TSV
#
# Output:
#   - $OUTPUT_DIR/jga_study_hum_id.tsv   : JGAS <-> hum-id (headerless TSV)
#   - $OUTPUT_DIR/jga_dataset_hum_id.tsv : JGAD <-> hum-id (headerless TSV)
#
# Data source (DS route):
#   Direct: nbdc_application.hum_id -> submission_permission -> entry -> relation -> accession
#   JGAS bridge (JGAD only): JGAD -> sibling JGAS in same entry -> same JGAS in
#     another entry -> submission -> submission_permission -> hum_id
#   (metadata XML を経由しない経路)
#
# Filter:
#   current_accession_status.accession_status = 2098186 (public/live) のみ出力
#   See docs/database-schema.md for details on accession_status bit flags
#
# Usage:
#   ./scripts/dump-jga-hum-relations.sh
#
# Environment (see env.template):
#   JGA_DB_HOST     - PostgreSQL host (required)
#   JGA_DB_PORT     - PostgreSQL port (default: 5432)
#   JGA_DB_USER     - PostgreSQL user (required)
#   JGA_DB_PASSWORD - PostgreSQL password (required)
#   JGA_DB_NAME     - PostgreSQL database name (default: jgadb)
#   JGA_DB_SCHEMA   - PostgreSQL schema name (default: jgasys)
#   JGA_HUM_REL_OUTPUT_DIR - TSV output directory (default: ~/jga-relation)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$SCRIPT_DIR/.."

# Load .env if exists
if [[ -f "$BASE_DIR/.env" ]]; then
  # shellcheck source=/dev/null
  source "$BASE_DIR/.env"
fi

# Validate required variables
if [[ -z "${JGA_DB_HOST:-}" ]]; then
  echo "Error: JGA_DB_HOST is required" >&2
  exit 1
fi
if [[ -z "${JGA_DB_USER:-}" ]]; then
  echo "Error: JGA_DB_USER is required" >&2
  exit 1
fi
if [[ -z "${JGA_DB_PASSWORD:-}" ]]; then
  echo "Error: JGA_DB_PASSWORD is required" >&2
  exit 1
fi

# Set defaults
DB_HOST="${JGA_DB_HOST}"
DB_PORT="${JGA_DB_PORT:-5432}"
DB_USER="${JGA_DB_USER}"
DB_NAME="${JGA_DB_NAME:-jgadb}"
DB_SCHEMA="${JGA_DB_SCHEMA:-jgasys}"
export PGPASSWORD="${JGA_DB_PASSWORD}"

OUTPUT_DIR="${JGA_HUM_REL_OUTPUT_DIR:-$HOME/jga-relation}"
mkdir -p "$OUTPUT_DIR"

# accession_status = 2098186 = public/live (bit21 + bit3)
ACCESSION_STATUS_PUBLIC=2098186

echo "=== JGA <-> hum-id Relation Dump ==="
echo "Host:     $DB_HOST:$DB_PORT"
echo "Database: $DB_NAME (schema: $DB_SCHEMA, user: $DB_USER)"
echo "Filter:   accession_status = $ACCESSION_STATUS_PUBLIC (public/live)"
echo "Output:   $OUTPUT_DIR"
echo ""

# Helper: run psql with connection params, output tuples only with no alignment
run_psql() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-align --tuples-only --field-separator=$'\t' \
    -c "$1"
}

# JGAS <-> hum-id
echo "[1/2] Dumping JGAS <-> hum-id..."

run_psql "
SELECT DISTINCT a.accession, na.hum_id
FROM ${DB_SCHEMA}.nbdc_application na
JOIN ${DB_SCHEMA}.submission_permission sp ON na.appl_id = sp.appl_id
JOIN ${DB_SCHEMA}.submission s ON sp.submission_id = s.submission_id
JOIN ${DB_SCHEMA}.entry e ON s.submission_id = e.submission_id
JOIN ${DB_SCHEMA}.relation r ON e.entry_id = r.entry_id
JOIN ${DB_SCHEMA}.accession a ON r.self = a.accession_id
JOIN ${DB_SCHEMA}.current_accession_status cas ON a.accession = cas.accession
WHERE na.hum_id IS NOT NULL
  AND na.hum_id != ''
  AND na.hum_id != 'N/A'
  AND a.accession LIKE 'JGAS%'
  AND cas.accession_status = ${ACCESSION_STATUS_PUBLIC}
ORDER BY a.accession, na.hum_id;
" > "$OUTPUT_DIR/jga_study_hum_id.tsv"

JGAS_COUNT=$(wc -l < "$OUTPUT_DIR/jga_study_hum_id.tsv")
echo "  -> $JGAS_COUNT pairs"

# JGAD <-> hum-id
echo "[2/2] Dumping JGAD <-> hum-id..."

run_psql "
WITH direct AS (
  SELECT DISTINCT a.accession, na.hum_id
  FROM ${DB_SCHEMA}.nbdc_application na
  JOIN ${DB_SCHEMA}.submission_permission sp ON na.appl_id = sp.appl_id
  JOIN ${DB_SCHEMA}.submission s ON sp.submission_id = s.submission_id
  JOIN ${DB_SCHEMA}.entry e ON s.submission_id = e.submission_id
  JOIN ${DB_SCHEMA}.relation r ON e.entry_id = r.entry_id
  JOIN ${DB_SCHEMA}.accession a ON r.self = a.accession_id
  JOIN ${DB_SCHEMA}.current_accession_status cas ON a.accession = cas.accession
  WHERE na.hum_id IS NOT NULL
    AND na.hum_id != ''
    AND na.hum_id != 'N/A'
    AND a.accession LIKE 'JGAD%'
    AND cas.accession_status = ${ACCESSION_STATUS_PUBLIC}
),
missing AS (
  SELECT a.accession_id, a.accession
  FROM ${DB_SCHEMA}.accession a
  JOIN ${DB_SCHEMA}.current_accession_status cas ON a.accession = cas.accession
  WHERE a.accession LIKE 'JGAD%'
    AND cas.accession_status = ${ACCESSION_STATUS_PUBLIC}
    AND a.accession NOT IN (SELECT accession FROM direct)
),
sibling_jgas AS (
  SELECT DISTINCT m.accession, a_jgas.accession_id AS jgas_id
  FROM missing m
  JOIN ${DB_SCHEMA}.relation r1 ON r1.self = m.accession_id
  JOIN ${DB_SCHEMA}.relation r2 ON r2.entry_id = r1.entry_id AND r2.self != r1.self
  JOIN ${DB_SCHEMA}.accession a_jgas ON r2.self = a_jgas.accession_id
  WHERE a_jgas.accession LIKE 'JGAS%'
),
jgas_hum AS (
  SELECT DISTINCT sj.accession, na.hum_id
  FROM sibling_jgas sj
  JOIN ${DB_SCHEMA}.relation r ON r.self = sj.jgas_id
  JOIN ${DB_SCHEMA}.entry e ON r.entry_id = e.entry_id
  JOIN ${DB_SCHEMA}.submission s ON e.submission_id = s.submission_id
  JOIN ${DB_SCHEMA}.submission_permission sp ON s.submission_id = sp.submission_id
  JOIN ${DB_SCHEMA}.nbdc_application na ON sp.appl_id = na.appl_id
  WHERE na.hum_id IS NOT NULL
    AND na.hum_id != ''
    AND na.hum_id != 'N/A'
)
SELECT accession, hum_id FROM direct
UNION
SELECT accession, hum_id FROM jgas_hum
ORDER BY 1, 2;
" > "$OUTPUT_DIR/jga_dataset_hum_id.tsv"

JGAD_COUNT=$(wc -l < "$OUTPUT_DIR/jga_dataset_hum_id.tsv")
echo "  -> $JGAD_COUNT pairs"

echo ""
echo "=== Done ==="
echo "Output files:"
ls -lh "$OUTPUT_DIR"/jga_*_hum_id.tsv
