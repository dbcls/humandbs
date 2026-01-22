#!/bin/bash
# Dataset の ja/en ペア整合性確認スクリプト
# structured-json/dataset 内のファイルが ja/en のペアになっているか確認する

set -euo pipefail

DATASET_DIR="crawler-results/structured-json/dataset"
OUTPUT_DIR="crawler-results/dataset-pair-check"
mkdir -p "$OUTPUT_DIR"

echo "=== Dataset ja/en ペア整合性確認 ==="
echo ""

# 全ファイルを取得
FILES=$(ls "$DATASET_DIR"/*.json 2>/dev/null | xargs -n1 basename)

# datasetId-version をキーとして集計
declare -A JA_FILES
declare -A EN_FILES

for file in $FILES; do
  # ファイル名から lang を抽出 (例: DRA001273-v1-ja.json -> ja)
  lang=$(echo "$file" | sed 's/.*-\(ja\|en\)\.json$/\1/')
  # ファイル名から datasetId-version を抽出 (例: DRA001273-v1-ja.json -> DRA001273-v1)
  key=$(echo "$file" | sed 's/-\(ja\|en\)\.json$//')

  if [ "$lang" = "ja" ]; then
    JA_FILES["$key"]=1
  elif [ "$lang" = "en" ]; then
    EN_FILES["$key"]=1
  fi
done

# 結果を分類
JA_ONLY=()
EN_ONLY=()
PAIRED=()

# 全キーを取得
ALL_KEYS=$(echo "${!JA_FILES[@]} ${!EN_FILES[@]}" | tr ' ' '\n' | sort -u)

for key in $ALL_KEYS; do
  has_ja=${JA_FILES[$key]:-0}
  has_en=${EN_FILES[$key]:-0}

  if [ "$has_ja" = "1" ] && [ "$has_en" = "1" ]; then
    PAIRED+=("$key")
  elif [ "$has_ja" = "1" ]; then
    JA_ONLY+=("$key")
  else
    EN_ONLY+=("$key")
  fi
done

# 結果をファイルに出力
printf '%s\n' "${PAIRED[@]}" | sort > "$OUTPUT_DIR/paired.txt"
printf '%s\n' "${JA_ONLY[@]}" | sort > "$OUTPUT_DIR/ja-only.txt"
printf '%s\n' "${EN_ONLY[@]}" | sort > "$OUTPUT_DIR/en-only.txt"

# サマリー表示
echo "=== サマリー ==="
echo "ja/en ペア: ${#PAIRED[@]} 件"
echo "ja のみ: ${#JA_ONLY[@]} 件"
echo "en のみ: ${#EN_ONLY[@]} 件"
echo ""

if [ ${#JA_ONLY[@]} -gt 0 ]; then
  echo "=== ja のみ (en が欠落) ==="
  printf '%s\n' "${JA_ONLY[@]}" | sort
  echo ""
fi

if [ ${#EN_ONLY[@]} -gt 0 ]; then
  echo "=== en のみ (ja が欠落) ==="
  printf '%s\n' "${EN_ONLY[@]}" | sort
  echo ""
fi

echo "詳細は $OUTPUT_DIR/ を確認してください"
