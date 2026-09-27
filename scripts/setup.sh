#!/usr/bin/env bash
# One-time setup for the llm-router demo. Idempotent-ish: "already exists" errors are safe to ignore.
# NOTE: this script only UPLOADS the proxy. Deployment is a deliberate manual step (printed at the end).
set -uo pipefail

ORG="${ORG:-YOUR_PROJECT_ID}"
ENV="${ENV:-default-dev}"
SA="${SA:-YOUR_PROXY_SA@YOUR_PROJECT_ID.iam.gserviceaccount.com}"
JEV_HOST="${JEV_HOST:-jev-decision-engine.example.com}"   # re-point to the real TypeSafe AI JEV host later
DEV_EMAIL="${DEV_EMAIL:-llm-router-demo@example.com}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
A="apigeecli --default-token --no-warnings -o $ORG"

echo "== Data collectors (analytics custom dimensions)"
$A datacollectors create -n dc_routed_model      -p STRING  -d "LLM model chosen by router"
$A datacollectors create -n dc_route_tier        -p STRING  -d "Routing tier simple/standard/complex"
$A datacollectors create -n dc_route_decided_by  -p STRING  -d "Decision source rules/classifier/external/fallback"
$A datacollectors create -n dc_route_decision_ms -p INTEGER -d "Routing decision overhead ms"
$A datacollectors create -n dc_total_tokens      -p INTEGER -d "Gemini total token count"

echo "== Target server for external decision engine (TypeSafe AI JEV)"
$A targetservers create -e "$ENV" -n jev-engine -s "$JEV_HOST" -p 443 --tls true -d "External routing decision engine"

echo "== Upload proxy bundle (no deploy)"
$A apis create bundle -n llm-router -f "$DIR/apigee-proxies/llm-router/apiproxy"

echo "== API products"
$A products create -n llm-router-free    -m "LLM Router - Free"    -e "$ENV" -p llm-router -f auto --attrs tier=free
$A products create -n llm-router-premium -m "LLM Router - Premium" -e "$ENV" -p llm-router -f auto --attrs tier=premium

echo "== Developer + apps"
$A developers create -n "$DEV_EMAIL" -f LLM -s Router -u llm-router-demo
$A apps create -n llm-router-free-app    -e "$DEV_EMAIL" -p llm-router-free
$A apps create -n llm-router-premium-app -e "$DEV_EMAIL" -p llm-router-premium

cat <<EOF

Setup complete. Deploy manually when ready:

  apigeecli apis deploy -n llm-router -o $ORG -e $ENV --sa $SA --ovr --wait --default-token

Then fetch the API keys for scripts/demo.sh:

  apigeecli apps get -n llm-router-free-app    -o $ORG --default-token | jq -r '.[0].credentials[0].consumerKey'
  apigeecli apps get -n llm-router-premium-app -o $ORG --default-token | jq -r '.[0].credentials[0].consumerKey'
EOF
