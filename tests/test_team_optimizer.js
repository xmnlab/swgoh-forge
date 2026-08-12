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

console.log("Team optimizer tests passed.");
