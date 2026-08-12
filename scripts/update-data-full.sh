#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${script_dir}/.." && pwd)"
compose_file="${repository_root}/compose.comlink.yaml"
compose_project="swgoh-forge-data"
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
    logs --no-color --timestamps comlink >"${cache_dir}/container.log" 2>&1 || true
}

capture_runtime() {
  python3 "${script_dir}/capture_comlink_runtime.py" \
    --url "${COMLINK_URL}" \
    --cache-dir "${cache_dir}" \
    --compose-file "${compose_file}" \
    --compose-project "${compose_project}"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Starting Comlink ${COMLINK_SERVER_VERSION} on ${COMLINK_URL} as ${COMLINK_APP_NAME}"
if ! docker compose --project-name "${compose_project}" --file "${compose_file}" up --detach; then
  capture_logs
  echo "Comlink failed to start; container logs were saved to ${cache_dir}/container.log" >&2
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
        raise RuntimeError("Comlink /enums response is not ready")
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
  echo "Comlink did not begin listening on ${COMLINK_URL} within 60 seconds." >&2
  capture_logs
  echo "Container logs were saved to ${cache_dir}/container.log" >&2
  exit 1
fi

if ! capture_runtime; then
  echo "Warning: runtime diagnostics could not be captured; continuing with the data request." >&2
fi

if ! "${script_dir}/update-data.sh" "$@"; then
  capture_logs
  echo "Comlink diagnostics were saved under ${cache_dir}/" >&2
  echo "  request trace: ${cache_dir}/diagnostic.json" >&2
  echo "  runtime/image: ${cache_dir}/runtime.json" >&2
  echo "  API schema:    ${cache_dir}/openapi.json" >&2
  echo "  server logs:   ${cache_dir}/container.log" >&2
  exit 1
fi

capture_logs

dry_run=false
for argument in "$@"; do
  if [[ "${argument}" == "--dry-run" ]]; then
    dry_run=true
    break
  fi
done

if [[ "${dry_run}" == true ]]; then
  echo "The complete Comlink catalog was validated successfully; dry run left files unchanged."
else
  if ! grep -Eq '"?status"?[[:space:]]*:[[:space:]]*"generated"' \
    "${repository_root}/data/catalog-meta.js"; then
    echo "The updater exited without marking data/catalog-meta.js as generated." >&2
    echo "The bundled 53-character seed catalog is still active; no update was published." >&2
    exit 1
  fi
  echo "The complete Comlink catalog was generated successfully."
fi
