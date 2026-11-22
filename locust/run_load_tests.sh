#!/usr/bin/env bash
# Runs the same Locust test against 1, 2 and 4 API containers and writes
# results/summary.md. Run from the project root on the server:
#     bash locust/run_load_tests.sh
# Settings can be changed with environment variables, for example:
#     USERS=100 DURATION=3m bash locust/run_load_tests.sh
set -euo pipefail

PORT=${APP_PORT:-8095}
HOST="http://localhost:${PORT}"
USERS=${USERS:-50}
SPAWN_RATE=${SPAWN_RATE:-10}
DURATION=${DURATION:-2m}
CONTAINER_COUNTS=${CONTAINER_COUNTS:-"1 2 4"}
mkdir -p results

for n in $CONTAINER_COUNTS; do
  echo "=== ${n} container(s) ==="
  docker compose up -d --scale api="$n" --no-recreate
  docker compose restart nginx >/dev/null

  echo "Waiting for ${n} healthy API container(s)..."
  for _ in $(seq 1 60); do
    healthy=$(docker compose ps api --format '{{.Health}}' | grep -c '^healthy$' || true)
    [ "$healthy" -ge "$n" ] && break
    sleep 5
  done
  seen=$(for _ in $(seq 1 30); do curl -s "${HOST}/api/health" | python3 -c "import sys,json; print(json.load(sys.stdin)['container'])"; done | sort -u | wc -l)
  echo "Healthy: ${healthy}; distinct containers answering through nginx: ${seen}"

  docker run --rm --user root --network host -v "$PWD":/mnt/project -w /mnt/project locustio/locust \
    -f locust/locustfile.py --headless --host "$HOST" \
    -u "$USERS" -r "$SPAWN_RATE" -t "$DURATION" --only-summary \
    --csv "results/containers_${n}" || true
  echo "${n} ${seen}" >> results/containers_seen.txt
done

python3 locust/summarise.py results > results/summary.md
cat results/summary.md
