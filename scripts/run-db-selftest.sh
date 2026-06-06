#!/usr/bin/env bash
# Stand up a throwaway Postgres, apply the Supabase auth mock + the real
# migrations, then run db_selftest.sql which proves the Stage-1 security
# assertions and wealth math. Exits nonzero if any assertion fails.
#
# Requires: Docker. No local psql needed (psql runs inside the container).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
CONTAINER="irg-selftest-pg"
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

run_file() {
  echo "==> applying $1"
  $PSQL -q -f - < "$2"
}

run_file "_supabase_mock.sql"        "$HERE/_supabase_mock.sql"
run_file "0001_schema.sql"           "$ROOT/supabase/migrations/0001_schema.sql"
run_file "0002_rls.sql"              "$ROOT/supabase/migrations/0002_rls.sql"
run_file "0003_functions.sql"        "$ROOT/supabase/migrations/0003_functions.sql"

echo "==> running db_selftest.sql"
$PSQL -f - < "$HERE/db_selftest.sql"

echo
echo "==================================================="
echo " STAGE-1 DB SELF-TEST: PASSED"
echo "==================================================="
