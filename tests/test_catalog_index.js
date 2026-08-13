"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createUnitMap, createRosterGpMap } = require("../catalog-index.js");

const repositoryRoot = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(repositoryRoot, "data/characters.js"), "utf8"), context, { filename: "data/characters.js" });

const characters = context.window.ForgeData.characters;
const characterMap = createUnitMap(characters);

for (const character of characters) {
  assert.strictEqual(characterMap.get(character.id), character, `canonical ID ${character.id} must resolve to itself`);
}

assert.strictEqual(characterMap.get("rey").id, "rey", "Galactic Legend Rey's canonical ID must not be overwritten by a legacy alias");
assert.strictEqual(characterMap.get("REY").id, "rey-scavenger", "Rey (Scavenger)'s base ID must remain available");
assert.strictEqual(characterMap.get("glrey").id, "rey", "Galactic Legend Rey's unambiguous alias must remain available");
assert.strictEqual(characterMap.get("maul").id, "maul", "Maul's canonical ID must not resolve to Darth Maul");

const gpMap = createRosterGpMap(
  [{ id: "rey" }, { id: "finn" }, { id: "poe-dameron" }],
  { finn: { gp: 23_456 }, "poe-dameron": { gp: null } }
);
assert.strictEqual(gpMap.rey, 0, "an unactivated catalog unit must contribute 0 GP");
assert.strictEqual(gpMap.finn, 23_456, "an activated unit must retain its calculated GP");
assert.strictEqual(gpMap["poe-dameron"], null, "an activated unit with legacy missing GP must remain unknown");

console.log("Catalog identity tests passed.");
