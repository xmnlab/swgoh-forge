#!/usr/bin/env python3
"""Fetch one public SWGOH player profile and upsert its static roster snapshot."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
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
SCHEMA_VERSION = 2
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


def bool_value(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().casefold() in {"1", "true", "yes"}
    return bool(value)


def skill_progression(
    unit: dict[str, Any],
    skill_by_id: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], int | None, int | None, bool]:
    """Expand roster skill tiers using the matching live game-data definitions.

    Comlink's player-data documentation specifies that a roster skill tier needs
    +2 for its displayed level, while flagged game-data tier indexes are compared
    as index + 1 against the unmodified roster tier.
    """
    abilities: list[dict[str, Any]] = []
    zeta_count = 0
    omicron_count = 0
    complete = bool(skill_by_id)
    for roster_skill in unit.get("skill") or []:
        skill_id = str(roster_skill.get("id") or roster_skill.get("skillId") or "")
        if not skill_id:
            continue
        raw_tier = enum_number(roster_skill.get("tier"))
        definition = skill_by_id.get(skill_id)
        record: dict[str, Any] = {"id": skill_id, "level": raw_tier + 2}
        if not definition:
            complete = False
            abilities.append(record)
            continue

        tiers = definition.get("tier") or []
        record["maxLevel"] = len(tiers) + 1
        zeta_tier = next(
            (index + 1 for index, tier in enumerate(tiers) if bool_value(tier.get("isZetaTier"))),
            None,
        )
        omicron_tier = next(
            (index + 1 for index, tier in enumerate(tiers) if bool_value(tier.get("isOmicronTier"))),
            None,
        )
        if zeta_tier is not None:
            record["zetaAvailable"] = True
            if raw_tier >= zeta_tier:
                record["zeta"] = True
                zeta_count += 1
        if omicron_tier is not None:
            record["omicronAvailable"] = True
            omicron_mode = definition.get("omicronMode")
            if omicron_mode not in (None, "", 0, "0", "OmicronMode_DEFAULT"):
                record["omicronMode"] = omicron_mode
            if raw_tier >= omicron_tier:
                record["omicron"] = True
                omicron_count += 1
        abilities.append(record)
    return abilities, (zeta_count if complete else None), (omicron_count if complete else None), complete


def normalize_unit(
    unit: dict[str, Any],
    catalog_unit: dict[str, Any],
    skill_by_id: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    definition_id = str(unit.get("definitionId") or "")
    base_id = definition_id.split(":", 1)[0].upper()
    raw_skills = unit.get("skill") or []
    abilities, zeta_count, omicron_count, ability_progression_complete = skill_progression(
        unit,
        skill_by_id or {},
    )
    record: dict[str, Any] = {
        "baseId": base_id,
        "level": int(unit.get("currentLevel") or 0),
        "stars": rarity_level(unit.get("currentRarity")),
        "gear": enum_number(unit.get("currentTier"), "TIER_"),
        "relic": relic_level((unit.get("relic") or {}).get("currentTier")),
        "skillCount": len(raw_skills),
        "abilities": abilities,
        "zetaCount": zeta_count,
        "omicronCount": omicron_count,
        "abilityProgressionComplete": ability_progression_complete,
        "purchasedAbilityCount": len(unit.get("purchasedAbilityId") or []),
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
    skill_definitions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    response_ally_code = normalize_ally_code(str(player.get("allyCode") or requested_ally_code))
    if response_ally_code != requested_ally_code:
        raise ValueError(f"Comlink returned Ally Code {response_ally_code}, expected {requested_ally_code}.")

    characters: dict[str, dict[str, Any]] = {}
    ships: dict[str, dict[str, Any]] = {}
    unmatched: list[str] = []
    skill_by_id = {
        str(skill["id"]): skill
        for skill in (skill_definitions or [])
        if isinstance(skill, dict) and skill.get("id")
    }
    for unit in player.get("rosterUnit") or []:
        base_id = str(unit.get("definitionId") or "").split(":", 1)[0].upper()
        if base_id in character_by_base:
            catalog_unit = character_by_base[base_id]
            characters[catalog_unit["id"]] = normalize_unit(unit, catalog_unit, skill_by_id)
        elif base_id in ship_by_base:
            catalog_unit = ship_by_base[base_id]
            ships[catalog_unit["id"]] = normalize_unit(unit, catalog_unit, skill_by_id)
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


def request_json(
    url: str,
    path: str,
    payload: dict[str, Any] | None,
    label: str,
    timeout: float = 90,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"{url.rstrip('/')}{path}",
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST" if body is not None else "GET",
    )
    started = time.monotonic()
    print(f"[roster] -> {label}: {request.method} {path}", file=sys.stderr)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            document = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Comlink {path} returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach Comlink at {url}: {error.reason}") from error
    if not isinstance(document, dict):
        raise RuntimeError(f"Comlink {path} returned an unexpected non-object response.")
    elapsed = round((time.monotonic() - started) * 1000)
    print(f"[roster] <- {label}: HTTP success in {elapsed} ms", file=sys.stderr)
    return document


def fetch_player(url: str, ally_code: str, timeout: float = 45) -> dict[str, Any]:
    return request_json(
        url,
        "/player",
        {"payload": {"allyCode": ally_code}, "enums": False},
        "read public player roster",
        timeout,
    )


def normalized_enum_name(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value).casefold())


def enum_integer(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str) and re.fullmatch(r"-?\d+", value.strip()):
        return int(value)
    return None


def game_data_item_value(document: Any, expected_name: str) -> int:
    sections: list[Any] = []

    def locate(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if "gamedataitems" in normalized_enum_name(key):
                    sections.append(child)
                if normalized_enum_name(key) in {"name", "enumname", "type", "typename"}:
                    if isinstance(child, str) and "gamedataitems" in normalized_enum_name(child):
                        sections.append(value)
                locate(child)
        elif isinstance(value, list):
            for child in value:
                locate(child)

    locate(document)
    wanted = normalized_enum_name(expected_name)
    name_fields = {"name", "key", "label", "enumkey", "symbol"}
    number_fields = {"value", "number", "id", "enumvalue"}

    def collect(value: Any) -> int | None:
        if isinstance(value, dict):
            for key, child in value.items():
                if normalized_enum_name(key) == wanted:
                    number = enum_integer(child)
                    if number is not None:
                        return number
                if normalized_enum_name(str(child)) == wanted:
                    key_number = enum_integer(key)
                    if key_number is not None:
                        return key_number
            names = [
                child
                for key, child in value.items()
                if normalized_enum_name(key) in name_fields and isinstance(child, str)
            ]
            numbers = [
                enum_integer(child)
                for key, child in value.items()
                if normalized_enum_name(key) in number_fields and enum_integer(child) is not None
            ]
            if any(normalized_enum_name(name) == wanted for name in names) and numbers:
                return numbers[0]
            for child in value.values():
                found = collect(child)
                if found is not None:
                    return found
        elif isinstance(value, list):
            for child in value:
                found = collect(child)
                if found is not None:
                    return found
        return None

    for section in sections:
        result = collect(section)
        if result is not None:
            return result
    raise RuntimeError(f"Comlink /enums did not expose {expected_name}.")


def find_collection(document: Any, *names: str) -> list[dict[str, Any]]:
    wanted = {name.casefold() for name in names}
    if isinstance(document, dict):
        for key, value in document.items():
            if str(key).casefold() in wanted and isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
        for value in document.values():
            found = find_collection(value, *names)
            if found:
                return found
    return []


def fetch_skill_definitions(url: str) -> list[dict[str, Any]]:
    enums = request_json(url, "/enums", None, "read GameDataItems enum")
    skill_items = game_data_item_value(enums, "SkillDefinitions")
    metadata = request_json(
        url,
        "/metadata",
        {"payload": {"clientSpecs": {"platform": "Android"}}, "enums": False},
        "read current game-data version",
    )
    version = str(metadata.get("latestGamedataVersion") or metadata.get("latestGameDataVersion") or "")
    if not version:
        raise RuntimeError("Comlink /metadata did not include latestGamedataVersion.")
    response = request_json(
        url,
        "/data",
        {
            "payload": {
                "version": version,
                "devicePlatform": "Android",
                "includePveUnits": False,
                "items": str(skill_items),
            },
            "enums": False,
        },
        f"read SkillDefinitions ({skill_items})",
    )
    skills = find_collection(response, "skill", "skills")
    if not skills:
        raise RuntimeError("Comlink /data returned no skill definitions.")
    print(f"[roster] linked {len(skills)} skill definitions", file=sys.stderr)
    return skills


def load_store(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"schemaVersion": SCHEMA_VERSION, "updatedAt": None, "rosters": {}}
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
    store["schemaVersion"] = SCHEMA_VERSION
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
        skill_definitions = fetch_skill_definitions(arguments.url)
        roster = normalize_player(
            player,
            ally_code,
            character_by_base,
            ship_by_base,
            skill_definitions=skill_definitions,
        )
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
