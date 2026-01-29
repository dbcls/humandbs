#!/bin/bash
#
# Categorize Joomla paths into research, menu, and misc
#
# Categories:
#   - research: path matches hum[0-9]{4}-v[0-9]+(-release(-note)?)?
#   - menu: menutype is main-menu-* or footer-menu-*
#   - misc: menutype is non-linked-pages-* OR (researches-* but not matching research pattern)
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../output"
OUTPUT_RESEARCH="$OUTPUT_DIR/paths-research.txt"
OUTPUT_MENU="$OUTPUT_DIR/paths-menu.txt"
OUTPUT_MISC="$OUTPUT_DIR/paths-misc.txt"

CONTAINER_NAME="humandbs-joomla-db"

# コンテナが起動しているか確認
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Error: Container '$CONTAINER_NAME' is not running" >&2
  exit 1
fi

# output ディレクトリ作成
mkdir -p "$OUTPUT_DIR"

# research パターン
RESEARCH_PATTERN='^hum[0-9]{4}-v[0-9]+(-release(-note)?)?$'

# research: path ベースで抽出
docker exec "$CONTAINER_NAME" mysql -uroot -prootpassword joomla -N -e "
SELECT DISTINCT m.path
FROM b1i5n_menu m
JOIN b1i5n_content c ON m.link LIKE CONCAT('%id=', c.id)
  AND m.link LIKE '%option=com_content%'
WHERE m.published = 1
  AND m.path != ''
  AND c.state = 1
  AND m.path REGEXP '$RESEARCH_PATTERN'
ORDER BY m.path
" 2>/dev/null > "$OUTPUT_RESEARCH"

# menu: menutype が main-menu-* または footer-menu-*
docker exec "$CONTAINER_NAME" mysql -uroot -prootpassword joomla -N -e "
SELECT DISTINCT m.path
FROM b1i5n_menu m
JOIN b1i5n_content c ON m.link LIKE CONCAT('%id=', c.id)
  AND m.link LIKE '%option=com_content%'
WHERE m.published = 1
  AND m.path != ''
  AND c.state = 1
  AND (m.menutype LIKE 'main-menu%' OR m.menutype LIKE 'footer-menu%')
ORDER BY m.path
" 2>/dev/null > "$OUTPUT_MENU"

# misc: non-linked-pages-* OR (researches-* で research パターンに合わないもの)
docker exec "$CONTAINER_NAME" mysql -uroot -prootpassword joomla -N -e "
SELECT DISTINCT m.path
FROM b1i5n_menu m
JOIN b1i5n_content c ON m.link LIKE CONCAT('%id=', c.id)
  AND m.link LIKE '%option=com_content%'
WHERE m.published = 1
  AND m.path != ''
  AND c.state = 1
  AND (
    m.menutype LIKE 'non-linked-pages%'
    OR (
      m.menutype LIKE 'researches%'
      AND m.path NOT REGEXP '$RESEARCH_PATTERN'
    )
  )
ORDER BY m.path
" 2>/dev/null > "$OUTPUT_MISC"

echo "Output:"
echo "  $OUTPUT_RESEARCH ($(wc -l < "$OUTPUT_RESEARCH") paths)"
echo "  $OUTPUT_MENU ($(wc -l < "$OUTPUT_MENU") paths)"
echo "  $OUTPUT_MISC ($(wc -l < "$OUTPUT_MISC") paths)"
