import importlib.util
import copy
import json
import tempfile
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
        self.assertEqual(["UNKNOWN_UNIT"], roster["unmatchedBaseIds"])
        hero = roster["units"]["test-hero"]
        self.assertEqual(7, hero["relic"])
        self.assertEqual(13, hero["gear"])
        self.assertEqual(298, hero["speed"])
        self.assertEqual(81234, hero["health"])
        self.assertEqual(85, hero["potency"])
        self.assertEqual(7, roster["ships"]["test-ship"]["stars"])

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

    def test_ally_code_validation_accepts_hyphens_but_rejects_zero(self):
        self.assertEqual("123456789", update_roster_data.normalize_ally_code("123-456-789"))
        with self.assertRaises(ValueError):
            update_roster_data.normalize_ally_code("123456780")


if __name__ == "__main__":
    unittest.main()
