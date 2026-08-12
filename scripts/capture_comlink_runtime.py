#!/usr/bin/env python3
"""Capture reproducible, non-secret diagnostics for a running Comlink container."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import subprocess
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SENSITIVE_ENV_FRAGMENTS = ("ACCESS", "AUTH", "KEY", "PASSWORD", "SECRET", "TOKEN")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def run(command: list[str]) -> dict[str, Any]:
    try:
        completed = subprocess.run(command, capture_output=True, check=False, text=True, timeout=20)
    except Exception as error:  # Diagnostics must never hide the original updater failure.
        return {"ok": False, "error": f"{type(error).__name__}: {error}"}
    return {
        "ok": completed.returncode == 0,
        "returnCode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }


def parsed_stdout(result: dict[str, Any]) -> Any:
    stdout = result.get("stdout")
    if not isinstance(stdout, str) or not stdout:
        return None
    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        return stdout


def redact_environment(entries: Any) -> list[str]:
    redacted: list[str] = []
    for entry in entries if isinstance(entries, list) else []:
        name, separator, value = str(entry).partition("=")
        if separator and any(fragment in name.upper() for fragment in SENSITIVE_ENV_FRAGMENTS):
            redacted.append(f"{name}=***")
        else:
            redacted.append(str(entry))
    return redacted


def fetch_openapi(url: str, output: Path) -> dict[str, Any]:
    endpoint = f"{url.rstrip('/')}/openapi.json"
    request = urllib.request.Request(endpoint, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read()
            status = response.status
            content_type = response.headers.get("Content-Type", "")
        document = json.loads(body)
        atomic_json(output, document)
        return {
            "ok": True,
            "url": endpoint,
            "status": status,
            "contentType": content_type,
            "bytes": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
            "serverInfo": document.get("info", {}) if isinstance(document, dict) else {},
        }
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
        return {"ok": False, "url": endpoint, "error": f"{type(error).__name__}: {error}"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--cache-dir", required=True, type=Path)
    parser.add_argument("--compose-file", required=True, type=Path)
    parser.add_argument("--compose-project", required=True)
    arguments = parser.parse_args()

    docker_compose = [
        "docker",
        "compose",
        "--project-name",
        arguments.compose_project,
        "--file",
        str(arguments.compose_file),
    ]
    container_id_result = run([*docker_compose, "ps", "--quiet", "comlink"])
    container_id = str(container_id_result.get("stdout", "")).strip()

    runtime: dict[str, Any] = {
        "schemaVersion": 1,
        "capturedAt": utc_now(),
        "comlink": {
            "url": arguments.url,
            "serverVersionRequested": os.environ.get("COMLINK_SERVER_VERSION", "4.5.0"),
            "appName": os.environ.get("COMLINK_APP_NAME", ""),
            "containerId": container_id,
        },
        "host": {
            "platform": platform.platform(),
            "machine": platform.machine(),
            "python": platform.python_version(),
        },
        "docker": {
            "version": parsed_stdout(run(["docker", "version", "--format", "{{json .}}"])),
            "composeVersion": parsed_stdout(
                run(["docker", "compose", "version", "--format", "json"])
            ),
        },
        "openapi": fetch_openapi(arguments.url, arguments.cache_dir / "openapi.json"),
    }

    if container_id:
        container_result = run(["docker", "inspect", container_id])
        container_documents = parsed_stdout(container_result)
        container = (
            container_documents[0]
            if isinstance(container_documents, list) and container_documents
            else {}
        )
        config = container.get("Config", {}) if isinstance(container, dict) else {}
        host_config = container.get("HostConfig", {}) if isinstance(container, dict) else {}
        network = container.get("NetworkSettings", {}) if isinstance(container, dict) else {}
        state = container.get("State", {}) if isinstance(container, dict) else {}
        runtime["container"] = {
            "id": container.get("Id"),
            "created": container.get("Created"),
            "imageId": container.get("Image"),
            "image": config.get("Image"),
            "environment": redact_environment(config.get("Env")),
            "state": {
                "status": state.get("Status"),
                "running": state.get("Running"),
                "startedAt": state.get("StartedAt"),
                "error": state.get("Error"),
            },
            "portBindings": host_config.get("PortBindings"),
            "ports": network.get("Ports"),
        }

        image_id = container.get("Image") if isinstance(container, dict) else None
        if image_id:
            image_result = run(["docker", "image", "inspect", str(image_id)])
            image_documents = parsed_stdout(image_result)
            image = image_documents[0] if isinstance(image_documents, list) and image_documents else {}
            runtime["image"] = {
                "id": image.get("Id"),
                "created": image.get("Created"),
                "repoTags": image.get("RepoTags"),
                "repoDigests": image.get("RepoDigests"),
                "os": image.get("Os"),
                "architecture": image.get("Architecture"),
            }
    else:
        runtime["containerLookup"] = container_id_result

    atomic_json(arguments.cache_dir / "runtime.json", runtime)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
