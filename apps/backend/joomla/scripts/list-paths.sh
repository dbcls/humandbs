#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../output"
OUTPUT_FILE="$OUTPUT_DIR/paths.txt"

CONTAINER_NAME="humandbs-joomla-db"

# コンテナが起動しているか確認
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Error: Container '$CONTAINER_NAME' is not running" >&2
  exit 1
fi

# output ディレクトリ作成
mkdir -p "$OUTPUT_DIR"

# URL パス一覧を出力（行区切り）
docker exec "$CONTAINER_NAME" mysql -uroot -prootpassword joomla -N -e "
SELECT DISTINCT m.path
FROM b1i5n_menu m
JOIN b1i5n_content c ON m.link LIKE CONCAT('%id=', c.id)
  AND m.link LIKE '%option=com_content%'
WHERE m.published = 1
  AND m.menutype NOT IN ('main', '')
  AND m.path != ''
  AND c.state = 1
ORDER BY m.path
" 2>/dev/null > "$OUTPUT_FILE"

echo "Output: $OUTPUT_FILE ($(wc -l < "$OUTPUT_FILE") paths)"
