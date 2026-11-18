#!/usr/bin/env bash
# Шинэ хувилбар байршуулах:  cd <repo> && git pull && sudo bash deploy/update.sh
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
rsync -a --delete --exclude node_modules --exclude '.next*' --exclude data --exclude .env.local "$REPO/" /opt/gepos/app/
chown -R gepos:gepos /opt/gepos
cd /opt/gepos/app && sudo -u gepos env HOME=/opt/gepos npm ci && sudo -u gepos env HOME=/opt/gepos NODE_OPTIONS=--max-old-space-size=1536 npm run build
systemctl restart gepos
sleep 3 && curl -fsS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3100/ai
