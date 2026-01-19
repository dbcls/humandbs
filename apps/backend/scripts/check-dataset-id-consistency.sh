#!/bin/bash
# datasetIds の整合性確認スクリプト
# normalized-json と structured-json の datasetIds 参照が、実際の Dataset と対応しているか確認する

set -euo pipefail

OUTPUT_DIR="crawler-results/dataset-id-check"
mkdir -p "$OUTPUT_DIR"

echo "=== Step 1: 出力された Dataset の datasetId 一覧を収集 ==="
jq -r '.datasetId' crawler-results/structured-json/dataset/*.json | sort -u > "$OUTPUT_DIR/actual-dataset-ids.txt"
echo "Dataset 数: $(wc -l < "$OUTPUT_DIR/actual-dataset-ids.txt")"

echo ""
echo "=== Step 2: detail-json-normalized から参照されている datasetIds を収集 ==="

# summary.datasets[].datasetId[] (from detail-json-normalized)
jq -r '.summary.datasets[]?.datasetId[]?' crawler-results/detail-json-normalized/*.json | sort -u > "$OUTPUT_DIR/summary-dataset-ids.txt"
echo "summary.datasets datasetIds 数: $(wc -l < "$OUTPUT_DIR/summary-dataset-ids.txt")"

echo ""
echo "=== Step 3: structured-json/research から参照されている datasetIds を収集 ==="

# relatedPublication[].datasetIds
jq -r '.relatedPublication[]?.datasetIds[]?' crawler-results/structured-json/research/*.json | sort -u > "$OUTPUT_DIR/publication-dataset-ids.txt"
echo "publication datasetIds 数: $(wc -l < "$OUTPUT_DIR/publication-dataset-ids.txt")"

# controlledAccessUser[].datasetIds
jq -r '.controlledAccessUser[]?.datasetIds[]?' crawler-results/structured-json/research/*.json | sort -u > "$OUTPUT_DIR/cau-dataset-ids.txt"
echo "controlledAccessUser datasetIds 数: $(wc -l < "$OUTPUT_DIR/cau-dataset-ids.txt")"

echo ""
echo "=== Step 4: 差分確認 ==="

echo ""
echo "--- summary.datasets に含まれるが Dataset として存在しない ID ---"
comm -23 "$OUTPUT_DIR/summary-dataset-ids.txt" "$OUTPUT_DIR/actual-dataset-ids.txt" | tee "$OUTPUT_DIR/summary-diff.txt"
SUMMARY_DIFF_COUNT=$(wc -l < "$OUTPUT_DIR/summary-diff.txt")
echo "差分数: $SUMMARY_DIFF_COUNT"

echo ""
echo "--- publications に含まれるが Dataset として存在しない ID ---"
comm -23 "$OUTPUT_DIR/publication-dataset-ids.txt" "$OUTPUT_DIR/actual-dataset-ids.txt" | tee "$OUTPUT_DIR/pub-diff.txt"
PUB_DIFF_COUNT=$(wc -l < "$OUTPUT_DIR/pub-diff.txt")
echo "差分数: $PUB_DIFF_COUNT"

echo ""
echo "--- controlledAccessUsers に含まれるが Dataset として存在しない ID ---"
comm -23 "$OUTPUT_DIR/cau-dataset-ids.txt" "$OUTPUT_DIR/actual-dataset-ids.txt" | tee "$OUTPUT_DIR/cau-diff.txt"
CAU_DIFF_COUNT=$(wc -l < "$OUTPUT_DIR/cau-diff.txt")
echo "差分数: $CAU_DIFF_COUNT"

echo ""
echo "=== 結果サマリー ==="
echo "summary.datasets 差分: $SUMMARY_DIFF_COUNT 件"
echo "publications 差分: $PUB_DIFF_COUNT 件"
echo "controlledAccessUsers 差分: $CAU_DIFF_COUNT 件"

TOTAL_DIFF=$((SUMMARY_DIFF_COUNT + PUB_DIFF_COUNT + CAU_DIFF_COUNT))
if [ "$TOTAL_DIFF" -eq 0 ]; then
  echo "全ての参照が実際の Dataset と対応しています"
else
  echo "差分があります。詳細は $OUTPUT_DIR/*.txt を確認してください"
fi
