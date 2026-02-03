#!/usr/bin/env bash
set -euo pipefail

# Get script directory (resolve symlinks)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
ADMIN_UIDS_FILE="${REPO_ROOT}/admin_uids.json"

# Parse arguments
APPEND_MODE=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --append)
      APPEND_MODE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--append]"
      echo ""
      echo "Fetch Keycloak user UID using username/password authentication."
      echo ""
      echo "Options:"
      echo "  --append    Append the UID to admin_uids.json"
      echo "  -h, --help  Show this help message"
      echo ""
      echo "Environment:"
      echo "  Reads HUMANDBS_AUTH_ISSUER_URL and HUMANDBS_AUTH_CLIENT_ID from .env"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Check dependencies
for cmd in curl jq; do
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
if [[ -z "${HUMANDBS_AUTH_ISSUER_URL:-}" ]]; then
  echo "Error: HUMANDBS_AUTH_ISSUER_URL is not set in .env" >&2
  exit 1
fi

if [[ -z "${HUMANDBS_AUTH_CLIENT_ID:-}" ]]; then
  echo "Error: HUMANDBS_AUTH_CLIENT_ID is not set in .env" >&2
  exit 1
fi

TOKEN_ENDPOINT="${HUMANDBS_AUTH_ISSUER_URL}/protocol/openid-connect/token"

# Prompt for credentials
echo "Keycloak Authentication" >&2
echo "Issuer: ${HUMANDBS_AUTH_ISSUER_URL}" >&2
echo "Client ID: ${HUMANDBS_AUTH_CLIENT_ID}" >&2
echo "" >&2

read -rp "Username: " USERNAME
read -rsp "Password: " PASSWORD
echo "" >&2

if [[ -z "$USERNAME" || -z "$PASSWORD" ]]; then
  echo "Error: Username and password are required." >&2
  exit 1
fi

# Request token using Resource Owner Password Credentials grant
RESPONSE=$(curl -s -X POST "$TOKEN_ENDPOINT" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=${HUMANDBS_AUTH_CLIENT_ID}" \
  -d "username=${USERNAME}" \
  -d "password=${PASSWORD}" \
  2>&1)

# Check for error in response
if echo "$RESPONSE" | jq -e '.error' &>/dev/null; then
  ERROR=$(echo "$RESPONSE" | jq -r '.error')
  ERROR_DESC=$(echo "$RESPONSE" | jq -r '.error_description // "No description"')
  echo "Error: Authentication failed" >&2
  echo "  Error: $ERROR" >&2
  echo "  Description: $ERROR_DESC" >&2
  exit 1
fi

# Extract access_token
ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token // empty')

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "Error: Failed to get access token from response" >&2
  echo "Response: $RESPONSE" >&2
  exit 1
fi

# Decode JWT payload (second part of the token)
# JWT format: header.payload.signature
PAYLOAD=$(echo "$ACCESS_TOKEN" | cut -d'.' -f2)

# Add padding if needed for base64 decode
PADDING=$((4 - ${#PAYLOAD} % 4))
if [[ $PADDING -ne 4 ]]; then
  PAYLOAD="${PAYLOAD}$(printf '=%.0s' $(seq 1 $PADDING))"
fi

# Decode and extract sub (UID)
UID=$(echo "$PAYLOAD" | base64 -d 2>/dev/null | jq -r '.sub // empty')

if [[ -z "$UID" ]]; then
  echo "Error: Failed to extract UID from token" >&2
  exit 1
fi

# Output UID
echo "$UID"

# Append to admin_uids.json if requested
if [[ "$APPEND_MODE" == true ]]; then
  if [[ -f "$ADMIN_UIDS_FILE" ]]; then
    # Check if UID already exists
    if jq -e --arg uid "$UID" 'index($uid) != null' "$ADMIN_UIDS_FILE" &>/dev/null; then
      echo "UID already exists in ${ADMIN_UIDS_FILE}" >&2
    else
      # Append UID to existing array
      TEMP_FILE=$(mktemp)
      jq --arg uid "$UID" '. + [$uid]' "$ADMIN_UIDS_FILE" > "$TEMP_FILE"
      mv "$TEMP_FILE" "$ADMIN_UIDS_FILE"
      echo "UID appended to ${ADMIN_UIDS_FILE}" >&2
    fi
  else
    # Create new file with the UID
    echo "[\"$UID\"]" | jq '.' > "$ADMIN_UIDS_FILE"
    echo "Created ${ADMIN_UIDS_FILE} with UID" >&2
  fi
fi
