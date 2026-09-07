// ---------------------------------------------------------------------------
// Crownhold - game data definitions
// ---------------------------------------------------------------------------
'use strict';

const DATA = {};

DATA.CELL = 2;                                  // metres per grid cell
DATA.GRID = 140;                                // cells per side (280m map)
DATA.MAP_HALF = DATA.GRID * DATA.CELL / 2 - 1;  // hard clamp for unit positions
DATA.BUILD_RADIUS = 92;                         // max |x|,|z| for building placement (metres)
DATA.SPAWN_RADIUS = DATA.MAP_HALF - 1;          // enemy spawn ring radius: the very edge of the map

DATA.difficulties = {
  easy:   { label: 'Easy',   hp: 0.75, dmg: 0.75, budget: 0.75, gold: 1.25 },
  normal: { label: 'Normal', hp: 1.0,  dmg: 1.0,  budget: 1.0,  gold: 1.0 },
  hard:   { label: 'Hard',   hp: 1.3,  dmg: 1.25, budget: 1.3,  gold: 0.9 },
};

// ---------------------------------------------------------------------------
// Abilities (heroes / king / bosses)
// ---------------------------------------------------------------------------
DATA.abilities = {
  shield_bash: { name: 'Shield Bash', key: 'Q', cd: 8, desc: 'Slam enemies in a cone ahead for 90 damage and stun them for 2.5s.', aim: 'dir' },
  war_cry:     { name: 'War Cry', key: 'E', cd: 25, desc: 'Allies within 14m gain +40% damage for 10s and heal 80 (you heal 150).', aim: 'self' },
  multishot:   { name: 'Multishot', key: 'Q', cd: 6, desc: 'Fire a fan of 7 arrows in front of you.', aim: 'dir' },
  arrow_rain:  { name: 'Arrow Rain', key: 'E', cd: 20, desc: 'Rain arrows on a 7m circle at the aim point: 6 volleys of 22 damage.', aim: 'point' },
  meteor:      { name: 'Meteor', key: 'Q', cd: 15, desc: 'Call a meteor onto the aim point after 1.2s: 260 damage in 6m.', aim: 'point' },
  flame_nova:  { name: 'Flame Nova', key: 'E', cd: 12, desc: 'Burst of fire around you: 90 damage in 8m and burn for 10/s over 4s.', aim: 'self' },
  holy_light:  { name: 'Holy Light', key: 'Q', cd: 14, desc: 'Heal allies within 14m for 180 (buildings for 300).', aim: 'self' },
  consecrate:  { name: 'Consecrate', key: 'E', cd: 20, desc: 'Sanctify an 8m circle at the aim point for 6s: 18 damage/s and 45% slow to enemies.', aim: 'point' },
  whirlwind:   { name: 'Whirlwind', key: 'Q', cd: 9, desc: 'Spin with the axe: 130 damage to every enemy within 4.5m.', aim: 'self' },
  bloodlust:   { name: 'Bloodlust', key: 'E', cd: 22, desc: 'For 8s attack 60% faster and move 30% faster; heal 120 at once.', aim: 'self' },
  shadowstep:  { name: 'Shadowstep', key: 'Q', cd: 10, desc: 'Blink up to 10m toward the aim point. Enemies within 3m of where you land are stunned for 1.5s.', aim: 'point' },
  smoke_bomb:  { name: 'Smoke Bomb', key: 'E', cd: 18, desc: 'A 7m cloud at the aim point for 6s: enemies inside are slowed 50% and poisoned for 14 damage/s.', aim: 'point' },
  frost_nova:  { name: 'Frost Nova', key: 'Q', cd: 12, desc: 'Freeze every enemy within 7m for 2s and deal 70 damage.', aim: 'self' },
  ice_wall:    { name: 'Ice Wall', key: 'E', cd: 25, desc: 'Raise a wall of five ice blocks across the aim point for 14s. Enemies must break or go around it.', aim: 'point' },
  call_pack:   { name: 'Call the Pack', key: 'Q', cd: 24, desc: 'Summon three wolves at your side for 20s. They follow you and savage anything nearby.', aim: 'self' },
  war_horn:    { name: 'War Horn', key: 'E', cd: 20, desc: 'Soldiers and wolves within 20m gain +30% speed and 20% damage reduction for 10s.', aim: 'self' },
  royal_decree:{ name: 'Royal Decree', key: 'Q', cd: 30, desc: 'All soldiers gain +30% damage and +25% speed for 12s.', aim: 'self' },
  rally:       { name: 'To Me!', key: 'E', cd: 0.5, desc: 'Every soldier rushes to defend the King. No cooldown.', aim: 'self' },
};

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------
DATA.heroes = {
  knight: {
    key: 'knight', name: 'Sir Aldric', title: 'the Iron Knight', role: 'Melee tank',
    hp: 600, dmg: 42, range: 2.6, cd: 0.8, armor: 0.35, speed: 6.2, radius: 0.5,
    attack: 'melee', cleave: true,
    abilities: ['shield_bash', 'war_cry'],
    passive: 'Bulwark: enemies near him prefer to attack him instead of soldiers.',
    traits: ['600 HP, 35% armor', 'Sword cleaves all enemies in reach', 'Best at holding the gate'],
    color: 0x9fb4c7, cloth: 0x2f4f8f, weapon: 'sword', helmet: true,
  },
  ranger: {
    key: 'ranger', name: 'Lyra Ashwind', title: 'the Ranger', role: 'Ranged damage',
    hp: 340, dmg: 30, range: 24, cd: 0.55, armor: 0.1, speed: 7.5, radius: 0.45,
    attack: 'ranged', projectile: 'arrow',
    abilities: ['multishot', 'arrow_rain'],
    passive: 'Fleetfoot: fastest hero. Arrows fired from first person fly straight and pierce nothing but hit hard.',
    traits: ['Long-range bow, fast fire', 'Fastest unit in the game', 'Fragile up close'],
    color: 0x6b8e4e, cloth: 0x3d5a2a, weapon: 'bow', hood: true,
  },
  pyromancer: {
    key: 'pyromancer', name: 'Magnus Ember', title: 'the Pyromancer', role: 'Area damage',
    hp: 300, dmg: 38, range: 22, cd: 1.0, armor: 0.05, speed: 6, radius: 0.45,
    attack: 'ranged', projectile: 'fireball', splash: 2.8,
    abilities: ['meteor', 'flame_nova'],
    passive: 'Inferno: fire damage ignores armor and burns.',
    traits: ['Fireballs splash in 2.8m', 'Huge burst with Meteor', 'Very fragile'],
    color: 0xc84a1e, cloth: 0x5a1a10, weapon: 'staff', robe: true, hat: true,
  },
  cleric: {
    key: 'cleric', name: 'Seraphine', title: 'the Battle Cleric', role: 'Support / healer',
    hp: 450, dmg: 26, range: 2.6, cd: 0.9, armor: 0.25, speed: 6, radius: 0.5,
    attack: 'melee',
    abilities: ['holy_light', 'consecrate'],
    passive: 'Blessing: allies within 9m regenerate 4 HP per second.',
    traits: ['Heals soldiers and walls', 'Consecrate slows a whole choke point', 'Sturdy mace fighter'],
    color: 0xf0e6c8, cloth: 0xd8b24a, weapon: 'mace', robe: true,
    aura: { radius: 9, regen: 4 },
  },
};

DATA.heroes.berserker = {
  key: 'berserker', name: 'Thorne Ironjaw', title: 'the Berserker', role: 'Melee damage',
  hp: 540, dmg: 50, range: 2.5, cd: 0.7, armor: 0.15, speed: 6.8, radius: 0.5,
  attack: 'melee', cleave: true, rage: 0.5,
  abilities: ['whirlwind', 'bloodlust'],
  passive: 'Rage: he attacks up to 50% faster the more hurt he is.',
  traits: ['Huge axe, cleaves everything in reach', 'Gets deadlier as his health drops', 'Light armour: needs a healer or walls'],
  color: 0x7a3a2a, cloth: 0x4a2a1a, weapon: 'axe', skin: 0xe0b090,
};
DATA.heroes.shadow = {
  key: 'shadow', name: 'Nyx Vael', title: 'the Shadow', role: 'Assassin',
  hp: 330, dmg: 58, range: 2.2, cd: 0.6, armor: 0.1, speed: 8.6, radius: 0.42,
  attack: 'melee', backstab: 2.0,
  abilities: ['shadowstep', 'smoke_bomb'],
  passive: 'Backstab: double damage to enemies that are not facing her.',
  traits: ['Fastest hero, deadly from behind', 'Blinks across the battlefield', 'Very fragile in a straight fight'],
  color: 0x2a2a3a, cloth: 0x1a1a26, weapon: 'dagger', hood: true, skin: 0xc9a58a,
};
DATA.heroes.frostwarden = {
  key: 'frostwarden', name: 'Ivor Hollow', title: 'the Frost Warden', role: 'Control mage',
  hp: 340, dmg: 30, range: 20, cd: 1.0, armor: 0.05, speed: 6, radius: 0.45,
  attack: 'ranged', projectile: 'frostbolt', slow: { factor: 0.4, dur: 2 },
  abilities: ['frost_nova', 'ice_wall'],
  passive: 'Chill: every bolt slows its target by 40% for 2s.',
  traits: ['Slows everything he hits', 'Freezes crowds and raises ice walls', 'Low damage on his own'],
  color: 0x9ad0f0, cloth: 0x2a4a6a, weapon: 'staff', robe: true, hat: true, skin: 0xd8e4f0, magic: true,
};
DATA.heroes.beastmaster = {
  key: 'beastmaster', name: 'Wren Ashvale', title: 'the Beastmaster', role: 'Summoner',
  hp: 400, dmg: 32, range: 3.0, cd: 0.9, armor: 0.2, speed: 6.4, radius: 0.48,
  attack: 'melee',
  abilities: ['call_pack', 'war_horn'],
  passive: 'Pack leader: wolves and soldiers within 8m of her deal +15% damage.',
  traits: ['Summons a wolf pack', 'Rallies soldiers with a war horn', 'Solid spear fighter'],
  color: 0x6a5a3a, cloth: 0x3f5a2a, weapon: 'pike', hood: true, skin: 0xe0b890,
  aura: { radius: 8, dmgMul: 1.15 },
};
DATA.heroBaseCost = 1200;   // first extra hero
DATA.heroCostGrowth = 1.5;  // each hero bought makes the next one pricier

// ---------------------------------------------------------------------------
// Player units
// ---------------------------------------------------------------------------
DATA.units = {
  king: {
    key: 'king', name: 'The King', hp: 1100, dmg: 38, range: 2.6, cd: 0.9, armor: 0.35, speed: 6, radius: 0.5,
    attack: 'melee', isKing: true, regen: 2,
    abilities: ['royal_decree', 'rally'],
    color: 0xc9a227, cloth: 0x7a1030, weapon: 'sword', crown: true,
  },
  swordsman: {
    key: 'swordsman', name: 'Swordsman', cost: 50, hp: 140, dmg: 15, range: 2.3, cd: 1.0, armor: 0.15, speed: 5.6, radius: 0.42,
    attack: 'melee', desc: 'Reliable front-line fighter.',
    color: 0x8a97a5, cloth: 0x355d9a, weapon: 'sword', helmet: true, shield: true,
  },
  archer: {
    key: 'archer', name: 'Archer', cost: 60, hp: 85, dmg: 13, range: 17, cd: 1.3, armor: 0.05, speed: 5.6, radius: 0.4,
    attack: 'ranged', projectile: 'arrow', desc: 'Ranged support. Keep them behind the walls.',
    color: 0x7d8a5a, cloth: 0x4a6a3a, weapon: 'bow', hood: true,
  },
  engineer: {
    key: 'engineer', name: 'Engineer', cost: 70, hp: 100, dmg: 6, range: 2.0, cd: 1.2, armor: 0.05, speed: 5.8, radius: 0.4,
    attack: 'melee', repair: { hps: 35, range: 4.6 }, noCap: true, maxCount: 4,
    desc: 'Repairs damaged buildings for free, 35 HP per second. Runs from enemies and does not count against the soldier cap (max 4).',
    color: 0x7a5a3a, cloth: 0x6a5a3a, weapon: 'hammer', skin: 0xe8c39e,
  },
  crossbowman: {
    key: 'crossbowman', name: 'Crossbowman', cost: 80, hp: 95, dmg: 23, range: 15, cd: 1.7, armor: 0.1, speed: 5.4, radius: 0.4,
    attack: 'ranged', projectile: 'bolt', magic: true, desc: 'Armour-piercing bolts. Slow to reload but ignores armour.',
    color: 0x6a6a7a, cloth: 0x4a3a5a, weapon: 'bow', helmet: true,
  },
  cavalry: {
    key: 'cavalry', name: 'Knight', cost: 130, hp: 230, dmg: 28, range: 2.6, cd: 1.0, armor: 0.3, speed: 8.4, radius: 0.55,
    attack: 'melee', large: true, model: 'rider', desc: 'Mounted lancer. Fast enough to run down catapults and casters.',
    color: 0xb0b8c0, cloth: 0x8a2a2a, weapon: 'pike', helmet: true,
  },
  priest: {
    key: 'priest', name: 'Priest', cost: 90, hp: 85, dmg: 5, range: 2.0, cd: 1.5, armor: 0, speed: 5.6, radius: 0.4,
    attack: 'melee', medic: { hps: 9, radius: 6 }, noCap: false, desc: 'Heals allies within 6m for 9 HP/s and follows the fighting. Does not fight.',
    color: 0xf0e6d0, cloth: 0xe8dcc0, weapon: 'staff', robe: true, hood: true,
  },
  apprentice: {
    key: 'apprentice', name: 'Apprentice', cost: 95, hp: 80, dmg: 22, range: 16, cd: 1.8, armor: 0, speed: 5.4, radius: 0.4,
    attack: 'ranged', projectile: 'fireball', splash: 2.0, magic: true, desc: 'Fireballs that splash in 2m. Fragile.',
    color: 0xb04a2a, cloth: 0x5a2a1a, weapon: 'staff', robe: true, hat: true,
  },
  wolf: {
    key: 'wolf', name: 'Wolf', hp: 95, dmg: 15, range: 1.8, cd: 0.7, armor: 0.05, speed: 8.0, radius: 0.4,
    attack: 'melee', noCap: true, summoned: true, model: 'wolf', color: 0x6a6a6a,
  },
  pikeman: {
    key: 'pikeman', name: 'Pikeman', cost: 85, hp: 180, dmg: 28, range: 3.3, cd: 1.5, armor: 0.2, speed: 5.0, radius: 0.45,
    attack: 'melee', bonusVsLarge: 1.6, desc: 'Long reach. +60% damage against large enemies and bosses.',
    color: 0x9a9a9a, cloth: 0x6b3a2a, weapon: 'pike', helmet: true,
  },
};

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------
DATA.enemies = {
  grunt:      { key: 'grunt', name: 'Raider', hp: 75, dmg: 9, range: 2.2, cd: 1.0, armor: 0, speed: 4.8, radius: 0.42, reward: 6, unlock: 1, weight: 10,
                attack: 'melee', color: 0x6b5a4a, cloth: 0x4a3626, weapon: 'axe', skin: 0x8fa86a },
  archer:     { key: 'archer', name: 'Raider Archer', hp: 55, dmg: 9, range: 15, cd: 1.5, armor: 0, speed: 4.8, radius: 0.4, reward: 8, unlock: 2, weight: 6,
                attack: 'ranged', projectile: 'arrow', color: 0x5a4a3a, cloth: 0x3a3a2a, weapon: 'bow', hood: true, skin: 0x8fa86a },
  brute:      { key: 'brute', name: 'Brute', hp: 280, dmg: 26, range: 2.6, cd: 1.4, armor: 0.15, speed: 4.0, radius: 0.6, reward: 16, unlock: 4, weight: 4,
                attack: 'melee', large: true, scale: 1.35, color: 0x5a4a3a, cloth: 0x3a2a1a, weapon: 'club', skin: 0x6f8a4f },
  pyromancer: { key: 'pyromancer', name: 'Pyromancer', hp: 95, dmg: 24, range: 16, cd: 2.4, armor: 0, speed: 4.2, radius: 0.42, reward: 20, unlock: 5, weight: 3,
                attack: 'ranged', projectile: 'fireball', splash: 2.6, magic: true, color: 0xb03a1a, cloth: 0x5a1a10, weapon: 'staff', robe: true, hat: true, skin: 0xd9b08c },
  catapult:   { key: 'catapult', name: 'Catapult', hp: 320, dmg: 45, buildingDmg: 150, range: 26, minRange: 7, cd: 5.0, armor: 0.1, speed: 2.7, radius: 1.0, reward: 45, unlock: 7, weight: 1.5,
                attack: 'artillery', projectile: 'boulder', splash: 3.2, large: true, prefersBuildings: true, model: 'catapult' },
  assassin:   { key: 'assassin', name: 'Assassin', hp: 85, dmg: 20, range: 2.0, cd: 0.55, armor: 0, speed: 8.2, radius: 0.4, reward: 15, unlock: 8, weight: 3,
                attack: 'melee', prefersHeroes: true, color: 0x2a2a35, cloth: 0x1a1a22, weapon: 'dagger', hood: true, skin: 0xc9a58a },
  shaman:     { key: 'shaman', name: 'Shaman', hp: 120, dmg: 8, range: 12, cd: 1.6, armor: 0, speed: 4.2, radius: 0.42, reward: 25, unlock: 9, weight: 2,
                attack: 'ranged', projectile: 'bolt', magic: true, kite: true, healAura: { radius: 9, hps: 10 }, color: 0x4a7a5a, cloth: 0x2a4a3a, weapon: 'staff', robe: true, skin: 0x8fa86a },
  necromancer:{ key: 'necromancer', name: 'Necromancer', hp: 150, dmg: 16, range: 16, cd: 2.0, armor: 0, speed: 4.0, radius: 0.42, reward: 32, unlock: 11, weight: 2,
                attack: 'ranged', projectile: 'deathbolt', magic: true, kite: true, summon: { type: 'skeleton', count: 3, every: 10 }, color: 0x5a3a7a, cloth: 0x2a1a3a, weapon: 'staff', robe: true, hood: true, skin: 0xb0b0c0 },
  frostwitch: { key: 'frostwitch', name: 'Frost Witch', hp: 130, dmg: 15, range: 16, cd: 1.8, armor: 0, speed: 4.2, radius: 0.42, reward: 28, unlock: 12, weight: 2,
                attack: 'ranged', projectile: 'frostbolt', slow: { factor: 0.45, dur: 2.5 }, magic: true, kite: true, slowAura: { radius: 7, factor: 0.3 }, color: 0x8ac0e0, cloth: 0x2a4a6a, weapon: 'staff', robe: true, hat: true, skin: 0xd0e0f0 },
  warg:       { key: 'warg', name: 'Warg', hp: 120, dmg: 16, range: 2.0, cd: 0.8, armor: 0.05, speed: 8.2, radius: 0.45, reward: 12, unlock: 5, weight: 3,
                attack: 'melee', model: 'wolf', color: 0x3a3a3a },
  shieldbearer:{ key: 'shieldbearer', name: 'Shieldbearer', hp: 240, dmg: 12, range: 2.2, cd: 1.2, armor: 0.5, speed: 3.8, radius: 0.48, reward: 18, unlock: 7, weight: 3,
                attack: 'melee', color: 0x7a7a80, cloth: 0x4a4a52, weapon: 'sword', helmet: true, shield: true, skin: 0x8fa86a },
  crossbow:   { key: 'crossbow', name: 'Crossbowman', hp: 70, dmg: 15, range: 16, cd: 1.9, armor: 0.05, speed: 4.5, radius: 0.4, reward: 12, unlock: 8, weight: 3,
                attack: 'ranged', projectile: 'bolt', magic: true, color: 0x5a5a6a, cloth: 0x3a3a4a, weapon: 'bow', helmet: true, skin: 0x8fa86a },
  sapper:     { key: 'sapper', name: 'Sapper', hp: 65, dmg: 5, range: 1.8, cd: 1, armor: 0, speed: 6.6, radius: 0.4, reward: 14, unlock: 5, weight: 2.5,
                attack: 'melee', prefersBuildings: true, suicide: { radius: 3.2, buildingDmg: 420, unitDmg: 60 }, color: 0x8a6a3a, cloth: 0x5a4a2a, weapon: 'club', skin: 0x8fa86a },
  harpy:      { key: 'harpy', name: 'Harpy', hp: 75, dmg: 11, range: 2.0, cd: 0.9, armor: 0, speed: 7.2, radius: 0.42, reward: 14, unlock: 12, weight: 2.5,
                attack: 'melee', flying: true, altitude: 2.6, wings: true, color: 0x7a5a8a, cloth: 0x4a3a5a, weapon: 'dagger', skin: 0xc9a58a },
  plaguebearer:{ key: 'plaguebearer', name: 'Plaguebearer', hp: 110, dmg: 10, range: 2.2, cd: 1.1, armor: 0, speed: 4.4, radius: 0.44, reward: 16, unlock: 14, weight: 2.5,
                attack: 'melee', deathCloud: { radius: 5, dps: 12, dur: 6 }, color: 0x5a7a3a, cloth: 0x3a4a2a, weapon: 'club', skin: 0x9ab070 },
  troll:      { key: 'troll', name: 'Troll', hp: 520, dmg: 36, range: 2.8, cd: 1.6, armor: 0.1, speed: 3.6, radius: 0.7, reward: 34, unlock: 15, weight: 2,
                attack: 'melee', large: true, scale: 1.7, regen: 12, color: 0x4a6a4a, cloth: 0x3a3a2a, weapon: 'club', skin: 0x5a7a5a },
  trebuchet:  { key: 'trebuchet', name: 'Trebuchet', hp: 520, dmg: 60, buildingDmg: 260, range: 34, minRange: 10, cd: 7.0, armor: 0.15, speed: 2.3, radius: 1.2, reward: 70, unlock: 16, weight: 1,
                attack: 'artillery', projectile: 'boulder', splash: 3.6, large: true, scale: 1.35, prefersBuildings: true, model: 'catapult' },
  warlock:    { key: 'warlock', name: 'Warlock', hp: 140, dmg: 18, range: 17, cd: 2.2, armor: 0, speed: 4.0, radius: 0.42, reward: 34, unlock: 18, weight: 2,
                attack: 'ranged', projectile: 'deathbolt', magic: true, kite: true, hex: { dmgMul: 0.5, dur: 5 }, color: 0x6a2a6a, cloth: 0x3a1a3a, weapon: 'staff', robe: true, hat: true, skin: 0xb090b0 },
  spiderling: { key: 'spiderling', name: 'Spiderling', hp: 45, dmg: 9, range: 1.8, cd: 0.8, armor: 0, speed: 7.0, radius: 0.36, reward: 2, unlock: 99, weight: 0,
                attack: 'melee', model: 'spider', scale: 0.55, color: 0x3a2a3a },
  skeleton:   { key: 'skeleton', name: 'Skeleton', hp: 40, dmg: 8, range: 2.0, cd: 1.0, armor: 0, speed: 5.2, radius: 0.38, reward: 1, unlock: 99, weight: 0,
                attack: 'melee', color: 0xe0e0d0, cloth: 0xe0e0d0, weapon: 'sword', skin: 0xe8e8d8, skeleton: true },
  // added later: commanders, siege, swarms, spectres
  warchief:   { key: 'warchief', name: 'Warchief', hp: 420, dmg: 24, range: 2.6, cd: 1.2, armor: 0.3, speed: 4.6, radius: 0.55, reward: 60, unlock: 8, weight: 1.2,
                attack: 'melee', large: true, scale: 1.25, warAura: { radius: 11, dmgMul: 1.25, speedMul: 1.15 }, color: 0x8a3a2a, cloth: 0x4a1a1a, weapon: 'axe', helmet: true, plume: true, skin: 0x8fa86a,
                desc: 'Commander. Enemies within 11m of him hit 25% harder and move 15% faster. Kill him first.' },
  bomber:     { key: 'bomber', name: 'Goblin Bomber', hp: 60, dmg: 34, range: 14, minRange: 3, cd: 2.6, armor: 0, speed: 5.4, radius: 0.38, reward: 18, unlock: 7, weight: 2.2,
                attack: 'ranged', projectile: 'bomb', splash: 2.6, color: 0x6a8a3a, cloth: 0x3a4a2a, weapon: 'club', hood: true, skin: 0x8fa86a, scale: 0.85,
                desc: 'Lobs bombs that splash 2.6m. Fragile: pick them off before they reach your line.' },
  wraith:     { key: 'wraith', name: 'Wraith', hp: 110, dmg: 18, range: 12, cd: 1.5, armor: 0, speed: 6.4, radius: 0.42, reward: 26, unlock: 11, weight: 1.8,
                attack: 'ranged', projectile: 'deathbolt', magic: true, flying: true, altitude: 2.2, ethereal: 0.4, color: 0xc0c8ff, cloth: 0x4a4a7a, weapon: 'dagger', hood: true, skin: 0xd0d8ff,
                desc: 'Drifts over walls. Arrows and blades do only 40% damage; magic hurts it fully.' },
  stoneguard: { key: 'stoneguard', name: 'Stone Guard', hp: 320, dmg: 22, range: 2.6, cd: 1.5, armor: 0.3, speed: 3.6, radius: 0.55, reward: 30, unlock: 9, weight: 1.6,
                attack: 'melee', large: true, scale: 1.3, arrowResist: 0.3, color: 0x7a7a72, cloth: 0x5a5a52, weapon: 'club', helmet: true, shield: true, skin: 0x9a9a8a,
                desc: 'Arrows and bolts glance off it (30% damage). Magic, blades and cannon shot work.' },
  ram:        { key: 'ram', name: 'Battering Ram', hp: 600, dmg: 40, range: 2.6, cd: 2.2, armor: 0.25, speed: 3.0, radius: 1.1, reward: 55, unlock: 8, weight: 1.2,
                attack: 'melee', large: true, prefersBuildings: true, buildingMul: 5, model: 'catapult', scale: 1.1, deathBlast: { radius: 4.5, dmg: 90 },
                desc: 'Ignores your soldiers and smashes walls for five times the damage. Explodes when destroyed.' },
  rat:        { key: 'rat', name: 'Plague Rat', hp: 28, dmg: 6, range: 1.6, cd: 0.7, armor: 0, speed: 8.4, radius: 0.3, reward: 2, unlock: 11, weight: 6,
                attack: 'melee', model: 'wolf', scale: 0.55, color: 0x5a4a3a, poisonBite: { dps: 4, dur: 3 },
                desc: 'Tiny, fast, many. Bites poison.' },
  rider:      { key: 'rider', name: 'Raider Horseman', hp: 170, dmg: 20, range: 2.6, cd: 1.0, armor: 0.15, speed: 8.6, radius: 0.55, reward: 20, unlock: 7, weight: 2,
                attack: 'melee', large: true, model: 'rider', color: 0x6a4a3a, cloth: 0x4a2a1a, weapon: 'axe', helmet: true, skin: 0x8fa86a,
                desc: 'Fast cavalry that outruns your archers and hits the back line.' },
  hydraling:  { key: 'hydraling', name: 'Hydraling', hp: 90, dmg: 14, range: 2.0, cd: 0.9, armor: 0, speed: 6.4, radius: 0.4, reward: 4, unlock: 99, weight: 0,
                attack: 'melee', model: 'wolf', scale: 0.8, color: 0x3a7a3a },
  // bosses
  warbringer: { key: 'warbringer', name: 'Orc Warbringer', boss: true, hp: 3800, dmg: 70, range: 3.2, cd: 1.6, armor: 0.25, speed: 4.4, radius: 1.0, reward: 620,
                attack: 'melee', large: true, scale: 2.2, cleave: true, warhorn: { every: 18, radius: 30, dur: 8 }, charge: { every: 11, range: 20 },
                color: 0x7a3a2a, cloth: 0x3a1a1a, weapon: 'axe', helmet: true, plume: true, skin: 0x6f8a4f },
  hydra:      { key: 'hydra', name: 'The Hydra', boss: true, hp: 5200, dmg: 50, range: 14, cd: 1.6, armor: 0.15, speed: 4.0, radius: 1.5, reward: 780,
                attack: 'ranged', projectile: 'acid', splash: 3, magic: true, large: true, model: 'dragon', noWings: true, scale: 1.25, regen: 18, split: { count: 2 },
                color: 0x2a6a3a, cloth: 0x1a3a2a },
  stormcaller:{ key: 'stormcaller', name: 'The Stormcaller', boss: true, hp: 3100, dmg: 40, range: 20, cd: 1.3, armor: 0.1, speed: 3.8, radius: 0.7, reward: 640,
                attack: 'ranged', projectile: 'deathbolt', magic: true, large: true, scale: 1.6, lightning: { every: 9, dmg: 320, radius: 3.5, range: 42 }, blink: { every: 16, dist: 12 },
                color: 0x3a4a7a, cloth: 0x1a2040, weapon: 'staff', robe: true, hat: true, skin: 0xb0c0e0 },
  ogre:       { key: 'ogre', name: 'Ogre Warlord', boss: true, hp: 2300, dmg: 65, range: 3.4, cd: 2.0, armor: 0.2, speed: 3.8, radius: 1.1, reward: 320,
                attack: 'melee', large: true, scale: 2.4, slam: { every: 8, radius: 7, dmg: 50 }, color: 0x5a6a3a, cloth: 0x3a2a1a, weapon: 'club', skin: 0x7a8a4a },
  lich:       { key: 'lich', name: 'The Lich', boss: true, hp: 3300, dmg: 45, range: 18, cd: 1.4, armor: 0.15, speed: 3.6, radius: 0.7, reward: 520,
                attack: 'ranged', projectile: 'deathbolt', magic: true, large: true, scale: 1.5, summon: { type: 'skeleton', count: 5, every: 12 }, blink: { every: 14, dist: 12 },
                color: 0x3a2a5a, cloth: 0x1a1030, weapon: 'staff', robe: true, crown: true, skin: 0xc0c0d0 },
  spiderqueen:{ key: 'spiderqueen', name: 'Spider Queen', boss: true, hp: 4600, dmg: 55, range: 3.0, cd: 1.5, armor: 0.2, speed: 4.2, radius: 1.6, reward: 700,
                attack: 'melee', large: true, model: 'spider', scale: 1.6, summon: { type: 'spiderling', count: 6, every: 11 }, webShot: { every: 7, range: 16, slow: 0.7, dur: 3 }, color: 0x2a1a2a },
  golem:      { key: 'golem', name: 'Iron Golem', boss: true, hp: 6500, dmg: 90, range: 3.4, cd: 2.4, armor: 0.5, speed: 3.2, radius: 1.2, reward: 1000,
                attack: 'melee', large: true, scale: 2.6, unstoppable: true, slam: { every: 7, radius: 8, dmg: 70 }, color: 0x5a5a66, cloth: 0x3a3a44, weapon: 'club', skin: 0x6a6a76 },
  dragon:     { key: 'dragon', name: 'Ancient Dragon', boss: true, hp: 5200, dmg: 60, range: 4.5, cd: 1.8, armor: 0.25, speed: 6.5, radius: 2.2, reward: 900,
                attack: 'melee', large: true, flying: true, altitude: 3.2, breath: { every: 9, range: 13, dps: 32, dur: 3 }, model: 'dragon', color: 0x8a1a1a },
};

DATA.bossSchedule = ['ogre', 'warbringer', 'lich', 'hydra', 'dragon', 'stormcaller', 'spiderqueen', 'golem'];

// elite affixes: a few enemies per wave come back stronger, marked and worth double
DATA.affixes = {
  hasty:     { key: 'hasty', name: 'Hasty', color: 0x60e0ff, speed: 1.4, desc: 'Moves 40% faster.' },
  armoured:  { key: 'armoured', name: 'Armoured', color: 0xc0c0c0, hp: 1.3, armor: 0.25, desc: '+25% armour, +30% health.' },
  vampiric:  { key: 'vampiric', name: 'Vampiric', color: 0xff3060, vampiric: 0.35, desc: 'Heals 35% of the damage it deals.' },
  explosive: { key: 'explosive', name: 'Explosive', color: 0xff8020, blast: { radius: 5, dmg: 70 }, desc: 'Explodes on death for 70 damage in 5m.' },
  shielded:  { key: 'shielded', name: 'Shielded', color: 0xa080ff, shield: 4, desc: 'A magic shield absorbs its first four hits.' },
  giant:     { key: 'giant', name: 'Giant', color: 0xffd040, hp: 2.2, dmg: 1.5, scale: 1.35, desc: 'Twice the health, half again the damage.' },
};
DATA.eliteChance = (n) => n < 5 ? 0 : Math.min(0.25, 0.03 + n * 0.01);

// wave modifiers: announced with the preview, they change how the whole wave plays
DATA.waveMods = {
  night:     { key: 'night', name: 'Night Raid', desc: 'Darkness: your towers see 15% less far; enemy archers see 2m further.', towerRange: 0.85, enemyRange: 2, weight: 3 },
  fog:       { key: 'fog', name: 'Thick Fog', desc: 'Towers and your archers reach 25% less far. Melee it is.', towerRange: 0.75, unitRange: 0.8, weight: 2 },
  frenzy:    { key: 'frenzy', name: 'Frenzy', desc: 'Every enemy moves 30% faster.', speed: 1.3, weight: 3 },
  armoured:  { key: 'armoured', name: 'Iron Tide', desc: 'Every enemy has +15% armour. Magic and crossbows ignore it.', armor: 0.15, weight: 2 },
  swarm:     { key: 'swarm', name: 'Swarm', desc: 'Half again as many enemies, each with 60% health.', count: 1.6, hp: 0.6, weight: 3 },
  siege:     { key: 'siege', name: 'Siege', desc: 'Extra catapults and rams. Walls take 50% more damage.', siege: true, wallDmg: 1.5, weight: 2 },
  plague:    { key: 'plague', name: 'Plague', desc: 'Every enemy that dies leaves a poison cloud for 4s.', plague: true, weight: 2 },
  goldrush:  { key: 'goldrush', name: 'Gold Rush', desc: 'Every bounty is doubled. Enemies have 20% more health.', bounty: 2, hp: 1.2, weight: 2 },
};

// contracts: an optional goal for the wave, paid to every defender on success
DATA.contracts = {
  walls:    { key: 'walls', name: 'Hold the Line', desc: 'Lose no wall or gate this wave.', reward: (n) => 140 + 22 * n },
  king:     { key: 'king', name: 'Untouched Crown', desc: 'The King takes no damage this wave.', reward: (n) => 110 + 16 * n },
  soldiers: { key: 'soldiers', name: 'No One Left Behind', desc: 'Lose no soldiers this wave.', reward: (n) => 150 + 20 * n },
  speed:    { key: 'speed', name: 'Swift Justice', desc: 'Clear the wave within 75 seconds of the first spawn.', reward: (n) => 180 + 26 * n },
  hero:     { key: 'hero', name: 'Champion\'s Due', desc: 'A hero lands the killing blow on 8 enemies.', reward: (n) => 150 + 20 * n, need: 8 },
  casters:  { key: 'casters', name: 'Silence the Chanting', desc: 'Kill 4 casters (shamans, pyromancers, witches, warlocks, necromancers, wraiths).', reward: (n) => 160 + 22 * n, need: 4 },
};
DATA.heroXp = (level) => Math.round(90 * Math.pow(level, 1.45));
DATA.heroMaxLevel = 10;

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------
DATA.projectiles = {
  arrow:     { speed: 42, kind: 'homing', model: 'arrow', arc: 0.15 },
  bolt:      { speed: 34, kind: 'homing', model: 'bolt', color: 0x6ad07a },
  ballista:  { speed: 60, kind: 'homing', model: 'ballista' },
  fireball:  { speed: 26, kind: 'homing', model: 'fireball', burn: { dps: 6, dur: 3 } },
  boulder:   { speed: 22, kind: 'lob', model: 'boulder' },
  deathbolt: { speed: 30, kind: 'homing', model: 'bolt', color: 0xa040ff },
  frostbolt: { speed: 32, kind: 'homing', model: 'bolt', color: 0x70d0ff },
  magic:     { speed: 30, kind: 'lob', model: 'fireball', splash: 3.5, burn: { dps: 8, dur: 3 } },
  frost:     { speed: 34, kind: 'homing', model: 'bolt', color: 0x70d0ff, slow: { factor: 0.5, dur: 2.5 } },
  cannon:    { speed: 26, kind: 'lob', model: 'boulder', splash: 3.2 },
  poison:    { speed: 34, kind: 'homing', model: 'bolt', color: 0x60ff60, poison: { dps: 12, dur: 4 } },
  sniper:    { speed: 90, kind: 'homing', model: 'ballista' },
  web:       { speed: 30, kind: 'homing', model: 'bolt', color: 0xe0e0e0, slow: { factor: 0.7, dur: 3 } },
  bomb:      { speed: 20, kind: 'lob', model: 'boulder', splash: 2.6 },
  acid:      { speed: 24, kind: 'lob', model: 'fireball', color: 0x60ff40, splash: 3, poison: { dps: 10, dur: 4 } },
};

// ---------------------------------------------------------------------------
// Buildings
// footprint: w x d cells. interior: list of [dx,dz] cells that are walkable (relative to top-left)
// ---------------------------------------------------------------------------
DATA.buildings = {
  wall:     { key: 'wall', name: 'Stone Wall', cost: 40, hp: 520, w: 1, d: 1, cat: 'defense', drag: true,
              desc: 'Sturdy stone. Drag to build long stretches. Enemies hack at walls twice as hard as at anything else.' },
  gate:     { key: 'gate', name: 'Gate', cost: 80, hp: 500, w: 1, d: 1, cat: 'defense', gate: true,
              desc: 'Your units pass through; enemies must break it.' },
  arrow_tower:   { key: 'arrow_tower', name: 'Arrow Tower', cost: 130, hp: 900, w: 2, d: 2, cat: 'tower', tower: true,
                   range: 20, dmg: 18, cd: 1.1, projectile: 'arrow', desc: 'Fast-firing tower. Good all-rounder.' },
  ballista_tower:{ key: 'ballista_tower', name: 'Ballista Tower', cost: 240, hp: 1000, w: 2, d: 2, cat: 'tower', tower: true,
                   range: 28, dmg: 86, cd: 2.8, projectile: 'ballista', bonusVsLarge: 1.7, desc: 'Slow, huge single hits. +70% damage to large enemies.' },
  mage_tower:    { key: 'mage_tower', name: 'Mage Tower', cost: 320, hp: 800, w: 2, d: 2, cat: 'tower', tower: true,
                   range: 22, dmg: 45, cd: 2.2, projectile: 'magic', desc: 'Lobs exploding fire that splashes in 3.5m and burns.' },
  frost_tower:   { key: 'frost_tower', name: 'Frost Tower', cost: 260, hp: 800, w: 2, d: 2, cat: 'tower', tower: true,
                   range: 18, dmg: 14, cd: 0.9, projectile: 'frost', desc: 'Weak damage but slows targets by 50%.' },
  cannon_tower:  { key: 'cannon_tower', name: 'Cannon Tower', cost: 380, hp: 1100, w: 2, d: 2, cat: 'tower', tower: true,
                   range: 24, dmg: 120, cd: 4.0, projectile: 'cannon', minRange: 6, desc: 'Lobs iron shot that splashes in 3m. Cannot hit anything closer than 6m.' },
  lightning_tower:{ key: 'lightning_tower', name: 'Lightning Tower', cost: 340, hp: 850, w: 2, d: 2, cat: 'tower', tower: true,
                   range: 18, dmg: 28, cd: 1.7, chain: { count: 4, radius: 6 }, desc: 'Chain lightning that arcs to four enemies and ignores armour.' },
  poison_tower:  { key: 'poison_tower', name: 'Poison Tower', cost: 240, hp: 800, w: 2, d: 2, cat: 'tower', tower: true,
                   range: 18, dmg: 8, cd: 1.1, projectile: 'poison', desc: 'Darts that poison for 12 damage/s over 4s. Stacks nothing, but never misses.' },
  watchtower:    { key: 'watchtower', name: 'Watchtower', cost: 320, hp: 900, w: 2, d: 2, cat: 'tower', tower: true,
                   range: 32, dmg: 62, cd: 3.6, projectile: 'sniper', prefersCasters: true, desc: 'Marksmen with a 32m reach who pick off casters and catapults first. Trebuchets still outrange them.' },
  barricade: { key: 'barricade', name: 'Spiked Barricade', cost: 24, hp: 240, w: 1, d: 1, cat: 'defense', drag: true, spikes: 3,
              desc: 'Cheap and weak, but every melee blow against it wounds the attacker for 3.' },
  trap:     { key: 'trap', name: 'Spike Trap', cost: 45, hp: 200, w: 1, d: 1, cat: 'defense', interior: [[0, 0]], trap: { dmg: 70, radius: 1.6, slow: 0.5, rearm: 20 },
              desc: 'Hidden in the ground. Enemies stepping on it take 70 damage and are slowed. Rearms after 20s.' },
  barracks: { key: 'barracks', name: 'Barracks', cost: 160, hp: 1200, w: 3, d: 3, cat: 'economy', soldierCap: 6,
              desc: '+6 soldier capacity. Recruits muster here.' },
  farm:     { key: 'farm', name: 'Farm', cost: 150, hp: 500, w: 3, d: 3, cat: 'economy', income: 45, costGrowth: 1.3,
              desc: '+45 gold at the end of each wave. Each farm you own makes the next one 30% pricier.' },
  mine:     { key: 'mine', name: 'Gold Mine', cost: 260, hp: 700, w: 2, d: 2, cat: 'economy', income: 90, costGrowth: 1.6,
              desc: '+90 gold at the end of each wave. Each mine you own makes the next one 60% pricier.' },
  blacksmith: { key: 'blacksmith', name: 'Blacksmith', cost: 300, hp: 900, w: 3, d: 3, cat: 'economy', unique: true, soldierDmg: 0.15,
              desc: 'Soldiers deal +15% damage. Unlocks the Weapon and Armor upgrades.' },
  shrine:   { key: 'shrine', name: 'Healing Shrine', cost: 220, hp: 600, w: 2, d: 2, cat: 'economy', heal: { radius: 12, hps: 10 },
              desc: 'During a wave, heals friendly units within 12m for 10 HP/s. Everyone is healed fully between waves anyway.' },
  market:   { key: 'market', name: 'Market', cost: 350, hp: 700, w: 3, d: 3, cat: 'economy', unique: true, killBonus: 0.25,
              desc: '+25% gold from kills. One per fortress.' },
  tavern:   { key: 'tavern', name: 'Tavern', cost: 260, hp: 800, w: 3, d: 3, cat: 'economy', unique: true, soldierCap: 3, soldierSpeed: 0.12,
              desc: '+3 soldier capacity and soldiers move 12% faster. One per fortress.' },
  icewall:  { key: 'icewall', name: 'Ice Wall', cost: 0, hp: 450, w: 1, d: 1, cat: 'special', temporary: true, hidden: true,
              desc: 'Conjured ice. Melts on its own.' },
  keep:     { key: 'keep', name: 'The Keep', cost: 0, hp: 3200, w: 3, d: 3, cat: 'core', unique: true, keep: true, soldierCap: 8,
              interior: [[1, 1], [1, 2]], desc: 'The throne room. Units inside cannot be shot at from outside.' },
};

// Wonders: ruinously expensive, absurdly strong. One of each per defender.
DATA.buildings.dragon_roost = { key: 'dragon_roost', name: 'Dragon Roost', cost: 2600, hp: 1800, w: 3, d: 3, cat: 'wonder', unique: true, guardian: { unit: 'tamedragon', rebuild: 2 },
  desc: 'A tamed dragon nests here: 3200 HP, flies, and breathes fire that splashes 3.5m for 70 (ignores armour). If it dies the roost hatches another two waves later.' };
DATA.buildings.titan_forge = { key: 'titan_forge', name: 'Titan Forge', cost: 3400, hp: 2400, w: 3, d: 3, cat: 'wonder', unique: true, guardian: { unit: 'irongolem', rebuild: 2 },
  desc: 'Forges an Iron Titan: 5500 HP, 50% armour, 110-damage cleaving blows. Slow, unstoppable. Reforged two waves after it falls.' };
DATA.buildings.arcane_spire = { key: 'arcane_spire', name: 'Arcane Spire', cost: 3000, hp: 1300, w: 2, d: 2, cat: 'wonder', unique: true, tower: true, range: 44, dmg: 220, cd: 14, storm: { count: 6, scatter: 7, splash: 5, delay: 1.0 },
  desc: 'Every 14s calls a meteor storm on the thickest crowd within 44m: six meteors of 220 damage, each splashing 5m and burning.' };
DATA.buildings.sun_altar = { key: 'sun_altar', name: 'Sun Altar', cost: 2400, hp: 1300, w: 2, d: 2, cat: 'wonder', unique: true, tower: true, range: 38, dmg: 160, cd: 1, beam: { dps: 160 },
  desc: 'Focuses sunlight into a beam that burns the strongest enemy within 38m for 160 damage per second, ignoring armour. Never misses, never stops.' };
DATA.buildings.royal_treasury = { key: 'royal_treasury', name: 'Royal Treasury', cost: 2000, hp: 1600, w: 3, d: 3, cat: 'wonder', unique: true, interest: 0.06, interestCap: 600, bounty: 0.5,
  desc: 'Pays 6% interest on your gold after every wave (up to 600) and raises every bounty your forces collect by 50%.' };
DATA.buildings.storm_crown = { key: 'storm_crown', name: 'Crown of Storms', cost: 5000, hp: 1500, w: 2, d: 2, cat: 'wonder', unique: true, tower: true, range: 40, dmg: 150, cd: 3, chain: { count: 10, radius: 9 },
  desc: 'Chain lightning every 3s that leaps through ten enemies within 40m for 150 each, ignoring armour.' };
DATA.buildings.phoenix_pyre = { key: 'phoenix_pyre', name: 'Phoenix Pyre', cost: 6500, hp: 1800, w: 2, d: 2, cat: 'wonder', unique: true, phoenix: true,
  desc: 'Every soldier and hero of yours that falls rises again from the pyre three seconds later, once per wave.' };
DATA.buildings.world_tree = { key: 'world_tree', name: 'World Tree', cost: 8000, hp: 3000, w: 3, d: 3, cat: 'wonder', unique: true, income: 150, treeAura: { radius: 32, regen: 0.02, towerDmg: 1.25 },
  desc: 'Your units within 32m regenerate 2% of their health every second, your towers there hit 25% harder, and it yields 150 gold a wave.' };
DATA.buildings.time_anchor = { key: 'time_anchor', name: 'Time Anchor', cost: 10000, hp: 1800, w: 2, d: 2, cat: 'wonder', unique: true, slowField: { radius: 34, factor: 0.45 }, freeze: { every: 30, radius: 20, dur: 4 },
  desc: 'Enemies within 34m move and fight 45% slower. Every 30s it freezes everything within 20m for 4s.' };
DATA.buildings.celestial_gate = { key: 'celestial_gate', name: 'Celestial Gate', cost: 14000, hp: 2400, w: 3, d: 3, cat: 'wonder', unique: true, summonHost: { unit: 'angel', count: 6, every: 40, dur: 40 },
  desc: 'Every 40s six celestial warriors step through: 650 HP, 70-damage cleaving blades, they fly over walls, and they fight for 40s.' };
DATA.buildings.doomsday_engine = { key: 'doomsday_engine', name: 'Doomsday Engine', cost: 20000, hp: 3000, w: 3, d: 3, cat: 'wonder', unique: true, doom: { every: 60, dmg: 600, bossDmg: 300 }, burnField: { radius: 40, dps: 25 },
  desc: 'Every 60s it detonates: every enemy on the map takes 600 damage (bosses 300). Enemies within 40m burn for 25 damage a second all the time.' };
DATA.buildings.throne_of_ages = { key: 'throne_of_ages', name: 'Throne of Ages', cost: 30000, hp: 5000, w: 3, d: 3, cat: 'wonder', unique: true, throne: { kingHp: 5000, kingRegen: 100, towerDmg: 1.5, soldierDmg: 1.5, income: 2 },
  desc: 'The King gains 5000 HP and heals 100 a second, your towers and soldiers hit 50% harder, and your farms and mines pay double.' };
DATA.units.angel = { key: 'angel', name: 'Celestial Warrior', hp: 650, dmg: 70, range: 2.6, cd: 0.8, armor: 0.3, speed: 9, radius: 0.5, attack: 'melee', cleave: true, flying: true, altitude: 1.2, wings: true, noCap: true, summoned: true, color: 0xfff0c0, cloth: 0xffffff, weapon: 'sword', helmet: true, skin: 0xffe8d0 };
DATA.units.tamedragon = { key: 'tamedragon', name: 'Tame Dragon', hp: 3200, dmg: 70, range: 7, cd: 1.2, armor: 0.3, speed: 7.5, radius: 1.6, attack: 'ranged', projectile: 'fireball', splash: 3.5, magic: true, flying: true, altitude: 6, large: true, model: 'dragon', scale: 0.9, noCap: true, guardian: true, color: 0x8a2a2a, cloth: 0x5a1a1a, breath: { range: 12, dps: 150, dur: 0.2, every: 0 }, noViewWeapon: true,
  desc: 'The roost\'s dragon. Flies over walls and breathes splashing fire.' };
DATA.units.irongolem = { key: 'irongolem', name: 'Iron Titan', hp: 5500, dmg: 110, range: 3.2, cd: 2.0, armor: 0.5, speed: 3.4, radius: 1.1, attack: 'melee', cleave: true, large: true, scale: 2.2, noCap: true, guardian: true, color: 0x6a6e78, cloth: 0x4a4e58, weapon: 'club', helmet: true, skin: 0x8a8e98,
  desc: 'The forge\'s titan. Slow, armoured, cleaves everything in reach.' };
DATA.buildOrder = ['wall', 'barricade', 'gate', 'trap', 'arrow_tower', 'ballista_tower', 'mage_tower', 'frost_tower', 'cannon_tower', 'lightning_tower', 'poison_tower', 'watchtower', 'barracks', 'farm', 'mine', 'blacksmith', 'shrine', 'market', 'tavern', 'royal_treasury', 'sun_altar', 'arcane_spire', 'dragon_roost', 'titan_forge', 'storm_crown', 'phoenix_pyre', 'world_tree', 'time_anchor', 'celestial_gate', 'doomsday_engine', 'throne_of_ages'];

DATA.towerUpgrade = { maxLevel: 3, dmg: 1.4, range: 1.1, hp: 1.3, costMul: 0.8 };

// ---------------------------------------------------------------------------
// Fortress upgrades
// ---------------------------------------------------------------------------
DATA.upgrades = {
  walls:    { key: 'walls', name: 'Reinforced Walls', cost: 150, max: 5, desc: 'Walls, gates and the Keep gain +40% HP per level.' },
  towers:   { key: 'towers', name: 'Tower Engineering', cost: 200, max: 5, desc: 'Towers deal +20% damage and gain +8% range per level.' },
  weapons:  { key: 'weapons', name: 'Weapon Smithing', cost: 180, max: 5, requires: 'blacksmith', desc: 'Soldiers deal +15% damage per level. Requires a Blacksmith.' },
  armor:    { key: 'armor', name: 'Plate Armor', cost: 180, max: 5, requires: 'blacksmith', desc: 'Soldiers take 8% less damage per level. Requires a Blacksmith.' },
  hero:     { key: 'hero', name: 'Hero Training', cost: 250, max: 5, desc: 'Heroes gain +15% damage and +15% HP per level.' },
  royal:    { key: 'royal', name: 'Royal Guard', cost: 220, max: 5, desc: 'The King gains +25% HP and +2 HP/s regen per level.' },
  garrison: { key: 'garrison', name: 'Garrison', cost: 120, max: 6, desc: '+3 soldier capacity per level.' },
  marksman: { key: 'marksman', name: 'Marksmanship', cost: 160, max: 4, desc: 'Archers, crossbowmen and apprentices gain +12% range and +10% damage per level.' },
  fortune:  { key: 'fortune', name: 'Fortune', cost: 300, max: 3, desc: '+10% gold from every source per level.' },
};
DATA.upgradeCostGrowth = 1.55;

// ---------------------------------------------------------------------------
// Waves
// ---------------------------------------------------------------------------
DATA.waves = {
  budget: (n) => 48 + 30 * n + 4 * n * n,
  clearBonus: (n) => 60 + 26 * n,
  hpScale: (n) => n <= 8 ? 1 : 1 + (n - 8) * 0.045,
  playerScale: (players) => 1 + 0.8 * Math.max(0, players - 1),
  bossEvery: 5,
  maxCount: 130,
};

DATA.spawnPoints = (() => {
  const R = DATA.SPAWN_RADIUS, D = R - 2;          // diagonals sit in the corners
  return [
    { name: 'North', x: 0, z: -R },      { name: 'North-East', x: D, z: -D },
    { name: 'East', x: R, z: 0 },        { name: 'South-East', x: D, z: D },
    { name: 'South', x: 0, z: R },       { name: 'South-West', x: -D, z: D },
    { name: 'West', x: -R, z: 0 },       { name: 'North-West', x: -D, z: -D },
  ];
})();

DATA.mapTypes = {
  valley:    { zenith: 0x3f7fd0, label: 'River Valley', desc: 'A river and its tributary with fords, marshes along the banks, woods and rocks.', rocks: [5, 7], forests: [3, 4], hills: 1, ruins: 6,
               palette: { grass: 0x4f8a3a, grass2: 0x7aa14a, dry: 0x8a9a4a, sky: 0x9cc4e4, water: 0x3a7fc0, road: 0x9a7a4a, marsh: 0x4a5a2a, leaves: [0x2f6b2f, 0x3a7a35, 0x2a5a30, 0x4a8a3a] } },
  highlands: { zenith: 0x3a6fc8, label: 'Highlands', desc: 'Two rings of rock ridges around the castle with a few passes, and mountain lakes.', rocks: [3, 5], forests: [2, 3], hills: 1.7, ruins: 5,
               palette: { grass: 0x5a8a4a, grass2: 0x8aa060, dry: 0x9a9a6a, sky: 0xa8c8e8, water: 0x2a6ab0, road: 0x8a7a5a, marsh: 0x4a5a3a, leaves: [0x2a5a30, 0x1f4a28, 0x3a6a3a, 0x2f5f35] } },
  darkwood:  { zenith: 0x2f5f9a, label: 'Darkwood', desc: 'A belt of dense forest with four lanes cut through it, clearings, marsh and a stream.', rocks: [2, 3], forests: [3, 4], hills: 0.7, ruins: 6,
               palette: { grass: 0x3f6f32, grass2: 0x5a8a40, dry: 0x6a7a3a, sky: 0x8ab0cc, water: 0x2f6a90, road: 0x7a6a4a, marsh: 0x3a4a22, leaves: [0x1f4a25, 0x2a5a30, 0x1a3f20, 0x2f6b2f] } },
  badlands:  { zenith: 0x6a9ad0, label: 'Badlands', desc: 'Dry ground cut by radial canyons of rock, crags, an oasis and old ruins.', rocks: [3, 5], forests: [0, 0], hills: 1.2, ruins: 16, decor: 'dead',
               palette: { grass: 0x9a8a4a, grass2: 0xb8a060, dry: 0xc0a870, sky: 0xd8c4a0, water: 0x3a8ab0, road: 0xb09060, marsh: 0x6a6a3a, leaves: [0x6a6a3a, 0x7a7a4a, 0x5a5a30, 0x8a8a50] } },
  frozen:    { zenith: 0x6a8ab8, label: 'Frozen Marsh', desc: 'Snowfields, frozen lakes and bog that slows everyone who wades through it.', rocks: [4, 6], forests: [1, 2], hills: 1.3, ruins: 5, decor: 'snow',
               palette: { grass: 0xb8c4cc, grass2: 0x98a8b4, dry: 0xc8d2da, sky: 0xb8c8d8, water: 0x7ab8e0, road: 0xa0a8a8, marsh: 0x7a8a7a, leaves: [0x3a5a4a, 0x2f4f42, 0x4a6a5a, 0x3a5a50] } },
  volcanic:  { zenith: 0x4a2a2a, label: 'Ashlands', desc: 'Black ash, a river of lava and molten pools; rock spires are the only cover.', rocks: [5, 8], forests: [0, 0], hills: 1.6, ruins: 10, decor: 'dead',
               palette: { grass: 0x3a3a3a, grass2: 0x5a5048, dry: 0x6a5a50, sky: 0x8a6a5a, water: 0xff6a10, waterGlow: 0xff3000, road: 0x4a4038, marsh: 0x3a3a30, leaves: [0x4a3a30, 0x5a4a3a, 0x3a2a20, 0x6a5a4a] } },
};
DATA.build = '2026-09-07 00:00';
// experiments only: never listed in the hero menu, never unique, never bought. Immortal, splash attacks at range, very fast, abilities on a tenth of the cooldown
DATA.testChampion = {
  key: 'champion', name: 'The Test Champion', title: 'of the Experiments', role: 'Testing',
  hp: 99999, dmg: 650, range: 30, cd: 0.3, armor: 0.9, speed: 13, radius: 0.5,
  attack: 'ranged', projectile: 'fireball', splash: 4.5, magic: true, regen: 5000, abilityCdMul: 0.1,
  abilities: ['meteor', 'flame_nova'],
  passive: 'Experiments: immortal, absurd damage, splash at 30m, very fast, abilities on a tenth of the cooldown.',
  traits: ['Immortal', '650 splash damage at 30m', 'Speed 13', 'Abilities recharge 10x faster'],
  color: 0xffd040, cloth: 0x301040, weapon: 'staff', helmet: true, plume: true, magic: true,
};
DATA.playerColors = [0x58b8ff, 0xff9a40, 0xc86cff, 0x5ce08a, 0xffe14a, 0xff6aa8, 0x7ff0e0, 0xf0f0f0];
DATA.sharedColor = 0xffd040;
DATA.siteUrl = 'https://matthewjbarnett.github.io/crownhold/'; // the full game, outside any embedding sandbox
DATA.startGold = 500;
DATA.baseSoldierCap = 0; // keep + barracks + garrison supply the cap
