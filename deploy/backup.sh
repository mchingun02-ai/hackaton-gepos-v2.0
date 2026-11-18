#!/usr/bin/env bash
# Шөнийн нөөцлөлт: SQLite-г онлайнаар хуулж, мерчантын файлуудыг архивлана. 7 хоног хадгална.
set -euo pipefail
DATA=${SP_DATA_DIR:-/var/lib/gepos}
OUT=/var/backups/gepos/$(date +%F)
mkdir -p "$OUT"
for db in "$DATA"/*.db; do sqlite3 "$db" ".backup '$OUT/$(basename "$db")'"; done
[ -d "$DATA/tenants" ] && tar -C "$DATA" -czf "$OUT/tenants.tgz" tenants
find /var/backups/gepos -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
