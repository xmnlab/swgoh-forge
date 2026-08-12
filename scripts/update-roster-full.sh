#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 ALLY_CODE [--dry-run]" >&2
  exit 2
fi

ally_code="$1"
shift

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${script_dir}/.." && pwd)"
compose_file="${repository_root}/compose.comlink.yaml"
compose_project="swgoh-forge-roster"
cache_dir="${repository_root}/.cache/comlink"
app_name_file="${cache_dir}/app-name"

mkdir -p "${cache_dir}"

if [[ -z "${COMLINK_APP_NAME:-}" ]]; then
  if [[ -s "${app_name_file}" ]]; then
    read -r COMLINK_APP_NAME <"${app_name_file}"
  else
    COMLINK_APP_NAME="$(python3 - "${repository_root}" <<'PY'
import hashlib
import os
import socket
import sys

identity = f"{socket.gethostname()}:{os.getuid()}:{sys.argv[1]}"
print(f"swgoh-forge-{hashlib.sha256(identity.encode()).hexdigest()[:16]}")
PY
)"
    printf '%s\n' "${COMLINK_APP_NAME}" >"${app_name_file}"
    chmod 600 "${app_name_file}"
  fi
fi
export COMLINK_APP_NAME
export COMLINK_SERVER_VERSION="${COMLINK_SERVER_VERSION:-4.5.0}"

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

capture_logs() {
  docker compose --project-name "${compose_project}" --file "${compose_file}" \
    logs --no-color --timestamps comlink >"${cache_dir}/roster-container.log" 2>&1 || true
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Starting local Comlink ${COMLINK_SERVER_VERSION} on ${COMLINK_URL}"
if ! docker compose --project-name "${compose_project}" --file "${compose_file}" up --detach; then
  capture_logs
  echo "Comlink failed to start; logs were saved to ${cache_dir}/roster-container.log" >&2
  exit 1
fi

ready=false
for _ in {1..60}; do
  if python3 - "${COMLINK_URL}" <<'PY'
import json
import sys
import urllib.request

try:
    with urllib.request.urlopen(f"{sys.argv[1]}/enums", timeout=1) as response:
        document = json.load(response)
    if response.status != 200 or not any("GameDataItems" in key for key in document):
        raise RuntimeError("Comlink is not ready")
except Exception:
    raise SystemExit(1)
PY
  then
    ready=true
    break
  fi
  sleep 1
done

if [[ "${ready}" != true ]]; then
  capture_logs
  echo "Comlink did not begin listening within 60 seconds." >&2
  echo "Logs were saved to ${cache_dir}/roster-container.log" >&2
  exit 1
fi

if ! python3 "${script_dir}/update_roster_data.py" "${ally_code}" --url "${COMLINK_URL}" "$@"; then
  capture_logs
  echo "Comlink logs were saved to ${cache_dir}/roster-container.log" >&2
  exit 1
fi

capture_logs
