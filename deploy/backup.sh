#!/usr/bin/env bash
# Copia de seguridad consistente de la base de datos (seguro con la app corriendo).
# Cron diario sugerido:  15 4 * * *  /ruta/ZKLeague/deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")/../backend"

mkdir -p backups
stamp=$(date +%Y%m%d-%H%M%S)
sqlite3 data/zkleague.sqlite ".backup 'backups/zkleague-$stamp.sqlite'"
# Conserva las últimas 14 copias
ls -1t backups/zkleague-*.sqlite | tail -n +15 | xargs -r rm --
echo "Backup: backups/zkleague-$stamp.sqlite"
