#!/usr/bin/env python3
"""Build SWGOH Forge's static unit catalog from a local Comlink service."""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import importlib.metadata
import json
import os
import platform
import re
import sys
import tempfile
import time
import unicodedata
from collections.abc import Iterable, Mapping
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = REPOSITORY_ROOT / "data"
DEFAULT_CACHE_DIR = REPOSITORY_ROOT / ".cache" / "comlink"
INTERNAL_CATEGORY_PREFIXES = (
    "alignment_",
    "role_",
    "selftag_",
    "unitclass_",
    "unit_class_",
    "unittag_",
    "unit_tag_",
    "specialability_",
    "raid_",
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch unit data from a local SWGOH Comlink service and build the static catalog."
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("COMLINK_URL", "http://localhost:3000"),
        help="Comlink base URL (default: COMLINK_URL or http://localhost:3000)",
    )
    parser.add_argument(
        "--locale",
        default=os.environ.get("COMLINK_LOCALE", "ENG_US"),
        help="Localization locale (default: ENG_US)",
    )
    parser.add_argument(
        "--device-platform",
        default=os.environ.get("COMLINK_DEVICE_PLATFORM", "Android"),
        help="Game-data platform used for metadata and data requests (default: Android)",
    )
    parser.add_argument(
        "--access-key",
        default=os.environ.get("COMLINK_ACCESS_KEY"),
        help="Optional Comlink access key (or set COMLINK_ACCESS_KEY)",
    )
    parser.add_argument(
        "--secret-key",
        default=os.environ.get("COMLINK_SECRET_KEY"),
        help="Optional Comlink secret key (or set COMLINK_SECRET_KEY)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Generated data directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=DEFAULT_CACHE_DIR,
        help=f"Raw response cache (default: {DEFAULT_CACHE_DIR})",
    )
    parser.add_argument(
        "--from-cache",
        action="store_true",
        help="Rebuild from an existing raw cache without contacting Comlink",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Do not save raw Comlink responses",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and validate data without replacing generated files",
    )
    parser.add_argument(
        "--allow-missing-seed-units",
        action="store_true",
        help="Allow existing catalog IDs to disappear (normally treated as a safety error)",
    )
    return parser.parse_args(argv)


def first_value(record: Mapping[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        value = record.get(key)
        if value is not None:
            return value
    return default


def as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes"}
    return bool(value)


def as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def find_collection(document: Any, *names: str) -> list[Any]:
    wanted = {name.casefold() for name in names}
    if isinstance(document, Mapping):
        for key, value in document.items():
            if str(key).casefold() in wanted and isinstance(value, list):
                return value
        for value in document.values():
            found = find_collection(value, *names)
            if found:
                return found
    return []


def merge_catalog_responses(category_data: Any, unit_data: Any) -> dict[str, list[Any]]:
    """Extract only the two requested collections from separate Comlink responses."""
    return {
        "category": find_collection(category_data, "category", "categories"),
        "units": find_collection(unit_data, "units", "unit"),
    }


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


def game_data_item_values(document: Any) -> dict[str, int]:
    """Read GameDataItems from the live `/enums` response across known JSON shapes."""
    sections: list[Any] = []

    def locate(value: Any) -> None:
        if isinstance(value, Mapping):
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
    if not sections:
        raise ValueError("The /enums response does not contain a GameDataItems enum.")

    pairs: dict[str, int] = {}
    name_fields = {"name", "key", "label", "enumkey", "symbol"}
    number_fields = {"value", "number", "id", "enumvalue"}

    def collect(value: Any) -> None:
        if isinstance(value, Mapping):
            scalar_names: list[str] = []
            scalar_numbers: list[int] = []
            for key, child in value.items():
                number = enum_integer(child)
                if number is not None and normalized_enum_name(key) not in number_fields:
                    pairs.setdefault(str(key), number)
                key_number = enum_integer(key)
                if key_number is not None and isinstance(child, str):
                    pairs.setdefault(child, key_number)
                normalized_key = normalized_enum_name(key)
                if normalized_key in name_fields and isinstance(child, str) and enum_integer(child) is None:
                    scalar_names.append(child)
                if normalized_key in number_fields and number is not None:
                    scalar_numbers.append(number)
            if scalar_names and scalar_numbers:
                for name in scalar_names:
                    pairs.setdefault(name, scalar_numbers[0])
            for child in value.values():
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)

    for section in sections:
        collect(section)
    if not pairs:
        raise ValueError("The GameDataItems enum was found, but no named numeric values could be read.")
    return pairs


def select_game_data_items(enums: Any) -> dict[str, int]:
    available = game_data_item_values(enums)
    normalized = {normalized_enum_name(name): value for name, value in available.items()}

    def choose(*names: str) -> int | None:
        for expected in names:
            if expected in normalized:
                return normalized[expected]
        for name, value in normalized.items():
            if any(name.endswith(expected) for expected in names):
                return value
        return None

    selected = {
        "categories": choose("categorydefinitions", "categorydefinition", "categories"),
        "equipment": choose("equipmentdefinitions", "equipmentdefinition", "equipment"),
        "units": choose("unitdefinitions", "unitdefinition", "units"),
        "segment3": choose("segment3", "segmentthree"),
    }
    if selected["units"] is None and selected["segment3"] is None:
        choices = ", ".join(f"{name}={value}" for name, value in sorted(available.items())[:30])
        raise ValueError(
            "The live GameDataItems enum has neither UnitDefinitions nor Segment3. "
            f"Available values: {choices}"
        )
    return {key: value for key, value in selected.items() if value is not None}


def collect_localization(document: Any) -> dict[str, str]:
    """Accept direct maps, Comlink wrappers, entry lists, and JSON-encoded bundles."""
    translations: dict[str, str] = {}
    aliases: dict[str, str] = {}
    seen_strings: set[str] = set()

    def parse_text_bundle(filename: str, content: str) -> None:
        target = aliases if "key_mapping" in filename.casefold() else translations
        for raw_line in content.splitlines():
            line = raw_line.removeprefix("\ufeff")
            if not line or line.lstrip().startswith("#") or "|" not in line:
                continue
            key, value = line.split("|", 1)
            key = key.strip()
            if key:
                target[key] = value.replace("\\n", "\n")

    def visit(value: Any) -> None:
        if isinstance(value, Mapping):
            key = first_value(value, "key", "id", "localizationKey")
            text = first_value(value, "value", "text", "localizedText")
            if isinstance(key, str) and isinstance(text, str):
                translations[key] = text

            for child_key, child in value.items():
                if isinstance(child_key, str) and isinstance(child, str):
                    stripped = child.lstrip()
                    if child_key.casefold().endswith(".txt"):
                        parse_text_bundle(child_key, child)
                    elif not stripped.startswith(("{", "[")):
                        translations.setdefault(child_key, child)
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
        elif isinstance(value, str):
            stripped = value.lstrip()
            if stripped.startswith(("{", "[")) and value not in seen_strings:
                seen_strings.add(value)
                try:
                    visit(json.loads(value))
                except json.JSONDecodeError:
                    pass

    visit(document)

    def resolve_alias(key: str, seen: set[str] | None = None) -> str:
        seen = set() if seen is None else seen
        if key in seen:
            return aliases[key]
        seen.add(key)
        target = aliases[key]
        if target in translations:
            return translations[target]
        if target in aliases:
            return resolve_alias(target, seen)
        return target

    for alias in aliases:
        translations.setdefault(alias, resolve_alias(alias))
    return translations


def humanize(value: str) -> str:
    words = re.sub(r"[_\-]+", " ", value).strip().split()
    return " ".join(word if any(char.isdigit() for char in word) else word.capitalize() for word in words)


def translate(key_or_text: Any, translations: Mapping[str, str], fallback: str = "") -> str:
    if not isinstance(key_or_text, str) or not key_or_text:
        return fallback
    translated = translations.get(key_or_text)
    if translated is None:
        translated = translations.get(key_or_text.upper())
    if translated:
        return translated.strip()
    if re.search(r"(?:^|_)NAME$|^UNIT_.*_NAME$|^CATEGORY_", key_or_text, re.IGNORECASE):
        return fallback
    return key_or_text.strip()


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", normalized.casefold()).strip("-") or "unit"


def match_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").casefold())


def color_for(base_id: str) -> str:
    digest = hashlib.sha256(base_id.encode("utf-8")).digest()
    hue = int.from_bytes(digest[:2], "big") / 65535
    saturation = 0.28 + digest[2] / 255 * 0.16
    lightness = 0.42 + digest[3] / 255 * 0.12
    red, green, blue = colorsys.hls_to_rgb(hue, lightness, saturation)
    return f"#{round(red * 255):02x}{round(green * 255):02x}{round(blue * 255):02x}"


def extract_js_string(record: str, key: str) -> str | None:
    pattern = rf'(?:^|[,{{]\s*)"?{re.escape(key)}"?\s*:\s*("(?:\\.|[^"\\])*")'
    match = re.search(pattern, record, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


def read_previous_catalog(output_dir: Path) -> tuple[dict[str, dict[str, str]], set[str]]:
    by_name: dict[str, dict[str, str]] = {}
    ids: set[str] = set()
    for filename in ("characters.js", "ships.js"):
        path = output_dir / filename
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for match in re.finditer(r"\{[^{}]*\}", text, re.DOTALL):
            record = match.group(0)
            unit_id = extract_js_string(record, "id")
            name = extract_js_string(record, "name")
            if not unit_id or not name:
                continue
            previous = {"id": unit_id, "name": name}
            for key in ("shortName", "color", "baseId"):
                value = extract_js_string(record, key)
                if value:
                    previous[key] = value
            name_key = match_key(name)
            existing = by_name.get(name_key)
            canonical_id = slugify(name)
            candidate_rank = (unit_id != canonical_id, len(unit_id), unit_id)
            existing_rank = (
                (existing or {}).get("id") != canonical_id,
                len((existing or {}).get("id", "")),
                (existing or {}).get("id", ""),
            )
            if existing is None or candidate_rank < existing_rank:
                by_name[name_key] = previous
            if previous.get("baseId"):
                by_name[f"base:{previous['baseId'].casefold()}"] = previous
            ids.add(unit_id)
    return by_name, ids


def category_index(categories: Iterable[Any], translations: Mapping[str, str]) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for raw in categories:
        if not isinstance(raw, Mapping):
            continue
        category_id = str(first_value(raw, "id", "categoryId", "baseId", default=""))
        if not category_id:
            continue
        label_key = first_value(raw, "uiFilterNameKey", "descKey", "nameKey", "name")
        label = translate(label_key, translations, fallback=humanize(category_id))
        indexed[category_id] = {"label": label, "raw": raw}
    return indexed


def category_ids(unit: Mapping[str, Any]) -> list[str]:
    values = first_value(unit, "categoryId", "categoryIdList", "categoryIds", "categories", default=[])
    result: list[str] = []
    for value in as_list(values):
        if isinstance(value, Mapping):
            value = first_value(value, "id", "categoryId", "baseId")
        if value is not None:
            result.append(str(value))
    return result


def unit_alignment(unit: Mapping[str, Any], ids: Iterable[str]) -> str:
    lowered = " ".join(ids).casefold()
    if "alignment_light" in lowered:
        return "Light Side"
    if "alignment_dark" in lowered:
        return "Dark Side"
    raw = str(first_value(unit, "forceAlignment", "alignment", default="")).casefold()
    if "light" in raw:
        return "Light Side"
    if "dark" in raw:
        return "Dark Side"
    return "Neutral"


def unit_role(unit: Mapping[str, Any], ids: Iterable[str]) -> str:
    lowered = " ".join(ids).casefold()
    for fragment, label in (
        ("attacker", "Attacker"),
        ("tank", "Tank"),
        ("healer", "Healer"),
        ("support", "Support"),
    ):
        if fragment in lowered:
            return label
    raw = str(first_value(unit, "role", "unitRole", "unitClass", default="")).casefold()
    for fragment, label in (
        ("attacker", "Attacker"),
        ("tank", "Tank"),
        ("healer", "Healer"),
        ("support", "Support"),
    ):
        if fragment in raw:
            return label
    return "Support"


def unit_factions(ids: Iterable[str], categories: Mapping[str, dict[str, Any]]) -> list[str]:
    factions: list[str] = []
    for category_id in ids:
        lowered = category_id.casefold()
        if lowered.startswith(INTERNAL_CATEGORY_PREFIXES):
            continue
        category = categories.get(category_id)
        if not category:
            if lowered.startswith("affiliation_"):
                label = humanize(category_id[len("affiliation_") :])
                if label and label not in factions:
                    factions.append(label)
            continue
        raw = category["raw"]
        if "visible" in raw and not as_bool(raw["visible"]):
            continue
        label = str(category["label"]).strip()
        if label and label not in factions:
            factions.append(label)
    return sorted(factions, key=str.casefold)


def has_leader_ability(unit: Mapping[str, Any], ids: Iterable[str]) -> bool:
    if any("role_leader" in category_id.casefold() for category_id in ids):
        return True
    for key in ("leaderAbilityRef", "leaderAbilityId"):
        if unit.get(key):
            return True
    references = first_value(
        unit, "skillReference", "skillReferenceList", "skillReferences", "skills", default=[]
    )
    for reference in as_list(references):
        if isinstance(reference, Mapping):
            reference = first_value(reference, "skillId", "id", "skill", default="")
        if "leaderskill" in str(reference).casefold() or "leader_skill" in str(reference).casefold():
            return True
    return False


def combat_kind(unit: Mapping[str, Any]) -> str | None:
    value = first_value(unit, "combatType", "combat_type", "unitType")
    if isinstance(value, (int, float)):
        return "character" if int(value) == 1 else "ship" if int(value) == 2 else None
    lowered = str(value).casefold()
    if "character" in lowered or lowered in {"1", "unit"}:
        return "character"
    if "ship" in lowered or lowered == "2":
        return "ship"
    return None


def is_capital_ship(unit: Mapping[str, Any], ids: Iterable[str], base_id: str) -> bool:
    if as_bool(first_value(unit, "isCapitalShip", "capitalShip", default=False)):
        return True
    return base_id.casefold().startswith("capital") or any("capitalship" in item.casefold() for item in ids)


def crew_base_ids(unit: Mapping[str, Any]) -> list[str]:
    result: list[str] = []
    crew = first_value(unit, "crew", "crewList", "crewUnitList", default=[])
    for member in as_list(crew):
        if isinstance(member, Mapping):
            member = first_value(member, "unitId", "unitBaseId", "baseId", "id")
        if member and str(member) not in result:
            result.append(str(member))
    return result


def select_unit_definitions(units: Iterable[Any]) -> list[Mapping[str, Any]]:
    selected: dict[str, Mapping[str, Any]] = {}
    for raw in units:
        if not isinstance(raw, Mapping):
            continue
        base_id = str(first_value(raw, "baseId", "base_id", "id", default=""))
        if not base_id or combat_kind(raw) is None:
            continue
        if "obtainable" in raw and not as_bool(raw["obtainable"]):
            continue
        # Event, journey, raid, and inherited encounter clones are marked obtainable
        # but use a far-future sentinel timestamp instead of the roster value 0.
        if as_int(first_value(raw, "obtainableTime", default=0)) != 0:
            continue
        current = selected.get(base_id)
        rarity = as_int(first_value(raw, "rarity", "currentRarity", default=0))
        current_rarity = as_int(first_value(current or {}, "rarity", "currentRarity", default=-1))
        if current is None or rarity > current_rarity:
            selected[base_id] = raw
    return list(selected.values())


def unique_id(candidate: str, base_id: str, used: set[str]) -> str:
    if candidate not in used:
        used.add(candidate)
        return candidate
    suffixed = f"{candidate}-{slugify(base_id)}"
    counter = 2
    while suffixed in used:
        suffixed = f"{candidate}-{counter}"
        counter += 1
    used.add(suffixed)
    return suffixed


def normalize_catalog(
    game_data: Any,
    localization: Any,
    previous_by_name: Mapping[str, Mapping[str, str]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    translations = collect_localization(localization)
    categories = category_index(find_collection(game_data, "category", "categories"), translations)
    units = select_unit_definitions(find_collection(game_data, "units", "unit"))
    previous_by_name = previous_by_name or {}
    used_ids: set[str] = set()
    pending: list[tuple[dict[str, Any], Mapping[str, Any], str]] = []

    for raw in units:
        base_id = str(first_value(raw, "baseId", "base_id", "id"))
        name_key = first_value(raw, "nameKey", "name", "displayNameKey")
        name = translate(name_key, translations, fallback=humanize(base_id))
        previous = previous_by_name.get(match_key(name)) or previous_by_name.get(
            f"base:{base_id.casefold()}", {}
        )
        candidate = previous.get("id") or slugify(name)
        unit_id = unique_id(candidate, base_id, used_ids)
        ids = category_ids(raw)
        kind = combat_kind(raw)
        capital = kind == "ship" and is_capital_ship(raw, ids, base_id)
        folder = "capital-ships" if capital else "ships" if kind == "ship" else "characters"
        record: dict[str, Any] = {
            "id": unit_id,
            "baseId": base_id,
            "name": name,
        }
        if previous.get("shortName"):
            record["shortName"] = previous["shortName"]
        record.update(
            {
                "image": f"assets/{folder}/{unit_id}.png",
                "factions": unit_factions(ids, categories),
            }
        )
        if kind == "character":
            record["alignment"] = unit_alignment(raw, ids)
            record["role"] = unit_role(raw, ids)
            record["canLead"] = has_leader_ability(raw, ids)
        elif not capital:
            record["role"] = unit_role(raw, ids)
        record["color"] = previous.get("color") or color_for(base_id)
        record["source"] = "comlink"

        aliases = [slugify(base_id)]
        previous_id = previous.get("id")
        if previous_id and previous_id != unit_id:
            aliases.append(previous_id)
        aliases = [alias for alias in dict.fromkeys(aliases) if alias != unit_id]
        if aliases:
            record["aliases"] = aliases
        pending.append((record, raw, "capital" if capital else kind or ""))

    characters = [record for record, _, kind in pending if kind == "character"]
    character_by_base = {record["baseId"]: record for record in characters}
    ships: list[dict[str, Any]] = []
    capitals: list[dict[str, Any]] = []

    for record, raw, kind in pending:
        if kind not in {"ship", "capital"}:
            continue
        crew = [character_by_base[base_id] for base_id in crew_base_ids(raw) if base_id in character_by_base]
        if crew:
            crew_ids = [member["id"] for member in crew]
            crew_names = [member["name"] for member in crew]
            if kind == "capital":
                record["commanderId"] = crew_ids[0]
                record["commanderName"] = ", ".join(crew_names)
                record["commanderIds"] = crew_ids
            else:
                record["pilotId"] = crew_ids[0]
                record["pilotName"] = ", ".join(crew_names)
                record["pilotIds"] = crew_ids
        elif kind == "ship":
            record["pilotName"] = "Crewless"
        (capitals if kind == "capital" else ships).append(record)

    for collection in (characters, ships, capitals):
        collection.sort(key=lambda item: (item["name"].casefold(), item["baseId"]))
    return characters, ships, capitals


def metadata_value(metadata: Mapping[str, Any], *keys: str) -> str:
    value = first_value(metadata, *keys, default="")
    return str(value) if value is not None else ""


def validate_metadata_platform(metadata: Mapping[str, Any], requested_platform: str) -> None:
    asset_subpath = metadata_value(metadata, "assetSubpath")
    if not asset_subpath:
        return
    requested = requested_platform.casefold()
    expected_fragments = {
        "android": ("android",),
        "ios": ("ios", "iphone"),
        "windows": ("windows",),
        "pc": ("windows", "pc"),
    }.get(requested, (requested,))
    if not any(fragment in asset_subpath.casefold() for fragment in expected_fragments):
        raise ValueError(
            f"Comlink returned metadata for {asset_subpath!r}, not requested platform "
            f"{requested_platform!r}; refusing to combine a game version with the wrong platform."
        )


def validate_catalog(
    characters: list[dict[str, Any]],
    ships: list[dict[str, Any]],
    capitals: list[dict[str, Any]],
    previous_ids: set[str],
    allow_missing: bool,
) -> None:
    counts = (len(characters), len(ships), len(capitals))
    if counts[0] < 100 or counts[1] < 20 or counts[2] < 5:
        raise ValueError(
            "The normalized response looks incomplete "
            f"({counts[0]} characters, {counts[1]} ships, {counts[2]} capital ships); no files were replaced."
        )
    all_ids = {item["id"] for item in characters + ships + capitals}
    missing = sorted(previous_ids - all_ids)
    if missing and not allow_missing:
        preview = ", ".join(missing[:12])
        suffix = "…" if len(missing) > 12 else ""
        raise ValueError(
            f"The new catalog is missing {len(missing)} existing IDs ({preview}{suffix}). "
            "This may break demo references; inspect the data or rerun with --allow-missing-seed-units."
        )


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def atomic_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(value)
        temporary = Path(handle.name)
    temporary.replace(path)


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def exception_details(error: BaseException) -> list[dict[str, str]]:
    details: list[dict[str, str]] = []
    seen: set[int] = set()
    current: BaseException | None = error
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        details.append({"type": type(current).__name__, "message": str(current)})
        current = current.__cause__ or current.__context__
    return details


def response_summary(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        keys = sorted(str(key) for key in value)
        collections = {
            str(key): len(child)
            for key, child in value.items()
            if isinstance(child, list) and child
        }
        return {
            "type": "object",
            "keyCount": len(keys),
            "keys": keys[:80],
            "nonEmptyCollectionCounts": collections,
        }
    if isinstance(value, list):
        return {"type": "array", "count": len(value)}
    if isinstance(value, str):
        return {"type": "string", "characters": len(value)}
    return {"type": type(value).__name__}


class DiagnosticRecorder:
    def __init__(self, path: Path | None, context: Mapping[str, Any]) -> None:
        self.path = path
        self.document: dict[str, Any] = {
            "schemaVersion": 1,
            "status": "running",
            "startedAt": utc_timestamp(),
            "context": dict(context),
            "facts": {},
            "requests": [],
            "notes": [],
        }
        self._write_warning_reported = False
        self.flush()

    def flush(self) -> None:
        if self.path is None:
            return
        try:
            atomic_json(self.path, self.document)
        except OSError as error:
            if not self._write_warning_reported:
                print(f"Warning: could not write diagnostic trace to {self.path}: {error}", file=sys.stderr)
                self._write_warning_reported = True

    def fact(self, name: str, value: Any) -> None:
        self.document["facts"][name] = value
        self.flush()

    def note(self, message: str, **details: Any) -> None:
        self.document["notes"].append(
            {"at": utc_timestamp(), "message": message, **details}
        )
        self.flush()

    def finish(self, status: str, error: BaseException | None = None) -> None:
        self.document["status"] = status
        self.document["finishedAt"] = utc_timestamp()
        if error is not None:
            self.document["failure"] = {"chain": exception_details(error)}
        self.flush()


def traced_request(
    recorder: DiagnosticRecorder,
    operation: str,
    method: str,
    path: str,
    body: Mapping[str, Any] | None,
    action: Callable[[], Any],
) -> Any:
    entry: dict[str, Any] = {
        "operation": operation,
        "startedAt": utc_timestamp(),
        "request": {"method": method, "path": path},
        "status": "running",
    }
    if body is not None:
        entry["request"]["body"] = dict(body)
    recorder.document["requests"].append(entry)
    recorder.flush()

    serialized_body = "" if body is None else f" body={json.dumps(body, separators=(',', ':'))}"
    print(f"[comlink] -> {operation}: {method} {path}{serialized_body}")
    started = time.monotonic()
    try:
        result = action()
    except Exception as error:
        elapsed = round((time.monotonic() - started) * 1000)
        entry.update(
            {
                "status": "failed",
                "finishedAt": utc_timestamp(),
                "elapsedMs": elapsed,
                "error": {"chain": exception_details(error)},
            }
        )
        recorder.flush()
        print(
            f"[comlink] <- {operation}: failed after {elapsed} ms: {type(error).__name__}: {error}",
            file=sys.stderr,
        )
        raise

    elapsed = round((time.monotonic() - started) * 1000)
    summary = response_summary(result)
    entry.update(
        {
            "status": "succeeded",
            "finishedAt": utc_timestamp(),
            "elapsedMs": elapsed,
            "response": summary,
        }
    )
    recorder.flush()
    counts = summary.get("nonEmptyCollectionCounts", {})
    count_text = f"; non-empty collections={counts}" if counts else ""
    print(f"[comlink] <- {operation}: HTTP success in {elapsed} ms{count_text}")
    return result


def load_cache(cache_dir: Path) -> tuple[dict[str, Any], Any, Any]:
    paths = {
        "metadata": cache_dir / "metadata.json",
        "game data": cache_dir / "game-data.json",
        "localization": cache_dir / "localization.json",
    }
    missing = [str(path) for path in paths.values() if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing cached response(s): " + ", ".join(missing))
    metadata = json.loads(paths["metadata"].read_text(encoding="utf-8"))
    game_data = json.loads(paths["game data"].read_text(encoding="utf-8"))
    localization = json.loads(paths["localization"].read_text(encoding="utf-8"))
    return metadata, game_data, localization


def fetch_comlink(args: argparse.Namespace) -> tuple[dict[str, Any], Any, Any]:
    cache_dir = getattr(args, "cache_dir", None)
    save_cache = not getattr(args, "no_cache", False) and cache_dir is not None
    diagnostic_path = cache_dir / "diagnostic.json" if save_cache else None
    try:
        client_version = importlib.metadata.version("swgoh_comlink")
    except importlib.metadata.PackageNotFoundError:
        client_version = "not installed"
    recorder = DiagnosticRecorder(
        diagnostic_path,
        {
            "comlinkUrl": args.url,
            "comlinkServerVersionRequested": os.environ.get("COMLINK_SERVER_VERSION", "unknown"),
            "comlinkAppName": os.environ.get("COMLINK_APP_NAME", "unknown"),
            "comlinkPythonClientVersion": client_version,
            "devicePlatform": getattr(args, "device_platform", "Android"),
            "locale": args.locale,
            "python": platform.python_version(),
            "hostPlatform": platform.platform(),
        },
    )

    try:
        from swgoh_comlink import SwgohComlink
    except ImportError as error:
        recorder.finish("failed", error)
        raise RuntimeError(
            "swgoh_comlink is not installed. Run ./scripts/update-data.sh so the pinned dependency is installed."
        ) from error

    client_kwargs: dict[str, Any] = {"url": args.url}
    if args.access_key:
        client_kwargs["access_key"] = args.access_key
    if args.secret_key:
        client_kwargs["secret_key"] = args.secret_key

    try:
        with SwgohComlink(**client_kwargs) as client:
            device_platform = getattr(args, "device_platform", "Android")
            enums = traced_request(
                recorder,
                "read live enum values",
                "GET",
                "/enums",
                None,
                client.get_enums,
            )
            if save_cache:
                atomic_json(cache_dir / "enums.json", enums)
            data_items = select_game_data_items(enums)
            selected_values = ", ".join(f"{name}={value}" for name, value in data_items.items())
            print(f"Resolved live Comlink GameDataItems: {selected_values}")
            recorder.fact("gameDataItems", data_items)

            metadata_body = {
                "payload": {"clientSpecs": {"platform": device_platform}},
                "enums": False,
            }
            metadata = traced_request(
                recorder,
                "read current game versions",
                "POST",
                "/metadata",
                metadata_body,
                lambda: client.get_game_metadata(client_specs={"platform": device_platform}),
            )
            if save_cache:
                atomic_json(cache_dir / "metadata.json", metadata)
            validate_metadata_platform(metadata, device_platform)
            game_version = metadata_value(metadata, "latestGamedataVersion", "latestGameDataVersion")
            localization_version = metadata_value(
                metadata, "latestLocalizationBundleVersion", "latestLocalizationVersion"
            )
            if not game_version or not localization_version:
                raise ValueError("Comlink metadata did not include current game-data and localization versions.")
            recorder.fact(
                "metadata",
                {
                    "gameDataVersion": game_version,
                    "localizationVersion": localization_version,
                    "assetSubpath": metadata_value(metadata, "assetSubpath"),
                    "gameDataRevision": metadata_value(metadata, "gamedataRevision"),
                    "serverVersion": metadata_value(metadata, "serverVersion"),
                },
            )

            localization_body = {
                "payload": {"id": f"{localization_version}:{args.locale.upper()}"},
                "unzip": True,
                "enums": False,
            }
            localization = traced_request(
                recorder,
                "read localization bundle",
                "POST",
                "/localization",
                localization_body,
                lambda: client.get_localization(
                    localization_id=localization_version,
                    locale=args.locale,
                    unzip=True,
                    enums=False,
                ),
            )
            if save_cache:
                atomic_json(cache_dir / "localization.json", localization)

            def request_game_data(item_value: int, required_collection: str) -> Any:
                result = client.get_game_data(
                    version=game_version,
                    include_pve_units=False,
                    items=item_value,
                    enums=False,
                    device_platform=device_platform,
                )
                if not find_collection(result, required_collection):
                    raise ValueError(
                        f"Comlink returned HTTP success but the {required_collection!r} collection was empty."
                    )
                return result

            unit_strategies: list[tuple[str, int]] = []
            if "units" in data_items:
                unit_strategies.append(("UnitDefinitions", data_items["units"]))
            if "segment3" in data_items and data_items["segment3"] != data_items.get("units"):
                unit_strategies.append(("Segment3", data_items["segment3"]))

            unit_data: Any = None
            unit_failures: list[tuple[str, Exception]] = []
            for strategy_index, (strategy_name, item_value) in enumerate(unit_strategies):
                data_body = {
                    "payload": {
                        "version": game_version,
                        "devicePlatform": device_platform,
                        "includePveUnits": False,
                        "items": str(item_value),
                    },
                    "enums": False,
                }
                try:
                    unit_data = traced_request(
                        recorder,
                        f"read units with {strategy_name}",
                        "POST",
                        "/data",
                        data_body,
                        lambda item_value=item_value: request_game_data(item_value, "units"),
                    )
                    recorder.fact(
                        "successfulUnitRequest",
                        {"strategy": strategy_name, "items": item_value},
                    )
                    break
                except Exception as unit_error:
                    unit_failures.append((strategy_name, unit_error))
                    if strategy_index + 1 < len(unit_strategies):
                        next_strategy = unit_strategies[strategy_index + 1][0]
                        print(
                            f"Unit request with {strategy_name} failed; trying the live {next_strategy} "
                            "value once.",
                            file=sys.stderr,
                        )

            if unit_data is None:
                probe_status: dict[str, Any] = {"status": "not available in live enum"}
                if "equipment" in data_items:
                    equipment_value = data_items["equipment"]
                    equipment_body = {
                        "payload": {
                            "version": game_version,
                            "devicePlatform": device_platform,
                            "includePveUnits": False,
                            "items": str(equipment_value),
                        },
                        "enums": False,
                    }
                    try:
                        traced_request(
                            recorder,
                            "probe data endpoint with EquipmentDefinitions",
                            "POST",
                            "/data",
                            equipment_body,
                            lambda: request_game_data(equipment_value, "equipment"),
                        )
                    except Exception as probe_error:
                        probe_status = {
                            "status": "failed",
                            "items": equipment_value,
                            "error": exception_details(probe_error),
                        }
                    else:
                        probe_status = {"status": "succeeded", "items": equipment_value}

                recorder.fact("smallDataEndpointProbe", probe_status)
                if probe_status.get("status") == "succeeded":
                    classification = (
                        "The /data endpoint works for a small live-enum collection, but both unit "
                        "collection strategies failed. This isolates the problem to the unit payload size, "
                        "unit filters, or the current upstream unit-data response."
                    )
                elif probe_status.get("status") == "failed":
                    classification = (
                        "The /data endpoint failed for both unit strategies and for the small official "
                        "EquipmentDefinitions probe. The failure is not specific to Segment3 or unit size."
                    )
                else:
                    classification = "All live-enum strategies capable of returning units failed."
                recorder.note(classification, classification="data-request-failure")
                failures = "; ".join(f"{name}: {error}" for name, error in unit_failures)
                raise RuntimeError(f"{classification} Unit failures: {failures}")

            category_data: Any = {"category": []}
            if "categories" in data_items:
                category_value = data_items["categories"]
                category_body = {
                    "payload": {
                        "version": game_version,
                        "devicePlatform": device_platform,
                        "includePveUnits": False,
                        "items": str(category_value),
                    },
                    "enums": False,
                }
                try:
                    category_data = traced_request(
                        recorder,
                        "read category definitions",
                        "POST",
                        "/data",
                        category_body,
                        lambda: request_game_data(category_value, "category"),
                    )
                except Exception as category_error:
                    warning = (
                        "Category definitions were unavailable; faction labels were inferred from unit "
                        f"category IDs. Comlink reported: {category_error}"
                    )
                    print(f"Warning: {warning}", file=sys.stderr)
                    metadata.setdefault("_forgeCatalogWarnings", []).append(warning)
                    recorder.note(warning, classification="optional-category-request-failure")
            else:
                warning = (
                    "The live enum did not expose CategoryDefinitions; faction labels were inferred "
                    "from unit category IDs."
                )
                metadata.setdefault("_forgeCatalogWarnings", []).append(warning)
                recorder.note(warning, classification="optional-category-item-missing")
            game_data = merge_catalog_responses(category_data, unit_data)
    except Exception as error:
        recorder.finish("failed", error)
        diagnostic = ""
        if cache_dir:
            available = [
                str(cache_dir / name)
                for name in ("diagnostic.json", "enums.json", "metadata.json", "localization.json")
                if (cache_dir / name).exists()
            ]
            if available:
                diagnostic = " Diagnostic files: " + ", ".join(available) + "."
        raise RuntimeError(f"Comlink request to {args.url} failed: {error}{diagnostic}") from error
    recorder.finish("succeeded")
    return metadata, game_data, localization


def javascript_assignment(property_name: str, value: Any) -> str:
    serialized = json.dumps(value, ensure_ascii=False, indent=2)
    return (
        "// Generated by scripts/update_game_data.py. Do not edit generated records by hand.\n"
        "window.ForgeData = window.ForgeData || {};\n\n"
        f"window.ForgeData.{property_name} = {serialized};\n"
    )


def write_catalog(
    output_dir: Path,
    characters: list[dict[str, Any]],
    ships: list[dict[str, Any]],
    capitals: list[dict[str, Any]],
    metadata: dict[str, Any],
) -> None:
    atomic_text(output_dir / "characters.js", javascript_assignment("characters", characters))
    ship_source = (
        "// Generated by scripts/update_game_data.py. Do not edit generated records by hand.\n"
        "window.ForgeData = window.ForgeData || {};\n\n"
        f"window.ForgeData.ships = {json.dumps(ships, ensure_ascii=False, indent=2)};\n\n"
        f"window.ForgeData.capitalShips = {json.dumps(capitals, ensure_ascii=False, indent=2)};\n"
    )
    atomic_text(output_dir / "ships.js", ship_source)
    atomic_text(output_dir / "catalog-meta.js", javascript_assignment("catalogMeta", metadata))


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        previous_by_name, previous_ids = read_previous_catalog(args.output_dir)
        if args.from_cache:
            metadata, game_data, localization = load_cache(args.cache_dir)
        else:
            metadata, game_data, localization = fetch_comlink(args)
            if not args.no_cache:
                atomic_json(args.cache_dir / "metadata.json", metadata)
                atomic_json(args.cache_dir / "game-data.json", game_data)
                atomic_json(args.cache_dir / "localization.json", localization)

        characters, ships, capitals = normalize_catalog(game_data, localization, previous_by_name)
        validate_catalog(
            characters,
            ships,
            capitals,
            previous_ids,
            args.allow_missing_seed_units,
        )
        generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        catalog_metadata = {
            "status": "generated",
            "source": "comlink",
            "sourceLabel": "Local SWGOH Comlink snapshot",
            "generatedAt": generated_at,
            "gameDataVersion": metadata_value(metadata, "latestGamedataVersion", "latestGameDataVersion"),
            "localizationVersion": metadata_value(
                metadata, "latestLocalizationBundleVersion", "latestLocalizationVersion"
            ),
            "locale": args.locale,
            "devicePlatform": args.device_platform,
            "warnings": metadata.get("_forgeCatalogWarnings", []),
            "counts": {
                "characters": len(characters),
                "ships": len(ships),
                "capitalShips": len(capitals),
            },
        }
        summary = (
            f"{len(characters)} characters, {len(ships)} ships, "
            f"and {len(capitals)} capital ships (game data {catalog_metadata['gameDataVersion']})"
        )
        if args.dry_run:
            print(f"Validated {summary}; dry run left generated files unchanged.")
        else:
            write_catalog(args.output_dir, characters, ships, capitals, catalog_metadata)
            print(f"Updated {args.output_dir} with {summary}.")
        return 0
    except (FileNotFoundError, RuntimeError, ValueError, OSError) as error:
        print(f"Data update failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
