(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ForgeBattleSimulator = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const unique = (values) => [...new Set(values)];
  const SUPPORTED_MECHANICS = new Set([
    "damage", "recovery", "turnMeterPercent", "assist", "assistTrigger",
    "control", "controlTarget", "cleanse", "revivePercent", "cooldownReduction"
  ]);

  function hashSeed(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function randomGenerator(seed) {
    let state = seed >>> 0;
    return function random() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function profileFor(model, unit) {
    return model?.units?.[unit.id] || { categories: [], abilities: [], simulationStats: null };
  }

  function abilityMatches(ability, targetProfile, targetId) {
    const categories = new Set(targetProfile.categories || []);
    if ((ability.targetUnits || []).includes(targetId)) return true;
    if ((ability.groupedCategories || []).length && ability.groupedCategories.every((category) => categories.has(category))) return true;
    const categoryTargets = [...(ability.separateCategories || []), ...(ability.targetCategories || [])];
    if (categoryTargets.some((category) => categories.has(category))) return true;
    return !(ability.targetUnits || []).length && !(ability.groupedCategories || []).length && !categoryTargets.length;
  }

  function fallbackStats(role) {
    if (role === "Tank") return { health: 32000, protection: 45000, speed: 135, offense: 1350, defense: 500, penetration: 0, criticalChance: 15, criticalDamage: 150 };
    if (role === "Attacker") return { health: 20000, protection: 30000, speed: 175, offense: 2100, defense: 240, penetration: 0, criticalChance: 30, criticalDamage: 150 };
    return { health: 23000, protection: 35000, speed: 165, offense: 1500, defense: 300, penetration: 0, criticalChance: 20, criticalDamage: 150 };
  }

  function buildUnit(unit, profile, side, index) {
    const stats = { ...fallbackStats(unit.role), ...(profile.simulationStats || {}) };
    const abilities = (profile.abilities || [])
      .filter((ability) => ability.kind === "basic" || ability.kind === "special")
      .map((ability) => ability.kind === "basic" && !ability.combat?.damage
        ? { ...ability, combat: { ...(ability.combat || {}), damage: { target: "single", hits: 1, multiplier: 1 } } }
        : ability);
    if (!abilities.some((ability) => ability.kind === "basic")) {
      abilities.unshift({ skillId: `basic-${unit.id}`, kind: "basic", name: "Basic attack", impact: 1, combat: { damage: { target: "single", hits: 1, multiplier: 1 } } });
    }
    return {
      id: `${side}-${index}-${unit.id}`,
      unitId: unit.id,
      name: unit.name,
      role: unit.role,
      side,
      profile,
      abilities,
      maxHealth: stats.health,
      health: stats.health,
      maxProtection: stats.protection,
      protection: stats.protection,
      speed: stats.speed,
      offense: stats.offense,
      defense: stats.defense,
      penetration: stats.penetration,
      criticalChance: stats.criticalChance,
      criticalDamage: stats.criticalDamage,
      turnMeter: 0,
      cooldowns: {},
      statuses: {},
      alive: true,
      revives: 0,
      damageDone: 0,
      healingDone: 0,
      turns: 0
    };
  }

  function applyLeader(team, leaderId) {
    const leader = team.find((member) => member.unitId === leaderId);
    if (!leader) return;
    const leaderships = (leader.profile.abilities || []).filter((ability) => ability.kind === "leader");
    team.forEach((member) => {
      const matching = leaderships.filter((ability) => abilityMatches(ability, member.profile, member.unitId));
      if (!matching.length) return;
      const best = matching.sort((left, right) => (right.impact || 0) - (left.impact || 0))[0];
      const percentage = clamp((best.maximumAlliedBenefitPercent || best.impact * 3 || 10) / 100, 0.05, 0.5);
      const signals = new Set(best.signals || []);
      if (signals.has("improves durability") || signals.has("recovers Health or Protection") || signals.has("shares unique abilities")) {
        member.maxHealth = Math.round(member.maxHealth * (1 + percentage));
        member.health = member.maxHealth;
        member.maxProtection = Math.round(member.maxProtection * (1 + percentage));
        member.protection = member.maxProtection;
      }
      if (signals.has("improves offense") || signals.has("shares unique abilities")) member.offense = Math.round(member.offense * (1 + percentage));
      if (signals.has("improves Speed")) member.speed = Math.round(member.speed * (1 + Math.min(percentage, 0.3)));
    });
  }

  const alive = (team) => team.filter((member) => member.alive);
  const survivability = (member) => member.health + member.protection;

  function chooseTarget(team, random) {
    const available = alive(team);
    if (!available.length) return null;
    const tanks = available.filter((member) => member.role === "Tank");
    const pool = tanks.length && random() < 0.65 ? tanks : available;
    return [...pool].sort((left, right) => survivability(left) - survivability(right) || right.offense - left.offense)[0];
  }

  function dealDamage(source, target, ability, random, scale = 1) {
    if (!source?.alive || !target?.alive) return { damage: 0, critical: false, defeated: false };
    const damage = ability.combat?.damage || { hits: 1, multiplier: 1 };
    let total = 0;
    let anyCritical = false;
    for (let hit = 0; hit < (damage.hits || 1); hit += 1) {
      const effectiveDefense = Math.max(0, target.defense - source.penetration);
      const mitigation = 100 / (100 + effectiveDefense);
      const critical = random() * 100 < source.criticalChance;
      const criticalMultiplier = critical ? source.criticalDamage / 100 : 1;
      const variance = 0.9 + random() * 0.2;
      let amount = Math.max(1, Math.round(source.offense * (damage.multiplier || 1) * 3.2 * mitigation * criticalMultiplier * variance * scale));
      const protectionDamage = Math.min(target.protection, amount);
      target.protection -= protectionDamage;
      amount -= protectionDamage;
      const healthDamage = Math.min(target.health, amount);
      target.health -= healthDamage;
      total += protectionDamage + healthDamage;
      anyCritical ||= critical;
      if (target.health <= 0) {
        target.health = 0;
        target.alive = false;
        break;
      }
    }
    source.damageDone += total;
    return { damage: total, critical: anyCritical, defeated: !target.alive };
  }

  function recover(source, targets, recovery) {
    targets.filter((target) => target.alive).forEach((target) => {
      const oldHealth = target.health;
      const oldProtection = target.protection;
      target.health = Math.min(target.maxHealth, target.health + target.maxHealth * (recovery.healthPercent || 0) / 100);
      target.protection = Math.min(target.maxProtection, target.protection + target.maxProtection * (recovery.protectionPercent || 0) / 100);
      source.healingDone += (target.health - oldHealth) + (target.protection - oldProtection);
    });
  }

  function basicAttack(source, enemies, random, scale = 1) {
    if (!source.alive || source.statuses.daze > 0) return;
    const basic = source.abilities.find((ability) => ability.kind === "basic");
    const target = chooseTarget(enemies, random);
    if (basic && target) dealDamage(source, target, basic, random, scale);
  }

  function scoreAbility(ability, actor, allies, enemies, random) {
    const combat = ability.combat || {};
    let score = (ability.impact || 1) + random() * 2;
    if (combat.damage) score += combat.damage.target === "all" ? alive(enemies).length * 1.7 : 2.5;
    if (combat.control) score += combat.control.length * 1.4;
    if (combat.assist || combat.assistTrigger) score += 2;
    if (combat.recovery) {
      const missing = alive(allies).reduce((total, member) => total + (member.maxHealth + member.maxProtection - survivability(member)) / (member.maxHealth + member.maxProtection), 0);
      score += missing * 8;
      if (missing < 0.25) score -= 5;
    }
    if (combat.revivePercent && allies.some((member) => !member.alive)) score += 20;
    if (!combat.damage && !combat.recovery && !combat.revivePercent && !combat.control && !combat.assist) score -= 4;
    return score;
  }

  function selectAbility(actor, allies, enemies, random) {
    const available = actor.abilities.filter((ability) => {
      if ((actor.cooldowns[ability.skillId] || 0) > 0) return false;
      if (actor.statuses.abilityBlock > 0 && ability.kind === "special") return false;
      return true;
    });
    return available
      .map((ability) => ({ ability, score: scoreAbility(ability, actor, allies, enemies, random) }))
      .sort((left, right) => right.score - left.score)[0]?.ability
      || actor.abilities.find((ability) => ability.kind === "basic");
  }

  function recoveryTargets(combat, actor, allies) {
    if (combat.recovery.target === "all") return alive(allies);
    if (combat.recovery.target === "one") return [[...alive(allies)].sort((left, right) => survivability(left) / (left.maxHealth + left.maxProtection) - survivability(right) / (right.maxHealth + right.maxProtection))[0]].filter(Boolean);
    return [actor];
  }

  function applyControl(target, controls, random) {
    if (!target?.alive) return;
    controls.forEach((control) => {
      if (random() >= 0.68) return;
      const key = control === "ability block" ? "abilityBlock" : control;
      target.statuses[key] = Math.max(target.statuses[key] || 0, control === "fracture" ? 2 : 1);
    });
  }

  function reviveAlly(actor, allies, percent) {
    const target = allies.filter((member) => !member.alive).sort((left, right) => right.offense - left.offense)[0];
    if (!target) return null;
    target.alive = true;
    target.health = Math.max(1, Math.round(target.maxHealth * percent / 100));
    target.protection = 0;
    target.turnMeter = 0;
    target.statuses = {};
    target.revives += 1;
    actor.healingDone += target.health;
    return target;
  }

  function triggerSpecialPassives(actor, allies, enemies, random) {
    allies.forEach((owner) => {
      if (!owner.alive || owner === actor || owner.statuses.daze > 0) return;
      const trigger = (owner.profile.abilities || []).find((ability) => ability.combat?.assistTrigger === "ally-special" && abilityMatches(ability, actor.profile, actor.unitId));
      if (trigger) basicAttack(owner, enemies, random, 0.6);
    });
  }

  function executeAbility(actor, ability, allies, enemies, random, log) {
    const combat = ability.combat || {};
    const enemyTargets = combat.damage?.target === "all" || combat.controlTarget === "all"
      ? alive(enemies)
      : [chooseTarget(enemies, random)].filter(Boolean);
    let defeated = [];
    enemyTargets.forEach((target) => {
      const result = combat.damage ? dealDamage(actor, target, ability, random) : { defeated: false, damage: 0 };
      if (combat.control) applyControl(target, combat.control, random);
      if (result.defeated) defeated.push(target.name);
    });

    if (combat.recovery) recover(actor, recoveryTargets(combat, actor, allies), combat.recovery);
    if (combat.cleanse) {
      const targets = combat.cleanse === "all" ? alive(allies) : [actor];
      targets.forEach((target) => { target.statuses = {}; });
    }
    if (combat.turnMeterPercent) {
      const matched = alive(allies).filter((ally) => (ability.targetCategories || []).length ? abilityMatches(ability, ally.profile, ally.unitId) : ally === actor);
      (matched.length ? matched : [actor]).forEach((ally) => { ally.turnMeter += combat.turnMeterPercent * 10; });
    }
    if (combat.assist) {
      const helpers = alive(allies).filter((ally) => ally !== actor && ally.statuses.daze <= 0).sort((left, right) => right.offense - left.offense);
      (combat.assist === "all" ? helpers : helpers.slice(0, 1)).forEach((helper) => basicAttack(helper, enemies, random, 0.75));
    }
    if (combat.revivePercent) reviveAlly(actor, allies, combat.revivePercent);
    if (combat.cooldownReduction) {
      alive(allies).forEach((ally) => Object.keys(ally.cooldowns).forEach((skillId) => {
        ally.cooldowns[skillId] = Math.max(0, ally.cooldowns[skillId] - combat.cooldownReduction);
      }));
    }
    if (ability.kind === "special") triggerSpecialPassives(actor, allies, enemies, random);
    if (ability.kind === "special") actor.cooldowns[ability.skillId] = 3;
    if (log.length < 18) log.push(`${actor.name} used ${ability.name}${defeated.length ? ` and defeated ${defeated.join(", ")}` : ""}.`);
  }

  function decrementTurnState(actor) {
    Object.keys(actor.cooldowns).forEach((skillId) => { actor.cooldowns[skillId] = Math.max(0, actor.cooldowns[skillId] - 1); });
    Object.keys(actor.statuses).forEach((status) => {
      actor.statuses[status] = Math.max(0, actor.statuses[status] - 1);
      if (!actor.statuses[status]) delete actor.statuses[status];
    });
  }

  function battleWinner(teamA, teamB) {
    if (!alive(teamA).length && !alive(teamB).length) return "draw";
    if (!alive(teamB).length) return "A";
    if (!alive(teamA).length) return "B";
    return null;
  }

  function simulateBattle(configuration, seed, keepLog = false) {
    const random = randomGenerator(seed);
    const characterMap = configuration.characterMap;
    const createTeam = (definition, side) => definition.members.map((id, index) => {
      const unit = characterMap.get(id);
      return buildUnit(unit, profileFor(configuration.model, unit), side, index);
    });
    const teamA = createTeam(configuration.teamA, "A");
    const teamB = createTeam(configuration.teamB, "B");
    applyLeader(teamA, configuration.teamA.leaderId);
    applyLeader(teamB, configuration.teamB.leaderId);
    const allUnits = [...teamA, ...teamB];
    const log = [];
    let actions = 0;
    let firstAction = null;

    while (!battleWinner(teamA, teamB) && actions < configuration.maxActions) {
      const active = allUnits.filter((member) => member.alive);
      const timeToTurn = Math.min(...active.map((member) => Math.max(0, 1000 - member.turnMeter) / Math.max(1, member.speed)));
      active.forEach((member) => { member.turnMeter += member.speed * timeToTurn; });
      const ready = active.filter((member) => member.turnMeter >= 999.999)
        .map((member) => ({ member, tieBreak: random() }))
        .sort((left, right) => right.member.turnMeter - left.member.turnMeter || right.member.speed - left.member.speed || right.tieBreak - left.tieBreak)
        .map((entry) => entry.member);
      const actor = ready[0];
      if (!actor) break;
      actor.turnMeter = Math.max(0, actor.turnMeter - 1000);
      actor.turns += 1;
      actions += 1;
      firstAction ||= actor.name;
      const disabled = actor.statuses.stun > 0 || actor.statuses.fear > 0 || actor.statuses.fracture > 0;
      if (!disabled) {
        const allies = actor.side === "A" ? teamA : teamB;
        const enemies = actor.side === "A" ? teamB : teamA;
        const ability = selectAbility(actor, allies, enemies, random);
        if (ability) executeAbility(actor, ability, allies, enemies, random, keepLog ? log : []);
      } else if (keepLog && log.length < 18) {
        log.push(`${actor.name} lost a turn to control effects.`);
      }
      decrementTurnState(actor);
    }

    let winner = battleWinner(teamA, teamB);
    if (!winner) {
      const remainingA = teamA.reduce((total, member) => total + survivability(member), 0);
      const remainingB = teamB.reduce((total, member) => total + survivability(member), 0);
      const difference = Math.abs(remainingA - remainingB) / Math.max(1, remainingA + remainingB);
      winner = difference < 0.03 ? "draw" : remainingA > remainingB ? "A" : "B";
    }
    return {
      winner,
      actions,
      survivorsA: alive(teamA).length,
      survivorsB: alive(teamB).length,
      firstAction,
      teamA,
      teamB,
      log
    };
  }

  function coverageFor(teamIds, characterMap, model) {
    let total = 0;
    let supported = 0;
    const unsupported = new Set();
    teamIds.forEach((id) => {
      const unit = characterMap.get(id);
      const profile = profileFor(model, unit);
      (profile.abilities || []).forEach((ability) => {
        const keys = Object.keys(ability.combat || {});
        const modeSpecific = (ability.modeBonuses || []).length || ability.omicronMode;
        if (modeSpecific) {
          total += 1;
          unsupported.add("mode-specific ability rules");
        }
        if (!keys.length) {
          total += 1;
          if (ability.kind === "basic") supported += 1;
          else unsupported.add("bespoke or unparsed ability logic");
          return;
        }
        keys.forEach((key) => {
          total += 1;
          if (SUPPORTED_MECHANICS.has(key)) supported += 1;
          else unsupported.add(key === "summon" ? "summoned units" : key);
        });
      });
    });
    const ceiling = model?.quality === "explicit-ability-data" ? 0.9 : model?.quality === "localized-kit-text" ? 0.72 : 0.45;
    return {
      percent: Math.round(100 * ceiling * supported / Math.max(1, total)),
      modeledMechanics: supported,
      examinedMechanics: total,
      unsupportedMechanics: [...unsupported].sort(),
      quality: model?.quality || "category-tags-only"
    };
  }

  function validateTeam(team, label, characterMap) {
    if (!team || !Array.isArray(team.members)) throw new Error(`${label} is missing its member list.`);
    const members = unique(team.members);
    if (members.length < 1 || members.length > 5) throw new Error(`${label} must contain between one and five unique characters.`);
    if (members.length !== team.members.length) throw new Error(`${label} contains a duplicate character.`);
    if (!members.includes(team.leaderId)) throw new Error(`${label}'s leader must be a member of that team.`);
    members.forEach((id) => { if (!characterMap.has(id)) throw new Error(`${label} contains an unknown character: ${id}.`); });
  }

  function simulate(options) {
    const characters = options.characters || [];
    const characterMap = new Map(characters.map((unit) => [unit.id, unit]));
    validateTeam(options.teamA, "Team A", characterMap);
    validateTeam(options.teamB, "Team B", characterMap);
    const iterations = clamp(Math.round(options.iterations || 400), 50, 2000);
    const seed = hashSeed(options.seed || [...options.teamA.members, "vs", ...options.teamB.members].join("|"));
    const configuration = {
      teamA: options.teamA,
      teamB: options.teamB,
      model: options.synergyModel || { units: {}, quality: "category-tags-only" },
      characterMap,
      maxActions: clamp(options.maxActions || 220, 50, 500)
    };
    const totals = { A: 0, B: 0, draw: 0, actions: 0, survivorsA: 0, survivorsB: 0 };
    const firstActions = new Map();
    const damage = new Map();
    let example = null;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const result = simulateBattle(configuration, (seed + Math.imul(iteration + 1, 2654435761)) >>> 0, iteration === 0);
      totals[result.winner] += 1;
      totals.actions += result.actions;
      totals.survivorsA += result.survivorsA;
      totals.survivorsB += result.survivorsB;
      firstActions.set(result.firstAction, (firstActions.get(result.firstAction) || 0) + 1);
      [...result.teamA, ...result.teamB].forEach((member) => damage.set(member.name, (damage.get(member.name) || 0) + member.damageDone));
      if (iteration === 0) example = result;
    }
    const teamIds = [...options.teamA.members, ...options.teamB.members];
    const coverage = coverageFor(teamIds, characterMap, configuration.model);
    const leading = (map) => [...map.entries()].sort((left, right) => right[1] - left[1])[0];
    const topDamage = leading(damage);
    const first = leading(firstActions);
    const roundedPercentages = {
      A: Math.round(totals.A * 1000 / iterations) / 10,
      B: Math.round(totals.B * 1000 / iterations) / 10,
      draw: Math.round(totals.draw * 1000 / iterations) / 10
    };
    const largestOutcome = ["A", "B", "draw"].sort((left, right) => totals[right] - totals[left])[0];
    const roundingCorrection = Math.round((100 - roundedPercentages.A - roundedPercentages.B - roundedPercentages.draw) * 10) / 10;
    roundedPercentages[largestOutcome] = Math.round((roundedPercentages[largestOutcome] + roundingCorrection) * 10) / 10;
    return {
      schemaVersion: 1,
      seed: options.seed || seed.toString(16),
      iterations,
      teamAWinPercent: roundedPercentages.A,
      teamBWinPercent: roundedPercentages.B,
      drawPercent: roundedPercentages.draw,
      averageActions: Math.round(totals.actions * 10 / iterations) / 10,
      averageSurvivorsA: Math.round(totals.survivorsA * 10 / iterations) / 10,
      averageSurvivorsB: Math.round(totals.survivorsB * 10 / iterations) / 10,
      mostFrequentFirstAction: first ? { unit: first[0], percent: Math.round(first[1] * 1000 / iterations) / 10 } : null,
      topDamageUnit: topDamage ? topDamage[0] : null,
      coverage,
      limitations: [
        "Uses normalized Gear XIII base stats; player relics, mods, datacrons, and roster state are not included.",
        "Ability mechanics are compact approximations, not the proprietary game combat engine.",
        ...(coverage.unsupportedMechanics.length ? [`Unsupported or partial mechanics: ${coverage.unsupportedMechanics.join(", ")}.`] : [])
      ],
      exampleLog: example?.log || []
    };
  }

  return { simulate, simulateBattle, coverageFor };
});
