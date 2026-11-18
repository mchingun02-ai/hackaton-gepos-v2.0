#!/usr/bin/env bash
# Ubuntu 22.04/24.04 (Alibaba ECS) дээр нэг удаа ажиллуулна:  sudo GEPOS_DOMAIN=ai.example.mn bash deploy/install.sh
set -euo pipefail
: "${GEPOS_DOMAIN:?GEPOS_DOMAIN=<домэйн> гэж өгнө үү}"
REPO=${REPO:-$(cd "$(dirname "$0")/.." && pwd)}

# 1. Node 26 (node:sqlite), Caddy, sqlite3
if ! node -v 2>/dev/null | grep -qE '^v(2[6-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_26.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl sqlite3
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

# 2. Хэрэглэгч, хавтас
id gepos >/dev/null 2>&1 || useradd --system --home /opt/gepos --shell /usr/sbin/nologin gepos
mkdir -p /opt/gepos /var/lib/gepos /var/backups/gepos
rsync -a --delete --exclude node_modules --exclude '.next*' --exclude data --exclude .env.local "$REPO/" /opt/gepos/app/
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
sudo -u gepos npm ci
sudo -u gepos npm run build

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
