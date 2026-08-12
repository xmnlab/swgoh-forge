"use strict";

const assert = require("assert");
const simulator = require("../battle-simulator.js");

const characters = [];
const units = {};

function addTeam(prefix, stats) {
  for (let index = 1; index <= 5; index += 1) {
    const id = `${prefix}-${index}`;
    characters.push({ id, name: `${prefix.toUpperCase()} ${index}`, role: index === 2 ? "Tank" : "Attacker", canLead: index === 1 });
    units[id] = {
      categories: [`affiliation_${prefix}`],
      simulationStats: { ...stats },
      abilities: [{
        skillId: `basic-${id}`,
        kind: "basic",
        name: "Test strike",
        impact: 2,
        combat: { damage: { target: "single", hits: 1, multiplier: 1 } }
      }]
    };
  }
}

addTeam("alpha", { health: 36000, protection: 44000, speed: 220, offense: 2500, defense: 420, penetration: 160, criticalChance: 30, criticalDamage: 150 });
addTeam("beta", { health: 18000, protection: 18000, speed: 120, offense: 900, defense: 160, penetration: 20, criticalChance: 10, criticalDamage: 150 });
units["alpha-1"].abilities.push({ skillId: "unique-alpha-summon", kind: "unique", name: "Unmodeled summon", combat: { summon: true } });

const options = {
  teamA: { leaderId: "alpha-1", members: ["alpha-1", "alpha-2", "alpha-3", "alpha-4", "alpha-5"] },
  teamB: { leaderId: "beta-1", members: ["beta-1", "beta-2", "beta-3", "beta-4", "beta-5"] },
  characters,
  synergyModel: { quality: "explicit-ability-data", units },
  iterations: 120,
  seed: "repeatable-test"
};

const first = simulator.simulate(options);
const second = simulator.simulate(options);

assert.deepStrictEqual(first, second, "the same teams and seed should produce the same result");
assert(first.teamAWinPercent > 95, "the substantially stronger synthetic team should be favored");
assert.strictEqual(first.teamAWinPercent + first.teamBWinPercent + first.drawPercent, 100);
assert(first.coverage.unsupportedMechanics.includes("summoned units"), "unsupported summons should be disclosed");
assert(first.coverage.percent < 90, "unsupported mechanics should reduce the explicit-data coverage ceiling");
assert(first.exampleLog.length > 0, "one representative battle should be retained");

assert.throws(
  () => simulator.simulate({ ...options, teamA: { leaderId: "alpha-1", members: ["alpha-1", "alpha-1"] } }),
  /duplicate character/,
  "duplicates must be rejected"
);
assert.throws(
  () => simulator.simulate({ ...options, teamA: { leaderId: "not-on-team", members: options.teamA.members } }),
  /leader must be a member/,
  "a leader outside the team must be rejected"
);

console.log("Battle simulator tests passed.");
