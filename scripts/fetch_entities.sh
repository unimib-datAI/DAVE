#!/usr/bin/env bash
# fetch_entities.sh
# Logs in to the DAVE documents API via Keycloak and streams the entities
# response for a given collection to a JSON file.
#
# Usage:
#   ./scripts/fetch_entities.sh [COLLECTION_ID] [OUTPUT_FILE]
#
# Defaults:
#   COLLECTION_ID  — set below or pass as first argument
#   OUTPUT_FILE    — entities.json

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
BASE_URL="${DOCS_BASE_URL:-http://localhost:3001}"
USERNAME="${DAVE_USERNAME:-admin@daveadmin.com}"
PASSWORD="${DAVE_PASSWORD:-daveAdmin42!}"
COLLECTION_ID="${1:-b5f72036-1e7a-499e-b8f1-7fc492df28f4}"
OUTPUT_FILE="${2:-entities.json}"

# ── Dependency check ─────────────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
  echo "Error: 'jq' is required. Install it with: brew install jq" >&2
  exit 1
fi

# ── Login ─────────────────────────────────────────────────────────────────────
echo "Logging in as '${USERNAME}'..."
LOGIN_RESPONSE=$(curl -sf -X POST "${BASE_URL}/api/auth/keycloak-login" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"${USERNAME}\", \"password\": \"${PASSWORD}\"}")

ACCESS_TOKEN=$(echo "${LOGIN_RESPONSE}" | jq -r '.access_token')

if [[ -z "${ACCESS_TOKEN}" || "${ACCESS_TOKEN}" == "null" ]]; then
  echo "Error: login failed. Response:" >&2
  echo "${LOGIN_RESPONSE}" >&2
  exit 1
fi

echo "Login successful."

# ── Fetch entities and stream to file ────────────────────────────────────────
echo "Fetching entities for collection '${COLLECTION_ID}'..."
curl -sf -X GET \
  "${BASE_URL}/api/collection/entities/${COLLECTION_ID}" \
  -H "accept: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  | tee "${OUTPUT_FILE}"

echo ""
echo "Saved to '${OUTPUT_FILE}'."
