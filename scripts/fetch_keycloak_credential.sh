#!/bin/bash
# Fetch Keycloak access token using password grant flow
#
# Usage:
#   ./scripts/fetch_keycloak_credential.sh
#   ./scripts/fetch_keycloak_credential.sh --format raw
#
# Environment variables (can be set in .env):
#   OIDC_ISSUER_URL  - Keycloak issuer URL (e.g., https://keycloak.example.com/realms/myrealm)
#   OIDC_CLIENT_ID   - Client ID (e.g., humandbs-backend)
#
# Examples:
#   # Interactive (prompts for credentials)
#   ./scripts/fetch_keycloak_credential.sh
#
#   # Get raw token (for scripting)
#   ./scripts/fetch_keycloak_credential.sh --format raw
#
#   # Use token in curl
#   TOKEN=$(./scripts/fetch_keycloak_credential.sh --format raw)
#   curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/research

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$SCRIPT_DIR/.."

# Load .env if exists
if [[ -f "$BASE_DIR/.env" ]]; then
  # shellcheck source=/dev/null
  source "$BASE_DIR/.env"
fi

# Default values
FORMAT="json"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --format|-f)
      FORMAT="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  -f, --format <format>   Output format: json (default), raw, decoded"
      echo "  -h, --help              Show this help"
      echo ""
      echo "Environment variables:"
      echo "  OIDC_ISSUER_URL  Keycloak issuer URL"
      echo "  OIDC_CLIENT_ID   Client ID"
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      echo "Unexpected argument: $1" >&2
      exit 1
      ;;
  esac
done

# Validate required environment variables
if [[ -z "${OIDC_ISSUER_URL:-}" ]]; then
  echo "Error: OIDC_ISSUER_URL is not set" >&2
  exit 1
fi

if [[ -z "${OIDC_CLIENT_ID:-}" ]]; then
  echo "Error: OIDC_CLIENT_ID is not set" >&2
  exit 1
fi

# Prompt for credentials
read -rp "Username: " USERNAME
read -rsp "Password: " PASSWORD
echo ""

# Construct token endpoint URL from issuer URL
TOKEN_URL="${OIDC_ISSUER_URL}/protocol/openid-connect/token"

# Request token
response=$(curl -s -X POST "$TOKEN_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=${OIDC_CLIENT_ID}" \
  -d "username=${USERNAME}" \
  -d "password=${PASSWORD}" \
  -d "scope=openid")

# Check for error
if echo "$response" | jq -e '.error' > /dev/null 2>&1; then
  error=$(echo "$response" | jq -r '.error')
  error_desc=$(echo "$response" | jq -r '.error_description // "No description"')
  echo "Error: $error - $error_desc" >&2
  exit 1
fi

# Extract access token
access_token=$(echo "$response" | jq -r '.access_token')

if [[ -z "$access_token" || "$access_token" == "null" ]]; then
  echo "Error: Failed to extract access token" >&2
  echo "Response: $response" >&2
  exit 1
fi

# Output based on format
case "$FORMAT" in
  raw)
    echo "$access_token"
    ;;
  decoded)
    # Decode JWT payload (base64url decode)
    payload=$(echo "$access_token" | cut -d'.' -f2)
    # Add padding if needed
    padding=$((4 - ${#payload} % 4))
    if [[ $padding -lt 4 ]]; then
      payload="${payload}$(printf '=%.0s' $(seq 1 $padding))"
    fi
    # Replace URL-safe characters and decode
    echo "$payload" | tr '_-' '/+' | base64 -d 2>/dev/null | jq .
    ;;
  json|*)
    echo "$response" | jq '{
      access_token: .access_token,
      token_type: .token_type,
      expires_in: .expires_in,
      refresh_token: .refresh_token,
      scope: .scope
    }'
    ;;
esac
