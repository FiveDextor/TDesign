// Add a new game by copying one block. The key (tdx, custom...) must be unique.
const GAMES = {
  tdx: {
    name: "Tower Defense X",
    towers: [
      // Confirmed from the wiki and tier lists
      { name: "AA Turret" },
      { name: "Armored Factory" },
      { name: "Artillery" },
      { name: "Barracks" },
      { name: "Behemoth Factory" },
      { name: "Combat Drone" },
      { name: "Commander" },
      { name: "Cryo Blaster" },
      { name: "Cryo Ranger" },
      { name: "EDJ" },
      { name: "Farm" },
      { name: "Ghost" },
      { name: "Golden Juggernaut" },
      { name: "Golden Mine Layer" },
      { name: "Golden Mobster" },
      { name: "Golden Ranger" },
      { name: "Helicopter" },
      { name: "John" },
      { name: "Juggernaut" },
      { name: "Laser Gunner" },
      { name: "Machine Gunner" },
      { name: "Medic" },
      { name: "Mine Layer" },
      { name: "Missile Trooper" },
      { name: "Operator" },
      { name: "Patrol Boat" },
      { name: "Railgunner" },
      { name: "Ranger" },
      { name: "Refractor" },
      { name: "Scarecrow" },
      { name: "Sentry" },
      { name: "Shotgunner" },
      { name: "Slammer" },
      { name: "Sniper" },
      { name: "Toxicnator" },
      { name: "War Machine Factory" },
      { name: "Warship" },
      { name: "XWM Turret" },
      { name: "Zed" },

      // Event towers
      { name: "Aviator" },
      { name: "Bubble Blower" },
      { name: "Chicken House" },
      { name: "Cryo Mortar" },
      { name: "Golden Warship" },
      { name: "MLRS" },
      { name: "Phaser" },
      { name: "Psycho Slayer" },
      { name: "Scout" },
      { name: "Shock Trooper" },
      { name: "Void Traitor" },

      // Less sure: seen on wiki pages, but I couldn't confirm they're towers
      { name: "Combat Medic" },
      { name: "Grenadier" },
      { name: "Jet Trooper" },
      { name: "Noob Tuber" },
      { name: "Oil Derrick" },
      { name: "Scout Helicopter" },
      { name: "Shield Tower" },
      { name: "Stinger" },
      { name: "Troll Tower" }
    ]
  },
  custom: {
    name: "Example Game (edit me)",
    towers: [
      { name: "Example Tower A" },
      { name: "Example Tower B" }
    ]
  }
};

const ACTIONS = [
  { id: "place",    label: "Place",      fields: ["tower"] },
  { id: "place_at", label: "Place at",   fields: ["tower", "time"] },
  { id: "skip",     label: "Skip waves", fields: ["time"] },
  { id: "other",    label: "Other",      fields: ["text"] }
];