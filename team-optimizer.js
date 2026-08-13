(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ForgeTeamOptimizer = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const clamp = (value, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, value));
  const unique = (values) => [...new Set(values)];
  const leaderGroupPrefixes = ["affiliation_", "profession_", "species_", "alignment_"];
  const categoryLabelOverrides = {
    affiliation_oldrepublic: "Old Republic",
    affiliation_firstorder: "First Order",
    affiliation_galacticrepublic: "Galactic Republic",
    affiliation_galactic_republic_jedi: "Galactic Republic Jedi"
  };

  function categoryWeight(category) {
    if (category.startsWith("affiliation_")) return 6;
    if (category.startsWith("profession_")) return 3;
    if (category.startsWith("species_")) return 1;
    return 0;
  }

  function categoryLabel(category) {
    if (categoryLabelOverrides[category]) return categoryLabelOverrides[category];
    return category
      .replace(/^(?:affiliation|profession|species|alignment|role|teamup)_/, "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function leaderSynergyGroups(units, leaderId, model) {
    const entries = (units || []).map((unit) => ({ unit, profile: profileFor(model, unit) }));
    const leader = entries.find((entry) => entry.unit.id === leaderId);
    if (!leader) return null;
    const leaderAbilities = (leader.profile.abilities || []).filter((ability) => ability.kind === "leader");
    const groupCandidates = [];
    leaderAbilities.forEach((ability) => {
      unique([
        ...(ability.targetCategories || []),
        ...(ability.separateCategories || []),
        ...(ability.groupedCategories || [])
      ]).filter((category) => leaderGroupPrefixes.some((prefix) => category.startsWith(prefix))).forEach((category) => {
        groupCandidates.push({ key: category, label: categoryLabel(category), ability: ability.name });
      });
      (ability.targetUnits || []).forEach((unitId) => {
        const target = entries.find((entry) => entry.unit.id === unitId)?.unit;
        groupCandidates.push({ key: `unit_${unitId}`, label: target ? `Direct: ${target.name}` : "Direct ally", ability: ability.name });
      });
    });
    const groups = unique(groupCandidates.map((group) => group.key)).map((key) => groupCandidates.find((group) => group.key === key));
    const byUnit = {};
    entries.filter((entry) => entry !== leader).forEach((entry) => {
      const memberCategories = new Set(entry.profile.categories || []);
      const groups = [];
      leaderAbilities.forEach((ability) => {
        const grouped = ability.groupedCategories || [];
        const groupedSet = new Set(grouped);
        const groupedActive = !grouped.length || grouped.every((category) => memberCategories.has(category));
        const candidates = unique([
          ...(ability.targetCategories || []),
          ...(ability.separateCategories || []),
          ...(groupedActive ? grouped : [])
        ]).filter((category) => leaderGroupPrefixes.some((prefix) => category.startsWith(prefix)));
        candidates.forEach((category) => {
          if (groupedSet.has(category) && !groupedActive) return;
          if (!memberCategories.has(category)) return;
          groups.push({ key: category, label: categoryLabel(category), ability: ability.name });
        });
        if ((ability.targetUnits || []).includes(entry.unit.id)) {
          groups.push(groupCandidates.find((group) => group.key === `unit_${entry.unit.id}`));
        }
      });
      byUnit[entry.unit.id] = unique(groups.filter(Boolean).map((group) => group.key)).map((key) => groupCandidates.find((group) => group.key === key));
    });
    return {
      leaderId,
      leaderName: leader.unit.name,
      byUnit,
      groups,
      coveredCount: Object.values(byUnit).filter((memberGroups) => memberGroups.length > 0).length,
      teammateCount: Math.max(0, entries.length - 1)
    };
  }

  function profileFor(model, unit) {
    return model?.units?.[unit.id] || {
      baseId: unit.baseId,
      categories: (unit.factions || []).map((faction) => `affiliation_${faction.toLowerCase().replaceAll(" ", "")}`),
      teamUpTags: [],
      abilities: []
    };
  }

  function abilityMatch(ability, targetProfile, targetId) {
    const categories = new Set(targetProfile.categories || []);
    const direct = (ability.targetUnits || []).includes(targetId);
    const grouped = ability.groupedCategories || [];
    const separate = ability.separateCategories || [];
    const inferred = ability.targetCategories || [];
    const groupedMatch = grouped.length > 0 && grouped.every((category) => categories.has(category));
    const separateMatches = separate.filter((category) => categories.has(category));
    const inferredMatches = inferred.filter((category) => categories.has(category));
    if (!direct && !groupedMatch && !separateMatches.length && !inferredMatches.length) return 0;
    return Math.min(3, (direct ? 2 : 0) + (groupedMatch ? 1.4 : 0) + Math.min(0.9, (separateMatches.length + inferredMatches.length) * 0.45));
  }

  function sharedCategoryScore(left, right) {
    const rightCategories = new Set(right.categories || []);
    return (left.categories || []).reduce((total, category) => total + (rightCategories.has(category) ? categoryWeight(category) : 0), 0);
  }

  function sharedTeamUpScore(left, right) {
    const rightTags = new Set(right.teamUpTags || []);
    return (left.teamUpTags || []).some((tag) => rightTags.has(tag)) ? 16 : 0;
  }

  function directedAbilityScore(source, target, targetId, leaderActive) {
    return (source.abilities || []).reduce((total, ability) => {
      if (ability.kind === "leader" && !leaderActive) return total;
      const match = abilityMatch(ability, target, targetId);
      if (!match) return total;
      const kindWeight = ability.kind === "leader" ? 2.2 : ability.kind === "unique" ? 1.45 : ability.kind === "special" ? 0.55 : 0.25;
      return total + match * (ability.impact || 1) * kindWeight;
    }, 0);
  }

  function pairScore(left, right, leftIsLeader = false, rightIsLeader = false) {
    return sharedCategoryScore(left.profile, right.profile)
      + sharedTeamUpScore(left.profile, right.profile)
      + directedAbilityScore(left.profile, right.profile, right.unit.id, leftIsLeader)
      + directedAbilityScore(right.profile, left.profile, left.unit.id, rightIsLeader);
  }

  function officialSquadBonus(memberIds, officialSquads) {
    const members = new Set(memberIds);
    let best = 0;
    let source = null;
    (officialSquads || []).forEach((squad) => {
      const official = new Set(squad.members || []);
      const overlap = [...members].filter((id) => official.has(id)).length;
      const union = new Set([...members, ...official]).size || 1;
      const similarity = overlap / union;
      if (similarity > best) {
        best = similarity;
        source = squad;
      }
    });
    return { value: best * 9, source };
  }

  function roleBalance(units) {
    const roles = new Set(units.map((unit) => unit.role));
    let score = 0;
    if (roles.has("Tank")) score += 3;
    if (roles.has("Attacker")) score += 2;
    if (roles.has("Support") || roles.has("Healer")) score += 2;
    return score;
  }

  function teamGalacticPower(units, unitGpById) {
    const rawValues = units.map((unit) => unitGpById?.[unit.id]);
    const values = rawValues.map(Number);
    const complete = values.length > 0 && rawValues.every((value) => value !== null && value !== undefined && value !== "") && values.every((value) => Number.isFinite(value) && value >= 0);
    return { complete, value: complete ? values.reduce((total, value) => total + value, 0) : null };
  }

  function compareMetricResults(left, right, sortBy) {
    const metricDifference = (metric) => Number(right.metrics[metric] || 0) - Number(left.metrics[metric] || 0);
    if (sortBy === "leadership") {
      return metricDifference("leadership") || metricDifference("exactScore") || metricDifference("cohesion") || metricDifference("mechanics");
    }
    if (sortBy === "cohesion") {
      return metricDifference("cohesion") || metricDifference("exactScore") || metricDifference("leadership") || metricDifference("mechanics");
    }
    if (sortBy === "gp") {
      if (left.teamGp.complete !== right.teamGp.complete) return left.teamGp.complete ? -1 : 1;
      if (left.teamGp.complete && left.teamGp.value !== right.teamGp.value) return right.teamGp.value - left.teamGp.value;
    }
    return metricDifference("exactScore") || metricDifference("mechanics") || metricDifference("pairStrength");
  }

  function teamExplanations(entries, leader, metrics, officialSource) {
    const teammates = entries.filter((entry) => entry.unit.id !== leader.unit.id);
    const leaderAbilities = (leader.profile.abilities || []).filter((ability) => ability.kind === "leader");
    const leaderAbility = leaderAbilities
      .map((ability) => ({ ability, covered: teammates.filter((entry) => abilityMatch(ability, entry.profile, entry.unit.id) > 0) }))
      .sort((left, right) => right.covered.length - left.covered.length)[0];
    const explanations = [];
    if (leaderAbility?.covered.length) {
      const targets = unique(leaderAbility.ability.targetCategories || []).map(categoryLabel).slice(0, 2).join(" / ");
      const benefit = leaderAbility.ability.maximumAlliedBenefitPercent;
      explanations.push(`${leader.unit.name}'s ${leaderAbility.ability.name} reaches ${leaderAbility.covered.length}/${teammates.length} teammates${targets ? ` through ${targets}` : ""}${benefit ? `, with allied percentage benefits up to ${benefit}%` : ""}.`);
    } else {
      explanations.push(`${leader.unit.name} is a valid leader, but the snapshot contains no explicit leadership coverage for this full formation.`);
    }

    const relationships = [];
    entries.forEach((source) => {
      (source.profile.abilities || []).filter((ability) => ability.kind !== "leader").forEach((ability) => {
        const covered = entries.filter((target) => target !== source && abilityMatch(ability, target.profile, target.unit.id) > 0);
        if (covered.length) relationships.push({ source, ability, covered });
      });
    });
    relationships.sort((left, right) => (right.covered.length * right.ability.impact) - (left.covered.length * left.ability.impact));
    if (relationships[0]) {
      const relation = relationships[0];
      const signals = (relation.ability.signals || []).slice(0, 3).join(", ");
      explanations.push(`${relation.source.unit.name}'s ${relation.ability.name} reinforces ${relation.covered.length} teammates${signals ? ` with ${signals}` : ""}.`);
    }

    const common = new Map();
    entries.forEach((entry) => (entry.profile.categories || []).forEach((category) => {
      if (categoryWeight(category) > 0) common.set(category, (common.get(category) || 0) + 1);
    }));
    const strongestCommon = [...common.entries()].sort((left, right) => right[1] - left[1] || categoryWeight(right[0]) - categoryWeight(left[0]))[0];
    if (strongestCommon && strongestCommon[1] >= 3) explanations.push(`${strongestCommon[1]}/${entries.length} units share the ${categoryLabel(strongestCommon[0])} tag.`);
    if (officialSource && metrics.officialBonus >= 4) explanations.push(`The formation substantially overlaps the in-game recommendation “${officialSource.name}.”`);
    return explanations;
  }

  function evaluateTeam(units, leaderId, model, includeExplanations = true) {
    const entries = units.map((unit) => ({ unit, profile: profileFor(model, unit) }));
    const leader = entries.find((entry) => entry.unit.id === leaderId) || entries[0];
    const teammates = entries.filter((entry) => entry !== leader);
    const leaderAbilities = (leader.profile.abilities || []).filter((ability) => ability.kind === "leader");
    let coverageTotal = 0;
    let leadershipImpact = 0;
    teammates.forEach((teammate) => {
      const matches = leaderAbilities.map((ability) => ({ match: abilityMatch(ability, teammate.profile, teammate.unit.id), impact: ability.impact || 1 }));
      const best = matches.sort((left, right) => (right.match * right.impact) - (left.match * left.impact))[0];
      if (best?.match) {
        coverageTotal += 1;
        leadershipImpact += Math.min(1, best.impact / 8);
      }
    });
    const teammateCount = Math.max(1, teammates.length);
    const coverage = coverageTotal / teammateCount;
    const leadership = clamp(30 + coverage * 50 + (leadershipImpact / teammateCount) * 20);

    let pairTotal = 0;
    let sharedTotal = 0;
    let mechanicsTotal = 0;
    let pairCount = 0;
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const category = sharedCategoryScore(entries[left].profile, entries[right].profile);
        const teamUp = sharedTeamUpScore(entries[left].profile, entries[right].profile);
        const abilities = directedAbilityScore(entries[left].profile, entries[right].profile, entries[right].unit.id, entries[left] === leader)
          + directedAbilityScore(entries[right].profile, entries[left].profile, entries[left].unit.id, entries[right] === leader);
        sharedTotal += category;
        mechanicsTotal += teamUp + abilities;
        pairTotal += category + teamUp + abilities;
        pairCount += 1;
      }
    }
    const cohesion = clamp(20 + (sharedTotal / Math.max(1, pairCount * 15)) * 80);
    const mechanics = clamp(20 + (mechanicsTotal / Math.max(1, pairCount * 34)) * 80);
    const official = officialSquadBonus(entries.map((entry) => entry.unit.id), model?.officialSquads);
    const balance = roleBalance(units);
    const exactScore = clamp(leadership * 0.44 + cohesion * 0.31 + mechanics * 0.25 + official.value + balance, 0, 99);
    const pairStrength = pairTotal / Math.max(1, pairCount);
    const score = Math.round(exactScore);
    const metrics = { score, exactScore: Number(exactScore.toFixed(2)), leadership: Math.round(leadership), cohesion: Math.round(cohesion), mechanics: Math.round(mechanics), officialBonus: official.value, roleBalance: balance, pairStrength: Number(pairStrength.toFixed(2)), raw: exactScore * 100 + mechanics + pairStrength };
    return {
      ...metrics,
      explanations: includeExplanations ? teamExplanations(entries, leader, metrics, official.source) : [],
      strongFor: includeExplanations ? unique(entries.flatMap((entry) => entry.profile.abilities || []).flatMap((ability) => ability.signals || [])).slice(0, 4) : []
    };
  }

  function optimize(options) {
    const characters = options.characters || [];
    const model = options.synergyModel || { units: {}, officialSquads: [], quality: "category-tags-only" };
    const size = options.size || 5;
    const resultLimit = Math.max(1, Math.min(20, Math.round(Number(options.limit) || 3)));
    const candidateLimit = Math.max(resultLimit, Math.min(100, Math.round(Number(options.candidateLimit) || resultLimit)));
    const sortBy = ["overall", "leadership", "cohesion", "gp"].includes(options.sortBy) ? options.sortBy : "overall";
    const unitGpById = options.unitGpById || {};
    const requiredIds = unique(options.requiredIds || []);
    const excluded = new Set(options.excludedIds || []);
    const characterById = new Map(characters.map((unit) => [unit.id, unit]));
    const required = requiredIds.map((id) => characterById.get(id)).filter(Boolean);
    if (required.length > size || required.some((unit) => excluded.has(unit.id))) return [];

    let leaders = options.leaderId
      ? [characterById.get(options.leaderId)].filter(Boolean)
      : characters.filter((unit) => unit.canLead && !excluded.has(unit.id));
    leaders = leaders.filter((leader) => !excluded.has(leader.id));
    if (!options.leaderId) {
      leaders = leaders
        .map((leader) => {
          const entry = { unit: leader, profile: profileFor(model, leader) };
          const requiredAffinity = required.reduce((total, unit) => total + pairScore(entry, { unit, profile: profileFor(model, unit) }, true, false), 0);
          const leaderAbilities = (entry.profile.abilities || []).filter((ability) => ability.kind === "leader");
          const potentialCoverage = characters.reduce((total, unit) => total + (leaderAbilities.some((ability) => abilityMatch(ability, profileFor(model, unit), unit.id) > 0) ? 1 : 0), 0);
          const leaderImpact = leaderAbilities.reduce((best, ability) => Math.max(best, ability.impact || 0), 0);
          return { leader, potential: requiredAffinity * 8 + potentialCoverage + leaderImpact * 5 };
        })
        .sort((left, right) => right.potential - left.potential || left.leader.name.localeCompare(right.leader.name))
        .slice(0, required.length ? 26 : 34)
        .map((entry) => entry.leader);
    }
    const allResults = [];

    leaders.forEach((leader) => {
      const startingUnits = unique([leader.id, ...required.map((unit) => unit.id)]).map((id) => characterById.get(id));
      if (startingUnits.length > size) return;
      const leaderEntry = { unit: leader, profile: profileFor(model, leader) };
      const startingEntries = startingUnits.map((unit) => ({ unit, profile: profileFor(model, unit) }));
      const candidates = characters
        .filter((unit) => !excluded.has(unit.id) && !startingUnits.some((selected) => selected.id === unit.id))
        .map((unit) => {
          const entry = { unit, profile: profileFor(model, unit) };
          const affinity = startingEntries.reduce((total, selected) => total + pairScore(selected, entry, selected.unit.id === leader.id, false), 0);
          const official = officialSquadBonus([...startingUnits.map((selected) => selected.id), unit.id], model.officialSquads).value;
          return { unit, affinity: affinity + official + pairScore(leaderEntry, entry, true, false) };
        })
        .sort((left, right) => right.affinity - left.affinity || left.unit.name.localeCompare(right.unit.name))
        .slice(0, 16)
        .map((entry) => entry.unit);

      let beams = [{ units: startingUnits, metrics: evaluateTeam(startingUnits, leader.id, model, false) }];
      while (beams[0]?.units.length < size) {
        const expanded = [];
        beams.forEach((beam) => candidates.forEach((candidate) => {
          if (beam.units.some((unit) => unit.id === candidate.id)) return;
          const units = [...beam.units, candidate];
          expanded.push({ units, metrics: evaluateTeam(units, leader.id, model, false) });
        }));
        const seen = new Set();
        beams = expanded
          .sort((left, right) => right.metrics.score - left.metrics.score || right.metrics.raw - left.metrics.raw)
          .filter((beam) => {
            const key = beam.units.map((unit) => unit.id).sort().join("|");
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, Math.max(12, candidateLimit));
        if (!beams.length) break;
      }
      beams.slice(0, options.leaderId ? candidateLimit : Math.max(3, Math.ceil(candidateLimit / Math.max(1, leaders.length)) + 2)).forEach((beam) => {
        const ordered = [leader, ...beam.units.filter((unit) => unit.id !== leader.id)];
        allResults.push({ leader, units: ordered, metrics: evaluateTeam(ordered, leader.id, model), teamGp: teamGalacticPower(ordered, unitGpById) });
      });
    });

    const seen = new Set();
    return allResults
      .sort((left, right) => compareMetricResults(left, right, sortBy))
      .filter((result) => {
        const key = result.units.map((unit) => unit.id).sort().join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, resultLimit)
      .map((result, index) => ({
        id: `synergy-${result.leader.id}-${index + 1}`,
        model: "synergy",
        leaderId: result.leader.id,
        members: result.units.map((unit) => unit.id),
        score: result.metrics.score,
        exactScore: result.metrics.exactScore,
        leadership: result.metrics.leadership,
        cohesion: result.metrics.cohesion,
        mechanics: result.metrics.mechanics,
        officialBonus: result.metrics.officialBonus,
        roleBalance: result.metrics.roleBalance,
        pairStrength: result.metrics.pairStrength,
        teamGp: result.teamGp.value,
        teamGpComplete: result.teamGp.complete,
        sortedBy: sortBy,
        explanations: result.metrics.explanations,
        strongFor: result.metrics.strongFor,
        dataQuality: model.quality || "category-tags-only"
      }));
  }

  return { optimize, evaluateTeam, leaderSynergyGroups };
});
