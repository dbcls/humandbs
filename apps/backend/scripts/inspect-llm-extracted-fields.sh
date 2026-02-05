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

extract_scalar() {
  local field="$1"
  local output_name="$2"

  echo "  - $output_name"
  jq -r ".experiments[]?.searchable.$field // empty" "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/$output_name.txt"
}

extract_array() {
  local field="$1"
  local output_name="$2"

  echo "  - $output_name"
  jq -r ".experiments[]?.searchable.${field}[]? // empty" "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/$output_name.txt"
}

echo "Extracting LLM-extracted fields from experiments[].searchable..."

# --- Subject/sample info ---
extract_scalar "subjectCount" "subjectCount"
extract_scalar "subjectCountType" "subjectCountType"
extract_scalar "healthStatus" "healthStatus"

# --- Disease info (array of {label, icd10}) ---
echo "  - diseases"
jq -r '.experiments[]?.searchable.diseases[]? | if .icd10 then "\(.label) (\(.icd10))" else .label end' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/diseases.txt"

# --- Biological sample info ---
extract_array "tissues" "tissues"
extract_scalar "isTumor" "isTumor"
extract_array "cellLine" "cellLine"
extract_array "population" "population"

# --- Demographics ---
extract_scalar "sex" "sex"
extract_scalar "ageGroup" "ageGroup"

# --- Experimental method ---
extract_array "assayType" "assayType"
extract_array "libraryKits" "libraryKits"

# --- Platform (array of {vendor, model}) ---
echo "  - platforms (vendor)"
jq -r '.experiments[]?.searchable.platforms[]?.vendor // empty' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/platforms_vendor.txt"
echo "  - platforms (model)"
jq -r '.experiments[]?.searchable.platforms[]?.model // empty' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/platforms_model.txt"
echo "  - platforms (combined)"
jq -r '.experiments[]?.searchable.platforms[]? | "\(.vendor) / \(.model)"' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/platforms_combined.txt"

extract_scalar "readType" "readType"
extract_scalar "readLength" "readLength"

# --- Sequencing quality ---
extract_scalar "sequencingDepth" "sequencingDepth"
extract_scalar "targetCoverage" "targetCoverage"
extract_array "referenceGenome" "referenceGenome"

# --- Variant data ---
echo "  - variantCounts"
jq -r '.experiments[]?.searchable.variantCounts? | select(. != null) | "snv=\(.snv // "null"), indel=\(.indel // "null"), cnv=\(.cnv // "null"), sv=\(.sv // "null"), total=\(.total // "null")"' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/variantCounts.txt"
extract_scalar "hasPhenotypeData" "hasPhenotypeData"

# --- Target region ---
extract_scalar "targets" "targets"

# --- Data info ---
extract_array "fileTypes" "fileTypes"
extract_array "processedDataTypes" "processedDataTypes"
extract_scalar "dataVolumeGb" "dataVolumeGb"

# --- Policies (rule-based, not LLM-extracted, but included for completeness) ---
echo "  - policies"
jq -r '.experiments[]?.searchable.policies[]? | "\(.id): \(.name.en // .name.ja)"' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/policies.txt"

# --- Summary ---

echo ""
echo "Output directory: $OUT_DIR"
echo ""
echo "File counts (lines per file):"
wc -l "$OUT_DIR"/*.txt 2>/dev/null | sort -n
