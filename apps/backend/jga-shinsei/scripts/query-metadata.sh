#!/bin/bash
# Query metadata by various ID types
# Usage:
#   ./query-metadata.sh jsub JSUB000481
#   ./query-metadata.sh hum hum0273
#   ./query-metadata.sh jds J-DS002504
#   ./query-metadata.sh jga JGAS000001

set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-humandbs-jga-shinsei-db}"

usage() {
  echo "Usage: $0 <id_type> <id_value> [container_name]"
  echo ""
  echo "ID types:"
  echo "  jsub  - Search by JSUB ID (e.g., JSUB000481)"
  echo "  hum   - Search by hum_id (e.g., hum0273)"
  echo "  jds   - Search by J-DS ID (e.g., J-DS002504)"
  echo "  jga   - Search by JGA accession (e.g., JGAS000001, JGAD000001)"
  echo ""
  echo "Examples:"
  echo "  $0 jsub JSUB000481"
  echo "  $0 hum hum0273"
  echo "  $0 jds J-DS002504"
  echo "  $0 jga JGAS000001"
  exit 1
}

if [[ $# -lt 2 ]]; then
  usage
fi

ID_TYPE="$1"
ID_VALUE="$2"
CONTAINER_NAME="${3:-$CONTAINER_NAME}"

case "$ID_TYPE" in
  jsub)
    echo "Searching metadata by JSUB ID: $ID_VALUE"
    docker exec "$CONTAINER_NAME" psql -U postgres -d jgadb -t -c "
    SELECT
      a.accession,
      m.metadata
    FROM ts_jgasys.metadata m
    JOIN ts_jgasys.accession a ON m.accession_id = a.accession_id
    WHERE a.alias LIKE '${ID_VALUE}%'
    ORDER BY a.accession;
    "
    ;;

  hum)
    echo "Searching metadata by hum_id: $ID_VALUE"
    docker exec "$CONTAINER_NAME" psql -U postgres -d jgadb -t -c "
    SELECT
      a.accession,
      m.metadata
    FROM ts_jgasys.metadata m
    JOIN ts_jgasys.accession a ON m.accession_id = a.accession_id
    WHERE m.metadata LIKE '%nbdc_number=\"${ID_VALUE}\"%'
    ORDER BY a.accession;
    "
    ;;

  jds)
    echo "Searching metadata by J-DS ID: $ID_VALUE"
    docker exec "$CONTAINER_NAME" psql -U postgres -d jgadb -t -c "
    SELECT
      a.accession,
      m.metadata
    FROM ts_jgasys.nbdc_application_master nam
    JOIN ts_jgasys.submission s ON nam.account_group = s.group_id
    JOIN ts_jgasys.entry e ON s.submission_id = e.submission_id
    JOIN ts_jgasys.relation r ON e.entry_id = r.entry_id
    JOIN ts_jgasys.metadata m ON r.self = m.accession_id
    JOIN ts_jgasys.accession a ON m.accession_id = a.accession_id
    WHERE nam.ds_du_id = '${ID_VALUE}'
    ORDER BY a.accession;
    "
    ;;

  jga)
    echo "Searching metadata by JGA accession: $ID_VALUE"
    docker exec "$CONTAINER_NAME" psql -U postgres -d jgadb -t -c "
    SELECT
      a.accession,
      m.metadata
    FROM ts_jgasys.metadata m
    JOIN ts_jgasys.accession a ON m.accession_id = a.accession_id
    WHERE a.accession = '${ID_VALUE}';
    "
    ;;

  *)
    echo "Error: Unknown ID type '$ID_TYPE'"
    usage
    ;;
esac
