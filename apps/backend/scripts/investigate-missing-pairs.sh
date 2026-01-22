#!/bin/bash
# Dataset ja/en ペア欠落の原因調査スクリプト

set -euo pipefail

STRUCTURED_DIR="crawler-results/structured-json/dataset"
NORMALIZED_DIR="crawler-results/detail-json-normalized"

echo "=== ja のみ (en 欠落) のケース調査 ==="
echo ""

JA_ONLY=(
  "DRA000908-v1"
  "hum0014.v7.POAG-1.v1-v1"
  "hum0014.v7.POAG-1.v1-v2"
  "hum0014.v7.POAG-1.v1-v3"
  "hum0014.v7.POAG-1.v1-v4"
  "hum0072.v1.narco.v1-v1"
  "JGAD000447-v1"
  "JGAD000600-v1"
)

for item in "${JA_ONLY[@]}"; do
  echo "--- $item ---"

  # structured-json から humId を取得
  ja_file="$STRUCTURED_DIR/${item}-ja.json"
  if [ -f "$ja_file" ]; then
    humId=$(jq -r '.humId' "$ja_file")
    humVersionId=$(jq -r '.humVersionId' "$ja_file")
    datasetId=$(jq -r '.datasetId' "$ja_file")

    echo "humId: $humId, humVersionId: $humVersionId, datasetId: $datasetId"

    # detail-json-normalized の ja/en を確認
    ja_detail="$NORMALIZED_DIR/${humVersionId}-ja.json"
    en_detail="$NORMALIZED_DIR/${humVersionId}-en.json"

    echo -n "ja detail: "
    if [ -f "$ja_detail" ]; then
      molCount=$(jq '.molecularData | length' "$ja_detail")
      echo "exists (molecularData: $molCount)"
    else
      echo "NOT FOUND"
    fi

    echo -n "en detail: "
    if [ -f "$en_detail" ]; then
      molCount=$(jq '.molecularData | length' "$en_detail")
      echo "exists (molecularData: $molCount)"

      # en の molecularData headers を表示
      if [ "$molCount" -gt 0 ]; then
        echo "en molecularData IDs: $(jq -r '.molecularData[].id.text // "null"' "$en_detail" | tr '\n' ', ')"
      fi
    else
      echo "NOT FOUND"
    fi
  else
    echo "structured-json file not found: $ja_file"
  fi
  echo ""
done

echo "=== en のみ (ja 欠落) のケース調査 ==="
echo ""

EN_ONLY=(
  "hum0014.v12.T2DMw.v1-v1"
  "hum0014.v12.T2DMw.v1-v2"
  "hum0014.v12.T2DMw.v1-v3"
  "JGAD000490-v1"
  "JGAS000031-v1"
  "JGAS000525-v1"
)

for item in "${EN_ONLY[@]}"; do
  echo "--- $item ---"

  # structured-json から humId を取得
  en_file="$STRUCTURED_DIR/${item}-en.json"
  if [ -f "$en_file" ]; then
    humId=$(jq -r '.humId' "$en_file")
    humVersionId=$(jq -r '.humVersionId' "$en_file")
    datasetId=$(jq -r '.datasetId' "$en_file")

    echo "humId: $humId, humVersionId: $humVersionId, datasetId: $datasetId"

    # detail-json-normalized の ja/en を確認
    ja_detail="$NORMALIZED_DIR/${humVersionId}-ja.json"
    en_detail="$NORMALIZED_DIR/${humVersionId}-en.json"

    echo -n "ja detail: "
    if [ -f "$ja_detail" ]; then
      molCount=$(jq '.molecularData | length' "$ja_detail")
      echo "exists (molecularData: $molCount)"

      # ja の molecularData headers を表示
      if [ "$molCount" -gt 0 ]; then
        echo "ja molecularData IDs: $(jq -r '.molecularData[].id.text // "null"' "$ja_detail" | tr '\n' ', ')"
      fi
    else
      echo "NOT FOUND"
    fi

    echo -n "en detail: "
    if [ -f "$en_detail" ]; then
      molCount=$(jq '.molecularData | length' "$en_detail")
      echo "exists (molecularData: $molCount)"
    else
      echo "NOT FOUND"
    fi
  else
    echo "structured-json file not found: $en_file"
  fi
  echo ""
done
