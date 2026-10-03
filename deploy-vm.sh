#!/bin/bash
# Deploy DEJOIY AI Gateway to the Oracle VM.
# IMPORTANT: .env is NEVER synced (it holds real API keys on the VM only).
set -e
cd "$(dirname "$0")"
echo "==> Syncing code to Oracle VM (excluding .env, node_modules, dist, data)..."
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'data' \
  --exclude '.git' \
  --exclude '.env' \
  -e "ssh -F /home/hatch/.ssh/config -i /home/hatch/.ssh/dejoiy-oci" \
  ./ oci-vm:~/ai-gateway/
echo "==> Rebuilding + restarting gateway on VM..."
ssh -F /home/hatch/.ssh/config -i /home/hatch/.ssh/dejoiy-oci oci-vm \
  "cd ~/ai-gateway && docker compose up --build -d 2>&1 | tail -2"
echo "==> Health check..."
sleep 8
ssh -F /home/hatch/.ssh/config -i /home/hatch/.ssh/dejoiy-oci oci-vm \
  "curl -s -m 10 http://127.0.0.1:8000/health; echo"
echo "DONE"
