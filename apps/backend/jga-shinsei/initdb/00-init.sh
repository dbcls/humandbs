#!/bin/bash
set -e

DB_FILE="${JGA_DB_FILE:-jgadb_staging_20250422.sql}"

echo "=== JGA Shinsei DB Import ==="
echo "Importing from: /dumps/$DB_FILE"
echo "This may take a long time (20GB dump)..."

psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "/dumps/$DB_FILE"

echo "=== Import completed! ==="
