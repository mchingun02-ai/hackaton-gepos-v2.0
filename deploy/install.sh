#!/usr/bin/env bash
# Ubuntu 22.04/24.04 (Alibaba ECS) дээр нэг удаа ажиллуулна:  sudo GEPOS_DOMAIN=ai.example.mn bash deploy/install.sh
set -euo pipefail
: "${GEPOS_DOMAIN:?GEPOS_DOMAIN=<домэйн> гэж өгнө үү}"
REPO=${REPO:-$(cd "$(dirname "$0")/.." && pwd)}

# 1. Node 26 (node:sqlite) — nodejs.org-ийн албан ёсны бинар, Caddy, sqlite3, rsync
apt-get update
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl sqlite3 rsync xz-utils gnupg
if ! node -v 2>/dev/null | grep -qE '^v(2[6-9]|[3-9][0-9])'; then
  ARCH=$(uname -m); case "$ARCH" in x86_64) NA=x64 ;; aarch64) NA=arm64 ;; *) echo "Дэмжигдээгүй CPU: $ARCH"; exit 1 ;; esac
  TARBALL=$(curl -fsSL https://nodejs.org/dist/latest-v26.x/SHASUMS256.txt | grep -oE "node-v26[0-9.]+-linux-$NA\.tar\.xz" | head -1)
  curl -fsSL "https://nodejs.org/dist/latest-v26.x/$TARBALL" -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
fi
node -v
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi
# Бага санах ойтой (≤3 GB) серверт build OOM болохоос сэргийлж 2 GB swap
if [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 3500 ] && ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2. Хэрэглэгч, хавтас
id gepos >/dev/null 2>&1 || useradd --system --home /opt/gepos --shell /usr/sbin/nologin gepos
mkdir -p /opt/gepos /var/lib/gepos /var/backups/gepos
rsync -a --delete --exclude node_modules --exclude '.next*' --exclude data --exclude .env.local "$REPO/" /opt/gepos/app/
# Өгөгдлийн багц (заавал биш): DATA_TGZ=/root/gepos-data.tgz — анх удаа л сэргээнэ (байгаа өгөгдлийг дарахгүй)
if [ -n "${DATA_TGZ:-}" ] && [ -f "$DATA_TGZ" ] && [ ! -f /var/lib/gepos/gerege-ai.db ]; then
  tar -xzf "$DATA_TGZ" -C /var/lib/gepos
  echo ">>> Өгөгдөл сэргээв: $DATA_TGZ"
fi
chown -R gepos:gepos /opt/gepos /var/lib/gepos

# 3. Тохиргоо (анх удаа .env.example-ээс; дараа нь /etc/gepos.env-г гараар засна)
if [ ! -f /etc/gepos.env ]; then
  cp /opt/gepos/app/.env.example /etc/gepos.env
  sed -i "s|^SP_PUBLIC_URL=.*|SP_PUBLIC_URL=https://$GEPOS_DOMAIN|" /etc/gepos.env
  grep -q '^AUTH_SECRET=' /etc/gepos.env && sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -hex 32)|" /etc/gepos.env || echo "AUTH_SECRET=$(openssl rand -hex 32)" >> /etc/gepos.env
  grep -q '^TENANT_KEK=' /etc/gepos.env && sed -i "s|^TENANT_KEK=.*|TENANT_KEK=$(openssl rand -hex 32)|" /etc/gepos.env || echo "TENANT_KEK=$(openssl rand -hex 32)" >> /etc/gepos.env
  chmod 600 /etc/gepos.env
  echo ">>> /etc/gepos.env-д DASHSCOPE_API_KEY, AI_BASE_URL гэх мэтийг бөглөөд дахин ажиллуулна уу."
fi

# 4. Build
cd /opt/gepos/app
sudo -u gepos env HOME=/opt/gepos npm ci
sudo -u gepos env HOME=/opt/gepos NODE_OPTIONS=--max-old-space-size=1536 npm run build

# 5. Үйлчилгээ, HTTPS, нөөцлөлт
cp deploy/gepos.service /etc/systemd/system/gepos.service
cp deploy/Caddyfile /etc/caddy/Caddyfile
echo "GEPOS_DOMAIN=$GEPOS_DOMAIN" > /etc/default/caddy
mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=/etc/default/caddy\n' > /etc/systemd/system/caddy.service.d/env.conf
install -m 755 deploy/backup.sh /usr/local/bin/gepos-backup
echo "30 3 * * * root SP_DATA_DIR=/var/lib/gepos /usr/local/bin/gepos-backup" > /etc/cron.d/gepos-backup
systemctl daemon-reload
systemctl enable --now gepos caddy
systemctl restart gepos caddy
echo ">>> Бэлэн: https://$GEPOS_DOMAIN/ai  (лог: journalctl -u gepos -f)"
