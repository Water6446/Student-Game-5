#!/usr/bin/env bash
# Stand up a throwaway Postgres, apply the Supabase auth mock + EVERY migration,
# then run accounts_selftest.sql which proves the account layer (0016-0022).
# Exits nonzero if any assertion fails.
#
# Unlike run-db-selftest.sh (which applies only 0001-0003, so that it can assert
# the anonymous-host guard that migration 0008 deliberately removes), this one
# applies the full migration set — the account layer has to be proven against
# the schema as actually deployed.
#
# Requires: Docker. No local psql needed (psql runs inside the container).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
CONTAINER="irg-accounts-selftest-pg"
IMAGE="postgres:16-alpine"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "==> starting $IMAGE"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=app "$IMAGE" >/dev/null

echo -n "==> waiting for postgres"
for i in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d app >/dev/null 2>&1; then
    echo " ready"; break
  fi
  echo -n "."; sleep 1
  if [ "$i" = "60" ]; then echo " timed out"; exit 1; fi
done

PSQL="docker exec -i $CONTAINER psql -v ON_ERROR_STOP=1 -U postgres -d app"

echo "==> applying _supabase_mock.sql"
$PSQL -q -f - < "$HERE/_supabase_mock.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "==> applying $(basename "$f")"
  $PSQL -q -f - < "$f"
done

echo "==> running accounts_selftest.sql"
$PSQL -f - < "$HERE/accounts_selftest.sql"

echo
echo "==================================================="
echo " ACCOUNT LAYER SELF-TEST: PASSED"
echo "==================================================="
