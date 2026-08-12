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
                {
                    "baseId": "TEST_HERO_EVENT_CLONE",
                    "nameKey": "HERO_NAME",
                    "combatType": 1,
                    "rarity": 7,
                    "obtainable": True,
                    "obtainableTime": "2396822400000",
                    "categoryId": ["alignment_light", "role_attacker", "affiliation_rebel"],
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

    def test_parses_comlink_localization_text_bundles(self):
        localization = {
            "Loc_ENG_US.txt": (
                "# Start Category: Star_Wars_Strategy_RPG\n"
                "UNIT_REY_NAME_V2|Rey (Scavenger)\n"
                "UNIT_VADER_NAME|Darth Vader\n"
                "VALUE_WITH_PIPE|Text with | a pipe and\\nnewline\n"
            ),
            "Loc_Key_Mapping.txt": (
                "# aliases\n"
                "LEGACY_VADER_NAME|UNIT_VADER_NAME\n"
                "LEGACY_VADER_NAME_2|LEGACY_VADER_NAME\n"
            ),
        }

        translations = update_game_data.collect_localization(localization)

        self.assertEqual("Rey (Scavenger)", translations["UNIT_REY_NAME_V2"])
        self.assertEqual("Darth Vader", translations["UNIT_VADER_NAME"])
        self.assertEqual("Darth Vader", translations["LEGACY_VADER_NAME"])
        self.assertEqual("Darth Vader", translations["LEGACY_VADER_NAME_2"])
        self.assertEqual("Text with | a pipe and\nnewline", translations["VALUE_WITH_PIPE"])
        self.assertNotIn("Loc_ENG_US.txt", translations)

    def test_reads_both_seed_and_generated_js_records(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            (output / "characters.js").write_text(
                'window.ForgeData.characters = [{ id: "old-id", name: "Old Name", color: "#abcdef" }];',
                encoding="utf-8",
            )
            (output / "ships.js").write_text(
                'window.ForgeData.ships = [{\n'
                '  "id": "new-id",\n  "baseId": "NEW_ID",\n  "name": "New Name"\n}, {\n'
                '  "id": "new-name-event-clone",\n  "baseId": "NEW_ID_EVENT",\n'
                '  "name": "New Name"\n}];',
                encoding="utf-8",
            )
            by_name, ids = update_game_data.read_previous_catalog(output)

        self.assertEqual({"old-id", "new-id", "new-name-event-clone"}, ids)
        self.assertEqual("#abcdef", by_name["oldname"]["color"])
        self.assertEqual("NEW_ID", by_name["newname"]["baseId"])
        self.assertEqual("new-id", by_name["base:new_id"]["id"])
        self.assertEqual("new-name-event-clone", by_name["base:new_id_event"]["id"])

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
            self.assertIn("window.ForgeData.synergyModel", (output / "synergies.js").read_text())
            metadata_js = (output / "catalog-meta.js").read_text()
            self.assertIn('"gameDataVersion": "test-game-version"', metadata_js)
            self.assertIn('"characters": 100', metadata_js)

    def test_builds_synergy_from_localized_final_tier_kit_text(self):
        game_data = {
            "category": [
                {"id": "affiliation_phoenix", "descKey": "PHOENIX"},
                {"id": "affiliation_rebels", "descKey": "REBELS"},
                {"id": "role_leader", "descKey": "LEADER"},
            ],
            "units": [
                {
                    "baseId": "HERA",
                    "combatType": 1,
                    "obtainable": True,
                    "categoryId": ["affiliation_phoenix", "affiliation_rebels", "role_leader"],
                    "skillReference": [{"skillId": "leaderskill_HERA"}],
                },
                {
                    "baseId": "REX",
                    "combatType": 1,
                    "obtainable": True,
                    "categoryId": ["affiliation_phoenix", "affiliation_rebels"],
                    "skillReference": [{"skillId": "uniqueskill_REX01"}],
                },
            ],
        }
        localization = {
            "PHOENIX": "Phoenix",
            "REBELS": "Rebels",
            "LEADER": "Leader",
            "LEADERABILITY_HERA_NAME": "Rise Together",
            "LEADERABILITY_HERA_TIER_07_DESC": (
                "Each Phoenix ally grants their Unique ability to other Phoenix allies. "
                "Whenever a Phoenix ally uses a Special ability, they gain Turn Meter."
            ),
            "UNIQUEABILITY_REX01_NAME": "The Lost Commander",
            "UNIQUEABILITY_REX01_TIER_06_DESC": (
                "Whenever another Phoenix ally uses a Special ability, Rex assists. "
                "Phoenix allies recover Health and Protection."
            ),
        }
        characters = [
            {"id": "hera", "baseId": "HERA", "name": "Hera", "canLead": True},
            {"id": "rex", "baseId": "REX", "name": "Rex", "canLead": False},
        ]

        model = update_game_data.normalize_synergy_model(game_data, localization, characters)

        self.assertEqual("localized-kit-text", model["quality"])
        hera_lead = model["units"]["hera"]["abilities"][0]
        self.assertEqual("leader", hera_lead["kind"])
        self.assertIn("affiliation_phoenix", hera_lead["targetCategories"])
        self.assertIn("shares unique abilities", hera_lead["signals"])
        rex_unique = model["units"]["rex"]["abilities"][0]
        self.assertIn("calls assists", rex_unique["signals"])
        self.assertIn("recovers Health or Protection", rex_unique["signals"])

    def test_prefers_explicit_ability_synergy_and_normalizes_official_squads(self):
        game_data = {
            "units": [
                {
                    "baseId": "LEADER",
                    "combatType": 1,
                    "obtainable": True,
                    "categoryId": ["affiliation_test", "role_leader"],
                    "skillReference": [{"skillId": "leaderskill_TEST"}],
                },
                {
                    "baseId": "ALLY_A",
                    "combatType": 1,
                    "obtainable": True,
                    "categoryId": ["affiliation_test"],
                },
                {
                    "baseId": "ALLY_B",
                    "combatType": 1,
                    "obtainable": True,
                    "categoryId": ["affiliation_test"],
                },
            ],
            "skill": [
                {"id": "leaderskill_TEST", "abilityReference": "ability_TEST", "isZeta": True}
            ],
            "ability": [
                {
                    "id": "ability_TEST",
                    "nameKey": "ABILITY_NAME",
                    "descKey": "ABILITY_DESC",
                    "synergy": {"separateCategoryId": ["affiliation_test"]},
                }
            ],
            "recommendedSquad": [
                {"id": "test-squad", "name": "Test squad", "unitDefId": ["LEADER", "ALLY_A", "ALLY_B"]}
            ],
        }
        characters = [
            {"id": "leader", "baseId": "LEADER", "name": "Leader", "canLead": True},
            {"id": "ally-a", "baseId": "ALLY_A", "name": "Ally A", "canLead": False},
            {"id": "ally-b", "baseId": "ALLY_B", "name": "Ally B", "canLead": False},
        ]

        model = update_game_data.normalize_synergy_model(
            game_data,
            {"ABILITY_NAME": "Test Leadership", "ABILITY_DESC": "Test allies gain Offense."},
            characters,
        )

        self.assertEqual("explicit-ability-data", model["quality"])
        ability = model["units"]["leader"]["abilities"][0]
        self.assertEqual(["affiliation_test"], ability["separateCategories"])
        self.assertTrue(ability["zeta"])
        self.assertEqual(["leader", "ally-a", "ally-b"], model["officialSquads"][0]["members"])

    def test_builds_normalized_simulation_stats_from_the_highest_gear_tier(self):
        unit = {
            "unitTier": [
                {"tier": 1, "baseStat": {"stat": [{"unitStatId": 1, "statValueDecimal": "10000000"}]}},
                {
                    "tier": 13,
                    "baseStat": {
                        "stat": [
                            {"unitStatId": 1, "statValueDecimal": "234560000"},
                            {"unitStatId": 28, "statValueDecimal": "345670000"},
                            {"unitStatId": 5, "statValueDecimal": "1720000"},
                            {"unitStatId": 6, "statValueDecimal": "18450000"},
                            {"unitStatId": 7, "statValueDecimal": "1400000"},
                            {"unitStatId": 8, "statValueDecimal": "2100000"},
                            {"unitStatId": 9, "statValueDecimal": "3650000"},
                            {"unitStatId": 10, "statValueDecimal": "2200000"},
                            {"unitStatId": 14, "statValueDecimal": "2500000"},
                        ]
                    },
                },
            ]
        }

        stats = update_game_data.unit_simulation_stats(unit, "Attacker")

        self.assertEqual(23456, stats["health"])
        self.assertEqual(34567, stats["protection"])
        self.assertEqual(172, stats["speed"])
        self.assertEqual(1845, stats["offense"])
        self.assertEqual(365, stats["defense"])
        self.assertEqual(220, stats["penetration"])
        self.assertEqual(35, stats["criticalChance"])

    def test_compacts_combat_text_without_treating_thresholds_as_recovery(self):
        combat = update_game_data.compact_combat_mechanics(
            "Deal Physical damage to all enemies twice and inflict Stun on them. All allies recover 20% Health and "
            "Protection and gain 15% Turn Meter. If an enemy has less than 50% Health, "
            "call all Phoenix allies to assist.",
            "special",
        )

        self.assertEqual({"target": "all", "hits": 2, "multiplier": 0.86}, combat["damage"])
        self.assertEqual(
            {"target": "all", "healthPercent": 20, "protectionPercent": 20},
            combat["recovery"],
        )
        self.assertEqual(15, combat["turnMeterPercent"])
        self.assertEqual("all", combat["assist"])
        self.assertEqual(["stun"], combat["control"])
        self.assertEqual("all", combat["controlTarget"])

    def test_reads_live_game_data_item_enum_shapes(self):
        fixtures = [
            {
                "GameDataItems": {
                    "CategoryDefinitions": "1",
                    "EquipmentDefinitions": 8,
                    "UnitDefinitions": 137,
                    "SEGMENT1": "101",
                    "SEGMENT3": 303,
                    "ALL": -1,
                }
            },
            {
                "enums": [
                    {
                        "name": "GameDataItemsEnum",
                        "values": [
                            {"name": "CATEGORY_DEFINITIONS", "number": 2},
                            {"name": "EQUIPMENT_DEFINITIONS", "number": 9},
                            {"name": "UNIT_DEFINITIONS", "number": 138},
                            {"name": "SEGMENT_1", "number": 111},
                            {"name": "SEGMENT_3", "number": 333},
                            {"name": "ALL", "number": -1},
                        ],
                    }
                ]
            },
            {
                "GameDataItemsEnum": {
                    "3": "CATEGORY_DEFINITION",
                    "10": "EQUIPMENT_DEFINITION",
                    "139": "UNIT_DEFINITION",
                    "121": "SEGMENT_ONE",
                    "323": "SEGMENT_THREE",
                    "-1": "EVERYTHING",
                }
            },
        ]
        self.assertEqual(
            {"categories": 1, "equipment": 8, "units": 137, "segment3": 303},
            update_game_data.select_game_data_items(fixtures[0]),
        )
        self.assertEqual(
            {"categories": 2, "equipment": 9, "units": 138, "segment3": 333},
            update_game_data.select_game_data_items(fixtures[1]),
        )
        self.assertEqual(
            {"categories": 3, "equipment": 10, "units": 139, "segment3": 323},
            update_game_data.select_game_data_items(fixtures[2]),
        )

    def test_fetches_minimal_category_and_unit_collections_first(self):
        class FakeComlink:
            calls = []
            metadata_specs = None

            def __init__(self, **kwargs):
                self.kwargs = kwargs

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def get_enums(self):
                return {
                    "GameDataItems": {
                        "CategoryDefinitions": 101,
                        "SkillDefinitions": 4,
                        "EquipmentDefinitions": 808,
                        "AbilityDefinitions": 22,
                        "UnitDefinitions": 313,
                        "SEGMENT1": 1_111,
                        "SEGMENT3": 3_333,
                        "RecommendedSquads": 44,
                        "ALL": -1,
                    }
                }

            def get_game_metadata(self, client_specs=None):
                self.__class__.metadata_specs = client_specs
                return {
                    "latestGamedataVersion": "game-version",
                    "latestLocalizationBundleVersion": "localization-version",
                    "assetSubpath": "100044/Android/ETC2",
                }

            def get_game_data(self, **kwargs):
                self.calls.append(kwargs)
                if kwargs["items"] == 101:
                    return {"category": [{"id": "affiliation_rebel"}], "units": []}
                if kwargs["items"] == 4:
                    return {"skill": [{"id": "leaderskill_TEST"}]}
                if kwargs["items"] == 22:
                    return {"ability": [{"id": "ability_TEST"}]}
                if kwargs["items"] == 44:
                    return {"recommendedSquad": [{"id": "recommended_TEST"}]}
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
        self.assertEqual({"platform": "Android"}, FakeComlink.metadata_specs)
        self.assertEqual([{"id": "affiliation_rebel"}], game_data["category"])
        self.assertEqual([{"baseId": "TEST_HERO"}], game_data["units"])
        self.assertEqual([{"id": "leaderskill_TEST"}], game_data["skill"])
        self.assertEqual([{"id": "ability_TEST"}], game_data["ability"])
        self.assertEqual([{"id": "recommended_TEST"}], game_data["recommendedSquad"])
        self.assertEqual("Test Hero", localization["HERO_NAME"])
        self.assertEqual(
            [313, 101, 4, 22, 44],
            [call["items"] for call in FakeComlink.calls],
        )
        self.assertTrue(all("request_segment" not in call for call in FakeComlink.calls))
        self.assertTrue(all(call["include_pve_units"] is False for call in FakeComlink.calls))
        self.assertTrue(all(call["device_platform"] == "Android" for call in FakeComlink.calls))

    def test_fetch_falls_back_from_unit_collection_to_live_segment(self):
        class FakeComlink:
            calls = []

            def __init__(self, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def get_enums(self):
                return {
                    "GameDataItems": {
                        "CategoryDefinitions": 11,
                        "EquipmentDefinitions": 8,
                        "UnitDefinitions": 13,
                        "SEGMENT1": 111,
                        "SEGMENT3": 33,
                        "ALL": 99,
                    }
                }

            def get_game_metadata(self, client_specs=None):
                return {
                    "latestGamedataVersion": "game-version",
                    "latestLocalizationBundleVersion": "localization-version",
                    "assetSubpath": "100044/Android/ETC2",
                }

            def get_game_data(self, **kwargs):
                self.calls.append(kwargs["items"])
                if kwargs["items"] == 13:
                    raise RuntimeError("single unit collection rejected")
                if kwargs["items"] == 11:
                    return {"category": [{"id": "affiliation_rebel"}], "units": []}
                if kwargs["items"] == 33:
                    return {"category": [], "units": [{"baseId": "TEST_HERO"}]}
                raise AssertionError(f"unsupported fallback was used: {kwargs['items']}")

            def get_localization(self, **kwargs):
                return {}

        fake_module = types.SimpleNamespace(SwgohComlink=FakeComlink)
        arguments = Namespace(
            url="http://127.0.0.1:3000",
            access_key=None,
            secret_key=None,
            locale="ENG_US",
        )
        with patch.dict(sys.modules, {"swgoh_comlink": fake_module}):
            _, game_data, _ = update_game_data.fetch_comlink(arguments)

        self.assertEqual([13, 33, 11], FakeComlink.calls)
        self.assertEqual(1, len(game_data["category"]))
        self.assertEqual(1, len(game_data["units"]))

    def test_failure_trace_uses_small_probe_and_never_invents_all(self):
        class FakeComlink:
            def __init__(self, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def get_enums(self):
                return {
                    "GameDataItemsEnum": {
                        "EquipmentDefinitions": 8,
                        "UnitDefinitions": 13,
                        "Segment3": 33,
                    }
                }

            def get_game_metadata(self, client_specs=None):
                return {
                    "latestGamedataVersion": "game-version",
                    "latestLocalizationBundleVersion": "localization-version",
                    "assetSubpath": "100044/Android/ETC2",
                }

            def get_game_data(self, **kwargs):
                if kwargs["items"] == 8:
                    return {"equipment": [{"id": "test-equipment"}], "units": []}
                raise RuntimeError(f"no upstream response for {kwargs['items']}")

            def get_localization(self, **kwargs):
                return {}

        fake_module = types.SimpleNamespace(SwgohComlink=FakeComlink)
        with tempfile.TemporaryDirectory() as directory:
            cache_dir = Path(directory)
            arguments = Namespace(
                url="http://127.0.0.1:3000",
                access_key=None,
                secret_key=None,
                locale="ENG_US",
                cache_dir=cache_dir,
                no_cache=False,
            )
            with patch.dict(sys.modules, {"swgoh_comlink": fake_module}):
                with self.assertRaisesRegex(RuntimeError, "small live-enum collection"):
                    update_game_data.fetch_comlink(arguments)

            diagnostic = json.loads((cache_dir / "diagnostic.json").read_text())

        self.assertEqual("failed", diagnostic["status"])
        self.assertEqual("succeeded", diagnostic["facts"]["smallDataEndpointProbe"]["status"])
        data_bodies = [
            request["request"]["body"]
            for request in diagnostic["requests"]
            if request["request"]["path"] == "/data"
        ]
        self.assertEqual(["13", "33", "8"], [body["payload"]["items"] for body in data_bodies])
        self.assertNotIn("-1", [body["payload"]["items"] for body in data_bodies])

    def test_rejects_metadata_for_a_different_platform(self):
        with self.assertRaisesRegex(ValueError, "not requested platform"):
            update_game_data.validate_metadata_platform(
                {"assetSubpath": "100044/Windows/ETC"}, "Android"
            )

    def test_infers_visible_affiliations_without_category_definitions(self):
        game_data = {
            "category": [],
            "units": [
                {
                    "baseId": "TEST_HERO",
                    "name": "Test Hero",
                    "combatType": 1,
                    "rarity": 7,
                    "obtainable": True,
                    "categoryId": ["alignment_light", "role_attacker", "affiliation_jedi"],
                }
            ],
        }
        characters, _, _ = update_game_data.normalize_catalog(game_data, {})

        self.assertEqual(["Jedi"], characters[0]["factions"])
        self.assertEqual("Light Side", characters[0]["alignment"])
        self.assertEqual("Attacker", characters[0]["role"])


if __name__ == "__main__":
    unittest.main()
