#!/usr/bin/env bash
# Manage the SHARED custom (on-prem / self-hosted) endpoints of the llm-router demo.
# Shared endpoints appear for every demo user as catalog models "shared-1".."shared-3".
# They live in the encrypted Apigee environment KVM "custom-endpoints":
#   shared-N      JSON metadata {label, url, model, priceIn, priceOut}   (no secrets; host shown in the UI)
#   shared-N-key  optional API key, sent to the endpoint as "Authorization: Bearer <key>"
#
# Usage:
#   scripts/custom-endpoint.sh promote --slot 1 --url https://llm.example.com/v1 --model llama3.1:8b \
#       [--label "On-prem Llama"] [--price-in 0.10 --price-out 0.40] [--key-env MY_KEY_VAR | --key-prompt | --keep-key]
#   scripts/custom-endpoint.sh list
#   scripts/custom-endpoint.sh remove --slot 1
#
# The URL is checked with web-ui/endpoint-policy.js (public HTTPS host on 443, DNS must resolve to public IPs only,
# optional allow-list custom_allowed_hosts in routing.properties). Changes are live within ~60 s (KVM + UI caches).
# Auth: APIGEE_TOKEN if set, else Application Default Credentials (gcloud auth application-default login).
set -euo pipefail

ORG="${ORG:-YOUR_PROJECT_ID}"
ENV="${ENV:-default-dev}"
MAP="custom-endpoints"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROPS="$DIR/apigee-proxies/llm-router/apiproxy/resources/properties/routing.properties"

die() { echo "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }
need apigeecli; need jq; need node

TOKEN="${APIGEE_TOKEN:-$(gcloud auth application-default print-access-token 2>/dev/null || true)}"
[ -n "$TOKEN" ] || die "no Apigee token: set APIGEE_TOKEN or run 'gcloud auth application-default login'"
A=(apigeecli --no-warnings -o "$ORG" -t "$TOKEN")

ensure_map() {
  if ! "${A[@]}" kvms list -e "$ENV" | jq -e --arg m "$MAP" 'index($m) != null' >/dev/null 2>&1; then
    "${A[@]}" kvms create -e "$ENV" -n "$MAP" >/dev/null
    echo "created encrypted KVM $MAP in $ENV"
  fi
}

# Replace an entry (apigeecli has no upsert). The value is passed as an argument, so it is briefly visible
# to other local processes (same as the README's KVM steps); it is never echoed.
put_entry() {
  "${A[@]}" kvms entries delete -e "$ENV" -m "$MAP" -k "$1" >/dev/null 2>&1 || true
  "${A[@]}" kvms entries create -e "$ENV" -m "$MAP" -k "$1" -l "$2" >/dev/null
}
del_entry() { "${A[@]}" kvms entries delete -e "$ENV" -m "$MAP" -k "$1" >/dev/null 2>&1 || true; }

cmd="${1:-}"; shift || true
SLOT="" URL="" MODEL="" LABEL="" PIN="" POUT="" KEY_ENV="" KEY_PROMPT=0 KEEP_KEY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --slot) SLOT="$2"; shift 2 ;;
    --url) URL="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    --price-in) PIN="$2"; shift 2 ;;
    --price-out) POUT="$2"; shift 2 ;;
    --key-env) KEY_ENV="$2"; shift 2 ;;
    --key-prompt) KEY_PROMPT=1; shift ;;
    --keep-key) KEEP_KEY=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) die "unknown option $1" ;;
  esac
done

case "$cmd" in
  promote)
    [[ "$SLOT" =~ ^[1-3]$ ]] || die "--slot must be 1, 2 or 3"
    [ -n "$URL" ] && [ -n "$MODEL" ] || die "--url and --model are required"
    ALLOWED="$(sed -n 's/^[[:space:]]*custom_allowed_hosts[[:space:]]*=[[:space:]]*//p' "$PROPS" | tail -1)"
    META="$(EP_URL="$URL" EP_MODEL="$MODEL" EP_LABEL="$LABEL" EP_PIN="$PIN" EP_POUT="$POUT" EP_ALLOWED="$ALLOWED" \
      node -e '
        const ep = require(process.argv[1]);
        (async () => {
          try {
            const allowed = (process.env.EP_ALLOWED || "").split(",").map(s => s.trim()).filter(Boolean);
            const { url, host } = ep.normalizeUrl(process.env.EP_URL, allowed);
            await ep.checkDns(host);
            const price = ep.checkPrice(process.env.EP_PIN, process.env.EP_POUT);
            const meta = { label: ep.checkLabel(process.env.EP_LABEL, host), url, model: ep.checkModel(process.env.EP_MODEL) };
            if (price) { meta.priceIn = price.in; meta.priceOut = price.out; }
            process.stdout.write(JSON.stringify(meta));
          } catch (e) { console.error("endpoint rejected: " + e.message); process.exit(1); }
        })();' "$DIR/web-ui/endpoint-policy.js")" || exit 1

    KEY=""
    if [ -n "$KEY_ENV" ]; then KEY="${!KEY_ENV:-}"; [ -n "$KEY" ] || die "environment variable $KEY_ENV is empty"; fi
    if [ "$KEY_PROMPT" = 1 ]; then read -r -s -p "API key for shared-$SLOT (input hidden): " KEY; echo; fi
    if [ -n "$KEY" ] && ! [[ "$KEY" =~ ^[[:graph:]]{1,512}$ ]]; then die "API key must be 1-512 printable characters without spaces"; fi

    ensure_map
    put_entry "shared-$SLOT" "$META"
    if [ -n "$KEY" ]; then put_entry "shared-$SLOT-key" "$KEY"; echo "stored API key for shared-$SLOT"
    elif [ "$KEEP_KEY" = 0 ]; then del_entry "shared-$SLOT-key"; fi
    unset KEY
    echo "shared-$SLOT -> $(echo "$META" | jq -r '"\(.label) · \(.model) · \(.url)"')"
    echo "Live for all demo users within ~60 s."
    ;;
  list)
    ensure_map
    # Only metadata entries are printed; *-key entries are listed by name, never by value.
    "${A[@]}" kvms entries list -e "$ENV" -m "$MAP" | jq -r '
      (.keyValueEntries // .) | map(select(type == "object")) | sort_by(.name)[] |
      if (.name | endswith("-key")) then "  \(.name): (API key set)"
      else "\(.name): \((.value // "") | (fromjson? // .) | if type == "object" then "\(.label) · \(.model) · \(.url)\(if .priceIn != null then " · $\(.priceIn)/$\(.priceOut) per 1M" else "" end)" else "(value not readable)" end)"
      end'
    ;;
  remove)
    [[ "$SLOT" =~ ^[1-3]$ ]] || die "--slot must be 1, 2 or 3"
    del_entry "shared-$SLOT"; del_entry "shared-$SLOT-key"
    echo "removed shared-$SLOT (gone from the UI within ~60 s)"
    ;;
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
