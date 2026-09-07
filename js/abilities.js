'use strict';

// Aim: { x, z } world point. Direction abilities use the vector from the unit to the aim point.
Unit.prototype.useAbility = function (index, aim) {
  const ab = this.abilities[index];
  if (!ab || ab.timer > 0 || this.dead || this.stunned) return false;
  const game = this.game;
  aim = aim || { x: this.pos.x + Math.sin(this.yaw) * 5, z: this.pos.z + Math.cos(this.yaw) * 5 };
  let dx = aim.x - this.pos.x, dz = aim.z - this.pos.z;
  let d = Math.hypot(dx, dz);
  if (d < 0.01) { dx = Math.sin(this.yaw); dz = Math.cos(this.yaw); d = 1; }
  const dirX = dx / d, dirZ = dz / d;
  const heroMul = this.dmgMul;
  const time = game.time;
  const clampRange = (r) => { if (d > r) { return { x: this.pos.x + dirX * r, z: this.pos.z + dirZ * r }; } return { x: aim.x, z: aim.z }; };

  switch (ab.key) {
    case 'shield_bash': {
      this.yaw = Math.atan2(dirX, dirZ);
      let hits = 0;
      for (const u of game.unitsNear(this.pos.x, this.pos.z, 4.8, 'enemy')) {
        if (u.dead) continue;
        const ux = u.pos.x - this.pos.x, uz = u.pos.z - this.pos.z; const ud = Math.hypot(ux, uz) || 1;
        if ((ux * dirX + uz * dirZ) / ud > 0.35) { u.takeDamage(90 * heroMul, this); u.stun(2.5); hits++; }
      }
      game.effects.spawn('ring', this.pos.x + dirX * 2, 0.3, this.pos.z + dirZ * 2, { radius: 3, color: 0xc0d0ff, dur: 0.5 });
      this.attackAnim = 1;
      SFX.play('slam', 0.7);
      break;
    }
    case 'war_cry': {
      for (const u of game.unitsNear(this.pos.x, this.pos.z, 14, 'player')) {
        u.addBuff({ tag: 'warcry', dmgMul: 1.4, until: time + 10 });
        u.heal(u === this ? 150 : 80);
      }
      game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: 14, color: 0xffd040, dur: 0.9 });
      game.effects.spawn('heal', this.pos.x, 1, this.pos.z, { radius: 2 });
      SFX.play('warcry');
      break;
    }
    case 'multishot': {
      this.yaw = Math.atan2(dirX, dirZ);
      const pitch = (this.possessed && game.controls.firstPerson) ? game.controls.aimPitch() : 0.02;
      for (let k = -3; k <= 3; k++) {
        const a = Math.atan2(dirX, dirZ) + k * 0.12;
        const dir = new THREE.Vector3(Math.sin(a) * Math.cos(pitch), Math.sin(pitch), Math.cos(a) * Math.cos(pitch));
        game.fireProjectile({ from: this, key: 'arrow', kind: 'free', dir, dmg: this.effDmg, team: 'player', gravity: -4, speed: 48, maxLife: 2.5 });
      }
      this.attackAnim = 1;
      SFX.play('bow');
      break;
    }
    case 'arrow_rain': {
      const p = clampRange(26);
      game.addZone({
        x: p.x, z: p.z, radius: 7, duration: 3.0, tickEvery: 0.5, color: 0xb0e080, opacity: 0.2,
        onTick: (zone) => {
          game.areaDamage(zone.x, zone.z, zone.radius, 22 * heroMul, 'player', this, {});
          for (let k = 0; k < 6; k++) {
            const ax = zone.x + U.rand(-6, 6), az = zone.z + U.rand(-6, 6);
            game.fireProjectile({ from: this, key: 'arrow', kind: 'drop', dest: { x: ax, z: az }, delay: 0.45, dmg: 0, team: 'player', noHit: true, pos: new THREE.Vector3(ax, 18, az) });
          }
          SFX.play('bow', 0.4);
        },
      });
      break;
    }
    case 'meteor': {
      const p = clampRange(26);
      game.effects.spawn('ring', p.x, 0.3, p.z, { radius: 6, color: 0xff6020, dur: 1.2 });
      game.fireProjectile({
        from: this, key: 'fireball', kind: 'drop', dest: p, delay: 1.2, dmg: 260 * heroMul, team: 'player', splash: 6, magic: true,
        onLand: (pr) => {
          game.areaDamage(p.x, p.z, 6, 260 * heroMul, 'player', this, { magic: true, burn: { dps: 10, dur: 3 } });
          game.effects.spawn('explosion', p.x, 1, p.z, { radius: 6, color: 0xff5010 });
          SFX.play('explode');
        },
      });
      SFX.play('cast');
      break;
    }
    case 'flame_nova': {
      game.areaDamage(this.pos.x, this.pos.z, 8, 90 * heroMul, 'player', this, { magic: true, burn: { dps: 10, dur: 4 } });
      game.effects.spawn('explosion', this.pos.x, 1, this.pos.z, { radius: 8, color: 0xff7020 });
      SFX.play('explode');
      break;
    }
    case 'holy_light': {
      for (const u of game.unitsNear(this.pos.x, this.pos.z, 14, 'player')) { u.heal(180); game.effects.spawn('heal', u.pos.x, 1, u.pos.z, { radius: 1 }); }
      for (const b of game.buildingsNear(this.pos.x, this.pos.z, 14)) b.heal(300);
      game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: 14, color: 0x80ffa0, dur: 0.9 });
      SFX.play('heal');
      break;
    }
    case 'consecrate': {
      const p = clampRange(22);
      game.addZone({
        x: p.x, z: p.z, radius: 8, duration: 6, tickEvery: 0.5, color: 0xffe080, opacity: 0.3,
        onTick: (zone, dt) => {
          for (const u of game.unitsNear(zone.x, zone.z, zone.radius, 'enemy')) { if (!u.dead) { u.takeDamage(18 * dt * heroMul, this, { magic: true }); u.applySlow(0.45, 0.6); } }
        },
      });
      SFX.play('heal');
      break;
    }
    case 'royal_decree': {
      for (const u of game.units) if (u.team === 'player' && !u.dead && (u.isSoldier || u.isHero)) u.addBuff({ tag: 'decree', dmgMul: 1.3, speedMul: 1.25, until: time + 12 });
      game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: 20, color: 0xffd040, dur: 1.2 });
      SFX.play('warcry');
      break;
    }
    case 'whirlwind': {
      game.areaDamage(this.pos.x, this.pos.z, 4.5, 130 * heroMul, 'player', this, {});
      game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: 4.5, color: 0xffb080, dur: 0.5 });
      this.attackAnim = 1; this.spinT = 0.6;
      SFX.play('heavyhit');
      break;
    }
    case 'bloodlust': {
      this.addBuff({ tag: 'bloodlust', attackSpeedMul: 1.6, speedMul: 1.3, until: time + 8 });
      this.heal(120);
      game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: 2.5, color: 0xff3030, dur: 0.6 });
      SFX.play('warcry');
      break;
    }
    case 'shadowstep': {
      const reach = Math.min(d, 10);
      let land = null;
      for (let s = reach; s >= 1; s -= 0.5) {
        const x = this.pos.x + dirX * s, z = this.pos.z + dirZ * s;
        if (game.grid.circleFree(x, z, this.collisionRadius, 'player') && game.grid.lineClear(this.pos.x, this.pos.z, x, z, 'player')) { land = { x, z }; break; }
      }
      if (!land) return false;
      game.effects.spawn('blink', this.pos.x, 0.3, this.pos.z);
      this.pos.x = land.x; this.pos.z = land.z;
      game.effects.spawn('blink', land.x, 0.3, land.z);
      for (const u of game.unitsNear(land.x, land.z, 3, 'enemy')) if (!u.dead) u.stun(1.5);
      SFX.play('blink');
      break;
    }
    case 'smoke_bomb': {
      const p = clampRange(22);
      game.addZone({
        x: p.x, z: p.z, radius: 7, duration: 6, tickEvery: 0.5, color: 0x8a8aa0, opacity: 0.35,
        onTick: (zone, dt) => { for (const u of game.unitsNear(zone.x, zone.z, zone.radius, 'enemy')) if (!u.dead) { u.takeDamage(14 * dt * heroMul, this, { magic: true }); u.applySlow(0.5, 0.6); } },
      });
      game.effects.spawn('explosion', p.x, 1, p.z, { radius: 5, color: 0x9090a8 });
      SFX.play('cast');
      break;
    }
    case 'frost_nova': {
      for (const u of game.unitsNear(this.pos.x, this.pos.z, 7, 'enemy')) if (!u.dead) { u.takeDamage(70 * heroMul, this, { magic: true }); u.stun(2); u.applySlow(0.5, 4); }
      game.effects.spawn('explosion', this.pos.x, 1, this.pos.z, { radius: 7, color: 0xa0e0ff });
      SFX.play('cast');
      break;
    }
    case 'ice_wall': {
      const p = clampRange(20);
      const c = game.grid.worldToCell(p.x, p.z);
      // five cells across the line of aim
      const along = Math.abs(dirX) > Math.abs(dirZ) ? { i: 0, j: 1 } : { i: 1, j: 0 };
      let placed = 0;
      for (let k = -2; k <= 2; k++) {
        const b = game.placeBuilding('icewall', c.i + along.i * k, c.j + along.j * k, 0, true, true);
        if (b) { b.expires = time + 14; placed++; game.effects.spawn('ring', b.pos.x, 0.3, b.pos.z, { radius: 1.2, color: 0xa0e0ff, dur: 0.5 }); }
      }
      if (!placed) { game.ui.toast('No room for an ice wall there', 'error'); return false; }
      SFX.play('cast');
      break;
    }
    case 'call_pack': {
      for (let k = 0; k < 3; k++) {
        const a = this.yaw + Math.PI + (k - 1) * 0.9;
        const sp = game.findSpawnSpot(this.pos.x + Math.sin(a) * 2, this.pos.z + Math.cos(a) * 2);
        const w = game.spawnUnit(DATA.units.wolf, 'player', sp.x, sp.z, { dmgMul: heroMul });
        w.expires = time + 20; w.owner = this; w.post = { x: sp.x, z: sp.z };
        w.command = { type: 'follow', leader: this, slot: k };
        game.effects.spawn('blink', sp.x, 0.3, sp.z);
      }
      SFX.play('summon');
      break;
    }
    case 'war_horn': {
      for (const u of game.unitsNear(this.pos.x, this.pos.z, 20, 'player')) if (u.isSoldier) u.addBuff({ tag: 'warhorn', speedMul: 1.3, dmgTaken: 0.8, until: time + 10 });
      game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: 20, color: 0xffd040, dur: 1.0 });
      SFX.play('horn');
      break;
    }
    case 'rally': {
      game.commandFollow(game.units.filter(u => u.isSoldier && !u.dead), this);
      game.effects.spawn('ring', this.pos.x, 0.3, this.pos.z, { radius: 12, color: 0xffffff, dur: 0.8 });
      SFX.play('horn', 0.5);
      break;
    }
    default: return false;
  }
  ab.timer = ab.def.cd * (this.def.abilityCdMul || 1);
  return true;
};
