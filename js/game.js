'use strict';

class Game {
  constructor(opts = {}) {
    this.testMode = !!opts.testMode;
    this.maxFrames = opts.maxFrames || 0; this.frameCount = 0;
    this.started = false; this.over = false; this.paused = false; this.timeScale = 1; this.time = 0;
    this.units = []; this.buildings = []; this.projectiles = []; this.zones = [];
    this.gold = 0; this.upgrades = {}; this.stats = { kills: 0, goldEarned: 0, buildingsLost: 0, wavesCleared: 0 };
    this.difficulty = DATA.difficulties.normal;
    this.king = null; this.boss = null; this.heroesOwned = []; this.fallenHeroes = [];
    this.autoRepair = false; this.warnedNoEngineer = false; this.heroesBought = 0;
    this.flowTimer = 0; this.scratch = []; this.scratch2 = []; this.lastEnemyDeath = 0; this.lastStallHint = 0;
    this.setupRenderer();
    this.setupScene();
    this.grid = new Grid();
    this.effects = new Effects(this);
    this.hash = new SpatialHash(4);
    this.controls = new Controls(this);
    this.ui = new UI(this);
    this.waves = null;
    this.lastT = performance.now();
    this.acc = 0;
    this.fpsCounter = { frames: 0, t: 0, fps: 0 };
    this.loop = this.loop.bind(this);
    if (!this.testMode) requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ setup
  setupRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: /[?&](autostart|test)/.test(location.search) });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    if (this.testMode) r.setSize(96, 64); else r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    document.getElementById('game').appendChild(r.domElement);
    this.renderer = r;
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.2, 500);
  }
  setupScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9cc4e4);
    scene.fog = new THREE.Fog(0xb8cfe4, 130, 300);
    this.scene = scene;
    scene.add(this.camera);
    const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a6a35, 0.75); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.15);
    sun.position.set(60, 90, 30); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 300;
    sun.shadow.bias = -0.0008;
    scene.add(sun); scene.add(sun.target);
    this.sun = sun;
    // basis of the shadow camera, used to snap its target to shadow-map texels (stops shadow shimmer while moving)
    this.sunOffset = new THREE.Vector3(60, 90, 30);
    this.sunDir = this.sunOffset.clone().normalize();
    this.sunRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), this.sunDir).normalize();
    this.sunUp = new THREE.Vector3().crossVectors(this.sunDir, this.sunRight).normalize();
    this.sunTexel = (sc.right - sc.left) / sun.shadow.mapSize.x;
    const ambient = new THREE.AmbientLight(0xffffff, 0.12); scene.add(ambient);
    this.ground = Models.ground(); scene.add(this.ground);
    this.decor = new THREE.Group(); scene.add(this.decor);
    this.buildDecor();
    const gh = new THREE.GridHelper(114, 57, 0x335533, 0x335533);
    gh.material.transparent = true; gh.material.opacity = 0.35; gh.position.y = 0.04; gh.visible = false;
    scene.add(gh); this.gridHelper = gh;
    // buildable-area outline
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(DATA.BUILD_RADIUS * 2 + 2, DATA.BUILD_RADIUS * 2 + 2)), new THREE.LineBasicMaterial({ color: 0x224422, transparent: true, opacity: 0.5 }));
    outline.rotation.x = -Math.PI / 2; outline.position.y = 0.05; outline.visible = false;
    scene.add(outline); this.buildOutline = outline;
    // command marker
    this.marker = Models.ring(0.9, 0x50ff80); this.marker.visible = false; scene.add(this.marker); this.markerT = 0;
  }
  buildDecor() {
    // forest border with instanced meshes
    const N = 420;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 1.8, 6), leafGeo = new THREE.ConeGeometry(1.6, 3.4, 7);
    const trunks = new THREE.InstancedMesh(trunkGeo, Models.mat(0x5a3a22), N);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
    trunks.castShadow = true; leaves.castShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    for (let k = 0; k < N; k++) {
      let x, z, r;
      do { x = U.rand(-100, 100); z = U.rand(-100, 100); r = Math.max(Math.abs(x), Math.abs(z)); } while (r < 79 || r > 99);
      const sc = U.rand(0.8, 1.5);
      p.set(x, 0.9 * sc, z); s.set(sc, sc, sc); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6);
      m.compose(p, q, s); trunks.setMatrixAt(k, m);
      p.set(x, 0.9 * sc + 2.3 * sc, z); m.compose(p, q, s); leaves.setMatrixAt(k, m);
      col.setHex(U.choice([0x2f6b2f, 0x3a7a35, 0x2a5a30, 0x4a8a3a])); leaves.setColorAt(k, col);
    }
    trunks.instanceMatrix.needsUpdate = true; leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    this.decor.add(trunks); this.decor.add(leaves);
    // scattered rocks and small trees in the approach ring
    for (let k = 0; k < 70; k++) {
      let x, z, r;
      do { x = U.rand(-78, 78); z = U.rand(-78, 78); r = Math.max(Math.abs(x), Math.abs(z)); } while (r < DATA.BUILD_RADIUS + 3 || r > 77);
      const o = Math.random() < 0.5 ? Models.rock() : Models.tree();
      o.position.x = x; o.position.z = z; this.decor.add(o);
    }
    // a few bushes inside the buildable area edges (purely cosmetic, walkable)
    for (let k = 0; k < 30; k++) {
      const x = U.rand(-56, 56), z = U.rand(-56, 56);
      if (Math.max(Math.abs(x), Math.abs(z)) < 28) continue;
      const b = Models.sphere(U.rand(0.5, 0.9), Models.mat(U.choice([0x3f7a35, 0x4a8a3a])), x, 0.3, z, 6);
      b.scale.y = 0.7; this.decor.add(b);
    }
  }
  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ new game
  newGame(heroKey, difficultyKey) {
    this.reset();
    this.difficulty = DATA.difficulties[difficultyKey] || DATA.difficulties.normal;
    this.difficultyKey = difficultyKey;
    for (const k of Object.keys(DATA.upgrades)) this.upgrades[k] = 0;
    this.gold = DATA.startGold;
    const g = this.grid, h = g.half;
    // keep
    this.placeBuilding('keep', h - 1, h - 1, 0, true, true);
    // corner towers + walls (ring from cell h-9 .. h+9)
    const lo = h - 9, hi = h + 9;
    for (const [i, j] of [[lo, lo], [hi - 1, lo], [lo, hi - 1], [hi - 1, hi - 1]]) this.placeBuilding('arrow_tower', i, j, 0, true, true);
    for (let i = lo; i <= hi; i++) for (const j of [lo, hi]) if (!g.buildingAt(i, j)) this.placeBuilding(i === h && j === hi ? 'gate' : 'wall', i, j, 0, true, true);
    for (let j = lo + 1; j < hi; j++) for (const i of [lo, hi]) if (!g.buildingAt(i, j)) this.placeBuilding('wall', i, j, 0, true, true);
    // the king on his throne, hero at the keep door, a small garrison
    this.king = this.spawnUnit(DATA.units.king, 'player', 0, 0, { yaw: 0 });
    this.king.post = { x: 0, z: 0 };
    this.addHero(heroKey, 0, 6);
    this.spawnUnit(DATA.units.swordsman, 'player', -4, 12); this.spawnUnit(DATA.units.swordsman, 'player', 4, 12);
    this.spawnUnit(DATA.units.archer, 'player', -6, 9); this.spawnUnit(DATA.units.archer, 'player', 6, 9);
    this.spawnUnit(DATA.units.engineer, 'player', 3, 5);
    for (const u of this.units) u.post = { x: u.pos.x, z: u.pos.z };
    this.waves = new WaveManager(this);
    this.started = true; this.over = false; this.paused = false; this.time = 0;
    if (this.netHost) this.netHost.reset();
    this.controls.focus.set(0, 0, 10); this.controls.camYaw = 0; this.controls.camDist = 52;
    this.ui.onGameStart();
    this.ui.toast('Defend the King! Build defences, then press Next Wave (N) when ready. Between waves building is instant; during a wave your Engineer builds and repairs.', 'info', 8000);
  }
  reset() {
    for (const u of this.units) u.remove();
    for (const b of this.buildings) { this.grid && this.grid.remove(b); b.remove(); }
    for (const p of this.projectiles) p.kill();
    for (const z of this.zones) { this.scene.remove(z.mesh); this.scene.remove(z.ring); }
    this.units = []; this.buildings = []; this.projectiles = []; this.zones = [];
    this.grid = new Grid();
    this.king = null; this.boss = null; this.heroesOwned = []; this.fallenHeroes = [];
    this.stats = { kills: 0, goldEarned: 0, buildingsLost: 0, wavesCleared: 0 };
    if (this.controls.mode === 'fps') this.controls.exitControl();
    this.controls.clearSelection(); this.controls.cancelBuild();
    this.replica = false;
  }
  // ------------------------------------------------------------------ multiplayer
  newReplica() {
    this.reset();
    this.replica = true;
    this.gold = 0; this.upgrades = {}; this.replicaCap = 0;
    this.waves = { number: 0, active: false, pending: { length: 0 }, total: 0, preview: { n: 1, d: { units: [], from: [] } }, describe: (p) => p.d };
    this.started = true; this.over = false; this.paused = false; this.time = 0;
    this.controls.focus.set(0, 0, 10); this.controls.camYaw = 0; this.controls.camDist = 52;
    this.ui.onGameStart();
  }
  startHost(heroKey, difficultyKey, name, cb) {
    const tr = new PeerTransport();
    const code = makeRoomCode();
    tr.host(code, (err) => {
      if (err) { cb(err); return; }
      this.newGame(heroKey, difficultyKey);
      this.playerName = name;
      new NetHost(this, tr, code);
      this.ui.toast(`Hosting room ${code}. Friends can join with that code.`, 'good', 8000);
      this.ui.dirty = true;
      cb(null, code);
    });
  }
  startJoin(code, heroKey, name, cb) {
    const tr = new PeerTransport();
    tr.join(code, (err, hostId) => {
      if (err) { cb(err); return; }
      this.newReplica();
      this.playerName = name;
      const nc = new NetClient(this, tr, hostId, tr.peerId);
      nc.send({ t: 'hello', name, hero: heroKey });
      cb(null, code);
    });
  }

  // ------------------------------------------------------------------ stats
  applyStats(u, initial) {
    const def = u.def, up = this.upgrades, diff = this.difficulty;
    let hpMul = 1, dmgMul = 1, armorAdd = 0, regen = def.regen || 0;
    if (u.team === 'enemy') { hpMul = u.hpMul; dmgMul = diff.dmg; }
    else if (u.isKing) { hpMul = 1 + 0.25 * (up.royal || 0); regen += 2 * (up.royal || 0); }
    else if (u.isHero) { hpMul = 1 + 0.15 * (up.hero || 0); dmgMul = 1 + 0.15 * (up.hero || 0); }
    else if (u.isSoldier) { dmgMul = (1 + 0.15 * (up.weapons || 0)) * (this.hasActive('blacksmith') ? 1 + DATA.buildings.blacksmith.soldierDmg : 1); armorAdd = 0.08 * (up.armor || 0); }
    const frac = initial ? 1 : u.hp / u.maxHp;
    u.maxHp = def.hp * hpMul; u.hp = u.maxHp * frac;
    u.dmg = def.dmg * dmgMul; u.dmgMul = dmgMul;
    u.speed = def.speed; u.range = def.range; u.cd = def.cd;
    u.armor = Math.min(0.75, (def.armor || 0) + armorAdd);
    u.regen = regen;
  }
  applyBuildingStats(b, initial) {
    const def = b.def, up = this.upgrades;
    let hpMul = 1;
    if (def.key === 'wall' || def.key === 'gate' || def.keep) hpMul *= 1 + 0.4 * (up.walls || 0);
    if (def.tower) hpMul *= Math.pow(DATA.towerUpgrade.hp, b.level - 1);
    const frac = initial ? 1 : b.hp / b.maxHp;
    b.maxHp = def.hp * hpMul; b.hp = b.maxHp * frac;
    if (def.tower) {
      b.dmg = def.dmg * (1 + 0.2 * (up.towers || 0)) * Math.pow(DATA.towerUpgrade.dmg, b.level - 1);
      b.range = def.range * (1 + 0.08 * (up.towers || 0)) * Math.pow(DATA.towerUpgrade.range, b.level - 1);
      b.cd = def.cd;
    }
  }
  refreshStats() {
    for (const u of this.units) if (!u.dead) this.applyStats(u, false);
    for (const b of this.buildings) this.applyBuildingStats(b, false);
  }

  // ------------------------------------------------------------------ spawning
  spawnUnit(def, team, x, z, opts = {}) {
    const u = new Unit(this, def, team, x, z, opts);
    this.units.push(u);
    return u;
  }
  spawnEnemy(key, x, z, opts = {}) {
    const def = DATA.enemies[key];
    return this.spawnUnit(def, 'enemy', x, z, opts);
  }
  addHero(key, x, z) {
    const def = DATA.heroes[key];
    if (!def) return null;
    const p = this.findSpawnSpot(x, z);
    const u = this.spawnUnit(def, 'player', p.x, p.z, { hero: true, heroKey: key });
    u.post = { x: 0, z: 6 };
    this.heroesOwned.push(key);
    return u;
  }
  findSpawnSpot(x, z) {
    const g = this.grid;
    const c = g.worldToCell(x, z);
    for (let r = 0; r < 8; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = c.i + di, j = c.j + dj;
        if (!g.inBounds(i, j) || g.flagAt(i, j) !== CELL_FREE) continue;
        const w = g.cellToWorld(i, j);
        const crowded = this.unitsNear(w.x, w.z, 0.9, 'player').length;
        if (!crowded) return { x: w.x + U.rand(-0.3, 0.3), z: w.z + U.rand(-0.3, 0.3) };
      }
    }
    return { x, z };
  }
  musterPoint() {
    const barracks = this.buildings.filter(b => b.def.key === 'barracks' && b.active);
    if (barracks.length) { const b = barracks[barracks.length - 1]; return { x: b.pos.x, z: b.pos.z + b.radius + 1.5 }; }
    return { x: 0, z: 5 };
  }

  // ------------------------------------------------------------------ economy
  canAfford(c) { return this.gold >= c; }
  spend(c) { this.gold -= c; this.ui.dirty = true; }
  addGold(n) { this.gold += n; this.stats.goldEarned += n; this.ui.dirty = true; }
  hasBuilding(key) { return this.buildings.some(b => b.def.key === key && !b.dead); }
  hasActive(key) { return this.buildings.some(b => b.def.key === key && b.active); }
  soldierCap() {
    if (this.replica) return this.replicaCap || 0;
    let cap = DATA.baseSoldierCap + 3 * (this.upgrades.garrison || 0);
    for (const b of this.buildings) if (b.def.soldierCap && b.active) cap += b.def.soldierCap;
    return cap;
  }
  soldierCount() { return this.units.filter(u => u.isSoldier && !u.dead && !u.def.noCap).length; }
  engineerCount() { return this.units.filter(u => u.def.repair && !u.dead).length; }
  upgradeCost(key) { const d = DATA.upgrades[key]; return Math.round(d.cost * Math.pow(DATA.upgradeCostGrowth, this.upgrades[key] || 0)); }
  // buildings with costGrowth get pricier for every one you already own (destroyed ones do not count)
  buildingCost(def) {
    if (!def.costGrowth) return def.cost;
    const n = this.buildings.filter(b => b.def.key === def.key && !b.dead).length;
    return Math.round(def.cost * Math.pow(def.costGrowth, n));
  }
  heroCost() { return Math.round(DATA.heroBaseCost * Math.pow(DATA.heroCostGrowth, this.heroesBought || 0)); }

  placeBuilding(key, i, j, rot, quiet = false, free = false) {
    const def = DATA.buildings[key];
    if (!def) return null;
    if (this.replica) { if (this.canAfford(this.buildingCost(def)) && this.grid.canPlace(def, i, j, rot, this).ok) this.net.send({ t: 'build', key, i, j, rot }); else if (!quiet) this.ui.toast('Cannot build there', 'error'); return null; }
    if (def.unique && this.hasBuilding(key)) { if (!quiet) this.ui.toast('You can only build one ' + def.name, 'error'); return null; }
    const res = this.grid.canPlace(def, i, j, rot, this);
    if (!res.ok) { if (!quiet) this.ui.toast(res.reason, 'error'); return null; }
    const cost = this.buildingCost(def);
    if (!free && !this.canAfford(cost)) { if (!quiet) { this.ui.toast('Not enough gold', 'error'); SFX.play('error'); } return null; }
    if (!free) this.spend(cost);
    const b = new Building(this, def, i, j, rot, res.cells);
    b.paid = free ? def.cost : cost;
    this.grid.place(b);
    this.buildings.push(b);
    if (!free && this.waves && this.waves.active) {
      b.startConstruction();
      if (!quiet && this.engineerCount() === 0 && !this.warnedNoEngineer) { this.warnedNoEngineer = true; this.ui.toast('Construction site placed. During a wave only Engineers can build. Recruit one, or it completes when the wave ends.', 'warn', 6000); }
    }
    this.ui.dirty = true;
    return b;
  }
  sellBuilding(b) {
    if (this.replica) { if (b && !b.def.keep) this.net.send({ t: 'bld', op: 'sell', id: b.id }); return; }
    if (!b || b.dead || b.def.keep) { if (b && b.def.keep) this.ui.toast('You cannot sell the Keep', 'error'); return; }
    const v = b.sellValue();
    this.addGold(v);
    this.removeBuilding(b);
    this.ui.toast(`Sold ${b.name} for ${v} gold`);
    SFX.play('coin');
    if (this.controls.selectedBuilding === b) this.controls.clearSelection();
  }
  repairBuilding(b) {
    if (this.repairsLocked()) { this.ui.toast('During a wave only Engineers can repair. Paid repairs resume when it ends.', 'error'); SFX.play('error'); return; }
    if (this.replica) { this.net.send({ t: 'bld', op: 'repair', id: b.id }); return; }
    const c = b.repairCost();
    if (c <= 0) return;
    if (!this.canAfford(c)) { this.ui.toast('Not enough gold', 'error'); SFX.play('error'); return; }
    this.spend(c); b.hp = b.maxHp; b.game.grid.flowDirty = true;
    this.effects.spawn('heal', b.pos.x, 2, b.pos.z, { radius: b.radius });
    SFX.play('build'); this.ui.onSelectionChanged();
  }
  repairTotal() { let t = 0; for (const b of this.buildings) t += b.repairCost(); return t; }
  repairPriority(b) { return b.def.keep ? 5 : (b.def.tower ? 4 : (b.def.gate ? 3 : (b.def.cat === 'economy' ? 2 : 1))); }
  // repairs everything it can afford, most important buildings first
  repairsLocked() { return !!(this.waves && this.waves.active); }
  repairAll(auto = false) {
    if (this.replica) { if (this.repairsLocked()) { this.ui.toast('During a wave only Engineers can repair. Paid repairs resume when it ends.', 'error'); return; } this.net.send({ t: 'repairAll' }); return; }
    if (!auto && this.repairsLocked()) { this.ui.toast('During a wave only Engineers can repair. Paid repairs resume when it ends.', 'error'); SFX.play('error'); return; }
    const list = this.buildings.filter(b => !b.dead && b.repairCost() > 0).sort((a, b) => this.repairPriority(b) - this.repairPriority(a) || a.repairCost() - b.repairCost());
    if (!list.length) { if (!auto) this.ui.toast('Nothing to repair'); return; }
    let spent = 0, n = 0, skipped = 0;
    for (const b of list) {
      const c = b.repairCost();
      if (!this.canAfford(c)) { skipped++; continue; }
      this.spend(c); b.hp = b.maxHp; spent += c; n++;
    }
    this.grid.flowDirty = true;
    if (n) SFX.play('build');
    if (skipped && !n) { this.ui.toast(`Not enough gold to repair anything (cheapest repair ${Math.min(...list.map(b => b.repairCost()))})`, 'error'); SFX.play('error'); return; }
    this.ui.toast(`${auto ? 'Auto-repaired' : 'Repaired'} ${n} building${n === 1 ? '' : 's'} for ${spent} gold${skipped ? `, ${skipped} left damaged (out of gold)` : ''}`, skipped ? 'warn' : 'info');
    this.ui.dirty = true;
  }
  upgradeBuilding(b) {
    if (!b.canUpgrade()) return;
    if (this.replica) { this.net.send({ t: 'bld', op: 'upgrade', id: b.id }); return; }
    const c = b.upgradeCost();
    if (!this.canAfford(c)) { this.ui.toast('Not enough gold', 'error'); SFX.play('error'); return; }
    this.spend(c);
    b.level++;
    this.applyBuildingStats(b, false);
    b.build3D();
    this.effects.spawn('ring', b.pos.x, 0.3, b.pos.z, { radius: b.radius + 1, color: 0xffd040 });
    SFX.play('levelup'); this.ui.onSelectionChanged();
  }
  removeBuilding(b) {
    b.dead = true;
    this.grid.remove(b);
    b.remove();
    const k = this.buildings.indexOf(b); if (k >= 0) this.buildings.splice(k, 1);
    this.refreshStats();
    this.ui.dirty = true;
  }
  buyUnit(key) {
    const def = DATA.units[key];
    if (!def) return;
    if (this.replica) { this.net.send({ t: 'buy', key }); return; }
    if (def.noCap) { if (this.engineerCount() >= def.maxCount) { this.ui.toast(`You can have at most ${def.maxCount} engineers`, 'error'); SFX.play('error'); return; } }
    else if (this.soldierCount() >= this.soldierCap()) { this.ui.toast('Soldier capacity reached. Build a Barracks or research Garrison.', 'error'); SFX.play('error'); return; }
    if (!this.canAfford(def.cost)) { this.ui.toast('Not enough gold', 'error'); SFX.play('error'); return; }
    this.spend(def.cost);
    const m = this.musterPoint();
    const p = this.findSpawnSpot(m.x, m.z);
    const u = this.spawnUnit(def, 'player', p.x, p.z);
    u.post = { x: p.x, z: p.z };
    this.effects.spawn('ring', p.x, 0.3, p.z, { radius: 1.2, color: 0x80c0ff });
    SFX.play('coin');
    return u;
  }
  buyHero(key) {
    if (this.replica) { this.net.send({ t: 'hero', key }); return; }
    if (this.heroesOwned.includes(key)) { this.ui.toast('You already have this hero', 'error'); return; }
    const cost = this.heroCost();
    if (!this.canAfford(cost)) { this.ui.toast(`Not enough gold: ${DATA.heroes[key].name} costs ${cost}`, 'error'); SFX.play('error'); return; }
    this.spend(cost);
    this.heroesBought = (this.heroesBought || 0) + 1;
    const u = this.addHero(key, 0, 6);
    this.effects.spawn('ring', u.pos.x, 0.3, u.pos.z, { radius: 3, color: 0xffd040 });
    this.ui.toast(`${u.name} joins your cause!`);
    SFX.play('levelup');
    this.ui.dirty = true;
  }
  buyUpgrade(key) {
    if (this.replica) { this.net.send({ t: 'upg', key }); return; }
    const d = DATA.upgrades[key];
    const lvl = this.upgrades[key] || 0;
    if (lvl >= d.max) return;
    if (d.requires && !this.hasBuilding(d.requires)) { this.ui.toast(`Requires a ${DATA.buildings[d.requires].name}`, 'error'); SFX.play('error'); return; }
    const c = this.upgradeCost(key);
    if (!this.canAfford(c)) { this.ui.toast('Not enough gold', 'error'); SFX.play('error'); return; }
    this.spend(c);
    this.upgrades[key] = lvl + 1;
    this.refreshStats();
    this.ui.toast(`${d.name} level ${lvl + 1}`);
    SFX.play('levelup');
    this.ui.dirty = true;
  }

  // ------------------------------------------------------------------ commands
  orderable(units) { return units.filter(u => !u.dead && u.team === 'player' && !u.possessedBy); }
  commandMove(units, x, z, type = 'attackmove') {
    if (this.replica) { this.net.send({ t: 'cmd', kind: 'move', ids: units.map(u => u.id), x: +x.toFixed(2), z: +z.toFixed(2), type }); return; }
    units = this.orderable(units);
    const n = units.length;
    if (!n) return;
    const side = Math.ceil(Math.sqrt(n)), spacing = 1.7;
    const sorted = [...units].sort((a, b) => U.dist2(a.pos.x, a.pos.z, x, z) - U.dist2(b.pos.x, b.pos.z, x, z));
    sorted.forEach((u, k) => {
      const col = k % side, row = Math.floor(k / side);
      let ox = (col - (side - 1) / 2) * spacing, oz = (row - (side - 1) / 2) * spacing;
      if (n === 1) { ox = 0; oz = 0; }
      let tx = x + ox, tz = z + oz;
      if (!this.grid.passableWorld(tx, tz, 'player')) { tx = x; tz = z; }
      u.command = { type, x: tx, z: tz }; u.target = null; u.path = null; u.repathTimer = 0;
    });
  }
  commandAttack(units, target) { if (this.replica) { this.net.send({ t: 'cmd', kind: 'attack', ids: units.map(u => u.id), target: target.id }); return; } for (const u of this.orderable(units)) { u.command = { type: 'attack', target }; u.target = target; u.path = null; u.repathTimer = 0; } }
  commandFollow(units, leader) { if (this.replica) { this.net.send({ t: 'cmd', kind: 'follow', ids: units.map(u => u.id), leader: leader.id }); return; } this.orderable(units).forEach((u, k) => { if (u !== leader) { u.command = { type: 'follow', leader, slot: k }; u.target = null; u.path = null; u.repathTimer = 0; } }); }
  commandHold(units) { if (this.replica) { this.net.send({ t: 'cmd', kind: 'hold', ids: units.map(u => u.id) }); return; } for (const u of this.orderable(units)) { u.command = { type: 'hold' }; u.post = { x: u.pos.x, z: u.pos.z }; u.path = null; u.moveIntent.x = 0; u.moveIntent.z = 0; } }

  // ------------------------------------------------------------------ queries
  unitById(id) { for (const u of this.units) if (u.id === id) return u; return null; }
  buildingById(id) { for (const b of this.buildings) if (b.id === id) return b; return null; }
  unitsNear(x, z, r, team) {
    const out = this.hash.query(x, z, r, this.scratch);
    const res = [];
    for (const u of out) if (!u.dead && (!team || u.team === team)) res.push(u);
    return res;
  }
  hostilesNear(unit, r) { return this.unitsNear(unit.pos.x, unit.pos.z, r, unit.team === 'player' ? 'enemy' : 'player'); }
  buildingsNear(x, z, r) { return this.buildings.filter(b => !b.dead && U.dist(b.pos.x, b.pos.z, x, z) - b.radius <= r); }
  nearestBuilding(x, z, r) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (b.dead) continue;
      const d = U.dist(b.pos.x, b.pos.z, x, z) - b.radius;
      if (d <= r && d < bd) { bd = d; best = b; }
    }
    return best;
  }
  densestCluster(x, z, searchR, clusterR, team) {
    const list = this.unitsNear(x, z, searchR, team);
    let best = null, bestC = 0, boss = false;
    for (const a of list) {
      let c = 0, hasBoss = false;
      for (const b of list) if (U.dist2(a.pos.x, a.pos.z, b.pos.x, b.pos.z) <= clusterR * clusterR) { c++; if (b.isBoss) hasBoss = true; }
      if (c > bestC) { bestC = c; best = a; boss = hasBoss; }
    }
    return best ? { x: best.pos.x, z: best.pos.z, count: bestC, boss } : null;
  }
  enemiesAlive() { let n = 0; for (const u of this.units) if (u.team === 'enemy' && !u.dead) n++; return n; }
  areaDamage(x, z, r, dmg, team, source, o = {}) {
    const other = team === 'player' ? 'enemy' : 'player';
    const srcSheltered = source && source.pos ? this.grid.shelteredWorld(source.pos.x, source.pos.z) : false;
    for (const u of this.unitsNear(x, z, r, other)) {
      if (u.dead) continue;
      if (o.excludeSheltered && u.sheltered && !srcSheltered) continue;
      let d = dmg;
      if (u.large && o.bonusVsLarge > 1) d *= o.bonusVsLarge;
      // falloff toward the edge
      const dist = U.dist(u.pos.x, u.pos.z, x, z);
      d *= 1 - 0.4 * Math.max(0, dist - r * 0.4) / (r * 0.6 + 1e-6);
      u.takeDamage(d, source, { magic: !!o.magic });
      if (o.slow) u.applySlow(o.slow.factor, o.slow.dur);
      if (o.burn) u.applyBurn(o.burn.dps, o.burn.dur, source);
      if (o.stun) u.stun(o.stun);
    }
    if (team === 'enemy') {
      const bd = o.buildingDmg || dmg * 0.5;
      for (const b of this.buildingsNear(x, z, r)) b.takeDamage(bd, source);
    }
  }
  fireProjectile(o) { const p = new Projectile(this, o); this.projectiles.push(p); return p; }
  addZone(o) { const z = new Zone(this, o); this.zones.push(z); return z; }

  // ------------------------------------------------------------------ events
  onUnitDied(u, source) {
    if (u.team === 'enemy') {
      const reward = Math.round((u.def.reward || 0) * this.difficulty.gold);
      if (reward) this.addGold(reward);
      this.stats.kills++;
      this.lastEnemyDeath = this.time;
      if (u.isBoss) { this.boss = null; this.ui.toast(`${u.name} is slain!`, 'boss'); }
    } else {
      if (u.isKing) { this.gameOver(); }
      else if (u.isHero) { this.fallenHeroes.push(u.heroKey); this.ui.toast(`${u.name} has fallen. They will return after the wave.`, 'error', 5000); }
    }
    if (this.controls.controlled === u) this.controls.exitControl();
    if (u.selected) { u.selected = false; this.controls.selected.delete(u); this.ui.onSelectionChanged(); }
    if (u.hovered) { u.hovered = false; this.controls.hovered = null; }
    this.ui.dirty = true;
  }
  onBuildingDestroyed(b, source) {
    this.grid.remove(b);
    const k = this.buildings.indexOf(b); if (k >= 0) this.buildings.splice(k, 1);
    this.stats.buildingsLost++;
    this.effects.spawn('explosion', b.pos.x, 1, b.pos.z, { radius: b.radius + 1, color: 0x8a8070 });
    if (b.def.keep) this.ui.toast('The Keep has fallen! The King is exposed!', 'error', 6000);
    else if (b.def.tower || b.def.cat === 'economy') this.ui.toast(`${b.name} destroyed!`, 'error');
    if (this.controls.selectedBuilding === b) this.controls.clearSelection();
    if (this.controls.hoveredBuilding === b) this.controls.hoveredBuilding = null;
    for (const u of this.units) if (u.repairTarget === b) u.repairTarget = null;
    if (b.def.soldierCap || b.def.key === 'blacksmith') this.refreshStats();
    SFX.play('explode', 0.8);
    this.ui.dirty = true;
  }
  onWaveCleared(n) {
    let income = 0;
    for (const b of this.buildings) if (b.underConstruction) b.finishConstruction();
    for (const b of this.buildings) if (b.def.income && b.active) income += b.def.income;
    const bonus = Math.round(DATA.waves.clearBonus(n) * this.difficulty.gold);
    this.addGold(bonus + income);
    this.stats.wavesCleared = n;
    if (this.autoRepair) setTimeout(() => { if (this.started && !this.over) this.repairAll(true); }, 800);
    for (const u of this.units) if (u.team === 'player' && !u.dead) u.heal(u.maxHp * 0.3);
    for (const key of this.fallenHeroes) {
      const u = this.addHero(key, 0, 6);
      this.heroesOwned = [...new Set(this.heroesOwned)];
      u.hp = u.maxHp * 0.5;
      this.effects.spawn('heal', u.pos.x, 1, u.pos.z, { radius: 2 });
    }
    this.fallenHeroes = [];
    this.ui.toast(`Wave ${n} cleared! +${bonus} gold bonus${income ? ` +${income} income` : ''}. Units healed.`, 'good', 6000);
    SFX.play('wavecleared');
    this.ui.dirty = true;
  }
  tryStartWave() {
    if (!this.started || this.over) return;
    if (this.replica) { if (this.waves.active) this.ui.toast('Clear the current wave first', 'error'); else this.net.send({ t: 'wave' }); return; }
    if (this.waves.active) { this.ui.toast('Clear the current wave first', 'error'); return; }
    if (this.paused) this.togglePause();
    this.waves.start();
    this.lastEnemyDeath = this.time;
    this.ui.dirty = true;
  }
  gameOver() {
    if (this.over) return;
    this.over = true;
    if (this.controls.mode === 'fps') this.controls.exitControl();
    this.ui.showGameOver();
    SFX.play('gameover');
  }
  togglePause() { if (!this.started || this.over) return; if (this.replica) { this.ui.toast('Only the host can pause', 'error'); return; } this.paused = !this.paused; this.ui.onPause(); }
  setTimeScale(s) { if (this.replica) { this.ui.toast('Only the host can change the game speed', 'error'); return; } this.timeScale = s; this.ui.dirty = true; }

  // ------------------------------------------------------------------ loop
  loop(t) {
    this.frameCount++;
    if (this.debugEl === undefined) this.debugEl = /[?&]debug/.test(location.search) ? document.getElementById('errlog') : null;
    if (this.debugEl) { this.debugEl.classList.remove('hidden'); this.debugEl.textContent = `frame ${this.frameCount} t=${(t / 1000).toFixed(2)} cam=${this.camera.position.toArray().map(v => v.toFixed(1)).join(',')} rot=${this.camera.rotation.toArray().slice(0, 3).map(v => (+v).toFixed(2)).join(',')} canvas=${this.renderer.domElement.width}x${this.renderer.domElement.height} started=${this.started} paused=${this.paused} units=${this.units.length} errors=${window.__errors.length}`; }
    if (!this.maxFrames || this.frameCount < this.maxFrames) requestAnimationFrame(this.loop);
    const realDt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    this.fpsCounter.frames++; this.fpsCounter.t += realDt;
    if (this.fpsCounter.t >= 1) { this.fpsCounter.fps = this.fpsCounter.frames; this.fpsCounter.frames = 0; this.fpsCounter.t = 0; }
    if (this.started) {
      const active = !this.paused && !this.over;
      const dt = active ? realDt * this.timeScale : 0;
      this.controls.update(dt, realDt);
      if (this.replica) { if (!this.over) this.netClient.frame(realDt); }
      else if (active && dt > 0) {
        // variable timestep matched to the display refresh; sub-step only when a frame covers a lot of game time
        const n = Math.max(1, Math.ceil(dt / (1 / 50)));
        const h = dt / n;
        for (let k = 0; k < n; k++) this.update(h);
      }
      this.updateVisualsOnly(realDt);
      this.ui.update(realDt);
    }
    this.renderer.render(this.scene, this.camera);
  }
  updateVisualsOnly(realDt) {
    // things that should keep moving while paused: shadows follow camera, command marker fade
    const f = this.controls.mode === 'fps' ? this.controls.controlled.pos : this.controls.focus;
    const t = new THREE.Vector3(f.x, 0, f.z);
    const tx = t.dot(this.sunRight), ty = t.dot(this.sunUp);
    const sx = Math.round(tx / this.sunTexel) * this.sunTexel - tx, sy = Math.round(ty / this.sunTexel) * this.sunTexel - ty;
    t.addScaledVector(this.sunRight, sx).addScaledVector(this.sunUp, sy);
    this.sun.target.position.copy(t); this.sun.position.copy(t).add(this.sunOffset);
    if (this.markerT > 0) { this.markerT -= realDt; this.marker.scale.setScalar(0.6 + (1 - this.markerT / 0.7) * 1.5); this.marker.material.opacity = Math.max(0, this.markerT); if (this.markerT <= 0) this.marker.visible = false; }
    this.effects.update(realDt * (this.paused ? 0 : this.timeScale));
  }
  update(dt) {
    this.time += dt;
    const prof = this.prof || (this.prof = { hash: 0, flow: 0, waves: 0, units: 0, buildings: 0, projectiles: 0, zones: 0, astar: 0, astarN: 0, flowN: 0 });
    let t0 = performance.now();
    // spatial hash
    this.hash.clear();
    for (const u of this.units) if (!u.dead) this.hash.insert(u);
    let t1 = performance.now(); prof.hash += t1 - t0; t0 = t1;
    // flow field toward the king
    this.flowTimer -= dt;
    if (this.king) {
      const kc = this.grid.worldToCell(this.king.pos.x, this.king.pos.z);
      const ft = this.grid.flowTarget;
      const moved = !ft || ft.i !== kc.i || ft.j !== kc.j;
      if ((this.grid.flowDirty && this.flowTimer <= 0) || moved || this.flowTimer <= -1.5) { this.grid.computeFlow(kc.i, kc.j); this.flowTimer = 0.4; prof.flowN++; }
    }
    t1 = performance.now(); prof.flow += t1 - t0; t0 = t1;
    this.waves.update(dt);
    if (this.waves.active && !this.waves.pending.length && this.time - this.lastEnemyDeath > 25 && this.time - this.lastStallHint > 30) {
      this.lastStallHint = this.time;
      const rem = this.units.filter(u => u.team === 'enemy' && !u.dead);
      if (rem.length && rem.length <= 8) {
        const names = {}; for (const u of rem) names[u.name] = (names[u.name] || 0) + 1;
        this.ui.toast(`${rem.length} enemies remain: ${Object.entries(names).map(([n, k]) => `${k} ${n}`).join(', ')}. Check the minimap and send units after them.`, 'warn', 6000);
      }
    }
    t1 = performance.now(); prof.waves += t1 - t0; t0 = t1;
    for (const u of this.units) u.update(dt);
    if (this.units.some(u => u.removed)) this.units = this.units.filter(u => !u.removed);
    t1 = performance.now(); prof.units += t1 - t0; t0 = t1;
    for (const b of this.buildings) b.update(dt);
    t1 = performance.now(); prof.buildings += t1 - t0; t0 = t1;
    for (const p of this.projectiles) p.update(dt);
    if (this.projectiles.some(p => p.dead)) this.projectiles = this.projectiles.filter(p => !p.dead);
    t1 = performance.now(); prof.projectiles += t1 - t0; t0 = t1;
    for (const z of this.zones) z.update(dt);
    if (this.zones.some(z => z.dead)) this.zones = this.zones.filter(z => !z.dead);
    t1 = performance.now(); prof.zones += t1 - t0; t0 = t1;
    if (this.netHost) this.netHost.update(dt);
  }
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // the page's own source, so an embedded copy can hand the viewer the standalone file
  try { window.__selfSource = '<!DOCTYPE html>\n' + document.documentElement.outerHTML; } catch (e) { window.__selfSource = null; }
  Models.initMats();
  const params = new URLSearchParams(location.search);
  window.game = new Game({ testMode: !!params.get('test'), maxFrames: parseInt(params.get('maxframes') || '0', 10) });
  if (params.get('test')) runSelfTest(window.game, params);
  else if (params.get('mphost')) {
    // headless network test: host a real room with a fixed code
    const tr = new PeerTransport();
    tr.host(params.get('mphost'), (err) => {
      if (err) { console.log('NETTEST host error ' + (err.message || err.type)); return; }
      window.game.ui.hideMenu(); window.game.newGame(params.get('hero') || 'knight', 'normal');
      const nh = new NetHost(window.game, tr, params.get('mphost'));
      console.log('NETTEST host room open');
      tr.on('open', (id) => console.log('NETTEST host: client connected ' + id));
      setInterval(() => console.log(`NETTEST host: players=${nh.playerCount} units=${window.game.units.length} buildings=${window.game.buildings.length} seq=${nh.seq} wave=${window.game.waves.number} active=${window.game.waves.active} enemies=${window.game.enemiesAlive()}`), 5000);
    });
  } else if (params.get('mpjoin')) {
    window.game.startJoin(params.get('mpjoin'), params.get('hero') || 'ranger', 'Headless', (err) => {
      if (err) { console.log('NETTEST join error ' + (err.message || err.type)); return; }
      window.game.ui.hideMenu();
      console.log('NETTEST client connected');
      let acted = false;
      setInterval(() => {
        const g = window.game, nc = g.netClient;
        console.log(`NETTEST client: snaps=${nc.snapCount} units=${g.units.length} buildings=${g.buildings.length} gold=${g.gold} hero=${!!g.units.find(u => u.isHero && u.heroKey === 'ranger')} enemies=${g.enemiesAlive()} wave=${g.waves.number} active=${g.waves.active} proj=${nc.proj.size}`);
        if (nc.snapCount > 10 && !acted) { acted = true; g.buyUnit('archer'); g.placeBuilding('wall', g.grid.half - 14, g.grid.half - 14, 0); g.tryStartWave(); const h = g.units.find(u => u.isHero && u.heroKey === 'ranger'); if (h) { g.controls.setSelection([h]); g.controls.enterControl(h); g.controls.keys = { KeyW: true }; } console.log('NETTEST client: sent orders + possessed hero'); }
      }, 5000);
    });
  } else if (params.get('autostart')) {
    window.game.ui.hideMenu();
    window.game.newGame(params.get('hero') || 'knight', params.get('difficulty') || 'normal');
    const pre = parseFloat(params.get('presim') || '0');
    if (pre > 0) { if (params.get('wave')) window.game.tryStartWave(); for (let t = 0; t < pre; t += 1 / 60) window.game.update(1 / 60); }
    if (params.get('buy')) for (const k of params.get('buy').split(',')) window.game.buyUnit(k);
    if (params.get('damage')) { let k = 0; for (const b of window.game.buildings) { if (b.def.key === 'wall' && b.pos.z > 10 && (k++ % 2 === 0)) b.hp = b.maxHp * (0.15 + (k % 5) * 0.17); if (b.def.tower && b.pos.z > 0) b.hp = b.maxHp * 0.45; } for (const u of window.game.units) if (u.isSoldier) u.hp = u.maxHp * (0.3 + Math.random() * 0.5); }
    if (params.get('showdamage')) window.game.ui.showDamage = true;
    if (params.get('heroat')) { const h = window.game.units.find(u => u.isHero); const [x, z] = params.get('heroat').split(',').map(parseFloat); h.pos.set(x, 0, z); h.post = { x, z }; }
    if (params.get('fps')) { const h = window.game.units.find(u => u.isHero); if (h) { window.game.controls.enterControl(h); if (params.get('yaw')) window.game.controls.fpsYaw = parseFloat(params.get('yaw')); if (params.get('pitch')) window.game.controls.fpsPitch = parseFloat(params.get('pitch')); window.game.update(1 / 60); } }
    if (params.get('camdist')) window.game.controls.camDist = parseFloat(params.get('camdist'));
  }
});

// A simple "player" used by the self-test to gauge balance: towers at the gate, soldiers to cap, upgrades.
function botSpend(game, waveIdx) {
  const h = game.grid.half;
  const towerSpots = [[h - 3, h + 8], [h + 2, h + 8], [h - 3, h - 11], [h + 2, h - 11], [h - 11, h - 3], [h - 11, h + 2], [h + 10, h - 3], [h + 10, h + 2], [h - 6, h + 8], [h + 5, h + 8]];
  const towerTypes = ['arrow_tower', 'ballista_tower', 'mage_tower', 'frost_tower', 'ballista_tower', 'arrow_tower'];
  game.autoRepair = true;
  game.repairAll();
  if (game.engineerCount() < 2) game.buyUnit('engineer');
  if (!game.hasBuilding('barracks')) game.placeBuilding('barracks', h - 6, h + 3, 0, true);
  if (waveIdx >= 2 && !game.hasBuilding('farm')) game.placeBuilding('farm', h + 3, h + 3, 0, true);
  if (waveIdx >= 4 && !game.hasBuilding('blacksmith')) game.placeBuilding('blacksmith', h - 6, h - 6, 0, true);
  for (let k = 0; k < towerSpots.length; k++) {
    const [i, j] = towerSpots[k];
    if (!game.grid.buildingAt(i, j) && game.gold > 400) game.placeBuilding(towerTypes[k % towerTypes.length], i, j, 0, true);
  }
  let guard = 0;
  while (game.soldierCount() < game.soldierCap() && game.gold > 150 && guard++ < 20) game.buyUnit(['swordsman', 'archer', 'pikeman'][guard % 3]);
  for (const k of ['towers', 'walls', 'weapons', 'armor', 'hero', 'royal']) if (game.gold > 350) game.buyUpgrade(k);
  if (game.gold > 900 && game.heroesOwned.length < 3) game.buyHero(Object.keys(DATA.heroes).find(k => !game.heroesOwned.includes(k)));
  // soldiers guard the gate
  game.commandMove(game.units.filter(u => u.isSoldier && !u.dead), 0, 14, 'attackmove');
}

// Headless smoke test: ?test=1&hero=knight&waves=3
function runSelfTest(game, params) {
  const log = [];
  const out = document.createElement('pre'); out.id = 'testlog'; out.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;background:#000;color:#0f0;font:11px monospace;max-height:100vh;overflow:auto;';
  document.body.appendChild(out);
  const say = (s) => { log.push(s); out.textContent = log.join('\n'); };
  window.onerror = (m, src, line, col, err) => { say('ERROR: ' + m + ' @' + src + ':' + line + ':' + col + '\n' + (err && err.stack)); };
  try {
    game.ui.hideMenu();
    game.newGame(params.get('hero') || 'knight', 'normal');
    say('after newGame: buildings=' + game.buildings.length + ' damaged=' + game.buildings.filter(b => b.hp < b.maxHp - 0.5).length + ' sample=' + game.buildings.slice(0, 3).map(b => b.def.key + ':' + b.hp + '/' + b.maxHp).join(' '));
    game.update(1 / 60);
    say('after 1 step: damaged=' + game.buildings.filter(b => b.hp < b.maxHp - 0.5).length + ' barsVisible=' + game.buildings.filter(b => b.hpBar.group.visible).length);
    const wavesToRun = parseInt(params.get('waves') || '2', 10);
    const secondsPerWave = parseInt(params.get('secs') || '90', 10);
    const step = 1 / 60;
    let simT = 0;
    const maxReal = parseFloat(params.get('maxreal') || '60') * 1000;
    const t0real = performance.now();
    let lastSec = -1;
    for (let w = 0; w < wavesToRun; w++) {
      game.tryStartWave();
      if (params.get('spawn')) for (const k of params.get('spawn').split(',')) { const u = game.spawnEnemy(k, U.rand(-60, 60), -66, { hpMul: 1 }); if (u.isBoss) game.boss = u; say('spawned ' + k); }
      let t = 0;
      while (t < secondsPerWave && game.waves.active && !game.over) {
        if (performance.now() - t0real > maxReal) { say('REAL TIME LIMIT HIT at sim t=' + t.toFixed(1)); break; }
        game.update(step); t += step; simT += step;
        if (Math.floor(t) !== lastSec) { lastSec = Math.floor(t); if (params.get('verbose')) say(`  t=${lastSec}s real=${((performance.now() - t0real) / 1000).toFixed(1)}s enemies=${game.enemiesAlive()} kills=${game.stats.kills} proj=${game.projectiles.length} units=${game.units.length} astarN=${game.prof.astarN} astar=${Math.round(game.prof.astar)}ms units=${Math.round(game.prof.units)}ms`); }
        if (Math.floor(t) % 15 === 0 && Math.abs(t - Math.round(t)) < step / 2) {
          // exercise controls occasionally
          if (t === 15 && game.units.find(u => u.isHero)) { game.controls.enterControl(game.units.find(u => u.isHero)); game.controls.keys.KeyW = true; game.controls.attackHeld = true; }
          if (t === 30) { game.controls.keys.KeyW = false; game.controls.attackHeld = false; game.controls.exitControl(); }
          game.controls.update(step, step);
        }
      }
      say('prof ' + JSON.stringify(Object.fromEntries(Object.entries(game.prof).map(([k, v]) => [k, Math.round(v)]))));
      if (params.get('bars')) say('   damaged buildings: ' + game.buildings.filter(b => b.hp < b.maxHp - 0.5).map(b => b.def.key + '@' + b.pos.x + ',' + b.pos.z + ' ' + Math.round(b.hp)).join(' | ') + ' barsVisible=' + game.buildings.filter(b => b.hpBar.group.visible).length);
      if (game.buildings.some(b => b.underConstruction)) say('   sites under construction: ' + game.buildings.filter(b => b.underConstruction).map(b => b.def.key + ' ' + Math.round(b.progress * 100) + '%').join(', '));
      say(`[${(performance.now() / 1000).toFixed(1)}s real] wave ${game.waves.number}: active=${game.waves.active} t=${t.toFixed(1)} enemies=${game.enemiesAlive()} kills=${game.stats.kills} gold=${Math.round(game.gold)} kingHP=${Math.round(game.king.hp)} units=${game.units.length} projectiles=${game.projectiles.length} over=${game.over}`);
      if (game.waves.active) {
        for (const u of game.units) if (u.team === 'enemy' && !u.dead) {
          const c = game.grid.worldToCell(u.pos.x, u.pos.z);
          say(`   stalled: ${u.def.key} at (${u.pos.x.toFixed(1)},${u.pos.z.toFixed(1)}) cell ${c.i},${c.j} flag=${game.grid.flagAt(c.i, c.j)} integ=${game.grid.integ[game.grid.idx(c.i, c.j)].toFixed(1)} target=${u.target ? (u.target.name + ' hp ' + Math.round(u.target.hp)) : 'none'} hp=${Math.round(u.hp)} stun=${u.stunned} intent=${u.moveIntent.x.toFixed(2)},${u.moveIntent.z.toFixed(2)} speed=${u.effSpeed.toFixed(1)}`);
        }
      }
      if (game.over) break;
      if (params.get('bot')) botSpend(game, w); else {
        const h = game.grid.half;
        for (let i = h - 12; i <= h + 12; i++) game.placeBuilding('wall', i, h - 12, 0, true);
        game.placeBuilding('ballista_tower', h + 3, h - 14, 0, true);
        game.buyUnit('archer'); game.buyUnit('pikeman');
        game.buyUpgrade('walls');
        game.controls.setBuild('wall'); game.controls.cancelBuild();
      }
    }
    if (params.get('mptest')) {
      const [A, B] = LoopbackTransport.pair();
      const host = game;
      const hn = new NetHost(host, A, 'TEST');
      const client = new Game({ testMode: true });
      client.newReplica();
      const cn = new NetClient(client, B, 'A', 'B');
      hn.onJoin('B');
      cn.send({ t: 'hello', name: 'Tester', hero: 'ranger' });
      const step = (n) => { for (let k = 0; k < n; k++) { host.update(1 / 60); client.controls.update(1 / 60, 1 / 60); cn.frame(1 / 60); } };
      step(60);
      say(`mp: host units=${host.units.length} client units=${client.units.length}; buildings host=${host.buildings.length} client=${client.buildings.length}; snapshots=${cn.snapCount} bytes=${A.bytes}`);
      const rangerH = host.units.find(u => u.isHero && u.heroKey === 'ranger'), rangerC = client.units.find(u => u.isHero && u.heroKey === 'ranger');
      say('mp: ranger on both=' + (!!rangerH && !!rangerC) + ' pos diff=' + (rangerH && rangerC ? rangerH.pos.distanceTo(rangerC.pos).toFixed(2) : 'n/a') + ' king on client=' + !!client.king + ' client gold=' + client.gold);
      const h = host.grid.half, before = host.buildings.length;
      client.placeBuilding('wall', h - 14, h - 14, 0); client.buyUnit('archer');
      const sw = client.units.filter(u => u.isSoldier && u.def.key === 'swordsman'); client.commandMove(sw, 6, 20, 'attackmove');
      step(30);
      const hsw = host.units.filter(u => u.isSoldier && u.def.key === 'swordsman');
      say(`mp: after client orders: host buildings +${host.buildings.length - before}, host archers=${host.units.filter(u => u.def.key === 'archer' && u.team === 'player').length}, swordsman orders=${hsw.map(u => u.command ? u.command.type : 'none').join(',')}, client buildings=${client.buildings.length}`);
      client.controls.setSelection([rangerC]); client.controls.enterControl(rangerC);
      step(10);
      say(`mp: possession: host possessedBy=${rangerH.possessedBy} client possessed=${rangerC.possessed}`);
      const p0 = rangerH.pos.clone();
      client.controls.keys = { KeyW: true }; client.controls.fpsYaw = Math.PI;
      step(90);
      client.controls.keys = {};
      say(`mp: host ranger moved ${p0.distanceTo(rangerH.pos).toFixed(2)}m; client at ${rangerC.pos.x.toFixed(1)},${rangerC.pos.z.toFixed(1)} host at ${rangerH.pos.x.toFixed(1)},${rangerH.pos.z.toFixed(1)}`);
      client.controls.fpsYaw = 0; step(5);
      client.controls.attackHeld = true; step(4);
      say(`mp: client shooting: host projectiles=${host.projectiles.length} ranger attackTimer=${rangerH.attackTimer.toFixed(2)}`);
      step(12); client.controls.attackHeld = false;
      say(`mp: client proj meshes=${cn.proj.size} (host live=${host.projectiles.length})`);
      client.controls.useAbility(1); step(8);
      say(`mp: arrow rain: host zones=${host.zones.length} client zones=${cn.zones.size} client ability timer=${rangerC.abilities[1].timer.toFixed(1)}`);
      client.controls.exitControl(); step(5);
      say(`mp: released: host possessedBy=${rangerH.possessedBy}`);
      client.tryStartWave(); step(600);
      say(`mp: wave: host active=${host.waves.active} enemies host=${host.enemiesAlive()} client=${client.enemiesAlive()} client wave active=${client.waves.active} kills=${host.stats.kills} client fx=${client.effects.list.length} bytes/snapshot≈${Math.round(A.bytes / Math.max(1, hn.seq))}`);
      say(`mp: damaged buildings host=${host.buildings.filter(b => b.hp < b.maxHp - 1).length} client=${client.buildings.filter(b => b.hp < b.maxHp - 1).length}; dead units host=${host.units.filter(u => u.dead).length} client=${client.units.filter(u => u.dead).length}`);
      host.newGame('knight', 'normal'); step(30);
      say(`mp: after host restart: client units=${client.units.length} host units=${host.units.length} client buildings=${client.buildings.length} host buildings=${host.buildings.length}`);
    }
    if (params.get('repairtest')) {
      const h = game.grid.half;
      const wall = game.buildings.find(b => b.def.key === 'wall'); wall.hp = wall.maxHp * 0.3;
      const g0 = game.gold; game.repairAll();
      say(`repair: between waves: wall ${Math.round(wall.hp)}/${wall.maxHp} gold ${g0} -> ${Math.round(game.gold)} (expect full, gold spent)`);
      wall.hp = wall.maxHp * 0.3; game.tryStartWave(); game.update(1 / 60);
      const g1 = game.gold; game.repairAll(); game.repairBuilding(wall);
      say(`repair: during wave: wall ${Math.round(wall.hp)}/${wall.maxHp} gold ${g1} -> ${Math.round(game.gold)} (expect still damaged, no gold spent) locked=${game.repairsLocked()}`);
      const eng = game.units.find(u => u.def.repair); eng.pos.set(wall.pos.x, 0, wall.pos.z - 3); eng.command = null;
      for (let i = 0; i < 60 * 12; i++) game.update(1 / 60);
      say(`repair: engineer during wave after 12s: wall ${Math.round(wall.hp)}/${wall.maxHp} (expect higher) target=${eng.repairTarget ? eng.repairTarget.def.key : 'none'}`);
    }
    if (params.get('srctest')) {
      const src = window.__selfSource || '';
      say(`src: captured ${src.length} bytes, doctype=${src.startsWith('<!DOCTYPE html>')}, hasGame=${src.includes('class Game')}, hasNet=${src.includes('class NetHost')}, hasThreeTag=${src.includes('three.min.js')}, hasCanvas=${/<canvas/.test(src.replace(/<canvas id="minimap"[^>]*>/, ''))}`);
      say(`src: webrtcSupported=${game.ui.webrtcSupported()} mprow hidden=${document.getElementById('mprow').classList.contains('hidden')} blocked text="${document.getElementById('mpblocked').textContent.slice(0, 80)}"`);
      say('src: netErrorText=' + game.ui.netErrorText(new Error('The current browser does not support WebRTC'), 'create a room'));
    }
    if (params.get('herotest')) {
      const c = game.controls;
      for (const key of Object.keys(DATA.heroes)) {
        const h = game.addHero(key, 0, 8);
        h.pos.set(0, 0, 8); h.yaw = 0;
        const foes = []; for (let k = 0; k < 4; k++) foes.push(game.spawnEnemy('grunt', -2 + k * 1.3, 14 + (k % 2), { hpMul: 1 }));
        const far = game.spawnEnemy('archer', 0, 26, { hpMul: 1 });
        game.update(1 / 60);
        const hp0 = foes.reduce((a, u) => a + u.hp, 0);
        const okQ = h.useAbility(0, { x: 0, z: 14.5 });
        for (let i = 0; i < 90; i++) game.update(1 / 60);
        const okE = h.useAbility(1, { x: 0, z: 14.5 });
        for (let i = 0; i < 90; i++) game.update(1 / 60);
        const hp1 = foes.filter(u => !u.dead).reduce((a, u) => a + u.hp, 0);
        const wolves = game.units.filter(u => u.def.key === 'wolf' && !u.dead).length, ice = game.buildings.filter(b => b.def.key === 'icewall').length;
        say(`hero ${key}: Q=${okQ} E=${okE} enemies hp ${Math.round(hp0)} -> ${Math.round(hp1)} (dead ${foes.filter(u => u.dead).length}) hero hp=${Math.round(h.hp)}/${Math.round(h.maxHp)} pos=${h.pos.x.toFixed(1)},${h.pos.z.toFixed(1)} wolves=${wolves} ice=${ice} buffs=${h.buffs.map(b => b.tag).join(',')}`);
        for (const u of foes) if (!u.dead) u.die(); far.die(); for (const u of game.units) if (u.def.key === 'wolf' && !u.dead) u.die();
        for (let i = 0; i < 200; i++) game.update(1 / 60);
        h.die(); for (let i = 0; i < 200; i++) game.update(1 / 60);
      }
      // ice walls melt
      for (let i = 0; i < 60 * 16; i++) game.update(1 / 60);
      say(`hero test end: ice walls left=${game.buildings.filter(b => b.def.key === 'icewall').length} (expect 0) units=${game.units.length}`);
    }
    if (params.get('looktest')) {
      const hero = game.units.find(u => u.isHero);
      const c = game.controls;
      hero.pos.set(0, 0, 20); c.enterControl(hero); c.fpsYaw = 0; c.fpsPitch = 0; c.update(1 / 60, 1 / 60);
      const r = c.canvas.getBoundingClientRect();
      const mv = (dx, dy, x, y) => c.onMouseMove({ movementX: dx, movementY: dy, clientX: x, clientY: y, buttons: 0 });
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      mv(0, 0, cx, cy);
      mv(100, 0, cx + 10, cy);
      say(`look: locked=${c.lookLocked}; 100px of mouse motion turned yaw by ${c.fpsYaw.toFixed(3)} rad (expect -0.220)`);
      mv(0, -50, cx, cy); say(`look: 50px up changed pitch to ${c.fpsPitch.toFixed(3)} (expect +0.110)`);
      c.fpsYaw = 0; for (let i = 0; i < 60; i++) c.update(1 / 60, 1 / 60);
      say(`look: cursor in the middle, no motion: yaw drift over 1s=${c.fpsYaw.toFixed(3)} (expect 0)`);
      mv(0, 0, r.left + r.width - 1, cy); for (let i = 0; i < 60; i++) c.update(1 / 60, 1 / 60);
      say(`look: cursor pinned at the right edge: yaw over 1s=${c.fpsYaw.toFixed(3)} (expect about -2.6)`);
      c.fpsYaw = 0; document.dispatchEvent(new MouseEvent('mouseout', { relatedTarget: null })); for (let i = 0; i < 60; i++) c.update(1 / 60, 1 / 60);
      say(`look: cursor left through the right edge: yaw over 1s=${c.fpsYaw.toFixed(3)} (expect about -2.6)`);
      c.fpsYaw = 0; mv(0, 0, cx, cy); for (let i = 0; i < 60; i++) c.update(1 / 60, 1 / 60);
      say(`look: after returning to the middle: yaw over 1s=${c.fpsYaw.toFixed(3)} (expect 0)`);
      // held button: pointer capture keeps delivering motion even from outside the frame
      c.canvas.setPointerCapture = () => {}; c.canvas.releasePointerCapture = () => {};
      const pev = (type, o) => c.canvas.dispatchEvent(Object.assign(new PointerEvent(type, Object.assign({ pointerId: 7, pointerType: 'mouse', bubbles: true, clientX: cx, clientY: cy }, o)), {}));
      let orders = 0; const origSquad = c.squadAttackPoint; c.squadAttackPoint = () => { orders++; };
      c.fpsYaw = 0;
      c.onMouseDown({ button: 2, clientX: cx, clientY: cy }); pev('pointerdown', { button: 2 });
      // PointerEvent movementX is read-only in the constructor init dict, so route through the handler directly
      c.captured = 7; c.applyLook(200, 0); c.rightDrag.moved += 200;
      mv(200, 0, cx + 900, cy); // window mousemove while captured must not double-apply
      say(`look: right-drag 200px while captured: yaw=${c.fpsYaw.toFixed(3)} (expect -0.440, applied once)`);
      c.onMouseUp({ button: 2, clientX: cx + 900, clientY: cy }); pev('pointerup', { button: 2 });
      say(`look: right-button drag issued orders=${orders} (expect 0); captured after release=${c.captured}`);
      c.onMouseDown({ button: 2, clientX: cx, clientY: cy }); c.onMouseUp({ button: 2, clientX: cx, clientY: cy });
      say(`look: right-button tap issued orders=${orders} (expect 1)`);
      c.squadAttackPoint = origSquad;
      c.exitControl();
    }
    if (params.get('aimtest')) {
      const hero = game.units.find(u => u.isHero);
      const c = game.controls;
      hero.pos.set(0, 0, 20); c.enterControl(hero); c.fpsYaw = 0; c.fpsPitch = 0; c.update(1 / 60, 1 / 60);
      const r = c.canvas.getBoundingClientRect();
      say(`aim: lookLocked=${c.lookLocked} unavailable=${!!c.lockUnavailable} err=${c.lockError} aimMode=${c.aimMode} canvas=${r.width}x${r.height}`);
      c.mouseInside = true; c.mouse = { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
      const y0 = c.fpsYaw; for (let i = 0; i < 60; i++) c.update(1 / 60, 1 / 60);
      say(`aim: cursor centred: yaw drift over 1s=${(c.fpsYaw - y0).toFixed(3)} (expect 0)`);
      c.mouse = { x: r.left + r.width * 0.95, y: r.top + r.height * 0.5 };
      for (let i = 0; i < 60; i++) c.update(1 / 60, 1 / 60);
      say(`aim: cursor at right edge: yaw change over 1s=${(c.fpsYaw - y0).toFixed(3)} rad (expect about -2.5)`);
      c.mouse = { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 }; c.fpsYaw = 0; c.update(1 / 60, 1 / 60);
      // an enemy off to the right: aim the cursor at it and swing
      const foe = game.spawnEnemy('grunt', 3.5, 20 + 1.5, { hpMul: 1 }); game.update(1 / 60);
      const sp = c.projectToScreen(new THREE.Vector3(foe.pos.x, foe.centerY, foe.pos.z));
      c.mouse = { x: sp.x, y: sp.y };
      const centre = new THREE.Vector3(); c.camera.getWorldDirection(centre);
      const ad = c.aimDir();
      say(`aim: cursor on enemy at screen ${sp.x.toFixed(0)},${sp.y.toFixed(0)}: aimDir=${ad.x.toFixed(2)},${ad.y.toFixed(2)},${ad.z.toFixed(2)} view centre=${centre.x.toFixed(2)},${centre.y.toFixed(2)},${centre.z.toFixed(2)}`);
      const hp0 = foe.hp; hero.attackTimer = 0; c.playerAttack(hero, 1 / 60);
      say(`aim: melee swing toward cursor hit the enemy: ${foe.hp < hp0} (hp ${hp0} -> ${Math.round(foe.hp)})`);
      c.exitControl();
    }
    if (params.get('econ')) {
      game.gold = 100000;
      const h = game.grid.half, costs = [];
      for (let k = 0; k < 4; k++) { costs.push(game.buildingCost(DATA.buildings.mine)); game.placeBuilding('mine', h - 12 + k * 3, h - 6, 0, true); }
      say('econ: mine prices paid in sequence: ' + costs.join(', ') + ' next=' + game.buildingCost(DATA.buildings.mine));
      const fc = []; for (let k = 0; k < 3; k++) { fc.push(game.buildingCost(DATA.buildings.farm)); game.placeBuilding('farm', h + 2 + k * 4, h - 8, 0, true); }
      say('econ: farm prices: ' + fc.join(', '));
      const m = game.buildings.filter(b => b.def.key === 'mine'); say('econ: mine sell values: ' + m.map(b => b.sellValue()).join(', ') + ' (60% of what was paid)');
      game.sellBuilding(m[3]); say('econ: after selling one mine next costs ' + game.buildingCost(DATA.buildings.mine));
      const hc = []; for (const key of ['ranger', 'pyromancer', 'cleric']) { hc.push(game.heroCost()); game.buyHero(key); }
      say('econ: hero prices paid: ' + hc.join(', ') + ' next=' + game.heroCost() + ' heroes=' + game.heroesOwned.join(','));
      game.gold = 300; say('econ: with 300 gold, can afford a hero=' + game.canAfford(game.heroCost()) + ' mine=' + game.canAfford(game.buildingCost(DATA.buildings.mine)));
    }
    if (params.get('probe4')) {
      // render named views straight to PNG data (the headless screenshot path is unreliable)
      const shots = document.createElement('div'); shots.id = 'shots'; shots.style.display = 'none'; document.body.appendChild(shots);
      game.renderer.setSize(1280, 800); game.camera.aspect = 1.6; game.camera.updateProjectionMatrix();
      const snap = (name) => { game.controls.update(1 / 60, 1 / 60); game.updateVisualsOnly(1 / 60); game.renderer.render(game.scene, game.camera); const d = document.createElement('div'); d.textContent = name + '|' + game.renderer.domElement.toDataURL('image/png'); shots.appendChild(d); };
      const hero = game.units.find(u => u.isHero);
      // stage: damaged walls / towers / soldiers, two extra engineers
      let k = 0;
      for (const b of game.buildings) { if (b.def.key === 'wall' && b.pos.z > 10 && (k++ % 2 === 0)) b.hp = b.maxHp * (0.15 + (k % 5) * 0.17); if (b.def.tower && b.pos.z > 0) b.hp = b.maxHp * 0.45; }
      for (const u of game.units) if (u.isSoldier && !u.def.repair) u.hp = u.maxHp * (0.3 + (u.id % 3) * 0.2);
      game.buyUnit('engineer'); game.buyUnit('engineer');
      for (let i = 0; i < 30; i++) game.update(1 / 60);
      game.ui.showDamage = true;
      game.controls.camDist = 34; game.controls.focus.set(0, 0, 8); game.controls.camYaw = 0;
      snap('rts_damage');
      game.ui.showDamage = false;
      game.controls.camDist = 20; game.controls.focus.set(4, 0, 14);
      snap('rts_close');
      hero.pos.set(-3, 0, 12.5); game.controls.enterControl(hero); game.controls.fpsYaw = 0.35; game.controls.fpsPitch = 0.05; game.update(1 / 60);
      snap('fps_wall');
      game.controls.exitControl();
      // construction sites during a wave, engineer building one
      game.tryStartWave();
      const h = game.grid.half;
      game.placeBuilding('arrow_tower', h + 3, h + 11, 0, true); for (let i = h - 6; i <= h - 2; i++) game.placeBuilding('wall', i, h + 12, 0, true);
      for (let i = 0; i < 240; i++) game.update(1 / 60);
      game.controls.camDist = 22; game.controls.focus.set(2, 0, 22); game.controls.camYaw = 0;
      snap('sites');
      const eng = game.units.find(u => u.def.repair && !u.dead);
      if (eng) { const site = game.buildings.find(b => b.underConstruction) || game.buildings.find(b => b.hp < b.maxHp * 0.9); if (site) { eng.pos.set(site.pos.x - 2.4, 0, site.pos.z - 1.5); } game.controls.enterControl(eng); game.controls.fpsYaw = site ? Math.atan2(site.pos.x - eng.pos.x, site.pos.z - eng.pos.z) : 0; game.controls.fpsPitch = 0.1; game.controls.attackHeld = true; for (let i = 0; i < 40; i++) { game.controls.update(1 / 60, 1 / 60); game.update(1 / 60); } snap('engineer_fps'); game.controls.attackHeld = false; game.controls.exitControl(); }
      say('probe4 done: sites=' + game.buildings.filter(b => b.underConstruction).map(b => b.def.key + ' ' + Math.round(b.progress * 100) + '%').join(', ') + ' engineers=' + game.engineerCount());
    }
    if (params.get('probe3')) {
      game.renderer.setSize(640, 400); game.camera.aspect = 1.6; game.camera.updateProjectionMatrix();
      game.controls.camDist = 30; game.controls.focus.set(0, 0, 8);
      const gl = game.renderer.getContext();
      const avg = (label) => {
        const px = new Uint8Array(640 * 400 * 4); gl.readPixels(0, 0, 640, 400, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let r = 0, g = 0, b = 0; for (let k = 0; k < px.length; k += 4) { r += px[k]; g += px[k + 1]; b += px[k + 2]; }
        const n = px.length / 4; say(`${label}: mean rgb=${(r / n).toFixed(0)},${(g / n).toFixed(0)},${(b / n).toFixed(0)}`);
      };
      game.controls.update(1 / 60, 1 / 60); game.renderer.render(game.scene, game.camera); avg('direct render');
      say('cam ' + game.camera.position.toArray().map(v => v.toFixed(2)).join(',') + ' proj ok=' + game.camera.projectionMatrix.elements.every(isFinite) + ' sun=' + game.sun.position.toArray().map(v => v.toFixed(1)).join(',') + ' target=' + game.sun.target.position.toArray().map(v => v.toFixed(1)).join(',') + ' bg=' + (game.scene.background && game.scene.background.getHexString()));
      game.updateVisualsOnly(1 / 60); game.renderer.render(game.scene, game.camera); avg('after updateVisualsOnly');
      say('sun after=' + game.sun.position.toArray().map(v => v.toFixed(1)).join(',') + ' mw ok=' + game.sun.matrixWorld.elements.every(isFinite) + ' shadowcam ok=' + game.sun.shadow.camera.projectionMatrix.elements.every(isFinite));
      game.sun.castShadow = false; game.renderer.render(game.scene, game.camera); avg('no shadows'); game.sun.castShadow = true;
      game.started = true; game.paused = false; game.lastT = performance.now() - 16; game.loop(performance.now()); avg('after loop()');
      game.lastT = performance.now() - 16; game.loop(performance.now()); avg('after loop() x2');
    }
    if (params.get('probe2')) {
      game.renderer.setSize(640, 400); game.camera.aspect = 1.6; game.camera.updateProjectionMatrix();
      game.controls.camDist = 26; game.controls.focus.set(0, 0, 8);
      const gl = game.renderer.getContext();
      const scan = (label) => {
        game.controls.update(1 / 60, 1 / 60); game.renderer.render(game.scene, game.camera);
        const px = new Uint8Array(640 * 400 * 4); gl.readPixels(0, 0, 640, 400, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const rows = [];
        for (let y = 0; y < 400; y++) { let n = 0; for (let x = 0; x < 640; x++) { const k = (y * 640 + x) * 4; if (px[k] < 140 && px[k + 1] > 190 && px[k + 2] < 170 && px[k + 1] - px[k] > 90) n++; } if (n > 200) rows.push(y + ':' + n); }
        say('scan ' + label + ': rows=' + rows.join(' '));
      };
      scan('frame0');
      { const px = new Uint8Array(640 * 400 * 4); gl.readPixels(0, 0, 640, 400, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const at = (x, y) => { const k = (y * 640 + x) * 4; return px[k] + ',' + px[k + 1] + ',' + px[k + 2]; };
        say('pixels row69: ' + [50, 320, 600].map(x => at(x, 69)).join(' | ') + ' row68: ' + at(320, 68) + ' row70: ' + at(320, 70) + ' row66: ' + at(320, 66) + ' row72: ' + at(320, 72)); }
      const groups = game.scene.children.filter(c => c.visible && c.children.some(ch => ch.isSprite));
      say('visible sprite groups in scene: ' + groups.length + ' ' + groups.slice(0, 5).map(g => g.position.x.toFixed(1) + ',' + g.position.y.toFixed(1) + ',' + g.position.z.toFixed(1)).join(' '));
      const hiddenBarGroups = game.buildings.filter(b => !b.hpBar.group.visible).length;
      say('buildings=' + game.buildings.length + ' hiddenBarGroups=' + hiddenBarGroups + ' inScene=' + game.buildings.filter(b => b.hpBar.group.parent === game.scene).length);
      game.scene.traverse(o => { if (o.isSprite) { let p = o.parent, vis = o.visible; while (p) { if (!p.visible) vis = false; p = p.parent; } if (vis) { const wp = new THREE.Vector3(); o.getWorldPosition(wp); say(`  sprite color=${o.material.color.getHexString()} scale=${o.scale.x.toFixed(2)},${o.scale.y.toFixed(2)} world=${wp.x.toFixed(1)},${wp.y.toFixed(1)},${wp.z.toFixed(1)} center=${o.center.x},${o.center.y}`); } } });
      for (const b of game.buildings) if (b.hpBar.group.visible) say(`  bar ${b.def.key} hp=${b.hp}/${b.maxHp} fgScale=${b.hpBar.fg.scale.x}`);
      const toggles = [['gridHelper', game.gridHelper], ['outline', game.buildOutline], ['marker', game.marker], ['ground', game.ground], ['decor', game.decor]];
      for (const [n, o] of toggles) { o.visible = false; scan('without ' + n); o.visible = true; }
      game.gridHelper.visible = false; game.buildOutline.visible = false; game.marker.visible = false;
      for (const b of game.buildings) b.hpBar.group.visible = false; scan('bars off');
      for (const u of game.units) u.hpBar.group.visible = false; scan('unit bars off');
      for (const u of game.units) u.ring.visible = false; scan('rings off');
      for (const b of game.buildings) b.group.visible = false; scan('buildings off');
      for (const u of game.units) u.group.visible = false; scan('units off');
    }
    if (params.get('probe')) {
      const found = {};
      game.scene.traverse(o => {
        if (!o.visible) return;
        let p = o.parent, vis = true; while (p) { if (!p.visible) vis = false; p = p.parent; }
        if (!vis) return;
        const m = o.material; if (!m || !m.color) return;
        const c = m.color;
        if (c.g > c.r + 0.25 && c.g > c.b + 0.25 && c.g > 0.6) {
          const key = o.type + ':' + c.getHexString() + ':' + (o.parent && o.parent.userData && (o.parent.userData.unit ? 'unit' : o.parent.userData.building ? 'building' : o.parent.type));
          found[key] = (found[key] || 0) + 1;
        }
      });
      say('green objects: ' + JSON.stringify(found));
    }
    if (params.get('collide') && !game.over) {
      // drive the possessed hero into walls and corners from several spots; the camera must never get inside stone
      const hero = game.units.find(u => u.isHero && !u.dead) || game.king;
      const g = game.grid;
      const minDist = (u) => { let best = Infinity; const c0 = g.worldToCell(u.pos.x - 3, u.pos.z - 3), c1 = g.worldToCell(u.pos.x + 3, u.pos.z + 3); for (let j = c0.j; j <= c1.j; j++) for (let i = c0.i; i <= c1.i; i++) { if (g.passable(i, j, 'player')) continue; const w = g.cellToWorld(i, j); const px = U.clamp(u.pos.x, w.x - 1, w.x + 1), pz = U.clamp(u.pos.z, w.z - 1, w.z + 1); best = Math.min(best, Math.hypot(u.pos.x - px, u.pos.z - pz)); } return best; };
      game.controls.enterControl(hero);
      let worst = Infinity, moved = 0;
      for (const [sx, sz] of [[-13, -13], [13, -13], [-13, 13], [13, 13], [0, 15.5], [-2.5, 4.5], [0, 2.5], [-15, 0]]) {
        if (!g.circleFree(sx, sz, 0.6, 'player')) continue; // spot got built over during the game
        for (let dir = 0; dir < 8; dir++) {
          hero.pos.set(sx, 0, sz);
          game.controls.fpsYaw = dir * Math.PI / 4;
          game.controls.keys = { KeyW: true, KeyA: dir % 2 === 1 };
          const start = hero.pos.clone();
          for (let s = 0; s < 240; s++) { game.controls.update(1 / 60, 1 / 60); game.update(1 / 60); worst = Math.min(worst, minDist(hero)); }
          moved += hero.pos.distanceTo(start);
        }
      }
      game.controls.keys = {};
      game.controls.exitControl();
      say(`collision: closest approach to stone ${worst.toFixed(3)}m (camera radius ${Math.max(0.55, hero.radius)}), total distance walked ${moved.toFixed(0)}m`);
    }
    say(`simulated ${simT.toFixed(0)}s; buildings=${game.buildings.length} gold=${Math.round(game.gold)} upgrades=${JSON.stringify(game.upgrades)} effects=${game.effects.list.length}`);
    // render a frame from both camera modes
    game.controls.update(step, step); game.renderer.render(game.scene, game.camera);
    const hero = game.units.find(u => u.isHero && !u.dead);
    if (hero) { game.controls.enterControl(hero); game.controls.update(step, step); game.renderer.render(game.scene, game.camera); game.controls.exitControl(); }
    say('TEST DONE OK');
  } catch (e) { say('EXCEPTION: ' + e.message + '\n' + e.stack); }
  window.__testLog = log;
}
