#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../output"
OUTPUT_RESEARCH="$OUTPUT_DIR/paths-research.txt"
OUTPUT_SERVICE="$OUTPUT_DIR/paths-service.txt"
OUTPUT_MISC="$OUTPUT_DIR/paths-misc.txt"

CONTAINER_NAME="humandbs-joomla-db"

# コンテナが起動しているか確認
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Error: Container '$CONTAINER_NAME' is not running" >&2
  exit 1
fi

# output ディレクトリ作成
mkdir -p "$OUTPUT_DIR"

# 全パス取得
ALL_PATHS=$(docker exec "$CONTAINER_NAME" mysql -uroot -prootpassword joomla -N -e "
SELECT DISTINCT m.path
FROM b1i5n_menu m
JOIN b1i5n_content c ON m.link LIKE CONCAT('%id=', c.id)
  AND m.link LIKE '%option=com_content%'
WHERE m.published = 1
  AND m.menutype NOT IN ('main', '')
  AND m.path != ''
  AND c.state = 1
ORDER BY m.path
" 2>/dev/null)

# service ホワイトリスト (完全一致またはプレフィックス一致)
SERVICE_WHITELIST=(
  "home"
  "faq"
  "aim"
  "acknowledgement"
  "contact-us"
  "data-processing"
  "data-submission"
  "data-use"
  "dac"
  "guidelines"
  "off-premise-server"
  "privacy-policy"
  "publications"
  "supported-browsers"
  "violation"
)

is_service() {
  local path="$1"
  for pattern in "${SERVICE_WHITELIST[@]}"; do
    if [[ "$path" == "$pattern" ]] || [[ "$path" == "$pattern/"* ]]; then
      return 0
    fi
  done
  return 1
}

# 分類関数
filter_research() {
  echo "$ALL_PATHS" | grep -E '^hum[0-9]{4}-v[0-9]+(-release(-note)?)?$' || true
}

filter_service() {
  while IFS= read -r path; do
    if is_service "$path"; then
      echo "$path"
    fi
  done <<< "$ALL_PATHS"
}

filter_misc() {
  while IFS= read -r path; do
    if ! echo "$path" | grep -qE '^hum[0-9]{4}-v[0-9]+(-release(-note)?)?$' && ! is_service "$path"; then
      echo "$path"
    fi
  done <<< "$ALL_PATHS"
}

# 出力
filter_research > "$OUTPUT_RESEARCH"
filter_service > "$OUTPUT_SERVICE"
filter_misc > "$OUTPUT_MISC"

echo "Output:"
echo "  $OUTPUT_RESEARCH ($(wc -l < "$OUTPUT_RESEARCH") paths)"
echo "  $OUTPUT_SERVICE ($(wc -l < "$OUTPUT_SERVICE") paths)"
echo "  $OUTPUT_MISC ($(wc -l < "$OUTPUT_MISC") paths)"
