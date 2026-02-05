#!/bin/bash
#
# Export misc page content from Joomla DB as JSON
#
# Reads paths from output/paths-misc.txt and extracts corresponding
# article content from the database.
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JOOMLA_DIR="$SCRIPT_DIR/.."
OUTPUT_DIR="$JOOMLA_DIR/output"
PATHS_FILE="$OUTPUT_DIR/paths-misc.txt"
OUTPUT_FILE="$OUTPUT_DIR/misc-pages-raw.json"

CONTAINER_NAME="humandbs-joomla-db"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Error: Container '$CONTAINER_NAME' is not running" >&2
  exit 1
fi

# Check if paths file exists
if [ ! -f "$PATHS_FILE" ]; then
  echo "Error: Paths file not found: $PATHS_FILE" >&2
  echo "Run list-paths-categorized.sh first" >&2
  exit 1
fi

# Read paths into array
mapfile -t PATHS < "$PATHS_FILE"

if [ ${#PATHS[@]} -eq 0 ]; then
  echo "No paths found in $PATHS_FILE"
  exit 0
fi

echo "Exporting ${#PATHS[@]} misc pages..."

# Build SQL query with all paths
# Use JSON_ARRAYAGG to output as a single JSON array
SQL_QUERY="
SELECT JSON_ARRAYAGG(
  JSON_OBJECT(
    'path', m.path,
    'lang', CASE m.language WHEN 'ja-JP' THEN 'ja' WHEN 'en-GB' THEN 'en' ELSE m.language END,
    'title', c.title,
    'introtext', c.introtext,
    'fulltext', c.fulltext,
    'publish_up', DATE_FORMAT(c.publish_up, '%Y-%m-%d'),
    'modified', DATE_FORMAT(c.modified, '%Y-%m-%d')
  )
)
FROM b1i5n_menu m
JOIN b1i5n_content c ON m.link LIKE CONCAT('%id=', c.id)
  AND m.link LIKE '%option=com_content%'
WHERE m.published = 1
  AND c.state = 1
  AND m.path IN ($(printf "'%s'," "${PATHS[@]}" | sed 's/,$//'))"

# Execute query and save directly
# --raw prevents double-escaping of backslashes in JSON output
docker exec "$CONTAINER_NAME" mysql -uroot -prootpassword --default-character-set=utf8mb4 --raw joomla -N -e "$SQL_QUERY" 2>/dev/null > "$OUTPUT_FILE"

# Count results
COUNT=$(jq 'length' "$OUTPUT_FILE")
echo "Exported $COUNT pages to $OUTPUT_FILE"
