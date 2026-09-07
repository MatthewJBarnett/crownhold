'use strict';

let NEXT_ID = 1;

// ===========================================================================
// Unit
// ===========================================================================
class Unit {
  constructor(game, def, team, x, z, opts = {}) {
    this.id = NEXT_ID++;
    this.game = game; this.def = def; this.team = team;
    this.name = def.name;
    this.isHero = !!opts.hero; this.heroKey = opts.heroKey || null;
    this.isKing = !!def.isKing;
    this.isSoldier = team === 'player' && !this.isHero && !this.isKing;
    this.isBoss = !!def.boss; this.large = !!def.large; this.flying = !!def.flying;
    this.radius = def.radius || 0.45;
    this.owner = opts.owner || null;
    this.pos = new THREE.Vector3(x, (this.flying ? def.altitude : 0) + game.groundY(x, z), z);
    this.yaw = opts.yaw || 0;
    this.attackKind = def.attack || 'melee';
    this.hpMul = opts.hpMul || 1;
    this.dmgMul = opts.dmgMul || 1;

    this.attackTimer = 0;
    this.dead = false; this.deathTimer = 0; this.removed = false;
    this.target = null; this.command = null; this.post = { x, z };
    this.path = null; this.pathI = 0; this.repathTimer = 0;
    this.aiTimer = Math.random() * 0.2;
    this.moveIntent = { x: 0, z: 0 };
    this.moving = false; this.animT = Math.random() * 6; this.attackAnim = 0;
    this.slow = null; this.stunUntil = 0; this.burn = null; this.buffs = [];
    this.possessed = false; this.possessedBy = null; this.remote = null; this.selected = false; this.hovered = false;
    this.netAttackAnim = 0; this.netMoving = false; this.localAtkT = 0;
    this.flashT = 0; this.lastAttacker = null; this.stuckT = 0;
    this.abilities = (def.abilities || []).map(k => ({ key: k, def: DATA.abilities[k], timer: 0 }));
    this.specialTimer = 4 + Math.random() * 3;
    this.breathing = 0;
    this.level = 1; this.xp = 0;
    this.sheltered = false;

    this.build3D();
    game.applyStats(this, true);
  }

  build3D() {
    const def = this.def;
    let m;
    if (def.model === 'catapult') m = Models.catapult(def);
    else if (def.model === 'wolf') m = Models.wolf(def);
    else if (def.model === 'rider') m = Models.rider(def);
    else if (def.model === 'spider') m = Models.spider(def);
    else if (def.model === 'dragon') m = Models.dragon(def);
    else m = Models.humanoid(def, this.team);
    this.group = m.group; this.parts = m.parts; this.mats = m.mats;
    this.eyeHeight = m.eyeHeight; this.height = m.height; this.pickMesh = m.mesh; this.legSwing = m.legSwing || 0.7;
    if (def.scale && (def.model === 'catapult' || def.model === 'wolf')) { this.group.scale.setScalar(def.scale); this.eyeHeight *= def.scale; this.height *= def.scale; }
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.group.userData.unit = this;
    this.game.scene.add(this.group);

    const hb = Models.healthBar(this.large ? 1.8 : 1.15, this.large ? 0.22 : 0.17);
    this.hpBar = hb; hb.group.position.y = this.height + 0.5; hb.group.visible = false;
    this.group.add(hb.group);
    // health bar sprites must not inherit the group's scale-less rotation; sprites always face camera
    this.ring = Models.ring(this.radius + 0.35, this.team === 'player' ? 0x50ff80 : 0xff5050);
    this.ring.visible = false;
    this.game.scene.add(this.ring);
    if (!this.flying) { const blob = Models.blob(this.radius + 0.35, this.large ? 0.5 : 0.42); blob.position.y = 0.03; this.group.add(blob); this.blob = blob; }
  }

  get centerY() { return this.pos.y + this.height * 0.55; }
  get alive() { return !this.dead; }
  get effSpeed() {
    let s = this.speed;
    if (!this.flying && this.game.world) { const c = this.game.grid.worldToCell(this.pos.x, this.pos.z); const tk = this.game.grid.terrain[this.game.grid.idx(c.i, c.j)]; if (tk === 6) s *= 1.2; else if (tk === 7) s *= 0.55; }
    if (this.slow && this.slow.until > this.game.time) s *= (1 - this.slow.factor);
    for (const b of this.buffs) if (b.until > this.game.time && b.speedMul) s *= b.speedMul;
    if (this.stunUntil > this.game.time) s = 0;
    return s;
  }
  get effDmg() {
    let d = this.dmg;
    for (const b of this.buffs) if (b.until > this.game.time && b.dmgMul) d *= b.dmgMul;
    if (this.auraDmgMul) d *= this.auraDmgMul;
    return d;
  }
  get stunned() { return this.stunUntil > this.game.time; }

  addBuff(b) {
    this.buffs = this.buffs.filter(x => x.until > this.game.time && x.tag !== b.tag);
    this.buffs.push(b);
  }
  applySlow(factor, dur) {
    if (this.def.unstoppable) return;
    const until = this.game.time + dur;
    if (!this.slow || this.slow.until < this.game.time || factor >= this.slow.factor) this.slow = { factor, until };
    else this.slow.until = Math.max(this.slow.until, until);
  }
  applyBurn(dps, dur, source) {
    const until = this.game.time + dur;
    if (!this.burn || this.burn.until < this.game.time) this.burn = { dps, until, source };
    else { this.burn.dps = Math.max(this.burn.dps, dps); this.burn.until = Math.max(this.burn.until, until); }
  }
  stun(dur) { if (this.def.unstoppable) return; this.stunUntil = Math.max(this.stunUntil, this.game.time + dur); }
  applyPoison(dps, dur, source) { this.applyBurn(dps, dur, source); this.burn.poison = true; }
  // heroes grow with their kills: +7% health and +6% damage per level, up to level 10
  gainXp(n) {
    if (!this.isHero || this.dead || this.level >= DATA.heroMaxLevel) return;
    this.xp += n;
    let need = DATA.heroXp(this.level);
    while (this.xp >= need && this.level < DATA.heroMaxLevel) {
      this.xp -= need; this.level++;
      this.game.applyStats(this, false); this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25);
      this.game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: 3, color: 0xffe080, dur: 0.8 });
      this.game.ui.toast(`${this.name} reaches level ${this.level}!`, 'good');
      need = DATA.heroXp(this.level);
    }
    this.game.ui.dirty = true;
  }

  distTo(t) { return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); }
  // edge-to-edge distance to a target (unit or building)
  gapTo(t) { return this.distTo(t) - this.radius - (t.radius || 0.5); }
  inRange(t, slack = 0.3) { return this.gapTo(t) <= this.range + slack; }
  faceToward(x, z, dt, rate = 12) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.yaw = U.angleLerp(this.yaw, want, Math.min(1, dt * rate));
  }

  // --------------------------------------------------------------- movement
  // collision radius against buildings: a possessed unit keeps the camera well outside walls
  get collisionRadius() {
    if (this.possessed && this.game.controls.mode === 'fps' && this.game.controls.controlled === this) return this.radius + 0.3; return this.possessed ? Math.max(0.55, this.radius) : Math.min(0.9, this.radius * 0.85); }
  tryMove(dx, dz) {
    const g = this.game.grid;
    const H = DATA.MAP_HALF;
    if (this.flying) {
      this.pos.x = U.clamp(this.pos.x + dx, -H, H); this.pos.z = U.clamp(this.pos.z + dz, -H, H);
      return null;
    }
    const r = this.collisionRadius, team = this.team;
    let blocked = null;
    const hit = (x, z, sx, sz) => g.buildingAtWorld(x + sx * r, z + sz * r) || g.buildingAtWorld(x + sx * r, z + sz * r + r * 0.7) || g.buildingAtWorld(x + sx * r, z + sz * r - r * 0.7) || g.buildingAtWorld(x + sx * r + r * 0.7, z + sz * r) || g.buildingAtWorld(x + sx * r - r * 0.7, z + sz * r);
    const slide = Math.min(0.25, Math.abs(dx) + Math.abs(dz) + 0.08);
    if (dx) {
      const nx = this.pos.x + dx;
      if (g.circleFree(nx, this.pos.z, r, team)) this.pos.x = nx;
      else if (g.circleFree(nx, this.pos.z + slide, r, team)) { this.pos.x = nx; this.pos.z += slide; }   // slip past a corner
      else if (g.circleFree(nx, this.pos.z - slide, r, team)) { this.pos.x = nx; this.pos.z -= slide; }
      else blocked = hit(nx, this.pos.z, Math.sign(dx), 0) || blocked;
    }
    if (dz) {
      const nz = this.pos.z + dz;
      if (g.circleFree(this.pos.x, nz, r, team)) this.pos.z = nz;
      else if (g.circleFree(this.pos.x + slide, nz, r, team)) { this.pos.z = nz; this.pos.x += slide; }
      else if (g.circleFree(this.pos.x - slide, nz, r, team)) { this.pos.z = nz; this.pos.x -= slide; }
      else blocked = hit(this.pos.x, nz, 0, Math.sign(dz)) || blocked;
    }
    return blocked;
  }
  separate(dt) {
    if (this.flying) return;
    const game = this.game;
    const near = game.hash.query(this.pos.x, this.pos.z, this.radius + 1.8, game.scratch2);
    let px = 0, pz = 0;
    const r2 = this.radius * this.radius;
    for (const o of near) {
      if (o === this || o.dead || o.flying) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const minD = this.radius + o.radius + 0.15;
      if (d >= minD) continue;
      const push = (minD - d) / minD;
      const w = (o.radius * o.radius) / (o.radius * o.radius + r2) * 2; // heavier units push lighter ones
      if (d < 1e-3) { px += Math.cos(this.id * 1.7) * push; pz += Math.sin(this.id * 1.7) * push; }
      else { px += dx / d * push * w; pz += dz / d * push * w; }
    }
    if (!px && !pz) return;
    const m = Math.hypot(px, pz);
    if (m < 0.04) return;
    const step = Math.min(m, 1) * (this.possessed ? 1.0 : 2.4) * dt;
    this.tryMove(px / m * step, pz / m * step);
  }
  // the unit overlaps something solid (a building was placed on it, or it got pushed): ease it out
  unstuck(dt) {
    const g = this.game.grid, r = this.collisionRadius;
    const push = g.circlePushOut(this.pos.x, this.pos.z, r, this.team);
    if (push) {
      const m = Math.hypot(push.x, push.z);
      if (m < 1e-4) return;
      const step = Math.min(m, 6 * dt);
      this.pos.x += push.x / m * step; this.pos.z += push.z / m * step;
      return;
    }
    const c = g.worldToCell(this.pos.x, this.pos.z);
    const np = g.nearestPassable(c.i, c.j, this.team, 6);
    if (!np) return;
    const w = g.cellToWorld(np.i, np.j);
    const dx = w.x - this.pos.x, dz = w.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const step = Math.min(d, 6 * dt);
    this.pos.x += dx / d * step; this.pos.z += dz / d * step;
  }

  setPathTo(x, z) {
    const g = this.game.grid;
    const a = g.worldToCell(this.pos.x, this.pos.z), b = g.worldToCell(x, z);
    const path = g.astar(a.i, a.j, b.i, b.j, this.team);
    this.pathI = 0;
    this.pathFailed = path === null;
    if (path === null) { this.path = null; return false; }
    // replace the final cell centre with the exact destination if it is passable
    if (g.passableWorld(x, z, this.team)) { if (path.length) path[path.length - 1] = { x, z }; else path.push({ x, z }); }
    this.path = path;
    this.pathGoal = { x, z };
    return true;
  }
  followPath(dt) {
    if (!this.path || this.pathI >= this.path.length) { this.moveIntent.x = 0; this.moveIntent.z = 0; return true; }
    const wp = this.path[this.pathI];
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const reach = this.pathI === this.path.length - 1 ? 0.35 : 0.8;
    if (d < reach) { this.pathI++; return this.followPath(dt); }
    this.moveIntent.x = dx / d; this.moveIntent.z = dz / d;
    return false;
  }
  moveDirect(x, z, stopDist = 0) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopDist + 0.05) { this.moveIntent.x = 0; this.moveIntent.z = 0; return true; }
    this.moveIntent.x = dx / d; this.moveIntent.z = dz / d;
    return false;
  }

  // --------------------------------------------------------------- combat
  canAttackNow() { return this.attackTimer <= 0 && !this.stunned; }
  attack(target) {
    if (!this.canAttackNow() || !target || target.dead) return false;
    const def = this.def;
    let cd = this.cd;
    for (const b of this.buffs) if (b.until > this.game.time && b.attackSpeedMul) cd /= b.attackSpeedMul;
    if (def.rage) cd /= 1 + def.rage * (1 - this.hp / this.maxHp);
    this.attackTimer = cd;
    this.attackAnim = 1;
    const dmg = this.effDmg;
    const game = this.game;
    if (this.attackKind === 'melee') {
      if (def.cleave) {
        // hit everything in reach in a forward cone
        const list = game.hostilesNear(this, this.range + this.radius + 0.6);
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        let hits = 0;
        for (const u of list) {
          const dx = u.pos.x - this.pos.x, dz = u.pos.z - this.pos.z; const d = Math.hypot(dx, dz) || 1;
          if ((dx * fx + dz * fz) / d > 0.2 || u === target) { u.takeDamage(this.scaledDmg(dmg, u), this); hits++; }
        }
        if (hits === 0) target.takeDamage(this.scaledDmg(dmg, target), this);
      } else {
        const dealt = target.takeDamage(this.scaledDmg(dmg, target), this);
        if (this.affix && this.affix.vampiric && dealt > 0) this.heal(dealt * this.affix.vampiric);
        if (this.def.poisonBite && target instanceof Unit && dealt > 0) target.applyPoison(this.def.poisonBite.dps, this.def.poisonBite.dur, this);
      }
      SFX.play(this.large ? 'heavyhit' : 'hit');
      return true;
    }
    if (this.attackKind === 'ranged' || this.attackKind === 'artillery') {
      const pdef = DATA.projectiles[def.projectile] || DATA.projectiles.arrow;
      game.fireProjectile({
        from: this, target, key: def.projectile, dmg, team: this.team,
        splash: def.splash || pdef.splash || 0, buildingDmg: def.buildingDmg ? def.buildingDmg * this.dmgMul : 0,
        slow: def.slow || pdef.slow || null, burn: pdef.burn || null, magic: !!def.magic, bonusVsLarge: def.bonusVsLarge || 1, hex: def.hex || null,
      });
      SFX.play(def.projectile === 'arrow' ? 'bow' : (def.projectile === 'boulder' ? 'catapult' : 'cast'));
      return true;
    }
    return false;
  }
  scaledDmg(dmg, target) {
    if (target instanceof Building && this.team === 'enemy' && target.def.cat === 'defense') dmg *= 2 * (this.game.waveMod && this.game.waveMod.wallDmg ? this.game.waveMod.wallDmg : 1);
    if (target instanceof Building && this.def.buildingMul) dmg *= this.def.buildingMul;
    if (this.def.bonusVsLarge && target.large) dmg *= this.def.bonusVsLarge;
    if (this.def.backstab && target instanceof Unit) {
      // target facing away from us: its forward vector points away from the attacker
      const dx = this.pos.x - target.pos.x, dz = this.pos.z - target.pos.z; const d = Math.hypot(dx, dz) || 1;
      if ((dx * Math.sin(target.yaw) + dz * Math.cos(target.yaw)) / d < -0.2) dmg *= this.def.backstab;
    }
    return dmg;
  }

  takeDamage(amount, source, opts = {}) {
    if (this.immortal) { this.hp = this.maxHp; if (source && source instanceof Unit) this.lastAttacker = source; return 0; }
    if (this.dead || amount <= 0) return 0;
    if (this.shieldCharges > 0 && source) { this.shieldCharges--; this.flashT = 0.12; this.game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: this.radius + 0.6, color: 0xa080ff, dur: 0.3 }); return 0; }
    let a = amount;
    if (!opts.magic) a *= (1 - this.armor);
    if (this.def.ethereal && !opts.magic) a *= this.def.ethereal;
    if (this.def.arrowResist && opts.projectile && /arrow|bolt|sniper|ballista/.test(opts.projectile)) a *= this.def.arrowResist;
    for (const b of this.buffs) if (b.until > this.game.time && b.dmgTaken) a *= b.dmgTaken;
    if (this.isBoss && opts.magic) a *= 0.85;
    a = Math.max(0.5, a);
    this.hp -= a;
    this.flashT = 0.12;
    if (source && source instanceof Unit) this.lastAttacker = source;
    if (this.isKing && a > 0) this.game.contractEvent('kinghit');
    // the hydra sheds heads as it is hurt
    if (this.def.split && this.hp > 0) {
      const stage = Math.floor((1 - this.hp / this.maxHp) * 4);
      if (stage > (this.splitStage || 0)) { this.splitStage = stage; for (let k = 0; k < this.def.split.count; k++) { const sp = this.game.findSpawnSpot(this.pos.x + U.rand(-3, 3), this.pos.z + U.rand(-3, 3)); const s = this.game.spawnEnemy('hydraling', sp.x, sp.z, { hpMul: this.hpMul }); this.game.effects.spawn('blink', sp.x, 0.3, sp.z); } this.game.ui.toast('The Hydra sheds heads!', 'boss'); }
    }
    if (this.hp <= 0) this.die(source);
    return a;
  }
  heal(amount) {
    if (this.dead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }
  die(source) {
    if (this.dead) return;
    this.dead = true; this.hp = 0; this.deathTimer = 0;
    this.target = null; this.command = null; this.path = null;
    this.hpBar.group.visible = false; this.ring.visible = false;
    if (this.def.deathCloud) {
      const dc = this.def.deathCloud, other = this.team === 'player' ? 'enemy' : 'player', g = this.game, src = this;
      g.addZone({ x: this.pos.x, z: this.pos.z, radius: dc.radius, duration: dc.dur, tickEvery: 0.5, color: 0x80c040, opacity: 0.3,
        onTick: (zone, dt) => { for (const u of g.unitsNear(zone.x, zone.z, zone.radius, other)) if (!u.dead) u.takeDamage(dc.dps * dt, src, { magic: true }); } });
      g.effects.spawn('explosion', this.pos.x, 1, this.pos.z, { radius: dc.radius, color: 0x80c040 });
    }
    this.game.onUnitDied(this, source);
    SFX.play(this.isBoss ? 'bossdie' : (this.team === 'enemy' ? 'die' : 'allydie'));
  }

  // --------------------------------------------------------------- update
  update(dt) {
    const game = this.game;
    if (this.dead) { this.deathAnim(dt); return; }
    const time = game.time;
    if (game.replica) { this.replicaUpdate(dt); this.visualTail(dt); return; }
    // status effects
    if (this.burn && this.burn.until > time) {
      this.takeDamage(this.burn.dps * dt, this.burn.source, { magic: true });
      if (Math.random() < dt * 8) game.effects.spawn('ember', this.pos.x + U.rand(-0.3, 0.3), this.centerY, this.pos.z + U.rand(-0.3, 0.3), this.burn.poison ? { color: 0x60ff60 } : {});
      if (this.dead) return;
    }
    this.tickFlash(dt);
    if (this.attackTimer > 0) this.attackTimer -= dt;
    for (const ab of this.abilities) if (ab.timer > 0) ab.timer -= dt;
    if (this.regen > 0 && this.hp < this.maxHp) this.heal(this.regen * dt);
    if (this.breathCool > 0) this.breathCool -= dt;
    if (this.breathHeat > 0 && !(this.possessed && this.game.controls.attackHeld)) this.breathHeat = Math.max(0, this.breathHeat - dt * 0.7);
    if (this.expires && time > this.expires) { this.die(null); return; }
    this.sheltered = !this.flying && game.grid.shelteredWorld(this.pos.x, this.pos.z);

    if (this.possessedBy) {
      // another player drives this unit over the network
      this.remoteDrive(dt);
    } else {
      // decide movement
      this.moveIntent.x = 0; this.moveIntent.z = 0;
      if (!this.possessed) this.aiUpdate(dt);
      else this.possessedUpdate(dt);
      this.integrateMovement(dt);
      if (this.moving && !this.possessed) this.faceToward(this.pos.x + this.moveIntent.x, this.pos.z + this.moveIntent.z, dt, 14);
      if (this.moving) this.trackHeading(dt);
      // an enemy that wants to move but has not managed to for a while is wedged: put it on the nearest free, reachable cell
      if (this.team === 'enemy' && !this.flying) {
        if (this.moving && !(this.target && this.target !== this && this.inRange(this.target, 0))) {
          this.wedgeT = (this.wedgeT || 0) + dt;
          if (this.wedgeT > 5) { const moved = U.dist(this.pos.x, this.pos.z, this.wedgeX === undefined ? 1e9 : this.wedgeX, this.wedgeZ || 0); if (moved < 0.6) game.snapToReachable(this, true); this.wedgeX = this.pos.x; this.wedgeZ = this.pos.z; this.wedgeT = 0; }
        } else { this.wedgeT = 0; this.wedgeX = this.pos.x; this.wedgeZ = this.pos.z; }
      }
      this.separate(dt);
      if (!this.flying && !game.grid.circleFree(this.pos.x, this.pos.z, this.collisionRadius, this.team)) this.unstuck(dt);
    }
    const gy = game.groundY(this.pos.x, this.pos.z);
    if (this.flying) {
      const want = this.def.altitude + gy;
      this.pos.y += (want + Math.sin(time * 1.5) * 0.4 - this.pos.y) * Math.min(1, dt * 2);
    } else this.pos.y = gy;
    this.visualTail(dt);
  }
  trackHeading(dt) {
    const ml = Math.hypot(this.moveIntent.x, this.moveIntent.z) || 1;
    const k = Math.min(1, dt * 4);
    this.headX = (this.headX || 0) + (this.moveIntent.x / ml - (this.headX || 0)) * k;
    this.headZ = (this.headZ === undefined ? 1 : this.headZ) + (this.moveIntent.z / ml - (this.headZ === undefined ? 1 : this.headZ)) * k;
  }
  integrateMovement(dt) {
    const sp = this.effSpeed;
    let mx = this.moveIntent.x, mz = this.moveIntent.z;
    const ml = Math.hypot(mx, mz);
    this.moving = ml > 0.01 && sp > 0;
    if (!this.moving) return;
    if (ml > 1) { mx /= ml; mz /= ml; this.moveIntent.x = mx; this.moveIntent.z = mz; }
    const blocked = this.tryMove(mx * sp * dt, mz * sp * dt);
    if (blocked && !this.possessed) this.onBlocked(blocked);
  }
  remoteDrive(dt) {
    const r = this.remote;
    if (!r) { this.moving = false; return; }
    const k = Math.min(1, dt * 14);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += (r.x - this.pos.x) * k; this.pos.z += (r.z - this.pos.z) * k;
    if (Math.hypot(this.pos.x - ox, this.pos.z - oz) > dt * 0.5) { this.moveIntent.x = this.pos.x - ox; this.moveIntent.z = this.pos.z - oz; this.trackHeading(dt); this.moveIntent.x = 0; this.moveIntent.z = 0; }
    this.yaw = r.yaw; this.moving = !!r.moving;
  }
  // client-side replica: the host owns the truth; we only move the unit we possess ourselves
  replicaUpdate(dt) {
    const game = this.game;
    this.tickFlash(dt);
    for (const ab of this.abilities) if (ab.timer > 0) ab.timer -= dt;
    if (this.possessed) {
      this.moveIntent.x = 0; this.moveIntent.z = 0;
      this.possessedUpdate(dt);
      this.integrateMovement(dt);
      if (this.moving) this.trackHeading(dt);
      this.separate(dt);
      if (!this.flying && !game.grid.circleFree(this.pos.x, this.pos.z, this.collisionRadius, this.team)) this.unstuck(dt);
      if (this.localAtkT > 0) this.localAtkT -= dt;
      if (!this.flying) this.pos.y = game.groundY(this.pos.x, this.pos.z);
    } else if (this.netAttackAnim > this.attackAnim + 0.35) this.attackAnim = this.netAttackAnim;
  }
  tickFlash(dt) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      const on = this.flashT > 0;
      for (const m of this.mats) m.emissive.setHex(on ? 0x802020 : 0x000000);
    }
  }
  deathAnim(dt) {
    this.deathTimer += dt;
    const t = Math.min(1, this.deathTimer / 1.2);
    this.group.rotation.x = -t * Math.PI / 2 * 0.9;
    if (this.flying) this.pos.y = Math.max(0, this.pos.y - dt * 4);
    this.group.position.copy(this.pos);
    if (this.deathTimer > 1.8) this.group.position.y -= (this.deathTimer - 1.8) * 1.5;
    if (this.deathTimer > 3.2 && !this.game.replica) this.remove();
  }
  visualTail(dt) {
    // animation
    this.animate(dt);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    if (this.possessed && this.game.controls.firstPerson) this.group.visible = false; else this.group.visible = true;

    // health bar
    const f = Math.max(0, this.hp / this.maxHp);
    const showBar = f < 0.985 || this.selected || this.hovered;
    this.hpBar.group.visible = showBar && !this.isBoss;
    if (showBar) {
      this.hpBar.set(f);
      this.hpBar.setColor(this.team === 'player' ? (f > 0.5 ? 0x5ee07a : (f > 0.25 ? 0xf0c030 : 0xff7a4a)) : 0xff5a4a);
      // billboard: cancel the unit's rotation, face the camera
      this.hpBar.group.quaternion.copy(this.group.quaternion).invert().multiply(this.game.camera.quaternion);
      this.hpBar.setDepth(this.game.controls.mode === 'fps');
    }
    this.ring.visible = this.selected || this.hovered;
    if (this.ring.visible) { this.ring.position.set(this.pos.x, this.game.groundY(this.pos.x, this.pos.z) + 0.06, this.pos.z); this.ring.material.color.setHex(this.selected ? (this.team === 'player' ? 0x50ff80 : 0xff5050) : 0xffffff); }
    this.syncOwnerMark();
  }
  // co-op: every defender's units wear a ring in their colour at the feet; the King (shared) wears gold
  syncOwnerMark() {
    const g = this.game;
    const want = g.coop && this.team === 'player' && !this.dead;
    if (!want) { if (this.ownerMark) this.ownerMark.visible = false; return; }
    const col = g.ownerColor(this);
    if (!this.ownerMark) {
      this.ownerMark = new THREE.Mesh(new THREE.RingGeometry(this.radius + 0.12, this.radius + 0.3, 20), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
      this.ownerMark.rotation.x = -Math.PI / 2; this.ownerMark.position.y = 0.05; this.ownerMark.renderOrder = 3;
      this.group.add(this.ownerMark); this.markColor = col;
    }
    if (this.markColor !== col) { this.ownerMark.material.color.setHex(col); this.markColor = col; }
    this.ownerMark.visible = !(this.possessed && g.controls.mode === 'fps' && g.controls.controlled === this && !g.controls.thirdPerson);
  }

  onBlocked(building) {
    if (this.team === 'enemy' && building && building.hp > 0) {
      this.stuckT += 1;
      if (this.stuckT > 4 && (!this.target || this.target instanceof Unit)) { this.target = building; this.stuckT = 0; }
    }
  }

  animate(dt) {
    const p = this.parts;
    if (this.attackAnim > 0) this.attackAnim = Math.max(0, this.attackAnim - dt * 3.2);
    if (this.def.model === 'dragon') {
      const f = Math.sin(this.game.time * 6) * 0.6;
      if (p.wingL) p.wingL.rotation.z = f; if (p.wingR) p.wingR.rotation.z = -f;
      if (p.head) p.head.rotation.x = this.breathing > 0 ? 0.35 : Math.sin(this.game.time * 2) * 0.1;
      return;
    }
    if (this.def.model === 'catapult') {
      if (p.arm) p.arm.rotation.x = -0.9 + (this.attackAnim > 0.6 ? (this.attackAnim - 0.6) * 4.5 : 0) * -0.35 - (1 - Math.min(1, this.attackAnim * 1.7)) * 0;
      return;
    }
    if (p.wingL) { const f = Math.sin(this.game.time * 9 + this.id) * 0.7; p.wingL.rotation.z = f; p.wingR.rotation.z = -f; }
    if (this.moving) {
      this.animT += dt * Math.min(14, this.effSpeed * 2.2);
      const s = Math.sin(this.animT) * this.legSwing;
      if (p.legL) p.legL.rotation.x = s; if (p.legR) p.legR.rotation.x = -s;
      if (p.armL) p.armL.rotation.x = -s * 0.6;
      if (p.armR && this.attackAnim <= 0) p.armR.rotation.x = s * 0.6;
      if (p.robe) p.robe.rotation.x = Math.sin(this.animT) * 0.05;
    } else {
      if (p.legL) p.legL.rotation.x *= 0.8; if (p.legR) p.legR.rotation.x *= 0.8;
      if (p.armL) p.armL.rotation.x *= 0.8;
      if (p.armR && this.attackAnim <= 0) p.armR.rotation.x *= 0.8;
    }
    const swingArm = p.riderArmR || p.armR;
    if (this.attackAnim > 0 && swingArm) {
      const a = this.attackAnim;
      if (this.attackKind === 'melee') swingArm.rotation.x = -Math.sin(a * Math.PI) * 2.2;
      else swingArm.rotation.x = -1.3 * a;
    }
    if (p.cape) {
      const geo = p.cape.geometry, arr = geo.attributes.position.array, base = p.cape.userData.base, t = this.game.time * 3 + this.id;
      const lift = this.moving ? 0.35 : 0.08;
      for (let k = 0; k < arr.length; k += 3) { const y = base[k + 1]; const f = -y; arr[k] = base[k] + Math.sin(t + f * 4) * 0.03 * f; arr[k + 1] = y; arr[k + 2] = base[k + 2] - f * f * lift - Math.sin(t * 1.3 + f * 5) * 0.04 * f; }
      geo.attributes.position.needsUpdate = true;
    }
    if (this.spinT > 0) { this.spinT -= dt; this.yaw += dt * 14; }
    if (this.stunned) { this.group.rotation.z = Math.sin(this.game.time * 20) * 0.08; } else this.group.rotation.z = 0;
  }

  possessedUpdate(dt) { /* controls fill moveIntent */ this.game.controls.driveUnit(this, dt); }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.game.scene.remove(this.group);
    this.game.scene.remove(this.ring);
    this.group.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
  }
}

// ===========================================================================
// Building
// ===========================================================================
class Building {
  constructor(game, def, i, j, rot, cells) {
    this.id = NEXT_ID++;
    this.game = game; this.def = def; this.i = i; this.j = j; this.rot = rot || 0;
    this.team = 'player';
    this.name = def.name;
    this.cells = cells;
    this.level = 1;
    this.dead = false;
    let sx = 0, sz = 0;
    for (const c of cells) { const w = game.grid.cellToWorld(c.i, c.j); sx += w.x; sz += w.z; }
    this.pos = new THREE.Vector3(sx / cells.length, 0, sz / cells.length);
    this.owner = null;
    this.pos.y = game.groundY(this.pos.x, this.pos.z);
    const fp = (rot % 2 === 0) ? { w: def.w, d: def.d } : { w: def.d, d: def.w };
    this.radius = Math.max(fp.w, fp.d) * DATA.CELL / 2;
    this.height = def.tower ? 7 : (def.keep ? 9 : 3);
    this.timer = Math.random() * 0.5; this.target = null; this.retargetT = 0;
    this.underConstruction = false; this.progress = 1; this.paid = def.cost;
    this.build3D();
    game.applyBuildingStats(this, true);
  }
  get active() { return !this.dead && !this.underConstruction; }
  // during a wave a new building starts as a scaffold that engineers must finish
  startConstruction() {
    this.underConstruction = true; this.progress = 0;
    this.buildTime = 4 + this.def.cost / 30;
    this.hp = this.maxHp * 0.1;
    this.applyDamageTint(this.hp / this.maxHp);
    if (this.ownMats) for (const o of this.ownMats) { o.material.transparent = true; o.material.opacity = 0.45; o.material.needsUpdate = true; }
    this.game.grid.flowDirty = true;
  }
  construct(dt) {
    if (!this.underConstruction) return;
    this.progress = Math.min(1, this.progress + dt / this.buildTime);
    this.hp = Math.max(this.hp, this.maxHp * (0.1 + 0.9 * this.progress));
    if (this.ownMats) for (const o of this.ownMats) o.material.opacity = 0.45 + 0.55 * this.progress;
    if (this.progress >= 1) this.finishConstruction();
  }
  finishConstruction() {
    if (!this.underConstruction) return;
    this.underConstruction = false; this.progress = 1;
    this.hp = this.maxHp;
    if (this.ownMats) for (const o of this.ownMats) { o.material.transparent = false; o.material.opacity = 1; o.material.needsUpdate = true; }
    this.applyDamageTint(1);
    this.game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: this.radius + 1, color: 0xffb347, dur: 0.6 });
    this.game.grid.flowDirty = true;
    this.game.ui.dirty = true;
  }
  build3D() {
    if (this.group) { this.game.scene.remove(this.group); }
    this.group = Models.building(this.def, this.level);
    this.pos.y = this.game.groundY(this.pos.x, this.pos.z);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.rot * Math.PI / 2;
    this.group.userData.building = this;
    this.game.scene.add(this.group);
    if (!this.hpBar) {
      const hb = Models.healthBar(Math.max(2.2, this.radius * 1.5), 0.26);
      this.hpBar = hb; hb.group.visible = false;
      this.game.scene.add(hb.group);
      hb.group.position.set(this.pos.x, this.height + 1.0, this.pos.z);
    }
    this.ownMats = null; this.tintedFrac = 1;
    this.syncOwnerMark(true);
    if (this.underConstruction) { this.applyDamageTint(this.hp / this.maxHp); if (this.ownMats) for (const o of this.ownMats) { o.material.transparent = true; o.material.opacity = 0.45 + 0.55 * this.progress; } }
  }
  get alive() { return !this.dead; }
  // co-op: a pennant in the owner's colour on towers and buildings, a gold crown pennant on the shared castle
  syncOwnerMark(force = false) {
    const g = this.game;
    if (!g.coop || this.dead) { if (this.ownerMark) this.ownerMark.visible = false; return; }
    const wall = this.def.cat === 'defense' && !this.def.tower && !this.def.gate;
    if (wall) return;
    const col = g.ownerColor(this), shared = !this.owner;
    if (force || !this.ownerMark || this.markColor !== col || this.markShared !== shared) {
      if (this.ownerMark) this.group.remove(this.ownerMark);
      this.ownerMark = Models.ownerBanner(col, shared, !!this.def.keep);
      const fp = this.def.keep ? 4.5 : (this.def.tower ? 1.0 : Math.max(0.8, this.radius * 0.6));
      this.ownerMark.position.set(fp * 0.6, this.height + (this.def.tower ? 0.6 : 0.2), fp * 0.6);
      this.group.add(this.ownerMark); this.markColor = col; this.markShared = shared;
    }
    this.ownerMark.visible = true;
  }
  tickOwnerMark() {
    if (!this.game.coop) return;
    if (this.ownerMark && this.ownerMark.userData.cloth) this.ownerMark.userData.cloth.rotation.y = Math.sin(this.game.time * 3 + this.id) * 0.25;
    if (this.markColor !== this.game.ownerColor(this) || this.markShared !== !this.owner) this.syncOwnerMark();
  }
  get baseCost() { return this.def.cost; }
  upgradeCost() { return Math.round(this.def.cost * DATA.towerUpgrade.costMul * this.level); }
  canUpgrade() { return this.def.tower && this.def.cat !== 'wonder' && this.level < DATA.towerUpgrade.maxLevel; }
  repairCost() { return Math.round((1 - this.hp / this.maxHp) * this.def.cost * 0.5); }
  sellValue() { const paid = this.paid !== undefined ? this.paid : this.def.cost; return Math.round(paid * 0.6 * (this.hp / this.maxHp) * (1 + 0.5 * (this.level - 1))); }

  takeDamage(amount, source) {
    if (this.dead) return 0;
    if (this.def.spikes && source instanceof Unit && source.attackKind === 'melee' && !source.dead) source.takeDamage(this.def.spikes, null, { magic: true });
    this.hp -= amount;
    this.flashT = 0.1;
    if (source instanceof Unit && !source.dead) { this.lastAttacker = source; this.lastHitT = this.game.time; }
    this.game.grid.flowDirty = true; // wall cost changed
    if (this.hp <= 0) this.destroy(source);
    return amount;
  }
  heal(amount) { if (!this.dead) this.hp = Math.min(this.maxHp, this.hp + amount); }
  disposeExtras() { if (this.beamMesh) { this.game.scene.remove(this.beamMesh); this.beamMesh = null; } }
  destroy(source) {
    this.disposeExtras();
    if (this.dead) return;
    this.dead = true; this.hp = 0;
    this.game.onBuildingDestroyed(this, source);
    this.remove();
  }
  remove() {
    this.game.scene.remove(this.group);
    this.game.scene.remove(this.hpBar.group);
  }

  update(dt) {
    this.tickOwnerMark();
    const game = this.game;
    if (this.flashT > 0) { this.flashT -= dt; }
    // health bar
    const f = Math.max(0, this.hp / this.maxHp);
    const ctl = game.controls.controlled;
    const engineerView = ctl && ctl.def.repair && this.distTo(ctl) < 30;
    const show = this.underConstruction || this.selected || this.hovered || f < 0.6 || (f < 0.995 && (game.ui.showDamage || engineerView));
    this.hpBar.group.visible = show;
    if (show) {
      if (this.underConstruction) { this.hpBar.set(this.progress); this.hpBar.setColor(0x8fd3ff); }
      else { this.hpBar.set(f); this.hpBar.setColor(f > 0.5 ? 0xffb347 : (f > 0.25 ? 0xf08030 : 0xff5a4a)); }
      this.hpBar.face(game.camera.quaternion);
      this.hpBar.setDepth(game.controls.mode === 'fps');
    }
    if (!this.underConstruction && Math.abs(f - this.tintedFrac) > 0.01) this.applyDamageTint(f);
    if (this.expires && game.time > this.expires && !game.replica) { game.removeBuilding(this); game.effects.spawn('explosion', this.pos.x, 1, this.pos.z, { radius: 1.5, color: 0xa8e0ff }); return; }
    if (this.def.gate) this.updateGate(dt);
    const orb = this.group.userData.orb;
    if (orb) { orb.rotation.y += dt; orb.position.y += Math.sin(game.time * 2 + this.id) * dt * 0.3; }
    if (this.def.trap) { const plate = this.group.userData.plate; if (plate) plate.position.y += ((this.trapArmed === false ? -0.75 : 0) - plate.position.y) * Math.min(1, dt * 4); }
    if (this.underConstruction || game.replica) return;
    if (this.def.storm) this.updateStorm(dt);
    else if (this.def.beam) this.updateBeam(dt);
    else if (this.def.tower) this.updateTower(dt);
    if (this.def.guardian) this.tickGuardian(dt);
    if (this.def.cat === 'wonder') this.tickWonder(dt);
    if (this.def.heal && game.waves && game.waves.active) {
      const list = game.unitsNear(this.pos.x, this.pos.z, this.def.heal.radius, 'player');
      for (const u of list) if (u.hp < u.maxHp) u.heal(this.def.heal.hps * dt);
    }
    if (this.def.trap) this.updateTrap(dt);
  }
  // buildings darken and dirty as they lose HP so damage is visible without a bar
  applyDamageTint(f) {
    this.tintedFrac = f;
    if (f > 0.99 && !this.ownMats && !this.underConstruction) return;
    if (!this.ownMats) {
      this.ownMats = [];
      this.group.traverse(o => {
        if (!o.isMesh || !o.material || !o.material.color || o.material.isShaderMaterial) return;
        o.userData.baseColor = o.material.color.getHex();
        o.material = o.material.clone();
        this.ownMats.push(o);
      });
    }
    const k = Math.min(1, (1 - f) * 1.15) * 0.6;
    for (const o of this.ownMats) o.material.color.setHex(o.userData.baseColor).lerp(Building._soot, k);
  }
  updateGate(dt) {
    const door = this.group.userData.door;
    if (!door) return;
    const friendly = this.game.unitsNear(this.pos.x, this.pos.z, 2.6, 'player').length > 0;
    const want = friendly ? 2.9 : 0;
    door.position.y += (want - door.position.y) * Math.min(1, dt * 5);
  }
  static get _soot() { if (!Building.__soot) Building.__soot = new THREE.Color(0x26190f); return Building.__soot; }
  updateTrap(dt) {
    const t = this.def.trap, game = this.game;
    if (this.trapArmed === undefined) this.trapArmed = true;
    if (!this.trapArmed) { this.rearmT -= dt; if (this.rearmT <= 0) this.trapArmed = true; return; }
    const victims = game.unitsNear(this.pos.x, this.pos.z, t.radius, 'enemy').filter(u => !u.dead && !u.flying);
    if (!victims.length) return;
    game.areaDamage(this.pos.x, this.pos.z, t.radius + 0.4, t.dmg, 'player', this, { slow: { factor: t.slow, dur: 2.5 } });
    game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: t.radius + 0.5, color: 0xcfd6dd, dur: 0.4 });
    SFX.play('heavyhit', 0.7);
    this.trapArmed = false; this.rearmT = t.rearm;
  }
  updateTower(dt) {
    const game = this.game;
    this.timer -= dt; this.retargetT -= dt;
    if (this.retargetT <= 0 || !this.target || this.target.dead || this.distTo(this.target) > this.range + 0.5) {
      this.retargetT = 0.25;
      this.target = this.pickTarget();
    }
    const turret = this.group.userData.turret;
    if (this.target && turret) turret.rotation.y = Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z) - this.rot * Math.PI / 2;
    if (this.target && this.timer <= 0 && this.def.chain) {
      // chain lightning: instant, armour-piercing, arcs to nearby enemies
      this.timer = this.cd;
      const hit = [this.target]; let last = this.target;
      for (let k = 1; k < this.def.chain.count; k++) {
        let next = null, nd = Infinity;
        for (const u of game.unitsNear(last.pos.x, last.pos.z, this.def.chain.radius, 'enemy')) { if (u.dead || hit.includes(u)) continue; const d = last.distTo(u); if (d < nd) { nd = d; next = u; } }
        if (!next) break; hit.push(next); last = next;
      }
      let prev = { x: this.pos.x, y: this.height + 1.5, z: this.pos.z };
      const cdmg = this.dmg * this.boostNow();
      for (const u of hit) { u.takeDamage(cdmg, this, { magic: true }); game.effects.spawn('bolt', prev.x, prev.y, prev.z, { to: { x: u.pos.x, y: u.centerY, z: u.pos.z } }); game.effects.spawn('hit', u.pos.x, u.centerY, u.pos.z, { color: 0x80c0ff }); prev = { x: u.pos.x, y: u.centerY, z: u.pos.z }; }
      SFX.play('cast', 0.6);
      return;
    }
    if (this.target && this.timer <= 0) {
      this.timer = this.cd;
      const pdef = DATA.projectiles[this.def.projectile];
      game.fireProjectile({
        from: this, fromY: this.height, target: this.target, key: this.def.projectile, dmg: this.dmg * this.boostNow(), team: 'player',
        splash: pdef.splash || 0, slow: pdef.slow || null, burn: pdef.burn || null, magic: this.def.key === 'mage_tower', bonusVsLarge: this.def.bonusVsLarge || 1,
      });
      SFX.play(this.def.projectile === 'arrow' ? 'bow' : (this.def.projectile === 'ballista' ? 'ballista' : 'cast'), 0.5);
    }
  }
  // arcane spire: a meteor storm on the thickest crowd in range
  updateStorm(dt) {
    const game = this.game, st = this.def.storm;
    this.timer -= dt;
    const orbs = this.group.userData.orbiters; if (orbs) for (let k = 0; k < orbs.length; k++) { const a = game.time * 1.4 + k * 2.1; orbs[k].position.set(Math.sin(a) * 1.9, 9.5 + Math.sin(a * 1.7) * 0.6, Math.cos(a) * 1.9); orbs[k].rotation.y += dt * 2; }
    if (this.timer > 0) return;
    const list = game.unitsNear(this.pos.x, this.pos.z, this.range, 'enemy').filter(u => !u.dead);
    if (!list.length) return;
    let best = null, bs = -1;
    for (const u of list) { let s = 0; for (const v of list) if (v.distTo(u) < 7) s += v.isBoss ? 4 : 1; if (s > bs) { bs = s; best = u; } }
    this.timer = this.cd;
    for (let k = 0; k < st.count; k++) {
      const a = k / st.count * Math.PI * 2 + Math.random(), r = k === 0 ? 0 : Math.random() * st.scatter;
      const p = { x: best.pos.x + Math.sin(a) * r, z: best.pos.z + Math.cos(a) * r };
      const delay = st.delay + k * 0.22, dmg = this.dmg * this.boostNow(), owner = this;
      game.effects.spawn('ring', p.x, 0.3, p.z, { radius: st.splash, color: 0xc060ff, dur: delay });
      game.fireProjectile({ from: this, key: 'fireball', kind: 'drop', dest: p, delay, dmg, team: 'player', splash: st.splash, magic: true,
        onLand: () => { game.areaDamage(p.x, p.z, st.splash, dmg, 'player', owner, { magic: true, burn: { dps: 12, dur: 3 } }); game.effects.spawn('explosion', p.x, 1, p.z, { radius: st.splash, color: 0xb050ff }); } });
    }
    SFX.play('cast', 0.8);
  }
  // sun altar: a continuous beam on the toughest enemy in range
  updateBeam(dt) {
    const game = this.game;
    this.retargetT -= dt;
    if (this.retargetT <= 0 || !this.target || this.target.dead || this.distTo(this.target) > this.range + 0.5) {
      this.retargetT = 0.4;
      let best = null, bh = -1;
      for (const u of game.unitsNear(this.pos.x, this.pos.z, this.range, 'enemy')) { if (u.dead) continue; const s = u.hp + (u.isBoss ? 5000 : 0); if (s > bh) { bh = s; best = u; } }
      this.target = best;
    }
    const t = this.target;
    if (!this.beamMesh) {
      this.beamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      this.beamMesh.geometry.translate(0, 0.5, 0); this.beamMesh.geometry.rotateX(Math.PI / 2);   // now runs along +z from the origin
      game.scene.add(this.beamMesh);
    }
    if (!t) { this.beamMesh.visible = false; return; }
    const lens = this.group.userData.orb;
    const from = new THREE.Vector3(this.pos.x, this.pos.y + (lens ? lens.position.y : this.height), this.pos.z), to = new THREE.Vector3(t.pos.x, t.centerY, t.pos.z);
    const len = from.distanceTo(to);
    this.beamMesh.visible = true; this.beamMesh.position.copy(from); this.beamMesh.lookAt(to); this.beamMesh.scale.set(1 + 0.2 * Math.sin(game.time * 30), 1 + 0.2 * Math.sin(game.time * 30), len);
    t.takeDamage(this.def.beam.dps * this.boostNow() * dt, this, { magic: true });
    if (Math.random() < dt * 14) game.effects.spawn('ember', t.pos.x + U.rand(-0.4, 0.4), t.centerY, t.pos.z + U.rand(-0.4, 0.4), { color: 0xffe080 });
    if (t.dead) { game.effects.spawn('explosion', t.pos.x, t.centerY, t.pos.z, { radius: 1.5, color: 0xfff0a0 }); this.target = null; }
  }
  // towers hit harder near a World Tree or under a Throne
  boostNow() {
    const game = this.game;
    let m = this.boostUntil > game.time ? this.boostMul : 1;
    if (game.hasActive('throne_of_ages', this.owner)) m *= DATA.buildings.throne_of_ages.throne.towerDmg;
    return m;
  }
  tickWonder(dt) {
    const game = this.game, def = this.def;
    this.wTimer = (this.wTimer === undefined ? 4 : this.wTimer) - dt;
    if (def.treeAura) {
      const a = def.treeAura;
      for (const u of game.unitsNear(this.pos.x, this.pos.z, a.radius, 'player')) if (!u.dead && u.hp < u.maxHp && game.ownsOrSharedBy(u, this.owner)) u.heal(u.maxHp * a.regen * dt);
      for (const b of game.buildingsNear(this.pos.x, this.pos.z, a.radius)) if (b.def.tower && game.ownsOrSharedBy(b, this.owner)) { b.boostMul = a.towerDmg; b.boostUntil = game.time + 0.5; }
      const crown = this.group.userData.orb; if (crown) crown.rotation.y += dt * 0.2;
    }
    if (def.slowField) for (const u of game.unitsNear(this.pos.x, this.pos.z, def.slowField.radius, 'enemy')) if (!u.dead) { u.applySlow(def.slowField.factor, 0.4); u.addBuff({ tag: 'anchor', attackSpeedMul: 1 - def.slowField.factor, until: game.time + 0.4 }); }
    if (def.burnField) for (const u of game.unitsNear(this.pos.x, this.pos.z, def.burnField.radius, 'enemy')) if (!u.dead) { u.takeDamage(def.burnField.dps * dt, this, { magic: true }); if (Math.random() < dt * 0.5) game.effects.spawn('ember', u.pos.x, u.centerY, u.pos.z, { color: 0xff3020 }); }
    const orbs = this.group.userData.orbiters; if (orbs) for (let k = 0; k < orbs.length; k++) { const a = game.time * (0.8 + k * 0.3) + k * 2.1; orbs[k].rotation.set(a * 0.5, a, 0); }
    if (this.wTimer > 0) return;
    if (def.freeze) {
      this.wTimer = def.freeze.every;
      let n = 0; for (const u of game.unitsNear(this.pos.x, this.pos.z, def.freeze.radius, 'enemy')) if (!u.dead) { u.stunUntil = game.time + def.freeze.dur; n++; }
      game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: def.freeze.radius, color: 0x80e0ff, dur: 1.2 });
      if (n) game.ui.toast(`The Time Anchor freezes ${n} enemies`, 'good'); SFX.play('cast', 0.7);
    } else if (def.summonHost) {
      this.wTimer = def.summonHost.every;
      if (game.waves.active) {
        for (let k = 0; k < def.summonHost.count; k++) { const sp = game.findSpawnSpot(this.pos.x + Math.sin(k) * 3, this.pos.z + Math.cos(k) * 3); const u = game.spawnUnit(DATA.units[def.summonHost.unit], 'player', sp.x, sp.z, { owner: this.owner }); u.expires = game.time + def.summonHost.dur; u.post = { x: sp.x, z: sp.z }; game.effects.spawn('blink', sp.x, 0.3, sp.z); }
        game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: 6, color: 0xfff0c0, dur: 1 }); game.ui.toast('Celestial warriors answer the call!', 'good'); SFX.play('summon');
      } else this.wTimer = 2;
    } else if (def.doom) {
      this.wTimer = def.doom.every;
      if (game.waves.active) {
        let n = 0; for (const u of game.units) if (u.team === 'enemy' && !u.dead) { u.takeDamage(u.isBoss ? def.doom.bossDmg : def.doom.dmg, this, { magic: true }); n++; }
        game.effects.spawn('explosion', this.pos.x, 3, this.pos.z, { radius: 14, color: 0xff2020 }); game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: 120, color: 0xff4040, dur: 1.6 });
        game.ui.toast(`The Doomsday Engine detonates: ${n} enemies scorched`, 'boss'); SFX.play('explode');
      } else this.wTimer = 2;
    } else this.wTimer = 1;
  }
  // roost / forge: keep one guardian alive; hatch or reforge it a few waves after it falls
  tickGuardian(dt) {
    const game = this.game, gd = this.def.guardian;
    const g = this.guardian;
    if (g && !g.dead) return;
    if (g && g.dead && this.guardianLostWave === undefined) this.guardianLostWave = game.waves.number;
    if (g && g.dead && game.waves.number - this.guardianLostWave < gd.rebuild) return;
    if (g && g.dead && game.waves.active) return;   // returns between waves
    const def = DATA.units[gd.unit];
    const sp = game.findSpawnSpot(this.pos.x + this.radius + 1.5, this.pos.z);
    const u = game.spawnUnit(def, 'player', sp.x, sp.z, { owner: this.owner });
    u.post = { x: sp.x, z: sp.z }; u.guardianOf = this;
    this.guardian = u; this.guardianLostWave = undefined;
    game.effects.spawn('ring', sp.x, 0.3, sp.z, { radius: 4, color: gd.unit === 'tamedragon' ? 0xff6020 : 0xa0b0ff, dur: 1 });
    game.ui.toast(`${u.name} ${g ? 'returns' : 'joins the defence'}!`, 'good');
  }
  distTo(t) { return Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z); }
  pickTarget() {
    const list = this.game.unitsNear(this.pos.x, this.pos.z, this.range, 'enemy');
    let best = null, bestScore = Infinity;
    for (const u of list) {
      if (u.dead) continue;
      let s = this.distTo(u);
      if (this.def.minRange && s < this.def.minRange) continue;
      if (this.def.bonusVsLarge && u.large) s -= 12;
      if (u.flying) s -= 6;
      if (this.def.prefersCasters && (u.def.magic || u.def.prefersBuildings || u.isBoss)) s -= 30;
      if (this.def.key === 'frost_tower' && u.slow && u.slow.until > this.game.time) s += 8;
      if (s < bestScore) { bestScore = s; best = u; }
    }
    return best;
  }
}

// ===========================================================================
// Projectile
// ===========================================================================
class Projectile {
  constructor(game, o) {
    this.game = game; this.id = NEXT_ID++;
    this.pdef = DATA.projectiles[o.key] || DATA.projectiles.arrow;
    this.kind = o.kind || this.pdef.kind;
    this.team = o.team; this.dmg = o.dmg; this.source = o.from;
    this.splash = o.splash || 0; this.buildingDmg = o.buildingDmg || 0;
    this.slow = o.slow; this.burn = o.burn; this.magic = !!o.magic; this.bonusVsLarge = o.bonusVsLarge || 1;
    this.poison = o.poison || this.pdef.poison || null; this.hex = o.hex || null;
    this.target = o.target || null;
    this.speed = o.speed || this.pdef.speed;
    this.life = 0; this.maxLife = o.maxLife || 6;
    this.dead = false;
    this.onLand = o.onLand || null;
    this.noHit = !!o.noHit;
    const from = o.from;
    const sy = o.fromY !== undefined ? o.fromY : (from ? from.centerY + 0.2 : 1);
    this.pos = o.pos ? o.pos.clone() : new THREE.Vector3(from.pos.x, sy, from.pos.z);
    this.prev = this.pos.clone();
    this.mesh = Models.projectile(this.pdef.model, this.pdef.color);
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);

    if (this.kind === 'homing') {
      const tp = this.targetPoint();
      this.startDist = Math.max(0.1, this.pos.distanceTo(tp));
      this.travel = 0;
      this.arc = (this.pdef.arc || 0) * this.startDist;
    } else if (this.kind === 'lob') {
      const dest = o.dest || (this.target ? new THREE.Vector3(this.target.pos.x, 0, this.target.pos.z) : null);
      this.dest = dest;
      this.start = this.pos.clone();
      const d = Math.hypot(dest.x - this.pos.x, dest.z - this.pos.z);
      this.T = Math.max(0.5, d / this.speed);
      this.h = Math.max(3, d * 0.28);
      this.t = 0;
    } else if (this.kind === 'free') {
      this.vel = o.dir.clone().normalize().multiplyScalar(this.speed);
      this.gravity = o.gravity !== undefined ? o.gravity : 0;
      this.maxLife = o.maxLife || 3;
      this.hitSet = new Set();
    } else if (this.kind === 'drop') {
      this.dest = o.dest; this.T = o.delay || 1.2; this.t = 0;
      this.start = new THREE.Vector3(o.dest.x + 4, 34, o.dest.z - 3);
      this.pos.copy(this.start);
    }
  }
  targetPoint() {
    const t = this.target;
    if (!t) return this.pos.clone();
    if (t instanceof Unit) return new THREE.Vector3(t.pos.x, t.centerY, t.pos.z);
    return new THREE.Vector3(t.pos.x, Math.min(2.5, t.height * 0.5), t.pos.z);
  }
  applyHit(target, mult = 1) {
    let d = this.dmg * mult;
    if (target.large && this.bonusVsLarge > 1) d *= this.bonusVsLarge;
    if (target instanceof Building) d = this.buildingDmg ? this.buildingDmg * mult : d * (this.magic ? 1 : 0.5);
    const dealt = target.takeDamage(d, this.source, { magic: this.magic, projectile: this.key });
    if (this.source && this.source.affix && this.source.affix.vampiric && dealt > 0 && !this.source.dead) this.source.heal(dealt * this.source.affix.vampiric);
    if (target instanceof Unit) {
      if (this.slow) target.applySlow(this.slow.factor, this.slow.dur);
      if (this.burn) target.applyBurn(this.burn.dps, this.burn.dur, this.source);
      if (this.poison) target.applyPoison(this.poison.dps, this.poison.dur, this.source);
      if (this.hex) target.addBuff({ tag: 'hex', dmgMul: this.hex.dmgMul, until: this.game.time + this.hex.dur });
    }
    return dealt;
  }
  explode(x, y, z) {
    const game = this.game;
    if (this.splash > 0) {
      game.areaDamage(x, z, this.splash, this.dmg, this.team, this.source, { buildingDmg: this.buildingDmg, slow: this.slow, burn: this.burn, magic: this.magic, bonusVsLarge: this.bonusVsLarge, excludeSheltered: true });
      game.effects.spawn('explosion', x, y, z, { radius: this.splash, color: this.pdef.model === 'boulder' ? 0x8a7a60 : 0xff6020 });
      SFX.play('explode', 0.6);
    } else {
      game.effects.spawn('hit', x, y, z, { color: this.pdef.color || 0xffd090 });
    }
  }
  update(dt) {
    this.life += dt;
    if (this.life > this.maxLife) { this.kill(); return; }
    this.prev.copy(this.pos);
    if (this.kind === 'homing') {
      if (!this.target || this.target.dead) { this.kill(); return; }
      const tp = this.targetPoint();
      const dir = tp.clone().sub(this.pos);
      const dist = dir.length();
      const step = this.speed * dt;
      if (dist <= step + 0.15) {
        this.applyHit(this.target);
        if (this.splash > 0) this.explode(tp.x, tp.y, tp.z); else this.game.effects.spawn('hit', tp.x, tp.y, tp.z, { color: this.pdef.color || 0xffd090 });
        this.kill(); return;
      }
      dir.multiplyScalar(step / dist);
      this.travel += step;
      this.pos.add(dir);
      if (this.arc > 0) {
        const p = Math.min(1, this.travel / this.startDist);
        this.mesh.position.set(this.pos.x, this.pos.y + this.arc * 4 * p * (1 - p), this.pos.z);
      } else this.mesh.position.copy(this.pos);
      this.mesh.lookAt(tp.x, tp.y + (this.arc > 0 ? 0 : 0), tp.z);
    } else if (this.kind === 'lob' || this.kind === 'drop') {
      this.t += dt;
      const p = Math.min(1, this.t / this.T);
      const x = U.lerp(this.start.x, this.dest.x, p), z = U.lerp(this.start.z, this.dest.z, p);
      const y = this.kind === 'lob' ? U.lerp(this.start.y, 0.3, p) + this.h * 4 * p * (1 - p) : U.lerp(this.start.y, 0.3, p * p);
      this.pos.set(x, y, z);
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.x += dt * 4;
      if (p >= 1) {
        if (this.onLand) this.onLand(this);
        else if (!this.noHit) {
          // direct hit on whatever occupies the landing spot, then splash
          const b = this.game.grid.buildingAtWorld(x, z);
          if (b && !b.dead && this.buildingDmg) { /* handled by area damage */ }
          if (this.splash > 0) this.explode(x, 0.5, z);
          else this.game.areaDamage(x, z, 1.2, this.dmg, this.team, this.source, { buildingDmg: this.buildingDmg, magic: this.magic });
        }
        this.kill();
      }
    } else if (this.kind === 'free') {
      this.vel.y += this.gravity * dt;
      this.pos.addScaledVector(this.vel, dt);
      this.mesh.position.copy(this.pos);
      this.mesh.lookAt(this.pos.x + this.vel.x, this.pos.y + this.vel.y, this.pos.z + this.vel.z);
      // unit hits
      const other = this.team === 'player' ? 'enemy' : 'player';
      const list = this.game.unitsNear(this.pos.x, this.pos.z, 3.5, other);
      for (const u of list) {
        if (u.dead || this.hitSet.has(u)) continue;
        const hr = u.radius + 0.35;
        // distance from segment prev->pos to the unit's vertical axis segment
        const dx = u.pos.x - this.pos.x, dz = u.pos.z - this.pos.z;
        const dy = this.pos.y - u.pos.y;
        if (dx * dx + dz * dz <= hr * hr && dy > -0.2 && dy < u.height + 0.4) {
          this.applyHit(u);
          if (this.splash > 0) { this.explode(this.pos.x, this.pos.y, this.pos.z); }
          else this.game.effects.spawn('hit', this.pos.x, this.pos.y, this.pos.z, { color: 0xffd090 });
          SFX.play('hit', 0.6);
          this.kill(); return;
        }
      }
      const gy = this.game.groundY(this.pos.x, this.pos.z);
      if (this.pos.y <= gy + 0.05) {
        if (this.splash > 0) this.explode(this.pos.x, gy + 0.3, this.pos.z);
        this.kill(); return;
      }
      if (this.pos.y < 6 && this.team === 'enemy') {
        const b = this.game.grid.buildingAtWorld(this.pos.x, this.pos.z);
        if (b && !b.dead && this.game.grid.isSolidAt(this.game.grid.worldToCell(this.pos.x, this.pos.z).i, this.game.grid.worldToCell(this.pos.x, this.pos.z).j)) { this.applyHit(b); this.kill(); return; }
        const fl = this.game.grid.worldToCell(this.pos.x, this.pos.z); if (this.game.grid.flagAt(fl.i, fl.j) === CELL_ROCK) { this.kill(); return; }
      } else if (this.pos.y < 3.2 && this.team === 'player') {
        const c = this.game.grid.worldToCell(this.pos.x, this.pos.z);
        const fl = this.game.grid.flagAt(c.i, c.j);
        if (fl !== CELL_FREE && fl !== CELL_WATER && this.pos.y < 3.2) { if (this.splash > 0) this.explode(this.pos.x, this.pos.y, this.pos.z); this.kill(); return; }
      }
    }
  }
  kill() {
    if (this.dead) return;
    this.dead = true;
    this.game.scene.remove(this.mesh);
  }
}

// ===========================================================================
// Zones: timed area effects (consecrate, arrow rain, dragon breath...)
// ===========================================================================
class Zone {
  constructor(game, o) {
    this.game = game; this.id = NEXT_ID++; this.color = o.color || 0xffd040; this.x = o.x; this.z = o.z; this.radius = o.radius;
    this.until = game.time + o.duration; this.tickEvery = o.tickEvery || 0.5; this.acc = 0;
    this.onTick = o.onTick; this.dead = false; this.follow = o.follow || null;
    const gy = game.groundY(this.x, this.z);
    this.mesh = Models.disc(this.radius, o.color || 0xffd040, o.opacity || 0.3);
    this.mesh.position.set(this.x, gy + 0.08, this.z);
    game.scene.add(this.mesh);
    this.ring = Models.ring(this.radius, o.color || 0xffd040, 0.8);
    this.ring.position.set(this.x, gy + 0.09, this.z);
    game.scene.add(this.ring);
  }
  update(dt) {
    if (this.follow) { this.x = this.follow.pos.x; this.z = this.follow.pos.z; this.mesh.position.set(this.x, 0.08, this.z); this.ring.position.set(this.x, 0.09, this.z); }
    this.acc += dt;
    if (!(this.tickEvery > 0)) throw new Error('Zone tickEvery invalid');
    while (this.acc >= this.tickEvery) { this.acc -= this.tickEvery; this.onTick(this, this.tickEvery); }
    this.mesh.material.opacity = 0.2 + Math.sin(this.game.time * 8) * 0.08;
    if (this.game.time >= this.until) { this.dead = true; this.game.scene.remove(this.mesh); this.game.scene.remove(this.ring); }
  }
}

// ===========================================================================
// Effects: lightweight particles
// ===========================================================================
class Effects {
  constructor(game) {
    this.game = game; this.list = [];
    this.geoBox = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    this.geoSphere = new THREE.SphereGeometry(1, 12, 8);
    this.geoDome = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);   // explosions on the ground never sink into it
  }
  spawn(type, x, y, z, o = {}) {
    if (this.game.netHost) this.game.netHost.fx(type, x, y, z, o);
    if (this.list.length > 220) return;
    const scene = this.game.scene;
    if (type === 'ember' || type === 'flame') {
      // fire is a soft additive sprite that rises, flickers and fades, not a box
      const color = type === 'flame' ? U.choice([0xffa040, 0xffc860, 0xff7030]) : (o.color || 0xff9040);
      const s = Models.flameSprite(type === 'flame' ? 0.9 + Math.random() * 0.5 : 0.45 + Math.random() * 0.3, color);
      s.position.set(x, y, z);
      const vel = o.vel ? o.vel.clone() : new THREE.Vector3(U.rand(-0.6, 0.6), U.rand(1.2, 2.4), U.rand(-0.6, 0.6));
      scene.add(s);
      this.list.push({ mesh: s, vel, life: 0, max: type === 'flame' ? 0.7 : 0.55, grav: 1.5, shrink: true, sprite: true, base: s.scale.y });
    } else if (type === 'hit' || type === 'heal_p') {
      const n = type === 'hit' ? 6 : 1;
      for (let k = 0; k < n; k++) {
        const color = type === 'heal_p' ? 0x60ff80 : (o.color || 0xffd090);
        const m = new THREE.Mesh(this.geoBox, new THREE.MeshBasicMaterial({ color, transparent: true }));
        m.position.set(x, y, z);
        const sp = type === 'hit' ? 4 : 1.5;
        const vel = o.vel ? o.vel.clone() : new THREE.Vector3(U.rand(-sp, sp), U.rand(1, sp + 1), U.rand(-sp, sp));
        scene.add(m);
        this.list.push({ mesh: m, vel, life: 0, max: 0.5, grav: type === 'heal_p' ? 1 : -12, shrink: true });
      }
    } else if (type === 'explosion') {
      const gy = this.game.groundY(x, z);
      const onGround = y - gy < 1.6;
      const m = new THREE.Mesh(onGround ? this.geoDome : this.geoSphere, new THREE.MeshBasicMaterial({ color: o.color || 0xff6020, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.position.set(x, onGround ? gy + 0.05 : y, z); m.scale.setScalar(0.3);
      scene.add(m);
      this.list.push({ mesh: m, life: 0, max: 0.45, grow: o.radius || 2.5, ring: false });
      for (let k = 0; k < 5; k++) this.spawn('flame', x + U.rand(-1, 1) * (o.radius || 2.5) * 0.4, (onGround ? gy : y) + 0.4, z + U.rand(-1, 1) * (o.radius || 2.5) * 0.4);
      const r = Models.ring(o.radius || 2.5, o.color || 0xff8040, 0.9); r.position.set(x, 0.1, z); r.scale.setScalar(0.2); scene.add(r);
      this.list.push({ mesh: r, life: 0, max: 0.5, growRing: 1 });
      for (let k = 0; k < 8; k++) this.spawn('hit', x, y, z, { color: o.color || 0xffa040 });
    } else if (type === 'bolt') {
      const to = o.to; const dx = to.x - x, dy = to.y - y, dz = to.z - z; const len = Math.hypot(dx, dy, dz) || 0.1;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, len), new THREE.MeshBasicMaterial({ color: 0xa0d0ff, transparent: true }));
      m.position.set(x + dx / 2, y + dy / 2, z + dz / 2); m.lookAt(to.x, to.y, to.z);
      scene.add(m); this.list.push({ mesh: m, life: 0, max: 0.18, fade: true });
    } else if (type === 'ring') {
      const r = Models.ring(o.radius || 5, o.color || 0xffd040, 0.9); r.position.set(x, 0.1, z); r.scale.setScalar(0.1); scene.add(r);
      this.list.push({ mesh: r, life: 0, max: o.dur || 0.7, growRing: 1 });
    } else if (type === 'heal') {
      const r = Models.ring(o.radius || 2, 0x60ff80, 0.9); r.position.set(x, 0.1, z); scene.add(r);
      this.list.push({ mesh: r, life: 0, max: 0.8, rise: 2.5 });
      for (let k = 0; k < 6; k++) this.spawn('heal_p', x + U.rand(-1, 1), y, z + U.rand(-1, 1));
    } else if (type === 'blink') {
      const r = Models.ring(1.2, 0xa040ff, 0.9); r.position.set(x, 0.1, z); scene.add(r);
      this.list.push({ mesh: r, life: 0, max: 0.6, growRing: 2 });
    }
  }
  update(dt) {
    for (let k = this.list.length - 1; k >= 0; k--) {
      const e = this.list[k];
      e.life += dt;
      const p = e.life / e.max;
      if (e.vel) {
        e.vel.y += (e.grav || 0) * dt;
        e.mesh.position.addScaledVector(e.vel, dt);
        if (e.mesh.position.y < 0.05 && e.grav < 0) { e.mesh.position.y = 0.05; e.vel.set(0, 0, 0); }
        e.mesh.material.opacity = 1 - p;
        if (e.shrink && e.sprite) { const f = (1 - p * 0.6) * (0.9 + 0.2 * Math.sin(e.life * 40)); e.mesh.scale.set(0.5 * f * e.base, 1.0 * f * e.base, 1); }
        else if (e.shrink) e.mesh.scale.setScalar(1 - p * 0.7);
      }
      if (e.grow) { e.mesh.scale.setScalar(0.3 + e.grow * p); e.mesh.material.opacity = 0.8 * (1 - p); }
      if (e.growRing) { e.mesh.scale.setScalar(0.2 + p * e.growRing); e.mesh.material.opacity = 0.9 * (1 - p); }
      if (e.rise) { e.mesh.position.y += e.rise * dt; e.mesh.material.opacity = 0.9 * (1 - p); }
      if (e.fade) e.mesh.material.opacity = 1 - p;
      if (p >= 1) { this.game.scene.remove(e.mesh); e.mesh.material.dispose(); this.list.splice(k, 1); }
    }
  }
}
