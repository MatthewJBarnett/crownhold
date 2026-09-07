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
    let budget = DATA.waves.budget(n) * diff.budget;
    const bossKey = (n % DATA.waves.bossEvery === 0) ? DATA.bossSchedule[Math.floor(n / DATA.waves.bossEvery - 1) % DATA.bossSchedule.length] : null;
    if (bossKey) budget *= 0.55;
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
    const dirs = Math.min(4, 1 + Math.floor((n - 1) / 3));
    const idxs = [];
    while (idxs.length < dirs) { const k = U.randInt(0, DATA.spawnPoints.length - 1); if (!idxs.includes(k)) idxs.push(k); }
    // overflow budget into extra HP so late waves stay dangerous without huge counts
    const extraHp = total >= DATA.waves.maxCount && budget > 0 ? 1 + budget / (DATA.waves.budget(n) * diff.budget) : 1;
    return { n, counts, boss: bossKey, dirs: idxs, hpMul: hpScale * extraHp * diff.hp, total: total + (bossKey ? 1 : 0),
      bossRepeat: bossKey ? Math.floor((n - 1) / (DATA.waves.bossEvery * DATA.bossSchedule.length)) : 0 };
  }

  describe(plan) {
    const parts = [];
    for (const [k, c] of Object.entries(plan.counts)) parts.push(`${c} ${DATA.enemies[k].name}${c > 1 ? 's' : ''}`);
    if (plan.boss) parts.push(`BOSS: ${DATA.enemies[plan.boss].name}`);
    return { units: parts, from: plan.dirs.map(i => DATA.spawnPoints[i].name) };
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
    this.game.ui.toast(`Wave ${plan.n} begins! Enemies approach from the ${this.describe(plan).from.join(' and ')}.`, 'warn');
    SFX.play('horn');
  }

  update(dt) {
    if (!this.active) return;
    this.timer += dt;
    let guard = 0;
    while (this.pending.length && this.pending[0].t <= this.timer) {
      if (++guard > 1000) throw new Error('wave spawn runaway');
      const p = this.pending.shift();
      const jx = p.sp.x === 0 ? 9 : 4, jz = p.sp.z === 0 ? 9 : 4;
      const x = U.clamp(p.sp.x + U.rand(-jx, jx), -DATA.MAP_HALF + 1, DATA.MAP_HALF - 1);
      const z = U.clamp(p.sp.z + U.rand(-jz, jz), -DATA.MAP_HALF + 1, DATA.MAP_HALF - 1);
      const u = this.game.spawnEnemy(p.type, x, z, { hpMul: p.hpMul });
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
