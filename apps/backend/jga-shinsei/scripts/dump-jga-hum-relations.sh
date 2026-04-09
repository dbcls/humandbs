#!/bin/bash
# Dump JGA Study/Dataset <-> hum-id relations as preserve-format TSV
#
# Output:
#   - $OUTPUT_DIR/jga_study_hum_id.tsv   : JGAS <-> hum-id (headerless TSV)
#   - $OUTPUT_DIR/jga_dataset_hum_id.tsv : JGAD <-> hum-id (headerless TSV)
#
# Data source:
#   nbdc_application.hum_id -> submission_permission -> relation -> accession
#   (metadata XML を経由しない経路)
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

echo "=== JGA <-> hum-id Relation Dump ==="
echo "Host:     $DB_HOST:$DB_PORT"
echo "Database: $DB_NAME (schema: $DB_SCHEMA, user: $DB_USER)"
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
WHERE na.hum_id IS NOT NULL
  AND na.hum_id != ''
  AND na.hum_id != 'N/A'
  AND a.accession LIKE 'JGAS%'
ORDER BY a.accession, na.hum_id;
" > "$OUTPUT_DIR/jga_study_hum_id.tsv"

JGAS_COUNT=$(wc -l < "$OUTPUT_DIR/jga_study_hum_id.tsv")
echo "  -> $JGAS_COUNT pairs"

# JGAD <-> hum-id
echo "[2/2] Dumping JGAD <-> hum-id..."

run_psql "
SELECT DISTINCT a.accession, na.hum_id
FROM ${DB_SCHEMA}.nbdc_application na
JOIN ${DB_SCHEMA}.submission_permission sp ON na.appl_id = sp.appl_id
JOIN ${DB_SCHEMA}.submission s ON sp.submission_id = s.submission_id
JOIN ${DB_SCHEMA}.entry e ON s.submission_id = e.submission_id
JOIN ${DB_SCHEMA}.relation r ON e.entry_id = r.entry_id
JOIN ${DB_SCHEMA}.accession a ON r.self = a.accession_id
WHERE na.hum_id IS NOT NULL
  AND na.hum_id != ''
  AND na.hum_id != 'N/A'
  AND a.accession LIKE 'JGAD%'
ORDER BY a.accession, na.hum_id;
" > "$OUTPUT_DIR/jga_dataset_hum_id.tsv"

JGAD_COUNT=$(wc -l < "$OUTPUT_DIR/jga_dataset_hum_id.tsv")
echo "  -> $JGAD_COUNT pairs"

echo ""
echo "=== Done ==="
echo "Output files:"
ls -lh "$OUTPUT_DIR"/jga_*_hum_id.tsv
