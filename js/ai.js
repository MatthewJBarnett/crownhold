'use strict';

// ===========================================================================
// Unit AI (NPC behaviour for both teams)
// ===========================================================================
Unit.prototype.aiUpdate = function (dt) {
  this.aiTimer -= dt;
  if (this.aiTimer <= 0) {
    this.aiTimer = 0.12 + Math.random() * 0.1;
    if (this.target && this.target.dead) this.target = null;
    if (this.team === 'enemy') this.enemyThink(); else this.playerThink();
  }
  if (this.team === 'enemy') this.enemyAct(dt); else this.playerAct(dt);
  this.updateSpecials(dt);
};

// ----------------------------------------------------------------- shared
Unit.prototype.navigateTo = function (x, z, stopDist, dt) {
  const game = this.game;
  const d = U.dist(this.pos.x, this.pos.z, x, z);
  if (d <= stopDist) { this.moveIntent.x = 0; this.moveIntent.z = 0; this.path = null; return true; }
  if (this.flying || (d < 9 && game.grid.lineClear(this.pos.x, this.pos.z, x, z, this.team))) {
    this.path = null; this.moveDirect(x, z, stopDist); return false;
  }
  this.repathTimer -= dt;
  if (!this.path || this.repathTimer <= 0 || !this.pathGoal || U.dist(this.pathGoal.x, this.pathGoal.z, x, z) > 2.5) {
    this.repathTimer = 0.8 + Math.random() * 0.3;
    this.setPathTo(x, z);
  }
  if (this.path) {
    const done = this.followPath(dt);
    if (done || U.dist(this.pos.x, this.pos.z, x, z) <= stopDist) { this.moveIntent.x = 0; this.moveIntent.z = 0; return true; }
  } else this.moveDirect(x, z, stopDist);
  return false;
};

Unit.prototype.facing = function (t, tol = 0.5) {
  const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z; const d = Math.hypot(dx, dz) || 1;
  return (dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) / d > tol;
};

// ----------------------------------------------------------------- enemies
Unit.prototype.pickUnitTarget = function (aggro) {
  const game = this.game;
  let best = null, bestS = Infinity;
  const consider = (u, bonus) => {
    if (u.dead) return;
    if (u.sheltered && !this.flying && this.distTo(u) > 3.6) return; // hiding in the keep
    let s = this.distTo(u) - bonus;
    if (u.isHero && u.heroKey === 'knight' && s < 9) s -= 7; // knight taunt
    if (u.isKing) s -= 2;
    if (s < bestS) { bestS = s; best = u; }
  };
  if (this.def.prefersHeroes) {
    for (const u of game.unitsNear(this.pos.x, this.pos.z, 32, 'player')) if (u.isHero || u.isKing) consider(u, 30);
    if (best) return best;
  }
  for (const u of game.unitsNear(this.pos.x, this.pos.z, aggro, 'player')) consider(u, 0);
  if (!best) {
    const la = this.lastAttacker;
    if (la && la instanceof Unit && !la.dead && la.team === 'player' && !la.sheltered && this.distTo(la) < 24) best = la;
  }
  return best;
};

Unit.prototype.flowLookahead = function (maxDist) {
  const g = this.game.grid;
  let c = g.worldToCell(this.pos.x, this.pos.z);
  const steps = Math.ceil(maxDist / g.cell) + 1;
  for (let k = 0; k < steps; k++) {
    const n = g.nextFlowCell(c.i, c.j);
    if (!n) return null;
    if (g.flagAt(n.i, n.j) !== CELL_FREE) {
      const b = g.buildingAt(n.i, n.j);
      if (b && !b.dead && this.gapTo(b) <= maxDist) return b;
      return null;
    }
    c = n;
  }
  return null;
};

Unit.prototype.enemyThink = function () {
  const game = this.game, def = this.def;
  if (this.stunned) return;
  let target = null;
  if (def.prefersBuildings) {
    target = game.nearestBuilding(this.pos.x, this.pos.z, this.range + this.radius + 1);
    if (!target) target = this.pickUnitTarget(this.range);
  } else {
    const aggro = this.attackKind === 'melee' ? 11 : this.range + 3;
    target = this.pickUnitTarget(aggro);
  }
  if (target) { this.target = target; return; }
  if (this.target instanceof Building && !this.target.dead) return; // keep breaching
  this.target = null;
  if (this.attackKind !== 'melee' && !this.flying) {
    const b = this.flowLookahead(Math.min(this.range, 9));
    if (b) this.target = b;
  }
};

Unit.prototype.enemyAct = function (dt) {
  if (this.stunned) return;
  const game = this.game, t = this.target;
  if (t && !t.dead) {
    const gap = this.gapTo(t);
    const minR = this.def.minRange || 0;
    if (minR && this.distTo(t) < minR) {
      // artillery too close: back off a little
      this.moveDirect(2 * this.pos.x - t.pos.x, 2 * this.pos.z - t.pos.z);
      return;
    }
    if (gap <= this.range) {
      if (this.def.kite && t instanceof Unit && gap < this.range * 0.45) {
        this.moveDirect(2 * this.pos.x - t.pos.x, 2 * this.pos.z - t.pos.z);
        this.faceToward(t.pos.x, t.pos.z, dt);
        if (this.canAttackNow()) this.attack(t);
        return;
      }
      this.faceToward(t.pos.x, t.pos.z, dt);
      if (this.canAttackNow() && this.facing(t, 0.3)) this.attack(t);
      return;
    }
    // approach directly (walls in the way are handled by onBlocked)
    this.moveDirect(t.pos.x, t.pos.z, Math.max(0, this.range * 0.85 + this.radius + t.radius));
    return;
  }
  this.followFlow(dt);
};

Unit.prototype.followFlow = function (dt) {
  const game = this.game, g = game.grid, king = game.king;
  if (!king || king.dead) { this.moveIntent.x = 0; this.moveIntent.z = 0; return; }
  if (this.flying) { this.moveDirect(king.pos.x, king.pos.z, this.range * 0.8); return; }
  const c = g.worldToCell(this.pos.x, this.pos.z);
  const n = g.nextFlowCell(c.i, c.j);
  if (!n) { this.moveDirect(king.pos.x, king.pos.z, 1); return; }
  if (g.flagAt(n.i, n.j) !== CELL_FREE) {
    const b = g.buildingAt(n.i, n.j);
    if (b && !b.dead) {
      this.target = b;
      const w = g.cellToWorld(n.i, n.j);
      this.moveDirect(w.x, w.z, 0.2);
      return;
    }
  }
  // look a few cells ahead and steer at the farthest one we can walk to in a straight line
  let goal = n, cur = n;
  for (let k = 0; k < 4; k++) {
    const nx = g.nextFlowCell(cur.i, cur.j);
    if (!nx || g.flagAt(nx.i, nx.j) !== CELL_FREE) break;
    const w = g.cellToWorld(nx.i, nx.j);
    if (!g.lineClear(this.pos.x, this.pos.z, w.x, w.z, this.team)) break;
    goal = nx; cur = nx;
  }
  const w = g.cellToWorld(goal.i, goal.j);
  this.moveDirect(w.x, w.z, 0.15);
};

// ----------------------------------------------------------------- player units
Unit.prototype.engineerThink = function () {
  const game = this.game;
  this.target = null;
  const threat = game.unitsNear(this.pos.x, this.pos.z, 9, 'enemy').find(u => !u.dead);
  this.fleeFrom = threat || null;
  if (threat) { this.repairTarget = null; return; }
  const c = this.command;
  if (c && c.type !== 'hold') { this.repairTarget = null; return; } // orders first, repairs when idle
  const rt = this.repairTarget;
  if (rt && (rt.dead || (!rt.underConstruction && rt.hp >= rt.maxHp - 0.5))) this.repairTarget = null;
  if (!this.repairTarget) {
    let best = null, bs = -Infinity;
    for (const b of game.buildings) {
      if (b.dead) continue;
      if (b.def.temporary) continue;
      const miss = b.underConstruction ? 1 - b.progress : 1 - b.hp / b.maxHp;
      if (miss < 0.02) continue;
      const d = U.dist(this.pos.x, this.pos.z, b.pos.x, b.pos.z);
      if (d > 70) continue;
      const claimed = game.units.some(u => u !== this && !u.dead && u.def.repair && u.repairTarget === b);
      const s = (b.underConstruction ? 150 : 0) + miss * 100 + game.repairPriority(b) * 12 - d * 0.9 - (claimed ? 45 : 0);
      if (s > bs) { bs = s; best = b; }
    }
    this.repairTarget = best;
  }
};
Unit.prototype.repairTick = function (b, dt) {
  const game = this.game;
  if (b.underConstruction) b.construct(dt); else b.heal(this.def.repair.hps * dt);
  game.grid.flowDirty = true;
  this.repairFx = (this.repairFx || 0) - dt;
  if (this.repairFx <= 0) {
    this.repairFx = 0.55; this.attackAnim = 1;
    const dx = b.pos.x - this.pos.x, dz = b.pos.z - this.pos.z; const d = Math.hypot(dx, dz) || 1;
    game.effects.spawn('hit', this.pos.x + dx / d * (this.radius + 0.6), 1.3, this.pos.z + dz / d * (this.radius + 0.6), { color: 0xffe0a0 });
    SFX.play('build', 0.35);
  }
};

Unit.prototype.playerThink = function () {
  const game = this.game;
  if (this.def.repair) { this.engineerThink(); return; }
  const cmd = this.command;
  if (cmd) {
    if (cmd.type === 'attack') {
      if (cmd.target.dead) { this.command = null; this.post = { x: this.pos.x, z: this.pos.z }; }
      else { this.target = cmd.target; if (this.isHero || this.isKing) this.autoAbilities(); return; }
    }
    if (cmd.type === 'follow' && (cmd.leader.dead)) this.command = null;
  }
  const c = this.command;
  let anchor = this.post, leash;
  let aggro;
  if (this.isKing) { aggro = 7; leash = 6; }
  else if (this.isHero) { aggro = 22; leash = 26; }
  else { aggro = 16; leash = 24; }
  if (c && c.type === 'hold') { aggro = this.range + this.radius + 1.5; leash = 0; }
  if (c && c.type === 'follow') { anchor = c.leader.pos; leash = 15; aggro = Math.min(aggro, 14); }
  if (c && c.type === 'attackmove') { anchor = { x: c.x, z: c.z }; leash = Math.max(leash, U.dist(this.pos.x, this.pos.z, c.x, c.z) + 6); }
  if (c && c.type === 'move') { aggro = 0; }

  let best = null, bestS = Infinity;
  if (aggro > 0) {
    for (const u of game.unitsNear(this.pos.x, this.pos.z, aggro, 'enemy')) {
      if (u.dead) continue;
      if (leash > 0 && U.dist(u.pos.x, u.pos.z, anchor.x, anchor.z) > leash) continue;
      let s = this.distTo(u);
      if (this.def.bonusVsLarge && u.large) s -= 8;
      if (u.isBoss) s -= 3;
      if (s < bestS) { bestS = s; best = u; }
    }
  }
  if (c && c.type === 'hold' && best && !this.inRange(best, 0.6)) best = null;
  // sally out against artillery shelling the fortress from beyond tower range
  if (!best && !this.isKing && !(c && (c.type === 'hold' || c.type === 'move' || c.type === 'follow'))) {
    let art = null, ad = Infinity;
    for (const u of game.unitsNear(this.pos.x, this.pos.z, this.isHero ? 80 : 55, 'enemy')) {
      if (u.dead || !u.def.prefersBuildings) continue;
      const d = this.distTo(u);
      if (d < ad) { ad = d; art = u; }
    }
    if (art) best = art;
  }
  // stickiness: keep current target unless the new one is clearly closer
  const cur = this.target;
  if (cur && !cur.dead && cur instanceof Unit && best && best !== cur && this.distTo(cur) < bestS + 3 && this.distTo(cur) < aggro + 3) best = cur;
  this.target = best;
  if (this.isHero || this.isKing) this.autoAbilities();
};

Unit.prototype.playerAct = function (dt) {
  if (this.stunned) return;
  const cmd = this.command, t = this.target;
  if (this.def.repair) {
    if (this.fleeFrom && !this.fleeFrom.dead) {
      // run away from the threat, biased toward the keep
      const king = this.game.king;
      let ax = this.pos.x - this.fleeFrom.pos.x, az = this.pos.z - this.fleeFrom.pos.z;
      if (king) { ax += (king.pos.x - this.pos.x) * 0.3; az += (king.pos.z - this.pos.z) * 0.3; }
      const l = Math.hypot(ax, az) || 1;
      this.navigateTo(this.pos.x + ax / l * 8, this.pos.z + az / l * 8, 0.5, dt);
      return;
    }
    const b = this.repairTarget;
    if (b && !b.dead && !(cmd && cmd.type === 'hold')) {
      if (this.gapTo(b) <= this.def.repair.range) { this.faceToward(b.pos.x, b.pos.z, dt); this.path = null; this.repairTick(b, dt); return; }
      this.navigateTo(b.pos.x, b.pos.z, this.def.repair.range * 0.7 + this.radius + b.radius, dt);
      return;
    }
  }
  if (t && !t.dead) {
    if (this.inRange(t)) {
      this.faceToward(t.pos.x, t.pos.z, dt);
      if (this.canAttackNow() && this.facing(t, 0.2)) this.attack(t);
      this.path = null;
      return;
    }
    if (!(cmd && cmd.type === 'hold')) {
      this.navigateTo(t.pos.x, t.pos.z, Math.max(0.3, this.range * 0.85 + this.radius + t.radius), dt);
      return;
    }
  }
  if (cmd && (cmd.type === 'move' || cmd.type === 'attackmove')) {
    if (this.navigateTo(cmd.x, cmd.z, 0.4, dt)) { this.post = { x: cmd.x, z: cmd.z }; this.command = null; }
    return;
  }
  if (cmd && cmd.type === 'follow') {
    const L = cmd.leader;
    const a = cmd.slot * 2.4, r = 2.4 + Math.sqrt(cmd.slot) * 0.9;
    const tx = L.pos.x + Math.sin(a) * r, tz = L.pos.z + Math.cos(a) * r;
    if (U.dist(this.pos.x, this.pos.z, tx, tz) > 1.2) this.navigateTo(tx, tz, 0.6, dt);
    return;
  }
  if (cmd && cmd.type === 'hold') return;
  // idle: drift back to post
  if (U.dist(this.pos.x, this.pos.z, this.post.x, this.post.z) > 1.6) this.navigateTo(this.post.x, this.post.z, 0.6, dt);
};

// ----------------------------------------------------------------- special behaviours
Unit.prototype.updateSpecials = function (dt) {
  const def = this.def, game = this.game;
  if (this.dead) return;
  // auras
  if (def.healAura) {
    for (const u of game.unitsNear(this.pos.x, this.pos.z, def.healAura.radius, 'enemy')) if (u !== this && u.hp < u.maxHp) u.heal(def.healAura.hps * dt);
    if (Math.random() < dt * 2) game.effects.spawn('heal_p', this.pos.x + U.rand(-1, 1), 1.5, this.pos.z + U.rand(-1, 1));
  }
  if (def.slowAura) {
    for (const u of game.unitsNear(this.pos.x, this.pos.z, def.slowAura.radius, 'player')) u.applySlow(def.slowAura.factor, 0.4);
  }
  if (def.aura && def.aura.regen && this.team === 'player') {
    for (const u of game.unitsNear(this.pos.x, this.pos.z, def.aura.radius, 'player')) if (u !== this && u.hp < u.maxHp) u.heal(def.aura.regen * dt);
  }
  if (def.aura && def.aura.dmgMul && this.team === 'player') {
    for (const u of game.unitsNear(this.pos.x, this.pos.z, def.aura.radius, 'player')) if (u !== this && !u.isHero && !u.isKing) { u.auraDmgMul = def.aura.dmgMul; u.auraUntil = game.time + 0.3; }
  }
  if (this.auraDmgMul && game.time > this.auraUntil) this.auraDmgMul = 0;
  // dragon breath in progress
  if (this.breathing > 0) {
    this.breathing -= dt;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const u of game.unitsNear(this.pos.x, this.pos.z, def.breath.range, 'player')) {
      const dx = u.pos.x - this.pos.x, dz = u.pos.z - this.pos.z; const d = Math.hypot(dx, dz) || 1;
      if ((dx * fx + dz * fz) / d > 0.75) { u.takeDamage(def.breath.dps * dt, this, { magic: true }); u.applyBurn(6, 2, this); }
    }
    for (const b of game.buildingsNear(this.pos.x, this.pos.z, def.breath.range)) {
      const dx = b.pos.x - this.pos.x, dz = b.pos.z - this.pos.z; const d = Math.hypot(dx, dz) || 1;
      if ((dx * fx + dz * fz) / d > 0.75) b.takeDamage(def.breath.dps * 1.5 * dt, this);
    }
    for (let k = 0; k < 3; k++) {
      const sp = U.rand(8, 16), spread = U.rand(-0.35, 0.35);
      const vx = Math.sin(this.yaw + spread) * sp, vz = Math.cos(this.yaw + spread) * sp;
      game.effects.spawn('flame', this.pos.x + fx * 3.5, this.pos.y + 1.5, this.pos.z + fz * 3.5, { vel: new THREE.Vector3(vx, U.rand(-3, 0), vz) });
    }
  }
  if (this.team !== 'enemy') return;
  this.specialTimer -= dt;
  if (this.specialTimer > 0) return;
  const king = game.king;
  const distKing = king ? this.distTo(king) : 999;
  if (def.summon) {
    if (distKing < 60) {
      for (let k = 0; k < def.summon.count; k++) {
        const a = Math.random() * Math.PI * 2;
        const x = this.pos.x + Math.sin(a) * 2.2, z = this.pos.z + Math.cos(a) * 2.2;
        const p = game.grid.passableWorld(x, z, 'enemy') ? { x, z } : { x: this.pos.x, z: this.pos.z };
        game.spawnEnemy('skeleton', p.x, p.z, { hpMul: this.hpMul });
        game.effects.spawn('blink', p.x, 0.3, p.z);
      }
      SFX.play('summon');
    }
    this.specialTimer = def.summon.every;
  } else if (def.slam) {
    const list = game.unitsNear(this.pos.x, this.pos.z, def.slam.radius, 'player');
    if (list.length) {
      game.areaDamage(this.pos.x, this.pos.z, def.slam.radius, def.slam.dmg * this.dmgMul, 'enemy', this, { stun: 1.2 });
      game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: def.slam.radius, color: 0xc0a060 });
      game.effects.spawn('explosion', this.pos.x, 0.5, this.pos.z, { radius: 2.5, color: 0x9a8a60 });
      this.attackAnim = 1;
      SFX.play('slam');
      this.specialTimer = def.slam.every;
    } else this.specialTimer = 1;
  } else if (def.breath) {
    const t = this.target;
    if (t && !t.dead && this.distTo(t) < def.breath.range) {
      this.faceToward(t.pos.x, t.pos.z, 1, 100);
      this.breathing = def.breath.dur;
      SFX.play('breath');
      this.specialTimer = def.breath.every;
    } else this.specialTimer = 1;
  } else if (def.blink) {
    if (king && distKing > 26) {
      const dx = king.pos.x - this.pos.x, dz = king.pos.z - this.pos.z; const d = Math.hypot(dx, dz) || 1;
      const nx = this.pos.x + dx / d * def.blink.dist, nz = this.pos.z + dz / d * def.blink.dist;
      if (game.grid.passableWorld(nx, nz, 'enemy')) {
        game.effects.spawn('blink', this.pos.x, 0.3, this.pos.z);
        this.pos.x = nx; this.pos.z = nz;
        game.effects.spawn('blink', nx, 0.3, nz);
        SFX.play('blink');
      }
      this.specialTimer = def.blink.every;
    } else this.specialTimer = 2;
  } else this.specialTimer = 5;
};

// ----------------------------------------------------------------- hero auto-abilities (NPC)
Unit.prototype.autoAbilities = function () {
  const game = this.game;
  if (this.possessed || this.stunned) return;
  const enemiesNear = (r) => game.unitsNear(this.pos.x, this.pos.z, r, 'enemy').filter(u => !u.dead);
  const t = this.target;
  for (let i = 0; i < this.abilities.length; i++) {
    const ab = this.abilities[i];
    if (ab.timer > 0) continue;
    const key = ab.key;
    let aim = null;
    const near = enemiesNear(8);
    switch (key) {
      case 'shield_bash':
        if (t && this.distTo(t) < 4 && near.length >= 2) aim = { x: t.pos.x, z: t.pos.z };
        break;
      case 'war_cry':
        if (this.hp < this.maxHp * 0.5 || near.length >= 4) aim = { x: this.pos.x, z: this.pos.z };
        break;
      case 'multishot':
        if (t && this.distTo(t) < 16 && enemiesNear(16).length >= 3) aim = { x: t.pos.x, z: t.pos.z };
        break;
      case 'arrow_rain': {
        const c = game.densestCluster(this.pos.x, this.pos.z, 22, 7, 'enemy');
        if (c && c.count >= 4) aim = c;
        break;
      }
      case 'meteor': {
        const c = game.densestCluster(this.pos.x, this.pos.z, 22, 6, 'enemy');
        if (c && (c.count >= 3 || c.boss)) aim = c;
        break;
      }
      case 'flame_nova':
        if (near.length >= 2 || (t && t.isBoss && this.distTo(t) < 7)) aim = { x: this.pos.x, z: this.pos.z };
        break;
      case 'holy_light': {
        let missing = 0;
        for (const u of game.unitsNear(this.pos.x, this.pos.z, 14, 'player')) missing += u.maxHp - u.hp;
        if (missing > 250) aim = { x: this.pos.x, z: this.pos.z };
        break;
      }
      case 'consecrate': {
        const c = game.densestCluster(this.pos.x, this.pos.z, 18, 8, 'enemy');
        if (c && c.count >= 3) aim = c;
        break;
      }
      case 'royal_decree':
        if (enemiesNear(24).length >= 5) aim = { x: this.pos.x, z: this.pos.z };
        break;
      case 'whirlwind':
        if (enemiesNear(4.5).length >= 2) aim = { x: this.pos.x, z: this.pos.z };
        break;
      case 'bloodlust':
        if (this.hp < this.maxHp * 0.6 || near.length >= 3) aim = { x: this.pos.x, z: this.pos.z };
        break;
      case 'shadowstep':
        if (t && this.distTo(t) > 6 && this.distTo(t) < 13 && !t.sheltered) aim = { x: t.pos.x, z: t.pos.z };
        break;
      case 'smoke_bomb': {
        const c = game.densestCluster(this.pos.x, this.pos.z, 18, 7, 'enemy');
        if (c && c.count >= 3) aim = c;
        break;
      }
      case 'frost_nova':
        if (enemiesNear(7).length >= 2 || (t && t.isBoss && this.distTo(t) < 7)) aim = { x: this.pos.x, z: this.pos.z };
        break;
      case 'ice_wall': {
        const c = game.densestCluster(this.pos.x, this.pos.z, 22, 6, 'enemy');
        if (c && c.count >= 4 && U.dist(c.x, c.z, this.pos.x, this.pos.z) > 8) { const dx = c.x - this.pos.x, dz = c.z - this.pos.z, d = Math.hypot(dx, dz); aim = { x: this.pos.x + dx / d * (d - 5), z: this.pos.z + dz / d * (d - 5) }; }
        break;
      }
      case 'call_pack':
        if (enemiesNear(20).length >= 2 && !game.units.some(u => u.def.summoned && !u.dead && u.owner === this)) aim = { x: this.pos.x, z: this.pos.z };
        break;
      case 'war_horn':
        if (enemiesNear(20).length >= 3 && game.unitsNear(this.pos.x, this.pos.z, 20, 'player').filter(u => u.isSoldier).length >= 3) aim = { x: this.pos.x, z: this.pos.z };
        break;
      case 'rally': {
        const notFollowing = game.units.some(u => u.isSoldier && !u.dead && !u.def.repair && !(u.command && u.command.type === 'follow' && u.command.leader === this));
        if (this.hp < this.maxHp * 0.45 && enemiesNear(10).length >= 1 && notFollowing) aim = { x: this.pos.x, z: this.pos.z };
        break;
      }
    }
    if (aim) { this.useAbility(i, aim); return; }
  }
};
