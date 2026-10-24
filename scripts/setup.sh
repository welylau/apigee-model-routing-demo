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

echo "== Coding-agent products (Anthropic facade, /llm-router/anthropic)"
# Created through the REST API: apigeecli --attrs splits on commas, which would break allowed_models.
TOKEN="$(gcloud auth application-default print-access-token)"
for p in llm-router-agents llm-router-agents-basic SeniorEngineerLLMProfile; do
  curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    --data @"$DIR/scripts/products/$p.json" \
    "https://apigee.googleapis.com/v1/organizations/$ORG/apiproducts" | jq -c '{name, error: .error.message}'
done

echo "== Claude Code client app + key in Secret Manager"
$A apps create -n claude-cli-vm-app -e "$DEV_EMAIL" -p llm-router-agents
if ! gcloud secrets describe claude-cli-vm-key --project "$ORG" >/dev/null 2>&1; then
  $A apps get -n claude-cli-vm-app 2>/dev/null | jq -j '.[0].credentials[0].consumerKey' |
    gcloud secrets create claude-cli-vm-key --project "$ORG" --replication-policy=automatic \
      --labels=app=llm-router-demo,component=claude-cli-vm --data-file=-
fi

cat <<EOF

Setup complete. Deploy manually when ready:

  apigeecli apis deploy -n llm-router -o $ORG -e $ENV --sa $SA --ovr --wait --default-token

Then fetch the API keys for scripts/demo.sh:

  apigeecli apps get -n llm-router-free-app    -o $ORG --default-token | jq -r '.[0].credentials[0].consumerKey'
  apigeecli apps get -n llm-router-premium-app -o $ORG --default-token | jq -r '.[0].credentials[0].consumerKey'

The Claude Code client VM reads its key from Secret Manager (claude-cli-vm-key): ./scripts/vm-client.sh create
EOF
