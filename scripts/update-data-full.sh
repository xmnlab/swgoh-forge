#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${script_dir}/.." && pwd)"
compose_file="${repository_root}/compose.comlink.yaml"
compose_project="swgoh-forge-data"

choose_port() {
  python3 - <<'PY'
import socket

with socket.socket() as server:
    server.bind(("127.0.0.1", 0))
    print(server.getsockname()[1])
PY
}

comlink_port="${COMLINK_PORT:-$(choose_port)}"
export COMLINK_PORT="${comlink_port}"
export COMLINK_URL="http://127.0.0.1:${comlink_port}"

cleanup() {
  trap - EXIT INT TERM
  docker compose --project-name "${compose_project}" --file "${compose_file}" down
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Starting local Comlink on ${COMLINK_URL}"
docker compose --project-name "${compose_project}" --file "${compose_file}" up --detach

ready=false
for _ in {1..60}; do
  if python3 - "${comlink_port}" <<'PY'
import socket
import sys

try:
    with socket.create_connection(("127.0.0.1", int(sys.argv[1])), timeout=0.25):
        pass
except OSError:
    raise SystemExit(1)
PY
  then
    ready=true
    break
  fi
  sleep 1
done

if [[ "${ready}" != true ]]; then
  echo "Comlink did not begin listening on ${COMLINK_URL} within 60 seconds." >&2
  docker compose --project-name "${compose_project}" --file "${compose_file}" logs comlink >&2
  exit 1
fi

"${script_dir}/update-data.sh" "$@"
