#!/bin/bash
# Extract unique field values from normalized-json files for debugging/analysis
# Usage: ./scripts/inspect-normalized-json.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/../crawler-results"
JSON_DIR="$RESULTS_DIR/normalized-json"
OUT_DIR="$RESULTS_DIR/normalized-field-analysis"

if [ ! -d "$JSON_DIR" ]; then
  echo "Error: $JSON_DIR not found. Run 'bun run crawler:normalize' first."
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

  # Title
  extract_field "$lang" '.title' "title"

  # Summary
  extract_field "$lang" '.summary.aims.text' "summary-aims-text"
  extract_field "$lang" '.summary.methods.text' "summary-methods-text"
  extract_field "$lang" '.summary.targets.text' "summary-targets-text"
  extract_field "$lang" '.summary.url[].text' "summary-url-text"
  extract_field "$lang" '.summary.url[].url' "summary-url-url"
  # NormalizedDataset: datasetId, criteria, releaseDate are arrays
  extract_field "$lang" '.summary.datasets[].datasetId[]' "summary-datasets-datasetId"
  extract_field "$lang" '.summary.datasets[].typeOfData' "summary-datasets-typeOfData"
  extract_field "$lang" '.summary.datasets[].criteria[]' "summary-datasets-criteria"
  extract_field "$lang" '.summary.datasets[].releaseDate[]' "summary-datasets-releaseDate"
  extract_field "$lang" '.summary.footers[].text' "summary-footers-text"

  # Molecular Data (id, footers, and extractedDatasetIds)
  extract_field "$lang" '.molecularData[].id.text' "molecularData-id-text"
  extract_field "$lang" '.molecularData[].footers[].text' "molecularData-footers-text"
  extract_field "$lang" '.molecularData[].extractedDatasetIds.datasetIds[]' "molecularData-extractedDatasetIds-datasetIds"
  extract_field "$lang" '.molecularData[].extractedDatasetIds.originalJgasIds[]' "molecularData-extractedDatasetIds-originalJgasIds"

  # Data Provider
  extract_field "$lang" '.dataProvider.principalInvestigator[].text' "dataProvider-principalInvestigator-text"
  extract_field "$lang" '.dataProvider.affiliation[].text' "dataProvider-affiliation-text"
  extract_field "$lang" '.dataProvider.projectName[].text' "dataProvider-projectName-text"
  extract_field "$lang" '.dataProvider.projectUrl[].text' "dataProvider-projectUrl-text"
  extract_field "$lang" '.dataProvider.projectUrl[].url' "dataProvider-projectUrl-url"
  extract_field "$lang" '.dataProvider.grants[].grantName' "dataProvider-grants-grantName"
  extract_field "$lang" '.dataProvider.grants[].projectTitle' "dataProvider-grants-projectTitle"
  # NormalizedGrant: grantId is string[] | null
  extract_field "$lang" '.dataProvider.grants[].grantId[]' "dataProvider-grants-grantId"

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
  # NormalizedControlledAccessUser: periodOfDataUse is PeriodOfDataUse | null
  extract_field "$lang" '.controlledAccessUsers[].periodOfDataUse.startDate' "controlledAccessUsers-periodOfDataUse-startDate"
  extract_field "$lang" '.controlledAccessUsers[].periodOfDataUse.endDate' "controlledAccessUsers-periodOfDataUse-endDate"

  # Releases
  extract_field "$lang" '.releases[].humVersionId' "releases-humVersionId"
  extract_field "$lang" '.releases[].releaseDate' "releases-releaseDate"
  extract_field "$lang" '.releases[].content' "releases-content"
  extract_field "$lang" '.releases[].releaseNote.text' "releases-releaseNote-text"

  # Dataset ID Registry
  extract_field "$lang" '.datasetIdRegistry.validDatasetIds[]' "datasetIdRegistry-validDatasetIds"

  # Detected Orphans
  extract_field "$lang" '.detectedOrphans[].type' "detectedOrphans-type"
  extract_field "$lang" '.detectedOrphans[].datasetId' "detectedOrphans-datasetId"
  extract_field "$lang" '.detectedOrphans[].context' "detectedOrphans-context"

  echo "$lang done"
done

echo ""
echo "Output directory: $OUT_DIR"
echo ""
echo "File counts (lines per file):"
for lang in ja en; do
  echo "  $lang:"
  wc -l "$OUT_DIR/$lang"/*.txt 2>/dev/null | tail -1 || echo "    No files"
done
