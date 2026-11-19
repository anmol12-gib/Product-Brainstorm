#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
chmod 700 backups
out="backups/brainstorm-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose --env-file deployment/.env -f deployment/compose.prod.yml exec -T db \
  pg_dump -U brainstorm -d brainstorm | gzip > "$out"
chmod 600 "$out"
echo "Backup saved to $out"
if [ -n "${BACKUP_S3_URI:-}" ]; then
  aws s3 cp "$out" "$BACKUP_S3_URI/" --sse AES256
  echo 'Encrypted off-server backup uploaded.'
else
  echo 'WARNING: Copy this backup OFF the server; local-only backups do not survive disk loss.'
fi
