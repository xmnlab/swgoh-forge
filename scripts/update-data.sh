#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "${script_dir}/.." && pwd)"
venv_dir="${repository_root}/.venv-data"
export PIP_CACHE_DIR="${repository_root}/.cache/pip"

if [[ ! -x "${venv_dir}/bin/python" ]]; then
  python3 -m venv "${venv_dir}"
fi

if ! "${venv_dir}/bin/python" -m pip --version >/dev/null 2>&1; then
  if ! "${venv_dir}/bin/python" -m ensurepip --upgrade >/dev/null 2>&1; then
    echo "The existing data virtual environment has no pip; rebuilding it." >&2
    if ! python3 -m venv --clear "${venv_dir}"; then
      echo "Unable to rebuild ${venv_dir}. Install your system's Python venv package and retry." >&2
      echo "On Debian or Ubuntu, the package is usually python3-venv." >&2
      exit 1
    fi
  fi
fi

if ! "${venv_dir}/bin/python" -m pip --version >/dev/null 2>&1; then
  echo "Unable to install pip in ${venv_dir}. Install your system's Python venv package and retry." >&2
  echo "On Debian or Ubuntu, the package is usually python3-venv." >&2
  exit 1
fi

if ! "${venv_dir}/bin/python" -c \
  'from importlib.metadata import version; raise SystemExit(version("swgoh_comlink") != "2.3.0")' \
  >/dev/null 2>&1; then
  if ! "${venv_dir}/bin/python" -m pip install --disable-pip-version-check --quiet \
    --requirement "${repository_root}/requirements-data.txt"; then
    echo "Unable to install the pinned data dependency from requirements-data.txt." >&2
    echo "Check your internet connection and Python package-index configuration, then retry." >&2
    exit 1
  fi
fi

exec "${venv_dir}/bin/python" "${script_dir}/update_game_data.py" "$@"
