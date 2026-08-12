import importlib.util
import json
import sys
import tempfile
import types
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "update_game_data.py"
SPEC = importlib.util.spec_from_file_location("update_game_data", SCRIPT_PATH)
update_game_data = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = update_game_data
SPEC.loader.exec_module(update_game_data)


class NormalizeCatalogTests(unittest.TestCase):
    def setUp(self):
        self.game_data = {
            "category": [
                {"id": "alignment_light", "descKey": "LIGHT", "visible": False},
                {"id": "alignment_dark", "descKey": "DARK", "visible": False},
                {"id": "role_attacker", "descKey": "ATTACKER", "visible": False},
                {"id": "role_tank", "descKey": "TANK", "visible": False},
                {"id": "role_support", "descKey": "SUPPORT", "visible": False},
                {"id": "affiliation_rebel", "descKey": "REBEL", "visible": True},
                {"id": "affiliation_empire", "descKey": "EMPIRE", "visible": True},
                {"id": "role_capitalship", "descKey": "CAPITAL", "visible": False},
            ],
            "units": [
                {
                    "baseId": "TEST_HERO",
                    "nameKey": "HERO_NAME",
                    "combatType": 1,
                    "rarity": 1,
                    "obtainable": True,
                    "categoryId": ["alignment_light", "role_attacker", "affiliation_rebel"],
                },
                {
                    "baseId": "TEST_HERO",
                    "nameKey": "HERO_NAME",
                    "combatType": 1,
                    "rarity": 7,
                    "obtainable": True,
                    "categoryId": ["alignment_light", "role_attacker", "affiliation_rebel"],
                    "skillReference": [{"skillId": "leaderskill_test_hero"}],
                },
                {
                    "baseId": "TEST_VILLAIN",
                    "nameKey": "VILLAIN_NAME",
                    "combatType": "CHARACTER",
                    "rarity": 7,
                    "obtainable": True,
                    "categoryIdList": ["alignment_dark", "role_tank", "affiliation_empire"],
                },
                {
                    "baseId": "TEST_SHIP",
                    "nameKey": "SHIP_NAME",
                    "combatType": 2,
                    "rarity": 7,
                    "obtainable": True,
                    "categoryIdList": ["role_attacker", "affiliation_rebel"],
                    "crew": [{"unitId": "TEST_HERO"}],
                },
                {
                    "baseId": "CAPITAL_TEST",
                    "nameKey": "CAPITAL_NAME",
                    "combatType": "SHIP",
                    "rarity": 7,
                    "obtainable": True,
                    "categoryIdList": ["role_capitalship", "affiliation_empire"],
                    "crewList": [{"unitBaseId": "TEST_VILLAIN"}],
                },
                {
                    "baseId": "NPC_ONLY",
                    "nameKey": "NPC_NAME",
                    "combatType": 1,
                    "rarity": 7,
                    "obtainable": False,
                },
            ],
        }
        self.localization = {
            "localizationBundle": "{\"HERO_NAME\": \"Test Hero\", \"VILLAIN_NAME\": \"Test Villain\"}",
            "entries": [
                {"key": "SHIP_NAME", "value": "Test Starfighter"},
                {"key": "CAPITAL_NAME", "value": "Test Flagship"},
                {"key": "REBEL", "value": "Rebel"},
                {"key": "EMPIRE", "value": "Empire"},
            ],
        }

    def test_normalizes_units_and_crew_relationships(self):
        previous = {
            update_game_data.match_key("Test Hero"): {
                "id": "hero-legacy",
                "shortName": "Hero",
                "color": "#123456",
            }
        }
        characters, ships, capitals = update_game_data.normalize_catalog(
            self.game_data, self.localization, previous
        )

        self.assertEqual(2, len(characters))
        hero = next(unit for unit in characters if unit["baseId"] == "TEST_HERO")
        self.assertEqual("hero-legacy", hero["id"])
        self.assertEqual("Hero", hero["shortName"])
        self.assertEqual("#123456", hero["color"])
        self.assertEqual(["Rebel"], hero["factions"])
        self.assertEqual("Light Side", hero["alignment"])
        self.assertEqual("Attacker", hero["role"])
        self.assertTrue(hero["canLead"])
        self.assertIn("test-hero", hero["aliases"])

        self.assertEqual("hero-legacy", ships[0]["pilotId"])
        self.assertEqual("Test Hero", ships[0]["pilotName"])
        self.assertEqual("test-villain", capitals[0]["commanderId"])
        self.assertEqual("Test Villain", capitals[0]["commanderName"])

    def test_reads_both_seed_and_generated_js_records(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            (output / "characters.js").write_text(
                'window.ForgeData.characters = [{ id: "old-id", name: "Old Name", color: "#abcdef" }];',
                encoding="utf-8",
            )
            (output / "ships.js").write_text(
                'window.ForgeData.ships = [{\n  "id": "new-id",\n  "baseId": "NEW_ID",\n  "name": "New Name"\n}];',
                encoding="utf-8",
            )
            by_name, ids = update_game_data.read_previous_catalog(output)

        self.assertEqual({"old-id", "new-id"}, ids)
        self.assertEqual("#abcdef", by_name["oldname"]["color"])
        self.assertEqual("NEW_ID", by_name["newname"]["baseId"])
        self.assertEqual("new-id", by_name["base:new_id"]["id"])

    def test_cli_builds_valid_javascript_from_cached_responses(self):
        units = []
        for index in range(100):
            units.append(
                {
                    "baseId": f"CHARACTER_{index}",
                    "name": f"Character {index}",
                    "combatType": 1,
                    "rarity": 7,
                    "obtainable": True,
                    "categoryId": ["alignment_light", "role_attacker", "affiliation_rebel"],
                }
            )
        for index in range(20):
            units.append(
                {
                    "baseId": f"SHIP_{index}",
                    "name": f"Starfighter {index}",
                    "combatType": 2,
                    "rarity": 7,
                    "obtainable": True,
                    "categoryId": ["role_attacker", "affiliation_rebel"],
                    "crew": [{"unitId": f"CHARACTER_{index}"}],
                }
            )
        for index in range(5):
            units.append(
                {
                    "baseId": f"CAPITAL_SHIP_{index}",
                    "name": f"Flagship {index}",
                    "combatType": 2,
                    "rarity": 7,
                    "obtainable": True,
                    "categoryId": ["role_capitalship", "affiliation_rebel"],
                    "crew": [{"unitId": f"CHARACTER_{index}"}],
                }
            )

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cache = root / "cache"
            output = root / "output"
            cache.mkdir()
            metadata = {
                "latestGamedataVersion": "test-game-version",
                "latestLocalizationBundleVersion": "test-localization-version",
            }
            categories = self.game_data["category"]
            (cache / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
            (cache / "game-data.json").write_text(
                json.dumps({"category": categories, "units": units}), encoding="utf-8"
            )
            (cache / "localization.json").write_text("{}", encoding="utf-8")

            result = update_game_data.main(
                ["--from-cache", "--cache-dir", str(cache), "--output-dir", str(output)]
            )

            self.assertEqual(0, result)
            self.assertIn("window.ForgeData.characters", (output / "characters.js").read_text())
            self.assertIn("window.ForgeData.capitalShips", (output / "ships.js").read_text())
            metadata_js = (output / "catalog-meta.js").read_text()
            self.assertIn('"gameDataVersion": "test-game-version"', metadata_js)
            self.assertIn('"characters": 100', metadata_js)

    def test_fetches_category_and_units_with_individual_item_values(self):
        class FakeComlink:
            calls = []

            def __init__(self, **kwargs):
                self.kwargs = kwargs

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def get_game_metadata(self):
                return {
                    "latestGamedataVersion": "game-version",
                    "latestLocalizationBundleVersion": "localization-version",
                }

            def get_game_data(self, **kwargs):
                self.calls.append(kwargs)
                if kwargs["items"] == update_game_data.CATEGORY_DATA_ITEMS:
                    return {"category": [{"id": "affiliation_rebel"}], "units": []}
                return {"category": [], "units": [{"baseId": "TEST_HERO"}]}

            def get_localization(self, **kwargs):
                return {"HERO_NAME": "Test Hero"}

        fake_module = types.SimpleNamespace(SwgohComlink=FakeComlink)
        arguments = Namespace(
            url="http://127.0.0.1:3000",
            access_key=None,
            secret_key=None,
            locale="ENG_US",
        )
        with patch.dict(sys.modules, {"swgoh_comlink": fake_module}):
            metadata, game_data, localization = update_game_data.fetch_comlink(arguments)

        self.assertEqual("game-version", metadata["latestGamedataVersion"])
        self.assertEqual([{"id": "affiliation_rebel"}], game_data["category"])
        self.assertEqual([{"baseId": "TEST_HERO"}], game_data["units"])
        self.assertEqual("Test Hero", localization["HERO_NAME"])
        self.assertEqual(
            [update_game_data.CATEGORY_DATA_ITEMS, update_game_data.UNIT_DATA_ITEMS],
            [call["items"] for call in FakeComlink.calls],
        )
        self.assertTrue(all(call["include_pve_units"] is False for call in FakeComlink.calls))


if __name__ == "__main__":
    unittest.main()
