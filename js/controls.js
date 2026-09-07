'use strict';

class Controls {
  constructor(game) {
    this.game = game;
    this.canvas = game.renderer.domElement;
    this.camera = game.camera;
    this.mode = 'rts';
    this.firstPerson = true;
    this.controlled = null;
    this.selected = new Set();
    this.selectedBuilding = null;
    this.hovered = null; this.hoveredBuilding = null;
    this.keys = {};
    this.focus = new THREE.Vector3(0, 0, 8);
    this.camYaw = 0; this.camPitch = 0.95; this.camDist = 52;
    this.fpsYaw = 0; this.fpsPitch = 0;
    this.lookLocked = false;
    this.sensMul = 1; this.rawInput = true;
    try { const v = parseFloat(localStorage.getItem('crownhold_sens')); if (v >= 0.1 && v <= 4) this.sensMul = v; const r = localStorage.getItem('crownhold_raw'); if (r === '0') this.rawInput = false; } catch (e) {}
    this.buildDef = null; this.buildRot = 0; this.ghost = null; this.ghostAnchor = null; this.ghostOk = false;
    this.dragStart = null; this.dragCells = []; this.dragGhosts = [];
    this.selStart = null; this.rightDown = null; this.middleDown = null;
    this.mouse = { x: 0, y: 0 };
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.controlGroups = {};
    this.viewWeapon = null;
    this.attackHeld = false;
    this.squad = null; // soldiers commanded from first person (null = all)
    this.tmpV = new THREE.Vector3();
    this.bind();
  }

  // ------------------------------------------------------------------ input binding
  bind() {
    const c = this.canvas;
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.attackHeld = false; });
    c.addEventListener('mousedown', (e) => this.onMouseDown(e));
    c.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'fps' || this.lookLocked || e.pointerType !== 'mouse') return;
      try { c.setPointerCapture(e.pointerId); this.captured = e.pointerId; } catch (err) { this.captured = null; }
    });
    c.addEventListener('pointermove', (e) => {
      if (this.captured === null || this.captured === undefined || e.pointerId !== this.captured || this.mode !== 'fps') return;
      this.applyLook(e.movementX || 0, e.movementY || 0);
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouseInside = true; this.exitPush = null;
      if (this.rightDrag) this.rightDrag.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
    });
    const endCapture = (e) => { if (this.captured !== null && this.captured !== undefined && (!e || e.pointerId === this.captured)) { try { c.releasePointerCapture(this.captured); } catch (err) {} this.captured = null; } };
    c.addEventListener('pointerup', endCapture);
    c.addEventListener('pointercancel', endCapture);
    c.addEventListener('lostpointercapture', () => { this.captured = null; });
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.onWheel(e); }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === c;
      const was = this.lookLocked;
      this.lookLocked = locked;
      if (locked) { this.lockUnavailable = false; this.lockedAt = performance.now(); }
      else if (was && this.mode === 'fps' && performance.now() - this.enteredAt > 400) this.exitControl(); // browser released it (Esc)
      this.game.ui.onLockChanged();
    });
    document.addEventListener('pointerlockerror', () => { this.lockUnavailable = true; this.lockErrorEvent = true; this.game.ui.onLockChanged(); });
    document.addEventListener('mouseout', (e) => {
      if (e.relatedTarget) return;
      this.mouseInside = false;
      // remember which edge the cursor left through so the view keeps turning that way
      const r = this.canvas.getBoundingClientRect();
      const nx = (this.mouse.x - r.left) / r.width, ny = (this.mouse.y - r.top) / r.height;
      this.exitPush = { x: nx < 0.15 ? -1 : (nx > 0.85 ? 1 : 0), y: ny < 0.15 ? -1 : (ny > 0.85 ? 1 : 0) };
    });
    this.mouseInside = false;
    window.addEventListener('resize', () => this.game.onResize());
  }

  isTyping(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); }

  onKeyDown(e) {
    if (this.isTyping(e)) return;
    const game = this.game;
    this.keys[e.code] = true;
    if (!game.started) return;
    const k = e.code;
    if (k === 'Tab' || (k === 'KeyC' && this.mode === 'fps')) { e.preventDefault(); if (e.repeat) return; if (this.mode === 'fps') this.exitControl(); else this.controlSelected(); return; }
    if (k === 'Escape') {
      if (this.buildDef) { this.cancelBuild(); return; }
      if (this.mode === 'fps') { this.exitControl(); return; }
      this.clearSelection(); game.ui.closePanels(); return;
    }
    if (k === 'KeyP') { game.togglePause(); return; }
    if (k === 'KeyM') { SFX.toggleMute(); game.ui.toast(SFX.muted ? 'Sound off' : 'Sound on'); return; }
    if (k === 'Minus') { game.setTimeScale(1); return; }
    if (k === 'Equal') { game.setTimeScale(game.timeScale >= 2 ? 1 : 2); return; }
    if (k === 'KeyN' || (k === 'Space' && this.mode === 'rts')) { e.preventDefault(); game.tryStartWave(); return; }
    if (k === 'F1' || k === 'Slash') { e.preventDefault(); game.ui.toggleHelp(); return; }
    if (k === 'KeyO' && !e.repeat) { game.ui.toggleSettings(); return; }

    if (this.mode === 'fps') {
      const u = this.controlled;
      if (k === 'KeyQ') this.useAbility(0);
      else if (k === 'KeyE') this.useAbility(1);
      else if (k === 'KeyF') this.squadFollow();
      else if (k === 'KeyG') this.squadAttackPoint();
      else if (k === 'KeyH') this.squadHold();
      else if (k === 'KeyV') this.squadDefendKing();
      else if (k === 'KeyT' && !e.repeat) { this.firstPerson = !this.firstPerson; game.ui.toast(this.firstPerson ? 'First person' : 'Third person'); }
      else if (k === 'BracketLeft' || k === 'BracketRight') this.adjustSensitivity(k === 'BracketRight' ? 1.2 : 1 / 1.2);
      return;
    }
    // ---- RTS mode
    if (k === 'KeyR') { if (this.buildDef) { this.buildRot = (this.buildRot + 1) % 4; this.updateGhost(); } else if (!e.repeat) game.repairAll(); return; }
    if (k === 'KeyB') { game.ui.togglePanel('build'); return; }
    if (k === 'KeyC') { if (!e.repeat) this.controlSelected(); return; }
    if (k === 'KeyH') { this.holdSelected(); return; }
    if (k === 'KeyF') { this.followSelected(); return; }
    if (k === 'Delete' || k === 'Backspace') { if (this.selectedBuilding) game.sellBuilding(this.selectedBuilding); return; }
    if (k === 'KeyA' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.selectAllSoldiers(); return; }
    if (k === 'KeyK') { this.selectKing(); return; }
    if (k === 'KeyJ') { this.selectHeroes(); return; }
    if (/^Digit[1-9]$/.test(k)) {
      const n = k.slice(5);
      if (e.ctrlKey || e.metaKey || e.shiftKey) { this.controlGroups[n] = new Set([...this.selected]); game.ui.toast(`Control group ${n} set (${this.selected.size} units)`); }
      else if (this.controlGroups[n]) { this.setSelection([...this.controlGroups[n]].filter(u => !u.dead)); if (e.repeat === false && this.lastGroupKey === n && performance.now() - this.lastGroupT < 400) this.focusOnSelection(); this.lastGroupKey = n; this.lastGroupT = performance.now(); }
      e.preventDefault();
      return;
    }
  }

  onMouseDown(e) {
    const game = this.game;
    if (!game.started) return;
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    if (this.mode === 'fps') {
      if (!this.lookLocked) this.requestLock();
      if (e.button === 0) this.attackHeld = true;
      if (e.button === 2) this.rightDrag = { moved: 0 };
      return;
    }
    if (e.button === 0) {
      if (this.buildDef) {
        if (this.buildDef.drag) { this.dragStart = this.cellUnderMouse(); this.dragCells = []; }
        else this.placeAtGhost();
        return;
      }
      this.selStart = { x: e.clientX, y: e.clientY };
    } else if (e.button === 2) {
      this.rightDown = { x: e.clientX, y: e.clientY, moved: false };
    } else if (e.button === 1) {
      e.preventDefault();
      this.middleDown = { x: e.clientX, y: e.clientY };
    }
  }

  onMouseMove(e) {
    const dx = e.movementX || 0, dy = e.movementY || 0;
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouseMoved = true;
    if (this.mode === 'fps') {
      // relative mouse motion drives the view, captured or not. Without capture the (hidden) cursor can reach
      // the edge of the frame; update() keeps turning that way until it comes back
      this.mouseInside = true; this.exitPush = null;
      if (this.captured !== null && this.captured !== undefined) return; // pointermove already applied this motion
      this.applyLook(dx, dy);
      if (this.rightDrag) this.rightDrag.moved += Math.abs(dx) + Math.abs(dy);
      return;
    }
    if (this.middleDown) {
      const s = this.camDist * 0.0016;
      const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
      this.focus.x += (-fz * dx - fx * dy) * s; this.focus.z += (fx * dx - fz * dy) * s;
      this.clampFocus();
      return;
    }
    if (this.rightDown) {
      if (Math.abs(e.clientX - this.rightDown.x) + Math.abs(e.clientY - this.rightDown.y) > 6) this.rightDown.moved = true;
      if (this.rightDown.moved) {
        this.camYaw -= dx * 0.005; this.camPitch = U.clamp(this.camPitch + dy * 0.004, 0.35, 1.5);
      }
      return;
    }
    if (this.buildDef) { this.updateGhost(); if (this.dragStart) this.updateDrag(); return; }
    if (this.selStart) {
      this.game.ui.showSelBox(this.selStart, this.mouse);
      return;
    }
    // hover
    const h = this.pickUnit(e.clientX, e.clientY);
    if (h !== this.hovered) { if (this.hovered) this.hovered.hovered = false; this.hovered = h; if (h) h.hovered = true; }
    const hb = h ? null : this.pickBuilding(e.clientX, e.clientY);
    if (hb !== this.hoveredBuilding) { if (this.hoveredBuilding) this.hoveredBuilding.hovered = false; this.hoveredBuilding = hb; if (hb) hb.hovered = true; }
  }

  onMouseUp(e) {
    const game = this.game;
    if (!game.started) return;
    if (this.mode === 'fps') {
      if (e.button === 0) this.attackHeld = false;
      if (e.button === 2) { const rd = this.rightDrag; this.rightDrag = null; if (!rd || rd.moved < 12) this.squadAttackPoint(); }
      return;
    }
    if (e.button === 1) { this.middleDown = null; return; }
    if (e.button === 0) {
      if (this.buildDef && this.dragStart) { this.commitDrag(); return; }
      if (!this.selStart) return;
      const s = this.selStart; this.selStart = null;
      game.ui.hideSelBox();
      const moved = Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y);
      if (moved > 8) { this.boxSelect(s, { x: e.clientX, y: e.clientY }, e.shiftKey); return; }
      this.clickSelect(e.clientX, e.clientY, e.shiftKey);
      return;
    }
    if (e.button === 2) {
      const rd = this.rightDown; this.rightDown = null;
      if (!rd || rd.moved) return;
      if (this.buildDef) { this.cancelBuild(); return; }
      this.issueCommandAt(e.clientX, e.clientY);
    }
  }

  onWheel(e) {
    if (this.mode === 'fps') return;
    this.camDist = U.clamp(this.camDist * (1 + Math.sign(e.deltaY) * 0.12), 12, 230);
  }

  // ------------------------------------------------------------------ picking
  rayFromScreen(x, y) {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((x - r.left) / r.width) * 2 - 1, ny = -((y - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    return this.raycaster.ray;
  }
  screenToGround(x, y) {
    const ray = this.rayFromScreen(x, y);
    const p = new THREE.Vector3();
    if (ray.intersectPlane(this.groundPlane, p)) return p;
    return null;
  }
  pickUnit(x, y, includeDead = false) {
    const ray = this.rayFromScreen(x, y);
    let best = null, bestT = Infinity;
    const v = this.tmpV;
    for (const u of this.game.units) {
      if (u.dead || (u.possessed && this.mode === 'fps')) continue;
      v.set(u.pos.x, u.centerY, u.pos.z);
      const r = Math.max(u.radius + 0.35, u.height * 0.5);
      const d = ray.distanceSqToPoint(v);
      if (d < r * r) {
        const t = v.clone().sub(ray.origin).dot(ray.direction);
        if (t < bestT) { bestT = t; best = u; }
      }
    }
    return best;
  }
  pickBuilding(x, y) {
    const ray = this.rayFromScreen(x, y);
    let best = null, bestT = Infinity;
    const box = new THREE.Box3();
    for (const b of this.game.buildings) {
      const hw = b.radius, hh = b.height;
      box.min.set(b.pos.x - hw, 0, b.pos.z - hw); box.max.set(b.pos.x + hw, hh, b.pos.z + hw);
      const p = ray.intersectBox(box, new THREE.Vector3());
      if (p) { const t = p.distanceTo(ray.origin); if (t < bestT) { bestT = t; best = b; } }
    }
    return best;
  }
  projectToScreen(pos) {
    const v = pos.clone().project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width + r.left, y: (-v.y + 1) / 2 * r.height + r.top, z: v.z };
  }

  // ------------------------------------------------------------------ selection
  clearSelection() {
    for (const u of this.selected) u.selected = false;
    this.selected.clear();
    if (this.selectedBuilding) this.selectedBuilding.selected = false;
    this.selectedBuilding = null;
    if (!this.buildDef) this.game.showRange(null);
    this.game.ui.onSelectionChanged();
  }
  setSelection(units) {
    this.clearSelection();
    for (const u of units) { if (!u.dead) { u.selected = true; this.selected.add(u); } }
    this.game.ui.onSelectionChanged();
  }
  addToSelection(u) { if (!u.dead) { u.selected = true; this.selected.add(u); this.game.ui.onSelectionChanged(); } }
  clickSelect(x, y, additive) {
    const u = this.pickUnit(x, y);
    if (u) {
      if (additive && u.team === 'player') { if (this.selected.has(u)) { u.selected = false; this.selected.delete(u); this.game.ui.onSelectionChanged(); } else this.addToSelection(u); }
      else this.setSelection([u]);
      return;
    }
    const b = this.pickBuilding(x, y);
    if (b) { this.clearSelection(); this.selectedBuilding = b; b.selected = true; this.game.ui.onSelectionChanged(); return; }
    if (!additive) this.clearSelection();
  }
  boxSelect(a, b, additive) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const found = [];
    for (const u of this.game.units) {
      if (u.dead || u.team !== 'player' || u.possessed) continue;
      const p = this.projectToScreen(new THREE.Vector3(u.pos.x, u.centerY, u.pos.z));
      if (p.z < 1 && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) found.push(u);
    }
    if (!found.length && !additive) { this.clearSelection(); return; }
    if (additive) for (const u of found) this.addToSelection(u); else this.setSelection(found);
  }
  selectAllSoldiers() { const lp = this.game.localPlayer; this.setSelection(this.game.units.filter(u => u.isSoldier && !u.dead && !u.possessed && (!u.owner || u.owner === lp))); }
  selectKing() { if (this.game.king && !this.game.king.dead) { this.setSelection([this.game.king]); this.focusOnSelection(); } }
  selectHeroes() { const lp = this.game.localPlayer; const hs = this.game.units.filter(u => u.isHero && !u.dead && (!u.owner || u.owner === lp)); if (hs.length) { this.setSelection(hs); this.focusOnSelection(); } }
  focusOnSelection() {
    const list = [...this.selected];
    if (!list.length) return;
    let x = 0, z = 0; for (const u of list) { x += u.pos.x; z += u.pos.z; }
    this.focus.set(x / list.length, 0, z / list.length);
  }
  selectedUnits() { return [...this.selected].filter(u => !u.dead && u.team === 'player' && !u.possessed && (!u.owner || u.owner === this.game.localPlayer)); }

  // ------------------------------------------------------------------ commands (RTS)
  issueCommandAt(x, y) {
    const game = this.game;
    const units = this.selectedUnits();
    if (!units.length) return;
    const t = this.pickUnit(x, y);
    if (t && t.team === 'enemy') { game.commandAttack(units, t); game.ui.flashMarker(t.pos.x, t.pos.z, 0xff5050); return; }
    if (t && t.team === 'player' && !units.includes(t)) { game.commandFollow(units, t); game.ui.flashMarker(t.pos.x, t.pos.z, 0x50a0ff); return; }
    const g = this.screenToGround(x, y);
    if (!g) return;
    game.commandMove(units, g.x, g.z, 'attackmove');
    game.ui.flashMarker(g.x, g.z, 0x50ff80);
    SFX.play('click', 0.4);
  }
  holdSelected() { const us = this.selectedUnits(); if (us.length) { this.game.commandHold(us); this.game.ui.toast(`${us.length} unit(s) holding position`); } }
  followSelected() {
    const us = this.selectedUnits();
    if (!us.length) return;
    let leader = this.hovered && this.hovered.team === 'player' && !us.includes(this.hovered) ? this.hovered : null;
    if (!leader) {
      const heroes = this.game.units.filter(u => (u.isHero || u.isKing) && !u.dead && !us.includes(u));
      let best = null, bd = Infinity;
      for (const h of heroes) { const d = U.dist(h.pos.x, h.pos.z, us[0].pos.x, us[0].pos.z); if (d < bd) { bd = d; best = h; } }
      leader = best;
    }
    if (leader) { this.game.commandFollow(us, leader); this.game.ui.toast(`Following ${leader.name}`); }
  }

  // ------------------------------------------------------------------ possession
  controlSelected() {
    const list = [...this.selected].filter(u => !u.dead && u.team === 'player' && (!u.owner || u.owner === this.game.localPlayer));
    if (!list.length) { this.game.ui.toast('Select one of your own units first (King, hero or soldier)'); return; }
    this.enterControl(list[0]);
  }
  enterControl(unit) {
    if (!unit || unit.dead || unit.team !== 'player') return;
    if (unit.possessedBy && !(this.game.replica && unit.possessedBy === this.game.net.myId)) { this.game.ui.toast('Another player is controlling that unit', 'error'); return; }
    if (unit.owner && unit.owner !== this.game.localPlayer) { this.game.ui.toast(`${unit.name} belongs to ${this.game.playerName(unit.owner)}`, 'error'); return; }
    if (this.game.replica) this.game.net.send({ t: 'possess', id: unit.id });
    if (this.buildDef) this.cancelBuild();
    // soldiers selected alongside become the squad for first-person commands
    const others = [...this.selected].filter(u => u !== unit && u.isSoldier && !u.dead);
    this.squad = others.length ? new Set(others) : null;
    this.clearSelection();
    this.controlled = unit;
    unit.possessed = true; unit.command = null; unit.target = null; unit.path = null; unit.moveIntent.x = 0; unit.moveIntent.z = 0;
    this.mode = 'fps';
    this.fpsYaw = unit.yaw; this.fpsPitch = -0.05;
    this.attackHeld = false;
    this.enteredAt = performance.now();
    this.lastLockTry = 0;
    this.requestLock();
    this.canvas.classList.add('fps');
    this.reportLockDiag();
    this.attachViewWeapon(unit);
    this.game.ui.onModeChanged();
    this.game.ui.toast(`You are now ${unit.name}. Tab or Esc to return to the overview.`);
    SFX.play('click');
  }
  exitControl() {
    const u = this.controlled;
    if (!u) return;
    if (this.game.replica && this.game.net) this.game.net.send({ t: 'release', id: u.id });
    u.possessed = false;
    u.post = { x: u.pos.x, z: u.pos.z };
    u.group.visible = true;
    this.controlled = null;
    this.mode = 'rts';
    this.attackHeld = false;
    this.canvas.classList.remove('fps');
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.focus.set(u.pos.x, 0, u.pos.z);
    this.camYaw = this.fpsYaw;
    this.detachViewWeapon();
    if (!u.dead) this.setSelection([u]);
    this.game.ui.onModeChanged();
  }
  // writes a small diagnostic record to the artifact database (only when the page runs inside the claude.ai viewer)
  reportLockDiag() {
    if (this.diagSent || !window.claude || typeof window.claude.use !== 'function') return;
    this.diagSent = true;
    const gather = (phase) => {
      let features = null; try { features = document.featurePolicy ? document.featurePolicy.allowedFeatures() : null; } catch (e) { features = 'err:' + e.message; }
      return { phase, at: new Date().toISOString(), ua: navigator.userAgent, framed: window.self !== window.top, locked: !!this.lookLocked, lockUnavailable: !!this.lockUnavailable, lockError: this.lockError || null, lockErrorMsg: this.lockErrorMsg || null, errorEvent: !!this.lockErrorEvent, fullscreenEnabled: !!document.fullscreenEnabled, features, hasPointerLockApi: !!(this.canvas.requestPointerLock), width: window.innerWidth, height: window.innerHeight };
    };
    window.claude.use('db').then((db) => {
      if (!db) return;
      const write = (phase) => db.doc('diag/pointerlock').set(gather(phase)).catch(() => {});
      write('enter');
      setTimeout(() => write('after2s'), 2000);
      setTimeout(() => write('after8s'), 8000);
    }).catch(() => {});
  }
  requestLock() {
    const c = this.canvas;
    const now = performance.now();
    if (this.lastLockTry && now - this.lastLockTry < 350) return; // browsers reject rapid re-requests
    this.lastLockTry = now;
    const fn = c.requestPointerLock || c.webkitRequestPointerLock || c.mozRequestPointerLock;
    if (!fn) { this.lockUnavailable = true; this.game.ui.onLockChanged(); return; }
    const fail = (err) => { this.lockError = err && err.name; this.lockErrorMsg = err && err.message; if (err && (err.name === 'SecurityError' || err.name === 'NotAllowedError' || err.name === 'NotSupportedError')) this.lockUnavailable = true; this.game.ui.onLockChanged(); };
    try {
      // raw mouse input (no OS acceleration) where supported and wanted, like a native shooter; otherwise the plain request
      const p = this.rawInput ? fn.call(c, { unadjustedMovement: true }) : fn.call(c);
      if (p && p.catch) p.catch((err) => {
        if (err && err.name === 'NotSupportedError') { try { const p2 = fn.call(c); if (p2 && p2.catch) p2.catch(fail); } catch (e2) { fail(e2); } }
        else fail(err);
      });
    } catch (err) { try { const p2 = fn.call(c); if (p2 && p2.catch) p2.catch(fail); } catch (e2) { fail(e2); } }
  }
  attachViewWeapon(unit) {
    this.detachViewWeapon();
    if (unit.def.noViewWeapon) return;   // a dragon has no hands
    const kind = unit.def.weapon || 'sword';
    this.viewWeapon = Models.viewWeapon(kind);
    this.camera.add(this.viewWeapon);
  }
  detachViewWeapon() { if (this.viewWeapon) { this.camera.remove(this.viewWeapon); this.viewWeapon = null; } }

  // called by Unit.possessedUpdate each frame
  driveUnit(u, dt) {
    const k = this.keys;
    let f = 0, s = 0;
    if (k.KeyW) f += 1; if (k.KeyS) f -= 1;
    if (k.KeyD) s += 1; if (k.KeyA) s -= 1;
    const y = this.fpsYaw;
    const fx = Math.sin(y), fz = Math.cos(y), rx = -Math.cos(y), rz = Math.sin(y);
    let mx = fx * f + rx * s, mz = fz * f + rz * s;
    const l = Math.hypot(mx, mz);
    if (l > 0) { mx /= l; mz /= l; }
    const sprint = (k.ShiftLeft || k.ShiftRight) ? 1.35 : 1;
    u.moveIntent.x = mx * sprint; u.moveIntent.z = mz * sprint;
    u.yaw = y;
  }

  aimDir() {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    return d;
  }
  aimPitch() { return this.fpsPitch; }
  applyLook(dx, dy) {
    if (this.invertY) dy = -dy;
    const sens = 0.0022 * this.sensMul;
    if (Math.abs(dx) < 400 && Math.abs(dy) < 400) { this.fpsYaw -= dx * sens; this.fpsPitch = U.clamp(this.fpsPitch - dy * sens, -1.35, 1.35); }
  }
  setSensitivity(v, quiet) {
    this.sensMul = U.clamp(v, 0.1, 4);
    try { localStorage.setItem('crownhold_sens', String(this.sensMul)); } catch (e) {}
    this.game.ui.refreshSettings();
    if (!quiet) this.game.ui.toast(`Mouse sensitivity ${Math.round(this.sensMul * 100)}%  ( [ lower, ] higher )`);
  }
  adjustSensitivity(mul) { this.setSensitivity(this.sensMul * mul); }
  setRawInput(on) {
    this.rawInput = !!on;
    try { localStorage.setItem('crownhold_raw', on ? '1' : '0'); } catch (e) {}
    this.game.ui.refreshSettings();
    // re-capture so the new mode applies right away
    if (this.lookLocked && document.pointerLockElement === this.canvas) { document.exitPointerLock(); this.lastLockTry = 0; setTimeout(() => { if (this.mode === 'fps') this.requestLock(); }, 400); }
  }
  popOut() {
    let w = null;
    try { w = window.open(location.href, '_blank'); } catch (e) { w = null; }
    if (!w) this.game.ui.toast('This window does not allow opening a new one', 'error');
  }
  toggleFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    const p = el.requestFullscreen ? el.requestFullscreen() : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null);
    if (p && p.catch) p.catch(() => this.game.ui.toast('Fullscreen is not allowed in this window', 'error'));
  }
  aimPoint() {
    const u = this.controlled;
    const eye = new THREE.Vector3(u.pos.x, u.pos.y + u.eyeHeight, u.pos.z);
    const d = this.aimDir();
    const ray = new THREE.Ray(eye, d);
    const p = new THREE.Vector3();
    if (d.y < -0.02 && ray.intersectPlane(this.groundPlane, p) && p.distanceTo(eye) < 45) return p;
    const far = eye.clone().addScaledVector(d, 28); far.y = 0;
    return far;
  }
  aimTarget() {
    // enemy under the crosshair
    const u = this.controlled;
    const eye = new THREE.Vector3(u.pos.x, u.pos.y + u.eyeHeight, u.pos.z);
    const ray = new THREE.Ray(eye, this.aimDir());
    let best = null, bestT = Infinity;
    for (const e of this.game.units) {
      if (e.dead || e.team === u.team) continue;
      this.tmpV.set(e.pos.x, e.centerY, e.pos.z);
      const r = Math.max(e.radius + 0.4, e.height * 0.5);
      if (ray.distanceSqToPoint(this.tmpV) < r * r) { const t = this.tmpV.clone().sub(eye).dot(ray.direction); if (t > 0 && t < bestT) { bestT = t; best = e; } }
    }
    return best;
  }
  useAbility(i) {
    const u = this.controlled;
    if (!u || !u.abilities[i]) return;
    const ab = u.abilities[i];
    if (ab.timer > 0) { this.game.ui.toast(`${ab.def.name} ready in ${ab.timer.toFixed(1)}s`); return; }
    const p = this.aimPoint();
    if (this.game.replica) { this.game.net.send({ t: 'abil', id: u.id, i, x: +p.x.toFixed(2), z: +p.z.toFixed(2) }); ab.timer = ab.def.cd; this.animateViewWeapon(1.0); return; }
    if (u.useAbility(i, { x: p.x, z: p.z })) this.animateViewWeapon(1.0);
  }
  playerAttack(u, dt, aim = null) {
    const game = this.game;
    const ad = aim ? aim.dir : this.aimDir();
    const hl = Math.hypot(ad.x, ad.z);
    const fx = hl > 0.05 ? ad.x / hl : Math.sin(u.yaw), fz = hl > 0.05 ? ad.z / hl : Math.cos(u.yaw);
    if (game.replica) {
      // ask the host to swing / shoot; keep a local cooldown so the view model animates at the right cadence
      if (u.localAtkT > 0) return;
      u.localAtkT = u.def.repair ? 0.25 : u.cd;
      const d = ad;
      game.net.send({ t: 'atk', id: u.id, dir: [+d.x.toFixed(3), +d.y.toFixed(3), +d.z.toFixed(3)], pitch: +this.aimPitch().toFixed(3) });
      u.attackAnim = 1; this.animateViewWeapon(0.8);
      return;
    }
    if (u.def.repair) {
      // repair the damaged building you are aiming at; otherwise a feeble hammer swing at whatever is in reach
      let best = null, bd = Infinity;
      for (const b of game.buildingsNear(u.pos.x, u.pos.z, u.def.repair.range + 1)) {
        if (!b.underConstruction && b.hp >= b.maxHp - 0.5) continue;
        const dx = b.pos.x - u.pos.x, dz = b.pos.z - u.pos.z; const d = Math.hypot(dx, dz) || 1;
        if ((dx * fx + dz * fz) / d < 0.3 || u.gapTo(b) > u.def.repair.range) continue;
        if (d < bd) { bd = d; best = b; }
      }
      if (best) { u.repairTick(best, aim ? 0.25 : dt); if (u.attackAnim >= 1 && !aim) this.animateViewWeapon(0.8); return; }
    }
    if (u.def.breath && u.team === 'player') {
      // a dragon breathes fire where it looks: hold to keep breathing, with a short rest after a long breath
      u.breathHeat = (u.breathHeat || 0);
      if (u.breathCool > 0) return;
      u.yaw = Math.atan2(fx, fz);
      u.breathing = Math.max(u.breathing || 0, 0.2);
      u.breathHeat += aim ? 0.25 : dt;
      if (u.breathHeat > 3) { u.breathHeat = 0; u.breathCool = 2.5; game.ui.toast('The dragon draws breath', 'warn', 1500); }
      if (!u.breathSfx || game.time > u.breathSfx) { SFX.play('breath'); u.breathSfx = game.time + 1.2; }
      return;
    }
    if (!u.canAttackNow()) return;
    if (u.attackKind === 'melee') {
      const reach = u.range + u.radius + 0.5;
      let best = null, bd = Infinity;
      for (const e of game.unitsNear(u.pos.x, u.pos.z, reach + 1.5, 'enemy')) {
        if (e.dead) continue;
        const dx = e.pos.x - u.pos.x, dz = e.pos.z - u.pos.z; const d = Math.hypot(dx, dz) || 1;
        if (d - e.radius > reach) continue;
        if ((dx * fx + dz * fz) / d < 0.45) continue;
        if (d < bd) { bd = d; best = e; }
      }
      if (best) u.attack(best);
      else { u.attackTimer = u.cd * 0.6; u.attackAnim = 1; SFX.play('swing', 0.5); }
      if (!aim) this.animateViewWeapon(0.8);
      return;
    }
    // ranged: free projectile along the aim direction
    const def = u.def;
    const dir = ad;
    const eye = new THREE.Vector3(u.pos.x, u.pos.y + u.eyeHeight - 0.15, u.pos.z).addScaledVector(dir, 0.9);
    const key = def.projectile || 'arrow';
    const pdef = DATA.projectiles[key];
    game.fireProjectile({
      from: u, pos: eye, key, kind: 'free', dir, dmg: u.effDmg, team: 'player', speed: key === 'arrow' ? 55 : 34,
      splash: def.splash || 0, burn: pdef.burn || null, slow: def.slow || pdef.slow || null, magic: !!def.magic || key === 'fireball', gravity: key === 'arrow' ? -6 : -1, maxLife: 3,
    });
    u.attackTimer = u.cd; u.attackAnim = 1;
    SFX.play(key === 'arrow' ? 'bow' : 'cast');
    if (!aim) this.animateViewWeapon(0.6);
  }
  animateViewWeapon(a) { this.vwAnim = a; }

  // ------------------------------------------------------------------ squad commands (first person)
  squadUnits() {
    const lp = this.game.localPlayer;
    const all = this.game.units.filter(u => u.isSoldier && !u.dead && !u.possessed && (!u.owner || u.owner === lp));
    if (this.squad) { const s = all.filter(u => this.squad.has(u)); if (s.length) return s; }
    return all;
  }
  squadFollow() { const us = this.squadUnits(); if (!us.length) return this.game.ui.toast('No soldiers to command'); this.game.commandFollow(us, this.controlled); this.game.ui.toast(`${us.length} soldiers: follow me!`); SFX.play('horn', 0.4); }
  squadAttackPoint() {
    const us = this.squadUnits(); if (!us.length) return this.game.ui.toast('No soldiers to command');
    const t = this.aimTarget();
    if (t) { this.game.commandAttack(us, t); this.game.ui.toast(`${us.length} soldiers: attack ${t.name}!`); this.game.ui.flashMarker(t.pos.x, t.pos.z, 0xff5050); }
    else { const p = this.aimPoint(); this.game.commandMove(us, p.x, p.z, 'attackmove'); this.game.ui.toast(`${us.length} soldiers: move there!`); this.game.ui.flashMarker(p.x, p.z, 0x50ff80); }
    SFX.play('horn', 0.4);
  }
  squadHold() { const us = this.squadUnits(); if (!us.length) return; this.game.commandHold(us); this.game.ui.toast(`${us.length} soldiers: hold position!`); }
  squadDefendKing() { const us = this.squadUnits(); if (!us.length || !this.game.king) return; this.game.commandMove(us, this.game.king.pos.x, this.game.king.pos.z + 4, 'attackmove'); this.game.ui.toast(`${us.length} soldiers: defend the King!`); SFX.play('horn', 0.4); }

  // ------------------------------------------------------------------ building placement
  setBuild(key) {
    if (this.mode === 'fps') return;
    this.cancelBuild();
    const def = DATA.buildings[key];
    if (!def) return;
    this.buildDef = def; this.buildRot = 0;
    this.ghost = Models.ghost(def, 0);
    this.game.scene.add(this.ghost);
    this.game.gridHelper.visible = true;
    this.clearSelection();
    this.updateGhost();
    this.game.ui.onBuildModeChanged();
  }
  cancelBuild() {
    if (this.ghost) { this.game.scene.remove(this.ghost); this.ghost = null; }
    this.clearDragGhosts();
    this.buildDef = null; this.dragStart = null;
    this.game.gridHelper.visible = false;
    this.game.showRange(null);
    this.game.ui.onBuildModeChanged();
  }
  cellUnderMouse() {
    const g = this.screenToGround(this.mouse.x, this.mouse.y);
    if (!g) return null;
    const grid = this.game.grid;
    const def = this.buildDef;
    const w = (this.buildRot % 2 === 0) ? def.w : def.d, d = (this.buildRot % 2 === 0) ? def.d : def.w;
    const i = Math.floor(g.x / grid.cell + grid.half + 0.5 - (w - 1) / 2);
    const j = Math.floor(g.z / grid.cell + grid.half + 0.5 - (d - 1) / 2);
    return { i, j };
  }
  updateGhost() {
    if (!this.ghost) return;
    const c = this.cellUnderMouse();
    if (!c) return;
    this.ghostAnchor = c;
    const res = this.game.grid.canPlace(this.buildDef, c.i, c.j, this.buildRot, this.game);
    let cx = 0, cz = 0;
    for (const cell of res.cells) { const w = this.game.grid.cellToWorld(cell.i, cell.j); cx += w.x; cz += w.z; }
    this.ghost.position.set(cx / res.cells.length, 0, cz / res.cells.length);
    this.ghost.rotation.y = this.buildRot * Math.PI / 2;
    this.ghostOk = res.ok && this.game.canAfford(this.game.buildingCost(this.buildDef)) && !(this.buildDef.unique && this.game.hasBuilding(this.buildDef.key, this.game.localPlayer));
    if (this.buildDef.tower) { const onSummit = res.cells.every(cl => this.game.grid.inBounds(cl.i, cl.j) && this.game.grid.natural[this.game.grid.idx(cl.i, cl.j)] === 9); this.game.showRange(this.ghost.position.x, this.ghost.position.z, this.game.towerRangeFor(this.buildDef) * (onSummit ? 1.3 : 1)); }
    Models.setGhostValid(this.ghost, this.ghostOk, this.game.waves && this.game.waves.active);
    this.game.ui.showBuildHint(res.ok ? (this.ghostOk ? '' : (this.buildDef.unique && this.game.hasBuilding(this.buildDef.key, this.game.localPlayer) ? 'Already built' : 'Not enough gold')) : res.reason);
  }
  placeAtGhost() {
    if (!this.buildDef || !this.ghostAnchor) return;
    const c = this.ghostAnchor;
    const b = this.game.placeBuilding(this.buildDef.key, c.i, c.j, this.buildRot);
    if (b) { SFX.play('build'); this.updateGhost(); }
  }
  updateDrag() {
    const cur = this.cellUnderMouse();
    if (!cur || !this.dragStart) return;
    const s = this.dragStart;
    const cells = [];
    const di = Math.sign(cur.i - s.i), dj = Math.sign(cur.j - s.j);
    let i = s.i, j = s.j;
    cells.push({ i, j });
    while (i !== cur.i) { i += di; cells.push({ i, j }); }
    while (j !== cur.j) { j += dj; cells.push({ i, j }); }
    this.dragCells = cells;
    this.clearDragGhosts();
    let cost = 0;
    for (const c of cells) {
      const ok = this.game.grid.canPlace(this.buildDef, c.i, c.j, 0, this.game).ok;
      const gh = Models.ghost(this.buildDef, 0);
      const w = this.game.grid.cellToWorld(c.i, c.j);
      gh.position.set(w.x, 0, w.z);
      Models.setGhostValid(gh, ok, this.game.waves && this.game.waves.active);
      this.game.scene.add(gh); this.dragGhosts.push(gh);
      if (ok) cost += this.game.buildingCost(this.buildDef);
    }
    this.game.ui.showBuildHint(`${cells.length} walls, ${cost} gold`);
  }
  clearDragGhosts() { for (const g of this.dragGhosts) this.game.scene.remove(g); this.dragGhosts = []; }
  commitDrag() {
    const cells = this.dragCells.length ? this.dragCells : (this.ghostAnchor ? [this.ghostAnchor] : []);
    let placed = 0;
    for (const c of cells) { if (this.game.placeBuilding(this.buildDef.key, c.i, c.j, 0, true)) placed++; }
    if (placed) SFX.play('build');
    this.dragStart = null; this.dragCells = [];
    this.clearDragGhosts();
    this.updateGhost();
  }

  // ------------------------------------------------------------------ per-frame
  clampFocus() { const L = DATA.MAP_HALF + 8; this.focus.x = U.clamp(this.focus.x, -L, L); this.focus.z = U.clamp(this.focus.z, -L, L); }
  update(dt, realDt) {
    const cam = this.camera;
    if (this.mode === 'rts') {
      const k = this.keys;
      const sp = this.camDist * 0.9 * realDt;
      let px = 0, pz = 0;
      if (k.KeyW || k.ArrowUp) pz -= 1; if (k.KeyS || k.ArrowDown) pz += 1;
      if (k.KeyA || k.ArrowLeft) px -= 1; if (k.KeyD || k.ArrowRight) px += 1;
      if (px || pz) {
        const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
        // camera looks toward -forward direction (from behind focus); screen-up moves focus away from camera
        this.focus.x += (fx * pz + fz * px) * sp; this.focus.z += (fz * pz - fx * px) * sp;
        this.clampFocus();
      }
      if (k.KeyQ) this.camYaw += 1.6 * realDt; if (k.KeyE) this.camYaw -= 1.6 * realDt;
      const d = this.camDist, p = this.camPitch;
      cam.position.set(this.focus.x + Math.sin(this.camYaw) * Math.cos(p) * d, Math.sin(p) * d, this.focus.z + Math.cos(this.camYaw) * Math.cos(p) * d);
      cam.lookAt(this.focus.x, 0, this.focus.z);
      if (cam.near !== 0.2) { cam.near = 0.2; cam.updateProjectionMatrix(); }
      if (this.buildDef && this.ghost) { /* ghost updated on mouse move */ }
    } else {
      const u = this.controlled;
      if (!u || u.dead) { this.exitControl(); return; }
      // arrow keys always turn; when the browser will not capture the mouse, the screen edges keep turning too
      const k = this.keys, turn = 2.2 * realDt;
      if (k.ArrowLeft) this.fpsYaw += turn; if (k.ArrowRight) this.fpsYaw -= turn;
      if (k.ArrowUp) this.fpsPitch = U.clamp(this.fpsPitch + turn * 0.6, -1.35, 1.35); if (k.ArrowDown) this.fpsPitch = U.clamp(this.fpsPitch - turn * 0.6, -1.35, 1.35);
      if (!this.lookLocked) {
        // uncaptured: when the hidden cursor is pinned at the edge of the frame (or has left it), keep turning that way
        let px = 0, py = 0;
        if (this.mouseInside && this.mouseMoved) {
          const r = this.canvas.getBoundingClientRect();
          const nx = (this.mouse.x - r.left) / r.width, ny = (this.mouse.y - r.top) / r.height;
          const edge = 0.03;
          px = nx <= edge ? -1 : (nx >= 1 - edge ? 1 : 0); py = ny <= edge ? -1 : (ny >= 1 - edge ? 1 : 0);
        } else if (this.exitPush) { px = this.exitPush.x; py = this.exitPush.y; }
        if (px) this.fpsYaw -= px * 2.6 * realDt;
        if (py) this.fpsPitch = U.clamp(this.fpsPitch - py * 1.3 * realDt, -1.35, 1.35);
      }
      cam.rotation.order = 'YXZ';
      const eye = new THREE.Vector3(u.pos.x, u.pos.y + u.eyeHeight, u.pos.z);
      if (cam.near !== 0.06) { cam.near = 0.06; cam.updateProjectionMatrix(); }
      if (this.firstPerson) {
        const bob = u.moving ? Math.sin(u.animT) * 0.05 : 0;
        cam.position.set(eye.x, eye.y + bob, eye.z);
        cam.rotation.set(this.fpsPitch, this.fpsYaw + Math.PI, 0);
      } else {
        const dir = new THREE.Vector3(Math.sin(this.fpsYaw) * Math.cos(this.fpsPitch), Math.sin(this.fpsPitch), Math.cos(this.fpsYaw) * Math.cos(this.fpsPitch));
        const dist = 5 + u.radius * 3;
        const want = eye.clone().addScaledVector(dir, -dist).add(new THREE.Vector3(0, 1.2, 0));
        if (want.y < 0.6) want.y = 0.6;
        // pull the camera in front of any building between it and the unit
        const grid = this.game.grid, steps = 16;
        let pos = want;
        for (let s = 1; s <= steps; s++) {
          const p = eye.clone().lerp(want, s / steps);
          const b = grid.buildingAtWorld(p.x, p.z);
          const blocked = Math.abs(p.x) > DATA.MAP_HALF || Math.abs(p.z) > DATA.MAP_HALF || (b && !b.dead && p.y < b.height + 0.4 && !grid.passableWorld(p.x, p.z, 'player'));
          if (blocked) { pos = eye.clone().lerp(want, Math.max(0.08, (s - 1.5) / steps)); break; }
        }
        cam.position.copy(pos);
        cam.lookAt(eye.clone().addScaledVector(dir, 6));
      }
      if (this.attackHeld && !this.game.paused) this.playerAttack(u, dt);
      // view weapon animation
      if (this.viewWeapon) {
        this.viewWeapon.visible = this.firstPerson;
        const w = this.viewWeapon.userData.weapon, base = this.viewWeapon.userData.base;
        this.vwAnim = Math.max(0, (this.vwAnim || 0) - realDt * 3.5);
        const a = this.vwAnim;
        const bob = u.moving ? Math.sin(u.animT * 1.0) * 0.02 : 0;
        w.position.set(base.pos.x - a * 0.15, base.pos.y + bob + Math.sin(a * Math.PI) * 0.1, base.pos.z - Math.sin(a * Math.PI) * 0.35);
        w.rotation.set(base.rot.x - Math.sin(a * Math.PI) * 0.9, base.rot.y + Math.sin(a * Math.PI) * 0.5, base.rot.z);
      }
    }
  }
}
