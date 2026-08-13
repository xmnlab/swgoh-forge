(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ForgeCatalogIndex = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function createUnitMap(units) {
    const map = new Map();

    // Canonical IDs are application state and must never be reinterpreted as
    // another unit's legacy alias (for example: Rey and Rey (Scavenger)).
    units.forEach((unit) => map.set(unit.id, unit));

    units.forEach((unit) => {
      if (unit.baseId && !map.has(unit.baseId)) map.set(unit.baseId, unit);
      (unit.aliases || []).forEach((alias) => {
        if (!map.has(alias)) map.set(alias, unit);
      });
    });

    return map;
  }

  function createRosterGpMap(units, rosterUnits) {
    const progression = rosterUnits || {};
    return Object.fromEntries((units || []).map((unit) => {
      const owned = progression[unit.id];
      // A catalog unit absent from a loaded roster is not activated and has 0
      // GP. An activated unit whose old snapshot lacks GP remains unknown.
      return [unit.id, owned ? owned.gp : 0];
    }));
  }

  return { createUnitMap, createRosterGpMap };
});
