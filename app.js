(() => {
  "use strict";

  const data = window.ForgeData;
  const staticRosterStore = data.staticRosters || { schemaVersion: 1, updatedAt: null, rosters: {} };
  const staticRosters = staticRosterStore.rosters || {};
  const defaultRosterAllyCode = Object.keys(staticRosters)[0] || "";
  const app = document.querySelector("#app");
  const pickerDialog = document.querySelector("#picker-dialog");
  const pickerContent = document.querySelector("#picker-content");
  const drawer = document.querySelector("#detail-drawer");
  const drawerContent = document.querySelector("#drawer-content");
  const drawerScrim = document.querySelector(".drawer-scrim");
  const toastRegion = document.querySelector("#toast-region");
  const EXCLUDED_UNITS_STORAGE_KEY = "swgoh-forge.excluded-units.v1";
  const ACTIVE_ROSTER_STORAGE_KEY = "swgoh-forge.active-roster.v1";

  function readCachedExcludedUnits() {
    try {
      const cached = JSON.parse(window.localStorage.getItem(EXCLUDED_UNITS_STORAGE_KEY) || "[]");
      return Array.isArray(cached) ? cached.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  }

  function readCachedActiveRosterAllyCode() {
    try {
      const allyCode = String(window.localStorage.getItem(ACTIVE_ROSTER_STORAGE_KEY) || "").replace(/[\s-]/g, "");
      if (allyCode && staticRosters[allyCode]) return allyCode;
      if (allyCode) window.localStorage.removeItem(ACTIVE_ROSTER_STORAGE_KEY);
    } catch {
      // The roster can still be loaded manually when browser storage is unavailable.
    }
    return null;
  }

  const cachedActiveRosterAllyCode = readCachedActiveRosterAllyCode();

  const state = {
    section: getSectionFromHash(),
    unitType: "characters",
    gameMode: "gac-5v5",
    objective: "best-overall",
    resultCount: 3,
    resultSort: "overall",
    requiredUnits: ["darth-vader", "mara-jade"],
    excludedUnits: readCachedExcludedUnits(),
    preservedUnits: [],
    leaderId: null,
    capitalShipId: "executor",
    fleetStarters: ["punishing-one", "razor-crest", "hounds-tooth"],
    fleetReinforcements: ["xanadu-blood", "slave-i", "ig-2000", "tie-bomber"],
    counterType: "squad",
    attackerLeaderId: "hera-syndulla",
    attackerMembers: ["captain-rex", "chopper", "kanan-jarrus", "sabine-wren"],
    opponentLeaderId: "jabba",
    opponentMembers: ["krrsantan", "boushh-leia", "skiff-lando", "embo"],
    simulationIterations: 500,
    simulationResult: null,
    opponentCapitalId: "leviathan",
    opponentStarters: ["sith-fighter", "mark-vi-interceptor", "tie-dagger"],
    opponentReinforcements: [],
    mustUse: [],
    counterExcluded: [],
    counterPreserved: [],
    rosterLoaded: Boolean(cachedActiveRosterAllyCode),
    rosterAllyCode: cachedActiveRosterAllyCode || defaultRosterAllyCode,
    activeRosterAllyCode: cachedActiveRosterAllyCode,
    compareRoster: Boolean(cachedActiveRosterAllyCode),
    requirementLevel: "recommended",
    results: { build: false, counter: false, roster: false },
    generatedSquads: null,
    loading: null,
    expandedRecommendations: new Set(["empire-control"]),
    detailTabs: {},
    selectedMission: "territory-battles",
    missionSelections: {},
    rosterOptimizeFor: "balanced",
    rosterTeamCount: 8,
    picker: null,
    pickerQuery: "",
    pickerFaction: "all",
    pickerAlignment: "all",
    pickerRole: "all"
  };

  const pickerConfig = {
    required: { title: "Add required characters", kind: "character", multi: true },
    excluded: { title: "Exclude unavailable characters", kind: "character", multi: true },
    leader: { title: "Lock required leader", kind: "character", multi: false, leadersOnly: true },
    "attacker-leader": { title: "Choose Team A leader", kind: "character", multi: false, leadersOnly: true },
    "attacker-members": { title: "Add Team A characters", kind: "character", multi: true, max: 4 },
    "enemy-leader": { title: "Choose enemy leader", kind: "character", multi: false, leadersOnly: true },
    "enemy-members": { title: "Add enemy units", kind: "character", multi: true, max: 4 },
    "must-use": { title: "Add required attackers", kind: "character", multi: true },
    "counter-excluded": { title: "Choose units not to use", kind: "character", multi: true },
    "counter-preserved": { title: "Preserve units", kind: "character", multi: true },
    capital: { title: "Choose a capital ship", kind: "capital", multi: false },
    starters: { title: "Choose starting ships", kind: "ship", multi: true, max: 3 },
    reinforcements: { title: "Choose reinforcements", kind: "ship", multi: true, max: 4 },
    "enemy-capital": { title: "Choose enemy capital ship", kind: "capital", multi: false },
    "enemy-starters": { title: "Choose enemy starting ships", kind: "ship", multi: true, max: 3 },
    "enemy-reinforcements": { title: "Add enemy reinforcements", kind: "ship", multi: true, max: 4 }
  };

  function createUnitMap(units) {
    const map = new Map();
    units.forEach((unit) => {
      map.set(unit.id, unit);
      if (unit.baseId) map.set(unit.baseId, unit);
      (unit.aliases || []).forEach((alias) => map.set(alias, unit));
    });
    return map;
  }

  const characterMap = createUnitMap(data.characters);
  const shipMap = createUnitMap(data.ships);
  const capitalMap = createUnitMap(data.capitalShips);

  state.excludedUnits = [...new Set(state.excludedUnits.map((id) => characterMap.get(id)?.id).filter(Boolean))];
  state.requiredUnits = state.requiredUnits.filter((id) => !state.excludedUnits.includes(id));
  if (state.leaderId && state.excludedUnits.includes(state.leaderId)) state.leaderId = null;

  function persistExcludedUnits() {
    try {
      if (state.excludedUnits.length) window.localStorage.setItem(EXCLUDED_UNITS_STORAGE_KEY, JSON.stringify(state.excludedUnits));
      else window.localStorage.removeItem(EXCLUDED_UNITS_STORAGE_KEY);
    } catch {
      // Storage can be disabled by the browser; exclusions still work for this session.
    }
  }

  function persistActiveRosterSelection() {
    try {
      if (state.activeRosterAllyCode && staticRosters[state.activeRosterAllyCode]) {
        window.localStorage.setItem(ACTIVE_ROSTER_STORAGE_KEY, state.activeRosterAllyCode);
      } else {
        window.localStorage.removeItem(ACTIVE_ROSTER_STORAGE_KEY);
      }
    } catch {
      // The active roster remains available for this session when storage is disabled.
    }
  }

  function invalidateBuildResults() {
    state.generatedSquads = null;
    state.results.build = false;
  }

  function restoreBuildUnits(ids) {
    const restoring = new Set(ids);
    const next = state.excludedUnits.filter((id) => !restoring.has(id));
    if (next.length === state.excludedUnits.length) return;
    state.excludedUnits = next;
    persistExcludedUnits();
    showToast("Required units were restored to the recommendation pool.");
  }

  function setBuildExclusions(ids, options = {}) {
    state.excludedUnits = [...new Set(ids.map((id) => characterMap.get(id)?.id).filter(Boolean))];
    const excluded = new Set(state.excludedUnits);
    const previousRequiredCount = state.requiredUnits.length;
    state.requiredUnits = state.requiredUnits.filter((id) => !excluded.has(id));
    const removedLeader = state.leaderId && excluded.has(state.leaderId);
    if (removedLeader) state.leaderId = null;
    persistExcludedUnits();
    invalidateBuildResults();
    if (options.announceConflicts !== false && (state.requiredUnits.length !== previousRequiredCount || removedLeader)) {
      showToast("Excluded units were removed from the current requirements.");
    }
  }

  persistExcludedUnits();

  function getSectionFromHash() {
    const section = location.hash.replace("#", "").split("?")[0];
    return ["build", "counter", "missions", "roster"].includes(section) ? section : "build";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function activeRoster() {
    return state.activeRosterAllyCode ? staticRosters[state.activeRosterAllyCode] || null : null;
  }

  function normalizeAllyCode(value) {
    return String(value || "").replace(/[\s-]/g, "");
  }

  function formatAllyCode(value) {
    const allyCode = normalizeAllyCode(value);
    return allyCode.length === 9 ? `${allyCode.slice(0, 3)}-${allyCode.slice(3, 6)}-${allyCode.slice(6)}` : allyCode;
  }

  function formatPower(value) {
    return Number.isFinite(Number(value)) && Number(value) > 0 ? `${(Number(value) / 1e6).toFixed(2)}M` : "—";
  }

  function formatSnapshotDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown update time" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function initials(name) {
    const ignored = new Set(["the", "and", "of", "a"]);
    return name.replace(/[()'&-]/g, " ").split(/\s+/).filter((word) => word && !ignored.has(word.toLowerCase())).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  }

  function unitById(id, kind = "character") {
    if (kind === "ship") return shipMap.get(id);
    if (kind === "capital") return capitalMap.get(id);
    return characterMap.get(id);
  }

  function displayName(unit) {
    return unit?.shortName || unit?.name || "Unknown unit";
  }

  function isGalacticLegend(unit, owned) {
    return Boolean(owned?.galacticLegend || unit?.factions?.includes("Galactic Legend"));
  }

  function hasUnlockedUltimate(unit, owned) {
    if (!isGalacticLegend(unit, owned) || !owned) return false;
    if (owned.ultimateUnlocked !== null && owned.ultimateUnlocked !== undefined) return owned.ultimateUnlocked === true;
    return Number(owned.purchasedAbilityCount || 0) > 0;
  }

  function alignmentFrameClass(unit) {
    if (unit?.alignment === "Light Side") return "alignment-light";
    if (unit?.alignment === "Dark Side") return "alignment-dark";
    return "alignment-neutral";
  }

  function progressionFrameClasses(unit, owned) {
    if (!owned) return "";
    const gear = Number(owned.gear) || 1;
    const endgame = gear >= 13 || Number(owned.relic) > 0;
    const band = endgame
      ? "gear-relic"
      : gear >= 12
        ? "gear-gold"
        : gear >= 7
          ? "gear-purple"
          : gear >= 4
            ? "gear-blue"
            : gear >= 2
              ? "gear-green"
              : "gear-white";
    const legend = endgame && isGalacticLegend(unit, owned) ? " galactic-legend" : "";
    const ultimate = endgame && hasUnlockedUltimate(unit, owned) ? " ultimate-unlocked" : "";
    const relic = Number(owned.relic) > 0 ? " relic-active" : "";
    return ` roster-progress ${band} ${alignmentFrameClass(unit)}${relic}${legend}${ultimate}`;
  }

  function portrait(unit, kind = "character", size = "") {
    if (!unit) return "";
    const shipClass = kind === "character" ? "" : " ship";
    const owned = rosterUnitProgression(unit.id, kind);
    const alignmentClass = owned ? "" : ` ${alignmentFrameClass(unit)}`;
    return `<span class="portrait${shipClass}${size ? ` ${size}` : ""}${alignmentClass}${progressionFrameClasses(unit, owned)}" style="--unit-color:${escapeHtml(unit.color)}">
      <span aria-hidden="true">${initials(unit.name)}</span>
    </span>`;
  }

  function rosterUnitProgression(id, kind) {
    const roster = activeRoster();
    if (!state.rosterLoaded || !roster) return null;
    return kind === "character" ? roster.units?.[id] || null : roster.ships?.[id] || null;
  }

  function catalogAbilities(id, kind) {
    return kind === "character" ? (data.synergyModel?.units?.[id]?.abilities || []) : [];
  }

  function countLabel(value) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? String(Number(value)) : "—";
  }

  function progressionAriaLabel(unit, owned, id, kind) {
    if (!owned) return `View ${unit.name} details`;
    const abilityCount = catalogAbilities(id, kind).length || owned.skillCount || 0;
    const tier = owned.relic > 0 ? `Relic ${owned.relic}` : `Gear ${owned.gear || 0}`;
    const zetas = countLabel(owned.zetaCount) !== "—" ? `${owned.zetaCount} zeta power-ups` : "zeta data unavailable";
    const omicrons = countLabel(owned.omicronCount) !== "—" ? `${owned.omicronCount} omicron power-ups` : "omicron data unavailable";
    const legend = isGalacticLegend(unit, owned) ? `, Galactic Legend${hasUnlockedUltimate(unit, owned) ? " with Ultimate unlocked" : ""}` : "";
    return `View ${unit.name} details. ${owned.stars || 0} stars, level ${owned.level || 0}, ${tier}${legend}, ${abilityCount} abilities, ${zetas}, ${omicrons}`;
  }

  function progressionRingCount(owned) {
    if (!owned) return 0;
    const gear = Math.max(1, Number(owned.gear) || 1);
    if (Number(owned.relic) > 0 || gear >= 13) return 4;
    return Math.max(1, Math.min(4, Math.ceil(gear / 3)));
  }

  function renderLeaderSynergyRing(matchedGroups = [], allGroups = []) {
    if (!allGroups.length) return "";
    const matchedKeys = new Set(matchedGroups.map((group) => group.key));
    const step = 360 / allGroups.length;
    const gap = Math.min(10, Math.max(5, step * 0.08));
    const stops = allGroups.flatMap((group, index) => {
      const start = index * step;
      const end = (index + 1) * step - gap;
      const color = matchedKeys.has(group.key) ? "var(--synergy-active)" : "var(--synergy-inactive)";
      return [`${color} ${start}deg ${end}deg`, `transparent ${end}deg ${(index + 1) * step}deg`];
    }).join(",");
    const matchedLabels = matchedGroups.map((group) => group.label);
    const missedLabels = allGroups.filter((group) => !matchedKeys.has(group.key)).map((group) => group.label);
    const title = `${matchedGroups.length}/${allGroups.length} leader synergy groups matched${matchedLabels.length ? `: ${matchedLabels.join(" + ")}` : ""}${missedLabels.length ? `. Not matched: ${missedLabels.join(" + ")}` : ""}`;
    return `<span class="leader-synergy-ring${matchedGroups.length ? " has-match" : ""}" style="--synergy-segments:conic-gradient(from -90deg,${stops})" title="${escapeHtml(title)}" aria-hidden="true"></span>`;
  }

  function progressionPortrait(unit, id, kind, size = "", owned = rosterUnitProgression(id, kind), leaderGroups = [], allLeaderGroups = []) {
    if (!owned) {
      if (!allLeaderGroups.length) return portrait(unit, kind, size);
      return `<span class="roster-avatar-shell leader-synergy-active">${portrait(unit, kind, size)}${renderLeaderSynergyRing(leaderGroups, allLeaderGroups)}</span>`;
    }
    const tierLabel = owned.relic > 0 ? `R${owned.relic}` : `G${owned.gear || 0}`;
    const tierTitle = owned.relic > 0 ? `Relic level ${owned.relic}` : `Gear level ${owned.gear || 0}`;
    const stars = Math.max(0, Math.min(7, Number(owned.stars) || 0));
    const frameClasses = progressionFrameClasses(unit, owned);
    const ultimateTitle = hasUnlockedUltimate(unit, owned) ? ' title="Galactic Legend · Ultimate unlocked"' : isGalacticLegend(unit, owned) ? ' title="Galactic Legend"' : "";
    const ringCount = kind === "character" ? progressionRingCount(owned) : 0;
    return `<span class="roster-avatar-shell${kind === "character" ? "" : " ship-avatar"}${frameClasses}"${ultimateTitle}>
      ${ringCount ? `<span class="progression-rings ring-count-${ringCount}${Number(owned.relic) > 0 ? " relic-rings" : ""}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>` : ""}
      ${portrait(unit, kind, size)}
      <span class="roster-tier-badge${Number(owned.gear) >= 13 || owned.relic > 0 ? ` endgame ${alignmentFrameClass(unit)}` : ""}" title="${tierTitle}">${tierLabel}</span>
      <span class="roster-level-badge" title="Training level ${owned.level || 0}">L${owned.level || 0}</span>
      <span class="roster-stars" title="${stars} stars" aria-hidden="true"><b>★</b>${stars}</span>
      ${renderLeaderSynergyRing(leaderGroups, allLeaderGroups)}
    </span>`;
  }

  function rosterAvatar(unit, id, kind, size, owned, leaderGroups = [], allLeaderGroups = []) {
    if (!owned) return portrait(unit, kind, size);
    const abilityCount = catalogAbilities(id, kind).length || owned.skillCount || 0;
    return `${progressionPortrait(unit, id, kind, size, owned, leaderGroups, allLeaderGroups)}
    <span class="roster-ability-strip" aria-hidden="true">
      <span title="${abilityCount} abilities">A${abilityCount}</span>
      <span class="zeta" title="${countLabel(owned.zetaCount)} applied zeta power-ups">Z${countLabel(owned.zetaCount)}</span>
      <span class="omicron" title="${countLabel(owned.omicronCount)} applied omicron power-ups">O${countLabel(owned.omicronCount)}</span>
    </span>`;
  }

  function formationUnit(id, options = {}) {
    const kind = options.kind || "character";
    const unit = unitById(id, kind);
    if (!unit) return "";
    const canExclude = options.excludable && kind === "character";
    const owned = rosterUnitProgression(id, kind);
    const leaderGroups = options.leaderGroups || [];
    const allLeaderGroups = options.allLeaderGroups || [];
    const synergyLabel = allLeaderGroups.length ? ` Matches ${leaderGroups.length} of ${allLeaderGroups.length} leader synergy groups${leaderGroups.length ? `: ${leaderGroups.map((group) => group.label).join(" and ")}` : ""}.` : "";
    return `<div class="formation-unit${options.leader ? " leader" : ""}${canExclude ? " excludable" : ""}${owned ? " roster-enhanced" : ""}">
      ${options.leader ? '<span class="crown" aria-label="Leader">♛</span>' : ""}
      <button class="unit-detail-button" type="button" data-unit-id="${id}" data-unit-kind="${kind}" aria-label="${escapeHtml(progressionAriaLabel(unit, owned, id, kind) + synergyLabel)}">
        ${owned ? rosterAvatar(unit, id, kind, options.size || "large", owned, leaderGroups, allLeaderGroups) : progressionPortrait(unit, id, kind, options.size || "large", owned, leaderGroups, allLeaderGroups)}
      </button>
      ${canExclude ? `<button class="result-exclude-button" type="button" data-exclude-result-unit="${id}" aria-label="Exclude ${escapeHtml(unit.name)} from recommendations" title="Exclude from recommendations"><span aria-hidden="true">×</span></button>` : ""}
      <span class="unit-name">${escapeHtml(displayName(unit))}</span>
    </div>`;
  }

  function unitToken(id, options = {}) {
    const kind = options.kind || "character";
    const unit = unitById(id, kind);
    if (!unit) return "";
    const remove = options.removeTarget ? `<button class="remove-token" type="button" data-remove-target="${options.removeTarget}" data-remove-id="${id}" aria-label="Remove ${escapeHtml(unit.name)}">×</button>` : "";
    return `<span class="unit-token${options.leader ? " leader" : ""}">
      ${progressionPortrait(unit, id, kind)}
      <button class="token-name" type="button" data-unit-id="${id}" data-unit-kind="${kind}">${escapeHtml(displayName(unit))}</button>
      ${remove}
    </span>`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value);
  }

  function rosterUnitGp(id, kind = "character") {
    const roster = activeRoster();
    if (!state.rosterLoaded || !roster) return null;
    const owned = kind === "character" ? roster.units?.[id] : roster.ships?.[id];
    if (!owned || owned.gp == null || owned.gp === "") return null;
    return Number.isFinite(Number(owned.gp)) ? Number(owned.gp) : null;
  }

  function renderFormationGp(ids, kind = "character", label = "Team GP") {
    if (!state.rosterLoaded || !activeRoster() || !ids.length) return "";
    const values = ids.map((id) => rosterUnitGp(id, kind));
    const complete = values.every((value) => value !== null);
    const total = complete ? values.reduce((sum, value) => sum + value, 0) : null;
    const title = complete
      ? `${label}: ${formatNumber(total)}`
      : `${label} unavailable because one or more units lack calculated GP. Refresh this Ally Code with the local roster updater.`;
    return `<div class="formation-gp${complete ? "" : " unavailable"}" title="${escapeHtml(title)}"><span>${escapeHtml(label)}</span><strong>${complete ? formatNumber(total) : "—"}</strong></div>`;
  }

  function renderCharacterFormation(ids, options = {}) {
    const leaderId = options.leaderId || null;
    const formationUnits = ids.map((id) => characterMap.get(id)).filter(Boolean);
    const leaderSynergy = leaderId && window.ForgeTeamOptimizer?.leaderSynergyGroups
      ? window.ForgeTeamOptimizer.leaderSynergyGroups(formationUnits, leaderId, data.synergyModel)
      : null;
    const units = ids.map((id) => formationUnit(id, { leader: id === leaderId, excludable: options.excludable, leaderGroups: leaderSynergy?.byUnit?.[id] || [], allLeaderGroups: id === leaderId ? [] : leaderSynergy?.groups || [] })).join("");
    const groupLabels = leaderSynergy?.groups?.map((group) => group.label) || [];
    const synergySummary = leaderSynergy
      ? `<div class="leader-synergy-summary${groupLabels.length ? "" : " unavailable"}"><span class="leader-synergy-swatch" aria-hidden="true"></span><span><strong>${escapeHtml(leaderSynergy.leaderName)}</strong> leader synergy${groupLabels.length ? ` · ${groupLabels.map((label) => escapeHtml(label)).join(" / ")}` : " · no explicit group match"}</span><small>${leaderSynergy.coveredCount}/${leaderSynergy.teammateCount} allies</small></div>`
      : "";
    return `<div class="formation-summary"><div class="formation"${options.ariaLabel ? ` aria-label="${escapeHtml(options.ariaLabel)}"` : ""}>${units}</div>${synergySummary}${renderFormationGp(ids)}</div>`;
  }

  function renderFleetFormation(capitalShipId, starters = [], reinforcements = [], options = {}) {
    const ids = [capitalShipId, ...starters, ...reinforcements].filter(Boolean);
    const reinforcementMarkup = reinforcements.map((id, position) => `${options.numberReinforcements ? `<span class="micro-label">${position + 1}</span>` : ""}${formationUnit(id, { kind: "ship" })}`).join("");
    return `<div class="formation-summary"><div class="fleet-formation"${options.ariaLabel ? ` aria-label="${escapeHtml(options.ariaLabel)}"` : ""}><div class="fleet-group"><span class="fleet-group-label">${escapeHtml(options.capitalLabel || "Capital")}</span>${capitalShipId ? formationUnit(capitalShipId, { kind: "capital", leader: true }) : ""}</div><div class="fleet-group"><span class="fleet-group-label">${escapeHtml(options.startersLabel || "Start")}</span>${starters.map((id) => formationUnit(id, { kind: "ship" })).join("")}</div><div class="fleet-group"><span class="fleet-group-label">${escapeHtml(options.reinforcementsLabel || "Reinforce")}</span>${reinforcementMarkup}</div></div>${renderFormationGp(ids, "ship", "Fleet GP")}</div>`;
  }

  function currentModeLabel() {
    return data.gameModes.find((mode) => mode.id === state.gameMode)?.label || "General";
  }

  function objectiveOptions() {
    return data.objectives.filter((objective) => objective.modes.includes("all") || objective.modes.includes(state.gameMode));
  }

  function optionsMarkup(items, selected, valueKey = "id", labelKey = "label") {
    return items.map((item) => `<option value="${escapeHtml(item[valueKey])}"${item[valueKey] === selected ? " selected" : ""}>${escapeHtml(item[labelKey])}</option>`).join("");
  }

  function segmented(name, entries, selected) {
    return `<div class="segmented" role="group" aria-label="${escapeHtml(name)}">
      ${entries.map((entry) => `<button type="button" class="${entry.id === selected ? "active" : ""}" data-segment="${escapeHtml(name)}" data-value="${entry.id}" aria-pressed="${entry.id === selected}">${escapeHtml(entry.label)}</button>`).join("")}
    </div>`;
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastRegion.append(toast);
    window.setTimeout(() => toast.remove(), 3200);
  }

  function renderCatalogStatus() {
    const metadata = data.catalogMeta || {};
    const counts = metadata.counts || {
      characters: data.characters.length,
      ships: data.ships.length,
      capitalShips: data.capitalShips.length
    };
    const generated = metadata.status === "generated" && metadata.generatedAt;
    const generatedDate = generated ? new Date(metadata.generatedAt) : null;
    const validDate = generatedDate && !Number.isNaN(generatedDate.getTime());
    const timing = validDate
      ? `Generated ${generatedDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
      : "Incomplete sample — run the local updater for the full catalog";
    const totalShips = Number(counts.ships || 0) + Number(counts.capitalShips || 0);
    return `<div class="catalog-status" aria-label="Unit catalog status">
      <span class="catalog-status-dot ${generated ? "current" : "seed"}" aria-hidden="true"></span>
      <span><strong>${escapeHtml(generated ? (metadata.sourceLabel || "Unit catalog") : "Bundled seed catalog (not complete)")}</strong><small>${escapeHtml(timing)} · ${formatNumber(counts.characters || 0)} characters · ${formatNumber(totalShips)} ships</small></span>
    </div>`;
  }

  function render() {
    document.querySelectorAll("[data-nav]").forEach((link) => link.classList.toggle("active", link.dataset.nav === state.section));
    document.querySelector(".primary-nav")?.classList.remove("open");
    document.querySelector(".menu-toggle")?.setAttribute("aria-expanded", "false");
    if (state.section === "counter") app.innerHTML = renderCounter();
    else if (state.section === "missions") app.innerHTML = renderMissions();
    else if (state.section === "roster") app.innerHTML = renderRoster();
    else app.innerHTML = renderBuild();
  }

  function renderHero() {
    return `<section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <div class="eyebrow">Tactical formation intelligence</div>
        <h1 id="hero-title">Build the right formation for the battle.</h1>
        <p>Choose the units you want to use, tell SWGOH Forge where you're fighting, and compare the strongest formations — including the investment and minimum requirements needed to make them work.</p>
        <div class="hero-actions">
          <button class="button" type="button" data-action="scroll-builder">Build a Squad <span aria-hidden="true">→</span></button>
          <button class="button button-secondary" type="button" data-nav="counter">Find a Counter</button>
        </div>
        ${renderCatalogStatus()}
      </div>
      <div class="hero-demo" aria-label="Example recommendation">
        <div class="demo-head"><span class="demo-label">Formation preview</span><span class="demo-badge">Demo data</span></div>
        <div class="demo-flow-label">Required</div>
        <div class="unit-row">${unitToken("darth-vader")}${unitToken("mara-jade")}</div>
        <div class="demo-flow-arrow" aria-hidden="true"></div>
        <div class="demo-flow-label">Recommended</div>
        ${renderCharacterFormation(["emperor-palpatine", "mara-jade", "darth-vader", "grand-admiral-thrawn", "royal-guard"], { leaderId: "emperor-palpatine" })}
        <div class="hero-score"><strong>94</strong><span>Overall formation score<br><small>Prototype recommendation</small></span></div>
      </div>
    </section>`;
  }

  function renderBuild() {
    return `<div class="page-shell">
      ${renderHero()}
      <div class="app-frame build-layout" id="builder">
        ${renderBuildSidebar()}
        <div class="workspace build-workspace">
          <section class="section-hero build-mode-header">
            <div class="eyebrow">Build mode</div>
            <h1>Forge your strongest formation.</h1>
            <p>Lock the pieces that matter, leave the rest open, and explore demo recommendations using the available unit catalog.</p>
          </section>
          ${renderBuildForm()}
          ${state.loading === "build" ? renderForging("formations", "Evaluating 2,481 viable combinations") : state.results.build ? renderBuildResults() : ""}
        </div>
      </div>
    </div>`;
  }

  function renderBuildSidebar() {
    const steps = state.unitType === "characters"
      ? [["01", "Formation type"], ["02", "Battle context"], ["03", "Required units"], ["04", "Required leader"], ["05", "Recommendations"]]
      : [["01", "Formation type"], ["02", "Capital ship"], ["03", "Starting lineup"], ["04", "Reinforcements"], ["05", "Recommendations"]];
    return `<aside class="side-panel build-sequence" aria-label="Build workflow">
      <div class="panel">
        <h2 class="side-title">Build sequence</h2>
        <div class="side-nav">${steps.map(([number, label], index) => `<button type="button" class="${index === 0 ? "active" : ""}" data-scroll-step="${index + 1}"><span class="nav-number">${number}</span><span>${label}</span></button>`).join("")}</div>
        <div class="side-summary"><span class="micro-label">Current brief</span><dl><dt>Formation</dt><dd>${state.unitType === "characters" ? "Squad" : "Fleet"}</dd><dt>Context</dt><dd>${escapeHtml(currentModeLabel())}</dd><dt>Objective</dt><dd>${escapeHtml(data.objectives.find((item) => item.id === state.objective)?.label || "Best overall")}</dd>${state.unitType === "characters" ? `<dt>Sort</dt><dd>${escapeHtml(resultSortLabel())}</dd><dt>Results</dt><dd>Top ${state.resultCount}</dd><dt>Excluded</dt><dd>${state.excludedUnits.length}</dd>` : ""}</dl></div>
      </div>
    </aside>`;
  }

  function renderBuildForm() {
    return `<section class="panel build-panel" data-step="1">
      <div class="panel-heading"><div><span class="step-index">01 / FORMATION</span><h2>What are you building?</h2><p>Squads and fleets use distinct formation rules.</p></div>${segmented("unit-type", [{ id: "characters", label: "Characters" }, { id: "fleets", label: "Fleets" }], state.unitType)}</div>
      ${state.unitType === "characters" ? renderCharacterBuildForm() : renderFleetBuildForm()}
    </section>`;
  }

  function renderCharacterBuildForm() {
    const leader = characterMap.get(state.leaderId);
    return `<div class="form-grid four" data-step="2">
      <div class="field"><label for="game-mode">Battle context</label><select class="select" id="game-mode" data-field="gameMode">${optionsMarkup(data.gameModes, state.gameMode)}</select><p class="field-hint">Context remains attached to every result.</p></div>
      <div class="field"><label for="objective">Optimization objective</label><select class="select" id="objective" data-field="objective">${optionsMarkup(objectiveOptions(), state.objective)}</select><p class="field-hint">Only objectives relevant to this context are shown.</p></div>
      <div class="field"><label for="result-count">Number of results</label><input class="input" id="result-count" type="number" min="1" max="20" step="1" value="${state.resultCount}" list="result-count-presets" data-field="resultCount" inputmode="numeric"><datalist id="result-count-presets"><option value="3"></option><option value="5"></option><option value="10"></option><option value="15"></option><option value="20"></option></datalist><p class="field-hint">Choose any value from 1–20. Common choices: 3, 5, 10, 15, or 20.</p></div>
      <div class="field"><label for="result-sort">Rank formations by</label><select class="select" id="result-sort" data-field="resultSort"><option value="overall"${state.resultSort === "overall" ? " selected" : ""}>Overall synergy · recommended</option><option value="leadership"${state.resultSort === "leadership" ? " selected" : ""}>Leadership coverage</option><option value="cohesion"${state.resultSort === "cohesion" ? " selected" : ""}>Faction cohesion</option><option value="gp"${state.resultSort === "gp" ? " selected" : ""}${state.rosterLoaded ? "" : " disabled"}>Team GP${state.rosterLoaded ? "" : " · load roster"}</option></select><p class="field-hint">The selected ordering is applied to the candidate pool before Top K is taken.</p></div>
    </div>
    <div class="constraint-grid with-exclusions" data-step="3">
      <div class="field"><span class="field-label">Required units</span><div class="selection-zone"><div class="unit-row">${state.requiredUnits.map((id) => unitToken(id, { removeTarget: "required" })).join("")}<button class="add-unit" type="button" data-open-picker="required">＋ Add character</button></div>${state.requiredUnits.length ? "" : '<p class="empty-inline">Start with anyone — or leave the formation open and let Forge recommend the complete squad.</p>'}</div><p class="field-hint">Every selected character must appear in every result.</p></div>
      <div class="field" data-step="4"><span class="field-label">Required leader</span><div class="selection-zone leader-zone">${leader ? `<div class="unit-row">${unitToken(leader.id, { leader: true, removeTarget: "leader" })}</div>` : '<button class="add-unit" type="button" data-open-picker="leader">♛ Lock a leader</button><p class="empty-inline">Leave unlocked and we’ll recommend the strongest leader.</p>'}</div><p class="field-hint">A locked leader automatically becomes required.</p></div>
      <div class="field"><div class="field-label-row"><span class="field-label">Excluded units</span>${state.excludedUnits.length ? '<button type="button" data-action="clear-exclusions">Clear all</button>' : ""}</div><div class="selection-zone exclusion-zone"><div class="unit-row">${state.excludedUnits.map((id) => unitToken(id, { removeTarget: "excluded" })).join("")}<button class="add-unit" type="button" data-open-picker="excluded">⊘ Exclude character</button></div>${state.excludedUnits.length ? "" : '<p class="empty-inline">Add characters you do not own or do not want recommended.</p>'}</div><p class="field-hint">Saved locally in this browser and kept when the form is reset.</p></div>
    </div>
    <div class="panel-actions"><button class="button button-quiet button-small" type="button" data-action="reset-build">Reset</button><button class="button button-wide" type="button" data-action="forge-build">Forge teams <span aria-hidden="true">→</span></button></div>`;
  }

  function renderFleetBuildForm() {
    const capital = capitalMap.get(state.capitalShipId);
    return `<div class="form-grid" data-step="2">
      <div class="field"><label for="fleet-game-mode">Battle context</label><select class="select" id="fleet-game-mode" data-field="gameMode">${optionsMarkup(data.gameModes.filter((mode) => !["gac-3v3", "journey"].includes(mode.id)), state.gameMode)}</select></div>
      <div class="field"><label for="fleet-objective">Optimization objective</label><select class="select" id="fleet-objective" data-field="objective">${optionsMarkup(objectiveOptions(), state.objective)}</select></div>
    </div>
    <div class="fleet-builder-layout" data-step="3">
      <div>
        <div class="fleet-slot-panel"><h3>Capital ship</h3>${capital ? `<div class="unit-row">${unitToken(capital.id, { kind: "capital", leader: true, removeTarget: "capital" })}<button class="add-unit" type="button" data-open-picker="capital">Change</button></div>` : '<button class="add-unit" type="button" data-open-picker="capital">＋ Choose capital ship</button>'}<p class="field-hint">Commander: ${escapeHtml(capital?.commanderName || characterMap.get(capital?.commanderId)?.name || "Not selected")}</p></div>
        <div class="fleet-slot-panel"><h3>Starting ships · ${state.fleetStarters.length}/3</h3><div class="unit-row">${state.fleetStarters.map((id) => unitToken(id, { kind: "ship", removeTarget: "starters" })).join("")}${state.fleetStarters.length < 3 ? '<button class="add-unit" type="button" data-open-picker="starters">＋ Add starter</button>' : ""}</div>${state.fleetStarters.length ? "" : '<p class="empty-inline">Choose up to three ships for the opening lineup.</p>'}</div>
      </div>
      <div class="fleet-slot-panel" data-step="4"><h3>Reinforcement order · ${state.fleetReinforcements.length}/4</h3>${renderReinforcementList(state.fleetReinforcements, "fleet")}${state.fleetReinforcements.length < 4 ? '<button class="add-unit" type="button" data-open-picker="reinforcements">＋ Add reinforcement</button>' : ""}<p class="field-hint">Order is part of the formation and can change the recommendation.</p></div>
    </div>
    ${renderFormationGp([state.capitalShipId, ...state.fleetStarters, ...state.fleetReinforcements].filter(Boolean), "ship", "Selected fleet GP")}
    <div class="panel-actions"><button class="button button-quiet button-small" type="button" data-action="reset-build">Reset</button><button class="button button-wide" type="button" data-action="forge-build">Forge fleets <span aria-hidden="true">→</span></button></div>`;
  }

  function renderReinforcementList(ids, scope) {
    if (!ids.length) return '<div class="empty-state">No reinforcements selected yet.</div>';
    return `<div class="reinforcement-list">${ids.map((id, index) => {
      const unit = shipMap.get(id);
      return `<div class="reinforcement-item"><span class="order">${index + 1}</span>${progressionPortrait(unit, id, "ship")}<button class="name" type="button" data-unit-id="${id}" data-unit-kind="ship">${escapeHtml(displayName(unit))}</button><div class="order-controls"><button type="button" data-order-scope="${scope}" data-order-index="${index}" data-order-direction="up" aria-label="Move ${escapeHtml(unit.name)} up" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-order-scope="${scope}" data-order-index="${index}" data-order-direction="down" aria-label="Move ${escapeHtml(unit.name)} down" ${index === ids.length - 1 ? "disabled" : ""}>↓</button><button type="button" data-remove-target="${scope === "fleet" ? "reinforcements" : "enemy-reinforcements"}" data-remove-id="${id}" aria-label="Remove ${escapeHtml(unit.name)}">×</button></div></div>`;
    }).join("")}</div>`;
  }

  function renderForging(subject, detail) {
    return `<section class="panel forging-state" aria-live="polite"><div><div class="forge-spinner" aria-hidden="true"></div><h3>Forging ${escapeHtml(subject)}...</h3><p>${escapeHtml(detail)}<br>Checking synergy · Comparing investment · Validating turn order</p></div></section>`;
  }

  function renderBuildResults() {
    if (state.unitType === "fleets") return renderFleetResults();
    const recommendations = state.generatedSquads || calculateSquadRecommendations();
    const quality = data.synergyModel?.quality === "explicit-ability-data" ? "Ability relationships" : data.synergyModel?.quality === "localized-kit-text" ? "Localized kit model" : "Tag-only model";
    const resultHeading = recommendations.length
      ? `Top ${recommendations.length} ${recommendations.length === 1 ? "Formation" : "Formations"} · ${resultSortLabel()}`
      : "Synergy Formations";
    return `<section class="results-zone" id="build-results" data-step="5"><div class="results-heading"><div><span class="eyebrow">Forge output</span><h2>${resultHeading}</h2><p>General team cohesion with the selected constraints · not an opponent-specific counter ranking</p></div><span class="context-badge">${escapeHtml(quality)}</span></div>${recommendations.length ? `${renderRankingExplanation()}<div class="results-list">${recommendations.map((rec, index) => renderSquadRecommendation(rec, index)).join("")}</div>` : '<div class="empty-state">No valid squad fits these required, leader, and excluded-unit constraints.</div>'}</section>`;
  }

  function resultSortLabel() {
    return ({ overall: "Overall synergy", leadership: "Leadership", cohesion: "Cohesion", gp: "Team GP" })[state.resultSort] || "Overall synergy";
  }

  function renderRankingExplanation() {
    const descriptions = {
      overall: "Exact composite: 44% leadership + 31% cohesion + 25% modeled mechanics, then game-squad overlap and role balance. Ties use mechanics and pair strength.",
      leadership: "Leadership score descending; ties use exact overall synergy, cohesion, then modeled mechanics.",
      cohesion: "Cohesion score descending; ties use exact overall synergy, leadership, then modeled mechanics.",
      gp: "Complete calculated team GP descending; ties and unavailable GP use exact overall synergy, mechanics, then pair strength."
    };
    return `<div class="ranking-explanation"><span class="ranking-icon" aria-hidden="true">⇅</span><div><strong>Sorted by ${escapeHtml(resultSortLabel())} before Top ${state.resultCount}</strong><p>${escapeHtml(descriptions[state.resultSort] || descriptions.overall)} The optimizer first builds up to 80 high-synergy candidates.</p></div></div>`;
  }

  function calculateSquadRecommendations() {
    const size = state.gameMode === "gac-3v3" ? 3 : 5;
    if (!window.ForgeTeamOptimizer) return [];
    const roster = activeRoster();
    const unitGpById = Object.fromEntries(Object.entries(roster?.units || {}).map(([id, unit]) => [id, unit.gp]));
    return window.ForgeTeamOptimizer.optimize({
      characters: data.characters,
      synergyModel: data.synergyModel,
      size,
      requiredIds: state.requiredUnits,
      excludedIds: state.excludedUnits,
      leaderId: state.leaderId,
      mode: state.gameMode,
      limit: state.resultCount,
      candidateLimit: 80,
      sortBy: state.resultSort,
      unitGpById
    });
  }

  function renderSquadRecommendation(rec, index) {
    const expanded = state.expandedRecommendations.has(rec.id);
    return `<article class="recommendation-card">
      <div class="recommendation-main">
        <div class="rank">#${index + 1}</div>
        ${renderCharacterFormation(rec.members, { leaderId: rec.leaderId, excludable: true, ariaLabel: "Recommended squad" })}
        <div class="metrics-wrap">${renderMetrics(rec)}${rec.model === "synergy" ? `<div class="qualifiers"><span>Basis<strong>Kit relationships</strong></span><span>Target<strong>General</strong></span><span>Simulation<strong>None</strong></span></div>` : `<div class="qualifiers"><span>Investment<strong>${escapeHtml(rec.investment)}</strong></span><span>Mods<strong>${escapeHtml(rec.modDifficulty)}</strong></span><span>RNG<strong>${escapeHtml(rec.rng)}</strong></span></div>`}</div>
        <button class="expand-button" type="button" data-expand-recommendation="${rec.id}" aria-expanded="${expanded}" aria-label="${expanded ? "Collapse" : "Expand"} recommendation details">＋</button>
      </div>
      ${expanded ? renderRecommendationDetails(rec) : ""}
    </article>`;
  }

  function renderMetrics(rec) {
    if (rec.model === "synergy") return `<div class="metrics"><div class="metric${state.resultSort === "overall" ? " primary" : ""}"><strong>${rec.score}</strong><span>Synergy</span></div><div class="metric${state.resultSort === "leadership" ? " primary" : ""}"><strong>${rec.leadership}</strong><span>Leadership</span></div><div class="metric${state.resultSort === "cohesion" ? " primary" : ""}"><strong>${rec.cohesion}</strong><span>Cohesion</span></div></div><div class="ranking-facts"><span>Exact synergy <strong>${Number(rec.exactScore).toFixed(2)}</strong></span><span>Mechanics <strong>${rec.mechanics}</strong></span>${state.resultSort === "gp" ? `<span>Team GP <strong>${rec.teamGpComplete ? formatNumber(rec.teamGp) : "—"}</strong></span>` : ""}</div>`;
    return `<div class="metrics"><div class="metric primary"><strong>${rec.score}</strong><span>Overall</span></div><div class="metric"><strong>${rec.win}</strong><span>Win potential</span></div><div class="metric"><strong>${rec.reliability}</strong><span>Reliability</span></div></div>`;
  }

  function renderRecommendationDetails(rec) {
    if (rec.model === "synergy") {
      return `<div class="recommendation-details"><div class="detail-copy" style="padding-top:18px"><p>${rec.explanations.map((explanation) => escapeHtml(explanation)).join(" ")}</p><span class="micro-label">Modeled mechanics</span><div class="tag-list">${rec.strongFor.length ? rec.strongFor.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("") : '<span class="tag">Shared unit tags</span>'}<span class="tag">No battle simulation</span></div><p class="requirement-note" style="margin-top:15px">This score compares leader coverage, kit relationships, explicit team-up tags, faction cohesion, and role balance. It does not estimate a win rate or account for gear, mods, datacrons, or a specific opponent.</p></div></div>`;
    }
    const tab = state.detailTabs[rec.id] || "why";
    return `<div class="recommendation-details"><div class="detail-tabs" role="tablist" aria-label="Recommendation details"><button class="${tab === "why" ? "active" : ""}" type="button" role="tab" aria-selected="${tab === "why"}" data-rec-tab="why" data-rec-id="${rec.id}">Why this works</button><button class="${tab === "requirements" ? "active" : ""}" type="button" role="tab" aria-selected="${tab === "requirements"}" data-rec-tab="requirements" data-rec-id="${rec.id}">Requirements</button><button class="${tab === "substitutes" ? "active" : ""}" type="button" role="tab" aria-selected="${tab === "substitutes"}" data-rec-tab="substitutes" data-rec-id="${rec.id}">Substitutes</button></div>${tab === "requirements" ? renderCharacterRequirements(rec) : tab === "substitutes" ? renderSubstitutes(rec) : renderWhy(rec)}</div>`;
  }

  function renderWhy(rec) {
    return `<div class="detail-copy"><p>${escapeHtml(rec.why)}</p><span class="micro-label">Strong for</span><div class="tag-list">${rec.strongFor.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}<span class="tag">${escapeHtml(currentModeLabel())} context</span></div></div>`;
  }

  function renderSubstitutes(rec) {
    if (!rec.substitute) return '<div class="empty-state">No substitutes modeled for this formation yet.</div>';
    const outgoing = characterMap.get(rec.substitute.outId);
    const incoming = characterMap.get(rec.substitute.inId);
    return `<div class="substitute-card"><div><span class="micro-label">No ${escapeHtml(displayName(outgoing))}?</span><div class="unit-row" style="margin-top:8px">${unitToken(incoming.id)}</div><p>${escapeHtml(rec.substitute.note)}</p></div><div><span class="micro-label">Projected score</span><div class="projected-score">${rec.substitute.score}</div><span class="demo-badge">Demo data</span></div></div>`;
  }

  function renderCharacterRequirements(rec) {
    const level = state.requirementLevel;
    const requirement = rec.requirements[level];
    return `<div>
      <div class="requirement-toolbar"><div>${segmented("requirement-level", [{ id: "minimum", label: "Minimum" }, { id: "recommended", label: "Recommended" }, { id: "safe", label: "Safe" }], level)}</div><label class="check-label"><input type="checkbox" data-field="compareRoster" ${state.compareRoster ? "checked" : ""}> Compare with my roster</label></div>
      <p class="requirement-note">${escapeHtml(requirement.label)} in <strong>${escapeHtml(currentModeLabel())}</strong>. These are contextual demo targets, not universal unit minimums.</p>
      <div class="requirement-grid">${requirement.units.map((entry) => renderRequirementUnit(entry)).join("")}</div>
      ${renderTurnOrder(requirement)}
    </div>`;
  }

  function renderRequirementUnit(entry) {
    const unit = characterMap.get(entry.id);
    const readiness = getReadiness(entry);
    return `<div class="requirement-unit"><h4><span>${escapeHtml(displayName(unit))}</span>${state.compareRoster ? `<span class="readiness ${readiness.state}">${readiness.icon} ${readiness.label}</span>` : ""}</h4><dl>${entry.metrics.map(([name, value]) => `<dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>${state.compareRoster ? `<div class="roster-comparison">${escapeHtml(readiness.detail)}</div>` : ""}</div>`;
  }

  function getReadiness(entry) {
    const roster = activeRoster();
    if (!state.rosterLoaded || !roster) return { state: "insufficient", icon: "○", label: "No roster", detail: "Load a saved static roster in Roster to compare this target." };
    const owned = roster.units[entry.id];
    if (!owned) return { state: "insufficient", icon: "!", label: "Not owned", detail: "This character is not present in the loaded roster snapshot." };
    let worst = "ready";
    let detail = "All modeled targets are met.";
    entry.metrics.forEach(([metric, target]) => {
      const targetNumber = Number(String(target).match(/[\d,.]+/)?.[0].replaceAll(",", ""));
      if (!targetNumber) return;
      const metricName = metric.toLowerCase();
      const key = metricName.includes("relic") ? "relic" : metricName.includes("gear") ? "gear" : metricName.includes("speed") ? "speed" : metricName.includes("health") ? "health" : metricName.includes("protection") ? "protection" : metricName.includes("offense") ? "offense" : metricName.includes("potency") ? "potency" : metricName.includes("tenacity") ? "tenacity" : null;
      if (!key || owned[key] == null) return;
      const deficit = targetNumber - owned[key];
      if (deficit > 0) {
        const newState = deficit / targetNumber <= 0.05 ? "borderline" : "insufficient";
        if (newState === "insufficient" || worst === "ready") {
          worst = newState;
          detail = `${metric}: ${formatNumber(owned[key])} owned · +${formatNumber(Math.ceil(deficit))} needed.`;
        }
      }
    });
    return worst === "ready"
      ? { state: "ready", icon: "✓", label: "Ready", detail }
      : worst === "borderline"
        ? { state: "borderline", icon: "△", label: "Borderline", detail }
        : { state: "insufficient", icon: "!", label: "Insufficient", detail };
  }

  function renderTurnOrder(requirement) {
    if (!requirement.turnOrder && !requirement.relation) return "";
    const roster = activeRoster();
    const relationReady = state.rosterLoaded && roster && requirement.turnOrder?.every((id) => roster.units[id]);
    return `<div class="turn-order"><div class="turn-order-panel"><h4>Critical turn order</h4><div class="turn-order-list">${(requirement.turnOrder || []).map((id, index) => `${index ? '<span class="arrow">→</span>' : ""}<span>${escapeHtml(displayName(characterMap.get(id)))}</span>`).join("")}</div></div><div class="turn-order-panel"><h4>Relative requirement</h4><div class="turn-order-list"><span>${escapeHtml(requirement.relation || "No relative target")}</span>${state.compareRoster ? `<span class="readiness ${relationReady ? "borderline" : "insufficient"}">${relationReady ? "△ Check enemy speed" : "! Missing data"}</span>` : ""}</div></div></div>`;
  }

  function getMockFleetRecommendations() {
    return data.fleetRecommendations.map((template, index) => {
      if (index > 0 || (!state.capitalShipId && !state.fleetStarters.length)) return template;
      return {
        ...template,
        capitalShipId: state.capitalShipId || template.capitalShipId,
        starters: state.fleetStarters.length ? [...state.fleetStarters] : template.starters,
        reinforcements: state.fleetReinforcements.length ? [...state.fleetReinforcements] : template.reinforcements
      };
    });
  }

  function renderFleetResults() {
    const recommendations = getMockFleetRecommendations();
    return `<section class="results-zone" id="build-results" data-step="5"><div class="results-heading"><div><span class="eyebrow">Forge output</span><h2>Top Recommended Fleets</h2><p>Capital ship, starters, and reinforcement order are evaluated as one formation.</p></div><span class="demo-badge">Demo data</span></div><div class="results-list">${recommendations.map((rec, index) => renderFleetRecommendation(rec, index)).join("")}</div></section>`;
  }

  function renderFleetRecommendation(rec, index) {
    const expanded = state.expandedRecommendations.has(rec.id);
    return `<article class="recommendation-card"><div class="recommendation-main"><div class="rank">#${index + 1}</div>${renderFleetFormation(rec.capitalShipId, rec.starters, rec.reinforcements, { capitalLabel: "Capital ship", numberReinforcements: true, ariaLabel: "Recommended fleet" })}<div class="metrics-wrap">${renderMetrics(rec)}<div class="qualifiers"><span>Investment<strong>${escapeHtml(rec.investment)}</strong></span><span>Formation<strong>Fleet</strong></span><span>RNG<strong>${escapeHtml(rec.rng)}</strong></span></div></div><button class="expand-button" type="button" data-expand-recommendation="${rec.id}" aria-expanded="${expanded}" aria-label="${expanded ? "Collapse" : "Expand"} fleet details">＋</button></div>${expanded ? renderFleetDetails(rec) : ""}</article>`;
  }

  function renderFleetDetails(rec) {
    const tab = state.detailTabs[rec.id] || "why";
    const requirement = rec.requirements[state.requirementLevel];
    return `<div class="recommendation-details"><div class="detail-tabs" role="tablist"><button class="${tab === "why" ? "active" : ""}" type="button" data-rec-tab="why" data-rec-id="${rec.id}">Why this works</button><button class="${tab === "requirements" ? "active" : ""}" type="button" data-rec-tab="requirements" data-rec-id="${rec.id}">Ship & pilot requirements</button></div>${tab === "why" ? `<div class="detail-copy"><p>${escapeHtml(rec.why)}</p><div class="tag-list"><span class="tag">Starter order matters</span><span class="tag">Reinforcement order modeled</span><span class="tag">${escapeHtml(currentModeLabel())}</span></div></div>` : `<div><div class="requirement-toolbar">${segmented("requirement-level", [{ id: "minimum", label: "Minimum" }, { id: "recommended", label: "Recommended" }, { id: "safe", label: "Safe" }], state.requirementLevel)}<label class="check-label"><input type="checkbox" data-field="compareRoster" ${state.compareRoster ? "checked" : ""}> Compare with my roster</label></div><p class="requirement-note">Contextual targets for this fleet formation. Pilot development affects resulting ship stats.</p><div class="requirement-grid"><div class="requirement-unit"><h4>Ship</h4><dl>${requirement.ship.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl></div><div class="requirement-unit"><h4>Pilot</h4><dl>${requirement.pilot.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl><div class="roster-comparison">Bossk <span style="color:var(--teal)">↓</span> Hound's Tooth · pilot stats contribute to ship power.</div></div></div><div class="turn-order"><div class="turn-order-panel"><h4>Critical relationship</h4><div class="turn-order-list">${escapeHtml(requirement.relation)}</div></div><div class="turn-order-panel"><h4>Loaded roster</h4><div class="turn-order-list"><span class="readiness ${state.rosterLoaded ? "ready" : "insufficient"}">${state.rosterLoaded ? "✓ Static ship data loaded" : "○ Load roster to compare"}</span></div></div></div></div>`}</div>`;
  }

  function renderCounter() {
    const isSquad = state.counterType === "squad";
    return `<div class="page-shell compact-top"><div class="app-frame">${renderCounterSidebar()}<div class="workspace"><section class="section-hero"><div class="eyebrow">${isSquad ? "Battle simulator" : "Counter mode"}</div><h1>${isSquad ? "How will these teams match up?" : "What fleet are you fighting?"}</h1><p>${isSquad ? "Compare two character squads with a repeatable local simulation built from the current unit snapshot." : "Define the target first. A generally strong formation is not always the right answer for a specific defense."}</p></section><section class="panel"><div class="panel-heading"><div><span class="step-index">01 / BATTLE TYPE</span><h2>Choose the battlefield</h2></div>${segmented("counter-type", [{ id: "squad", label: "Squad simulation" }, { id: "fleet", label: "Fleet counters" }], state.counterType)}</div>${isSquad ? renderSquadCounterForm() : renderFleetCounterForm()}</section>${state.loading === "counter" ? renderForging(isSquad ? "simulated battles" : "counter routes", isSquad ? `Running ${formatNumber(state.simulationIterations)} seeded matchups` : "Simulating opening sequences") : state.results.counter ? renderCounterResults() : ""}</div></div></div>`;
  }

  function renderCounterSidebar() {
    const isSquad = state.counterType === "squad";
    return `<aside class="side-panel" aria-label="${isSquad ? "Simulation" : "Counter"} workflow"><div class="panel"><h2 class="side-title">${isSquad ? "Simulation sequence" : "Counter sequence"}</h2><div class="side-nav"><button class="active" type="button" data-scroll-step="1"><span class="nav-number">01</span><span>Battle type</span></button><button type="button" data-scroll-step="2"><span class="nav-number">02</span><span>${isSquad ? "Both teams" : "Enemy formation"}</span></button><button type="button" data-scroll-step="3"><span class="nav-number">03</span><span>${isSquad ? "Model settings" : "Constraints"}</span></button><button type="button" data-scroll-step="4"><span class="nav-number">04</span><span>${isSquad ? "Outcome" : "Counter routes"}</span></button></div><div class="side-summary"><span class="micro-label">Battle brief</span><dl><dt>Battle</dt><dd>${isSquad ? "Squad simulation" : "Fleet"}</dd><dt>Context</dt><dd>${escapeHtml(currentModeLabel())}</dd><dt>Data</dt><dd>${isSquad ? "Local model" : "Prototype"}</dd></dl></div></div></aside>`;
  }

  function renderSquadCounterForm() {
    const teamSize = state.gameMode === "gac-3v3" ? 3 : 5;
    const attackerLeader = characterMap.get(state.attackerLeaderId);
    const opponentLeader = characterMap.get(state.opponentLeaderId);
    const attackerComplete = Boolean(attackerLeader) && state.attackerMembers.length === teamSize - 1;
    const opponentComplete = Boolean(opponentLeader) && state.opponentMembers.length === teamSize - 1;
    const renderTeam = (label, leader, members, leaderPicker, membersPicker, tone) => {
      const unitIds = leader ? [leader.id, ...members] : members;
      return `<div class="simulator-team ${tone}"><span class="micro-label">${label}</span><div class="simulator-team-head"><h3>${label === "TEAM A · ATTACK" ? "Attacking squad" : "Defending squad"}</h3><span>${leader ? members.length + 1 : members.length} / ${teamSize}</span></div><div class="unit-row">${leader ? unitToken(leader.id, { leader: true, removeTarget: leaderPicker }) : `<button class="add-unit" type="button" data-open-picker="${leaderPicker}">♛ Choose leader</button>`}${members.map((id) => unitToken(id, { removeTarget: membersPicker })).join("")}${members.length < teamSize - 1 ? `<button class="add-unit" type="button" data-open-picker="${membersPicker}">＋ Add character</button>` : ""}</div>${renderFormationGp(unitIds)}<p class="field-hint">${leader ? `${escapeHtml(displayName(leader))} applies modeled leadership to matching allies.` : "A leader is required for this team."}</p></div>`;
    };
    return `<div class="simulator-teams" data-step="2">${renderTeam("TEAM A · ATTACK", attackerLeader, state.attackerMembers, "attacker-leader", "attacker-members", "attacker")}<div class="versus-marker" aria-hidden="true">VS</div>${renderTeam("TEAM B · DEFENSE", opponentLeader, state.opponentMembers, "enemy-leader", "enemy-members", "defender")}</div>
    <div class="form-grid simulator-settings" data-step="3"><div class="field"><label for="counter-context">Game context</label><select class="select" id="counter-context" data-field="gameMode">${optionsMarkup(data.gameModes.filter((mode) => ["gac-5v5", "gac-3v3", "tw", "arena", "conquest", "tb", "general"].includes(mode.id)), state.gameMode)}</select><p class="field-hint">3v3 changes the required squad size; mode-specific omicrons are disclosed but not yet executed.</p></div><div class="field"><label for="simulation-iterations">Simulation runs</label><select class="select" id="simulation-iterations" data-field="simulationIterations"><option value="200"${state.simulationIterations === 200 ? " selected" : ""}>200 · quick</option><option value="500"${state.simulationIterations === 500 ? " selected" : ""}>500 · balanced</option><option value="1000"${state.simulationIterations === 1000 ? " selected" : ""}>1,000 · smoother estimate</option></select><p class="field-hint">Every run varies targeting, critical hits, control effects, and damage. The matchup seed is repeatable.</p></div></div>
    <div class="model-notice"><strong>Approximate combat model</strong><span>Uses normalized Gear XIII stats and parsed kit mechanics. It does not use player mods, relics, datacrons, or the proprietary game engine.</span></div>
    <div class="panel-actions"><button class="button button-quiet button-small" type="button" data-action="reset-counter">Clear teams</button><button class="button button-wide" type="button" data-action="forge-counter" ${attackerComplete && opponentComplete ? "" : "disabled"}>Simulate matchup <span aria-hidden="true">→</span></button></div>`;
  }

  function renderConstraintBox(title, picker, ids, hint) {
    return `<div class="constraint-box"><h3>${escapeHtml(title)}</h3><div class="unit-row">${ids.map((id) => unitToken(id, { removeTarget: picker })).join("")}<button class="add-unit" type="button" data-open-picker="${picker}" aria-label="${escapeHtml(title)}">＋ Add</button></div><p class="field-hint">${escapeHtml(hint)}</p></div>`;
  }

  function renderFleetCounterForm() {
    const capital = capitalMap.get(state.opponentCapitalId);
    return `<div class="fleet-builder-layout" data-step="2"><div><div class="fleet-slot-panel"><h3>Enemy capital ship</h3>${capital ? `<div class="unit-row">${unitToken(capital.id, { kind: "capital", leader: true, removeTarget: "enemy-capital" })}<button class="add-unit" type="button" data-open-picker="enemy-capital">Change</button></div>` : '<button class="add-unit" type="button" data-open-picker="enemy-capital">＋ Choose capital ship</button>'}</div><div class="fleet-slot-panel"><h3>Enemy starting ships · ${state.opponentStarters.length}/3</h3><div class="unit-row">${state.opponentStarters.map((id) => unitToken(id, { kind: "ship", removeTarget: "enemy-starters" })).join("")}${state.opponentStarters.length < 3 ? '<button class="add-unit" type="button" data-open-picker="enemy-starters">＋ Add starter</button>' : ""}</div></div></div><div class="fleet-slot-panel"><h3>Known enemy reinforcements · optional</h3>${renderReinforcementList(state.opponentReinforcements, "enemy")}${state.opponentReinforcements.length < 4 ? '<button class="add-unit" type="button" data-open-picker="enemy-reinforcements">＋ Add reinforcement</button>' : ""}</div></div>${renderFormationGp([state.opponentCapitalId, ...state.opponentStarters, ...state.opponentReinforcements].filter(Boolean), "ship", "Enemy fleet GP")}<div class="form-grid" style="margin-top:18px"><div class="field"><label for="fleet-counter-context">Game context</label><select class="select" id="fleet-counter-context" data-field="gameMode">${optionsMarkup(data.gameModes.filter((mode) => ["gac-5v5", "tw", "arena", "tb", "general"].includes(mode.id)), state.gameMode)}</select></div><div class="field"><span class="field-label">Formation note</span><p class="field-hint">Unknown enemy reinforcements are modeled as uncertainty.</p></div></div><div class="panel-actions"><button class="button button-quiet button-small" type="button" data-action="reset-counter">Reset</button><button class="button button-wide" type="button" data-action="forge-counter" ${capital ? "" : "disabled"}>Find fleet counters <span aria-hidden="true">→</span></button></div>`;
  }

  function renderCounterResults() {
    if (state.counterType === "squad") return renderSimulationResults();
    const results = getMockCounterRecommendations();
    return `<section class="results-zone" id="counter-results" data-step="4"><div class="results-heading"><div><span class="eyebrow">Counter routes</span><h2>Recommended attacking fleets</h2><p>Performance statistics below are fictional prototype values.</p></div><span class="demo-badge">Demo data</span></div><div class="results-list">${results.map((result, index) => renderCounterResult(result, index)).join("")}</div></section>`;
  }

  function renderSimulationResults() {
    const result = state.simulationResult;
    if (!result) return `<section class="results-zone" id="counter-results" data-step="4"><div class="empty-state">The simulator could not produce a result. Review both teams and try again.</div></section>`;
    const teamA = [state.attackerLeaderId, ...state.attackerMembers];
    const teamB = [state.opponentLeaderId, ...state.opponentMembers];
    const coverageTone = result.coverage.percent >= 60 ? "good" : result.coverage.percent >= 35 ? "partial" : "low";
    const favorite = result.teamAWinPercent === result.teamBWinPercent ? "No clear favorite" : result.teamAWinPercent > result.teamBWinPercent ? "Team A is favored" : "Team B is favored";
    const quality = result.coverage.quality.replaceAll("-", " ");
    return `<section class="results-zone simulation-results" id="counter-results" data-step="4"><div class="results-heading"><div><span class="eyebrow">Modeled outcome</span><h2>${favorite}</h2><p>${formatNumber(result.iterations)} deterministic-seed Monte Carlo runs · these are model estimates, not recorded game wins</p></div><span class="context-badge">${escapeHtml(currentModeLabel())}</span></div>
      <article class="recommendation-card simulation-card"><div class="simulation-matchup"><div class="simulation-side"><span class="micro-label">TEAM A · ATTACK</span><strong>${result.teamAWinPercent}%</strong><span>modeled win rate</span>${renderCharacterFormation(teamA, { leaderId: state.attackerLeaderId })}<small>${result.averageSurvivorsA} average survivors</small></div><div class="simulation-divider"><span>${result.drawPercent}%</span><small>draw</small></div><div class="simulation-side defender"><span class="micro-label">TEAM B · DEFENSE</span><strong>${result.teamBWinPercent}%</strong><span>modeled win rate</span>${renderCharacterFormation(teamB, { leaderId: state.opponentLeaderId })}<small>${result.averageSurvivorsB} average survivors</small></div></div>
      <div class="simulation-insights"><div class="simulation-stat"><span>Average battle</span><strong>${result.averageActions} actions</strong></div><div class="simulation-stat"><span>Usually moves first</span><strong>${escapeHtml(result.mostFrequentFirstAction?.unit || "—")}</strong><small>${result.mostFrequentFirstAction ? `${result.mostFrequentFirstAction.percent}% of runs` : "No result"}</small></div><div class="simulation-stat"><span>Most modeled damage</span><strong>${escapeHtml(result.topDamageUnit || "—")}</strong></div></div>
      <div class="coverage-panel"><div><span class="micro-label">MODEL COVERAGE</span><h3>${result.coverage.percent}% of detected mechanics represented</h3><p>${formatNumber(result.coverage.modeledMechanics)} of ${formatNumber(result.coverage.examinedMechanics)} detected mechanic signals · ${escapeHtml(quality)}</p></div><div class="coverage-meter ${coverageTone}" role="meter" aria-label="Model coverage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${result.coverage.percent}"><span style="width:${result.coverage.percent}%"></span></div></div>
      <div class="simulation-evidence"><div><span class="micro-label">EXAMPLE RUN</span><ol class="battle-log">${result.exampleLog.map((line) => `<li>${escapeHtml(line)}</li>`).join("") || "<li>No actions were recorded.</li>"}</ol></div><div><span class="micro-label">READ BEFORE USING THIS RESULT</span><ul class="limitations">${result.limitations.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></div></div></article></section>`;
  }

  function getMockCounterRecommendations() {
    if (state.counterType === "fleet") return data.counterRecommendations.fleet;
    const prohibited = new Set([...state.counterExcluded, ...state.counterPreserved]);
    const size = state.gameMode === "gac-3v3" ? 3 : 5;
    return data.counterRecommendations.squad.map((template) => {
      let leaderId = template.leaderId;
      if (prohibited.has(leaderId)) {
        leaderId = state.mustUse.find((id) => characterMap.get(id)?.canLead && !prohibited.has(id))
          || data.characters.find((unit) => unit.canLead && !prohibited.has(unit.id) && !state.opponentMembers.includes(unit.id) && unit.id !== state.opponentLeaderId)?.id;
      }
      const ordered = [leaderId, ...state.mustUse, ...template.members, ...data.characters.map((unit) => unit.id)];
      const members = [...new Set(ordered)].filter((id) => id && !prohibited.has(id) && characterMap.has(id)).slice(0, size);
      return { ...template, leaderId, members, success: Math.max(58, template.success - state.mustUse.length * 2 - prohibited.size) };
    });
  }

  function renderCounterResult(result, index) {
    const formation = state.counterType === "squad"
      ? renderCharacterFormation(result.members, { leaderId: result.leaderId })
      : renderFleetFormation(result.capitalShipId, result.starters, result.reinforcements);
    return `<article class="recommendation-card counter-result"><div><span class="micro-label">Route ${index + 1}</span>${formation}</div><div><div class="performance-block"><strong>${result.success}%</strong><div><small>Demo success</small><span>${escapeHtml(result.confidence)} confidence</span><span>${formatNumber(result.sample)} demo battles</span></div></div><div class="tag-list"><span class="tag">${escapeHtml(result.investment)} investment</span><span class="tag">Demo data</span></div></div><div class="strategy-note"><span class="micro-label">Strategy note</span><p>${escapeHtml(result.note)}</p><span class="micro-label">Minimum requirements</span><p>${escapeHtml(result.requirements)}</p></div></article>`;
  }

  function renderMissions() {
    const selected = data.missions[state.selectedMission];
    return `<div class="page-shell"><section class="section-hero"><div class="eyebrow">Structured PvE planning</div><h1>Prepare for the mission, not just the matchup.</h1><p>Explore phase-specific squads, fleet missions, event readiness, feat routes, and score targets.</p></section><section class="missions-grid" aria-label="Mission categories">${data.missionCategories.map((category, index) => `<button type="button" class="mission-card ${category.id === state.selectedMission ? "active" : ""}" data-mission="${category.id}" aria-pressed="${category.id === state.selectedMission}"><span class="mission-icon" aria-hidden="true">0${index + 1}</span><span class="micro-label">${escapeHtml(category.eyebrow)}</span><h3>${escapeHtml(category.name)}</h3><p>${escapeHtml(category.description)}</p></button>`).join("")}</section>${renderMissionDetail(selected)}</div>`;
  }

  function renderMissionDetail(mission) {
    const category = data.missionCategories.find((item) => item.id === state.selectedMission);
    const tier = mission.tierRequirements[state.requirementLevel];
    const formation = mission.type === "fleet"
      ? renderFleetFormation(mission.capitalShipId, mission.starters, mission.reinforcements)
      : renderCharacterFormation(mission.formation, { leaderId: mission.leaderId });
    const rosterMessage = state.compareRoster
      ? state.rosterLoaded
        ? "Static roster comparison is active."
        : "Load a saved static roster to compare readiness."
      : "";
    return `<section class="panel mission-detail">
      <div class="panel-heading"><div><span class="step-index">MISSION PATH</span><h2>${escapeHtml(mission.title)}</h2><p>${escapeHtml(category.description)}</p></div><span class="demo-badge">Demo data</span></div>
      <div class="form-grid">${mission.selectors.map((selector, index) => `<div class="field"><label for="mission-selector-${index}">${escapeHtml(selector.label)}</label><select class="select" id="mission-selector-${index}" data-mission-select="${index}">${selector.options.map((option, optionIndex) => `<option value="${optionIndex}"${state.missionSelections[state.selectedMission]?.[index] === optionIndex ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></div>`).join("")}</div>
      <div class="mission-result"><div><span class="field-label">Recommended formation</span>${formation}</div><div class="mission-notes"><div class="data-row"><span>Reliability</span><strong>${escapeHtml(mission.reliability)}</strong></div><div class="data-row"><span>Investment</span><strong>${escapeHtml(mission.investment)}</strong></div><div class="data-row"><span>Special requirement</span><strong>${escapeHtml(mission.special)}</strong></div></div></div>
      <div class="detail-copy" style="margin-top:20px"><span class="micro-label">Strategy path</span><p>${escapeHtml(mission.note)}</p></div>
      <div class="requirement-toolbar" style="margin-top:17px">${segmented("requirement-level", [{ id: "minimum", label: "Minimum viable" }, { id: "recommended", label: "Recommended" }, { id: "safe", label: "Safe" }], state.requirementLevel)}<label class="check-label"><input type="checkbox" data-field="compareRoster" ${state.compareRoster ? "checked" : ""}> Compare with my roster</label></div>
      <p class="requirement-note">${state.requirementLevel === "minimum" ? "Lower investment, more retries expected." : state.requirementLevel === "safe" ? "Higher investment, designed to reduce opening variance." : "Balanced target for repeatable mission completion."} ${rosterMessage}</p>
      <div class="requirement-grid"><div class="requirement-unit"><h4>Contextual targets</h4><dl>${tier.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl></div><div class="requirement-unit"><h4>Critical turn order</h4><p class="requirement-note">${escapeHtml(mission.turnOrder)}</p><div class="roster-comparison"><span class="readiness ${state.compareRoster && state.rosterLoaded ? "borderline" : "insufficient"}">${state.compareRoster && state.rosterLoaded ? "△ Validate against mission speed" : "○ Demo relationship"}</span></div></div></div>
    </section>`;
  }

  function renderRoster() {
    const emptyMessage = Object.keys(staticRosters).length
      ? "No roster loaded. Enter one of the locally generated Ally Codes above."
      : "No static roster snapshots have been generated yet. Run the local roster updater, then reload this page.";
    return `<div class="page-shell"><section class="section-hero"><div class="eyebrow">Whole-roster planning</div><h1>Make the most of your entire roster.</h1><p>Load a locally generated roster snapshot, compare real unit progression, and keep recommendations limited to characters you own.</p></section>${renderRosterLoader()}${state.rosterLoaded ? renderRosterWorkspace() : `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`}</div>`;
  }

  function renderRosterLoader() {
    const rosterCodes = Object.keys(staticRosters);
    const rosterOptions = rosterCodes.map((allyCode) => `<option value="${allyCode}">${escapeHtml(staticRosters[allyCode].name || allyCode)}</option>`).join("");
    return `<section class="panel"><div class="panel-heading"><div><span class="step-index">01 / ROSTER</span><h2>Load a saved collection</h2><p>Choose an Ally Code already generated into this static build.</p></div><span class="status-badge">${rosterCodes.length} static ${rosterCodes.length === 1 ? "roster" : "rosters"}</span></div><div class="roster-load"><div class="field"><label for="ally-code">Ally Code</label><input class="input" id="ally-code" inputmode="numeric" autocomplete="off" pattern="[1-9]{3}-?[1-9]{3}-?[1-9]{3}" value="${escapeHtml(formatAllyCode(state.rosterAllyCode))}" list="saved-roster-codes" aria-describedby="ally-code-hint"><datalist id="saved-roster-codes">${rosterOptions}</datalist></div><button class="button" type="button" data-action="load-roster">${state.rosterLoaded ? "Load roster" : "Load saved roster"}</button></div><p class="field-hint" id="ally-code-hint">No request is made from your browser. Generate or refresh a snapshot locally with <code>./scripts/update-roster-full.sh ALLY_CODE</code>, then reload the page.</p><div class="model-notice roster-hosting-note"><strong>Static version · no live server</strong><span>SWGOH Forge currently cannot fetch a new Ally Code from the website. Financial support would help fund a hosted server so live roster loading can be offered in the future.</span></div>${state.rosterLoaded ? renderRosterProfile() : ""}</section>`;
  }

  function renderRosterProfile() {
    const roster = activeRoster();
    if (!roster) return "";
    return `<div class="roster-profile"><div class="profile-emblem" aria-hidden="true">${escapeHtml(initials(roster.name))}</div><div><div class="profile-head"><div><h2>${escapeHtml(roster.name)}</h2><p>${escapeHtml(roster.guild)} · ${escapeHtml(formatAllyCode(roster.allyCode))}<br><small>Snapshot updated ${escapeHtml(formatSnapshotDate(roster.updatedAt))}</small></p></div><span class="status-badge">Static snapshot</span></div><div class="profile-stats"><div class="profile-stat"><strong>${formatPower(roster.galacticPower)}</strong><span>Galactic Power</span></div><div class="profile-stat"><strong>${formatNumber(roster.characterCount)}</strong><span>Characters</span></div><div class="profile-stat"><strong>${formatNumber(roster.shipCount)}</strong><span>Ships</span></div><div class="profile-stat"><strong>${formatNumber(roster.relicCount)}</strong><span>Relic units</span></div><div class="profile-stat"><strong>${formatNumber(roster.galacticLegends)}</strong><span>Galactic Legends</span></div></div><div class="roster-badge-legend" aria-label="Roster avatar badge legend"><span><strong>G / R</strong>Gear or relic · rings intensify</span><span><strong>L / ★</strong>Training level / stars</span><span><strong>A</strong>Abilities</span><span><strong>Z</strong>Zetas</span><span><strong>O</strong>Omicrons</span><span><strong class="legend-gold">Gold ring</strong>Galactic Legend / Ultimate glow</span></div></div></div>`;
  }

  function renderRosterWorkspace() {
    return `<section class="panel"><div class="panel-heading"><div><span class="step-index">02 / OPTIMIZE</span><h2>Whole-roster optimization</h2><p>The loaded collection and Build-mode ownership filtering are real; the assignments below remain a curated prototype.</p></div><span class="demo-badge">Demo optimizer</span></div><div class="form-grid three"><div class="field"><label for="roster-mode">Optimize for</label><select class="select" id="roster-mode" data-field="rosterOptimizeFor"><option value="balanced"${state.rosterOptimizeFor === "balanced" ? " selected" : ""}>Balanced</option><option value="gac-offense"${state.rosterOptimizeFor === "gac-offense" ? " selected" : ""}>GAC offense</option><option value="gac-defense"${state.rosterOptimizeFor === "gac-defense" ? " selected" : ""}>GAC defense</option><option value="tw"${state.rosterOptimizeFor === "tw" ? " selected" : ""}>Territory Wars</option><option value="tb"${state.rosterOptimizeFor === "tb" ? " selected" : ""}>Territory Battles</option><option value="fleets"${state.rosterOptimizeFor === "fleets" ? " selected" : ""}>Fleets</option></select></div><div class="field"><label for="team-count">Number of teams</label><select class="select" id="team-count" data-field="rosterTeamCount">${[4, 6, 8].map((count) => `<option value="${count}"${count === Number(state.rosterTeamCount) ? " selected" : ""}>${count}</option>`).join("")}</select></div><div class="field"><span class="field-label">Preserve</span><button class="add-unit" type="button" data-action="coming-later">＋ Lock existing squad</button><p class="field-hint">Squad presets are coming later.</p></div></div><div class="form-grid" style="margin-top:20px"><div class="preferences"><span class="field-label">Preferences</span><label class="check-label"><input type="checkbox" checked disabled> No duplicate characters</label><label class="check-label"><input type="checkbox" checked> Minimize additional relic investment</label><label class="check-label"><input type="checkbox"> Keep Galactic Legends for offense</label><label class="check-label"><input type="checkbox" checked> Include fleets</label></div><div class="selection-zone"><span class="field-label">Method note</span><p class="field-hint">This demonstration assigns curated teams and does not yet optimize directly from the loaded roster. Every assignment below remains demo data.</p></div></div><div class="panel-actions"><button class="button button-quiet button-small" type="button" data-action="reset-roster-results">Clear results</button><button class="button button-wide" type="button" data-action="optimize-roster">Optimize lineup <span aria-hidden="true">→</span></button></div></section>${state.loading === "roster" ? renderForging("lineup", "Resolving non-overlapping assignments") : state.results.roster ? renderOptimizedLineup() : ""}`;
  }

  function renderOptimizedLineup() {
    const teams = data.rosterTeams.slice(0, Number(state.rosterTeamCount));
    const average = Math.round(teams.reduce((sum, team) => sum + team.score, 0) / teams.length);
    const ready = teams.filter((team) => team.status === "ready").length;
    const minor = teams.filter((team) => team.status === "minor").length;
    const major = teams.filter((team) => team.status === "major").length;
    return `<section class="results-zone" id="roster-results"><div class="results-heading"><div><span class="eyebrow">Roster output</span><h2>Optimized Lineup</h2><p>No character appears twice in this curated demo assignment.</p></div><span class="demo-badge">Demo data</span></div><div class="lineup-summary"><div class="summary-card"><strong>${average}</strong><span>Average team score</span></div><div class="summary-card"><strong>${ready} / ${teams.length}</strong><span>Ready now</span></div><div class="summary-card"><strong>${minor}</strong><span>Minor upgrades</span></div><div class="summary-card"><strong>${major}</strong><span>Major upgrades</span></div></div><div class="optimized-grid">${teams.map((team, index) => `<article class="optimized-team"><div class="optimized-team-head"><h3>Team ${index + 1} · ${escapeHtml(team.name)}</h3><strong>${team.score}</strong></div>${renderCharacterFormation(team.members, { leaderId: team.leaderId })}<div class="team-status"><span class="readiness ${team.status === "ready" ? "ready" : team.status === "minor" ? "borderline" : "insufficient"}">${team.status === "ready" ? "✓ Ready now" : team.status === "minor" ? "△ Minor upgrades" : "! Major upgrades"}</span></div></article>`).join("")}</div></section>`;
  }

  function openPicker(target) {
    const config = pickerConfig[target];
    if (!config) return;
    state.picker = target;
    state.pickerQuery = "";
    state.pickerFaction = "all";
    state.pickerAlignment = "all";
    state.pickerRole = "all";
    renderPicker();
    pickerDialog.showModal();
    window.setTimeout(() => pickerDialog.querySelector(".input")?.focus(), 0);
  }

  function getPickerUnits(config) {
    const units = config.kind === "capital" ? data.capitalShips : config.kind === "ship" ? data.ships : data.characters;
    const query = state.pickerQuery.trim().toLowerCase();
    return units.filter((unit) => {
      if (config.leadersOnly && !unit.canLead) return false;
      if (query && !`${unit.name} ${unit.shortName || ""} ${(unit.factions || []).join(" ")} ${unit.pilotName || ""}`.toLowerCase().includes(query)) return false;
      if (state.pickerFaction !== "all" && !(unit.factions || []).includes(state.pickerFaction)) return false;
      if (state.pickerAlignment !== "all" && unit.alignment !== state.pickerAlignment) return false;
      if (state.pickerRole !== "all" && unit.role !== state.pickerRole) return false;
      return true;
    });
  }

  function pickerSelectedIds(target) {
    const mapping = {
      required: state.requiredUnits, excluded: state.excludedUnits, leader: state.leaderId ? [state.leaderId] : [], "attacker-leader": state.attackerLeaderId ? [state.attackerLeaderId] : [], "attacker-members": state.attackerMembers, "enemy-leader": state.opponentLeaderId ? [state.opponentLeaderId] : [], "enemy-members": state.opponentMembers,
      "must-use": state.mustUse, "counter-excluded": state.counterExcluded, "counter-preserved": state.counterPreserved, capital: state.capitalShipId ? [state.capitalShipId] : [], starters: state.fleetStarters,
      reinforcements: state.fleetReinforcements, "enemy-capital": state.opponentCapitalId ? [state.opponentCapitalId] : [], "enemy-starters": state.opponentStarters, "enemy-reinforcements": state.opponentReinforcements
    };
    return mapping[target] || [];
  }

  function renderPicker() {
    const config = pickerConfig[state.picker];
    if (!config) return;
    const units = getPickerUnits(config);
    const selected = pickerSelectedIds(state.picker);
    const displayedMax = state.picker === "required" ? (state.gameMode === "gac-3v3" ? 3 : 5) : ["attacker-members", "enemy-members"].includes(state.picker) ? (state.gameMode === "gac-3v3" ? 2 : 4) : config.max;
    const allUnits = config.kind === "capital" ? data.capitalShips : config.kind === "ship" ? data.ships : data.characters;
    const factions = [...new Set(allUnits.flatMap((unit) => unit.factions || []))].sort();
    const roles = [...new Set(allUnits.map((unit) => unit.role).filter(Boolean))].sort();
    pickerContent.innerHTML = `<div class="picker-head"><div><span class="micro-label">Unit library</span><h2 id="picker-title">${escapeHtml(config.title)}</h2></div><button class="icon-button" type="button" data-action="close-picker" aria-label="Close picker">×</button></div><div class="picker-controls"><input class="input" type="search" data-picker-field="query" value="${escapeHtml(state.pickerQuery)}" placeholder="Search ${config.kind === "character" ? "characters" : "ships"}..." aria-label="Search units"><select class="select" data-picker-field="faction" aria-label="Filter by faction"><option value="all">All factions</option>${factions.map((faction) => `<option value="${escapeHtml(faction)}"${faction === state.pickerFaction ? " selected" : ""}>${escapeHtml(faction)}</option>`).join("")}</select>${config.kind === "character" ? `<select class="select" data-picker-field="alignment" aria-label="Filter by alignment"><option value="all">All alignments</option><option value="Light Side"${state.pickerAlignment === "Light Side" ? " selected" : ""}>Light Side</option><option value="Dark Side"${state.pickerAlignment === "Dark Side" ? " selected" : ""}>Dark Side</option></select>` : ""}${roles.length ? `<select class="select" data-picker-field="role" aria-label="Filter by role"><option value="all">All roles</option>${roles.map((role) => `<option value="${escapeHtml(role)}"${role === state.pickerRole ? " selected" : ""}>${escapeHtml(role)}</option>`).join("")}</select>` : ""}</div><div class="picker-body"><div class="picker-meta"><span>${units.length} units found</span><span>${selected.length}${displayedMax ? ` / ${displayedMax}` : ""} selected</span></div>${units.length ? `<div class="picker-grid" role="listbox" aria-label="Available units" aria-multiselectable="${config.multi}">${units.map((unit) => `<button type="button" class="picker-unit ${selected.includes(unit.id) ? "selected" : ""}" role="option" aria-selected="${selected.includes(unit.id)}" data-picker-unit="${unit.id}">${progressionPortrait(unit, unit.id, config.kind)}<span><span class="picker-name">${escapeHtml(displayName(unit))}</span><span class="picker-info">${escapeHtml((unit.factions || []).slice(0, 2).join(" · ") || unit.commanderName || "Capital ship")}</span></span></button>`).join("")}</div>` : '<div class="empty-state">No units match these filters. Try clearing the search or choosing another faction.</div>'}</div>`;
  }

  function selectPickerUnit(id) {
    const target = state.picker;
    const config = pickerConfig[target];
    const selected = pickerSelectedIds(target);
    const alreadySelected = selected.includes(id);
    if (config.multi) {
      const next = alreadySelected ? selected.filter((selectedId) => selectedId !== id) : [...selected, id];
      const squadLimit = state.gameMode === "gac-3v3" ? 3 : 5;
      const dynamicMax = target === "required" ? squadLimit : ["attacker-members", "enemy-members"].includes(target) ? squadLimit - 1 : config.max;
      if (!alreadySelected && dynamicMax && next.length > dynamicMax) {
        showToast(`Choose up to ${dynamicMax} units for this slot in the current context.`);
        return;
      }
      assignPickerSelection(target, next);
      renderPicker();
    } else {
      if (target === "leader" && !state.requiredUnits.includes(id) && state.requiredUnits.length >= (state.gameMode === "gac-3v3" ? 3 : 5)) {
        showToast("Remove a required unit before locking another leader for this squad size.");
        return;
      }
      assignPickerSelection(target, id ? [id] : []);
      pickerDialog.close();
      render();
    }
  }

  function assignPickerSelection(target, ids) {
    if (target === "required") { state.requiredUnits = ids; restoreBuildUnits(ids); invalidateBuildResults(); }
    else if (target === "excluded") setBuildExclusions(ids);
    else if (target === "leader") { state.leaderId = ids[0] || null; if (state.leaderId && !state.requiredUnits.includes(state.leaderId)) state.requiredUnits.push(state.leaderId); restoreBuildUnits(ids); invalidateBuildResults(); }
    else if (target === "attacker-leader") { state.attackerLeaderId = ids[0] || null; state.attackerMembers = state.attackerMembers.filter((id) => id !== state.attackerLeaderId); }
    else if (target === "attacker-members") state.attackerMembers = ids.filter((id) => id !== state.attackerLeaderId);
    else if (target === "enemy-leader") { state.opponentLeaderId = ids[0] || null; state.opponentMembers = state.opponentMembers.filter((id) => id !== state.opponentLeaderId); }
    else if (target === "enemy-members") state.opponentMembers = ids.filter((id) => id !== state.opponentLeaderId);
    else if (target === "must-use") state.mustUse = ids;
    else if (target === "counter-excluded") state.counterExcluded = ids;
    else if (target === "counter-preserved") state.counterPreserved = ids;
    else if (target === "capital") state.capitalShipId = ids[0] || null;
    else if (target === "starters") state.fleetStarters = ids.filter((id) => !state.fleetReinforcements.includes(id));
    else if (target === "reinforcements") state.fleetReinforcements = ids.filter((id) => !state.fleetStarters.includes(id));
    else if (target === "enemy-capital") state.opponentCapitalId = ids[0] || null;
    else if (target === "enemy-starters") state.opponentStarters = ids.filter((id) => !state.opponentReinforcements.includes(id));
    else if (target === "enemy-reinforcements") state.opponentReinforcements = ids.filter((id) => !state.opponentStarters.includes(id));
    if (["attacker-leader", "attacker-members", "enemy-leader", "enemy-members"].includes(target)) {
      state.simulationResult = null;
      state.results.counter = false;
    }
  }

  function humanizeSkillId(value) {
    return String(value || "Unknown ability")
      .replace(/^(basic|special|unique|leader)skill_/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function abilityKindLabel(kind) {
    return ({ basic: "Basic", special: "Special", unique: "Unique", leader: "Leader" })[kind] || "Ability";
  }

  function omicronModeLabel(value) {
    const numericModes = {
      1: "ALLOMICRON",
      2: "PVEOMICRON",
      3: "PVPOMICRON",
      4: "GUILDRAIDOMICRON",
      5: "TERRITORYSTRIKEOMICRON",
      6: "TERRITORYCOVERTOMICRON",
      7: "TERRITORYBATTLEBOTHOMICRON",
      8: "TERRITORYWAROMICRON",
      9: "TERRITORYTOURNAMENTOMICRON",
      10: "WAROMICRON",
      11: "CONQUESTOMICRON",
      12: "GALACTICCHALLENGEOMICRON",
      13: "PVEEVENTOMICRON",
      14: "TERRITORYTOURNAMENT3OMICRON",
      15: "TERRITORYTOURNAMENT5OMICRON",
      16: "GALACTICCHALLENGE3OMICRON",
      17: "GALACTICCHALLENGE5OMICRON"
    };
    const key = numericModes[Number(value)] || String(value || "").replace(/^OmicronMode_?/i, "").toUpperCase();
    return ({
      ALLOMICRON: "All modes",
      PVEOMICRON: "PvE",
      PVPOMICRON: "PvP",
      GUILDRAIDOMICRON: "Raids",
      TERRITORYSTRIKEOMICRON: "TB combat",
      TERRITORYCOVERTOMICRON: "TB special",
      TERRITORYBATTLEBOTHOMICRON: "Territory Battles",
      TERRITORYWAROMICRON: "Territory Wars",
      TERRITORYTOURNAMENTOMICRON: "Grand Arena",
      TERRITORYTOURNAMENT3OMICRON: "Grand Arena 3v3",
      TERRITORYTOURNAMENT5OMICRON: "Grand Arena 5v5",
      WAROMICRON: "Galactic War",
      CONQUESTOMICRON: "Conquest",
      GALACTICCHALLENGEOMICRON: "Galactic Challenges",
      GALACTICCHALLENGE3OMICRON: "Galactic Challenges 3v3",
      GALACTICCHALLENGE5OMICRON: "Galactic Challenges 5v5",
      PVEEVENTOMICRON: "PvE events"
    })[key] || "Mode-specific";
  }

  function renderAbilityProgression(id, kind, owned) {
    if (!owned) return "";
    const rosterAbilities = Array.isArray(owned.abilities) ? owned.abilities : [];
    const rosterById = new Map(rosterAbilities.map((ability) => [ability.id, ability]));
    const definitions = catalogAbilities(id, kind).map((ability) => ({
      id: ability.skillId,
      kind: ability.kind,
      name: ability.name
    }));
    const definitionIds = new Set(definitions.map((ability) => ability.id));
    rosterAbilities.forEach((ability) => {
      if (!definitionIds.has(ability.id)) definitions.push({ id: ability.id, kind: "other", name: humanizeSkillId(ability.id) });
    });
    const levelsKnown = Array.isArray(owned.abilities);
    const rows = definitions.map((definition) => {
      const progression = rosterById.get(definition.id);
      const level = progression?.level ?? (levelsKnown ? 1 : null);
      const maximum = progression?.maxLevel;
      const levelLabel = level == null ? "Level —" : `Level ${level}${maximum ? ` / ${maximum}` : ""}`;
      const powerUps = [
        progression?.zeta ? '<span class="ability-power-badge zeta">Zeta applied</span>' : "",
        progression?.omicron ? `<span class="ability-power-badge omicron">Omicron · ${escapeHtml(omicronModeLabel(progression.omicronMode))}</span>` : ""
      ].filter(Boolean).join("");
      return `<li class="ability-progress-row">
        <span class="ability-kind-icon ${escapeHtml(definition.kind)}" aria-hidden="true">${escapeHtml(abilityKindLabel(definition.kind)[0])}</span>
        <span class="ability-progress-name"><strong>${escapeHtml(definition.name || humanizeSkillId(definition.id))}</strong><small>${escapeHtml(abilityKindLabel(definition.kind))}</small></span>
        <span class="ability-progress-level">${escapeHtml(levelLabel)}${powerUps ? `<span class="ability-power-ups">${powerUps}</span>` : ""}</span>
      </li>`;
    }).join("");
    const note = owned.abilityProgressionComplete
      ? "Levels and applied power-ups were matched against the live skill definitions used by this roster snapshot."
      : "Refresh this Ally Code with the current roster updater to calculate zeta and omicron details.";
    return `<div class="drawer-section"><h3>Ability progression</h3>
      <div class="ability-power-summary">
        <span><strong>${countLabel(owned.zetaCount)}</strong>Zeta power-ups</span>
        <span><strong>${countLabel(owned.omicronCount)}</strong>Omicron power-ups</span>
        <span><strong>${owned.purchasedAbilityCount ?? "—"}</strong>Purchased abilities</span>
      </div>
      ${rows ? `<ul class="ability-progress-list">${rows}</ul>` : '<p class="requirement-note">No ability progression is available for this unit.</p>'}
      <p class="requirement-note ability-source-note">${escapeHtml(note)}</p>
    </div>`;
  }

  function openDrawer(id, kind) {
    const unit = unitById(id, kind);
    if (!unit) return;
    const roster = activeRoster();
    const owned = kind === "character" ? roster?.units?.[id] : roster?.ships?.[id];
    const pilot = kind === "ship" ? (characterMap.get(unit.pilotId)?.name || unit.pilotName || "Crewless") : null;
    const commander = kind === "capital" ? (characterMap.get(unit.commanderId)?.name || unit.commanderName || "Unknown commander") : null;
    const rosterStatus = state.rosterLoaded
      ? owned
        ? '<span class="readiness ready">✓ In loaded roster</span>'
        : '<span class="readiness insufficient">! Not in loaded roster</span>'
      : '<span class="readiness borderline">○ Catalog data only</span>';
    const statGrid = (entries) => `<div class="stat-grid">${entries.map(([label, value]) => `<div class="stat-box"><span>${escapeHtml(label)}</span><strong>${typeof value === "number" ? formatNumber(value) : escapeHtml(value ?? "—")}</strong></div>`).join("")}</div>`;
    const progression = statGrid([
      ["Galactic Power", owned?.gp != null ? owned.gp : "—"],
      ["Stars", owned ? `${owned.stars}★` : "—"],
      ["Level", owned?.level || "—"],
      ["Gear", owned?.gear || "—"],
      ["Relic", owned?.relic > 0 ? `R${owned.relic}` : "—"],
      ...(isGalacticLegend(unit, owned) ? [["Ultimate", owned ? (hasUnlockedUltimate(unit, owned) ? "Unlocked" : "Not unlocked") : "—"]] : []),
      ["Speed", owned?.speed || "—"],
      ["Health", owned?.health || "—"],
      ["Protection", owned?.protection || "—"],
      ["Abilities", catalogAbilities(id, kind).length || owned?.skillCount || "—"],
      ["Zetas", owned ? countLabel(owned.zetaCount) : "—"],
      ["Omicrons", owned ? countLabel(owned.omicronCount) : "—"],
      [kind === "character" ? "Equipped mods" : "Purchased abilities", kind === "character" ? (owned?.equippedModCount ?? "—") : (owned?.purchasedAbilityCount ?? "—")]
    ]);
    const relationship = kind === "character"
      ? `<div class="drawer-section"><h3>Role & leadership</h3><div class="data-row"><span>Role</span><strong>${escapeHtml(unit.role)}</strong></div><div class="data-row"><span>Can lead</span><strong>${unit.canLead ? "Yes" : "No"}</strong></div></div>`
      : kind === "ship"
        ? `<div class="drawer-section"><h3>Pilot relationship</h3><div class="data-row"><span>Pilot</span><strong>${escapeHtml(pilot)}</strong></div><div class="data-row"><span>Ship role</span><strong>${escapeHtml(unit.role)}</strong></div><p class="requirement-note" style="margin-top:13px">${escapeHtml(pilot)} <span style="color:var(--teal)">↓</span> ${escapeHtml(unit.name)}. Pilot progression affects resulting ship stats.</p></div>`
        : `<div class="drawer-section"><h3>Command</h3><div class="data-row"><span>Commander</span><strong>${escapeHtml(commander)}</strong></div><div class="data-row"><span>Faction</span><strong>${escapeHtml((unit.factions || []).join(", "))}</strong></div></div>`;
    const abilityProgression = renderAbilityProgression(id, kind, owned);
    drawerContent.innerHTML = `<div class="drawer-head"><div><span class="micro-label">Optimization detail</span><h2 id="drawer-title">Unit snapshot</h2></div><button class="icon-button" type="button" data-action="close-drawer" aria-label="Close unit details">×</button></div><div class="drawer-hero">${progressionPortrait(unit, id, kind, "xlarge", owned)}<h3>${escapeHtml(unit.name)}</h3><p>${escapeHtml((unit.factions || []).join(" · "))}${unit.alignment ? ` · ${escapeHtml(unit.alignment)}` : ""}</p>${rosterStatus}</div><div class="drawer-section"><h3>${owned ? "Loaded roster progression" : "Roster progression"}</h3>${progression}</div>${abilityProgression}${relationship}<div class="drawer-section"><p class="requirement-note">Roster progression comes from the loaded static Comlink snapshot. Missing values are shown as unavailable rather than estimated.</p></div>`;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    drawerScrim.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => drawer.querySelector("[data-action='close-drawer']")?.focus(), 0);
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    drawerScrim.hidden = true;
    document.body.style.overflow = "";
  }

  function startForging(scope) {
    state.loading = scope;
    state.results[scope] = false;
    if (scope === "build") state.generatedSquads = null;
    render();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      if (scope === "build" && state.unitType === "characters") state.generatedSquads = calculateSquadRecommendations();
      if (scope === "counter" && state.counterType === "squad") {
        try {
          const teamSize = state.gameMode === "gac-3v3" ? 3 : 5;
          const teamA = [state.attackerLeaderId, ...state.attackerMembers].filter(Boolean).slice(0, teamSize);
          const teamB = [state.opponentLeaderId, ...state.opponentMembers].filter(Boolean).slice(0, teamSize);
          if (!window.ForgeBattleSimulator) throw new Error("The local battle simulator did not load.");
          state.simulationResult = window.ForgeBattleSimulator.simulate({
            teamA: { leaderId: state.attackerLeaderId, members: teamA },
            teamB: { leaderId: state.opponentLeaderId, members: teamB },
            characters: data.characters,
            synergyModel: data.synergyModel,
            iterations: state.simulationIterations,
            seed: `${state.gameMode}|${teamA.join(",")}|vs|${teamB.join(",")}`
          });
        } catch (error) {
          state.simulationResult = null;
          showToast(error.message || "The simulation could not be completed.");
        }
      }
      state.loading = null;
      state.results[scope] = scope !== "counter" || state.counterType !== "squad" || Boolean(state.simulationResult);
      render();
      const target = document.querySelector(`#${scope === "build" ? "build-results" : scope === "counter" ? "counter-results" : "roster-results"}`);
      target?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }, reducedMotion ? 20 : 540);
  }

  function loadStaticRoster() {
    const inputValue = document.querySelector("#ally-code")?.value ?? state.rosterAllyCode;
    const allyCode = normalizeAllyCode(inputValue);
    if (!/^[1-9]{9}$/.test(allyCode)) {
      showToast("Enter a valid nine-digit Ally Code using digits 1 through 9.");
      return;
    }
    const roster = staticRosters[allyCode];
    if (!roster) {
      showToast(`No static snapshot exists for ${formatAllyCode(allyCode)}. Run the local roster updater first.`);
      return;
    }

    state.rosterAllyCode = allyCode;
    state.activeRosterAllyCode = allyCode;
    state.rosterLoaded = true;
    state.compareRoster = true;
    persistActiveRosterSelection();
    state.generatedSquads = null;
    state.simulationResult = null;
    state.results = { build: false, counter: false, roster: false };
    state.loading = null;

    const ownedCharacters = new Set(Object.keys(roster.units || {}));
    const missingCharacters = data.characters.filter((unit) => !ownedCharacters.has(unit.id)).map((unit) => unit.id);
    try {
      window.localStorage.removeItem(EXCLUDED_UNITS_STORAGE_KEY);
    } catch {
      // Loading still works when browser storage is unavailable.
    }
    setBuildExclusions(missingCharacters, { announceConflicts: false });
    render();
    showToast(`${roster.name || formatAllyCode(allyCode)} loaded. ${formatNumber(missingCharacters.length)} unowned characters were excluded.`);
  }

  function resetBuild() {
    state.requiredUnits = [];
    state.leaderId = null;
    state.capitalShipId = null;
    state.fleetStarters = [];
    state.fleetReinforcements = [];
    state.generatedSquads = null;
    state.resultCount = 3;
    state.resultSort = "overall";
    state.results.build = false;
    state.loading = null;
    render();
  }

  function resetCounter() {
    state.attackerLeaderId = null;
    state.attackerMembers = [];
    state.opponentLeaderId = null;
    state.opponentMembers = [];
    state.opponentCapitalId = null;
    state.opponentStarters = [];
    state.opponentReinforcements = [];
    state.mustUse = [];
    state.counterExcluded = [];
    state.counterPreserved = [];
    state.simulationResult = null;
    state.results.counter = false;
    state.loading = null;
    render();
  }

  function removeSelection(target, id) {
    if (target === "required") { state.requiredUnits = state.requiredUnits.filter((unitId) => unitId !== id); if (state.leaderId === id) state.leaderId = null; }
    else if (target === "excluded") setBuildExclusions(state.excludedUnits.filter((unitId) => unitId !== id));
    else if (target === "leader") state.leaderId = null;
    else if (target === "attacker-leader") state.attackerLeaderId = null;
    else if (target === "attacker-members") state.attackerMembers = state.attackerMembers.filter((unitId) => unitId !== id);
    else if (target === "enemy-leader") state.opponentLeaderId = null;
    else if (target === "enemy-members") state.opponentMembers = state.opponentMembers.filter((unitId) => unitId !== id);
    else if (target === "must-use") state.mustUse = state.mustUse.filter((unitId) => unitId !== id);
    else if (target === "counter-excluded") state.counterExcluded = state.counterExcluded.filter((unitId) => unitId !== id);
    else if (target === "counter-preserved") state.counterPreserved = state.counterPreserved.filter((unitId) => unitId !== id);
    else if (target === "capital") state.capitalShipId = null;
    else if (target === "starters") state.fleetStarters = state.fleetStarters.filter((unitId) => unitId !== id);
    else if (target === "reinforcements") state.fleetReinforcements = state.fleetReinforcements.filter((unitId) => unitId !== id);
    else if (target === "enemy-capital") state.opponentCapitalId = null;
    else if (target === "enemy-starters") state.opponentStarters = state.opponentStarters.filter((unitId) => unitId !== id);
    else if (target === "enemy-reinforcements") state.opponentReinforcements = state.opponentReinforcements.filter((unitId) => unitId !== id);
    if (["attacker-leader", "attacker-members", "enemy-leader", "enemy-members"].includes(target)) {
      state.simulationResult = null;
      state.results.counter = false;
    }
    if (["required", "leader"].includes(target)) invalidateBuildResults();
    render();
  }

  function excludeResultUnit(id) {
    const unit = characterMap.get(id);
    if (!unit || state.excludedUnits.includes(unit.id)) return;
    setBuildExclusions([...state.excludedUnits, unit.id], { announceConflicts: false });
    state.generatedSquads = calculateSquadRecommendations();
    state.results.build = true;
    render();
    showToast(`${displayName(unit)} was excluded. Recommendations updated.`);
  }

  function changeSection(section) {
    if (!["build", "counter", "missions", "roster"].includes(section)) return;
    state.section = section;
    if (location.hash !== `#${section}`) history.pushState(null, "", `#${section}`);
    render();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  document.addEventListener("click", (event) => {
    const resultExcludeButton = event.target.closest("[data-exclude-result-unit]");
    if (resultExcludeButton) {
      excludeResultUnit(resultExcludeButton.dataset.excludeResultUnit);
      return;
    }

    const nav = event.target.closest("[data-nav]");
    if (nav) {
      event.preventDefault();
      changeSection(nav.dataset.nav);
      return;
    }

    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "scroll-builder") document.querySelector("#builder")?.scrollIntoView({ behavior: "smooth" });
    else if (action === "show-community-note") showToast("Unofficial fan project — not affiliated with EA, Lucasfilm, or Disney.");
    else if (action === "close-picker") pickerDialog.close();
    else if (action === "close-drawer") closeDrawer();
    else if (action === "forge-build") startForging("build");
    else if (action === "forge-counter") startForging("counter");
    else if (action === "reset-build") resetBuild();
    else if (action === "clear-exclusions") { setBuildExclusions([]); render(); showToast("Cached unit exclusions cleared."); }
    else if (action === "reset-counter") resetCounter();
    else if (action === "load-roster") loadStaticRoster();
    else if (action === "optimize-roster") startForging("roster");
    else if (action === "reset-roster-results") { state.results.roster = false; state.loading = null; render(); }
    else if (action === "coming-later") showToast("Existing squad presets are coming later. Demo optimization remains available.");

    const menu = event.target.closest(".menu-toggle");
    if (menu) {
      const navElement = document.querySelector(".primary-nav");
      const open = navElement.classList.toggle("open");
      menu.setAttribute("aria-expanded", String(open));
    }

    const segment = event.target.closest("[data-segment]");
    if (segment) {
      const name = segment.dataset.segment;
      const value = segment.dataset.value;
      if (name === "unit-type") { state.unitType = value; state.results.build = false; }
      else if (name === "counter-type") { state.counterType = value; state.results.counter = false; }
      else if (name === "requirement-level") state.requirementLevel = value;
      render();
    }

    const pickerButton = event.target.closest("[data-open-picker]");
    if (pickerButton) openPicker(pickerButton.dataset.openPicker);

    const pickerUnit = event.target.closest("[data-picker-unit]");
    if (pickerUnit) selectPickerUnit(pickerUnit.dataset.pickerUnit);

    const removeButton = event.target.closest("[data-remove-target]");
    if (removeButton) removeSelection(removeButton.dataset.removeTarget, removeButton.dataset.removeId);

    const unitButton = event.target.closest("[data-unit-id]");
    if (unitButton && !event.target.closest("[data-remove-target]")) openDrawer(unitButton.dataset.unitId, unitButton.dataset.unitKind || "character");

    const expandButton = event.target.closest("[data-expand-recommendation]");
    if (expandButton) {
      const id = expandButton.dataset.expandRecommendation;
      state.expandedRecommendations.has(id) ? state.expandedRecommendations.delete(id) : state.expandedRecommendations.add(id);
      render();
    }

    const tab = event.target.closest("[data-rec-tab]");
    if (tab) { state.detailTabs[tab.dataset.recId] = tab.dataset.recTab; render(); }

    const mission = event.target.closest("[data-mission]");
    if (mission) { state.selectedMission = mission.dataset.mission; render(); document.querySelector(".mission-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }); }

    const scrollStep = event.target.closest("[data-scroll-step]");
    if (scrollStep) document.querySelector(`[data-step="${scrollStep.dataset.scrollStep}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });

    const order = event.target.closest("[data-order-index]");
    if (order && !order.disabled) {
      const list = order.dataset.orderScope === "fleet" ? state.fleetReinforcements : state.opponentReinforcements;
      const from = Number(order.dataset.orderIndex);
      const to = order.dataset.orderDirection === "up" ? from - 1 : from + 1;
      [list[from], list[to]] = [list[to], list[from]];
      render();
    }
  });

  document.addEventListener("change", (event) => {
    const field = event.target.dataset.field;
    if (field) {
      if (field === "compareRoster") state.compareRoster = event.target.checked;
      else if (["rosterTeamCount", "simulationIterations"].includes(field)) state[field] = Number(event.target.value);
      else if (field === "resultCount") {
        const parsed = Number.parseInt(event.target.value, 10);
        state.resultCount = Math.max(1, Math.min(20, Number.isFinite(parsed) ? parsed : 3));
        if (state.results.build && state.unitType === "characters") state.generatedSquads = calculateSquadRecommendations();
      }
      else if (field === "resultSort") {
        state.resultSort = event.target.value;
        if (state.results.build && state.unitType === "characters") state.generatedSquads = calculateSquadRecommendations();
      }
      else state[field] = event.target.value;
      if (field === "gameMode") {
        if (!objectiveOptions().some((item) => item.id === state.objective)) state.objective = "best-overall";
        const memberLimit = state.gameMode === "gac-3v3" ? 2 : 4;
        state.attackerMembers = state.attackerMembers.slice(0, memberLimit);
        state.opponentMembers = state.opponentMembers.slice(0, memberLimit);
        state.simulationResult = null;
        state.results.counter = false;
      }
      if (field === "simulationIterations") {
        state.simulationResult = null;
        state.results.counter = false;
      }
      render();
    }
    const pickerField = event.target.dataset.pickerField;
    if (pickerField && pickerField !== "query") {
      state[`picker${pickerField[0].toUpperCase()}${pickerField.slice(1)}`] = event.target.value;
      renderPicker();
    }
    if (event.target.dataset.missionSelect != null) {
      state.missionSelections[state.selectedMission] = state.missionSelections[state.selectedMission] || {};
      state.missionSelections[state.selectedMission][Number(event.target.dataset.missionSelect)] = Number(event.target.value);
      showToast("Mission path updated with local demo criteria.");
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.dataset.pickerField === "query") {
      const position = event.target.selectionStart;
      state.pickerQuery = event.target.value;
      renderPicker();
      const input = pickerDialog.querySelector("[data-picker-field='query']");
      input?.focus();
      input?.setSelectionRange(position, position);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
    if (pickerDialog.open && ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key)) {
      const units = [...pickerDialog.querySelectorAll("[data-picker-unit]")];
      const index = units.indexOf(document.activeElement);
      if (index >= 0) {
        event.preventDefault();
        const columns = window.innerWidth <= 650 ? 2 : window.innerWidth <= 900 ? 3 : window.innerWidth <= 1120 ? 4 : 5;
        const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? columns : -columns;
        units[Math.max(0, Math.min(units.length - 1, index + delta))]?.focus();
      }
    }
  });

  pickerDialog.addEventListener("click", (event) => {
    if (event.target === pickerDialog) pickerDialog.close();
  });
  pickerDialog.addEventListener("close", () => { state.picker = null; render(); });
  window.addEventListener("hashchange", () => { state.section = getSectionFromHash(); render(); });

  render();
})();
