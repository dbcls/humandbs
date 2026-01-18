#!/bin/bash
# Extract unique field values from normalized detail-json files for analysis
# Usage: ./scripts/extract-field-values-normalized.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/../crawler-results"
JSON_DIR="$RESULTS_DIR/detail-json-normalized"
OUT_DIR="$RESULTS_DIR/field-analysis-normalized"

if [ ! -d "$JSON_DIR" ]; then
  echo "Error: $JSON_DIR not found. Run 'bun run src/crawler/normalize.ts' first."
  exit 1
fi

mkdir -p "$OUT_DIR/ja" "$OUT_DIR/en"

extract_field() {
  local lang="$1"
  local field="$2"
  local output_name="$3"

  echo "  - $output_name"
  jq -r "$field // empty" "$JSON_DIR"/*-"$lang".json 2>/dev/null | sort | uniq > "$OUT_DIR/$lang/$output_name.txt"
}

echo "Extracting field values from normalized JSON..."

for lang in ja en; do
  echo "Processing $lang..."

  # Summary
  extract_field "$lang" '.summary.aims.text' "summary-aims-text"
  extract_field "$lang" '.summary.methods.text' "summary-methods-text"
  extract_field "$lang" '.summary.targets.text' "summary-targets-text"
  extract_field "$lang" '.summary.url[].text' "summary-url-text"
  extract_field "$lang" '.summary.url[].url' "summary-url-url"
  # Normalized: datasetId is now string[]
  extract_field "$lang" '.summary.datasets[].datasetId[]?' "summary-datasets-datasetId"
  extract_field "$lang" '.summary.datasets[].typeOfData' "summary-datasets-typeOfData"
  # Normalized: criteria is now CriteriaCanonical[]
  extract_field "$lang" '.summary.datasets[].criteria[]?' "summary-datasets-criteria"
  # Normalized: releaseDate is now string[] (YYYY-MM-DD format)
  extract_field "$lang" '.summary.datasets[].releaseDate[]?' "summary-datasets-releaseDate"
  extract_field "$lang" '.summary.footers[].text' "summary-footers-text"

  # Molecular Data
  extract_field "$lang" '.molecularData[].id.text' "molecularData-id-text"
  extract_field "$lang" '.molecularData[].data | keys[]' "molecularData-data-keys"
  # Normalized: data values can be TextValue or TextValue[]
  extract_field "$lang" '.molecularData[].data | to_entries[] | select(.value != null) | .value | if type == "array" then .[].text else .text end' "molecularData-data-values-text"
  extract_field "$lang" '.molecularData[].footers[].text' "molecularData-footers-text"

  # Data Provider
  extract_field "$lang" '.dataProvider.principalInvestigator[].text' "dataProvider-principalInvestigator-text"
  extract_field "$lang" '.dataProvider.affiliation[].text' "dataProvider-affiliation-text"
  extract_field "$lang" '.dataProvider.projectName[].text' "dataProvider-projectName-text"
  extract_field "$lang" '.dataProvider.projectUrl[].text' "dataProvider-projectUrl-text"
  extract_field "$lang" '.dataProvider.projectUrl[].url' "dataProvider-projectUrl-url"
  extract_field "$lang" '.dataProvider.grants[].grantName' "dataProvider-grants-grantName"
  extract_field "$lang" '.dataProvider.grants[].projectTitle' "dataProvider-grants-projectTitle"
  # Normalized: grantId is now string[] | null
  extract_field "$lang" '.dataProvider.grants[].grantId[]?' "dataProvider-grants-grantId"

  # Publications
  extract_field "$lang" '.publications[].title' "publications-title"
  extract_field "$lang" '.publications[].doi' "publications-doi"
  extract_field "$lang" '.publications[].datasetIds[]' "publications-datasetIds"

  # Controlled Access Users
  extract_field "$lang" '.controlledAccessUsers[].principalInvestigator' "controlledAccessUsers-principalInvestigator"
  extract_field "$lang" '.controlledAccessUsers[].affiliation' "controlledAccessUsers-affiliation"
  extract_field "$lang" '.controlledAccessUsers[].country' "controlledAccessUsers-country"
  extract_field "$lang" '.controlledAccessUsers[].researchTitle' "controlledAccessUsers-researchTitle"
  extract_field "$lang" '.controlledAccessUsers[].datasetIds[]' "controlledAccessUsers-datasetIds"
  # Normalized: periodOfDataUse is now { startDate, endDate }
  extract_field "$lang" '.controlledAccessUsers[].periodOfDataUse | select(. != null) | "\(.startDate) - \(.endDate)"' "controlledAccessUsers-periodOfDataUse"
  extract_field "$lang" '.controlledAccessUsers[].periodOfDataUse.startDate | select(. != null)' "controlledAccessUsers-periodOfDataUse-startDate"
  extract_field "$lang" '.controlledAccessUsers[].periodOfDataUse.endDate | select(. != null)' "controlledAccessUsers-periodOfDataUse-endDate"

  # Releases
  extract_field "$lang" '.releases[].humVersionId' "releases-humVersionId"
  # Normalized: releaseDate is now YYYY-MM-DD format
  extract_field "$lang" '.releases[].releaseDate' "releases-releaseDate"
  extract_field "$lang" '.releases[].content' "releases-content"
  extract_field "$lang" '.releases[].releaseNote.text' "releases-releaseNote-text"

  echo "$lang done"
done

echo ""
echo "Output directory: $OUT_DIR"
echo ""
echo "File counts:"
wc -l "$OUT_DIR"/ja/*.txt 2>/dev/null | tail -1 || echo "No ja files"
wc -l "$OUT_DIR"/en/*.txt 2>/dev/null | tail -1 || echo "No en files"
