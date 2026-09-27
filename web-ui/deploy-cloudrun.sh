#!/usr/bin/env bash
# Deploys the demo web UI to Cloud Run behind Identity-Aware Proxy (IAP).
#
#   PROJECT_ID=my-project APIGEE_HOST=https://api.example.com IAP_MEMBERS=user:me@example.com \
#     ./web-ui/deploy-cloudrun.sh
#
# Required: PROJECT_ID, APIGEE_HOST, IAP_MEMBERS (comma-separated IAM members, e.g.
#           "user:alice@example.com,group:team@example.com").
# Optional: REGION (asia-southeast1), SERVICE (llm-router-ui), ORG (=PROJECT_ID), APIGEE_ENV (default-dev),
#           APP_NAME (llm-router-premium-app), SECRET (llm-router-ui-api-key), ROTATE_KEY=1 to store a new key version,
#           CUSTOM_DOMAIN (e.g. demo.example.com): allow-lists the host in the server and creates a Cloud Run
#           domain mapping; you then add the printed DNS record (CNAME to ghs.googlehosted.com.).
#
# What it does: enables APIs, stores the Apigee app key in Secret Manager (never printed), creates a dedicated
# runtime service account that can read only that secret, builds + deploys the UI with --iap and
# --no-allow-unauthenticated, lets the IAP service agent invoke the service, and grants IAP access to IAP_MEMBERS.
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${APIGEE_HOST:?set APIGEE_HOST (e.g. https://api.example.com)}"
: "${IAP_MEMBERS:?set IAP_MEMBERS (e.g. user:me@example.com)}"
REGION="${REGION:-asia-southeast1}"
SERVICE="${SERVICE:-llm-router-ui}"
ORG="${ORG:-$PROJECT_ID}"
APIGEE_ENV="${APIGEE_ENV:-default-dev}"
APP_NAME="${APP_NAME:-llm-router-premium-app}"
SECRET="${SECRET:-llm-router-ui-api-key}"
CUSTOM_DOMAIN="$(printf '%s' "${CUSTOM_DOMAIN:-}" | tr '[:upper:]' '[:lower:]')"
if [ -n "$CUSTOM_DOMAIN" ] && ! printf '%s' "$CUSTOM_DOMAIN" | grep -Eq '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'; then
  echo "CUSTOM_DOMAIN must be a hostname like demo.example.com" >&2; exit 1
fi
RUNTIME_SA="${SERVICE}-sa@${PROJECT_ID}.iam.gserviceaccount.com"
DIR="$(cd "$(dirname "$0")" && pwd)"
G="gcloud --project=$PROJECT_ID --quiet"

echo "== APIs"
$G services enable run.googleapis.com iap.googleapis.com secretmanager.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com

echo "== Apigee app key -> Secret Manager ($SECRET)"
new_secret=0
if ! $G secrets describe "$SECRET" >/dev/null 2>&1; then
  $G secrets create "$SECRET" --replication-policy=automatic >/dev/null
  new_secret=1
fi
if [ "$new_secret" = 1 ] || [ "${ROTATE_KEY:-0}" = 1 ]; then
  key="$(apigeecli apps get -n "$APP_NAME" -o "$ORG" --default-token --no-warnings | jq -r '.[0].credentials[0].consumerKey')"
  [ -n "$key" ] && [ "$key" != null ] || { echo "Could not read the key of app $APP_NAME" >&2; exit 1; }
  printf '%s' "$key" | $G secrets versions add "$SECRET" --data-file=- >/dev/null
  unset key
  echo "   stored a new secret version"
else
  echo "   secret exists (set ROTATE_KEY=1 to store a new version)"
fi

echo "== Runtime service account ($RUNTIME_SA)"
if ! $G iam service-accounts describe "$RUNTIME_SA" >/dev/null 2>&1; then
  $G iam service-accounts create "${SERVICE}-sa" --display-name="LLM router demo UI (Cloud Run)" >/dev/null
fi
$G secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$RUNTIME_SA" \
  --role=roles/secretmanager.secretAccessor >/dev/null

echo "== Build context"
BUILD="$DIR/.build"
rm -rf "$BUILD"; mkdir -p "$BUILD"
cp "$DIR/Dockerfile" "$DIR/package.json" "$DIR/server.js" "$BUILD/"
cp -R "$DIR/public" "$BUILD/public"
cp "$DIR/../apigee-proxies/llm-router/apiproxy/resources/properties/routing.properties" "$BUILD/"
trap 'rm -rf "$BUILD"' EXIT

echo "== Deploy $SERVICE to Cloud Run ($REGION) with IAP"
$G run deploy "$SERVICE" --source "$BUILD" --region "$REGION" \
  --service-account "$RUNTIME_SA" \
  --no-allow-unauthenticated --iap \
  --set-secrets "PREMIUM_KEY=${SECRET}:latest" \
  --set-env-vars "APIGEE_HOST=${APIGEE_HOST},ORG=${ORG},APIGEE_ENV=${APIGEE_ENV},PUBLIC_HOSTS=${CUSTOM_DOMAIN}" \
  --cpu 1 --memory 512Mi --min-instances 0 --max-instances 2 --concurrency 40 --timeout 300

echo "== Let the IAP service agent invoke the service"
PROJECT_NUMBER="$($G projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gcloud beta services identity create --service=iap.googleapis.com --project="$PROJECT_ID" >/dev/null 2>&1 || true
$G run services add-iam-policy-binding "$SERVICE" --region "$REGION" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-iap.iam.gserviceaccount.com" \
  --role=roles/run.invoker >/dev/null

echo "== IAP access"
IFS=',' read -r -a members <<< "$IAP_MEMBERS"
for m in "${members[@]}"; do
  m="$(echo "$m" | tr -d '[:space:]')"
  [ -n "$m" ] || continue
  $G iap web add-iam-policy-binding --resource-type=cloud-run --service="$SERVICE" --region="$REGION" \
    --member="$m" --role=roles/iap.httpsResourceAccessor >/dev/null
  echo "   granted $m"
done

URL="$($G run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"

if [ -n "$CUSTOM_DOMAIN" ]; then
  echo "== Custom domain ($CUSTOM_DOMAIN)"
  if $G beta run domain-mappings describe --domain "$CUSTOM_DOMAIN" --region "$REGION" >/dev/null 2>&1; then
    echo "   domain mapping exists"
  else
    $G beta run domain-mappings create --service "$SERVICE" --domain "$CUSTOM_DOMAIN" --region "$REGION"
    echo "   add the DNS record above (e.g. CNAME -> ghs.googlehosted.com.); the managed certificate follows"
  fi
  URL="https://$CUSTOM_DOMAIN"
fi
echo
echo "✓ Deployed: $URL  (sign in with an account listed in IAP_MEMBERS)"
