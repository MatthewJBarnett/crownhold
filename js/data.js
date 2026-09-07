// ---------------------------------------------------------------------------
// Crownhold - game data definitions
// ---------------------------------------------------------------------------
'use strict';

const DATA = {};

DATA.CELL = 2;          // metres per grid cell
DATA.GRID = 80;         // cells per side (160m map)
DATA.BUILD_RADIUS = 56; // max |x|,|z| for building placement (metres)
DATA.SPAWN_RADIUS = 72; // enemy spawn ring radius
DATA.MAP_HALF = 79;     // hard clamp for unit positions

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
    attack: 'melee', repair: { hps: 35, range: 3.2 }, noCap: true, maxCount: 4,
    desc: 'Repairs damaged buildings for free, 35 HP per second. Runs from enemies and does not count against the soldier cap (max 4).',
    color: 0x7a5a3a, cloth: 0x6a5a3a, weapon: 'hammer', skin: 0xe8c39e,
  },
  wolf: {
    key: 'wolf', name: 'Wolf', hp: 95, dmg: 15, range: 1.8, cd: 0.7, armor: 0.05, speed: 8.0, radius: 0.4,
    attack: 'melee', noCap: true, summoned: true, model: 'wolf', color: 0x6a6a6a,
  },
  pikeman: {
    key: 'pikeman', name: 'Pikeman', cost: 85, hp: 180, dmg: 28, range: 3.3, cd: 1.5, armor: 0.2, speed: 5.0, radius: 0.45,
    attack: 'melee', bonusVsLarge: 2.0, desc: 'Long reach. Double damage against large enemies and bosses.',
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
  brute:      { key: 'brute', name: 'Brute', hp: 280, dmg: 26, range: 2.6, cd: 1.4, armor: 0.15, speed: 4.0, radius: 0.6, reward: 16, unlock: 3, weight: 4,
                attack: 'melee', large: true, scale: 1.35, color: 0x5a4a3a, cloth: 0x3a2a1a, weapon: 'club', skin: 0x6f8a4f },
  pyromancer: { key: 'pyromancer', name: 'Pyromancer', hp: 95, dmg: 24, range: 16, cd: 2.4, armor: 0, speed: 4.2, radius: 0.42, reward: 20, unlock: 4, weight: 3,
                attack: 'ranged', projectile: 'fireball', splash: 2.6, magic: true, color: 0xb03a1a, cloth: 0x5a1a10, weapon: 'staff', robe: true, hat: true, skin: 0xd9b08c },
  catapult:   { key: 'catapult', name: 'Catapult', hp: 320, dmg: 45, buildingDmg: 150, range: 26, minRange: 7, cd: 5.0, armor: 0.1, speed: 2.2, radius: 1.0, reward: 45, unlock: 5, weight: 1.5,
                attack: 'artillery', projectile: 'boulder', splash: 3.2, large: true, prefersBuildings: true, model: 'catapult' },
  assassin:   { key: 'assassin', name: 'Assassin', hp: 85, dmg: 20, range: 2.0, cd: 0.55, armor: 0, speed: 8.2, radius: 0.4, reward: 15, unlock: 6, weight: 3,
                attack: 'melee', prefersHeroes: true, color: 0x2a2a35, cloth: 0x1a1a22, weapon: 'dagger', hood: true, skin: 0xc9a58a },
  shaman:     { key: 'shaman', name: 'Shaman', hp: 120, dmg: 8, range: 12, cd: 1.6, armor: 0, speed: 4.2, radius: 0.42, reward: 25, unlock: 7, weight: 2,
                attack: 'ranged', projectile: 'bolt', magic: true, kite: true, healAura: { radius: 9, hps: 10 }, color: 0x4a7a5a, cloth: 0x2a4a3a, weapon: 'staff', robe: true, skin: 0x8fa86a },
  necromancer:{ key: 'necromancer', name: 'Necromancer', hp: 150, dmg: 16, range: 16, cd: 2.0, armor: 0, speed: 4.0, radius: 0.42, reward: 32, unlock: 8, weight: 2,
                attack: 'ranged', projectile: 'deathbolt', magic: true, kite: true, summon: { type: 'skeleton', count: 3, every: 10 }, color: 0x5a3a7a, cloth: 0x2a1a3a, weapon: 'staff', robe: true, hood: true, skin: 0xb0b0c0 },
  frostwitch: { key: 'frostwitch', name: 'Frost Witch', hp: 130, dmg: 15, range: 16, cd: 1.8, armor: 0, speed: 4.2, radius: 0.42, reward: 28, unlock: 9, weight: 2,
                attack: 'ranged', projectile: 'frostbolt', slow: { factor: 0.45, dur: 2.5 }, magic: true, kite: true, slowAura: { radius: 7, factor: 0.3 }, color: 0x8ac0e0, cloth: 0x2a4a6a, weapon: 'staff', robe: true, hat: true, skin: 0xd0e0f0 },
  skeleton:   { key: 'skeleton', name: 'Skeleton', hp: 40, dmg: 8, range: 2.0, cd: 1.0, armor: 0, speed: 5.2, radius: 0.38, reward: 1, unlock: 99, weight: 0,
                attack: 'melee', color: 0xe0e0d0, cloth: 0xe0e0d0, weapon: 'sword', skin: 0xe8e8d8, skeleton: true },
  // bosses
  ogre:       { key: 'ogre', name: 'Ogre Warlord', boss: true, hp: 2300, dmg: 65, range: 3.4, cd: 2.0, armor: 0.2, speed: 3.8, radius: 1.1, reward: 320,
                attack: 'melee', large: true, scale: 2.4, slam: { every: 8, radius: 7, dmg: 50 }, color: 0x5a6a3a, cloth: 0x3a2a1a, weapon: 'club', skin: 0x7a8a4a },
  lich:       { key: 'lich', name: 'The Lich', boss: true, hp: 3300, dmg: 45, range: 18, cd: 1.4, armor: 0.15, speed: 3.6, radius: 0.7, reward: 520,
                attack: 'ranged', projectile: 'deathbolt', magic: true, large: true, scale: 1.5, summon: { type: 'skeleton', count: 5, every: 12 }, blink: { every: 14, dist: 12 },
                color: 0x3a2a5a, cloth: 0x1a1030, weapon: 'staff', robe: true, crown: true, skin: 0xc0c0d0 },
  dragon:     { key: 'dragon', name: 'Ancient Dragon', boss: true, hp: 5200, dmg: 60, range: 4.5, cd: 1.8, armor: 0.25, speed: 6.5, radius: 2.2, reward: 900,
                attack: 'melee', large: true, flying: true, altitude: 3.2, breath: { every: 9, range: 13, dps: 32, dur: 3 }, model: 'dragon', color: 0x8a1a1a },
};

DATA.bossSchedule = ['ogre', 'lich', 'dragon'];

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
};

// ---------------------------------------------------------------------------
// Buildings
// footprint: w x d cells. interior: list of [dx,dz] cells that are walkable (relative to top-left)
// ---------------------------------------------------------------------------
DATA.buildings = {
  wall:     { key: 'wall', name: 'Stone Wall', cost: 12, hp: 600, w: 1, d: 1, cat: 'defense', drag: true,
              desc: 'Cheap and sturdy. Drag to build long stretches.' },
  gate:     { key: 'gate', name: 'Gate', cost: 35, hp: 500, w: 1, d: 1, cat: 'defense', gate: true,
              desc: 'Your units pass through; enemies must break it.' },
  arrow_tower:   { key: 'arrow_tower', name: 'Arrow Tower', cost: 130, hp: 900, w: 2, d: 2, cat: 'tower', tower: true,
                   range: 20, dmg: 18, cd: 1.1, projectile: 'arrow', desc: 'Fast-firing tower. Good all-rounder.' },
  ballista_tower:{ key: 'ballista_tower', name: 'Ballista Tower', cost: 240, hp: 1000, w: 2, d: 2, cat: 'tower', tower: true,
                   range: 28, dmg: 95, cd: 2.8, projectile: 'ballista', bonusVsLarge: 2, desc: 'Slow, huge single hits. Double damage to large enemies.' },
  mage_tower:    { key: 'mage_tower', name: 'Mage Tower', cost: 320, hp: 800, w: 2, d: 2, cat: 'tower', tower: true,
                   range: 22, dmg: 45, cd: 2.2, projectile: 'magic', desc: 'Lobs exploding fire that splashes in 3.5m and burns.' },
  frost_tower:   { key: 'frost_tower', name: 'Frost Tower', cost: 260, hp: 800, w: 2, d: 2, cat: 'tower', tower: true,
                   range: 18, dmg: 14, cd: 0.9, projectile: 'frost', desc: 'Weak damage but slows targets by 50%.' },
  barracks: { key: 'barracks', name: 'Barracks', cost: 160, hp: 1200, w: 3, d: 3, cat: 'economy', soldierCap: 6,
              desc: '+6 soldier capacity. Recruits muster here.' },
  farm:     { key: 'farm', name: 'Farm', cost: 150, hp: 500, w: 3, d: 3, cat: 'economy', income: 45, costGrowth: 1.3,
              desc: '+45 gold at the end of each wave. Each farm you own makes the next one 30% pricier.' },
  mine:     { key: 'mine', name: 'Gold Mine', cost: 260, hp: 700, w: 2, d: 2, cat: 'economy', income: 90, costGrowth: 1.6,
              desc: '+90 gold at the end of each wave. Each mine you own makes the next one 60% pricier.' },
  blacksmith: { key: 'blacksmith', name: 'Blacksmith', cost: 300, hp: 900, w: 3, d: 3, cat: 'economy', unique: true, soldierDmg: 0.15,
              desc: 'Soldiers deal +15% damage. Unlocks the Weapon and Armor upgrades.' },
  shrine:   { key: 'shrine', name: 'Healing Shrine', cost: 220, hp: 600, w: 2, d: 2, cat: 'economy', heal: { radius: 10, hps: 6 },
              desc: 'Heals friendly units within 10m for 6 HP/s.' },
  icewall:  { key: 'icewall', name: 'Ice Wall', cost: 0, hp: 450, w: 1, d: 1, cat: 'special', temporary: true, hidden: true,
              desc: 'Conjured ice. Melts on its own.' },
  keep:     { key: 'keep', name: 'The Keep', cost: 0, hp: 3200, w: 3, d: 3, cat: 'core', unique: true, keep: true, soldierCap: 8,
              interior: [[1, 1], [1, 2]], desc: 'The throne room. Units inside cannot be shot at from outside.' },
};

DATA.buildOrder = ['wall', 'gate', 'arrow_tower', 'ballista_tower', 'mage_tower', 'frost_tower', 'barracks', 'farm', 'mine', 'blacksmith', 'shrine'];

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
};
DATA.upgradeCostGrowth = 1.55;

// ---------------------------------------------------------------------------
// Waves
// ---------------------------------------------------------------------------
DATA.waves = {
  budget: (n) => 40 + 32 * n + 5 * n * n,
  clearBonus: (n) => 70 + 35 * n,
  hpScale: (n) => n <= 8 ? 1 : 1 + (n - 8) * 0.05,
  bossEvery: 5,
  maxCount: 130,
};

DATA.spawnPoints = [
  { name: 'North', x: 0, z: -70 },      { name: 'North-East', x: 63, z: -63 },
  { name: 'East', x: 70, z: 0 },        { name: 'South-East', x: 63, z: 63 },
  { name: 'South', x: 0, z: 70 },       { name: 'South-West', x: -63, z: 63 },
  { name: 'West', x: -70, z: 0 },       { name: 'North-West', x: -63, z: -63 },
];

DATA.siteUrl = 'https://matthewjbarnett.github.io/crownhold/'; // the full game, outside any embedding sandbox
DATA.startGold = 500;
DATA.baseSoldierCap = 0; // keep + barracks + garrison supply the cap
