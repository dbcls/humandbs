#!/bin/bash
# Fetch J-DU (Data Use) application details
#
# Usage:
#   ./scripts/fetch-du-info.sh <ID>
#   ./scripts/fetch-du-info.sh --format table <ID>
#
# ID types (auto-detected):
#   J-DU006529  - Direct J-DU lookup
#   JGAD000123  - Find J-DU by JGAD
#   JGAS000123  - Find J-DU by JGAS
#   hum0273     - Find J-DU by hum_id
#
# Examples:
#   ./scripts/fetch-du-info.sh J-DU006529
#   ./scripts/fetch-du-info.sh JGAD000001
#   ./scripts/fetch-du-info.sh --format table JGAS000001

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

DATA_FILE="$OUTPUT_DIR/du-applications.json"

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
  echo "  J-DU006529  - Direct J-DU lookup" >&2
  echo "  JGAD000123  - Find J-DU by JGAD" >&2
  echo "  JGAS000123  - Find J-DU by JGAS" >&2
  echo "  hum0273     - Find J-DU by hum_id" >&2
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
    J-DU[0-9]*) echo "jdu" ;;
    JGAD[0-9]*) echo "jgad" ;;
    JGAS[0-9]*) echo "jgas" ;;
    hum[0-9]*) echo "hum" ;;
    *) echo "unknown" ;;
  esac
}

ID_TYPE=$(detect_id_type "$ID")

if [[ "$ID_TYPE" == "unknown" ]]; then
  echo "Error: Unknown ID format: $ID" >&2
  echo "Supported: J-DU*, JGAD*, JGAS*, hum*" >&2
  exit 1
fi

# Query based on ID type
query_du_info() {
  local id="$1"
  local id_type="$2"

  jq --arg id "$id" --arg type "$id_type" '
    if $type == "jdu" then
      map(select(.jdu_id == $id))
    elif $type == "jgad" then
      map(select(.jgad_ids | if . then contains([$id]) else false end))
    elif $type == "jgas" then
      map(select(.jgas_ids | if . then contains([$id]) else false end))
    elif $type == "hum" then
      map(select(.hum_ids | if . then contains([$id]) else false end))
    else
      []
    end
  ' "$DATA_FILE"
}

# Format output
format_output() {
  local result="$1"
  local format="$2"

  if [[ "$format" == "table" ]]; then
    echo "$result" | jq -r '
      if length == 0 then
        "No results found."
      else
        .[] |
        "==================================================",
        "J-DU ID: \(.jdu_id)",
        "",
        "【関連 ID】",
        "  JGAD: \((.jgad_ids // []) | join(\", \") | if . == \"\" then \"-\" else . end)",
        "  JGAS: \((.jgas_ids // []) | join(\", \") | if . == \"\" then \"-\" else . end)",
        "  hum_id: \((.hum_ids // []) | join(\", \") | if . == \"\" then \"-\" else . end)",
        "",
        "【申請情報】",
        "  研究題目: \(.application.study_title // \"-\")",
        "  Study Title: \(.application.study_title_en // \"-\")",
        "  PI: \(.application.pi.last_name // \"\")\(.application.pi.first_name // \"\") (\(.application.pi.institution // \"-\"))",
        "  作成日: \(.application.create_date // \"-\")",
        "  提出日: \(.submit_date // \"-\")",
        "",
        "【ステータス履歴】",
        ((.status_history // []) | if length == 0 then "  -" else .[] | "  [\(.status)] \(.date)" end),
        ""
      end
    '
  else
    echo "$result" | jq '.'
  fi
}

result=$(query_du_info "$ID" "$ID_TYPE")
format_output "$result" "$FORMAT"
