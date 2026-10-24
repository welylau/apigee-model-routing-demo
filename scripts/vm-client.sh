#!/usr/bin/env bash
# Developer workstation VM that runs Claude Code against the Apigee LLM gateway.
#   ./scripts/vm-client.sh create   network (Cloud NAT + IAP SSH rule), service account, VM
#   ./scripts/vm-client.sh ssh      SSH in through IAP (the VM has no external IP)
#   ./scripts/vm-client.sh status   VM state + startup-script progress
#   ./scripts/vm-client.sh update   re-apply vm-startup.sh (settings, model list) without recreating
#   ./scripts/vm-client.sh delete   remove the VM and everything create added (the secret stays)
set -euo pipefail

PROJECT="${PROJECT:-YOUR_PROJECT_ID}"
REGION="${REGION:-asia-southeast1}"
ZONE="${ZONE:-asia-southeast1-b}"
NETWORK="${NETWORK:-default}"
VM="${VM:-developer-workstation-client-vm}"
MACHINE="${MACHINE:-e2-small}"
SA_NAME="${SA_NAME:-claude-client-sa}"
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
TAG="${TAG:-claude-client}"
ROUTER="${ROUTER:-claude-client-router}"
NAT="${NAT:-claude-client-nat}"
FW="${FW:-allow-iap-ssh-claude-client}"
KEY_SECRET="${KEY_SECRET:-claude-cli-vm-key}"
GATEWAY_URL="${GATEWAY_URL:-https://YOUR_APIGEE_HOST}"
DEFAULT_MODEL="${DEFAULT_MODEL:-glm-5.2}"
BACKGROUND_MODEL="${BACKGROUND_MODEL:-gemini-3.5-flash-lite}"
DIR="$(cd "$(dirname "$0")" && pwd)"
G="gcloud --project $PROJECT --quiet"
exists() { "$@" >/dev/null 2>&1; }

create() {
  echo "== Cloud Router + NAT ($REGION, $NETWORK): outbound internet for a VM with no external IP"
  exists $G compute routers describe "$ROUTER" --region "$REGION" ||
    $G compute routers create "$ROUTER" --region "$REGION" --network "$NETWORK"
  exists $G compute routers nats describe "$NAT" --router "$ROUTER" --region "$REGION" ||
    $G compute routers nats create "$NAT" --router "$ROUTER" --region "$REGION" \
      --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges

  echo "== Firewall: SSH only from Google's IAP range, only to tag $TAG"
  exists $G compute firewall-rules describe "$FW" ||
    $G compute firewall-rules create "$FW" --network "$NETWORK" --direction INGRESS \
      --action allow --rules tcp:22 --source-ranges 35.235.240.0/20 --target-tags "$TAG"

  echo "== Service account $SA_NAME: may read only the $KEY_SECRET secret"
  exists $G iam service-accounts describe "$SA" ||
    { $G iam service-accounts create "$SA_NAME" --display-name "Claude Code workstation (reads Apigee app key)"; sleep 10; }
  $G secrets add-iam-policy-binding "$KEY_SECRET" --member "serviceAccount:$SA" \
    --role roles/secretmanager.secretAccessor >/dev/null

  echo "== VM $VM ($MACHINE, Debian 12, no external IP, Shielded VM, OS Login)"
  exists $G compute instances describe "$VM" --zone "$ZONE" ||
    $G compute instances create "$VM" --zone "$ZONE" --machine-type "$MACHINE" \
      --image-family debian-12 --image-project debian-cloud --boot-disk-size 20GB \
      --network "$NETWORK" --no-address --tags "$TAG" \
      --service-account "$SA" --scopes cloud-platform \
      --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \
      --labels app=llm-router-demo,component=claude-cli-vm \
      --metadata enable-oslogin=TRUE,gateway-url="$GATEWAY_URL",key-secret="$KEY_SECRET",default-model="$DEFAULT_MODEL",background-model="$BACKGROUND_MODEL" \
      --metadata-from-file startup-script="$DIR/vm-startup.sh"

  echo
  echo "VM created. Claude Code installs in the background (~2-3 min). Check: $0 status"
  echo "Then: $0 ssh   and run: llm-models ; claude"
}

ssh_vm() { $G compute ssh "$VM" --zone "$ZONE" --tunnel-through-iap -- "$@"; }

update() {
  echo "== Re-applying vm-startup.sh on $VM (settings + model list refresh)"
  $G compute instances add-metadata "$VM" --zone "$ZONE" --metadata-from-file startup-script="$DIR/vm-startup.sh"
  ssh_vm sudo google_metadata_script_runner startup
}

status() {
  $G compute instances describe "$VM" --zone "$ZONE" --format 'value(name,status,networkInterfaces[0].networkIP)'
  $G compute instances get-serial-port-output "$VM" --zone "$ZONE" 2>/dev/null |
    grep -E 'startup-script' | tail -5 || true
}

delete() {
  echo "== Deleting VM, NAT, router, firewall rule, service account (secret $KEY_SECRET is kept)"
  exists $G compute instances describe "$VM" --zone "$ZONE" && $G compute instances delete "$VM" --zone "$ZONE"
  exists $G compute routers describe "$ROUTER" --region "$REGION" && $G compute routers delete "$ROUTER" --region "$REGION"
  exists $G compute firewall-rules describe "$FW" && $G compute firewall-rules delete "$FW"
  $G secrets remove-iam-policy-binding "$KEY_SECRET" --member "serviceAccount:$SA" \
    --role roles/secretmanager.secretAccessor >/dev/null 2>&1 || true
  exists $G iam service-accounts describe "$SA" && $G iam service-accounts delete "$SA"
  echo "Done."
}

case "${1:-}" in
  create) create ;;
  ssh) shift; ssh_vm "$@" ;;
  status) status ;;
  update) update ;;
  delete) delete ;;
  *) sed -n '2,7p' "$0"; exit 1 ;;
esac
