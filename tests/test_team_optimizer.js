"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const optimizer = require("../team-optimizer.js");

const repositoryRoot = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);
for (const filename of ["data/characters.js", "data/synergies.js"]) {
  vm.runInContext(fs.readFileSync(path.join(repositoryRoot, filename), "utf8"), context, { filename });
}

const data = context.window.ForgeData;
const phoenix = optimizer.optimize({
  characters: data.characters,
  synergyModel: data.synergyModel,
  size: 5,
  requiredIds: ["hera-syndulla"],
  leaderId: "hera-syndulla",
  limit: 2
});

assert(phoenix.length > 0, "expected a valid Hera-led squad");
assert(phoenix[0].members.includes("captain-rex"), "Captain Rex's Phoenix-wide unique should be selected");
assert(phoenix[0].leadership >= 95, "Hera's leadership should strongly cover the other four Phoenix units");
for (const unitId of phoenix[0].members) {
  assert(
    data.synergyModel.units[unitId].categories.includes("affiliation_phoenix"),
    `expected ${unitId} to have the Phoenix affiliation`
  );
}
assert(
  phoenix[0].explanations.some((text) => text.includes("Rise Together") && text.includes("4/4")),
  "the result should explain leader coverage"
);
assert(
  phoenix[0].explanations.some((text) => text.includes("The Lost Commander") && text.includes("4 teammates")),
  "the result should explain Captain Rex's team-wide contribution"
);

const expandedPhoenix = optimizer.optimize({
  characters: data.characters,
  synergyModel: data.synergyModel,
  size: 5,
  requiredIds: ["hera-syndulla"],
  leaderId: "hera-syndulla",
  limit: 20
});
assert.strictEqual(expandedPhoenix.length, 20, "a locked leader should support up to 20 results");
assert.strictEqual(
  new Set(expandedPhoenix.map((result) => [...result.members].sort().join("|"))).size,
  20,
  "expanded results should be distinct squads"
);

const withoutRex = optimizer.optimize({
  characters: data.characters,
  synergyModel: data.synergyModel,
  size: 5,
  requiredIds: ["hera-syndulla"],
  leaderId: "hera-syndulla",
  excludedIds: ["captain-rex"],
  limit: 20
});
assert(withoutRex.length > 0, "excluding one unit should still leave valid formations");
assert(
  withoutRex.every((result) => !result.members.includes("captain-rex")),
  "an excluded unit must never appear in recommendations"
);

const revanIds = ["jedi-knight-revan", "bastila-shan", "jolee-bindo", "grand-master-yoda", "general-kenobi"];
const revanSynergy = optimizer.leaderSynergyGroups(
  revanIds.map((id) => data.characters.find((unit) => unit.id === id)),
  "jedi-knight-revan",
  data.synergyModel
);
const labelsFor = (unitId) => revanSynergy.byUnit[unitId].map((group) => group.label).sort();
assert.deepStrictEqual(labelsFor("bastila-shan"), ["Jedi", "Old Republic"]);
assert.deepStrictEqual(labelsFor("jolee-bindo"), ["Jedi", "Old Republic"]);
assert.deepStrictEqual(labelsFor("grand-master-yoda"), ["Jedi"]);
assert.deepStrictEqual(labelsFor("general-kenobi"), ["Jedi"]);
assert.strictEqual(revanSynergy.coveredCount, 4, "Revan should cover every ally in this formation");
assert.deepStrictEqual(revanSynergy.groups.map((group) => group.label).sort(), ["Jedi", "Old Republic"]);

const gideonWithRey = optimizer.evaluateTeam(
  ["moff-gideon", "rey", "snowtrooper-commander", "snowtrooper", "scout-trooper"].map((id) => data.characters.find((unit) => unit.id === id)),
  "moff-gideon",
  data.synergyModel
);
assert(
  gideonWithRey.leadership < 100,
  "Rey's Attacker role must not bypass Moff Gideon's Dark Side / Imperial Trooper leader affinities"
);
const reyRecommendations = optimizer.optimize({
  characters: data.characters,
  synergyModel: data.synergyModel,
  size: 5,
  requiredIds: ["rey"],
  limit: 20,
  candidateLimit: 80
});
assert(
  reyRecommendations.every((result) => result.leaderId !== "moff-gideon"),
  "Moff Gideon must not rank as a sensible leader for required Light Side Rey"
);

const gpWithLockedRey = Object.fromEntries(data.characters.map((unit) => [unit.id, unit.id === "rey" ? 0 : 1_000]));
const lockedReyResult = optimizer.optimize({
  characters: data.characters,
  synergyModel: data.synergyModel,
  size: 5,
  requiredIds: ["rey"],
  limit: 1,
  candidateLimit: 20,
  sortBy: "gp",
  unitGpById: gpWithLockedRey
})[0];
assert(lockedReyResult.teamGpComplete, "an unactivated required unit at 0 GP must still produce a complete team total");
assert.strictEqual(lockedReyResult.teamGp, 4_000, "the locked unit must contribute 0 while the four activated allies contribute GP");

const cohesionPool = optimizer.optimize({
  characters: data.characters,
  synergyModel: data.synergyModel,
  size: 5,
  requiredIds: ["hera-syndulla"],
  leaderId: "hera-syndulla",
  limit: 20,
  candidateLimit: 80,
  sortBy: "cohesion"
});
const cohesionTopThree = optimizer.optimize({
  characters: data.characters,
  synergyModel: data.synergyModel,
  size: 5,
  requiredIds: ["hera-syndulla"],
  leaderId: "hera-syndulla",
  limit: 3,
  candidateLimit: 80,
  sortBy: "cohesion"
});
assert(cohesionPool.every((result, index) => index === 0 || cohesionPool[index - 1].cohesion >= result.cohesion), "cohesion sorting should be descending");
assert.deepStrictEqual(
  cohesionTopThree.map((result) => result.members.join("|")),
  cohesionPool.slice(0, 3).map((result) => result.members.join("|")),
  "sorting must happen before the Top K slice"
);

const unitGpById = Object.fromEntries(data.characters.map((unit, index) => [unit.id, (index + 1) * 1000]));
const gpRanked = optimizer.optimize({
  characters: data.characters,
  synergyModel: data.synergyModel,
  size: 5,
  requiredIds: ["hera-syndulla"],
  leaderId: "hera-syndulla",
  limit: 10,
  candidateLimit: 80,
  sortBy: "gp",
  unitGpById
});
assert(gpRanked.every((result) => result.teamGpComplete), "GP sorting should report complete totals when every unit has GP");
assert(gpRanked.every((result, index) => index === 0 || gpRanked[index - 1].teamGp >= result.teamGp), "GP sorting should be descending");

console.log("Team optimizer tests passed.");
