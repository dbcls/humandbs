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
-- Direct: JGAD in entries under submissions with valid hum_id
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
UNION
-- JGAS bridge: JGAD -> sibling JGAS in same entry -> same JGAS in another entry -> hum_id
-- Covers JGADs under submissions where hum_id is NULL (e.g. J-DS000659)
SELECT DISTINCT a_jgad.accession, na.hum_id
FROM ${DB_SCHEMA}.relation r_jgad
JOIN ${DB_SCHEMA}.accession a_jgad ON r_jgad.self = a_jgad.accession_id
JOIN ${DB_SCHEMA}.relation r_jgas_local
  ON r_jgad.entry_id = r_jgas_local.entry_id
JOIN ${DB_SCHEMA}.accession a_jgas
  ON r_jgas_local.self = a_jgas.accession_id
JOIN ${DB_SCHEMA}.relation r_jgas_remote
  ON a_jgas.accession_id = r_jgas_remote.self
  AND r_jgas_remote.entry_id != r_jgad.entry_id
JOIN ${DB_SCHEMA}.entry e ON r_jgas_remote.entry_id = e.entry_id
JOIN ${DB_SCHEMA}.submission s ON e.submission_id = s.submission_id
JOIN ${DB_SCHEMA}.submission_permission sp ON s.submission_id = sp.submission_id
JOIN ${DB_SCHEMA}.nbdc_application na ON sp.appl_id = na.appl_id
JOIN ${DB_SCHEMA}.current_accession_status cas
  ON a_jgad.accession = cas.accession
WHERE a_jgad.accession LIKE 'JGAD%'
  AND a_jgas.accession LIKE 'JGAS%'
  AND na.hum_id IS NOT NULL
  AND na.hum_id != ''
  AND na.hum_id != 'N/A'
  AND cas.accession_status = ${ACCESSION_STATUS_PUBLIC}
ORDER BY 1, 2;
" > "$OUTPUT_DIR/jga_dataset_hum_id.tsv"

JGAD_COUNT=$(wc -l < "$OUTPUT_DIR/jga_dataset_hum_id.tsv")
echo "  -> $JGAD_COUNT pairs"

echo ""
echo "=== Done ==="
echo "Output files:"
ls -lh "$OUTPUT_DIR"/jga_*_hum_id.tsv
