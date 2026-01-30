#!/bin/bash
# Extract unique LLM-extracted field values from structured-json dataset files for debugging/analysis
# Usage: ./scripts/inspect-llm-extracted-fields.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/../crawler-results"
JSON_DIR="$RESULTS_DIR/structured-json/dataset"
OUT_DIR="$RESULTS_DIR/llm-extracted-field-analysis"

if [ ! -d "$JSON_DIR" ]; then
  echo "Error: $JSON_DIR not found. Run 'bun run crawler:structure' first."
  exit 1
fi

mkdir -p "$OUT_DIR"

# --- LLM-extracted fields (experiment-level, from experiments[].searchable) ---

extract_field() {
  local field="$1"
  local output_name="$2"

  echo "  - $output_name"
  jq -r ".experiments[]?.searchable.$field // empty" "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/$output_name.txt"
}

echo "Extracting LLM-extracted fields from experiments[].searchable..."

# Subject/sample info
extract_field "subjectCount" "subjectCount"
extract_field "subjectCountType" "subjectCountType"
extract_field "healthStatus" "healthStatus"

# Diseases (array of {label, icd10})
echo "  - diseases"
jq -r '.experiments[]?.searchable.diseases[]? | if .icd10 then "\(.label) (\(.icd10))" else .label end' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/diseases.txt"

# Biological sample info
extract_field 'tissues[]?' "tissues"
extract_field "isTumor" "isTumor"
extract_field "cellLine" "cellLine"
extract_field "population" "population"

# Experimental method
extract_field "assayType" "assayType"
extract_field 'libraryKits[]?' "libraryKits"

# Platform
extract_field "platformVendor" "platformVendor"
extract_field "platformModel" "platformModel"
extract_field "readType" "readType"
extract_field "readLength" "readLength"

# Target region
extract_field "targets" "targets"

# Data info
extract_field 'fileTypes[]?' "fileTypes"
echo "  - dataVolume"
jq -r '.experiments[]?.searchable.dataVolume? | select(. != null) | "\(.value) \(.unit)"' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/dataVolume.txt"

# Policies (rule-based, not LLM-extracted, but included for completeness)
echo "  - policies"
jq -r '.experiments[]?.searchable.policies[]? | "\(.id): \(.name.en // .name.ja)"' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/policies.txt"

# --- Summary ---

echo ""
echo "Output directory: $OUT_DIR"
echo ""
echo "File counts (lines per file):"
wc -l "$OUT_DIR"/*.txt 2>/dev/null | sort -n
