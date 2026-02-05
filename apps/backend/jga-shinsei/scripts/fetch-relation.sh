#!/bin/bash
# Fetch ID relations from relations.json
#
# Usage:
#   ./scripts/fetch-relation.sh <ID>
#   ./scripts/fetch-relation.sh --format table <ID>
#
# ID types (auto-detected):
#   hum0273, JSUB000481, JGA000123, JGAS000123, JGAD000123,
#   JGAN000123, JGAX000123, JGAR000123, JGAZ000123, J-DS002504, J-DU006529
#
# Examples:
#   ./scripts/fetch-relation.sh JGAS000001
#   ./scripts/fetch-relation.sh hum0273
#   ./scripts/fetch-relation.sh --format table JSUB000481

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$SCRIPT_DIR/.."

# Load .env if exists
if [[ -f "$BASE_DIR/.env" ]]; then
  # shellcheck source=/dev/null
  source "$BASE_DIR/.env"
fi

# Resolve output dir (relative to BASE_DIR or absolute)
if [[ "${JGA_OUTPUT_DIR:-}" == /* ]]; then
  OUTPUT_DIR="${JGA_OUTPUT_DIR}"
else
  OUTPUT_DIR="$BASE_DIR/${JGA_OUTPUT_DIR:-json-data}"
fi

DATA_FILE="$OUTPUT_DIR/relations.json"

# Parse arguments
FORMAT="json"
ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --format)
      FORMAT="$2"
      shift 2
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      ID="$1"
      shift
      ;;
  esac
done

if [[ -z "$ID" ]]; then
  echo "Usage: $0 [--format json|table] <ID>" >&2
  echo "" >&2
  echo "ID types (auto-detected):" >&2
  echo "  hum0273, JSUB000481, JGA000123, JGAS000123, JGAD000123," >&2
  echo "  JGAN000123, JGAX000123, JGAR000123, JGAZ000123, J-DS002504, J-DU006529" >&2
  exit 1
fi

if [[ ! -f "$DATA_FILE" ]]; then
  echo "Error: Data file not found: $DATA_FILE" >&2
  echo "Run dump-all-data.sh first." >&2
  exit 1
fi

# Detect ID type
detect_id_type() {
  local id="$1"
  case "$id" in
    hum[0-9]*) echo "hum" ;;
    JSUB[0-9]*) echo "jsub" ;;
    JGA[0-9]*) echo "jga" ;;
    JGAS[0-9]*) echo "jgas" ;;
    JGAD[0-9]*) echo "jgad" ;;
    JGAN[0-9]*) echo "jgan" ;;
    JGAX[0-9]*) echo "jgax" ;;
    JGAR[0-9]*) echo "jgar" ;;
    JGAZ[0-9]*) echo "jgaz" ;;
    J-DS[0-9]*) echo "jds" ;;
    J-DU[0-9]*) echo "jdu" ;;
    *) echo "unknown" ;;
  esac
}

ID_TYPE=$(detect_id_type "$ID")

if [[ "$ID_TYPE" == "unknown" ]]; then
  echo "Error: Unknown ID format: $ID" >&2
  exit 1
fi

# Query based on ID type
query_relations() {
  local id="$1"
  local id_type="$2"

  jq --arg id "$id" --arg type "$id_type" '
    def find_jga_children($target):
      .jga_hierarchy | map(select(.parent == $target)) | map(.child);

    def find_jga_parent($target):
      .jga_hierarchy | map(select(.child == $target)) | map(.parent) | unique;

    def find_jsub_by_jga($target):
      .jsub_to_jga | map(select(.jga_accession == $target)) | map(.jsub_id) | unique;

    def find_jga_by_jsub($target):
      .jsub_to_jga | map(select(.jsub_id == $target)) | map(.jga_accession);

    def find_hum_by_jga($target):
      .jga_to_hum | map(select(.jga_accession == $target)) | map(.hum_id) | unique;

    def find_jga_by_hum($target):
      .jga_to_hum | map(select(.hum_id == $target)) | map(.jga_accession);

    def find_jds_by_jga($target):
      .jds_to_jga | map(select(.jga_accession == $target)) | map(.jds_id) | unique;

    def find_jga_by_jds($target):
      .jds_to_jga | map(select(.jds_id == $target)) | map(.jga_accession);

    def find_jdu_by_jgad($target):
      .jdu_to_jgad | map(select(.jgad_accession == $target)) | map(.jdu_id) | unique;

    def find_jgad_by_jdu($target):
      .jdu_to_jgad | map(select(.jdu_id == $target)) | map(.jgad_accession);

    # Derived: JSUB -> hum_id (via JGA)
    def find_hum_by_jsub_via_jga($target):
      (.jsub_to_jga | map(select(.jsub_id == $target)) | map(.jga_accession)) as $jgas |
      .jga_to_hum | map(select(.jga_accession as $jga | $jgas | index($jga))) | map(.hum_id) | unique;

    # Derived: JSUB -> J-DS (via JGA)
    def find_jds_by_jsub_via_jga($target):
      (.jsub_to_jga | map(select(.jsub_id == $target)) | map(.jga_accession)) as $jgas |
      .jds_to_jga | map(select(.jga_accession as $jga | $jgas | index($jga))) | map(.jds_id) | unique;

    # Derived: hum_id -> JSUB (via JGA)
    def find_jsub_by_hum_via_jga($target):
      (.jga_to_hum | map(select(.hum_id == $target)) | map(.jga_accession)) as $jgas |
      .jsub_to_jga | map(select(.jga_accession as $jga | $jgas | index($jga))) | map(.jsub_id) | unique;

    # Derived: J-DS -> JSUB (via JGA)
    def find_jsub_by_jds_via_jga($target):
      (.jds_to_jga | map(select(.jds_id == $target)) | map(.jga_accession)) as $jgas |
      .jsub_to_jga | map(select(.jga_accession as $jga | $jgas | index($jga))) | map(.jsub_id) | unique;

    if $type == "hum" then
      {
        id: $id,
        type: "hum_id",
        related_jga: find_jga_by_hum($id),
        related_jsub: find_jsub_by_hum_via_jga($id)
      }
    elif $type == "jsub" then
      {
        id: $id,
        type: "JSUB",
        related_jga: find_jga_by_jsub($id),
        related_hum: find_hum_by_jsub_via_jga($id),
        related_jds: find_jds_by_jsub_via_jga($id)
      }
    elif $type == "jga" or $type == "jgas" or $type == "jgad" or $type == "jgan" or $type == "jgax" or $type == "jgar" or $type == "jgaz" then
      {
        id: $id,
        type: ($id | split("") | .[0:4] | join("")),
        parent: find_jga_parent($id),
        children: find_jga_children($id),
        related_jsub: find_jsub_by_jga($id),
        related_hum: find_hum_by_jga($id),
        related_jds: find_jds_by_jga($id),
        related_jdu: (if ($id | startswith("JGAD")) then find_jdu_by_jgad($id) else [] end)
      }
    elif $type == "jds" then
      {
        id: $id,
        type: "J-DS",
        related_jga: find_jga_by_jds($id),
        related_jsub: find_jsub_by_jds_via_jga($id)
      }
    elif $type == "jdu" then
      {
        id: $id,
        type: "J-DU",
        related_jgad: find_jgad_by_jdu($id)
      }
    else
      { error: "Unknown ID type" }
    end
  ' "$DATA_FILE"
}

# Format output
format_output() {
  local result="$1"
  local format="$2"

  if [[ "$format" == "table" ]]; then
    echo "$result" | jq -r '
      "ID: \(.id) (\(.type))",
      "",
      (
        to_entries |
        map(select(.key != "id" and .key != "type")) |
        map(
          if (.value | type) == "array" then
            if (.value | length) > 0 then
              "\(.key):\n  " + (.value | join("\n  "))
            else
              empty
            end
          else
            "\(.key): \(.value)"
          end
        ) |
        join("\n\n")
      )
    '
  else
    echo "$result" | jq '.'
  fi
}

result=$(query_relations "$ID" "$ID_TYPE")
format_output "$result" "$FORMAT"
