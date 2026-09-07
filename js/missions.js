'use strict';

// ===========================================================================
// King's errands: one objective per wave, far from the keep, that only the King can resolve
// ===========================================================================
class MissionManager {
  constructor(game) {
    this.game = game; this.active = null; this.used = []; this.marker = null;
  }
  reset() { this.clear(); this.used = []; }
  clear() {
    if (this.marker) { this.game.scene.remove(this.marker); this.marker = null; }
    if (this.carryMesh && this.game.king) { this.game.king.group.remove(this.carryMesh); this.carryMesh = null; }
    this.active = null; this.game.ui.dirty = true;
  }
  // called when a wave starts (host only)
  begin(n) {
    if (this.game.replica || !this.game.king) return;
    this.clear();
    if (Math.random() > DATA.missionChance(n)) return;
    let pool = DATA.missions.filter(m => !this.used.includes(m.key));
    if (!pool.length) { this.used = []; pool = DATA.missions.slice(); }
    const w = (m) => m.tier === 1 ? Math.max(0.5, 10 - n * 0.6) : (m.tier === 2 ? (n >= 4 ? 4 + n * 0.3 : 0.6) : (n >= 8 ? 2 + n * 0.4 : 0));
    const def = U.weightedChoice(pool, w);
    if (def.reward.hero && !this.freeHeroKey()) return;
    const spot = this.pickSpot(def.tier === 1 ? [70, 100] : [95, 132]);
    if (!spot) return;
    this.used.push(def.key);
    this.active = { def, x: spot.x, z: spot.z, state: 'out', progress: 0, wave: n, carried: false };
    this.buildMarker();
    this.game.ui.toast(`King's errand: ${def.name}. ${this.brief()}`, 'warn', 9000);
    SFX.play('horn', 0.5);
    this.game.ui.dirty = true;
  }
  forceStart(key, n) {
    const def = DATA.missions.find(d => d.key === key); if (!def) return null;
    this.clear();
    const spot = this.pickSpot([60, 120]); if (!spot) return null;
    this.active = { def, x: spot.x, z: spot.z, state: 'out', progress: 0, wave: n, carried: false };
    this.buildMarker(); return this.active;
  }
  brief() {
    const m = this.active; if (!m) return '';
    const dir = DATA.compassName(Math.atan2(m.z, m.x));
    const what = m.def.type === 'fetch' ? (m.carried ? 'Carry it back to the Keep.' : `Bring it back from the ${dir}.`) : (m.def.type === 'work' ? `${m.def.work}s of the King's work, to the ${dir}.` : `The King must reach it, to the ${dir}.`);
    return `${what} Expires when the wave ends.`;
  }
  freeHeroKey() { const g = this.game; return Object.keys(DATA.heroes).find(k => !g.heroInPlay(k)) || null; }
  // a free, reachable cell in a ring around the keep, away from the King
  pickSpot(range) {
    const g = this.game.grid, king = this.game.king;
    for (let t = 0; t < 120; t++) {
      const a = Math.random() * Math.PI * 2, r = range[0] + Math.random() * (range[1] - range[0]);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x, z) > DATA.MAP_RADIUS - 4) continue;
      const c = g.worldToCell(x, z), k = g.idx(c.i, c.j);
      if (!g.inBounds(c.i, c.j) || g.flag[k] !== CELL_FREE || g.natural[k] || !isFinite(g.integ[k])) continue;
      if (king && U.dist(king.pos.x, king.pos.z, x, z) < 40) continue;
      const w = g.cellToWorld(c.i, c.j);
      return { x: w.x, z: w.z };
    }
    return null;
  }
  buildMarker() {
    const m = this.active; if (!m) return;
    const g = new THREE.Group();
    g.add(Models.missionObject(m.def.model));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.0, 110, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.y = 55; g.add(beam); g.userData.beam = beam;
    for (const [y, sc] of [[6, 10], [40, 16], [90, 22]]) { const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: Models.softDot(), color: 0xffe080, transparent: true, opacity: 0.6, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(sc); halo.position.y = y; halo.renderOrder = 9; g.add(halo); }
    const ring = Models.ring(3.2, 0xffe080, 0.7); ring.position.y = 0.08; g.add(ring); g.userData.ring = ring;
    g.position.set(m.x, this.game.groundY(m.x, m.z), m.z);
    this.game.scene.add(g); this.marker = g;
  }
  update(dt) {
    const m = this.active, game = this.game;
    if (this.marker) { this.marker.userData.ring.scale.setScalar(1 + 0.15 * Math.sin(game.time * 3)); this.marker.rotation.y += dt * 0.6; this.marker.userData.beam.material.opacity = 0.26 + 0.12 * Math.sin(game.time * 2.2); }
    if (!m || game.replica) return;
    const king = game.king; if (!king || king.dead) return;
    if (m.def.type === 'fetch' && m.carried) {
      // the King returns with it
      const keep = game.buildings.find(b => b.def.keep);
      const home = keep ? keep.pos : { x: 0, z: 0 };
      if (U.dist(king.pos.x, king.pos.z, home.x, home.z) < 14) this.complete();
      return;
    }
    const d = U.dist(king.pos.x, king.pos.z, m.x, m.z);
    if (d > 3.6) { if (m.def.type === 'work' && m.progress > 0) m.progress = Math.max(0, m.progress - dt * 0.5); return; }
    if (m.def.type === 'touch') { this.complete(); return; }
    if (m.def.type === 'fetch') {
      m.carried = true;
      if (this.marker) { this.game.scene.remove(this.marker); this.marker = null; }
      this.carryMesh = Models.missionObject(m.def.model); this.carryMesh.scale.setScalar(0.55); this.carryMesh.position.y = 2.1; king.group.add(this.carryMesh);
      if (m.def.heavy) king.addBuff({ tag: 'burden', speedMul: 0.7, until: game.time + 600 });
      game.ui.toast(`The King has ${m.def.name.replace(/^The /, 'the ')}. Back to the Keep!`, 'good'); SFX.play('summon', 0.5);
      game.ui.dirty = true;
      return;
    }
    // work
    m.progress += dt;
    if (Math.random() < dt * 6) game.effects.spawn('hit', m.x + U.rand(-1, 1), 1 + Math.random(), m.z + U.rand(-1, 1), { color: 0xffe080 });
    if (m.progress >= m.def.work) this.complete();
  }
  expire() {
    const m = this.active; if (!m) return;
    if (m.carried && this.game.king) this.game.king.buffs = this.game.king.buffs.filter(b => b.tag !== 'burden');
    this.game.ui.toast(`The errand is lost: ${m.def.name} expired with the wave.`, 'warn', 5000);
    this.clear();
  }
  complete() {
    const m = this.active, game = this.game, r = m.def.reward, n = m.wave, king = game.king;
    if (king) king.buffs = king.buffs.filter(b => b.tag !== 'burden');
    const lines = [];
    const keep = game.buildings.find(b => b.def.keep), home = keep ? keep.pos : { x: 0, z: 14 };
    if (r.gold) { const gval = r.gold(n); for (const id of game.playerOrder) game.addGold(gval, id); lines.push(`+${gval} gold to every defender`); }
    if (r.units) { for (let k = 0; k < r.units[1]; k++) { const sp = game.findSpawnSpot(home.x + U.rand(-6, 6), home.z + 8 + U.rand(-3, 3)); const u = game.spawnUnit(DATA.units[r.units[0]], 'player', sp.x, sp.z, { owner: 'host' }); u.post = { x: sp.x, z: sp.z }; game.effects.spawn('blink', sp.x, 0.3, sp.z); } lines.push(`${r.units[1]} ${DATA.units[r.units[0]].name}${r.units[1] > 1 ? 's' : ''} join the garrison`); }
    if (r.token) { game.freeTokens = game.freeTokens || {}; game.freeTokens[r.token] = (game.freeTokens[r.token] || 0) + 1; lines.push(`a free ${DATA.buildings[r.token].name} (place it from the Build panel)`); }
    if (r.upgrade) { for (const id of game.playerOrder) { const up = game.players[id].upgrades; up[r.upgrade] = Math.min((DATA.upgrades[r.upgrade].max || DATA.upgrades[r.upgrade].maxLevel || 5), (up[r.upgrade] || 0) + 1); } game.refreshStats(); lines.push(`a free level of ${DATA.upgrades[r.upgrade].name}`); }
    if (r.upgrades) { for (const id of game.playerOrder) for (const k of r.upgrades) { const up = game.players[id].upgrades; up[k] = Math.min((DATA.upgrades[k].max || DATA.upgrades[k].maxLevel || 5), (up[k] || 0) + 1); } game.refreshStats(); lines.push(`a free level of ${r.upgrades.map(k => DATA.upgrades[k].name).join(' and ')}`); }
    if (r.kingRegen || r.kingHp || r.kingDmg) { game.realm = game.realm || { kingRegen: 0, kingHp: 0, kingDmg: 0, kingCd: 1, enemyHp: 1, wonderDiscount: 0, nextWave: 1 }; game.realm.kingRegen += r.kingRegen || 0; game.realm.kingHp += r.kingHp || 0; game.realm.kingDmg += r.kingDmg || 0; game.refreshStats(); lines.push(`the King grows stronger${r.kingRegen ? ` (+${r.kingRegen} regeneration)` : ''}${r.kingHp ? ` (+${r.kingHp} health)` : ''}${r.kingDmg ? ` (+${Math.round(r.kingDmg * 100)}% damage)` : ''}`); }
    if (r.healAll) { for (const u of game.units) if (u.team === 'player' && !u.dead) u.hp = u.maxHp; for (const b of game.buildings) if (!b.dead) b.hp = b.maxHp; lines.push('everyone and everything is healed'); }
    if (r.kingCd) { game.realm = game.realm || { kingRegen: 0, kingHp: 0, kingDmg: 0, kingCd: 1, enemyHp: 1, wonderDiscount: 0, nextWave: 1 }; game.realm.kingCd *= r.kingCd; lines.push('Royal Decree recharges twice as fast'); }
    if (r.nextWave) { game.realm = game.realm || { kingRegen: 0, kingHp: 0, kingDmg: 0, kingCd: 1, enemyHp: 1, wonderDiscount: 0, nextWave: 1 }; game.realm.nextWave = r.nextWave; game.waves.planNext(); lines.push('the next wave is smaller'); }
    if (r.enemyHp) { game.realm = game.realm || { kingRegen: 0, kingHp: 0, kingDmg: 0, kingCd: 1, enemyHp: 1, wonderDiscount: 0, nextWave: 1 }; game.realm.enemyHp *= r.enemyHp; lines.push('every enemy from now on is weaker'); }
    if (r.wonderDiscount) { game.realm = game.realm || { kingRegen: 0, kingHp: 0, kingDmg: 0, kingCd: 1, enemyHp: 1, wonderDiscount: 0, nextWave: 1 }; game.realm.wonderDiscount = r.wonderDiscount; lines.push('your next wonder costs 30% less'); }
    if (r.hero) { const key = this.freeHeroKey(); if (key) { const sp = game.findSpawnSpot(home.x + 4, home.z + 8); const u = game.spawnUnit(DATA.heroes[key], 'player', sp.x, sp.z, { hero: true, heroKey: key, owner: 'host' }); game.wallet('host').heroes.push(key); game.effects.spawn('ring', sp.x, 0.3, sp.z, { radius: 4, color: 0xffe080, dur: 1 }); lines.push(`${u.name} joins the realm`); } }
    if (r.heroesBack) { let c = 0; for (const id of game.playerOrder) { const w = game.players[id]; for (const key of Object.keys(DATA.heroes)) if (w.hero === key || (w.heroesLost || []).includes(key)) { if (!game.heroInPlay(key) && !w.heroes.includes(key)) { const sp = game.findSpawnSpot(home.x + U.rand(-5, 5), home.z + 8); game.spawnUnit(DATA.heroes[key], 'player', sp.x, sp.z, { hero: true, heroKey: key, owner: id }); w.heroes.push(key); c++; } } } lines.push(c ? `${c} fallen hero${c > 1 ? 'es' : ''} return` : 'no hero needed returning, so the feather warms the King instead (+200 health)'); if (!c) { game.realm = game.realm || { kingRegen: 0, kingHp: 0, kingDmg: 0, kingCd: 1, enemyHp: 1, wonderDiscount: 0, nextWave: 1 }; game.realm.kingHp += 200; game.refreshStats(); } }
    game.ui.toast(`${m.def.name} complete: ${lines.join(', ')}.`, 'good', 8000);
    game.effects.spawn('ring', king ? king.pos.x : 0, 0.3, king ? king.pos.z : 0, { radius: 6, color: 0xffe080, dur: 1 });
    SFX.play('summon');
    this.clear();
  }
  // co-op: clients see the marker and the panel line
  netState() { const m = this.active; return m ? { k: m.def.key, x: +m.x.toFixed(1), z: +m.z.toFixed(1), c: m.carried ? 1 : 0, p: +m.progress.toFixed(1), w: m.wave } : null; }
  applyNet(s) {
    if (!s) { if (this.active) this.clear(); return; }
    if (!this.active || this.active.def.key !== s.k || this.active.x !== s.x) { this.clear(); const def = DATA.missions.find(d => d.key === s.k); if (!def) return; this.active = { def, x: s.x, z: s.z, state: 'out', progress: s.p, wave: s.w, carried: !!s.c }; if (!s.c) this.buildMarker(); }
    else { this.active.progress = s.p; if (s.c && !this.active.carried) { this.active.carried = true; if (this.marker) { this.game.scene.remove(this.marker); this.marker = null; } } }
  }
}
