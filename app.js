(() => {
  "use strict";

  const data = window.ForgeData;
  const app = document.querySelector("#app");
  const pickerDialog = document.querySelector("#picker-dialog");
  const pickerContent = document.querySelector("#picker-content");
  const drawer = document.querySelector("#detail-drawer");
  const drawerContent = document.querySelector("#drawer-content");
  const drawerScrim = document.querySelector(".drawer-scrim");
  const toastRegion = document.querySelector("#toast-region");

  const state = {
    section: getSectionFromHash(),
    unitType: "characters",
    gameMode: "gac-5v5",
    objective: "best-overall",
    requiredUnits: ["darth-vader", "mara-jade"],
    excludedUnits: [],
    preservedUnits: [],
    leaderId: null,
    capitalShipId: "executor",
    fleetStarters: ["punishing-one", "razor-crest", "hounds-tooth"],
    fleetReinforcements: ["xanadu-blood", "slave-i", "ig-2000", "tie-bomber"],
    counterType: "squad",
    opponentLeaderId: "jabba",
    opponentMembers: ["krrsantan", "boushh-leia", "skiff-lando", "embo"],
    opponentCapitalId: "leviathan",
    opponentStarters: ["sith-fighter", "mark-vi-interceptor", "tie-dagger"],
    opponentReinforcements: [],
    mustUse: [],
    counterExcluded: [],
    counterPreserved: [],
    rosterLoaded: false,
    compareRoster: false,
    requirementLevel: "recommended",
    results: { build: false, counter: false, roster: false },
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
    leader: { title: "Lock required leader", kind: "character", multi: false, leadersOnly: true },
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

  function portrait(unit, kind = "character", size = "", alt = "") {
    if (!unit) return "";
    const shipClass = kind === "character" ? "" : " ship";
    return `<span class="portrait${shipClass}${size ? ` ${size}` : ""}" style="--unit-color:${escapeHtml(unit.color)}">
      <span aria-hidden="true">${initials(unit.name)}</span>
      <img class="unit-image" src="${escapeHtml(unit.image)}" alt="${escapeHtml(alt)}">
    </span>`;
  }

  function formationUnit(id, options = {}) {
    const kind = options.kind || "character";
    const unit = unitById(id, kind);
    if (!unit) return "";
    return `<div class="formation-unit${options.leader ? " leader" : ""}">
      ${options.leader ? '<span class="crown" aria-label="Leader">♛</span>' : ""}
      <button type="button" data-unit-id="${id}" data-unit-kind="${kind}" aria-label="View ${escapeHtml(unit.name)} details">
        ${portrait(unit, kind, options.size || "large", "")}
      </button>
      <span class="unit-name">${escapeHtml(displayName(unit))}</span>
    </div>`;
  }

  function unitToken(id, options = {}) {
    const kind = options.kind || "character";
    const unit = unitById(id, kind);
    if (!unit) return "";
    const remove = options.removeTarget ? `<button class="remove-token" type="button" data-remove-target="${options.removeTarget}" data-remove-id="${id}" aria-label="Remove ${escapeHtml(unit.name)}">×</button>` : "";
    return `<span class="unit-token${options.leader ? " leader" : ""}">
      ${portrait(unit, kind, "", "")}
      <button class="token-name" type="button" data-unit-id="${id}" data-unit-kind="${kind}">${escapeHtml(displayName(unit))}</button>
      ${remove}
    </span>`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value);
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
      : "Run the local updater for current game data";
    const totalShips = Number(counts.ships || 0) + Number(counts.capitalShips || 0);
    return `<div class="catalog-status" aria-label="Unit catalog status">
      <span class="catalog-status-dot ${generated ? "current" : "seed"}" aria-hidden="true"></span>
      <span><strong>${escapeHtml(metadata.sourceLabel || "Unit catalog")}</strong><small>${escapeHtml(timing)} · ${formatNumber(counts.characters || 0)} characters · ${formatNumber(totalShips)} ships</small></span>
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
        <div class="formation">${["emperor-palpatine", "mara-jade", "darth-vader", "grand-admiral-thrawn", "royal-guard"].map((id, index) => formationUnit(id, { leader: index === 0 })).join("")}</div>
        <div class="hero-score"><strong>94</strong><span>Overall formation score<br><small>Prototype recommendation</small></span></div>
      </div>
    </section>`;
  }

  function renderBuild() {
    return `<div class="page-shell">
      ${renderHero()}
      <div class="app-frame" id="builder">
        ${renderBuildSidebar()}
        <div class="workspace">
          <section class="section-hero">
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
    return `<aside class="side-panel" aria-label="Build workflow">
      <div class="panel">
        <h2 class="side-title">Build sequence</h2>
        <div class="side-nav">${steps.map(([number, label], index) => `<button type="button" class="${index === 0 ? "active" : ""}" data-scroll-step="${index + 1}"><span class="nav-number">${number}</span><span>${label}</span></button>`).join("")}</div>
        <div class="side-summary"><span class="micro-label">Current brief</span><dl><dt>Formation</dt><dd>${state.unitType === "characters" ? "Squad" : "Fleet"}</dd><dt>Context</dt><dd>${escapeHtml(currentModeLabel())}</dd><dt>Objective</dt><dd>${escapeHtml(data.objectives.find((item) => item.id === state.objective)?.label || "Best overall")}</dd></dl></div>
      </div>
    </aside>`;
  }

  function renderBuildForm() {
    return `<section class="panel" data-step="1">
      <div class="panel-heading"><div><span class="step-index">01 / FORMATION</span><h2>What are you building?</h2><p>Squads and fleets use distinct formation rules.</p></div>${segmented("unit-type", [{ id: "characters", label: "Characters" }, { id: "fleets", label: "Fleets" }], state.unitType)}</div>
      ${state.unitType === "characters" ? renderCharacterBuildForm() : renderFleetBuildForm()}
    </section>`;
  }

  function renderCharacterBuildForm() {
    const leader = characterMap.get(state.leaderId);
    return `<div class="form-grid" data-step="2">
      <div class="field"><label for="game-mode">Battle context</label><select class="select" id="game-mode" data-field="gameMode">${optionsMarkup(data.gameModes, state.gameMode)}</select><p class="field-hint">Context remains attached to every result.</p></div>
      <div class="field"><label for="objective">Optimization objective</label><select class="select" id="objective" data-field="objective">${optionsMarkup(objectiveOptions(), state.objective)}</select><p class="field-hint">Only objectives relevant to this context are shown.</p></div>
    </div>
    <div class="constraint-grid" data-step="3">
      <div class="field"><span class="field-label">Required units</span><div class="selection-zone"><div class="unit-row">${state.requiredUnits.map((id) => unitToken(id, { removeTarget: "required" })).join("")}<button class="add-unit" type="button" data-open-picker="required">＋ Add character</button></div>${state.requiredUnits.length ? "" : '<p class="empty-inline">Start with anyone — or leave the formation open and let Forge recommend the complete squad.</p>'}</div><p class="field-hint">Every selected character must appear in every result.</p></div>
      <div class="field" data-step="4"><span class="field-label">Required leader</span><div class="selection-zone leader-zone">${leader ? `<div class="unit-row">${unitToken(leader.id, { leader: true, removeTarget: "leader" })}</div>` : '<button class="add-unit" type="button" data-open-picker="leader">♛ Lock a leader</button><p class="empty-inline">Leave unlocked and we’ll recommend the strongest leader.</p>'}</div><p class="field-hint">A locked leader automatically becomes required.</p></div>
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
    <div class="panel-actions"><button class="button button-quiet button-small" type="button" data-action="reset-build">Reset</button><button class="button button-wide" type="button" data-action="forge-build">Forge fleets <span aria-hidden="true">→</span></button></div>`;
  }

  function renderReinforcementList(ids, scope) {
    if (!ids.length) return '<div class="empty-state">No reinforcements selected yet.</div>';
    return `<div class="reinforcement-list">${ids.map((id, index) => {
      const unit = shipMap.get(id);
      return `<div class="reinforcement-item"><span class="order">${index + 1}</span>${portrait(unit, "ship")}<button class="name" type="button" data-unit-id="${id}" data-unit-kind="ship">${escapeHtml(displayName(unit))}</button><div class="order-controls"><button type="button" data-order-scope="${scope}" data-order-index="${index}" data-order-direction="up" aria-label="Move ${escapeHtml(unit.name)} up" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-order-scope="${scope}" data-order-index="${index}" data-order-direction="down" aria-label="Move ${escapeHtml(unit.name)} down" ${index === ids.length - 1 ? "disabled" : ""}>↓</button><button type="button" data-remove-target="${scope === "fleet" ? "reinforcements" : "enemy-reinforcements"}" data-remove-id="${id}" aria-label="Remove ${escapeHtml(unit.name)}">×</button></div></div>`;
    }).join("")}</div>`;
  }

  function renderForging(subject, detail) {
    return `<section class="panel forging-state" aria-live="polite"><div><div class="forge-spinner" aria-hidden="true"></div><h3>Forging ${escapeHtml(subject)}...</h3><p>${escapeHtml(detail)}<br>Checking synergy · Comparing investment · Validating turn order</p></div></section>`;
  }

  function renderBuildResults() {
    if (state.unitType === "fleets") return renderFleetResults();
    const recommendations = getMockSquadRecommendations();
    return `<section class="results-zone" id="build-results" data-step="5"><div class="results-heading"><div><span class="eyebrow">Forge output</span><h2>Top Recommended Squads</h2><p>Ranked for ${escapeHtml(currentModeLabel())} · ${escapeHtml(data.objectives.find((item) => item.id === state.objective)?.label)}</p></div><span class="demo-badge">Demo data</span></div><div class="results-list">${recommendations.map((rec, index) => renderSquadRecommendation(rec, index)).join("")}</div></section>`;
  }

  function getMockSquadRecommendations() {
    const size = state.gameMode === "gac-3v3" ? 3 : 5;
    return data.squadRecommendations.map((template, index) => {
      const leaderId = state.leaderId || template.leaderId;
      const ordered = [leaderId, ...state.requiredUnits, ...template.members, ...data.characters.map((unit) => unit.id)];
      const members = [...new Set(ordered)].filter((id) => characterMap.has(id)).slice(0, size);
      if (!members.includes(leaderId)) members.unshift(leaderId);
      return { ...template, leaderId, members: members.slice(0, size), score: Math.max(70, template.score - (state.leaderId && state.leaderId !== template.leaderId ? 5 + index : 0)) };
    });
  }

  function renderSquadRecommendation(rec, index) {
    const expanded = state.expandedRecommendations.has(rec.id);
    return `<article class="recommendation-card">
      <div class="recommendation-main">
        <div class="rank">#${index + 1}</div>
        <div class="formation" aria-label="Recommended squad">${rec.members.map((id) => formationUnit(id, { leader: id === rec.leaderId })).join("")}</div>
        <div class="metrics-wrap">${renderMetrics(rec)}<div class="qualifiers"><span>Investment<strong>${escapeHtml(rec.investment)}</strong></span><span>Mods<strong>${escapeHtml(rec.modDifficulty)}</strong></span><span>RNG<strong>${escapeHtml(rec.rng)}</strong></span></div></div>
        <button class="expand-button" type="button" data-expand-recommendation="${rec.id}" aria-expanded="${expanded}" aria-label="${expanded ? "Collapse" : "Expand"} recommendation details">＋</button>
      </div>
      ${expanded ? renderRecommendationDetails(rec) : ""}
    </article>`;
  }

  function renderMetrics(rec) {
    return `<div class="metrics"><div class="metric primary"><strong>${rec.score}</strong><span>Overall</span></div><div class="metric"><strong>${rec.win}</strong><span>Win potential</span></div><div class="metric"><strong>${rec.reliability}</strong><span>Reliability</span></div></div>`;
  }

  function renderRecommendationDetails(rec) {
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
    if (!state.rosterLoaded) return { state: "insufficient", icon: "○", label: "No roster", detail: "Load the demo roster in Roster to compare this target." };
    const owned = data.demoRoster.units[entry.id];
    if (!owned) return { state: "insufficient", icon: "!", label: "Insufficient", detail: "No demo roster record for this unit." };
    let worst = "ready";
    let detail = "All modeled targets are met.";
    entry.metrics.forEach(([metric, target]) => {
      const targetNumber = Number(String(target).match(/[\d,.]+/)?.[0].replaceAll(",", ""));
      if (!targetNumber) return;
      const key = metric.toLowerCase().includes("relic") ? "relic" : metric.toLowerCase().includes("speed") ? "speed" : metric.toLowerCase().includes("health") ? "health" : metric.toLowerCase().includes("protection") ? "protection" : metric.toLowerCase().includes("offense") ? "offense" : metric.toLowerCase().includes("potency") ? "potency" : metric.toLowerCase().includes("tenacity") ? "tenacity" : null;
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
    const relationReady = state.rosterLoaded && requirement.turnOrder?.every((id) => data.demoRoster.units[id]);
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
    return `<article class="recommendation-card"><div class="recommendation-main"><div class="rank">#${index + 1}</div><div class="fleet-formation"><div class="fleet-group"><span class="fleet-group-label">Capital ship</span>${formationUnit(rec.capitalShipId, { kind: "capital", leader: true })}</div><div class="fleet-group"><span class="fleet-group-label">Start</span>${rec.starters.map((id) => formationUnit(id, { kind: "ship" })).join("")}</div><div class="fleet-group"><span class="fleet-group-label">Reinforce</span>${rec.reinforcements.map((id, position) => `<span class="micro-label">${position + 1}</span>${formationUnit(id, { kind: "ship" })}`).join("")}</div></div><div class="metrics-wrap">${renderMetrics(rec)}<div class="qualifiers"><span>Investment<strong>${escapeHtml(rec.investment)}</strong></span><span>Formation<strong>Fleet</strong></span><span>RNG<strong>${escapeHtml(rec.rng)}</strong></span></div></div><button class="expand-button" type="button" data-expand-recommendation="${rec.id}" aria-expanded="${expanded}" aria-label="${expanded ? "Collapse" : "Expand"} fleet details">＋</button></div>${expanded ? renderFleetDetails(rec) : ""}</article>`;
  }

  function renderFleetDetails(rec) {
    const tab = state.detailTabs[rec.id] || "why";
    const requirement = rec.requirements[state.requirementLevel];
    return `<div class="recommendation-details"><div class="detail-tabs" role="tablist"><button class="${tab === "why" ? "active" : ""}" type="button" data-rec-tab="why" data-rec-id="${rec.id}">Why this works</button><button class="${tab === "requirements" ? "active" : ""}" type="button" data-rec-tab="requirements" data-rec-id="${rec.id}">Ship & pilot requirements</button></div>${tab === "why" ? `<div class="detail-copy"><p>${escapeHtml(rec.why)}</p><div class="tag-list"><span class="tag">Starter order matters</span><span class="tag">Reinforcement order modeled</span><span class="tag">${escapeHtml(currentModeLabel())}</span></div></div>` : `<div><div class="requirement-toolbar">${segmented("requirement-level", [{ id: "minimum", label: "Minimum" }, { id: "recommended", label: "Recommended" }, { id: "safe", label: "Safe" }], state.requirementLevel)}<label class="check-label"><input type="checkbox" data-field="compareRoster" ${state.compareRoster ? "checked" : ""}> Compare with my roster</label></div><p class="requirement-note">Contextual targets for this fleet formation. Pilot development affects resulting ship stats.</p><div class="requirement-grid"><div class="requirement-unit"><h4>Ship</h4><dl>${requirement.ship.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl></div><div class="requirement-unit"><h4>Pilot</h4><dl>${requirement.pilot.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl><div class="roster-comparison">Bossk <span style="color:var(--teal)">↓</span> Hound's Tooth · pilot stats contribute to ship power.</div></div></div><div class="turn-order"><div class="turn-order-panel"><h4>Critical relationship</h4><div class="turn-order-list">${escapeHtml(requirement.relation)}</div></div><div class="turn-order-panel"><h4>Demo roster</h4><div class="turn-order-list"><span class="readiness ${state.rosterLoaded ? "ready" : "insufficient"}">${state.rosterLoaded ? "✓ Core ship data loaded" : "○ Load roster to compare"}</span></div></div></div></div>`}</div>`;
  }

  function renderCounter() {
    return `<div class="page-shell compact-top"><div class="app-frame">${renderCounterSidebar()}<div class="workspace"><section class="section-hero"><div class="eyebrow">Counter mode</div><h1>What are you fighting?</h1><p>Define the target first. A generally strong formation is not always the right answer for a specific defense.</p></section><section class="panel"><div class="panel-heading"><div><span class="step-index">01 / TARGET TYPE</span><h2>Choose the battlefield</h2></div>${segmented("counter-type", [{ id: "squad", label: "Squad" }, { id: "fleet", label: "Fleet" }], state.counterType)}</div>${state.counterType === "squad" ? renderSquadCounterForm() : renderFleetCounterForm()}</section>${state.loading === "counter" ? renderForging("counter routes", "Simulating opening sequences") : state.results.counter ? renderCounterResults() : ""}</div></div></div>`;
  }

  function renderCounterSidebar() {
    return `<aside class="side-panel" aria-label="Counter workflow"><div class="panel"><h2 class="side-title">Counter sequence</h2><div class="side-nav"><button class="active" type="button" data-scroll-step="1"><span class="nav-number">01</span><span>Target type</span></button><button type="button" data-scroll-step="2"><span class="nav-number">02</span><span>Enemy formation</span></button><button type="button" data-scroll-step="3"><span class="nav-number">03</span><span>Constraints</span></button><button type="button" data-scroll-step="4"><span class="nav-number">04</span><span>Counter routes</span></button></div><div class="side-summary"><span class="micro-label">Target brief</span><dl><dt>Battle</dt><dd>${state.counterType === "squad" ? "Squad" : "Fleet"}</dd><dt>Context</dt><dd>${escapeHtml(currentModeLabel())}</dd><dt>Data</dt><dd>Prototype</dd></dl></div></div></aside>`;
  }

  function renderSquadCounterForm() {
    const leader = characterMap.get(state.opponentLeaderId);
    return `<div data-step="2"><span class="field-label">Enemy squad</span><div class="counter-enemy"><div class="unit-row">${leader ? unitToken(leader.id, { leader: true, removeTarget: "enemy-leader" }) : '<button class="add-unit" type="button" data-open-picker="enemy-leader">♛ Choose enemy leader</button>'}${state.opponentMembers.map((id) => unitToken(id, { removeTarget: "enemy-members" })).join("")}${state.opponentMembers.length < 4 ? '<button class="add-unit" type="button" data-open-picker="enemy-members">＋ Add enemy</button>' : ""}</div>${leader ? "" : '<p class="empty-inline">Choose the squad you’re trying to beat. An enemy leader is required.</p>'}</div></div>
    <div class="form-grid" style="margin-top:18px"><div class="field"><label for="counter-context">Game context</label><select class="select" id="counter-context" data-field="gameMode">${optionsMarkup(data.gameModes.filter((mode) => ["gac-5v5", "gac-3v3", "tw", "arena", "conquest", "tb", "general"].includes(mode.id)), state.gameMode)}</select></div><div class="field"><label for="counter-objective">Priority</label><select class="select" id="counter-objective" data-field="objective">${optionsMarkup(objectiveOptions(), state.objective)}</select></div></div>
    <div class="constraint-columns" data-step="3">${renderConstraintBox("Must use", "must-use", state.mustUse, "Required attackers")}${renderConstraintBox("Do not use", "counter-excluded", state.counterExcluded, "Exclude from results")}${renderConstraintBox("Preserve", "counter-preserved", state.counterPreserved, "Save for another battle")}</div>
    <div class="panel-actions"><button class="button button-quiet button-small" type="button" data-action="reset-counter">Reset</button><button class="button button-wide" type="button" data-action="forge-counter" ${leader ? "" : "disabled"}>Find counters <span aria-hidden="true">→</span></button></div>`;
  }

  function renderConstraintBox(title, picker, ids, hint) {
    return `<div class="constraint-box"><h3>${escapeHtml(title)}</h3><div class="unit-row">${ids.map((id) => unitToken(id, { removeTarget: picker })).join("")}<button class="add-unit" type="button" data-open-picker="${picker}" aria-label="${escapeHtml(title)}">＋ Add</button></div><p class="field-hint">${escapeHtml(hint)}</p></div>`;
  }

  function renderFleetCounterForm() {
    const capital = capitalMap.get(state.opponentCapitalId);
    return `<div class="fleet-builder-layout" data-step="2"><div><div class="fleet-slot-panel"><h3>Enemy capital ship</h3>${capital ? `<div class="unit-row">${unitToken(capital.id, { kind: "capital", leader: true, removeTarget: "enemy-capital" })}<button class="add-unit" type="button" data-open-picker="enemy-capital">Change</button></div>` : '<button class="add-unit" type="button" data-open-picker="enemy-capital">＋ Choose capital ship</button>'}</div><div class="fleet-slot-panel"><h3>Enemy starting ships · ${state.opponentStarters.length}/3</h3><div class="unit-row">${state.opponentStarters.map((id) => unitToken(id, { kind: "ship", removeTarget: "enemy-starters" })).join("")}${state.opponentStarters.length < 3 ? '<button class="add-unit" type="button" data-open-picker="enemy-starters">＋ Add starter</button>' : ""}</div></div></div><div class="fleet-slot-panel"><h3>Known enemy reinforcements · optional</h3>${renderReinforcementList(state.opponentReinforcements, "enemy")}${state.opponentReinforcements.length < 4 ? '<button class="add-unit" type="button" data-open-picker="enemy-reinforcements">＋ Add reinforcement</button>' : ""}</div></div><div class="form-grid" style="margin-top:18px"><div class="field"><label for="fleet-counter-context">Game context</label><select class="select" id="fleet-counter-context" data-field="gameMode">${optionsMarkup(data.gameModes.filter((mode) => ["gac-5v5", "tw", "arena", "tb", "general"].includes(mode.id)), state.gameMode)}</select></div><div class="field"><span class="field-label">Formation note</span><p class="field-hint">Unknown enemy reinforcements are modeled as uncertainty.</p></div></div><div class="panel-actions"><button class="button button-quiet button-small" type="button" data-action="reset-counter">Reset</button><button class="button button-wide" type="button" data-action="forge-counter" ${capital ? "" : "disabled"}>Find fleet counters <span aria-hidden="true">→</span></button></div>`;
  }

  function renderCounterResults() {
    const results = getMockCounterRecommendations();
    return `<section class="results-zone" id="counter-results" data-step="4"><div class="results-heading"><div><span class="eyebrow">Counter routes</span><h2>${state.counterType === "squad" ? "Recommended attacking squads" : "Recommended attacking fleets"}</h2><p>Performance statistics below are fictional prototype values.</p></div><span class="demo-badge">Demo data</span></div><div class="results-list">${results.map((result, index) => renderCounterResult(result, index)).join("")}</div></section>`;
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
      ? `<div class="formation">${result.members.map((id) => formationUnit(id, { leader: id === result.leaderId })).join("")}</div>`
      : `<div class="fleet-formation"><div class="fleet-group"><span class="fleet-group-label">Capital</span>${formationUnit(result.capitalShipId, { kind: "capital", leader: true })}</div><div class="fleet-group"><span class="fleet-group-label">Start</span>${result.starters.map((id) => formationUnit(id, { kind: "ship" })).join("")}</div><div class="fleet-group"><span class="fleet-group-label">Reinforce</span>${result.reinforcements.map((id) => formationUnit(id, { kind: "ship" })).join("")}</div></div>`;
    return `<article class="recommendation-card counter-result"><div><span class="micro-label">Route ${index + 1}</span>${formation}</div><div><div class="performance-block"><strong>${result.success}%</strong><div><small>Demo success</small><span>${escapeHtml(result.confidence)} confidence</span><span>${formatNumber(result.sample)} demo battles</span></div></div><div class="tag-list"><span class="tag">${escapeHtml(result.investment)} investment</span><span class="tag">Demo data</span></div></div><div class="strategy-note"><span class="micro-label">Strategy note</span><p>${escapeHtml(result.note)}</p><span class="micro-label">Minimum requirements</span><p>${escapeHtml(result.requirements)}</p></div></article>`;
  }

  function renderMissions() {
    const selected = data.missions[state.selectedMission];
    return `<div class="page-shell"><section class="section-hero"><div class="eyebrow">Structured PvE planning</div><h1>Prepare for the mission, not just the matchup.</h1><p>Explore phase-specific squads, fleet missions, event readiness, feat routes, and score targets.</p></section><section class="missions-grid" aria-label="Mission categories">${data.missionCategories.map((category, index) => `<button type="button" class="mission-card ${category.id === state.selectedMission ? "active" : ""}" data-mission="${category.id}" aria-pressed="${category.id === state.selectedMission}"><span class="mission-icon" aria-hidden="true">0${index + 1}</span><span class="micro-label">${escapeHtml(category.eyebrow)}</span><h3>${escapeHtml(category.name)}</h3><p>${escapeHtml(category.description)}</p></button>`).join("")}</section>${renderMissionDetail(selected)}</div>`;
  }

  function renderMissionDetail(mission) {
    const category = data.missionCategories.find((item) => item.id === state.selectedMission);
    const tier = mission.tierRequirements[state.requirementLevel];
    return `<section class="panel mission-detail"><div class="panel-heading"><div><span class="step-index">MISSION PATH</span><h2>${escapeHtml(mission.title)}</h2><p>${escapeHtml(category.description)}</p></div><span class="demo-badge">Demo data</span></div><div class="form-grid">${mission.selectors.map((selector, index) => `<div class="field"><label for="mission-selector-${index}">${escapeHtml(selector.label)}</label><select class="select" id="mission-selector-${index}" data-mission-select="${index}">${selector.options.map((option, optionIndex) => `<option value="${optionIndex}"${state.missionSelections[state.selectedMission]?.[index] === optionIndex ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></div>`).join("")}</div><div class="mission-result"><div><span class="field-label">Recommended formation</span>${mission.type === "fleet" ? `<div class="fleet-formation"><div class="fleet-group"><span class="fleet-group-label">Capital</span>${formationUnit(mission.capitalShipId, { kind: "capital", leader: true })}</div><div class="fleet-group"><span class="fleet-group-label">Start</span>${mission.starters.map((id) => formationUnit(id, { kind: "ship" })).join("")}</div><div class="fleet-group"><span class="fleet-group-label">Reinforce</span>${mission.reinforcements.map((id) => formationUnit(id, { kind: "ship" })).join("")}</div></div>` : `<div class="formation">${mission.formation.map((id) => formationUnit(id, { leader: id === mission.leaderId })).join("")}</div>`}</div><div class="mission-notes"><div class="data-row"><span>Reliability</span><strong>${escapeHtml(mission.reliability)}</strong></div><div class="data-row"><span>Investment</span><strong>${escapeHtml(mission.investment)}</strong></div><div class="data-row"><span>Special requirement</span><strong>${escapeHtml(mission.special)}</strong></div></div></div><div class="detail-copy" style="margin-top:20px"><span class="micro-label">Strategy path</span><p>${escapeHtml(mission.note)}</p></div><div class="requirement-toolbar" style="margin-top:17px">${segmented("requirement-level", [{ id: "minimum", label: "Minimum viable" }, { id: "recommended", label: "Recommended" }, { id: "safe", label: "Safe" }], state.requirementLevel)}<label class="check-label"><input type="checkbox" data-field="compareRoster" ${state.compareRoster ? "checked" : ""}> Compare with my roster</label></div><p class="requirement-note">${state.requirementLevel === "minimum" ? "Lower investment, more retries expected." : state.requirementLevel === "safe" ? "Higher investment, designed to reduce opening variance." : "Balanced target for repeatable mission completion."} ${state.compareRoster ? (state.rosterLoaded ? "Demo roster comparison is active." : "Load the demo roster to see readiness.") : ""}</p><div class="requirement-grid"><div class="requirement-unit"><h4>Contextual targets</h4><dl>${tier.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl></div><div class="requirement-unit"><h4>Critical turn order</h4><p class="requirement-note">${escapeHtml(mission.turnOrder)}</p><div class="roster-comparison"><span class="readiness ${state.compareRoster && state.rosterLoaded ? "borderline" : "insufficient"}">${state.compareRoster && state.rosterLoaded ? "△ Validate against mission speed" : "○ Demo relationship"}</span></div></div></div></section>`;
  }

  function renderRoster() {
    return `<div class="page-shell"><section class="section-hero"><div class="eyebrow">Whole-roster planning</div><h1>Make the most of your entire roster.</h1><p>Load a fictional account, preserve the pieces you need elsewhere, and preview non-overlapping team assignments.</p></section>${renderRosterLoader()}${state.rosterLoaded ? renderRosterWorkspace() : '<div class="empty-state">No roster loaded. Use the demo account to explore readiness comparisons and lineup optimization.</div>'}</div>`;
  }

  function renderRosterLoader() {
    return `<section class="panel"><div class="panel-heading"><div><span class="step-index">01 / ROSTER</span><h2>Connect your collection</h2><p>The optional Comlink snapshot updates unit definitions only; player roster loading is still simulated.</p></div><span class="demo-badge">Demo roster</span></div><div class="roster-load"><div class="field"><label for="ally-code">Ally Code</label><input class="input" id="ally-code" inputmode="numeric" value="${escapeHtml(data.demoRoster.allyCode)}" aria-describedby="ally-code-hint"></div><button class="button" type="button" data-action="load-roster">${state.rosterLoaded ? "Reload demo roster" : "Load demo roster"}</button></div><p class="field-hint" id="ally-code-hint">The entered code is not sent anywhere. This action always loads local mock data.</p>${state.rosterLoaded ? renderRosterProfile() : ""}</section>`;
  }

  function renderRosterProfile() {
    const roster = data.demoRoster;
    return `<div class="roster-profile"><div class="profile-emblem" aria-hidden="true">FP</div><div><div class="profile-head"><div><h2>${escapeHtml(roster.name)}</h2><p>${escapeHtml(roster.guild)} · ${escapeHtml(roster.allyCode)}</p></div><span class="status-badge">Demo account</span></div><div class="profile-stats"><div class="profile-stat"><strong>${(roster.galacticPower / 1e6).toFixed(2)}M</strong><span>Galactic Power</span></div><div class="profile-stat"><strong>${roster.characterCount}</strong><span>Characters</span></div><div class="profile-stat"><strong>${roster.shipCount}</strong><span>Ships</span></div><div class="profile-stat"><strong>${roster.relicCount}</strong><span>Relic units</span></div><div class="profile-stat"><strong>${roster.galacticLegends}</strong><span>Galactic Legends</span></div></div></div></div>`;
  }

  function renderRosterWorkspace() {
    return `<section class="panel"><div class="panel-heading"><div><span class="step-index">02 / OPTIMIZE</span><h2>Whole-roster optimization</h2><p>Prototype assignments avoid duplicate characters.</p></div></div><div class="form-grid three"><div class="field"><label for="roster-mode">Optimize for</label><select class="select" id="roster-mode" data-field="rosterOptimizeFor"><option value="balanced"${state.rosterOptimizeFor === "balanced" ? " selected" : ""}>Balanced</option><option value="gac-offense"${state.rosterOptimizeFor === "gac-offense" ? " selected" : ""}>GAC offense</option><option value="gac-defense"${state.rosterOptimizeFor === "gac-defense" ? " selected" : ""}>GAC defense</option><option value="tw"${state.rosterOptimizeFor === "tw" ? " selected" : ""}>Territory Wars</option><option value="tb"${state.rosterOptimizeFor === "tb" ? " selected" : ""}>Territory Battles</option><option value="fleets"${state.rosterOptimizeFor === "fleets" ? " selected" : ""}>Fleets</option></select></div><div class="field"><label for="team-count">Number of teams</label><select class="select" id="team-count" data-field="rosterTeamCount">${[4, 6, 8].map((count) => `<option value="${count}"${count === Number(state.rosterTeamCount) ? " selected" : ""}>${count}</option>`).join("")}</select></div><div class="field"><span class="field-label">Preserve</span><button class="add-unit" type="button" data-action="coming-later">＋ Lock existing squad</button><p class="field-hint">Squad presets are coming later.</p></div></div><div class="form-grid" style="margin-top:20px"><div class="preferences"><span class="field-label">Preferences</span><label class="check-label"><input type="checkbox" checked disabled> No duplicate characters</label><label class="check-label"><input type="checkbox" checked> Minimize additional relic investment</label><label class="check-label"><input type="checkbox"> Keep Galactic Legends for offense</label><label class="check-label"><input type="checkbox" checked> Include fleets</label></div><div class="selection-zone"><span class="field-label">Method note</span><p class="field-hint">This static demonstration assigns curated teams and does not run a real optimization algorithm. Every result below is demo data.</p></div></div><div class="panel-actions"><button class="button button-quiet button-small" type="button" data-action="reset-roster-results">Clear results</button><button class="button button-wide" type="button" data-action="optimize-roster">Optimize lineup <span aria-hidden="true">→</span></button></div></section>${state.loading === "roster" ? renderForging("lineup", "Resolving non-overlapping assignments") : state.results.roster ? renderOptimizedLineup() : ""}`;
  }

  function renderOptimizedLineup() {
    const teams = data.rosterTeams.slice(0, Number(state.rosterTeamCount));
    const average = Math.round(teams.reduce((sum, team) => sum + team.score, 0) / teams.length);
    const ready = teams.filter((team) => team.status === "ready").length;
    const minor = teams.filter((team) => team.status === "minor").length;
    const major = teams.filter((team) => team.status === "major").length;
    return `<section class="results-zone" id="roster-results"><div class="results-heading"><div><span class="eyebrow">Roster output</span><h2>Optimized Lineup</h2><p>No character appears twice in this curated demo assignment.</p></div><span class="demo-badge">Demo data</span></div><div class="lineup-summary"><div class="summary-card"><strong>${average}</strong><span>Average team score</span></div><div class="summary-card"><strong>${ready} / ${teams.length}</strong><span>Ready now</span></div><div class="summary-card"><strong>${minor}</strong><span>Minor upgrades</span></div><div class="summary-card"><strong>${major}</strong><span>Major upgrades</span></div></div><div class="optimized-grid">${teams.map((team, index) => `<article class="optimized-team"><div class="optimized-team-head"><h3>Team ${index + 1} · ${escapeHtml(team.name)}</h3><strong>${team.score}</strong></div><div class="formation">${team.members.map((id) => formationUnit(id, { leader: id === team.leaderId })).join("")}</div><div class="team-status"><span class="readiness ${team.status === "ready" ? "ready" : team.status === "minor" ? "borderline" : "insufficient"}">${team.status === "ready" ? "✓ Ready now" : team.status === "minor" ? "△ Minor upgrades" : "! Major upgrades"}</span></div></article>`).join("")}</div></section>`;
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
      required: state.requiredUnits, leader: state.leaderId ? [state.leaderId] : [], "enemy-leader": state.opponentLeaderId ? [state.opponentLeaderId] : [], "enemy-members": state.opponentMembers,
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
    const displayedMax = state.picker === "required" ? (state.gameMode === "gac-3v3" ? 3 : 5) : state.picker === "enemy-members" ? (state.gameMode === "gac-3v3" ? 2 : 4) : config.max;
    const allUnits = config.kind === "capital" ? data.capitalShips : config.kind === "ship" ? data.ships : data.characters;
    const factions = [...new Set(allUnits.flatMap((unit) => unit.factions || []))].sort();
    const roles = [...new Set(allUnits.map((unit) => unit.role).filter(Boolean))].sort();
    pickerContent.innerHTML = `<div class="picker-head"><div><span class="micro-label">Unit library</span><h2 id="picker-title">${escapeHtml(config.title)}</h2></div><button class="icon-button" type="button" data-action="close-picker" aria-label="Close picker">×</button></div><div class="picker-controls"><input class="input" type="search" data-picker-field="query" value="${escapeHtml(state.pickerQuery)}" placeholder="Search ${config.kind === "character" ? "characters" : "ships"}..." aria-label="Search units"><select class="select" data-picker-field="faction" aria-label="Filter by faction"><option value="all">All factions</option>${factions.map((faction) => `<option value="${escapeHtml(faction)}"${faction === state.pickerFaction ? " selected" : ""}>${escapeHtml(faction)}</option>`).join("")}</select>${config.kind === "character" ? `<select class="select" data-picker-field="alignment" aria-label="Filter by alignment"><option value="all">All alignments</option><option value="Light Side"${state.pickerAlignment === "Light Side" ? " selected" : ""}>Light Side</option><option value="Dark Side"${state.pickerAlignment === "Dark Side" ? " selected" : ""}>Dark Side</option></select>` : ""}${roles.length ? `<select class="select" data-picker-field="role" aria-label="Filter by role"><option value="all">All roles</option>${roles.map((role) => `<option value="${escapeHtml(role)}"${role === state.pickerRole ? " selected" : ""}>${escapeHtml(role)}</option>`).join("")}</select>` : ""}</div><div class="picker-body"><div class="picker-meta"><span>${units.length} units found</span><span>${selected.length}${displayedMax ? ` / ${displayedMax}` : ""} selected</span></div>${units.length ? `<div class="picker-grid" role="listbox" aria-label="Available units" aria-multiselectable="${config.multi}">${units.map((unit) => `<button type="button" class="picker-unit ${selected.includes(unit.id) ? "selected" : ""}" role="option" aria-selected="${selected.includes(unit.id)}" data-picker-unit="${unit.id}">${portrait(unit, config.kind)}<span><span class="picker-name">${escapeHtml(displayName(unit))}</span><span class="picker-info">${escapeHtml((unit.factions || []).slice(0, 2).join(" · ") || unit.commanderName || "Capital ship")}</span></span></button>`).join("")}</div>` : '<div class="empty-state">No units match these filters. Try clearing the search or choosing another faction.</div>'}</div>`;
  }

  function selectPickerUnit(id) {
    const target = state.picker;
    const config = pickerConfig[target];
    const selected = pickerSelectedIds(target);
    const alreadySelected = selected.includes(id);
    if (config.multi) {
      const next = alreadySelected ? selected.filter((selectedId) => selectedId !== id) : [...selected, id];
      const squadLimit = state.gameMode === "gac-3v3" ? 3 : 5;
      const dynamicMax = target === "required" ? squadLimit : target === "enemy-members" ? squadLimit - 1 : config.max;
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
    if (target === "required") state.requiredUnits = ids;
    else if (target === "leader") { state.leaderId = ids[0] || null; if (state.leaderId && !state.requiredUnits.includes(state.leaderId)) state.requiredUnits.push(state.leaderId); }
    else if (target === "enemy-leader") state.opponentLeaderId = ids[0] || null;
    else if (target === "enemy-members") state.opponentMembers = ids;
    else if (target === "must-use") state.mustUse = ids;
    else if (target === "counter-excluded") state.counterExcluded = ids;
    else if (target === "counter-preserved") state.counterPreserved = ids;
    else if (target === "capital") state.capitalShipId = ids[0] || null;
    else if (target === "starters") state.fleetStarters = ids.filter((id) => !state.fleetReinforcements.includes(id));
    else if (target === "reinforcements") state.fleetReinforcements = ids.filter((id) => !state.fleetStarters.includes(id));
    else if (target === "enemy-capital") state.opponentCapitalId = ids[0] || null;
    else if (target === "enemy-starters") state.opponentStarters = ids.filter((id) => !state.opponentReinforcements.includes(id));
    else if (target === "enemy-reinforcements") state.opponentReinforcements = ids.filter((id) => !state.opponentStarters.includes(id));
  }

  function openDrawer(id, kind) {
    const unit = unitById(id, kind);
    if (!unit) return;
    const owned = kind === "character" ? data.demoRoster.units[id] : kind === "ship" ? data.demoRoster.ships[id] : null;
    const characterStats = owned || { relic: "—", speed: "—", health: "—", protection: "—", offense: "—", potency: "—", tenacity: "—", zetas: "—", omicrons: "—" };
    const pilot = kind === "ship" ? (characterMap.get(unit.pilotId)?.name || unit.pilotName || "Crewless") : null;
    const commander = kind === "capital" ? (characterMap.get(unit.commanderId)?.name || unit.commanderName || "Unknown commander") : null;
    drawerContent.innerHTML = `<div class="drawer-head"><div><span class="micro-label">Optimization detail</span><h2 id="drawer-title">Unit snapshot</h2></div><button class="icon-button" type="button" data-action="close-drawer" aria-label="Close unit details">×</button></div><div class="drawer-hero">${portrait(unit, kind, "xlarge", unit.name)}<h3>${escapeHtml(unit.name)}</h3><p>${escapeHtml((unit.factions || []).join(" · "))}${unit.alignment ? ` · ${escapeHtml(unit.alignment)}` : ""}</p>${state.rosterLoaded && owned ? '<span class="readiness ready">✓ In demo roster</span>' : '<span class="readiness borderline">○ Demo detail</span>'}</div>${kind === "character" ? `<div class="drawer-section"><h3>Optimization stats</h3><div class="stat-grid">${[["Relic", characterStats.relic === "—" ? "—" : `R${characterStats.relic}`], ["Speed", characterStats.speed], ["Health", characterStats.health], ["Protection", characterStats.protection], ["Offense", characterStats.offense], ["Potency", characterStats.potency === "—" ? "—" : `${characterStats.potency}%`], ["Tenacity", characterStats.tenacity === "—" ? "—" : `${characterStats.tenacity}%`], ["Zetas / Omicrons", `${characterStats.zetas} / ${characterStats.omicrons}`]].map(([label, value]) => `<div class="stat-box"><span>${escapeHtml(label)}</span><strong>${typeof value === "number" ? formatNumber(value) : escapeHtml(value)}</strong></div>`).join("")}</div></div><div class="drawer-section"><h3>Role & leadership</h3><div class="data-row"><span>Role</span><strong>${escapeHtml(unit.role)}</strong></div><div class="data-row"><span>Can lead</span><strong>${unit.canLead ? "Yes" : "No"}</strong></div></div>` : kind === "ship" ? `<div class="drawer-section"><h3>Pilot relationship</h3><div class="data-row"><span>Pilot</span><strong>${escapeHtml(pilot)}</strong></div><div class="data-row"><span>Ship role</span><strong>${escapeHtml(unit.role)}</strong></div><p class="requirement-note" style="margin-top:13px">${escapeHtml(pilot)} <span style="color:var(--teal)">↓</span> ${escapeHtml(unit.name)}. Pilot gear, relics, abilities, and mods affect resulting ship stats.</p></div><div class="drawer-section"><h3>Demo ship stats</h3><div class="stat-grid">${[["Stars", owned ? `${owned.stars}★` : "—"], ["Level", owned?.level || "—"], ["Speed", owned?.speed || "—"], ["Health", owned?.health || "—"], ["Protection", owned?.protection || "—"], ["Abilities", owned?.abilities || "Demo target"]].map(([label, value]) => `<div class="stat-box"><span>${escapeHtml(label)}</span><strong>${typeof value === "number" ? formatNumber(value) : escapeHtml(value)}</strong></div>`).join("")}</div></div>` : `<div class="drawer-section"><h3>Command</h3><div class="data-row"><span>Commander</span><strong>${escapeHtml(commander)}</strong></div><div class="data-row"><span>Faction</span><strong>${escapeHtml((unit.factions || []).join(", "))}</strong></div></div>`}<div class="drawer-section"><p class="requirement-note">This focused prototype detail supports formation decisions; it is not intended as a complete unit encyclopedia.</p></div>`;
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
    render();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      state.loading = null;
      state.results[scope] = true;
      render();
      const target = document.querySelector(`#${scope === "build" ? "build-results" : scope === "counter" ? "counter-results" : "roster-results"}`);
      target?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }, reducedMotion ? 20 : 540);
  }

  function resetBuild() {
    state.requiredUnits = [];
    state.leaderId = null;
    state.capitalShipId = null;
    state.fleetStarters = [];
    state.fleetReinforcements = [];
    state.results.build = false;
    state.loading = null;
    render();
  }

  function resetCounter() {
    state.opponentLeaderId = null;
    state.opponentMembers = [];
    state.opponentCapitalId = null;
    state.opponentStarters = [];
    state.opponentReinforcements = [];
    state.mustUse = [];
    state.counterExcluded = [];
    state.counterPreserved = [];
    state.results.counter = false;
    state.loading = null;
    render();
  }

  function removeSelection(target, id) {
    if (target === "required") { state.requiredUnits = state.requiredUnits.filter((unitId) => unitId !== id); if (state.leaderId === id) state.leaderId = null; }
    else if (target === "leader") state.leaderId = null;
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
    render();
  }

  function changeSection(section) {
    if (!["build", "counter", "missions", "roster"].includes(section)) return;
    state.section = section;
    if (location.hash !== `#${section}`) history.pushState(null, "", `#${section}`);
    render();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  document.addEventListener("click", (event) => {
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
    else if (action === "reset-counter") resetCounter();
    else if (action === "load-roster") { state.rosterLoaded = true; render(); showToast("Local demo roster loaded. No network request was made."); }
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
      else if (field === "rosterTeamCount") state.rosterTeamCount = Number(event.target.value);
      else state[field] = event.target.value;
      if (field === "gameMode" && !objectiveOptions().some((item) => item.id === state.objective)) state.objective = "best-overall";
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

  document.addEventListener("error", (event) => {
    if (event.target.matches("img.unit-image")) event.target.hidden = true;
  }, true);

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
