#!/usr/bin/env bash
# Startup script for developer-workstation-client-vm (runs as root on every boot; idempotent).
# Installs Claude Code and points it at the Apigee gateway. The only credential on this VM is the
# Apigee developer app key, fetched from Secret Manager on demand by /usr/local/bin/apigee-key.
set -euo pipefail

md() { curl -sf -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/$1"; }
GATEWAY_URL="$(md instance/attributes/gateway-url)"           # e.g. https://YOUR_APIGEE_HOST
KEY_SECRET="$(md instance/attributes/key-secret)"             # e.g. claude-cli-vm-key
DEFAULT_MODEL="$(md instance/attributes/default-model || echo glm-5.2)"
BACKGROUND_MODEL="$(md instance/attributes/background-model || echo gemini-3.5-flash-lite)"
PROJECT="$(md project/project-id)"
BASE_URL="${GATEWAY_URL%/}/llm-router/anthropic"

# ---- Packages: Node 22 + Claude Code + tools ----
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg git jq
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
command -v claude >/dev/null || npm install -g @anthropic-ai/claude-code

# ---- Gateway settings for the helper scripts ----
mkdir -p /etc/llm-gateway
cat > /etc/llm-gateway/env <<EOF
LLM_GATEWAY_BASE_URL=$BASE_URL
LLM_GATEWAY_PROJECT=$PROJECT
LLM_GATEWAY_KEY_SECRET=$KEY_SECRET
EOF
chmod 644 /etc/llm-gateway/env

# ---- apiKeyHelper: prints ONLY the Apigee app key (Claude Code sends it as Bearer + x-api-key) ----
cat > /usr/local/bin/apigee-key <<'EOF'
#!/usr/bin/env bash
# Prints the Apigee developer app key for this workstation. Used by Claude Code's apiKeyHelper.
set -euo pipefail
. /etc/llm-gateway/env
TOKEN="$(curl -sf -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token | jq -r .access_token)"
curl -sf -H "Authorization: Bearer $TOKEN" \
  "https://secretmanager.googleapis.com/v1/projects/$LLM_GATEWAY_PROJECT/secrets/$LLM_GATEWAY_KEY_SECRET/versions/latest:access" |
  jq -r .payload.data | base64 -d
EOF
chmod 755 /usr/local/bin/apigee-key

# ---- llm-models: list / choose the models this app is allowed to use; sync managed settings ----
cat > /usr/local/bin/llm-models <<'EOF'
#!/usr/bin/env bash
# llm-models            list the models your Apigee app may use (from the gateway's /v1/models)
# llm-models use <id>   make <id> your default model for Claude Code (~/.claude/settings.json)
# sudo llm-models sync  rebuild /etc/claude-code/managed-settings.json (model picker + allow-list)
set -euo pipefail
. /etc/llm-gateway/env
models_json() {
  curl -sf -H "Authorization: Bearer $(/usr/local/bin/apigee-key)" "$LLM_GATEWAY_BASE_URL/v1/models?limit=1000"
}
case "${1:-list}" in
  list)
    current="$(jq -r '.env.ANTHROPIC_MODEL // empty' ~/.claude/settings.json 2>/dev/null || true)"
    echo "Models allowed for this workstation's Apigee app (gateway: $LLM_GATEWAY_BASE_URL):"
    models_json | jq -r --arg cur "$current" '.data[] | "  \(if .id == $cur then "*" else " " end) \(.id)\t\(.display_name)"' | column -t -s $'\t'
    echo; echo "Choose with: llm-models use <id>   or inside Claude Code: /model   or: claude --model <id>" ;;
  use)
    id="${2:?usage: llm-models use <model-id>}"
    models_json | jq -e --arg id "$id" '.data | any(.id == $id)' >/dev/null ||
      { echo "\"$id\" is not allowed for this app. Run: llm-models"; exit 1; }
    mkdir -p ~/.claude; f=~/.claude/settings.json; [ -s "$f" ] || echo '{}' > "$f"
    tmp="$(mktemp)"; jq --arg id "$id" '.env.ANTHROPIC_MODEL = $id' "$f" > "$tmp" && mv "$tmp" "$f"
    echo "Default model is now $id (start a new claude session)." ;;
  sync)
    [ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
    mkdir -p /etc/claude-code
    models_json | jq --arg base "$LLM_GATEWAY_BASE_URL" '
      [.data[] | {model: .id, label: .display_name, description: ("via Apigee: " + .id)}
        + (if (.id | startswith("claude")) then {} else {behavesAs: "claude-sonnet-4-5"} end)] as $opts | {
        apiKeyHelper: "/usr/local/bin/apigee-key",
        modelPicker: { replaceBuiltInOptions: true, options: $opts },
        availableModels: [$opts[].model],
        enforceAvailableModels: true,
        env: {
          ANTHROPIC_BASE_URL: $base,
          ANTHROPIC_CUSTOM_HEADERS: "x-client-app: claude-code-workstation",
          CLAUDE_CODE_GATEWAY_HINT_HEADERS: "1",
          CLAUDE_CODE_ATTRIBUTION_HEADER: "0",
          CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1",
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
          ENABLE_PROMPT_CACHING_1H: "1"
        }
      }' > /etc/claude-code/managed-settings.json.new
    mv /etc/claude-code/managed-settings.json.new /etc/claude-code/managed-settings.json
    chmod 644 /etc/claude-code/managed-settings.json
    echo "Synced $(jq '.availableModels | length' /etc/claude-code/managed-settings.json) models into /etc/claude-code/managed-settings.json" ;;
  *) sed -n '2,4p' "$0"; exit 1 ;;
esac
EOF
chmod 755 /usr/local/bin/llm-models

# ---- Admin-controlled settings (gateway URL, credential helper, model allow-list) ----
for i in 1 2 3 4 5 6; do /usr/local/bin/llm-models sync && break || sleep 10; done

# ---- Per-developer defaults (new home directories, e.g. OS Login users on first SSH) ----
mkdir -p /etc/skel/.claude
cat > /etc/skel/.claude/settings.json <<EOF
{
  "env": {
    "ANTHROPIC_MODEL": "$DEFAULT_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "$DEFAULT_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.2-thinking",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "$BACKGROUND_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL": "$BACKGROUND_MODEL"
  }
}
EOF
echo '{"hasCompletedOnboarding": true}' > /etc/skel/.claude.json

cat > /etc/motd <<'EOF'

  Developer workstation -> Apigee LLM gateway
  -------------------------------------------
  llm-models              models your Apigee app may use
  llm-models use <id>     set your default model
  claude                  start Claude Code   (inside: /model to switch)
  claude --model <id>     one-off model choice

EOF
echo "startup complete: $(claude --version 2>/dev/null)"
