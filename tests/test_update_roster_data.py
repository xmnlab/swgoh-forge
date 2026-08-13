import importlib.util
import copy
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "update_roster_data.py"
SPEC = importlib.util.spec_from_file_location("update_roster_data", MODULE_PATH)
update_roster_data = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(update_roster_data)


class UpdateRosterDataTests(unittest.TestCase):
    def setUp(self):
        self.characters = {
            "TEST_HERO": {
                "id": "test-hero",
                "baseId": "TEST_HERO",
                "name": "Test Hero",
                "factions": ["Galactic Legend"],
            }
        }
        self.ships = {
            "TEST_SHIP": {
                "id": "test-ship",
                "baseId": "TEST_SHIP",
                "name": "Test Ship",
            }
        }
        self.player = {
            "allyCode": 123456789,
            "name": "Roster Tester",
            "guildName": "Test Guild",
            "level": 85,
            "profileStat": [
                {"nameKey": "STAT_GALACTIC_POWER_ACQUIRED_NAME", "value": 7654321},
                {"nameKey": "STAT_CHARACTER_GALACTIC_POWER_ACQUIRED_NAME", "value": 5000000},
                {"nameKey": "STAT_SHIP_GALACTIC_POWER_ACQUIRED_NAME", "value": 2654321},
            ],
            "rosterUnit": [
                {
                    "definitionId": "TEST_HERO:SEVEN_STAR",
                    "currentLevel": 85,
                    "currentRarity": 7,
                    "currentTier": 13,
                    "gp": 43210,
                    "relic": {"currentTier": 9},
                    "skill": [{"id": "basic", "tier": 6}],
                    "equippedStatMod": [{"id": "mod-1"}],
                    "unitStat": {
                        "stat": [
                            {"unitStatId": 1, "statValueDecimal": 8123400000000},
                            {"unitStatId": 5, "statValueDecimal": 29800000000},
                            {"unitStatId": 17, "statValueDecimal": 85000000},
                        ]
                    },
                },
                {
                    "definitionId": "TEST_SHIP:SEVEN_STAR",
                    "currentLevel": 85,
                    "currentRarity": "SEVEN_STAR",
                    "currentTier": "TIER_01",
                    "gp": 12345,
                    "skill": [],
                },
                {"definitionId": "UNKNOWN_UNIT:SEVEN_STAR", "currentLevel": 1},
            ],
        }

    def test_normalizes_player_and_progression(self):
        roster = update_roster_data.normalize_player(
            self.player,
            "123456789",
            self.characters,
            self.ships,
            updated_at="2026-08-12T00:00:00Z",
        )

        self.assertEqual("Roster Tester", roster["name"])
        self.assertEqual(7654321, roster["galacticPower"])
        self.assertEqual(1, roster["characterCount"])
        self.assertEqual(1, roster["shipCount"])
        self.assertEqual(1, roster["relicCount"])
        self.assertEqual(1, roster["galacticLegends"])
        self.assertEqual(1, roster["characterGpCoverage"])
        self.assertEqual(1, roster["shipGpCoverage"])
        self.assertEqual(["UNKNOWN_UNIT"], roster["unmatchedBaseIds"])
        hero = roster["units"]["test-hero"]
        self.assertEqual(43210, hero["gp"])
        self.assertEqual(7, hero["relic"])
        self.assertEqual(13, hero["gear"])
        self.assertEqual(298, hero["speed"])
        self.assertEqual(81234, hero["health"])
        self.assertEqual(85, hero["potency"])
        self.assertEqual(12345, roster["ships"]["test-ship"]["gp"])
        self.assertEqual(7, roster["ships"]["test-ship"]["stars"])

    def test_calculates_roster_gp_before_normalization(self):
        player = copy.deepcopy(self.player)
        for unit in player["rosterUnit"]:
            unit.pop("gp", None)

        class FakeCalculator:
            def calc_roster_stats(self, roster_units):
                roster_units[0]["gp"] = 45678
                roster_units[1]["gp"] = 23456
                return roster_units

        skills = [{"id": "basicskill_TEST", "tier": []}]
        with mock.patch.object(
            update_roster_data,
            "fetch_gp_calculator",
            return_value=(FakeCalculator(), skills),
        ):
            result = update_roster_data.calculate_player_galactic_power(
                "http://127.0.0.1:3000",
                player,
            )

        self.assertEqual(skills, result)
        self.assertEqual(45678, player["rosterUnit"][0]["gp"])
        self.assertEqual(23456, player["rosterUnit"][1]["gp"])

    def test_rejects_gp_calculation_with_no_unit_results(self):
        player = copy.deepcopy(self.player)
        for unit in player["rosterUnit"]:
            unit.pop("gp", None)

        calculator = mock.Mock()
        calculator.calc_roster_stats.return_value = player["rosterUnit"]
        with mock.patch.object(
            update_roster_data,
            "fetch_gp_calculator",
            return_value=(calculator, []),
        ):
            with self.assertRaisesRegex(RuntimeError, "did not produce GP"):
                update_roster_data.calculate_player_galactic_power(
                    "http://127.0.0.1:3000",
                    player,
                )

    def test_upsert_adds_then_replaces_only_matching_ally_code(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "rosters.js"
            first = update_roster_data.normalize_player(
                self.player,
                "123456789",
                self.characters,
                self.ships,
                updated_at="2026-08-12T00:00:00Z",
            )
            _, replaced = update_roster_data.upsert_roster(output, first)
            self.assertFalse(replaced)

            second_player = dict(self.player, name="Updated Tester")
            second = update_roster_data.normalize_player(
                second_player,
                "123456789",
                self.characters,
                self.ships,
                updated_at="2026-08-13T00:00:00Z",
            )
            store, replaced = update_roster_data.upsert_roster(output, second)
            self.assertTrue(replaced)
            self.assertEqual(["123456789"], list(store["rosters"]))
            self.assertEqual("Updated Tester", store["rosters"]["123456789"]["name"])
            parsed = update_roster_data.read_javascript_value(output, update_roster_data.STORE_VARIABLE)
            self.assertEqual(store, parsed)
            self.assertEqual(update_roster_data.SCHEMA_VERSION, parsed["schemaVersion"])

    def test_expands_ability_levels_and_counts_applied_power_ups(self):
        player = copy.deepcopy(self.player)
        player["rosterUnit"][0]["skill"] = [
            {"id": "basicskill_TEST", "tier": 6},
            {"id": "uniqueskill_TEST", "tier": 7},
        ]
        player["rosterUnit"][0]["purchasedAbilityId"] = ["ultimateability_TEST"]
        skill_definitions = [
            {
                "id": "basicskill_TEST",
                "tier": [{}, {}, {}, {}, {}, {"isZetaTier": True}, {}],
            },
            {
                "id": "uniqueskill_TEST",
                "omicronMode": 9,
                "tier": [{}, {}, {}, {}, {}, {}, {"isOmicronTier": True}, {}],
            },
        ]

        roster = update_roster_data.normalize_player(
            player,
            "123456789",
            self.characters,
            self.ships,
            updated_at="2026-08-12T00:00:00Z",
            skill_definitions=skill_definitions,
        )

        hero = roster["units"]["test-hero"]
        self.assertTrue(hero["abilityProgressionComplete"])
        self.assertEqual(1, hero["zetaCount"])
        self.assertEqual(1, hero["omicronCount"])
        self.assertTrue(hero["galacticLegend"])
        self.assertTrue(hero["ultimateUnlocked"])
        self.assertEqual(1, hero["purchasedAbilityCount"])
        self.assertEqual(
            [
                {
                    "id": "basicskill_TEST",
                    "level": 8,
                    "maxLevel": 8,
                    "zetaAvailable": True,
                    "zeta": True,
                },
                {
                    "id": "uniqueskill_TEST",
                    "level": 9,
                    "maxLevel": 9,
                    "omicronAvailable": True,
                    "omicronMode": 9,
                    "omicron": True,
                },
            ],
            hero["abilities"],
        )

    def test_marks_power_up_counts_unknown_without_complete_skill_data(self):
        roster = update_roster_data.normalize_player(
            self.player,
            "123456789",
            self.characters,
            self.ships,
            updated_at="2026-08-12T00:00:00Z",
        )
        hero = roster["units"]["test-hero"]
        self.assertFalse(hero["abilityProgressionComplete"])
        self.assertIsNone(hero["zetaCount"])
        self.assertIsNone(hero["omicronCount"])
        self.assertEqual(8, hero["abilities"][0]["level"])

    def test_reads_skill_definitions_from_live_enum_shape(self):
        enums = {"wrapper": {"GameDataItemsEnum": {"SkillDefinitions": 4}}}
        self.assertEqual(4, update_roster_data.game_data_item_value(enums, "SkillDefinitions"))

    def test_fetches_live_skill_definitions_with_current_version(self):
        with mock.patch.object(
            update_roster_data,
            "request_json",
            side_effect=[
                {"GameDataItemsEnum": {"SkillDefinitions": 4}},
                {"latestGamedataVersion": "test-version"},
                {"skill": [{"id": "basicskill_TEST", "tier": []}]},
            ],
        ) as request_json:
            skills = update_roster_data.fetch_skill_definitions("http://127.0.0.1:3000")

        self.assertEqual("basicskill_TEST", skills[0]["id"])
        data_payload = request_json.call_args_list[2].args[2]
        self.assertEqual("test-version", data_payload["payload"]["version"])
        self.assertEqual("4", data_payload["payload"]["items"])

    def test_builds_gp_calculator_from_separate_live_data_items(self):
        captured = {}

        class FakeBuilder:
            def __init__(self, client):
                self.client = client

            def build(self):
                captured["raw"] = self.client.get_game_data(items="ignored")
                return {"unitData": {"TEST_HERO": {}}}

        class FakeStatCalc:
            def __init__(self, game_data):
                self.game_data = game_data

        fake_package = types.SimpleNamespace(GameDataBuilder=FakeBuilder, StatCalc=FakeStatCalc)
        enums = {
            "GameDataItemsEnum": {
                "CategoryDefinitions": 1,
                "SkillDefinitions": 4,
                "EquipmentDefinitions": 8,
                "AllTables": 32,
                "StatProgression": 4194304,
                "StatMod": 33554432,
                "RelicTierDefinitions": 68719476736,
                "UnitDefinitions": 137438953472,
            }
        }
        responses = [
            enums,
            {"latestGamedataVersion": "test-version"},
            {"category": [{"id": "category"}]},
            {"skill": [{"id": "skill"}]},
            {"equipment": [{"id": "equipment"}]},
            {"table": [{"id": "table"}], "xpTable": [{"id": "xp"}]},
            {"statProgression": [{"id": "progression"}]},
            {"statModSet": [{"id": "mod-set"}]},
            {"relicTierDefinition": [{"id": "relic"}]},
            {"units": [{"id": "TEST_HERO"}]},
        ]
        with mock.patch.dict(sys.modules, {"swgoh_comlink": fake_package}), mock.patch.object(
            update_roster_data,
            "request_json",
            side_effect=responses,
        ) as request_json:
            calculator, skills = update_roster_data.fetch_gp_calculator("http://127.0.0.1:3000")

        self.assertIsInstance(calculator, FakeStatCalc)
        self.assertEqual([{"id": "skill"}], skills)
        self.assertEqual(
            {
                "category",
                "skill",
                "equipment",
                "table",
                "xpTable",
                "statProgression",
                "statModSet",
                "relicTierDefinition",
                "units",
            },
            set(captured["raw"]),
        )
        data_requests = request_json.call_args_list[2:]
        self.assertEqual(
            ["1", "4", "8", "32", "4194304", "33554432", "68719476736", "137438953472"],
            [call.args[2]["payload"]["items"] for call in data_requests],
        )
        self.assertTrue(all(call.args[2]["payload"]["version"] == "test-version" for call in data_requests))

    def test_ally_code_validation_accepts_hyphens_but_rejects_zero(self):
        self.assertEqual("123456789", update_roster_data.normalize_ally_code("123-456-789"))
        with self.assertRaises(ValueError):
            update_roster_data.normalize_ally_code("123456780")


if __name__ == "__main__":
    unittest.main()
