'use strict';

class WaveManager {
  constructor(game) {
    this.game = game;
    this.number = 0;          // current / last started wave
    this.active = false;
    this.pending = [];        // scheduled spawns {t, type, x, z, hpMul}
    this.timer = 0;
    this.spawnedCount = 0;
    this.preview = null;      // plan for the upcoming wave
    this.planNext();
  }

  planNext() { this.preview = this.plan(this.number + 1); }

  plan(n) {
    const diff = this.game.difficulty;
    let budget = DATA.waves.budget(n) * diff.budget * DATA.waves.playerScale(this.game.playerCount ? this.game.playerCount() : 1);
    const bossKey = (n % DATA.waves.bossEvery === 0) ? DATA.bossSchedule[Math.floor(n / DATA.waves.bossEvery - 1) % DATA.bossSchedule.length] : null;
    if (bossKey) budget *= 0.45;
    // a modifier from wave 3 on, most waves
    let mod = null;
    if (n >= 4 && Math.random() < 0.6) { const list = Object.values(DATA.waveMods); mod = U.weightedChoice(list, (m) => m.weight); }
    if (mod && mod.count) budget *= mod.count;
    const available = Object.values(DATA.enemies).filter(e => !e.boss && e.weight > 0 && e.unlock <= n);
    const counts = {};
    let total = 0;
    // guarantee a core of melee raiders, then spend the rest by weight
    const hpScale = DATA.waves.hpScale(n);
    let guard = 0;
    while (budget > 0 && total < DATA.waves.maxCount && guard++ < 2000) {
      const e = U.weightedChoice(available, (x) => x.weight * (x.unlock === n ? 1.8 : 1));
      if (e.reward > budget && total > 6) {
        // try to fit a cheaper unit
        const cheap = available.filter(x => x.reward <= budget);
        if (!cheap.length) break;
        const c = U.choice(cheap);
        counts[c.key] = (counts[c.key] || 0) + 1; budget -= c.reward; total++;
        continue;
      }
      counts[e.key] = (counts[e.key] || 0) + 1; budget -= e.reward; total++;
    }
    // spawn directions: 1 (early) .. 4 (late)
    const lanes = (this.game.world && this.game.world.laneSpawns && this.game.world.laneSpawns.length) ? this.game.world.laneSpawns : DATA.spawnPoints.map((s, k) => k);
    const dirs = Math.min(lanes.length, 2 + Math.floor((n - 1) / 3));
    const idxs = [];
    const pool = lanes.slice();
    while (idxs.length < dirs && pool.length) { const k = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; idxs.push(k); }
    // overflow budget into extra HP so late waves stay dangerous without huge counts
    const extraHp = total >= DATA.waves.maxCount && budget > 0 ? 1 + budget / (DATA.waves.budget(n) * diff.budget) : 1;
    if (mod && mod.siege) { const k = 2 + Math.floor(n / 6); counts.catapult = (counts.catapult || 0) + k; if (n >= 6) counts.ram = (counts.ram || 0) + Math.max(1, Math.floor(k / 2)); total += k + (n >= 6 ? Math.max(1, Math.floor(k / 2)) : 0); }
    // a contract for the wave
    let contract = null;
    if (n >= 3 && Math.random() < 0.75) {
      const casters = Object.entries(counts).reduce((s, [k, c]) => s + (DATA.enemies[k].magic && DATA.enemies[k].attack === 'ranged' ? c : 0), 0);
      const options = Object.values(DATA.contracts).filter(c => c.key !== 'casters' || casters >= 4);
      const c = U.choice(options); contract = { key: c.key, need: c.need || 0, reward: c.reward(n) };
    }
    return { n, counts, boss: bossKey, dirs: idxs, hpMul: hpScale * extraHp * diff.hp * (mod && mod.hp ? mod.hp : 1), total: total + (bossKey ? 1 : 0),
      bossRepeat: bossKey ? Math.floor((n - 1) / (DATA.waves.bossEvery * DATA.bossSchedule.length)) : 0, mod: mod ? mod.key : null, contract };
  }

  describe(plan) {
    const parts = [];
    for (const [k, c] of Object.entries(plan.counts)) parts.push(`${c} ${DATA.enemies[k].name}${c > 1 ? 's' : ''}`);
    if (plan.boss) parts.push(`BOSS: ${DATA.enemies[plan.boss].name}`);
    const mod = plan.mod ? DATA.waveMods[plan.mod] : null, ct = plan.contract ? DATA.contracts[plan.contract.key] : null;
    return { units: parts, from: plan.dirs.map(i => DATA.spawnPoints[i].name), mod: mod ? `${mod.name}: ${mod.desc}` : '', contract: ct ? `${ct.name}: ${ct.desc} (+${plan.contract.reward} gold)` : '' };
  }

  start() {
    if (this.active) return;
    const plan = this.preview;
    this.number = plan.n;
    this.active = true;
    this.pending = [];
    this.timer = 0;
    this.spawnedCount = 0;
    const entries = [];
    for (const [k, c] of Object.entries(plan.counts)) for (let i = 0; i < c; i++) entries.push(k);
    // shuffle
    for (let i = entries.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [entries[i], entries[j]] = [entries[j], entries[i]]; }
    const spread = Math.min(45, 8 + entries.length * 0.45);
    entries.forEach((k, idx) => {
      const sp = DATA.spawnPoints[plan.dirs[idx % plan.dirs.length]];
      const def = DATA.enemies[k];
      // slower units start earlier so groups arrive together-ish
      const t = (idx / Math.max(1, entries.length)) * spread * (def.speed < 3 ? 0.3 : 1);
      this.pending.push({ t, type: k, sp, hpMul: plan.hpMul });
    });
    if (plan.boss) {
      const sp = DATA.spawnPoints[plan.dirs[0]];
      this.pending.push({ t: spread * 0.5, type: plan.boss, sp, hpMul: plan.hpMul * (1 + plan.bossRepeat * 0.9), boss: true });
    }
    this.pending.sort((a, b) => a.t - b.t);
    this.total = this.pending.length;
    this.game.setWaveMod(plan.mod ? DATA.waveMods[plan.mod] : null);
    this.game.startContract(plan.contract);
    const d = this.describe(plan);
    this.game.ui.toast(`Wave ${plan.n} begins! Enemies approach from the ${d.from.join(', ')}.${d.mod ? ' ' + d.mod : ''}`, 'warn', d.mod ? 7000 : 4000);
    SFX.play('horn');
  }

  update(dt) {
    if (!this.active) return;
    this.timer += dt;
    let guard = 0;
    while (this.pending.length && this.pending[0].t <= this.timer) {
      if (++guard > 1000) throw new Error('wave spawn runaway');
      const p = this.pending.shift();
      // jitter only along the edge, never inward
      const jx = p.sp.x === 0 ? 9 : (p.sp.z === 0 ? 0 : 4), jz = p.sp.z === 0 ? 9 : (p.sp.x === 0 ? 0 : 4);
      const x = U.clamp(p.sp.x + U.rand(-jx, jx), -DATA.MAP_HALF + 0.6, DATA.MAP_HALF - 0.6);
      const z = U.clamp(p.sp.z + U.rand(-jz, jz), -DATA.MAP_HALF + 0.6, DATA.MAP_HALF - 0.6);
      const u = this.game.spawnEnemy(p.type, x, z, { hpMul: p.hpMul });
      { const lim = DATA.MAP_HALF - 0.4 - u.collisionRadius; u.pos.x = U.clamp(u.pos.x, -lim, lim); u.pos.z = U.clamp(u.pos.z, -lim, lim); }
      if (!p.boss && !u.def.summoned && u.def.reward >= 6 && Math.random() < DATA.eliteChance(this.number)) this.game.makeElite(u, U.choice(Object.keys(DATA.affixes)));
      this.game.applyWaveModTo(u);
      if (this.game.grid.flowDirty && this.game.king) { const kc = this.game.grid.worldToCell(this.game.king.pos.x, this.game.king.pos.z); this.game.grid.computeFlow(kc.i, kc.j); }
      this.game.snapToReachable(u);
      if (p.boss) { this.game.boss = u; this.game.ui.toast(`${u.name} has arrived!`, 'boss'); SFX.play('bossroar'); }
      this.spawnedCount++;
    }
    if (!this.pending.length && this.game.enemiesAlive() === 0) this.complete();
  }

  complete() {
    this.active = false;
    this.game.boss = null;
    this.game.onWaveCleared(this.number);
    this.planNext();
  }
}
