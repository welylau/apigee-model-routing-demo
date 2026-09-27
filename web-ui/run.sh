#!/usr/bin/env bash
# Starts the demo UI locally. Fetches the demo app key from Apigee at runtime (never stored on disk).
# The UI always calls the gateway as llm-router-premium-app.
set -euo pipefail
ORG="${ORG:-YOUR_PROJECT_ID}"
cd "$(dirname "$0")"

key() { apigeecli apps get -n "$1" -o "$ORG" --default-token --no-warnings | jq -r '.[0].credentials[0].consumerKey'; }
export PREMIUM_KEY="${PREMIUM_KEY:-$(key llm-router-premium-app)}"
exec node server.js
