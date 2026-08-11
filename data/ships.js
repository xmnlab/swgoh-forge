window.ForgeData = window.ForgeData || {};

window.ForgeData.ships = [
  { id: "hounds-tooth", name: "Hound's Tooth", image: "assets/ships/hounds-tooth.png", factions: ["Bounty Hunter"], pilotId: "bossk", role: "Tank", color: "#a6894e" },
  { id: "razor-crest", name: "Razor Crest", image: "assets/ships/razor-crest.png", factions: ["Bounty Hunter"], pilotId: "the-mandalorian", role: "Attacker", color: "#73838c" },
  { id: "xanadu-blood", name: "Xanadu Blood", image: "assets/ships/xanadu-blood.png", factions: ["Bounty Hunter"], pilotName: "Cad Bane", role: "Support", color: "#6e8a96" },
  { id: "slave-i", name: "Slave I", image: "assets/ships/slave-i.png", factions: ["Bounty Hunter"], pilotName: "Boba Fett", role: "Attacker", color: "#62755e" },
  { id: "punishing-one", name: "Punishing One", image: "assets/ships/punishing-one.png", factions: ["Bounty Hunter"], pilotName: "Dengar", role: "Attacker", color: "#8c724f" },
  { id: "ig-2000", name: "IG-2000", image: "assets/ships/ig-2000.png", factions: ["Bounty Hunter", "Droid"], pilotName: "IG-88", role: "Attacker", color: "#6d777a" },
  { id: "millennium-falcon", name: "Han's Millennium Falcon", shortName: "Millennium Falcon", image: "assets/ships/millennium-falcon.png", factions: ["Rebel"], pilotId: "han-solo", role: "Attacker", color: "#777b78" },
  { id: "outrider", name: "Outrider", image: "assets/ships/outrider.png", factions: ["Rebel", "Smuggler"], pilotName: "Dash Rendar", role: "Attacker", color: "#a57b4f" },
  { id: "y-wing-rebel", name: "Rebel Y-wing", image: "assets/ships/y-wing-rebel.png", factions: ["Rebel"], pilotName: "Crewless", role: "Tank", color: "#aa7e3d" },
  { id: "phantom-ii", name: "Phantom II", image: "assets/ships/phantom-ii.png", factions: ["Rebel"], pilotName: "Spectres", role: "Attacker", color: "#796f68" },
  { id: "ghost", name: "Ghost", image: "assets/ships/ghost.png", factions: ["Rebel"], pilotName: "Spectres", role: "Attacker", color: "#95714e" },
  { id: "tie-advanced", name: "TIE Advanced x1", image: "assets/ships/tie-advanced.png", factions: ["Empire", "Sith"], pilotId: "darth-vader", role: "Attacker", color: "#607080" },
  { id: "imperial-tie", name: "Imperial TIE Fighter", image: "assets/ships/imperial-tie.png", factions: ["Empire"], pilotName: "TIE Fighter Pilot", role: "Attacker", color: "#586b78" },
  { id: "tie-bomber", name: "Imperial TIE Bomber", shortName: "TIE Bomber", image: "assets/ships/tie-bomber.png", factions: ["Empire"], pilotName: "Crewless", role: "Tank", color: "#596979" },
  { id: "tie-defender", name: "TIE Defender", image: "assets/ships/tie-defender.png", factions: ["Empire"], pilotName: "Iden Versio", role: "Attacker", color: "#5c7386" },
  { id: "anakin-eta", name: "Anakin's Eta-2 Starfighter", shortName: "Anakin's Eta-2", image: "assets/ships/anakin-eta.png", factions: ["Galactic Republic"], pilotId: "jedi-knight-anakin", role: "Attacker", color: "#8b6f42" },
  { id: "ahsoka-starfighter", name: "Ahsoka Tano's Jedi Starfighter", shortName: "Ahsoka's Starfighter", image: "assets/ships/ahsoka-starfighter.png", factions: ["Galactic Republic"], pilotId: "ahsoka-tano", role: "Attacker", color: "#8e6753" },
  { id: "btl-y-wing", name: "BTL-B Y-wing Starfighter", shortName: "BTL-B Y-wing", image: "assets/ships/btl-y-wing.png", factions: ["Galactic Republic"], pilotName: "Crewless", role: "Tank", color: "#8b744d" },
  { id: "plo-koon-starfighter", name: "Plo Koon's Jedi Starfighter", shortName: "Plo Koon's Starfighter", image: "assets/ships/plo-koon-starfighter.png", factions: ["Galactic Republic"], pilotName: "Plo Koon", role: "Support", color: "#5b7587" },
  { id: "hyena-bomber", name: "Hyena Bomber", image: "assets/ships/hyena-bomber.png", factions: ["Separatist", "Droid"], pilotName: "Crewless", role: "Tank", color: "#746f5d" },
  { id: "vulture-droid", name: "Vulture Droid", image: "assets/ships/vulture-droid.png", factions: ["Separatist", "Droid"], pilotName: "Crewless", role: "Attacker", color: "#707367" },
  { id: "sun-fac-starfighter", name: "Sun Fac's Geonosian Starfighter", shortName: "Sun Fac's Starfighter", image: "assets/ships/sun-fac-starfighter.png", factions: ["Separatist", "Geonosian"], pilotName: "Sun Fac", role: "Tank", color: "#806e59" },
  { id: "sith-fighter", name: "Sith Fighter", image: "assets/ships/sith-fighter.png", factions: ["Sith Empire"], pilotName: "Sith Marauder", role: "Attacker", color: "#793f55" },
  { id: "mark-vi-interceptor", name: "Mark VI Interceptor", image: "assets/ships/mark-vi-interceptor.png", factions: ["Sith Empire"], pilotName: "Crewless", role: "Support", color: "#65485e" },
  { id: "tie-dagger", name: "TIE Dagger", image: "assets/ships/tie-dagger.png", factions: ["Sith Empire"], pilotName: "Sith Trooper", role: "Attacker", color: "#694452" },
  { id: "first-order-tie", name: "First Order TIE Fighter", image: "assets/ships/first-order-tie.png", factions: ["First Order"], pilotName: "FOTP", role: "Attacker", color: "#56636d" },
  { id: "tie-silencer", name: "TIE Silencer", image: "assets/ships/tie-silencer.png", factions: ["First Order"], pilotId: "kylo-ren-unmasked", role: "Attacker", color: "#4e5c68" },
  { id: "resistance-x-wing", name: "Resistance X-wing", image: "assets/ships/resistance-x-wing.png", factions: ["Resistance"], pilotName: "Resistance Pilot", role: "Attacker", color: "#5e7690" }
];

window.ForgeData.capitalShips = [
  { id: "executor", name: "Executor", image: "assets/capital-ships/executor.png", factions: ["Bounty Hunter", "Empire"], commanderId: "admiral-piett", commanderName: "Admiral Piett", color: "#8d7c67" },
  { id: "leviathan", name: "Leviathan", image: "assets/capital-ships/leviathan.png", factions: ["Sith Empire"], commanderName: "Darth Revan", color: "#754357" },
  { id: "profundity", name: "Profundity", image: "assets/capital-ships/profundity.png", factions: ["Rebel"], commanderName: "Admiral Raddus", color: "#5d7f91" },
  { id: "negotiator", name: "Negotiator", image: "assets/capital-ships/negotiator.png", factions: ["Galactic Republic"], commanderId: "general-kenobi", color: "#8b7560" },
  { id: "malevolence", name: "Malevolence", image: "assets/capital-ships/malevolence.png", factions: ["Separatist"], commanderId: "general-grievous", color: "#6d6e6a" },
  { id: "finalizer", name: "Finalizer", image: "assets/capital-ships/finalizer.png", factions: ["First Order"], commanderName: "General Hux", color: "#5f6871" },
  { id: "raddus", name: "Raddus", image: "assets/capital-ships/raddus.png", factions: ["Resistance"], commanderName: "Amilyn Holdo", color: "#657b91" },
  { id: "executrix", name: "Executrix", image: "assets/capital-ships/executrix.png", factions: ["Empire"], commanderId: "grand-moff-tarkin", color: "#606b73" },
  { id: "home-one", name: "Home One", image: "assets/capital-ships/home-one.png", factions: ["Rebel"], commanderName: "Admiral Ackbar", color: "#8a725b" },
  { id: "endurance", name: "Endurance", image: "assets/capital-ships/endurance.png", factions: ["Galactic Republic"], commanderName: "Mace Windu", color: "#78627a" }
];
