#!/usr/bin/env bash
# Actualiza ZKLeague en el VPS: trae cambios, instala, compila y reinicia.
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
(cd backend && npm ci --omit=dev)
(cd frontend && npm ci && npm run build)
pm2 restart zkleague --update-env
echo "ZKLeague actualizado."
