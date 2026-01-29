#!/bin/bash
# Export JGA ID relations (parent-child relationships)
# Output: output/jga-id-relations.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../output"
CONTAINER_NAME="${1:-humandbs-jga-shinsei-db}"

mkdir -p "$OUTPUT_DIR"

echo "Exporting JGA ID relations..."

docker exec "$CONTAINER_NAME" psql -U postgres -d jgadb -t -A -F'	' -c "
SELECT DISTINCT
  s.accession as child,
  p.accession as parent,
  substring(s.accession from '^[A-Z]+') as child_type,
  substring(p.accession from '^[A-Z]+') as parent_type
FROM ts_jgasys.relation r
JOIN ts_jgasys.accession s ON r.self = s.accession_id
JOIN ts_jgasys.accession p ON r.parent = p.accession_id
WHERE s.accession NOT LIKE 'JSUB%'
  AND p.accession NOT LIKE 'JSUB%'
ORDER BY child_type, child, parent_type;
" | jq -R -s '
  split("\n") | map(select(length > 0)) | map(split("\t")) |
  map({
    child: .[0],
    parent: .[1],
    child_type: .[2],
    parent_type: .[3]
  })
' > "$OUTPUT_DIR/jga-id-relations.json"

echo "Output: $OUTPUT_DIR/jga-id-relations.json"
echo "Records: $(jq length "$OUTPUT_DIR/jga-id-relations.json")"
