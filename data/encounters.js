window.ForgeData = window.ForgeData || {};

window.ForgeData.gameModes = [
  { id: "general", label: "General" },
  { id: "gac-5v5", label: "Grand Arena 5v5" },
  { id: "gac-3v3", label: "Grand Arena 3v3" },
  { id: "tw", label: "Territory Wars" },
  { id: "tb", label: "Territory Battles" },
  { id: "arena", label: "Arena" },
  { id: "conquest", label: "Conquest" },
  { id: "raid", label: "Raid" },
  { id: "journey", label: "Journey Guide / Legendary" },
  { id: "galactic-challenge", label: "Galactic Challenge" },
  { id: "assault-battle", label: "Assault Battle" },
  { id: "special-event", label: "Special Event" },
  { id: "pve", label: "Other PvE" }
];

window.ForgeData.objectives = [
  { id: "best-overall", label: "Best overall", modes: ["all"] },
  { id: "win-chance", label: "Highest win chance", modes: ["all"] },
  { id: "low-investment", label: "Lowest investment", modes: ["all"] },
  { id: "safe", label: "Safest / least RNG", modes: ["all"] },
  { id: "banners", label: "Highest banners", modes: ["gac-5v5", "gac-3v3"] },
  { id: "defense", label: "Best defense", modes: ["gac-5v5", "gac-3v3", "tw"] },
  { id: "score", label: "Highest score", modes: ["raid"] }
];

window.ForgeData.missionCategories = [
  { id: "territory-battles", name: "Territory Battles", eyebrow: "Guild PvE", description: "Plan squads and fleets for phase-specific combat missions.", icon: "hex" },
  { id: "conquest", name: "Conquest", eyebrow: "Limited event", description: "Balance battle wins, stamina, data disks, and feats.", icon: "path" },
  { id: "raids", name: "Raids", eyebrow: "Score target", description: "Tune a formation around damage and score thresholds.", icon: "target" },
  { id: "journey", name: "Journey Guide", eyebrow: "Unlock path", description: "Compare minimum, recommended, and safe event readiness.", icon: "star" },
  { id: "challenges", name: "Challenges & Events", eyebrow: "Rotating PvE", description: "Find teams for feats, assault battles, and special events.", icon: "bolt" },
  { id: "campaign", name: "Campaign & Fleet", eyebrow: "Progression", description: "Plan campaign nodes and fleet battles.", icon: "fleet" }
];

window.ForgeData.missions = {
  "territory-battles": {
    title: "Rise of the Empire",
    selectors: [
      { label: "Planet / phase", options: ["Mustafar · Phase 1", "Geonosis · Phase 2", "Bracca · Phase 3", "Zeffo · Special"] },
      { label: "Combat mission", options: ["Dark Side combat · 5 waves", "Fleet combat · 3 waves", "Special mission · Inquisitorius"] }
    ],
    type: "squad",
    formation: ["lord-vader", "darth-vader", "grand-admiral-thrawn", "royal-guard", "mara-jade"],
    leaderId: "lord-vader",
    reliability: "High with recommended stats",
    investment: "R7–R8 core",
    note: "Open with Mara Jade, control the elite unit with Fracture, then build Lord Vader's ultimate before the final wave.",
    special: "Dark Side units only · Five-wave endurance",
    turnOrder: "Mara Jade → Grand Admiral Thrawn → Lord Vader",
    tierRequirements: {
      minimum: [["Relics", "R7 core"], ["Opening speed", "Mara Jade 300+"], ["Survival", "110k+ tank health"]],
      recommended: [["Relics", "R7–R8 core"], ["Opening speed", "Mara Jade 320+"], ["Survival", "130k+ tank health"]],
      safe: [["Relics", "R8 core"], ["Opening speed", "Mara Jade 335+"], ["Survival", "150k+ tank health"]]
    }
  },
  conquest: {
    title: "Conquest · Sector 4",
    selectors: [
      { label: "Goal", options: ["Win battle", "Earn three stars", "Preserve stamina"] },
      { label: "Additional feat", options: ["Inflict Ability Block 20 times", "Win with five Jedi", "No attackers in formation"] }
    ],
    type: "squad",
    formation: ["emperor-palpatine", "mara-jade", "darth-vader", "grand-admiral-thrawn", "royal-guard"],
    leaderId: "emperor-palpatine",
    reliability: "High feat progress",
    investment: "R5 recommended",
    note: "Mara Jade and Vader repeatedly apply Ability Block while Palpatine's turn-meter engine prolongs the battle long enough to finish the feat.",
    special: "Feat plan: avoid defeating the final enemy before 20 applications",
    turnOrder: "Mara Jade → Emperor Palpatine → Darth Vader",
    tierRequirements: {
      minimum: [["Relics", "R3+"], ["Mara Jade speed", "285+"], ["Expected battles", "2"]],
      recommended: [["Relics", "R5+"], ["Mara Jade speed", "310+"], ["Expected battles", "1–2"]],
      safe: [["Relics", "R7+"], ["Mara Jade speed", "330+"], ["Expected battles", "1"]]
    }
  },
  raids: {
    title: "Speeder Bike Pursuit",
    selectors: [
      { label: "Target score", options: ["1,500,000", "2,000,000", "2,700,000"] },
      { label: "Investment objective", options: ["Meet target cheaply", "Highest score", "Safest run"] }
    ],
    type: "squad",
    formation: ["leia-organa", "commander-luke", "han-solo", "chewbacca", "c-3po"],
    leaderId: "leia-organa",
    reliability: "1.65M projected demo score",
    investment: "R7 core",
    note: "This mock route prioritizes score multipliers and repeatable damage windows instead of a conventional win condition.",
    special: "Score projections are demo data and do not reflect live raid balance",
    turnOrder: "Leia Organa → Han Solo → Commander Luke",
    tierRequirements: {
      minimum: [["Relics", "R5 core"], ["Projected demo score", "1.50M"], ["Retries", "Several"]],
      recommended: [["Relics", "R7 core"], ["Projected demo score", "1.65M"], ["Retries", "Few"]],
      safe: [["Relics", "R8 core"], ["Projected demo score", "1.80M"], ["Retries", "Low"]]
    }
  },
  journey: {
    title: "General Skywalker · Phase 4",
    selectors: [
      { label: "Journey / event", options: ["General Skywalker", "Jedi Knight Luke", "Executor"] },
      { label: "Phase", options: ["Phase 4 · Separatist Droids", "Phase 2 · Galactic Republic", "Overview"] }
    ],
    type: "squad",
    formation: ["general-grievous", "b1-battle-droid", "b2-super-battle-droid", "magma-guard", "nute-gunray"],
    leaderId: "general-grievous",
    reliability: "Recommended tier",
    investment: "G12–R5 mix",
    note: "The recommendation focuses on turn order and survivability breakpoints. Minimum is possible with retries; the safe tier reduces opening RNG.",
    special: "Critical order: B1 → MagnaGuard → B2",
    turnOrder: "B1 Battle Droid → MagnaGuard → B2 Super Battle Droid",
    tierRequirements: {
      minimum: [["Gear", "G12+"], ["B1 offense", "7,000+"], ["Expected retries", "High"]],
      recommended: [["Gear", "R3–R5"], ["B1 offense", "8,500+"], ["Expected retries", "Medium"]],
      safe: [["Gear", "R5+"], ["B1 offense", "9,500+"], ["Expected retries", "Low"]]
    }
  },
  challenges: {
    title: "Galactic Challenge · Coruscant",
    selectors: [
      { label: "Event tier", options: ["Tier X", "Tier IX", "Tier VIII"] },
      { label: "Feat", options: ["Complete with Sith", "Win without a tank", "Apply 30 debuffs"] }
    ],
    type: "squad",
    formation: ["darth-revan", "darth-malak", "bastila-fallen", "darth-malgus", "darth-vader"],
    leaderId: "darth-revan",
    reliability: "Medium-high",
    investment: "R5+ recommended",
    note: "Fear chains contain the enemy while the team accumulates debuffs. Save Malak's drain for the last high-health target.",
    special: "Feat and win condition evaluated together",
    turnOrder: "Darth Revan → Fallen Bastila → Darth Malgus",
    tierRequirements: {
      minimum: [["Relics", "R3+"], ["Darth Revan speed", "300+"], ["Feat reliability", "Medium"]],
      recommended: [["Relics", "R5+"], ["Darth Revan speed", "325+"], ["Feat reliability", "High"]],
      safe: [["Relics", "R7+"], ["Darth Revan speed", "340+"], ["Feat reliability", "Very high"]]
    }
  },
  campaign: {
    title: "Fleet Battles · Hard 5-E",
    selectors: [
      { label: "Table", options: ["Fleet Battles", "Light Side", "Dark Side"] },
      { label: "Node", options: ["Hard 5-E", "Hard 5-D", "Normal 5-E"] }
    ],
    type: "fleet",
    capitalShipId: "negotiator",
    starters: ["anakin-eta", "btl-y-wing", "ahsoka-starfighter"],
    reinforcements: ["plo-koon-starfighter"],
    reliability: "Safe three-star path",
    investment: "7★ ships · R5 pilots",
    note: "Keep the Y-wing healthy through the opening and call Plo Koon when protection drops. Focus attackers before support ships.",
    special: "Pilot development contributes to resulting ship stats",
    turnOrder: "Anakin's Eta-2 → Ahsoka's Starfighter → Negotiator",
    tierRequirements: {
      minimum: [["Ships", "6–7★"], ["Pilots", "G12+"], ["Anakin speed", "175+"]],
      recommended: [["Ships", "7★"], ["Pilots", "R5+"], ["Anakin speed", "190+"]],
      safe: [["Ships", "7★ max abilities"], ["Pilots", "R7+"], ["Anakin speed", "195+"]]
    }
  }
};
