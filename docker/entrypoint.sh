#!/bin/sh
set -eu

# Run DB migrations once from the API service only (avoids races with worker/web).
if [ "${SERVICE}" = "api" ] && [ "${SKIP_DB_MIGRATE:-0}" != "1" ]; then
  echo "[entrypoint] Running prisma migrate deploy..."
  pnpm --filter @notif/db exec prisma migrate deploy
  echo "[entrypoint] Migrations complete."
fi

exec "$@"
