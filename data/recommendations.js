window.ForgeData = window.ForgeData || {};

const empireRequirements = {
  minimum: {
    label: "Minimum viable for this context",
    units: [
      { id: "emperor-palpatine", metrics: [["Relic", "R3+"], ["Speed", "245+"], ["Leader zeta", "Required"]] },
      { id: "mara-jade", metrics: [["Gear", "G12+"], ["Speed", "290+"], ["Potency", "60%+"]] },
      { id: "darth-vader", metrics: [["Relic", "R5+"], ["Speed", "240+"], ["Merciless zeta", "Required"]] }
    ],
    turnOrder: ["mara-jade", "emperor-palpatine", "darth-vader"],
    relation: "Mara Jade must act before Emperor Palpatine"
  },
  recommended: {
    label: "Recommended for this matchup",
    units: [
      { id: "emperor-palpatine", metrics: [["Relic", "R5+"], ["Speed", "270+"], ["Health", "70,000+"]] },
      { id: "mara-jade", metrics: [["Relic", "R5+"], ["Speed", "310+"], ["Potency", "70%+"], ["Zeta", "Required"], ["Omicron", "Optional"]] },
      { id: "darth-vader", metrics: [["Relic", "R7"], ["Speed", "255+"], ["Offense", "7,500+"]] }
    ],
    turnOrder: ["mara-jade", "emperor-palpatine", "darth-vader"],
    relation: "Mara Jade speed ≥ enemy Reva speed + 15"
  },
  safe: {
    label: "Safer target for low-variance play",
    units: [
      { id: "emperor-palpatine", metrics: [["Relic", "R7"], ["Speed", "285+"], ["Protection", "75,000+"]] },
      { id: "mara-jade", metrics: [["Relic", "R7"], ["Speed", "330+"], ["Potency", "85%+"], ["6-dot mods", "Recommended"]] },
      { id: "darth-vader", metrics: [["Relic", "R8"], ["Speed", "270+"], ["Offense", "8,500+"]] }
    ],
    turnOrder: ["mara-jade", "emperor-palpatine", "darth-vader"],
    relation: "Mara Jade speed ≥ enemy Reva speed + 25"
  }
};

window.ForgeData.squadRecommendations = [
  {
    id: "empire-control",
    leaderId: "emperor-palpatine",
    members: ["emperor-palpatine", "mara-jade", "darth-vader", "grand-admiral-thrawn", "royal-guard"],
    score: 94, win: 96, reliability: 92, investment: "Low", modDifficulty: "Medium", rng: "Low",
    why: "Palpatine's leadership enables an Empire and Sith turn-meter engine while Mara Jade provides early control and a dense stack of debuffs. Vader converts that opening into burst damage, with Thrawn controlling the most dangerous enemy and Royal Guard absorbing pressure.",
    strongFor: ["GAC offense", "Territory Wars", "General PvP"],
    substitute: { outId: "grand-admiral-thrawn", inId: "grand-moff-tarkin", score: 88, note: "Keeps the Empire core intact with less control." },
    upgrade: { outId: "royal-guard", inId: "darth-malgus", delta: 3 },
    requirements: empireRequirements
  },
  {
    id: "vader-lead",
    leaderId: "darth-vader",
    members: ["darth-vader", "emperor-palpatine", "mara-jade", "grand-admiral-thrawn", "royal-guard"],
    score: 91, win: 93, reliability: 88, investment: "Low", modDifficulty: "High", rng: "Medium",
    why: "Vader's lead emphasizes debuff pressure and damage over time. Mara Jade establishes control early, then Vader cycles Merciless Massacre while Palpatine capitalizes on every debuff and shock.",
    strongFor: ["Conquest", "Galactic Challenges", "GAC offense"],
    substitute: { outId: "royal-guard", inId: "grand-moff-tarkin", score: 87, note: "Faster control, but loses the defensive safety net." },
    requirements: empireRequirements
  },
  {
    id: "revan-jedi",
    leaderId: "jedi-knight-revan",
    members: ["jedi-knight-revan", "bastila-shan", "jolee-bindo", "grand-master-yoda", "general-kenobi"],
    score: 89, win: 90, reliability: 94, investment: "Medium", modDifficulty: "Medium", rng: "Low",
    why: "Revan directs the opening around a priority target, Bastila supplies buffs, and Grand Master Yoda spreads them across the squad. Jolee adds recovery while General Kenobi protects the engine.",
    strongFor: ["Territory Battles", "Assault Battles", "General PvE"],
    substitute: { outId: "general-kenobi", inId: "hermit-yoda", score: 86, note: "More offense and recovery, less protection." },
    requirements: {
      minimum: { label: "Minimum viable for this context", units: [{ id: "jedi-knight-revan", metrics: [["Relic", "R3+"], ["Speed", "270+"]] }, { id: "grand-master-yoda", metrics: [["Relic", "R3+"], ["Offense", "6,500+"]] }], turnOrder: ["jedi-knight-revan", "bastila-shan", "grand-master-yoda"], relation: "Revan must act before Grand Master Yoda" },
      recommended: { label: "Recommended for this matchup", units: [{ id: "jedi-knight-revan", metrics: [["Relic", "R5+"], ["Speed", "300+"]] }, { id: "jolee-bindo", metrics: [["Relic", "R5+"], ["Health", "90,000+"]] }], turnOrder: ["jedi-knight-revan", "bastila-shan", "grand-master-yoda"], relation: "Bastila Shan speed ≥ Grand Master Yoda speed + 10" },
      safe: { label: "Safer target for low-variance play", units: [{ id: "jedi-knight-revan", metrics: [["Relic", "R7"], ["Speed", "315+"]] }, { id: "jolee-bindo", metrics: [["Relic", "R7"], ["Health", "110,000+"]] }], turnOrder: ["jedi-knight-revan", "bastila-shan", "grand-master-yoda"], relation: "Revan opens before the fastest enemy" }
    }
  },
  {
    id: "cls-rebels",
    leaderId: "commander-luke",
    members: ["commander-luke", "han-solo", "chewbacca", "c-3po", "chewpio"],
    score: 87, win: 91, reliability: 86, investment: "Medium", modDifficulty: "Medium", rng: "Medium",
    why: "Han guarantees an opening action, Luke controls turn meter, and Chewbacca protects the squad's core. C-3PO and Threepio & Chewie amplify exposes, assists, and sustained damage.",
    strongFor: ["GAC offense", "Conquest", "Territory Battles"],
    substitute: { outId: "c-3po", inId: "old-daka", score: 79, note: "Demo-only fallback that trades synergy for recovery." },
    requirements: {
      minimum: { label: "Minimum viable for this context", units: [{ id: "commander-luke", metrics: [["Relic", "R3+"], ["Speed", "250+"]] }, { id: "han-solo", metrics: [["Relic", "R5+"], ["Critical damage", "192%+"]] }], turnOrder: ["han-solo", "commander-luke", "c-3po"], relation: "Han Solo opens with Shoots First" },
      recommended: { label: "Recommended for this matchup", units: [{ id: "commander-luke", metrics: [["Relic", "R5+"], ["Speed", "275+"]] }, { id: "chewbacca", metrics: [["Relic", "R6+"], ["Tenacity", "80%+"]] }], turnOrder: ["han-solo", "commander-luke", "c-3po"], relation: "Luke acts before the target's second turn" },
      safe: { label: "Safer target for low-variance play", units: [{ id: "commander-luke", metrics: [["Relic", "R7"], ["Speed", "290+"]] }, { id: "han-solo", metrics: [["Relic", "R8"], ["Offense", "8,000+"]] }], turnOrder: ["han-solo", "commander-luke", "c-3po"], relation: "Luke maintains turn-meter control" }
    }
  },
  {
    id: "grievous-droids",
    leaderId: "general-grievous",
    members: ["general-grievous", "b1-battle-droid", "b2-super-battle-droid", "magma-guard", "nute-gunray"],
    score: 84, win: 87, reliability: 82, investment: "Medium", modDifficulty: "Low", rng: "Medium",
    why: "Grievous converts allied droid losses into bonus turns and escalating pressure. B1 sustains the team, B2 disrupts enemy buffs, and MagnaGuard protects the damage engine.",
    strongFor: ["GAC defense", "Territory Wars", "General PvP"],
    substitute: { outId: "nute-gunray", inId: "grand-moff-tarkin", score: 76, note: "A demo fallback; a dedicated Separatist droid is preferred." },
    requirements: {
      minimum: { label: "Minimum viable for this context", units: [{ id: "general-grievous", metrics: [["Relic", "R5+"], ["Health", "100,000+"]] }, { id: "b1-battle-droid", metrics: [["Relic", "R3+"], ["Offense", "7,000+"]] }], turnOrder: ["b1-battle-droid", "b2-super-battle-droid", "general-grievous"], relation: "B1 should act before General Grievous" },
      recommended: { label: "Recommended for this matchup", units: [{ id: "general-grievous", metrics: [["Relic", "R7"], ["Health", "130,000+"]] }, { id: "b1-battle-droid", metrics: [["Relic", "R5+"], ["Offense", "8,500+"]] }], turnOrder: ["b1-battle-droid", "b2-super-battle-droid", "general-grievous"], relation: "B1 speed ≥ 280" },
      safe: { label: "Safer target for low-variance play", units: [{ id: "general-grievous", metrics: [["Relic", "R8"], ["Health", "150,000+"]] }, { id: "b1-battle-droid", metrics: [["Relic", "R7"], ["Offense", "9,500+"]] }], turnOrder: ["b1-battle-droid", "b2-super-battle-droid", "general-grievous"], relation: "B1 takes the first allied action" }
    }
  }
];

window.ForgeData.fleetRecommendations = [
  {
    id: "executor-standard", capitalShipId: "executor",
    starters: ["punishing-one", "razor-crest", "hounds-tooth"],
    reinforcements: ["xanadu-blood", "slave-i", "ig-2000", "tie-bomber"],
    score: 95, win: 94, reliability: 93, investment: "High", rng: "Low",
    why: "The opening lineup combines contract acceleration, durable marks, and immediate pressure. Xanadu Blood is called first to reinforce breach control; later calls convert that advantage into a decisive ultimate race.",
    requirements: {
      minimum: { ship: [["Stars", "7★"], ["Hound's Tooth speed", "150+"]], pilot: [["Bossk", "R5+"], ["Pilot zeta", "Required"]], relation: "Punishing One acts before Razor Crest" },
      recommended: { ship: [["Stars", "7★"], ["Hound's Tooth speed", "160+"], ["Abilities", "Maxed"]], pilot: [["Bossk", "R7+"], ["6-dot mods", "Recommended"]], relation: "Punishing One speed ≥ Razor Crest speed + 5" },
      safe: { ship: [["Stars", "7★"], ["Hound's Tooth speed", "170+"], ["Abilities", "Maxed"]], pilot: [["Bossk", "R8"], ["6-dot mods", "All slots"]], relation: "Executor reaches ultimate before the opponent" }
    }
  },
  {
    id: "profundity-rebels", capitalShipId: "profundity",
    starters: ["millennium-falcon", "outrider", "y-wing-rebel"],
    reinforcements: ["phantom-ii", "ghost"],
    score: 91, win: 92, reliability: 87, investment: "High", rng: "Medium",
    why: "Outrider builds Download progress while the Rebel Y-wing protects the opening. Han's Millennium Falcon chains assists and keeps the fleet's damage moving through enemy disruption.",
    requirements: {
      minimum: { ship: [["Stars", "7★"], ["Outrider speed", "175+"]], pilot: [["Han Solo", "R6+"], ["Dash Rendar", "R7+"]], relation: "Outrider acts before Millennium Falcon" },
      recommended: { ship: [["Stars", "7★"], ["Outrider speed", "185+"]], pilot: [["Han Solo", "R8"], ["Dash Rendar", "R7+"]], relation: "Phantom II is the first reinforcement" },
      safe: { ship: [["Stars", "7★"], ["Abilities", "Maxed"]], pilot: [["Key pilots", "R8+"], ["6-dot mods", "All slots"]], relation: "Download reaches 100% before enemy ultimate" }
    }
  },
  {
    id: "negotiator-gr", capitalShipId: "negotiator",
    starters: ["anakin-eta", "btl-y-wing", "ahsoka-starfighter"],
    reinforcements: ["plo-koon-starfighter"],
    score: 87, win: 88, reliability: 90, investment: "Medium", rng: "Low",
    why: "The Y-wing anchors the fleet while Anakin supplies burst damage and Ahsoka strips key buffs. Plo Koon's reinforcement restores protection and stabilizes difficult openings.",
    requirements: {
      minimum: { ship: [["Stars", "7★"], ["Anakin speed", "180+"]], pilot: [["General Kenobi", "R7"], ["Jedi Knight Anakin", "R5+"]], relation: "Anakin acts before Ahsoka" },
      recommended: { ship: [["Stars", "7★"], ["Anakin speed", "190+"]], pilot: [["General Kenobi", "R8"], ["Jedi Knight Anakin", "R7+"]], relation: "Plo Koon reinforces after first damage cycle" },
      safe: { ship: [["Abilities", "Maxed"], ["Anakin speed", "195+"]], pilot: [["Core pilots", "R8+"], ["6-dot mods", "All slots"]], relation: "Negotiator takes the first capital-ship turn" }
    }
  }
];

window.ForgeData.counterRecommendations = {
  squad: [
    { id: "counter-slk", leaderId: "supreme-leader-kylo", members: ["supreme-leader-kylo", "kylo-ren-unmasked", "hux", "darth-vader", "grand-admiral-thrawn"], success: 92, confidence: "High", sample: 1428, investment: "High", note: "Control Krrsantan's taunt, build ultimate charge safely, then isolate Jabba's support core. Save the stun for the first dangerous payout turn.", requirements: "R7+ core; 540+ SLKR speed recommended for this demo matchup." },
    { id: "counter-jml", leaderId: "jedi-master-luke", members: ["jedi-master-luke", "jedi-knight-luke", "jedi-knight-revan", "hermit-yoda", "grand-master-yoda"], success: 88, confidence: "Medium", sample: 816, investment: "High", note: "Direct granted abilities through the Jedi core and remove Boushh Leia early. The route is stable when the opening turn order is met.", requirements: "JML R8+; Revan 310+ speed recommended for this demo matchup." },
    { id: "counter-cls", leaderId: "commander-luke", members: ["commander-luke", "han-solo", "chewbacca", "c-3po", "chewpio"], success: 74, confidence: "Medium", sample: 504, investment: "Medium", note: "A higher-variance option. Use opening control to remove the weakest support and keep turn meter focused on one target.", requirements: "R7 attackers; 280+ Luke speed; datacron effects not modeled." }
  ],
  fleet: [
    { id: "counter-executor", capitalShipId: "executor", starters: ["punishing-one", "razor-crest", "hounds-tooth"], reinforcements: ["xanadu-blood", "slave-i", "ig-2000"], success: 89, confidence: "High", sample: 974, investment: "High", note: "Mark the priority attacker and call Xanadu Blood first. Preserve Razor Crest until contract activation, then race the opposing ultimate.", requirements: "7★ Executor; R8 Piett; recommended starter speeds shown in requirements." },
    { id: "counter-profundity", capitalShipId: "profundity", starters: ["millennium-falcon", "outrider", "y-wing-rebel"], reinforcements: ["phantom-ii", "ghost"], success: 82, confidence: "Medium", sample: 611, investment: "High", note: "Build Download quickly and avoid spreading damage before the opening target is controlled. Phantom II should reinforce first.", requirements: "7★ Profundity; R9 Raddus; relic 8+ core pilots recommended." }
  ]
};

window.ForgeData.rosterTeams = [
  { name: "Empire Control", leaderId: "emperor-palpatine", members: ["emperor-palpatine", "mara-jade", "darth-vader", "grand-admiral-thrawn", "royal-guard"], score: 94, status: "ready" },
  { name: "Revan Jedi", leaderId: "jedi-knight-revan", members: ["jedi-knight-revan", "bastila-shan", "jolee-bindo", "grand-master-yoda", "general-kenobi"], score: 89, status: "minor" },
  { name: "CLS Rebels", leaderId: "commander-luke", members: ["commander-luke", "han-solo", "chewbacca", "c-3po", "chewpio"], score: 87, status: "ready" },
  { name: "Grievous Droids", leaderId: "general-grievous", members: ["general-grievous", "b1-battle-droid", "b2-super-battle-droid", "magma-guard", "nute-gunray"], score: 84, status: "minor" },
  { name: "Sith Empire", leaderId: "darth-malgus", members: ["darth-malgus", "darth-revan", "darth-malak", "bastila-fallen", "reva"], score: 90, status: "major" },
  { name: "Jabba Cartel", leaderId: "jabba", members: ["jabba", "krrsantan", "boushh-leia", "skiff-lando", "embo"], score: 93, status: "ready" },
  { name: "First Order", leaderId: "supreme-leader-kylo", members: ["supreme-leader-kylo", "kylo-ren-unmasked", "hux", "bossk", "the-mandalorian"], score: 88, status: "ready" },
  { name: "Galactic Republic", leaderId: "jedi-master-kenobi", members: ["jedi-master-kenobi", "commander-ahsoka", "ahsoka-tano", "general-skywalker", "captain-rex"], score: 91, status: "ready" }
];
