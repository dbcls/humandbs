#!/usr/bin/env bash
set -euo pipefail

# Get script directory (resolve symlinks)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"

# Constants
REPO_NAME="backup_repo"
REPO_PATH="/usr/share/elasticsearch/backup"

# Parse arguments
SNAPSHOT_NAME=""
while [[ $# -gt 0 ]]; do
  case $1 in
    -n|--name)
      SNAPSHOT_NAME="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [-n|--name <snapshot_name>]"
      echo ""
      echo "Create an Elasticsearch snapshot."
      echo ""
      echo "Options:"
      echo "  -n, --name  Snapshot name (default: snapshot_YYYYMMDD_HHMMSS)"
      echo "  -h, --help  Show this help message"
      echo ""
      echo "Environment:"
      echo "  Reads HUMANDBS_CONTAINER_PREFIX from .env"
      echo ""
      echo "This script:"
      echo "  1. Registers snapshot repository if not exists (idempotent)"
      echo "  2. Creates a new snapshot with the specified or generated name"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Check dependencies
for cmd in docker curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd is required but not installed." >&2
    exit 1
  fi
done

# Load .env file
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  echo "Please copy one of env.dev, env.staging, or env.production to .env" >&2
  exit 1
fi

# Source .env (handle comments and empty lines)
set -a
# shellcheck disable=SC1090
source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$')
set +a

# Validate required variables
if [[ -z "${HUMANDBS_CONTAINER_PREFIX:-}" ]]; then
  echo "Error: HUMANDBS_CONTAINER_PREFIX is not set in .env" >&2
  exit 1
fi

ES_CONTAINER="${HUMANDBS_CONTAINER_PREFIX}-elasticsearch"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${ES_CONTAINER}$"; then
  echo "Error: Elasticsearch container '${ES_CONTAINER}' is not running." >&2
  exit 1
fi

# Helper function to call ES API via docker exec
es_curl() {
  docker exec "$ES_CONTAINER" curl -s -f "$@"
}

# Generate snapshot name if not provided
if [[ -z "$SNAPSHOT_NAME" ]]; then
  SNAPSHOT_NAME="snapshot_$(date +%Y%m%d_%H%M%S)"
fi

echo "Elasticsearch Snapshot"
echo "Container: ${ES_CONTAINER}"
echo "Repository: ${REPO_NAME}"
echo "Snapshot: ${SNAPSHOT_NAME}"
echo ""

# Step 1: Check if repository exists, register if not
echo "Checking snapshot repository..."
if es_curl "http://localhost:9200/_snapshot/${REPO_NAME}" &>/dev/null; then
  echo "  Repository '${REPO_NAME}' already exists."
else
  echo "  Repository '${REPO_NAME}' not found. Registering..."
  es_curl -X PUT "http://localhost:9200/_snapshot/${REPO_NAME}" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"fs\",\"settings\":{\"location\":\"${REPO_PATH}\"}}" >/dev/null
  echo "  Repository registered."
fi

# Step 2: Create snapshot
echo ""
echo "Creating snapshot '${SNAPSHOT_NAME}'..."
RESPONSE=$(es_curl -X PUT "http://localhost:9200/_snapshot/${REPO_NAME}/${SNAPSHOT_NAME}?wait_for_completion=true" \
  -H "Content-Type: application/json" \
  -d '{"ignore_unavailable":true,"include_global_state":false}')

# Check result
STATE=$(echo "$RESPONSE" | jq -r '.snapshot.state // empty')
if [[ "$STATE" == "SUCCESS" ]]; then
  INDICES=$(echo "$RESPONSE" | jq -r '.snapshot.indices | length')
  SHARDS_TOTAL=$(echo "$RESPONSE" | jq -r '.snapshot.shards.total')
  SHARDS_SUCCESS=$(echo "$RESPONSE" | jq -r '.snapshot.shards.successful')
  echo ""
  echo "Snapshot created successfully!"
  echo "  Indices: ${INDICES}"
  echo "  Shards: ${SHARDS_SUCCESS}/${SHARDS_TOTAL}"
else
  echo "Error: Snapshot creation failed." >&2
  echo "Response: $RESPONSE" >&2
  exit 1
fi
