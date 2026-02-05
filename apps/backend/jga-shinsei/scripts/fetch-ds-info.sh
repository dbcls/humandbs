#!/bin/bash
# Fetch J-DS (Data Submission) application details
#
# Usage:
#   ./scripts/fetch-ds-info.sh <ID>
#   ./scripts/fetch-ds-info.sh --format table <ID>
#
# ID types (auto-detected):
#   J-DS002504  - Direct J-DS lookup
#   JSUB000481  - Find J-DS by JSUB
#   hum0273     - Find J-DS by hum_id
#   JGAS000123  - Find J-DS by JGA ID
#   JGAD000123  - Find J-DS by JGA ID
#
# Examples:
#   ./scripts/fetch-ds-info.sh J-DS002504
#   ./scripts/fetch-ds-info.sh hum0273
#   ./scripts/fetch-ds-info.sh --format table JGAS000001

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

DATA_FILE="$OUTPUT_DIR/ds-applications.json"

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
  echo "  J-DS002504  - Direct J-DS lookup" >&2
  echo "  JSUB000481  - Find J-DS by JSUB" >&2
  echo "  hum0273     - Find J-DS by hum_id" >&2
  echo "  JGAS000123  - Find J-DS by JGA ID" >&2
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
    J-DS[0-9]*) echo "jds" ;;
    JSUB[0-9]*) echo "jsub" ;;
    hum[0-9]*) echo "hum" ;;
    JGA[0-9]*|JGAS[0-9]*|JGAD[0-9]*|JGAN[0-9]*|JGAX[0-9]*|JGAR[0-9]*|JGAZ[0-9]*) echo "jga" ;;
    *) echo "unknown" ;;
  esac
}

ID_TYPE=$(detect_id_type "$ID")

if [[ "$ID_TYPE" == "unknown" ]]; then
  echo "Error: Unknown ID format: $ID" >&2
  exit 1
fi

# Query based on ID type
query_ds_info() {
  local id="$1"
  local id_type="$2"

  jq --arg id "$id" --arg type "$id_type" '
    if $type == "jds" then
      map(select(.jds_id == $id))
    elif $type == "jsub" then
      map(select(.jsub_ids | if . then contains([$id]) else false end))
    elif $type == "hum" then
      map(select(.hum_ids | if . then contains([$id]) else false end))
    elif $type == "jga" then
      map(select(.jga_ids | if . then contains([$id]) else false end))
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
        "J-DS ID: \(.jds_id)",
        "",
        "【関連 ID】",
        "  JSUB: \((.jsub_ids // []) | join(\", \") | if . == \"\" then \"-\" else . end)",
        "  hum_id: \((.hum_ids // []) | join(\", \") | if . == \"\" then \"-\" else . end)",
        "  JGA: \((.jga_ids // []) | .[0:5] | join(\", \") | if . == \"\" then \"-\" else . end)\(if ((.jga_ids // []) | length) > 5 then \" ...\" else \"\" end)",
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

result=$(query_ds_info "$ID" "$ID_TYPE")
format_output "$result" "$FORMAT"
