#!/usr/bin/env python3
"""Fetch one public SWGOH player profile and upsert its static roster snapshot."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPOSITORY_ROOT / "data" / "rosters.js"
DEFAULT_CHARACTERS = REPOSITORY_ROOT / "data" / "characters.js"
DEFAULT_SHIPS = REPOSITORY_ROOT / "data" / "ships.js"
ALLY_CODE_PATTERN = re.compile(r"^[1-9]{9}$")
STORE_VARIABLE = "window.ForgeData.staticRosters"
STAT_FIELDS = {
    1: "health",
    5: "speed",
    6: "offense",
    17: "potency",
    18: "tenacity",
    28: "protection",
}
STAT_NAMES = {
    "UNIT_STAT_MAX_HEALTH": 1,
    "UNIT_STAT_HEALTH": 1,
    "UNIT_STAT_SPEED": 5,
    "UNIT_STAT_PHYSICAL_DAMAGE": 6,
    "UNIT_STAT_POTENCY": 17,
    "UNIT_STAT_TENACITY": 18,
    "UNIT_STAT_MAX_SHIELD": 28,
    "UNIT_STAT_PROTECTION": 28,
}
RARITY_NAMES = {
    "Rarity_DEFAULT": 0,
    "ONE_STAR": 1,
    "TWO_STAR": 2,
    "THREE_STAR": 3,
    "FOUR_STAR": 4,
    "FIVE_STAR": 5,
    "SIX_STAR": 6,
    "SEVEN_STAR": 7,
    "NO_STAR": 0,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_ally_code(value: str) -> str:
    ally_code = re.sub(r"[\s-]", "", value)
    if not ALLY_CODE_PATTERN.fullmatch(ally_code):
        raise ValueError("Ally Code must contain exactly nine digits from 1 through 9.")
    return ally_code


def read_javascript_value(path: Path, variable: str) -> Any:
    text = path.read_text(encoding="utf-8")
    marker = f"{variable} ="
    marker_index = text.find(marker)
    if marker_index < 0:
        raise ValueError(f"Could not find {variable} in {path}")
    value_start = marker_index + len(marker)
    value, _ = json.JSONDecoder().raw_decode(text[value_start:].lstrip())
    return value


def load_catalog(characters_path: Path, ships_path: Path) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    characters = read_javascript_value(characters_path, "window.ForgeData.characters")
    ships = read_javascript_value(ships_path, "window.ForgeData.ships")
    capital_ships = read_javascript_value(ships_path, "window.ForgeData.capitalShips")
    character_by_base = {str(unit["baseId"]).upper(): unit for unit in characters}
    ship_by_base = {str(unit["baseId"]).upper(): unit for unit in [*ships, *capital_ships]}
    return character_by_base, ship_by_base


def enum_number(value: Any, prefix: str = "") -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value or "")
    if prefix and text.startswith(prefix):
        text = text[len(prefix):]
    match = re.search(r"(\d+)$", text)
    return int(match.group(1)) if match else 0


def relic_level(value: Any) -> int:
    if isinstance(value, (int, float)):
        return max(0, int(value) - 2)
    text = str(value or "")
    if text in {"RelicTier_DEFAULT", "RELIC_LOCKED", "RELIC_UNLOCKED", ""}:
        return 0
    return enum_number(text, "RELIC_TIER_")


def rarity_level(value: Any) -> int:
    if isinstance(value, str) and value in RARITY_NAMES:
        return RARITY_NAMES[value]
    return enum_number(value)


def fixed_decimal(stat: dict[str, Any]) -> float | None:
    for key in ("statValueDecimal", "unscaledDecimalValue"):
        if key in stat and stat[key] is not None:
            try:
                return float(stat[key]) / 100_000_000
            except (TypeError, ValueError):
                pass
    for key in ("uiDisplayOverrideValue", "scalar"):
        if key in stat and stat[key] is not None:
            try:
                return float(stat[key])
            except (TypeError, ValueError):
                pass
    return None


def roster_stats(unit: dict[str, Any]) -> dict[str, int]:
    result: dict[str, int] = {}
    for stat in (unit.get("unitStat") or {}).get("stat") or []:
        stat_id_raw = stat.get("unitStatId")
        stat_id = int(stat_id_raw) if isinstance(stat_id_raw, (int, float)) else STAT_NAMES.get(str(stat_id_raw), 0)
        field = STAT_FIELDS.get(stat_id)
        value = fixed_decimal(stat)
        if not field or value is None:
            continue
        if field in {"potency", "tenacity"}:
            value *= 100
        result[field] = round(value)
    return result


def normalize_unit(unit: dict[str, Any], catalog_unit: dict[str, Any]) -> dict[str, Any]:
    definition_id = str(unit.get("definitionId") or "")
    base_id = definition_id.split(":", 1)[0].upper()
    record: dict[str, Any] = {
        "baseId": base_id,
        "level": int(unit.get("currentLevel") or 0),
        "stars": rarity_level(unit.get("currentRarity")),
        "gear": enum_number(unit.get("currentTier"), "TIER_"),
        "relic": relic_level((unit.get("relic") or {}).get("currentTier")),
        "skillCount": len(unit.get("skill") or []),
        "equippedModCount": len(unit.get("equippedStatMod") or []),
    }
    record.update(roster_stats(unit))
    if "Galactic Legend" in (catalog_unit.get("factions") or []):
        record["galacticLegend"] = True
    return record


def find_profile_stat(profile_stats: list[dict[str, Any]], required: tuple[str, ...], forbidden: tuple[str, ...] = ()) -> int | None:
    for stat in profile_stats:
        name = str(stat.get("nameKey") or "").upper()
        if all(token in name for token in required) and not any(token in name for token in forbidden):
            try:
                return int(stat.get("value"))
            except (TypeError, ValueError):
                return None
    return None


def normalize_player(
    player: dict[str, Any],
    requested_ally_code: str,
    character_by_base: dict[str, dict[str, Any]],
    ship_by_base: dict[str, dict[str, Any]],
    updated_at: str | None = None,
) -> dict[str, Any]:
    response_ally_code = normalize_ally_code(str(player.get("allyCode") or requested_ally_code))
    if response_ally_code != requested_ally_code:
        raise ValueError(f"Comlink returned Ally Code {response_ally_code}, expected {requested_ally_code}.")

    characters: dict[str, dict[str, Any]] = {}
    ships: dict[str, dict[str, Any]] = {}
    unmatched: list[str] = []
    for unit in player.get("rosterUnit") or []:
        base_id = str(unit.get("definitionId") or "").split(":", 1)[0].upper()
        if base_id in character_by_base:
            catalog_unit = character_by_base[base_id]
            characters[catalog_unit["id"]] = normalize_unit(unit, catalog_unit)
        elif base_id in ship_by_base:
            catalog_unit = ship_by_base[base_id]
            ships[catalog_unit["id"]] = normalize_unit(unit, catalog_unit)
        elif base_id:
            unmatched.append(base_id)

    profile_stats = player.get("profileStat") or []
    character_gp = find_profile_stat(profile_stats, ("GALACTIC", "POWER", "CHARACTER"))
    ship_gp = find_profile_stat(profile_stats, ("GALACTIC", "POWER", "SHIP"))
    galactic_power = find_profile_stat(
        profile_stats,
        ("GALACTIC", "POWER"),
        ("CHARACTER", "SHIP"),
    )
    if galactic_power is None and character_gp is not None and ship_gp is not None:
        galactic_power = character_gp + ship_gp

    return {
        "allyCode": response_ally_code,
        "name": str(player.get("name") or "Unknown player"),
        "guild": str(player.get("guildName") or "No guild"),
        "level": int(player.get("level") or 0),
        "galacticPower": galactic_power,
        "characterGP": character_gp,
        "shipGP": ship_gp,
        "characterCount": len(characters),
        "shipCount": len(ships),
        "relicCount": sum(1 for unit in characters.values() if unit.get("relic", 0) > 0),
        "galacticLegends": sum(1 for unit in characters.values() if unit.get("galacticLegend")),
        "updatedAt": updated_at or utc_now(),
        "source": "comlink-static",
        "units": dict(sorted(characters.items())),
        "ships": dict(sorted(ships.items())),
        "unmatchedBaseIds": sorted(set(unmatched)),
    }


def fetch_player(url: str, ally_code: str, timeout: float = 45) -> dict[str, Any]:
    body = json.dumps({"payload": {"allyCode": ally_code}, "enums": False}).encode("utf-8")
    request = urllib.request.Request(
        f"{url.rstrip('/')}/player",
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            document = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Comlink /player returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach Comlink at {url}: {error.reason}") from error
    if not isinstance(document, dict):
        raise RuntimeError("Comlink /player returned an unexpected non-object response.")
    return document


def load_store(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"schemaVersion": 1, "updatedAt": None, "rosters": {}}
    store = read_javascript_value(path, STORE_VARIABLE)
    if not isinstance(store, dict) or not isinstance(store.get("rosters"), dict):
        raise ValueError(f"{path} does not contain a valid static roster store.")
    return store


def write_store(path: Path, store: dict[str, Any]) -> None:
    payload = (
        "// Generated by scripts/update_roster_data.py. Static snapshots may contain public player data.\n"
        "window.ForgeData = window.ForgeData || {};\n\n"
        f"{STORE_VARIABLE} = {json.dumps(store, ensure_ascii=False, indent=2)};\n"
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as temporary:
        temporary.write(payload)
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, path)


def upsert_roster(path: Path, roster: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    store = load_store(path)
    ally_code = roster["allyCode"]
    replaced = ally_code in store["rosters"]
    store["schemaVersion"] = 1
    store["updatedAt"] = roster["updatedAt"]
    store["rosters"][ally_code] = roster
    store["rosters"] = dict(sorted(store["rosters"].items()))
    write_store(path, store)
    return store, replaced


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ally_code", help="Nine-digit SWGOH Ally Code (hyphens are accepted)")
    parser.add_argument("--url", default=os.environ.get("COMLINK_URL", "http://127.0.0.1:3000"), help="Running Comlink base URL")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--characters", type=Path, default=DEFAULT_CHARACTERS)
    parser.add_argument("--ships", type=Path, default=DEFAULT_SHIPS)
    parser.add_argument("--dry-run", action="store_true", help="Fetch and validate without changing the roster store")
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    try:
        ally_code = normalize_ally_code(arguments.ally_code)
        print("WARNING: Generated static roster snapshots include public player, guild, and progression data.", file=sys.stderr)
        print("Do not commit a snapshot unless the player expects it to be published with the site.", file=sys.stderr)
        character_by_base, ship_by_base = load_catalog(arguments.characters, arguments.ships)
        player = fetch_player(arguments.url, ally_code)
        roster = normalize_player(player, ally_code, character_by_base, ship_by_base)
        if arguments.dry_run:
            print(
                f"Validated {roster['name']} ({ally_code}): {roster['characterCount']} characters, "
                f"{roster['shipCount']} ships; no files changed."
            )
            return 0
        _, replaced = upsert_roster(arguments.output, roster)
        verb = "Updated" if replaced else "Added"
        print(
            f"{verb} {roster['name']} ({ally_code}) in {arguments.output} with "
            f"{roster['characterCount']} characters and {roster['shipCount']} ships."
        )
        if roster["unmatchedBaseIds"]:
            print(
                f"Warning: {len(roster['unmatchedBaseIds'])} roster units were not found in the current catalog: "
                + ", ".join(roster["unmatchedBaseIds"][:12]),
                file=sys.stderr,
            )
        return 0
    except (ValueError, RuntimeError, OSError, json.JSONDecodeError) as error:
        print(f"Roster update failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
