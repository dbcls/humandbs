#!/bin/bash
#
# Export news article content from Joomla DB as JSON
#
# News articles live in category "cat-whats-new":
#   - catid=19 (ja)
#   - catid=21 (en)
# Unlike menu/misc pages, news items are not registered individually
# in b1i5n_menu, so we query b1i5n_content directly by catid.
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JOOMLA_DIR="$SCRIPT_DIR/.."
OUTPUT_DIR="$JOOMLA_DIR/output"
OUTPUT_FILE="$OUTPUT_DIR/news-pages-raw.json"

CONTAINER_NAME="humandbs-joomla-db"
CATID_JA=19
CATID_EN=21

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Error: Container '$CONTAINER_NAME' is not running" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

SQL_QUERY="
SELECT JSON_ARRAYAGG(
  JSON_OBJECT(
    'catid', c.catid,
    'title', c.title,
    'introtext', c.introtext,
    'fulltext', c.\`fulltext\`,
    'publish_up', DATE_FORMAT(c.publish_up, '%Y-%m-%d'),
    'modified', DATE_FORMAT(c.modified, '%Y-%m-%d')
  )
)
FROM b1i5n_content c
WHERE c.state = 1
  AND c.catid IN ($CATID_JA, $CATID_EN)"

docker exec "$CONTAINER_NAME" mysql -uroot -prootpassword --default-character-set=utf8mb4 --raw joomla -N -e "$SQL_QUERY" 2>/dev/null > "$OUTPUT_FILE"

COUNT=$(jq 'length' "$OUTPUT_FILE")
echo "Exported $COUNT news articles to $OUTPUT_FILE"
