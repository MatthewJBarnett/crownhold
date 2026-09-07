'use strict';

// ===========================================================================
// Multiplayer: host-authoritative co-op over WebRTC (PeerJS for signalling).
// The host runs the simulation and streams snapshots; clients render replicas,
// send orders, and drive the unit they possess (client-authoritative movement).
// ===========================================================================

const PEER_PREFIX = 'crownhold-';
const PEER_OPTS = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };

function makeRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 6; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return s;
}

class Emitter {
  constructor() { this.handlers = {}; }
  on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); }
  emit(ev, ...args) { for (const fn of this.handlers[ev] || []) fn(...args); }
}

// in-process pair with a message queue; used by the self-test
class LoopbackTransport extends Emitter {
  static pair() {
    const a = new LoopbackTransport('A'), b = new LoopbackTransport('B');
    a.other = b; b.other = a;
    return [a, b];
  }
  constructor(id) { super(); this.peerId = id; this.queue = []; this.sent = 0; this.bytes = 0; }
  send(peerId, msg) { const data = JSON.stringify(msg); this.sent++; this.bytes += data.length; this.other.queue.push({ from: this.peerId, data }); }
  broadcast(msg) { this.send(null, msg); }
  pump() { const q = this.queue; this.queue = []; for (const m of q) this.emit('message', m.from, JSON.parse(m.data)); }
  peers() { return [this.other.peerId]; }
  close() {}
}

class PeerTransport extends Emitter {
  constructor() { super(); this.conns = new Map(); this.peer = null; this.peerId = null; }
  host(code, cb) {
    this.peer = new Peer(PEER_PREFIX + code, PEER_OPTS);
    let done = false;
    this.peer.on('open', (id) => { this.peerId = id; if (!done) { done = true; cb(null, id); } });
    this.peer.on('error', (e) => { if (!done) { done = true; cb(e); } else console.warn('peer error', e); });
    this.peer.on('connection', (conn) => this.addConn(conn));
  }
  join(code, cb) {
    this.peer = new Peer(undefined, PEER_OPTS);
    let done = false;
    this.peer.on('open', (id) => {
      this.peerId = id;
      const conn = this.peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
      this.addConn(conn, (err, pid) => { if (!done) { done = true; cb(err, pid); } });
      setTimeout(() => { if (!done) { done = true; cb(new Error('No answer from that room code. Is the host running?')); } }, 12000);
    });
    this.peer.on('error', (e) => { if (!done) { done = true; cb(e); } else console.warn('peer error', e); });
  }
  addConn(conn, cb) {
    conn.on('open', () => { this.conns.set(conn.peer, conn); this.emit('open', conn.peer); if (cb) cb(null, conn.peer); });
    conn.on('data', (data) => this.emit('message', conn.peer, data));
    conn.on('close', () => { this.conns.delete(conn.peer); this.emit('close', conn.peer); });
    conn.on('error', (e) => { if (cb) cb(e); });
  }
  send(peerId, msg) { const c = this.conns.get(peerId); if (c && c.open) c.send(msg); }
  broadcast(msg) { for (const c of this.conns.values()) if (c.open) c.send(msg); }
  peers() { return [...this.conns.keys()]; }
  pump() {}
  close() { if (this.peer) this.peer.destroy(); }
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------
class NetHost {
  constructor(game, transport, code) {
    this.game = game; this.tr = transport; this.code = code;
    this.rate = 1 / 9; this.acc = 0; this.seq = 0;
    this.clients = new Map();
    this.fxQ = []; this.sfxQ = []; this.toastQ = [];
    this.lastB = new Map();
    this.tr.on('open', (id) => this.onJoin(id));
    this.tr.on('close', (id) => this.onLeave(id));
    this.tr.on('message', (id, m) => { try { this.onMessage(id, m); } catch (e) { console.error('net message failed', e); } });
    game.net = this; game.netHost = this;
  }
  get playerCount() { return 1 + this.clients.size; }
  onJoin(id) { this.clients.set(id, { known: new Set(), knownB: new Set(), name: 'Player', possessed: null }); this.game.ui.dirty = true; }
  onLeave(id) {
    const c = this.clients.get(id);
    if (c && c.possessed) { const u = this.game.unitById(c.possessed); if (u) { u.possessedBy = null; u.remote = null; u.post = { x: u.pos.x, z: u.pos.z }; } }
    this.clients.delete(id);
    this.game.ui.toast(`${c ? c.name : 'A player'} left the game`, 'warn');
    this.game.ui.dirty = true;
  }
  reset() {
    this.lastB.clear();
    this.tr.broadcast({ t: 'reset' });
    for (const [id, c] of this.clients) {
      c.known.clear(); c.knownB.clear(); c.possessed = null;
      if (c.hero && DATA.heroes[c.hero]) { const h = this.game.addHero(c.hero, 0, 6); if (h) h.ownerPeer = id; }
    }
  }
  sendTo(id, m) { this.tr.send(id, m); }
  toast(msg, type, dur) { if (this.toastQ.length < 8) this.toastQ.push([msg, type, dur]); }
  fx(type, x, y, z, o) { if (this.fxQ.length < 80) this.fxQ.push([type, +x.toFixed(1), +y.toFixed(1), +z.toFixed(1), o && (o.radius || o.color || o.dur) ? { radius: o.radius, color: o.color, dur: o.dur } : 0]); }
  sound(name) { if (this.sfxQ.length < 12 && !this.sfxQ.includes(name)) this.sfxQ.push(name); }

  onMessage(id, m) {
    const c = this.clients.get(id);
    if (!c) return;
    const g = this.game, ctl = g.controls;
    const unit = (uid) => g.unitById(uid);
    const owned = (uid) => { const u = unit(uid); return u && u.possessedBy === id && !u.dead ? u : null; };
    const orderable = (ids) => ids.map(unit).filter(u => u && !u.dead && u.team === 'player' && !u.possessed && !u.possessedBy);
    switch (m.t) {
      case 'hello': {
        c.name = String(m.name || 'Player').slice(0, 16); c.hero = m.hero;
        g.ui.toast(`${c.name} joined the defence`, 'good');
        if (m.hero && DATA.heroes[m.hero]) { const h = g.addHero(m.hero, 0, 6); if (h) { h.ownerPeer = id; g.effects.spawn('ring', h.pos.x, 0.3, h.pos.z, { radius: 3, color: 0xffd040 }); } }
        g.ui.dirty = true;
        break;
      }
      case 'build': if (!g.placeBuilding(m.key, m.i, m.j, m.rot, true)) this.sendTo(id, { t: 'toast', msg: 'Could not build there (blocked, too far, or not enough gold)', type: 'error' }); break;
      case 'buy': g.buyUnit(m.key); break;
      case 'hero': g.buyHero(m.key); break;
      case 'upg': g.buyUpgrade(m.key); break;
      case 'wave': g.tryStartWave(); break;
      case 'repairAll': g.repairAll(); break;
      case 'autoRepair': g.autoRepair = !!m.on; g.ui.toast(`${c.name} turned auto-repair ${g.autoRepair ? 'on' : 'off'}`); g.ui.dirty = true; break;
      case 'bld': { const b = g.buildingById(m.id); if (!b) break; if (m.op === 'repair') g.repairBuilding(b); else if (m.op === 'sell') g.sellBuilding(b); else if (m.op === 'upgrade') g.upgradeBuilding(b); break; }
      case 'cmd': {
        const us = orderable(m.ids || []);
        if (!us.length) break;
        if (m.kind === 'move') g.commandMove(us, m.x, m.z, m.type || 'attackmove');
        else if (m.kind === 'attack') { const t = unit(m.target); if (t && !t.dead) g.commandAttack(us, t); }
        else if (m.kind === 'follow') { const l = unit(m.leader); if (l && !l.dead) g.commandFollow(us, l); }
        else if (m.kind === 'hold') g.commandHold(us);
        break;
      }
      case 'possess': {
        const u = unit(m.id);
        if (u && u.team === 'player' && !u.dead && !u.possessed && !u.possessedBy) {
          if (c.possessed) { const old = unit(c.possessed); if (old) { old.possessedBy = null; old.remote = null; } }
          u.possessedBy = id; c.possessed = u.id; u.command = null; u.target = null; u.path = null; u.moveIntent.x = 0; u.moveIntent.z = 0;
          u.remote = { x: u.pos.x, z: u.pos.z, yaw: u.yaw, moving: false };
          this.sendTo(id, { t: 'possessOk', id: u.id });
        } else this.sendTo(id, { t: 'possessFail', id: m.id });
        break;
      }
      case 'release': { const u = owned(m.id); if (u) { u.possessedBy = null; u.remote = null; u.post = { x: u.pos.x, z: u.pos.z }; } if (c.possessed === m.id) c.possessed = null; break; }
      case 'pos': { const u = owned(m.id); if (u && isFinite(m.x) && isFinite(m.z)) u.remote = { x: U.clamp(m.x, -DATA.MAP_HALF, DATA.MAP_HALF), z: U.clamp(m.z, -DATA.MAP_HALF, DATA.MAP_HALF), yaw: m.yaw || 0, moving: !!m.mv }; break; }
      case 'atk': { const u = owned(m.id); if (u && Array.isArray(m.dir)) ctl.playerAttack(u, 1 / 15, { dir: new THREE.Vector3(m.dir[0], m.dir[1], m.dir[2]).normalize(), pitch: m.pitch || 0 }); break; }
      case 'abil': { const u = owned(m.id); if (u) u.useAbility(m.i | 0, { x: +m.x || 0, z: +m.z || 0 }); break; }
    }
  }

  update(dt) {
    this.tr.pump();
    this.acc += dt;
    if (this.acc >= this.rate) { this.acc = 0; this.broadcast(); }
  }
  unitRecord(u) {
    const f = (u.moving ? 1 : 0) | (u.dead ? 2 : 0) | (u.stunned ? 4 : 0) | (u.sheltered ? 8 : 0);
    const r = [u.id, +u.pos.x.toFixed(2), +u.pos.z.toFixed(2), +u.pos.y.toFixed(2), +u.yaw.toFixed(2), Math.round(u.hp), Math.round(u.maxHp), f, +u.attackAnim.toFixed(2), u.possessedBy || (u.possessed ? 'host' : 0)];
    if (u.abilities.length) r.push(u.abilities.map(a => +Math.max(0, a.timer).toFixed(1)));
    return r;
  }
  buildingState(b) { return [b.id, Math.round(b.hp), Math.round(b.maxHp), b.level, +b.progress.toFixed(2), b.underConstruction ? 1 : 0]; }
  broadcast() {
    const g = this.game;
    if (!g.started) return;
    this.seq++;
    const units = g.units.filter(u => !u.removed);
    const unitIds = new Set(), bIds = new Set();
    const urec = units.map(u => { unitIds.add(u.id); return this.unitRecord(u); });
    const bld = [];
    for (const b of g.buildings) {
      bIds.add(b.id);
      const st = this.buildingState(b);
      const key = st.join(',');
      if (this.lastB.get(b.id) !== key) { this.lastB.set(b.id, key); bld.push(st); }
    }
    for (const id of [...this.lastB.keys()]) if (!bIds.has(id)) this.lastB.delete(id);
    const proj = g.projectiles.filter(p => !p.dead).map(p => [p.id, p.pdef.model, p.pdef.color || 0, +p.mesh.position.x.toFixed(1), +p.mesh.position.y.toFixed(1), +p.mesh.position.z.toFixed(1)]);
    const zones = g.zones.filter(z => !z.dead).map(z => [z.id, +z.x.toFixed(1), +z.z.toFixed(1), z.radius, z.color]);
    const w = g.waves;
    const base = {
      t: 'snap', seq: this.seq, time: +g.time.toFixed(3), gold: Math.round(g.gold), paused: g.paused, over: g.over, timeScale: g.timeScale,
      wave: { n: w.number, active: w.active, pending: w.pending.length, total: w.total || 0, preview: w.preview ? { n: w.preview.n, d: w.describe(w.preview), dirs: w.preview.dirs } : null },
      king: g.king ? g.king.id : 0, boss: g.boss && !g.boss.dead ? g.boss.id : 0,
      cap: g.soldierCap(), upgrades: g.upgrades, autoRepair: g.autoRepair, heroes: g.heroesOwned, fallen: g.fallenHeroes, heroesBought: g.heroesBought || 0,
      players: this.playerCount, code: this.code,
      units: urec, bld, proj, zones, fx: this.fxQ, sfx: this.sfxQ, toasts: this.toastQ,
    };
    this.fxQ = []; this.sfxQ = []; this.toastQ = [];
    for (const [id, c] of this.clients) {
      const spawns = [], bspawns = [], removes = [];
      for (const u of units) if (!c.known.has(u.id)) { c.known.add(u.id); spawns.push([u.id, u.def.key, u.team, u.isHero ? 1 : 0, u.heroKey || 0, u.hpMul]); }
      for (const uid of [...c.known]) if (!unitIds.has(uid)) { c.known.delete(uid); removes.push(uid); }
      for (const b of g.buildings) if (!c.knownB.has(b.id)) { c.knownB.add(b.id); bspawns.push([b.id, b.def.key, b.i, b.j, b.rot, b.level, b.cells.map(cl => [cl.i, cl.j, cl.solid ? 1 : 0]), ...this.buildingState(b).slice(1)]); }
      for (const bid of [...c.knownB]) if (!bIds.has(bid)) { c.knownB.delete(bid); removes.push(-bid); }
      this.tr.send(id, Object.assign({ spawns, bspawns, removes }, base));
    }
  }
}

// ---------------------------------------------------------------------------
// Client (replica)
// ---------------------------------------------------------------------------
class NetClient {
  constructor(game, transport, hostId, myId) {
    this.game = game; this.tr = transport; this.hostId = hostId; this.myId = myId;
    this.units = new Map(); this.buildings = new Map(); this.proj = new Map(); this.zones = new Map();
    this.snapCount = 0; this.lastRt = 0; this.interval = 0.11; this.posAcc = 0; this.players = 1; this.code = '';
    this.tr.on('message', (from, m) => { try { this.onMessage(m); } catch (e) { console.error('snapshot failed', e); } });
    this.tr.on('close', () => { game.ui.toast('Connection to the host was lost', 'error', 8000); this.lost = true; });
    game.net = this; game.netClient = this; game.replica = true;
  }
  send(m) { this.tr.send(this.hostId, m); }
  onMessage(m) {
    const g = this.game;
    switch (m.t) {
      case 'snap': this.applySnapshot(m); break;
      case 'toast': g.ui.toast(m.msg, m.type || 'info'); break;
      case 'possessOk': break;
      case 'possessFail': { const u = g.controls.controlled; if (u && u.id === m.id) g.controls.exitControl(); g.ui.toast('Someone else controls that unit', 'error'); break; }
      case 'reset': this.resetReplica(); break;
    }
  }
  resetReplica() {
    const g = this.game;
    if (g.controls.mode === 'fps') g.controls.exitControl();
    g.reset();
    this.units.clear(); this.buildings.clear();
    for (const p of this.proj.values()) g.scene.remove(p.mesh); this.proj.clear();
    for (const z of this.zones.values()) { g.scene.remove(z.disc); g.scene.remove(z.ring); } this.zones.clear();
    g.replica = true; g.over = false; g.started = true;
    g.ui.$('gameover').classList.add('hidden');
    g.ui.dirty = true;
  }
  applySnapshot(s) {
    const g = this.game;
    const now = performance.now() / 1000;
    if (this.lastRt) this.interval = U.clamp(this.interval * 0.8 + (now - this.lastRt) * 0.2, 0.05, 0.5);
    this.lastRt = now; this.snapCount++;
    for (const r of s.spawns || []) {
      const [id, defKey, team, hero, heroKey, hpMul] = r;
      if (this.units.has(id)) continue;
      const def = team === 'enemy' ? DATA.enemies[defKey] : (hero ? DATA.heroes[heroKey] : DATA.units[defKey]);
      if (!def) continue;
      const u = new Unit(g, def, team, 0, 0, { hero: !!hero, heroKey: heroKey || null, hpMul: hpMul || 1 });
      u.id = id; u.netPrev = null; u.netCur = null; u.group.visible = false;
      g.units.push(u); this.units.set(id, u);
      if (def.isKing) g.king = u;
    }
    for (const r of s.bspawns || []) {
      const [id, key, i, j, rot, level, cells, hp, maxHp, progress, uc] = r;
      if (this.buildings.has(id)) continue;
      const def = DATA.buildings[key]; if (!def) continue;
      const b = new Building(g, def, i, j, rot, cells.map(c => ({ i: c[0], j: c[1], solid: !!c[2] })));
      b.id = id; b.level = level; if (level > 1) b.build3D();
      g.grid.place(b); g.buildings.push(b); this.buildings.set(id, b);
      this.applyBuilding(b, hp, maxHp, progress, uc);
    }
    for (const id of s.removes || []) {
      if (id > 0) { const u = this.units.get(id); if (u) { u.remove(); this.units.delete(id); const k = g.units.indexOf(u); if (k >= 0) g.units.splice(k, 1); if (g.controls.controlled === u) g.controls.exitControl(); if (u.selected) { g.controls.selected.delete(u); g.ui.onSelectionChanged(); } } }
      else { const b = this.buildings.get(-id); if (b) { b.dead = true; g.grid.remove(b); b.remove(); this.buildings.delete(-id); const k = g.buildings.indexOf(b); if (k >= 0) g.buildings.splice(k, 1); if (g.controls.selectedBuilding === b) g.controls.clearSelection(); if (g.controls.hoveredBuilding === b) g.controls.hoveredBuilding = null; } }
    }
    for (const r of s.units) {
      const u = this.units.get(r[0]); if (!u) continue;
      const f = r[7];
      if (!u.netCur) { u.pos.set(r[1], r[3], r[2]); u.yaw = r[4]; u.group.visible = true; }
      u.netPrev = u.netCur; u.netCur = { x: r[1], z: r[2], y: r[3], yaw: r[4], rt: now };
      u.hp = r[5]; u.maxHp = r[6];
      u.netMoving = !!(f & 1);
      if ((f & 2) && !u.dead) { u.dead = true; u.hp = 0; u.deathTimer = 0; u.hpBar.group.visible = false; u.ring.visible = false; if (g.controls.controlled === u) g.controls.exitControl(); if (u.selected) { u.selected = false; g.controls.selected.delete(u); g.ui.onSelectionChanged(); } }
      if (f & 4) u.stunUntil = g.time + 0.3;
      u.sheltered = !!(f & 8);
      u.netAttackAnim = r[8];
      u.possessedBy = r[9] || null;
      if (r[10] && !u.possessed) u.abilities.forEach((a, k) => { a.timer = r[10][k] || 0; });
    }
    for (const r of s.bld || []) { const b = this.buildings.get(r[0]); if (b) this.applyBuilding(b, r[1], r[2], r[3], r[4], r[5]); }
    // projectiles
    const seen = new Set();
    for (const r of s.proj || []) {
      const [id, model, color, x, y, z] = r;
      seen.add(id);
      let p = this.proj.get(id);
      if (!p) { p = { mesh: Models.projectile(model, color || undefined), prev: null, cur: null }; p.mesh.position.set(x, y, z); g.scene.add(p.mesh); this.proj.set(id, p); }
      p.prev = p.cur; p.cur = { x, y, z, rt: now };
    }
    for (const [id, p] of this.proj) if (!seen.has(id)) { g.scene.remove(p.mesh); this.proj.delete(id); }
    // zones
    const zseen = new Set();
    for (const r of s.zones || []) {
      const [id, x, z, radius, color] = r; zseen.add(id);
      if (!this.zones.has(id)) { const disc = Models.disc(radius, color || 0xffd040, 0.3), ring = Models.ring(radius, color || 0xffd040, 0.8); disc.position.set(x, 0.08, z); ring.position.set(x, 0.09, z); g.scene.add(disc); g.scene.add(ring); this.zones.set(id, { disc, ring }); }
    }
    for (const [id, z] of this.zones) if (!zseen.has(id)) { g.scene.remove(z.disc); g.scene.remove(z.ring); this.zones.delete(id); }
    for (const f of s.fx || []) g.effects.spawn(f[0], f[1], f[2], f[3], f[4] || {});
    for (const n of s.sfx || []) SFX.play(n, 0.8);
    for (const t of s.toasts || []) g.ui.toast(t[0], t[1] || 'info', t[2] || 3200);
    // game state
    g.gold = s.gold; g.paused = s.paused; g.timeScale = s.timeScale;
    if (s.over && !g.over) { g.over = true; g.ui.showGameOver(); }
    const w = s.wave;
    g.waves = { number: w.n, active: w.active, pending: { length: w.pending }, total: w.total, preview: w.preview ? { n: w.preview.n, d: w.preview.d, dirs: w.preview.dirs } : { n: w.n + 1, d: { units: [], from: [] } }, describe: (p) => p.d };
    g.king = this.units.get(s.king) || g.king;
    g.boss = s.boss ? this.units.get(s.boss) : null;
    g.replicaCap = s.cap; g.heroesBought = s.heroesBought || 0; g.upgrades = s.upgrades || {}; g.autoRepair = !!s.autoRepair; g.heroesOwned = s.heroes || []; g.fallenHeroes = s.fallen || [];
    this.players = s.players; this.code = s.code;
    g.time = s.time;
    g.ui.dirty = true;
    if (this.snapCount === 1) g.ui.onConnected();
  }
  applyBuilding(b, hp, maxHp, progress, uc) {
    b.maxHp = maxHp; b.hp = hp;
    const was = b.underConstruction;
    b.progress = progress; b.underConstruction = !!uc;
    if (b.underConstruction && !was) { b.applyDamageTint(hp / maxHp); if (b.ownMats) for (const o of b.ownMats) { o.material.transparent = true; o.material.opacity = 0.45 + 0.55 * progress; o.material.needsUpdate = true; } }
    else if (b.underConstruction && b.ownMats) { for (const o of b.ownMats) o.material.opacity = 0.45 + 0.55 * progress; }
    else if (!b.underConstruction && was) { if (b.ownMats) for (const o of b.ownMats) { o.material.transparent = false; o.material.opacity = 1; o.material.needsUpdate = true; } b.applyDamageTint(1); }
  }
  // per frame in place of the simulation
  frame(dt) {
    this.tr.pump();
    const g = this.game;
    g.time += dt;
    g.hash.clear();
    for (const u of g.units) if (!u.dead) g.hash.insert(u);
    const now = performance.now() / 1000;
    const renderT = now - this.interval * 1.15;
    for (const u of g.units) {
      if (!u.possessed && u.netCur) {
        const a = u.netPrev, b = u.netCur;
        if (a && b.rt > a.rt) {
          const alpha = U.clamp((renderT - a.rt) / (b.rt - a.rt), 0, 1.15);
          u.pos.set(U.lerp(a.x, b.x, alpha), U.lerp(a.y, b.y, alpha), U.lerp(a.z, b.z, alpha));
          u.yaw = U.angleLerp(a.yaw, b.yaw, alpha);
        } else { u.pos.set(b.x, b.y, b.z); u.yaw = b.yaw; }
        u.moving = u.netMoving;
      }
      u.update(dt);
    }
    for (const b of g.buildings) b.update(dt);
    for (const p of this.proj.values()) {
      const a = p.prev, b = p.cur;
      if (a && b && b.rt > a.rt) { const alpha = U.clamp((renderT - a.rt) / (b.rt - a.rt), 0, 1.3); p.mesh.position.set(U.lerp(a.x, b.x, alpha), U.lerp(a.y, b.y, alpha), U.lerp(a.z, b.z, alpha)); if (alpha < 1.29) p.mesh.lookAt(b.x, b.y, b.z); }
      p.mesh.rotation.x += dt * 2;
    }
    // report the position of the unit we drive
    const c = g.controls.controlled;
    this.posAcc += dt;
    if (c && this.posAcc >= 0.05) { this.posAcc = 0; this.send({ t: 'pos', id: c.id, x: +c.pos.x.toFixed(2), z: +c.pos.z.toFixed(2), yaw: +c.yaw.toFixed(3), mv: c.moving ? 1 : 0 }); }
  }
}
