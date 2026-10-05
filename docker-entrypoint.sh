#!/bin/sh
# VANGUARD OPS container entrypoint: apply DB migrations (if a DB is configured), then start.
set -e
cd /app/server
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] applying database migrations"
  ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
fi
echo "[entrypoint] starting server on :${PORT:-8080}"
exec node dist/index.js
