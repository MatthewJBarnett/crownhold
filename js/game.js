'use strict';

class Game {
  constructor(opts = {}) {
    this.testMode = !!opts.testMode;
    this.maxFrames = opts.maxFrames || 0; this.frameCount = 0;
    this.started = false; this.over = false; this.paused = false; this.timeScale = 1; this.time = 0;
    this.units = []; this.buildings = []; this.projectiles = []; this.zones = [];
    this.players = { host: { id: 'host', name: 'You', hero: null, gold: 0, heroes: [], heroesBought: 0, upgrades: {}, autoRepair: false } }; this.playerOrder = ['host'];
    this.localPlayer = 'host'; this.actor = 'host'; this.stats = { kills: 0, goldEarned: 0, buildingsLost: 0, wavesCleared: 0 };
    this.difficulty = DATA.difficulties.normal;
    this.king = null; this.boss = null; this.heroesOwned = []; this.fallenHeroes = [];
    this.warnedNoEngineer = false;
    this.flowTimer = 0; this.scratch = []; this.scratch2 = []; this.lastEnemyDeath = 0; this.lastStallHint = 0;
    this.setupRenderer();
    this.setupScene();
    this.grid = new Grid();
    this.world = null;
    this.effects = new Effects(this);
    this.hash = new SpatialHash(4);
    this.controls = new Controls(this);
    this.ui = new UI(this);
    this.loadPrefs();
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
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NoToneMapping;
    document.getElementById('game').appendChild(r.domElement);
    this.renderer = r;
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.2, 1200);
  }
  setupScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9cc4e4);
    scene.fog = new THREE.Fog(0xb8cfe4, DATA.MAP_HALF * 3.2, DATA.MAP_HALF * 9);
    this.scene = scene;
    scene.add(this.camera);
    const hemi = new THREE.HemisphereLight(0xdfeeff, 0x5a7a40, 0.85); scene.add(hemi); this.hemi = hemi;
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.45);
    sun.position.set(60, 90, 30); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 500;
    this.shadowExtent = 75;
    sun.shadow.bias = -0.0008;
    scene.add(sun); scene.add(sun.target);
    this.sun = sun;
    // basis of the shadow camera, used to snap its target to shadow-map texels (stops shadow shimmer while moving)
    this.sunOffset = new THREE.Vector3(60, 90, 30);
    this.sunDir = this.sunOffset.clone().normalize();
    this.sunRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), this.sunDir).normalize();
    this.sunUp = new THREE.Vector3().crossVectors(this.sunDir, this.sunRight).normalize();
    this.sunTexel = (sc.right - sc.left) / sun.shadow.mapSize.x;
    const ambient = new THREE.AmbientLight(0xffffff, 0.14); scene.add(ambient);
    // sky dome with a zenith-to-horizon gradient, and a few drifting clouds
    this.sky = Models.skyDome(); scene.add(this.sky);
    this.clouds = Models.clouds(14); scene.add(this.clouds);
    this.sunDisc = Models.sunDisc(); this.sunDisc.position.copy(this.sunOffset).normalize().multiplyScalar(820); scene.add(this.sunDisc);
    this.decor = new THREE.Group(); scene.add(this.decor);
    this.buildDecor();
    const gh = new THREE.GridHelper(DATA.BUILD_RADIUS * 2 + 2, DATA.BUILD_RADIUS + 1, 0x335533, 0x335533);
    gh.material.transparent = true; gh.material.opacity = 0.35; gh.position.y = 0.04; gh.visible = false;
    scene.add(gh); this.gridHelper = gh;
    // buildable-area outline
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(DATA.BUILD_RADIUS * 2 + 2, DATA.BUILD_RADIUS * 2 + 2)), new THREE.LineBasicMaterial({ color: 0x224422, transparent: true, opacity: 0.5 }));
    outline.rotation.x = -Math.PI / 2; outline.position.y = 0.05; outline.visible = false;
    scene.add(outline); this.buildOutline = outline;
    // command marker
    this.marker = Models.ring(0.9, 0x50ff80); this.marker.visible = false; scene.add(this.marker); this.markerT = 0;
    // tower range indicator (selected tower, or a tower being placed): rebuilt to follow the terrain
    this.rangeRing = new THREE.Group(); this.rangeRing.visible = false; scene.add(this.rangeRing);
    this.rangeRingMats = { fill: new THREE.MeshBasicMaterial({ color: 0x80c0ff, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }), edge: new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }) };
    this.rangeKey = '';
  }
  buildDecor() {
    // forest border with instanced meshes
    const N = 700, H = DATA.MAP_HALF;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.36, 2.8, 9), leafGeo = Models.canopyGeometry(this.worldType === 'valley' || this.worldType === 'highlands' ? 'round' : 'pine');
    const trunks = new THREE.InstancedMesh(trunkGeo, Models.mat(0x5a3a22), N);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
    trunks.castShadow = true; leaves.castShadow = true;
    // instanced meshes are culled by the bounds of a single instance at the origin: never let that hide the forest
    trunks.frustumCulled = false; leaves.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    for (let k = 0; k < N; k++) {
      let x, z, r;
      let tries = 0;
      do { x = U.rand(-H - 4, H + 4); z = U.rand(-H - 4, H + 4); r = Math.max(Math.abs(x), Math.abs(z)); tries++; }
      while (tries < 40 && (r < H + 0.6 || r > H + 3.8 || DATA.spawnPoints.some(sp => U.dist(sp.x, sp.z, x, z) < 12)));
      if (tries >= 40) { x = H + 2; z = H + 2; }
      const sc = U.rand(0.8, 1.4), gy = this.groundY(x, z);
      p.set(x, gy + 0.75 * sc, z); s.set(sc, sc, sc); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6);
      m.compose(p, q, s); trunks.setMatrixAt(k, m);
      p.set(x, gy + 1.8 * sc, z); m.compose(p, q, s); leaves.setMatrixAt(k, m);
      col.setHex(U.choice((this.world && this.world.cfg.palette.leaves) || [0x2f6b2f, 0x3a7a35, 0x2a5a30, 0x4a8a3a])); leaves.setColorAt(k, col);
    }
    trunks.instanceMatrix.needsUpdate = true; leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    this.decor.add(trunks); this.decor.add(leaves);
    // scattered rocks and small trees in the approach ring
    // they sit on their own cell, which becomes an obstacle: nothing you can walk into is walkable
    const g = this.grid, w = this.world;
    let placed = 0, guard = 0;
    if (!g) return;   // the first decor pass runs before a world exists
    while (placed < 70 && guard++ < 600) {
      const x = U.rand(-H + 3, H - 3), z = U.rand(-H + 3, H - 3), r = Math.max(Math.abs(x), Math.abs(z));
      if (r < DATA.BUILD_RADIUS + 3 || r > H - 3) continue;
      const c = g.worldToCell(x, z), k = g.idx(c.i, c.j);
      if (g.flag[k] !== CELL_FREE || g.natural[k] || g.terrain[k] || (w && w.laneCells && w.laneCells.has(k))) continue;
      if (DATA.spawnPoints.some(sp => U.dist(sp.x, sp.z, x, z) < 14)) continue;
      const cc = g.cellToWorld(c.i, c.j);
      const rock = Math.random() < 0.5;
      const o = rock ? Models.rock() : Models.tree();
      if (rock) o.scale.multiplyScalar(0.75);
      o.position.set(cc.x, this.groundY(cc.x, cc.z), cc.z); this.decor.add(o);
      g.flag[k] = CELL_ROCK; g.natural[k] = rock ? CELL_ROCK : 5; g.terrain[k] = rock ? CELL_ROCK : 5;
      placed++;
    }
    g.flowDirty = true;
  }
  showRange(x, z, r) {
    if (!r) { this.rangeRing.visible = false; return; }
    const key = `${x.toFixed(1)},${z.toFixed(1)},${r.toFixed(1)},${this.worldSeed}`;
    if (key !== this.rangeKey) {
      this.rangeKey = key;
      for (const c of [...this.rangeRing.children]) { this.rangeRing.remove(c); c.geometry.dispose(); }
      // polar mesh draped over the ground: a translucent fill plus a bright rim
      const seg = 96, rings = 8;
      const build = (r0, r1, nr, mat, lift) => {
        const pos = [], idx = [];
        for (let k = 0; k <= nr; k++) { const rr = r0 + (r1 - r0) * k / nr; for (let s = 0; s <= seg; s++) { const a = s / seg * Math.PI * 2; const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr; pos.push(px, this.groundY(px, pz) + lift, pz); } }
        for (let k = 0; k < nr; k++) for (let s = 0; s < seg; s++) { const a = k * (seg + 1) + s, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
        const m = new THREE.Mesh(g, mat); m.renderOrder = 4; return m;
      };
      this.rangeRing.add(build(0, r, rings, this.rangeRingMats.fill, 0.12));
      this.rangeRing.add(build(r * 0.965, r, 1, this.rangeRingMats.edge, 0.16));
    }
    this.rangeRing.visible = true;
  }
  towerRangeFor(def, level = 1) { return def.range * (1 + 0.08 * (this.upgrades.towers || 0)) * Math.pow(DATA.towerUpgrade.range, level - 1); }
  groundY(x, z) { return this.world ? this.world.walkY(x, z) : 0; }
  setBloom(on) { this.bloomOn = !!on; this.savePref('bloom', on ? '1' : '0'); }
  // draws the frame, through the bloom/grading pipeline when it is on
  renderFrame() {
    if (this.bloomOn && typeof Post !== 'undefined') {
      try { if (!this.post) this.post = new Post(this.renderer); this.post.render(this.scene, this.camera); return; }
      catch (e) { console.warn('post-processing off:', e); this.bloomOn = false; this.renderer.setRenderTarget(null); }
    }
    this.renderer.render(this.scene, this.camera);
  }
  // experiments: an immortal, absurdly strong hero for reaching late waves. Not a real hero: never unique, never bought back
  spawnTestChampion() {
    if (!this.started || this.over) { this.ui.toast('Start a game first', 'error'); return; }
    if (this.replica) { this.ui.toast('Only the host can spawn a test champion', 'error'); return; }
    const def = DATA.testChampion;
    const near = this.king ? this.king.pos : { x: 0, z: 14 };
    const sp = this.findSpawnSpot(near.x + 3, near.z + 3);
    const u = this.spawnUnit(def, 'player', sp.x, sp.z, { hero: true, heroKey: 'champion', owner: this.actor });
    u.immortal = true; u.testChampion = true;
    this.effects.spawn('ring', sp.x, 0.3, sp.z, { radius: 4, color: 0xffd040, dur: 0.8 });
    this.ui.toast('Test champion spawned (experiments)', 'good');
    this.ui.dirty = true;
    return u;
  }
  // (re)build the world for a seed: terrain, obstacles and the border decoration
  setWorld(seed, type) {
    if (this.world) this.world.dispose(this.scene);
    if (!type || type === 'random' || !DATA.mapTypes[type]) { const keys = Object.keys(DATA.mapTypes); type = keys[seed % keys.length]; }
    this.world = new WorldMap(seed, type);
    const pal = DATA.mapTypes[type].palette;
    this.scene.background.setHex(pal.sky); this.scene.fog.color.setHex(pal.sky);
    Models.tintSky(this.sky, pal.sky, DATA.mapTypes[type].zenith || 0x3f7fd0);
    this.buildParticles(type);
    this.hemi.color.setHex(pal.sky); this.hemi.groundColor.setHex(pal.grass);
    this.worldType = type;
    this.world.applyToGrid(this.grid);
    this.world.buildScene(this.scene);
    this.scene.remove(this.decor); this.decor = new THREE.Group(); this.scene.add(this.decor); this.buildDecor();
    this.worldSeed = seed;
  }
  tickRevives() {
    for (let k = this.revives.length - 1; k >= 0; k--) {
      const r = this.revives[k]; if (r.at > this.time) continue;
      this.revives.splice(k, 1);
      if (r.pyre.dead || this.over) continue;
      if (r.hero && this.heroInPlay(r.heroKey)) continue;
      const sp = this.findSpawnSpot(r.pyre.pos.x + 2, r.pyre.pos.z + 2);
      const u = this.spawnUnit(r.def, 'player', sp.x, sp.z, { owner: r.owner, hero: r.hero, heroKey: r.heroKey });
      u.rebornWave = r.wave; u.level = r.level || 1; u.xp = r.xp || 0; this.applyStats(u, true);
      if (r.hero) { const w = this.wallet(r.owner || 'host'); if (!w.heroes.includes(r.heroKey)) w.heroes.push(r.heroKey); }
      this.effects.spawn('explosion', sp.x, 1, sp.z, { radius: 3, color: 0xffa020 }); for (let q = 0; q < 12; q++) this.effects.spawn('flame', sp.x + U.rand(-1, 1), 0.5, sp.z + U.rand(-1, 1));
      this.ui.toast(`${u.name} rises from the Phoenix Pyre!`, 'good'); SFX.play('summon');
      this.ui.dirty = true;
    }
  }
  // drifting motes that suit the map: snow, embers, pollen, dust
  buildParticles(type) {
    if (this.motes) { this.scene.remove(this.motes); this.motes.geometry.dispose(); this.motes.material.dispose(); this.motes = null; }
    const cfg = { frozen: { n: 1600, color: 0xffffff, size: 0.28, fall: 2.2, drift: 0.8, spread: 70, alt: 26, add: false },
      volcanic: { n: 900, color: 0xff8030, size: 0.22, fall: -1.6, drift: 0.6, spread: 70, alt: 22, add: true },
      darkwood: { n: 500, color: 0xc8ff80, size: 0.16, fall: 0.15, drift: 0.9, spread: 60, alt: 6, add: true },
      valley: { n: 500, color: 0xfff0b0, size: 0.14, fall: 0.2, drift: 0.9, spread: 60, alt: 7, add: true },
      badlands: { n: 700, color: 0xd8c090, size: 0.3, fall: 0.05, drift: 3.5, spread: 80, alt: 10, add: false },
      highlands: { n: 500, color: 0xe8f0ff, size: 0.16, fall: 0.3, drift: 1.2, spread: 70, alt: 12, add: false } }[type] || { n: 400, color: 0xffffff, size: 0.15, fall: 0.2, drift: 1, spread: 60, alt: 8, add: false };
    const pos = new Float32Array(cfg.n * 3);
    for (let k = 0; k < cfg.n; k++) { pos[k * 3] = (Math.random() - 0.5) * cfg.spread * 2; pos[k * 3 + 1] = Math.random() * cfg.alt; pos[k * 3 + 2] = (Math.random() - 0.5) * cfg.spread * 2; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: cfg.color, size: cfg.size, map: Models.softDot(), transparent: true, opacity: 0.85, depthWrite: false, blending: cfg.add ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.userData.cfg = cfg; pts.userData.seed = Math.random() * 100;
    this.scene.add(pts); this.motes = pts;
  }
  tickParticles(dt) {
    const m = this.motes; if (!m) return;
    const cfg = m.userData.cfg, p = m.geometry.attributes.position.array, n = cfg.n;
    const f = this.controls.mode === 'fps' ? this.controls.controlled.pos : this.controls.focus;
    const t = this.time + m.userData.seed, S = cfg.spread;
    for (let k = 0; k < n; k++) {
      let x = p[k * 3], y = p[k * 3 + 1], z = p[k * 3 + 2];
      x += Math.sin(t * 0.7 + k) * cfg.drift * dt + 0.3 * dt; z += Math.cos(t * 0.5 + k * 0.7) * cfg.drift * dt;
      y -= cfg.fall * dt;
      const ground = this.groundY(x, z);
      if (y < ground + 0.2) y = ground + (cfg.fall > 0 ? cfg.alt : 0.3); else if (y > ground + cfg.alt) y = ground + 0.3;
      if (x < f.x - S) x += 2 * S; else if (x > f.x + S) x -= 2 * S;
      if (z < f.z - S) z += 2 * S; else if (z > f.z + S) z -= 2 * S;
      p[k * 3] = x; p[k * 3 + 1] = y; p[k * 3 + 2] = z;
    }
    m.geometry.attributes.position.needsUpdate = true;
  }
  savePref(k, v) { try { localStorage.setItem('crownhold_' + k, v); } catch (e) {} }
  loadPref(k) { try { return localStorage.getItem('crownhold_' + k); } catch (e) { return null; } }
  setShadows(on) {
    this.shadowsOn = !!on;
    this.renderer.shadowMap.enabled = this.shadowsOn;
    this.scene.traverse(o => { if (o.isMesh && o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) m.needsUpdate = true; } });
    this.savePref('shadows', on ? '1' : '0');
  }
  loadPrefs() {
    this.shadowsOn = this.loadPref('shadows') !== '0';
    if (!this.shadowsOn) this.renderer.shadowMap.enabled = false;
    this.bloomOn = this.loadPref('bloom') !== '0';
    this.showFps = this.loadPref('showfps') === '1';
    this.controls.invertY = this.loadPref('inverty') === '1';
    const v = parseFloat(this.loadPref('volume')); if (!isNaN(v)) SFX.setVolume(v / 100);
    this.ui.$('fpscounter').classList.toggle('hidden', !this.showFps);
  }
  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ new game
  newGame(heroKey, difficultyKey, opts = {}) {
    this.reset();
    this.setWorld(opts.seed !== undefined ? opts.seed : (Math.random() * 0xffffffff) >>> 0, opts.mapType || this.ui.selectedMap || 'random');
    this.difficulty = DATA.difficulties[difficultyKey] || DATA.difficulties.normal;
    this.difficultyKey = difficultyKey;
    const roster = opts.players || [{ id: 'host', name: this.players.host ? this.players.host.name : 'You', hero: heroKey }];
    this.players = {}; this.playerOrder = [];
    for (const p of roster) { this.players[p.id] = this.newWallet(p.id, p.name || 'Player', p.hero || heroKey); this.playerOrder.push(p.id); }
    if (!this.players.host) { this.players.host = this.newWallet('host', 'You', heroKey); this.playerOrder.unshift('host'); }
    this.localPlayer = 'host'; this.actor = 'host';
    const g = this.grid, h = g.half;
    // keep
    this.placeBuilding('keep', h - 1, h - 1, 0, true, true);
    // corner towers + walls (ring from cell h-9 .. h+9)
    const lo = h - 9, hi = h + 9;
    for (const [i, j] of [[lo, lo], [hi - 1, lo], [lo, hi - 1], [hi - 1, hi - 1]]) this.placeBuilding('arrow_tower', i, j, 0, true, true);
    for (let i = lo; i <= hi; i++) for (const j of [lo, hi]) if (!g.buildingAt(i, j)) this.placeBuilding(i === h && j === hi ? 'gate' : 'wall', i, j, 0, true, true);
    for (let j = lo + 1; j < hi; j++) for (const i of [lo, hi]) if (!g.buildingAt(i, j)) this.placeBuilding('wall', i, j, 0, true, true);
    // the king on his throne (shared); each player brings a hero and a small garrison
    this.king = this.spawnUnit(DATA.units.king, 'player', 0, 0, { yaw: 0 });
    this.king.post = { x: 0, z: 0 };
    this.playerOrder.forEach((pid, k) => {
      const p = this.players[pid];
      const ox = (k - (this.playerOrder.length - 1) / 2) * 9;
      this.addHero(p.hero || heroKey, ox, 6, pid);
      for (const [dk, dx, dz] of [['swordsman', -2.5, 12], ['swordsman', 2.5, 12], ['archer', -3.5, 9], ['archer', 3.5, 9], ['engineer', 1, 5]]) {
        const sp = this.findSpawnSpot(ox + dx, dz);
        this.spawnUnit(DATA.units[dk], 'player', sp.x, sp.z, { owner: pid });
      }
    });
    for (const u of this.units) u.post = { x: u.pos.x, z: u.pos.z };
    this.waves = new WaveManager(this);
    this.started = true; this.over = false; this.paused = false; this.time = 0;

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
  newReplica(seed, type, myId, roster) {
    this.reset();
    this.setWorld(seed !== undefined ? seed : 1, type || 'valley');
    this.replica = true;
    this.players = {}; this.playerOrder = [];
    for (const p of roster || [{ id: myId || 'host', name: 'You' }]) { this.players[p.id] = this.newWallet(p.id, p.name, p.hero); this.players[p.id].gold = 0; this.playerOrder.push(p.id); }
    this.localPlayer = myId || this.playerOrder[0]; this.actor = this.localPlayer;
    if (!this.players[this.localPlayer]) { this.players[this.localPlayer] = this.newWallet(this.localPlayer, 'You', null); this.playerOrder.push(this.localPlayer); }
    this.replicaCap = 0;
    this.waves = { number: 0, active: false, pending: { length: 0 }, total: 0, preview: { n: 1, d: { units: [], from: [] } }, describe: (p) => p.d };
    this.started = true; this.over = false; this.paused = false; this.time = 0;
    this.controls.focus.set(0, 0, 10); this.controls.camYaw = 0; this.controls.camDist = 52;
    this.ui.onGameStart();
  }
  // host: open a room and wait in the lobby; the game starts for everyone when the host presses Start
  startHost(heroKey, difficultyKey, name, cb, transport) {
    const tr = transport || new PeerTransport();
    const code = makeRoomCode();
    const open = (err) => {
      if (err) { cb(err); return; }
      this.players = { host: this.newWallet('host', name, heroKey) }; this.playerOrder = ['host'];
      this.localPlayer = 'host'; this.actor = 'host';
      const nh = new NetHost(this, tr, code);
      nh.hostHero = heroKey; nh.difficulty = difficultyKey; nh.mapType = this.ui.selectedMap || 'random';
      this.ui.showLobby();
      cb(null, code);
    };
    if (transport) open(null); else tr.host(code, open);
  }
  hostBegin() {
    const nh = this.netHost; if (!nh || nh.started) return;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const roster = nh.roster();
    this.newGame(nh.hostHero, nh.difficulty, { seed, mapType: nh.mapType, players: roster });
    nh.begin({ seed, type: this.worldType, difficulty: nh.difficulty, players: roster });
    this.ui.hideLobby(); this.ui.onGameStart();
    this.ui.toast(`The siege begins with ${roster.length} defender${roster.length === 1 ? '' : 's'}.`, 'good', 5000);
  }
  startJoin(code, heroKey, name, cb, transport) {
    const tr = transport || new PeerTransport();
    const open = (err, hostId) => {
      if (err) { cb(err); return; }
      const nc = new NetClient(this, tr, hostId, tr.peerId || 'B');
      nc.myHero = heroKey; nc.myName = name;
      nc.send({ t: 'hello', name, hero: heroKey });
      this.ui.showLobby();
      cb(null, code);
    };
    if (transport) open(null, 'A'); else tr.join(code, open);
  }

  // ------------------------------------------------------------------ stats
  applyStats(u, initial) {
    const def = u.def, up = this.upgradesFor(u.owner), diff = this.difficulty, pid = u.owner || 'host';
    let hpMul = 1, dmgMul = 1, armorAdd = 0, regen = def.regen || 0;
    if (u.team === 'enemy') { hpMul = u.hpMul * (u.affix && u.affix.hp ? u.affix.hp : 1); dmgMul = diff.dmg * (u.affix && u.affix.dmg ? u.affix.dmg : 1); armorAdd = (u.affix && u.affix.armor ? u.affix.armor : 0) + (u.modArmor || 0); }
    else if (u.isKing) { hpMul = 1 + 0.25 * (up.royal || 0); regen += 2 * (up.royal || 0); if (this.hasActive('throne_of_ages')) { hpMul += DATA.buildings.throne_of_ages.throne.kingHp / def.hp; regen += DATA.buildings.throne_of_ages.throne.kingRegen; } }
    else if (u.isHero) { const lv = (u.level || 1) - 1; hpMul = (1 + 0.15 * (up.hero || 0)) * (1 + 0.07 * lv); dmgMul = (1 + 0.15 * (up.hero || 0)) * (1 + 0.06 * lv); }
    else if (u.isSoldier) { dmgMul = (1 + 0.15 * (up.weapons || 0)) * (this.hasActive('blacksmith', pid) ? 1 + DATA.buildings.blacksmith.soldierDmg : 1) * (this.hasActive('throne_of_ages', pid) ? DATA.buildings.throne_of_ages.throne.soldierDmg : 1); armorAdd = 0.08 * (up.armor || 0); }
    const frac = initial ? 1 : u.hp / u.maxHp;
    let rangeMul = 1, speedMul = 1;
    if (u.isSoldier && def.attack === 'ranged') { rangeMul = 1 + 0.12 * (up.marksman || 0); dmgMul *= 1 + 0.1 * (up.marksman || 0); }
    if (u.isSoldier && this.hasActive('tavern', pid)) speedMul = 1 + DATA.buildings.tavern.soldierSpeed;
    if (u.team === 'enemy') { speedMul *= (u.affix && u.affix.speed ? u.affix.speed : 1) * (u.modSpeed || 1); }
    if (u.team === 'player' && def.attack === 'ranged' && this.waveMod && this.waveMod.unitRange) rangeMul *= this.waveMod.unitRange;
    u.maxHp = def.hp * hpMul; u.hp = u.maxHp * frac;
    u.dmg = def.dmg * dmgMul; u.dmgMul = dmgMul;
    u.speed = def.speed * speedMul; u.range = def.range * rangeMul + (u.team === 'enemy' && def.attack === 'ranged' ? (u.modRange || 0) : 0); u.cd = def.cd;
    u.armor = Math.min(0.75, (def.armor || 0) + armorAdd);
    u.regen = regen;
  }
  applyBuildingStats(b, initial) {
    const def = b.def, up = this.upgradesFor(b.owner);
    let hpMul = 1;
    if (def.key === 'wall' || def.key === 'gate' || def.keep) hpMul *= 1 + 0.4 * (up.walls || 0);
    if (def.tower) hpMul *= Math.pow(DATA.towerUpgrade.hp, b.level - 1);
    const frac = initial ? 1 : b.hp / b.maxHp;
    b.maxHp = def.hp * hpMul; b.hp = b.maxHp * frac;
    if (def.tower) {
      b.dmg = def.dmg * (1 + 0.2 * (up.towers || 0)) * Math.pow(DATA.towerUpgrade.dmg, b.level - 1) * (b.high ? 1.15 : 1);
      b.range = def.range * (1 + 0.08 * (up.towers || 0)) * Math.pow(DATA.towerUpgrade.range, b.level - 1) * (b.high ? 1.3 : 1) * (this.waveMod && this.waveMod.towerRange ? this.waveMod.towerRange : 1);
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
  addHero(key, x, z, owner) {
    const def = DATA.heroes[key];
    if (!def) return null;
    owner = owner || this.actor;
    const p = this.findSpawnSpot(x, z);
    const u = this.spawnUnit(def, 'player', p.x, p.z, { hero: true, heroKey: key, owner });
    u.post = { x: p.x, z: p.z };
    const w = this.players[owner]; if (w) w.heroes.push(key);
    return u;
  }
  // move a freshly spawned enemy onto the nearest cell that can actually reach the King
  snapToReachable(u, force = false) {
    if (!u || u.flying) return;
    const g = this.grid;
    const c = g.worldToCell(u.pos.x, u.pos.z);
    const r = u.collisionRadius;
    const ok = (i, j) => { if (!g.inBounds(i, j) || g.flagAt(i, j) !== CELL_FREE || !isFinite(g.integ[g.idx(i, j)])) return false; const w = g.cellToWorld(i, j); return Math.abs(w.x) < DATA.MAP_HALF - r && Math.abs(w.z) < DATA.MAP_HALF - r && g.circleFree(w.x, w.z, r, u.team); };
    if (!force && ok(c.i, c.j)) return;
    for (let r = 1; r <= 10; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (ok(c.i + di, c.j + dj)) { const w = g.cellToWorld(c.i + di, c.j + dj); u.pos.x = w.x; u.pos.z = w.z; return; }
    }
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
  musterPoint(pid) {
    const barracks = this.buildings.filter(b => b.def.key === 'barracks' && b.active && (!b.owner || b.owner === pid));
    if (barracks.length) { const b = barracks[barracks.length - 1]; return { x: b.pos.x, z: b.pos.z + b.radius + 1.5 }; }
    return { x: 0, z: 5 };
  }

  // ------------------------------------------------------------------ economy (one wallet per player)
  get gold() { const p = this.players[this.localPlayer]; return p ? p.gold : 0; }
  set gold(v) { const p = this.players[this.localPlayer]; if (p) p.gold = v; }
  wallet(pid) { return this.players[pid || this.actor] || this.players[this.localPlayer]; }
  canAfford(c, pid) { const w = this.wallet(pid); return !!w && w.gold >= c; }
  spend(c, pid) { const w = this.wallet(pid); if (w) w.gold -= c; this.ui.dirty = true; }
  addGold(n, pid) { const w = this.wallet(pid); if (w) w.gold += n; this.stats.goldEarned += n; this.ui.dirty = true; }
  addGoldAll(n) { for (const id of this.playerOrder) { const w = this.players[id]; if (w) w.gold += n; } this.stats.goldEarned += n; this.ui.dirty = true; }
  killMult(pid) { return this.difficulty.gold * (this.waveMod && this.waveMod.bounty ? this.waveMod.bounty : 1) * (1 + (this.hasActive('market', pid) ? DATA.buildings.market.killBonus : 0) + (this.hasActive('royal_treasury', pid) ? DATA.buildings.royal_treasury.bounty : 0)) * (1 + 0.1 * (this.upgradesFor(pid).fortune || 0)); }
  // ---- wave modifiers
  setWaveMod(mod) {
    this.waveMod = mod || null;
    for (const b of this.buildings) if (b.def.tower) this.applyBuildingStats(b, false);
    for (const u of this.units) if (u.team === 'player' && !u.dead) this.applyStats(u, false);
    const night = mod && mod.key === 'night', fog = mod && mod.key === 'fog';
    if (this.sun) { this.sun.intensity = night ? 0.55 : 1.45; this.sun.color.setHex(night ? 0x9ab0ff : 0xfff0d0); }
    if (this.hemi) this.hemi.intensity = night ? 0.35 : 0.85;
    if (this.scene && this.scene.fog) { this.scene.fog.near = fog ? 40 : DATA.MAP_HALF * 3.2; this.scene.fog.far = fog ? 230 : DATA.MAP_HALF * 9; this.scene.fog.color.setHex(night ? 0x202838 : (fog ? 0xc8ccd0 : 0xb8cfe4)); }
    if (this.scene) this.scene.background = new THREE.Color(night ? 0x1a2030 : (fog ? 0xc8ccd0 : 0x9cc4e4));
    if (this.sky) { const mt = DATA.mapTypes[this.worldType]; if (mt) Models.tintSky(this.sky, night ? 0x1c2436 : (fog ? 0xc8ccd0 : mt.palette.sky), night ? 0x080c18 : (fog ? 0xb8bcc4 : (mt.zenith || 0x3f7fd0))); }
    if (this.sunDisc) this.sunDisc.visible = !night && !fog;
    this.ui.dirty = true;
  }
  applyWaveModTo(u) {
    const m = this.waveMod; if (!m || u.team !== 'enemy') return;
    if (m.speed) u.modSpeed = m.speed;
    if (m.armor) u.modArmor = m.armor;
    if (m.enemyRange) u.modRange = m.enemyRange;
    if (m.plague) u.plagueOnDeath = true;
    this.applyStats(u, false);
  }
  // ---- elites
  makeElite(u, key) {
    const a = DATA.affixes[key]; if (!a || u.affix) return;
    u.affix = a; u.name = `${a.name} ${u.def.name}`;
    if (a.shield) u.shieldCharges = a.shield;
    if (a.scale) { u.group.scale.multiplyScalar(a.scale); u.height *= a.scale; u.eyeHeight *= a.scale; u.radius *= 1.15; }
    const ring = new THREE.Mesh(new THREE.RingGeometry(u.radius + 0.25, u.radius + 0.5, 22), new THREE.MeshBasicMaterial({ color: a.color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.renderOrder = 3; u.group.add(ring);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: Models.softDot(), color: a.color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(u.height * 0.9); glow.position.y = u.height * 0.55; u.group.add(glow);
    this.applyStats(u, true);
  }
  // ---- contracts
  startContract(c) {
    this.contract = c ? { key: c.key, need: c.need, reward: c.reward, progress: 0, failed: false, startT: this.time } : null;
    this.ui.dirty = true;
  }
  contractEvent(kind, extra) {
    const c = this.contract; if (!c || c.failed) return;
    if ((kind === 'wall' && c.key === 'walls') || (kind === 'kinghit' && c.key === 'king') || (kind === 'soldier' && c.key === 'soldiers')) { c.failed = true; this.ui.toast(`Contract failed: ${DATA.contracts[c.key].name}`, 'error'); }
    if (kind === 'herokill' && c.key === 'hero') c.progress++;
    if (kind === 'casterkill' && c.key === 'casters') c.progress++;
  }
  settleContract(n) {
    const c = this.contract; if (!c) return; this.contract = null;
    const def = DATA.contracts[c.key];
    let ok = !c.failed;
    if (c.key === 'speed') ok = (this.time - c.startT) <= 75;
    if (c.need) ok = ok && c.progress >= c.need;
    if (ok) { for (const id of this.playerOrder) this.addGold(c.reward, id); this.ui.toast(`Contract fulfilled: ${def.name}. +${c.reward} gold to every defender.`, 'good', 6000); }
    else this.ui.toast(`Contract missed: ${def.name}.`, 'warn', 4000);
  }
  rewardOwner(owner, base) {
    const ids = owner && this.players[owner] ? [owner] : this.playerOrder;
    for (const id of ids) this.addGold(Math.round(base * this.killMult(id)), id);
  }
  get upgrades() { return this.wallet(this.localPlayer).upgrades; }
  set upgrades(v) { this.wallet(this.localPlayer).upgrades = v; }
  // a player's own upgrades apply to their things; shared things (the King, the starting castle) take the best level any player has
  upgradesFor(owner) {
    if (owner && this.players[owner]) return this.players[owner].upgrades || {};
    const out = {};
    for (const id of this.playerOrder) { const up = (this.players[id] && this.players[id].upgrades) || {}; for (const k in up) out[k] = Math.max(out[k] || 0, up[k]); }
    return out;
  }
  get autoRepair() { return !!this.wallet(this.localPlayer).autoRepair; }
  set autoRepair(v) { this.wallet(this.localPlayer).autoRepair = !!v; }
  newWallet(id, name, hero) { const upgrades = {}; for (const k of Object.keys(DATA.upgrades)) upgrades[k] = 0; return { id, name, hero, gold: DATA.startGold, heroes: [], heroesBought: 0, upgrades, autoRepair: false }; }
  get heroesOwned() { return this.wallet(this.localPlayer).heroes; }
  set heroesOwned(v) { this.wallet(this.localPlayer).heroes = v; }
  get heroesBought() { return this.wallet(this.localPlayer).heroesBought || 0; }
  set heroesBought(v) { this.wallet(this.localPlayer).heroesBought = v; }
  heroInPlay(key) { return this.units.some(u => u.isHero && u.heroKey === key && !u.dead); }
  playerName(id) { const p = this.players[id]; return p ? p.name : 'a player'; }
  get coop() { return this.playerOrder.length > 1; }
  playerColor(id) { const k = this.playerOrder.indexOf(id); return k < 0 ? DATA.sharedColor : DATA.playerColors[k % DATA.playerColors.length]; }
  ownerColor(o) { return o.owner ? this.playerColor(o.owner) : DATA.sharedColor; }
  ownerLabel(o) { return !o.owner ? 'Shared' : (o.owner === this.localPlayer ? 'Yours' : `${this.playerName(o.owner)}'s`); }
  cssColor(hex) { return '#' + hex.toString(16).padStart(6, '0'); }
  ownsOrShared(o) { return !o.owner || o.owner === this.actor; }
  ownsOrSharedBy(o, pid) { return !o.owner || !pid || o.owner === pid; }
  hasBuilding(key, pid) { return this.buildings.some(b => b.def.key === key && !b.dead && (pid === undefined || !b.owner || b.owner === pid)); }
  hasActive(key, pid) { return this.buildings.some(b => b.def.key === key && b.active && (pid === undefined || !b.owner || b.owner === pid)); }
  soldierCap(pid) {
    pid = pid || this.actor;
    if (this.replica) return this.replicaCap || 0;
    let cap = DATA.baseSoldierCap + 3 * (this.upgradesFor(pid).garrison || 0);
    for (const b of this.buildings) if (b.def.soldierCap && b.active && (!b.owner || b.owner === pid)) cap += b.def.soldierCap;
    return cap;
  }
  soldierCount(pid) { pid = pid || this.actor; return this.units.filter(u => u.isSoldier && !u.dead && !u.def.noCap && (u.owner || 'host') === pid).length; }
  engineerCount(pid) { pid = pid || this.actor; return this.units.filter(u => u.def.repair && !u.dead && (u.owner || 'host') === pid).length; }
  upgradeCost(key, pid) { const d = DATA.upgrades[key]; return Math.round(d.cost * Math.pow(DATA.upgradeCostGrowth, (this.upgradesFor(pid || this.localPlayer)[key] || 0))); }
  // buildings with costGrowth get pricier for every one you already own (destroyed ones do not count)
  buildingCost(def) {
    if (!def.costGrowth && !def.costLinear) return def.cost;
    const n = this.buildings.filter(b => b.def.key === def.key && !b.dead && b.paid > 0).length;
    return Math.round(def.cost * (def.costGrowth ? Math.pow(def.costGrowth, n) : 1) * (1 + (def.costLinear || 0) * n));
  }
  heroCost(pid) { return Math.round(DATA.heroBaseCost * Math.pow(DATA.heroCostGrowth, (this.wallet(pid).heroesBought || 0))); }

  placeBuilding(key, i, j, rot, quiet = false, free = false) {
    const def = DATA.buildings[key];
    if (!def) return null;
    if (this.replica) { if (def.unique && this.hasBuilding(key, this.localPlayer)) { if (!quiet) this.ui.toast('You can only build one ' + def.name, 'error'); return null; } if (this.canAfford(this.buildingCost(def)) && this.grid.canPlace(def, i, j, rot, this).ok) this.net.send({ t: 'build', key, i, j, rot }); else if (!quiet) this.ui.toast('Cannot build there', 'error'); return null; }
    if (def.unique && this.hasBuilding(key, this.actor)) { if (!quiet) this.ui.toast('You can only build one ' + def.name, 'error'); return null; }
    const res = this.grid.canPlace(def, i, j, rot, this);
    if (!res.ok) { if (!quiet) this.ui.toast(res.reason, 'error'); return null; }
    const cost = this.buildingCost(def);
    if (!free && !this.canAfford(cost)) { if (!quiet) { this.ui.toast('Not enough gold', 'error'); SFX.play('error'); } return null; }
    if (!free) this.spend(cost);
    const b = new Building(this, def, i, j, rot, res.cells);
    b.high = res.cells.every(c => this.grid.natural[this.grid.idx(c.i, c.j)] === 9);
    if (b.high) this.applyBuildingStats(b, true);
    b.paid = free ? 0 : cost;
    if (def.throne) this.refreshStats();
    b.owner = free ? null : this.actor;
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
    if (b && !this.ownsOrShared(b)) { this.ui.toast(`That belongs to ${this.playerName(b.owner)}`, 'error'); return; }
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
    if (!this.ownsOrShared(b)) { this.ui.toast(`That belongs to ${this.playerName(b.owner)}`, 'error'); return; }
    if (this.repairsLocked()) { this.ui.toast('During a wave only Engineers can repair. Paid repairs resume when it ends.', 'error'); SFX.play('error'); return; }
    if (this.replica) { this.net.send({ t: 'bld', op: 'repair', id: b.id }); return; }
    const c = b.repairCost();
    if (c <= 0) return;
    if (!this.canAfford(c)) { this.ui.toast('Not enough gold', 'error'); SFX.play('error'); return; }
    this.spend(c); b.hp = b.maxHp; b.game.grid.flowDirty = true;
    this.effects.spawn('heal', b.pos.x, 2, b.pos.z, { radius: b.radius });
    SFX.play('build'); this.ui.onSelectionChanged();
  }
  repairTotal() { let t = 0; for (const b of this.buildings) if (this.ownsOrShared(b)) t += b.repairCost(); return t; }
  repairPriority(b) { return b.def.keep ? 5 : (b.def.tower || b.def.cat === 'wonder' ? 4 : (b.def.gate ? 3 : (b.def.cat === 'economy' ? 2 : 1))); }
  // repairs everything it can afford, most important buildings first
  repairsLocked() { return !!(this.waves && this.waves.active); }
  repairAll(auto = false) {
    if (this.replica) { if (this.repairsLocked()) { this.ui.toast('During a wave only Engineers can repair. Paid repairs resume when it ends.', 'error'); return; } this.net.send({ t: 'repairAll' }); return; }
    if (!auto && this.repairsLocked()) { this.ui.toast('During a wave only Engineers can repair. Paid repairs resume when it ends.', 'error'); SFX.play('error'); return; }
    const list = this.buildings.filter(b => !b.dead && b.repairCost() > 0 && this.ownsOrShared(b)).sort((a, b) => this.repairPriority(b) - this.repairPriority(a) || a.repairCost() - b.repairCost());
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
    if (!this.ownsOrShared(b)) { this.ui.toast(`That belongs to ${this.playerName(b.owner)}`, 'error'); return; }
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
    if (b.disposeExtras) b.disposeExtras();
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
    const m = this.musterPoint(this.actor);
    const p = this.findSpawnSpot(m.x, m.z);
    const u = this.spawnUnit(def, 'player', p.x, p.z, { owner: this.actor });
    u.post = { x: p.x, z: p.z };
    this.effects.spawn('ring', p.x, 0.3, p.z, { radius: 1.2, color: 0x80c0ff });
    SFX.play('coin');
    return u;
  }
  buyHero(key) {
    if (this.replica) { this.net.send({ t: 'hero', key }); return; }
    if (this.heroInPlay(key)) { this.ui.toast(`${DATA.heroes[key].name} is already in play`, 'error'); SFX.play('error'); return; }
    if (this.wallet(this.actor).heroes.includes(key)) { this.ui.toast('You already have this hero', 'error'); return; }
    const cost = this.heroCost(this.actor);
    if (!this.canAfford(cost)) { this.ui.toast(`Not enough gold: ${DATA.heroes[key].name} costs ${cost}`, 'error'); SFX.play('error'); return; }
    this.spend(cost);
    this.wallet(this.actor).heroesBought = (this.wallet(this.actor).heroesBought || 0) + 1;
    const u = this.addHero(key, 0, 6, this.actor);
    this.effects.spawn('ring', u.pos.x, 0.3, u.pos.z, { radius: 3, color: 0xffd040 });
    this.ui.toast(`${u.name} joins your cause!`);
    SFX.play('levelup');
    this.ui.dirty = true;
  }
  buyUpgrade(key) {
    if (this.replica) { this.net.send({ t: 'upg', key }); return; }
    const d = DATA.upgrades[key], w = this.wallet(this.actor);
    const lvl = w.upgrades[key] || 0;
    if (lvl >= d.max) return;
    if (d.requires && !this.hasActive(d.requires, this.actor)) { this.ui.toast(`Requires your own ${DATA.buildings[d.requires].name}`, 'error'); SFX.play('error'); return; }
    const c = this.upgradeCost(key, this.actor);
    if (!this.canAfford(c)) { this.ui.toast('Not enough gold', 'error'); SFX.play('error'); return; }
    this.spend(c);
    w.upgrades[key] = lvl + 1;
    this.refreshStats();
    this.ui.toast(`${d.name} level ${lvl + 1}`);
    SFX.play('levelup');
    this.ui.dirty = true;
  }

  // ------------------------------------------------------------------ commands
  orderable(units) { return units.filter(u => !u.dead && u.team === 'player' && !u.possessedBy && this.ownsOrShared(u)); }
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
  playerCount() { return this.netHost ? this.netHost.playerCount : (this.netClient ? this.netClient.players : 1); }
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
      if (u.def.reward) this.rewardOwner(source && source.owner !== undefined ? source.owner : null, u.def.reward * (u.affix ? 2 : 1));
      this.stats.kills++;
      this.lastEnemyDeath = this.time;
      if (u.isBoss) { this.boss = null; this.ui.toast(`${u.name} is slain!`, 'boss'); }
      // hero experience and contract progress
      const killer = source instanceof Unit ? source : (source && source.source instanceof Unit ? source.source : null);
      if (killer && killer.isHero && killer.team === 'player' && killer.gainXp) { killer.gainXp(Math.round((u.def.reward || 2) * 2.2)); this.contractEvent('herokill'); }
      if (u.def.magic && u.def.attack === 'ranged') this.contractEvent('casterkill');
      // things that go off when they die
      if (u.affix && u.affix.blast) { this.areaDamage(u.pos.x, u.pos.z, u.affix.blast.radius, u.affix.blast.dmg, 'enemy', u, { magic: true }); for (const b of this.buildingsNear(u.pos.x, u.pos.z, u.affix.blast.radius)) b.takeDamage(u.affix.blast.dmg, u); this.effects.spawn('explosion', u.pos.x, u.centerY, u.pos.z, { radius: u.affix.blast.radius, color: 0xff8020 }); SFX.play('explode', 0.7); }
      if (u.def.deathBlast) { this.areaDamage(u.pos.x, u.pos.z, u.def.deathBlast.radius, u.def.deathBlast.dmg, 'enemy', u, { magic: true }); for (const b of this.buildingsNear(u.pos.x, u.pos.z, u.def.deathBlast.radius)) b.takeDamage(u.def.deathBlast.dmg, u); this.effects.spawn('explosion', u.pos.x, 1, u.pos.z, { radius: u.def.deathBlast.radius, color: 0xffa040 }); SFX.play('explode', 0.8); }
      if (u.plagueOnDeath && !u.def.summoned) this.addZone({ x: u.pos.x, z: u.pos.z, radius: 2.6, duration: 4, color: 0x60ff60, team: 'enemy', onTick: (zone, dt) => { for (const p of this.unitsNear(zone.x, zone.z, zone.radius, 'player')) if (!p.dead) p.takeDamage(9 * dt, null, { magic: true }); } });
    } else {
      if (u.isSoldier && !u.def.summoned && !u.def.guardian) this.contractEvent('soldier');
      // the phoenix pyre brings the fallen back, once per wave each
      if (!u.isKing && !u.def.summoned && !u.def.guardian && !u.testChampion && u.rebornWave !== this.waves.number) {
        const pyre = this.buildings.find(b => b.def.phoenix && b.active && this.ownsOrSharedBy(b, u.owner));
        if (pyre) { this.revives = this.revives || []; this.revives.push({ def: u.def, owner: u.owner, hero: u.isHero, heroKey: u.heroKey, level: u.level, xp: u.xp, at: this.time + 3, wave: this.waves.number, pyre }); }
      }
      if (u.isKing) { this.gameOver(); }
      else if (u.isHero) { const w = this.wallet(u.owner || 'host'); w.heroes = w.heroes.filter(k => k !== u.heroKey); this.ui.toast(`${u.name} has fallen. Buy them back from the Recruit tab if you want them again.`, 'error', 6000); }
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
    if (b.def.key === 'wall' || b.def.gate) this.contractEvent('wall');
    if (b.def.keep) this.ui.toast('The Keep has fallen! The King is exposed!', 'error', 6000);
    else if (b.def.tower || b.def.cat === 'economy' || b.def.cat === 'wonder') this.ui.toast(`${b.name} destroyed!`, 'error');
    if (this.controls.selectedBuilding === b) this.controls.clearSelection();
    if (this.controls.hoveredBuilding === b) this.controls.hoveredBuilding = null;
    for (const u of this.units) if (u.repairTarget === b) u.repairTarget = null;
    if (b.def.soldierCap || b.def.key === 'blacksmith' || b.def.throne) this.refreshStats();
    SFX.play('explode', 0.8);
    this.ui.dirty = true;
  }
  onWaveCleared(n) {
    this.settleContract(n);
    this.setWaveMod(null);
    let income = 0;
    for (const b of this.buildings) if (b.underConstruction) b.finishConstruction();
    for (const b of this.buildings) if (b.def.income && b.active) { income += b.def.income; const ids = b.owner ? [b.owner] : this.playerOrder; for (const id of ids) this.addGold(Math.round(b.def.income * (1 + 0.1 * (this.upgradesFor(id).fortune || 0)) * (this.hasActive('throne_of_ages', id) ? DATA.buildings.throne_of_ages.throne.income : 1)), id); }
    let interest = 0;
    for (const b of this.buildings) if (b.def.interest && b.active) { const ids = b.owner ? [b.owner] : this.playerOrder; for (const id of ids) { const g = Math.min(b.def.interestCap, Math.round((this.players[id] ? this.players[id].gold : 0) * b.def.interest)); if (g > 0) { this.addGold(g, id); interest += g; } } }
    if (interest) this.ui.toast(`The treasury pays ${interest} gold in interest`, 'good');
    const bonus = Math.round(DATA.waves.clearBonus(n) * this.difficulty.gold);
    for (const id of this.playerOrder) this.addGold(Math.round(bonus * (1 + 0.1 * (this.upgradesFor(id).fortune || 0))), id);
    this.stats.wavesCleared = n;
    for (const u of this.units) if (u.team === 'player' && !u.dead) { u.heal(u.maxHp); u.burn = null; u.slow = null; }
    setTimeout(() => { if (!this.started || this.over) return; for (const id of this.playerOrder) if (this.players[id].autoRepair) { const prev = this.actor; this.actor = id; try { this.repairAll(true); } finally { this.actor = prev; } } }, 800);


    this.ui.toast(`Wave ${n} cleared! +${bonus} gold${income ? `, +${income} from farms and mines` : ''}. Everyone healed.`, 'good', 6000);
    SFX.play('wavecleared');
    this.ui.dirty = true;
  }
  tryStartWave() {
    if (!this.started || this.over) return;
    if (this.replica) { if (this.waves.active) this.ui.toast('Clear the current wave first', 'error'); else this.net.send({ t: 'wave' }); return; }
    if (this.waves.active) { this.ui.toast('Clear the current wave first', 'error'); return; }
    if (this.netHost && this.netHost.playerCount > 1) { this.netHost.toggleReady('host'); return; }
    this.startWaveNow();
  }
  startWaveNow() {
    if (this.paused) this.togglePause();
    this.waves.start();
    this.lastEnemyDeath = this.time;
    this.ui.dirty = true;
  }
  readyCount() { return this.netHost ? this.netHost.ready.size : (this.readySet ? this.readySet.length : 0); }
  isReady(pid) { return this.netHost ? this.netHost.ready.has(pid) : !!(this.readySet && this.readySet.includes(pid)); }
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
    if (this.fpsCounter.t >= 1) { this.fpsCounter.fps = this.fpsCounter.frames; this.fpsCounter.frames = 0; this.fpsCounter.t = 0; if (this.showFps) this.ui.$('fpscounter').textContent = this.fpsCounter.fps + ' fps'; }
    if (!this.started && this.net && this.net.tr) this.net.tr.pump();
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
    this.renderFrame();
  }
  updateVisualsOnly(realDt) {
    // things that should keep moving while paused: shadows follow camera, command marker fade
    const f = this.controls.mode === 'fps' ? this.controls.controlled.pos : this.controls.focus;
    const wantExtent = this.controls.mode === 'fps' ? 60 : U.clamp(this.controls.camDist * 1.6, 70, DATA.MAP_HALF + 24);
    if (Math.abs(wantExtent - this.shadowExtent) > 4) {
      this.shadowExtent = wantExtent;
      const sc = this.sun.shadow.camera; sc.left = -wantExtent; sc.right = wantExtent; sc.top = wantExtent; sc.bottom = -wantExtent; sc.updateProjectionMatrix();
      this.sunTexel = (wantExtent * 2) / this.sun.shadow.mapSize.x;
    }
    const ext = this.shadowExtent, MAPEXT = DATA.MAP_HALF + 21;
    const lim = Math.max(0, MAPEXT - ext);
    const t = new THREE.Vector3(U.clamp(f.x, -lim, lim), 0, U.clamp(f.z, -lim, lim));
    const tx = t.dot(this.sunRight), ty = t.dot(this.sunUp);
    const sx = Math.round(tx / this.sunTexel) * this.sunTexel - tx, sy = Math.round(ty / this.sunTexel) * this.sunTexel - ty;
    t.addScaledVector(this.sunRight, sx).addScaledVector(this.sunUp, sy);
    this.sun.target.position.copy(t); this.sun.position.copy(t).add(this.sunOffset);
    if (this.clouds) { this.clouds.position.x = (this.clouds.position.x + realDt * 0.6) % 60; }
    if (this.world && this.world.water && this.world.water.material.map) { const off = this.world.water.material.map.offset; off.x += realDt * 0.01; off.y += realDt * 0.006; const bm = this.world.water.material.bumpMap; if (bm) { bm.offset.x -= realDt * 0.016; bm.offset.y += realDt * 0.011; } }
    if (!this.paused) this.tickParticles(realDt * Math.min(1, this.timeScale || 1));
    for (const b of this.buildings) { const tl = b.group && b.group.userData.torches; if (tl) for (const l of tl) { const fl = 0.75 + 0.25 * Math.sin(this.time * 17 + l.userData.phase) * Math.sin(this.time * 7.3 + l.userData.phase * 2); l.intensity = l.userData.base * fl; if (l.userData.flame) l.userData.flame.scale.setScalar(0.85 + 0.3 * fl); } }
    if (this.markerT > 0) { this.markerT -= realDt; this.marker.scale.setScalar(0.6 + (1 - this.markerT / 0.7) * 1.5); this.marker.material.opacity = Math.max(0, this.markerT); if (this.markerT <= 0) this.marker.visible = false; }
    this.effects.update(realDt * (this.paused ? 0 : this.timeScale));
  }
  update(dt) {
    this.time += dt;
    if (this.revives && this.revives.length) this.tickRevives();
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
    this.chestTimer = (this.chestTimer || 0) + dt;
    if (this.chestTimer > 0.4 && this.world) {
      this.chestTimer = 0;
      for (const ch of this.world.chests) {
        if (ch.taken) continue;
        const finder = this.unitsNear(ch.x, ch.z, 1.8, 'player')[0];
        if (!finder) continue;
        ch.taken = true; if (ch.mesh) ch.mesh.visible = false;
        const gold = 120 + 30 * this.waves.number;
        this.rewardOwner(finder.owner, gold / this.difficulty.gold);
        this.effects.spawn('ring', ch.x, 0.3, ch.z, { radius: 2.5, color: 0xffd040, dur: 0.8 });
        this.ui.toast(`${finder.name} found a hidden cache: ${Math.round(gold)} gold`, 'good', 5000);
        SFX.play('coin');
      }
    }
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
    game.newGame(params.get('hero') || 'knight', 'normal', { mapType: params.get('mapType') || undefined, seed: params.get('seed') ? parseInt(params.get('seed'), 10) : undefined });
    say('world: type=' + game.worldType + ' seed=' + game.worldSeed + ' lanes=' + JSON.stringify(game.world && game.world.laneSpawns) + ' plateaus=' + (game.world && game.world.plateaus ? game.world.plateaus.length : 0) + ' connected=' + (game.world ? game.world.connected() : 'n/a'));
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
      const client = new Game({ testMode: true });
      let hostCode = null;
      host.startHost('knight', 'normal', 'Hosty', (err, code) => { hostCode = code; }, A);
      const hn = host.netHost;
      hn.onJoin('B');
      client.startJoin(hostCode, 'knight', 'Tester', () => {}, B);
      const cn = client.netClient;
      const pump = () => { A.pump(); B.pump(); };
      pump(); pump();
      say(`mp: lobby: host sees players=${hn.roster().map(p => p.name + ':' + p.hero).join(',')} started=${hn.started}; client lobby players=${cn.lobby ? cn.lobby.players.length : 'none'} (client asked for knight: expect a different hero)`);
      // a third player knocking after the start must be refused
      host.hostBegin(); pump();
      hn.onJoin('C'); hn.onMessage('C', { t: 'hello', name: 'Late', hero: 'cleric' });
      say(`mp: started=${hn.started} client started=${client.started} seed host=${host.worldSeed} client=${client.worldSeed} type ${host.worldType}/${client.worldType} late joiner in roster=${hn.roster().some(p => p.name === 'Late')}`);
      const step = (n) => { for (let k = 0; k < n; k++) { host.update(1 / 60); client.controls.update(1 / 60, 1 / 60); cn.frame(1 / 60); } };
      step(60);
      say(`mp: host units=${host.units.length} client units=${client.units.length}; buildings host=${host.buildings.length} client=${client.buildings.length}; snapshots=${cn.snapCount}`);
      const hostHero = host.units.find(u => u.isHero && u.owner === 'host'), clientHeroH = host.units.find(u => u.isHero && u.owner === 'B');
      const clientHeroC = client.units.find(u => u.isHero && u.owner === 'B'), hostHeroC = client.units.find(u => u.isHero && u.owner === 'host');
      say(`mp: heroes: host owns ${hostHero && hostHero.heroKey}, client owns ${clientHeroH && clientHeroH.heroKey}; client sees own=${!!clientHeroC} host's=${!!hostHeroC} king owner=${host.king.owner} gold host=${host.players.host.gold} client=${client.gold} (client wallet on host=${host.players.B.gold})`);
      // client orders its own soldiers and tries to order the host's
      const mySw = client.units.filter(u => u.def.key === 'swordsman' && u.owner === 'B'), theirSw = client.units.filter(u => u.def.key === 'swordsman' && u.owner === 'host');
      client.commandMove(mySw, 6, 20, 'attackmove'); client.commandMove(theirSw, -6, 20, 'attackmove'); step(20);
      const hMine = host.units.filter(u => u.def.key === 'swordsman' && u.owner === 'B'), hTheirs = host.units.filter(u => u.def.key === 'swordsman' && u.owner === 'host');
      say(`mp: orders: client's swordsmen commanded=${hMine.map(u => u.command ? u.command.type : 'none').join(',')} host's swordsmen commanded=${hTheirs.map(u => u.command ? u.command.type : 'none').join(',')} (expect attackmove x2 / none x2)`);
      // possession: own hero ok, host's hero refused, shared king ok
      client.controls.setSelection([hostHeroC]); client.controls.enterControl(hostHeroC); step(10);
      say(`mp: possess host's hero: host possessedBy=${hostHero.possessedBy} client mode=${client.controls.mode} (expect null / rts)`);
      client.controls.setSelection([clientHeroC]); client.controls.enterControl(clientHeroC); step(10);
      say(`mp: possess own hero: host possessedBy=${clientHeroH.possessedBy} (expect B)`); client.controls.exitControl(); step(5);
      const kingC = client.units.find(u => u.isKing); client.controls.setSelection([kingC]); client.controls.enterControl(kingC); step(10);
      say(`mp: possess the shared King: host possessedBy=${host.king.possessedBy} (expect B)`); client.controls.exitControl(); step(5);
      // spending: client buys an archer and a wall from its own wallet
      const g0h = host.players.host.gold, g0c = host.players.B.gold;
      client.buyUnit('archer'); client.placeBuilding('wall', host.grid.half - 14, host.grid.half - 14, 0); step(20);
      const wall = host.buildings.find(b => b.def.key === 'wall' && b.owner === 'B');
      say(`mp: client spent: host gold ${g0h}->${host.players.host.gold} (unchanged), client ${g0c}->${host.players.B.gold}; new wall owner=${wall && wall.owner}; client archers=${host.units.filter(u => u.def.key === 'archer' && u.owner === 'B').length}`);
      // host cannot sell the client's wall
      host.actor = 'host'; const nb = host.buildings.length; host.sellBuilding(wall); say(`mp: host selling client's wall: buildings ${nb}->${host.buildings.length} (expect unchanged)`);
      const upH0 = host.players.host.upgrades.towers, sharedTower = host.buildings.find(b => b.def.tower && !b.owner);
      client.buyUpgrade('towers'); step(20);
      say(`mp: client bought Tower Engineering: client level=${host.players.B.upgrades.towers} host level=${host.players.host.upgrades.towers} (was ${upH0}); shared tower dmg=${sharedTower.dmg.toFixed(1)} (base ${sharedTower.def.dmg}, expect +20% from the best level)`);
      client.tryStartWave(); step(30);
      say(`mp: client ready: wave active=${host.waves.active} ready=${hn.ready.size}/${hn.playerCount} (expect false, 1/2)`);
      host.tryStartWave(); step(900);
      say(`mp: wave: host active=${host.waves.active} enemies host=${host.enemiesAlive()} client=${client.enemiesAlive()} kills=${host.stats.kills} gold host=${host.players.host.gold} client=${host.players.B.gold}`);
      hn.toLobby(); pump(); pump();
      say(`mp: back to lobby: host started=${host.started} client started=${client.started} lobby players=${cn.lobby ? cn.lobby.players.length : 'n/a'}`);
    }
    if (params.get('contenttest')) {
      const h = game.grid.half;
      game.gold = 100000;
      const keys = Object.keys(DATA.buildings).filter(k => !DATA.buildings[k].keep && !DATA.buildings[k].hidden);
      const placed = [];
      for (const k of keys) { for (let tries = 0; tries < 80 && !placed.includes(k); tries++) { const i = h - 22 + Math.floor(Math.random() * 44), j = h - 22 + Math.floor(Math.random() * 44); if (game.placeBuilding(k, i, j, 0, true)) placed.push(k); } }
      say(`content: placed ${placed.length}/${keys.length} building types (${keys.filter(k => !placed.includes(k)).join(',') || 'all'})`);
      for (const k of Object.keys(DATA.units)) if (DATA.units[k].cost) game.buyUnit(k);
      say(`content: units bought=${game.units.filter(u => u.isSoldier).length} kinds=${[...new Set(game.units.filter(u => u.isSoldier).map(u => u.def.key))].join(',')}`);
      game.tryStartWave();
      for (const k of Object.keys(DATA.enemies)) { const a = Math.random() * Math.PI * 2; const u = game.spawnEnemy(k, Math.sin(a) * 40, Math.cos(a) * 40, { hpMul: 1 }); game.snapToReachable(u); }
      const before = game.units.filter(u => u.team === 'enemy').length;
      for (let i = 0; i < 60 * 90; i++) game.update(1 / 60);
      say(`content: after 90s: enemies ${before} -> ${game.enemiesAlive()} kills=${game.stats.kills} king=${Math.round(game.king.hp)} buildings=${game.buildings.length} gold=${Math.round(game.gold)} errors=${window.__errors.length}`);
      say(`content: world type=${game.worldType} water=${game.world.kind.filter(k => k === CELL_WATER).length} rock=${game.world.kind.filter(k => k === CELL_ROCK).length} forest=${game.world.kind.filter(k => k === 5).length} fords=${game.world.fords.length}`);
      for (const t of Object.keys(DATA.mapTypes)) { const w = new WorldMap(12345, t); say(`content: map ${t}: water=${w.kind.filter(k => k === CELL_WATER).length} rock=${w.kind.filter(k => k === CELL_ROCK).length} forest=${w.kind.filter(k => k === 5).length} connected=${w.connected()}`); }
      { let bad = 0, total = 0, lanesTotal = 0, plateaus = 0; const sample = [];
        for (const t of Object.keys(DATA.mapTypes)) for (const sd of [1, 77, 4242, 90210, 31337, 8, 555, 2024]) { const w = new WorldMap(sd, t); total++; lanesTotal += w.laneSpawns.length; plateaus += w.plateaus.length; if (!w.connected()) { bad++; sample.push(t + ':' + sd); } w.dispose && w.dispose(); }
        say(`content: lanes: ${total} worlds, ${bad} not connected ${sample.join(',')}, avg lanes=${(lanesTotal / total).toFixed(2)} avg plateaus=${(plateaus / total).toFixed(2)}`); }
    }
    if (params.get('settingstest')) {
      const c = game.controls;
      c.setSensitivity(2.5, true); say(`settings: sensMul=${c.sensMul} stored=${localStorage.getItem('crownhold_sens')} slider=${document.querySelector('.settings .sens').value} label=${document.querySelector('.settings .sensval').textContent}`);
      c.setRawInput(false); say(`settings: raw=${c.rawInput} stored=${localStorage.getItem('crownhold_raw')} box=${document.querySelector('.settings .raw').checked}`);
      c.setSensitivity(1, true); c.setRawInput(true);
      say(`settings: invite link=${game.ui.inviteLink('ABCDEF')} joincode field=${document.getElementById('joincode').value}`);
    }
    if (params.get('balance')) {
      const tower = game.buildings.find(b => b.def.tower), wall = game.buildings.find(b => b.def.key === 'wall');
      say(`balance: starting tower sell value=${tower.sellValue()} wall=${wall.sellValue()} (expect 0)`);
      const raider = game.spawnEnemy('grunt', wall.pos.x, wall.pos.z + 3, { hpMul: 1 }); raider.target = wall; raider.attackTimer = 0;
      const h0 = wall.hp; raider.attack(wall); say(`balance: raider hit on a wall: ${Math.round(h0 - wall.hp)} (raw ${raider.dmg}, expect x2)`);
      const t0 = tower.hp; raider.attackTimer = 0; raider.attack(tower); say(`balance: raider hit on a tower: ${Math.round(t0 - tower.hp)} (expect x1)`);
      const archer = game.units.find(u => u.def.key === 'archer'); archer.pos.set(0, 0, 0); game.update(1 / 60);
      const foe = game.spawnEnemy('grunt', 0, -14, { hpMul: 1 }); game.update(1 / 60); archer.playerThink();
      say(`balance: archer inside the keep, enemy 14m away outside: sheltered=${archer.sheltered} target=${archer.target ? archer.target.name : 'none'} (expect none)`);
      raider.die(); foe.die();
    }
    if (params.get('herodeath')) {
      const hero = game.units.find(u => u.isHero);
      const key = hero.heroKey;
      say(`herodeath: before: heroes=${game.heroesOwned.join(',')} inPlay=${game.heroInPlay(key)}`);
      hero.die(null); game.update(1 / 60);
      say(`herodeath: after death: heroes=${game.heroesOwned.join(',') || 'none'} inPlay=${game.heroInPlay(key)} alive heroes=${game.units.filter(u => u.isHero && !u.dead).length}`);
      game.tryStartWave(); for (let i = 0; i < 60 * 30; i++) game.update(1 / 60); for (const u of game.units) if (u.team === 'enemy' && !u.dead) u.die(null); for (let i = 0; i < 60 * 5; i++) game.update(1 / 60);
      say(`herodeath: after a wave: wave active=${game.waves.active} alive heroes=${game.units.filter(u => u.isHero && !u.dead).length} (expect 0: no free respawn)`);
      game.gold = 5000; const g0 = game.gold; game.buyHero(key);
      say(`herodeath: bought back: alive=${game.units.filter(u => u.isHero && !u.dead && u.heroKey === key).length} gold ${g0}->${game.gold} heroes=${game.heroesOwned.join(',')}`);
      const n0 = game.units.filter(u => u.isHero && !u.dead).length; game.buyHero(key);
      say(`herodeath: buying a duplicate: alive heroes ${n0}->${game.units.filter(u => u.isHero && !u.dead).length} (expect unchanged)`);
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
    if (params.get('probe5')) {
      const shots = document.createElement('div'); shots.id = 'shots'; shots.style.display = 'none'; document.body.appendChild(shots);
      game.renderer.setSize(1280, 800); game.camera.aspect = 1.6; game.camera.updateProjectionMatrix();
      const snap = (name) => { game.controls.update(1 / 60, 1 / 60); game.updateVisualsOnly(1 / 60); game.renderFrame(); const d = document.createElement('div'); d.textContent = name + '|' + game.renderer.domElement.toDataURL('image/png'); shots.appendChild(d); };
      for (const t of Object.keys(DATA.mapTypes)) { game.setWorld(777, t); game.controls.camDist = 235; game.controls.focus.set(0, 0, 0); game.controls.camPitch = 1.25; game.controls.camYaw = 0; snap('map_' + t); }
      { game.newGame('knight', 'normal', { mapType: 'valley', seed: 777 }); game.players.B = game.newWallet('B', 'Bea', 'ranger'); game.playerOrder.push('B'); game.ui.refreshHud && game.ui.refreshHud();
        let k = 0; for (const u of game.units) if (u.isSoldier && k++ % 2) u.owner = 'B';
        game.placeBuilding('arrow_tower', game.grid.half - 9, game.grid.half + 14, 0, true); game.placeBuilding('arrow_tower', game.grid.half + 7, game.grid.half + 14, 0, true);
        const towers = game.buildings.filter(b => b.def.tower); if (towers[0]) { towers[0].owner = 'B'; towers[0].syncOwnerMark(true); } if (towers[1]) { towers[1].owner = 'host'; towers[1].syncOwnerMark(true); }
        for (const u of game.units) u.syncOwnerMark(); for (const b of game.buildings) b.syncOwnerMark(true);
        game.controls.camDist = 42; game.controls.focus.set(0, 0, 16); game.controls.camPitch = 0.85; game.controls.camYaw = 0; snap('coop');
        game.controls.camDist = 14; game.controls.focus.set(-2, 0, 14); game.controls.camPitch = 0.55; game.controls.camYaw = 0.6; snap('coop_close');
        game.spawnTestChampion(); game.controls.camDist = 12; game.controls.focus.set(3, 0, 17); game.controls.camPitch = 0.5; snap('champion');
        // wonders, all five, and a storm + beam firing at a crowd
        game.gold = 99999;
        const hh = game.grid.half;
        for (const [key, di, dj] of [['royal_treasury', -14, 16], ['sun_altar', 12, 16], ['arcane_spire', -10, 10], ['dragon_roost', 14, 8], ['titan_forge', -16, 6], ['world_tree', 18, 16], ['celestial_gate', -20, 12], ['throne_of_ages', 4, 22], ['doomsday_engine', 20, -2]]) {
          let b = null; for (let r = 0; r <= 6 && !b; r++) for (let a = -r; a <= r && !b; a++) for (let c = -r; c <= r && !b; c++) if (Math.max(Math.abs(a), Math.abs(c)) === r && game.grid.canPlace(DATA.buildings[key], hh + di + a, hh + dj + c, 0, game).ok) b = game.placeBuilding(key, hh + di + a, hh + dj + c, 0, true);
          if (!b) say('probe: could not place ' + key); }
        for (let k = 0; k < 8; k++) game.spawnEnemy('brute', 6 + k * 1.5, 40 + (k % 3) * 2, {});
        for (let k = 0; k < 90; k++) game.update(1 / 30);
        game.controls.camDist = 60; game.controls.focus.set(0, 0, 22); game.controls.camPitch = 0.8; game.controls.camYaw = 0; snap('wonders');
        game.controls.camDist = 22; game.controls.focus.set(-24, 0, 16); game.controls.camPitch = 0.6; game.controls.camYaw = 0.5; snap('wonders_close');
        for (let k = 0; k < 4; k++) game.effects.spawn('explosion', 4 + k * 3, 1, 34, { radius: 3 + k, color: 0xff5010 });
        for (let k = 0; k < 20; k++) game.effects.spawn('flame', 2 + Math.random() * 6, 1, 30 + Math.random() * 3);
        game.effects.update(0.15);
        game.controls.camDist = 16; game.controls.focus.set(6, 0, 32); game.controls.camPitch = 0.45; game.controls.camYaw = 0.3; snap('fire');
        game.controls.camDist = 9; game.controls.focus.set(0, 0, 26); game.controls.camPitch = 0.25; game.controls.camYaw = 0; snap('gate_torches');
        // a rock belt and a forest belt up close, and the map edge where enemies spawn
        { const w = game.world; let rc = null, fc = null; for (let j = 0; j < w.n && !(rc && fc); j++) for (let i = 0; i < w.n; i++) { const k = w.kind[w.idx(i, j)]; const c = w.cellCenter(i, j); const r = Math.hypot(c.x, c.z); if (r > 72 && r < 88) { if (k === CELL_ROCK && !rc) rc = c; if (k === 5 && !fc) fc = c; } }
          if (rc) { game.controls.camDist = 18; game.controls.focus.set(rc.x, 0, rc.z); game.controls.camPitch = 0.5; game.controls.camYaw = 0.4; snap('rock_belt'); }
          if (fc) { game.controls.camDist = 18; game.controls.focus.set(fc.x, 0, fc.z); game.controls.camPitch = 0.5; game.controls.camYaw = 0.4; snap('forest_belt'); }
          const sp = DATA.spawnPoints[w.laneSpawns[0]]; game.controls.camDist = 30; game.controls.focus.set(sp.x * 0.9, 0, sp.z * 0.9); game.controls.camPitch = 0.7; game.controls.camYaw = Math.atan2(-sp.x, -sp.z) + Math.PI; snap('spawn_edge'); }
        game.controls.camDist = 300; game.controls.focus.set(0, 0, 0); game.controls.camPitch = 1.0; game.controls.camYaw = 0.4; snap('zoomed_bloom'); }
      game.setWorld(777, 'valley');
      const ford = game.world.fords[1]; const fc = game.world.cellCenter(ford.i - 0.5, ford.j - 0.5);
      game.controls.camDist = 55; game.controls.focus.set(fc.x, 0, fc.z); game.controls.camPitch = 0.75; snap('valley_ford');
      const tw = game.buildings.find(b => b.def.tower); game.controls.clearSelection(); game.controls.selectedBuilding = tw; tw.selected = true; game.ui.onSelectionChanged();
      game.controls.camDist = 42; game.controls.focus.set(tw.pos.x, 0, tw.pos.z); game.controls.camPitch = 0.95; snap('tower_ring');
      game.controls.clearSelection(); game.controls.camDist = 230; game.controls.focus.set(100, 0, 100); game.controls.camPitch = 0.8; game.controls.camYaw = 0.6; snap('zoomed_out_corner');
      game.controls.camDist = 230; game.controls.focus.set(-110, 0, -110); game.controls.camPitch = 0.6; game.controls.camYaw = -2.2; snap('zoomed_out_far');
      { const hero = game.units.find(u => u.isHero); hero.pos.set(-3, 0, 14); game.controls.enterControl(hero); game.controls.fpsYaw = 2.6; game.controls.fpsPitch = 0.08; game.update(1 / 60); snap('fps_look');
        game.controls.fpsYaw = 0.4; game.controls.fpsPitch = 0.3; game.update(1 / 60); snap('fps_sky');
        game.controls.exitControl(); }
      game.showRange(88, 88, 22); game.controls.camDist = 60; game.controls.focus.set(88, 0, 88); game.controls.camPitch = 0.7; game.controls.camYaw = 0.5; snap('range_on_hills'); game.showRange(null);
      say('probe5 done');
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
