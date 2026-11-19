#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f deployment/.env ]; then echo 'Missing deployment/.env'; exit 1; fi
set -a; source deployment/.env; set +a
if [[ "$DOMAIN" == brainstorm.example.com || "$POSTGRES_PASSWORD" == REPLACE* ]]; then echo 'Edit deployment/.env first';exit 1;fi
docker compose --env-file deployment/.env -f deployment/compose.prod.yml up -d --build --wait
curl --fail --silent --show-error --max-time 20 "https://${DOMAIN}/api/ready"
printf '\nSite deployed: https://%s\n' "$DOMAIN"
