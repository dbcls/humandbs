#!/bin/bash
# Extract unique field values from extracted-json dataset files for debugging/analysis
# Usage: ./scripts/inspect-extracted-json.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/../crawler-results"
JSON_DIR="$RESULTS_DIR/extracted-json/dataset"
OUT_DIR="$RESULTS_DIR/extracted-field-analysis"

if [ ! -d "$JSON_DIR" ]; then
  echo "Error: $JSON_DIR not found. Run 'bun run crawler:llm-extract' first."
  exit 1
fi

mkdir -p "$OUT_DIR/searchable" "$OUT_DIR/extracted"

# --- Searchable fields (dataset-level aggregation) ---

extract_searchable() {
  local field="$1"
  local output_name="$2"

  echo "  - $output_name"
  jq -r ".searchable.$field // empty" "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/searchable/$output_name.txt"
}

echo "Extracting searchable fields..."

# Diseases (array of {label, icd10})
echo "  - diseases"
jq -r '.searchable.diseases[]? | if .icd10 then "\(.label) (\(.icd10))" else .label end' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/searchable/diseases.txt"

# String arrays
extract_searchable 'tissues[]?' "tissues"
extract_searchable 'populations[]?' "populations"
extract_searchable 'assayTypes[]?' "assayTypes"
extract_searchable 'readTypes[]?' "readTypes"
extract_searchable 'fileTypes[]?' "fileTypes"

# Platforms (array of {vendor, model})
echo "  - platforms"
jq -r '.searchable.platforms[]? | "\(.vendor) / \(.model)"' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/searchable/platforms.txt"

# Scalar values
extract_searchable "totalSubjectCount" "totalSubjectCount"

echo "  - totalDataVolume"
jq -r '.searchable.totalDataVolume? | select(. != null) | "\(.value) \(.unit)"' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/searchable/totalDataVolume.txt"

# Boolean flags
extract_searchable "hasHealthyControl" "hasHealthyControl"
extract_searchable "hasTumor" "hasTumor"
extract_searchable "hasCellLine" "hasCellLine"

# --- Extracted fields (experiment-level) ---

extract_experiment() {
  local field="$1"
  local output_name="$2"

  echo "  - $output_name"
  jq -r ".experiments[]?.extracted.$field // empty" "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/extracted/$output_name.txt"
}

echo ""
echo "Extracting experiment-level extracted fields..."

# Subject/sample info
extract_experiment "subjectCount" "subjectCount"
extract_experiment "subjectCountType" "subjectCountType"
extract_experiment "healthStatus" "healthStatus"

# Diseases (array of {label, icd10})
echo "  - diseases"
jq -r '.experiments[]?.extracted.diseases[]? | if .icd10 then "\(.label) (\(.icd10))" else .label end' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/extracted/diseases.txt"

# Biological sample info
extract_experiment 'tissues[]?' "tissues"
extract_experiment "isTumor" "isTumor"
extract_experiment "cellLine" "cellLine"
extract_experiment "population" "population"

# Experimental method
extract_experiment "assayType" "assayType"
extract_experiment 'libraryKits[]?' "libraryKits"

# Platform
extract_experiment "platformVendor" "platformVendor"
extract_experiment "platformModel" "platformModel"
extract_experiment "readType" "readType"
extract_experiment "readLength" "readLength"

# Target region
extract_experiment "targets" "targets"

# Data info
extract_experiment 'fileTypes[]?' "fileTypes"
echo "  - dataVolume"
jq -r '.experiments[]?.extracted.dataVolume? | select(. != null) | "\(.value) \(.unit)"' "$JSON_DIR"/*.json 2>/dev/null | sort | uniq > "$OUT_DIR/extracted/dataVolume.txt"

# --- Summary ---

echo ""
echo "Output directory: $OUT_DIR"
echo ""
echo "File counts (lines per file):"
for section in searchable extracted; do
  echo "  $section:"
  wc -l "$OUT_DIR/$section"/*.txt 2>/dev/null | tail -1 || echo "    No files"
done
