#!/bin/sh
# Builds DATABASE_URL from the Secret Manager password and the Cloud SQL unix socket, migrates, then runs
# the API (default) or the given command (e.g. the seed job: start.sh python -m app.seed --crew-demo).
set -e
if [ -z "$DATABASE_URL" ] && [ -n "$DB_PASSWORD" ]; then
  export DATABASE_URL="postgresql+psycopg://${DB_USER:-placeholder}:${DB_PASSWORD}@/${DB_NAME:-placeholder}?host=/cloudsql/${CLOUDSQL_INSTANCE}"
fi
alembic upgrade head
if [ "$#" -gt 0 ]; then
  exec "$@"
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}" --proxy-headers
