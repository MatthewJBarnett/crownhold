'use strict';

const Models = {
  _mats: new Map(),
  mat(color, opts = {}) {
    const key = color + '|' + (opts.emissive || 0) + '|' + (opts.emissiveIntensity || 0) + '|' + (opts.transparent ? 'T' + opts.opacity : '');
    let m = this._mats.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color });
      if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity || 1; }
      if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity; }
      this._mats.set(key, m);
    }
    return m;
  },
  freshMat(color) { return new THREE.MeshLambertMaterial({ color }); },
  // soft procedural grain, shared by ground, stone and water
  noiseTexture(size = 256, contrast = 0.18, seed = 1) {
    const key = 'noise' + size + contrast + seed;
    if (this._tex && this._tex[key]) return this._tex[key];
    this._tex = this._tex || {};
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = U.smoothNoise(x * 0.11 + seed * 7, y * 0.11 + seed * 3) * 0.6 + U.smoothNoise(x * 0.31 + seed, y * 0.31) * 0.3 + U.noise2(x + seed, y) * 0.1;
      const v = Math.round(255 * (1 - contrast / 2 + contrast * n));
      const k = (y * size + x) * 4; img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    this._tex[key] = t; return t;
  },
  softDot() {
    if (this._dot) return this._dot;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); this._dot = t; return t;
  },
  flameTexture() {
    if (this._flame) return this._flame;
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 84, 4, 32, 70, 60);
    g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.25, 'rgba(255,200,80,0.95)'); g.addColorStop(0.55, 'rgba(255,110,20,0.55)'); g.addColorStop(1, 'rgba(200,40,0,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(32, 72, 30, 56, 0, 0, Math.PI * 2); x.fill();
    const t = new THREE.CanvasTexture(c); this._flame = t; return t;
  },
  flameSprite(scale = 1, color = 0xffffff) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flameTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(0.5 * scale, 1.0 * scale, 1);
    return s;
  },
  sunDisc() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(255,250,230,1)'); g.addColorStop(0.18, 'rgba(255,240,200,0.95)'); g.addColorStop(0.3, 'rgba(255,220,160,0.35)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(220); s.renderOrder = -10;
    return s;
  },
  // a soft dark disc: the contact shadow under a unit or building
  blob(radius, opacity = 0.4) {
    if (!this._blobTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128); this._blobTex = new THREE.CanvasTexture(c);
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: this._blobTex, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
    return m;
  },
  tuftTexture() {
    if (this._tuft) return this._tuft;
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    for (let k = 0; k < 9; k++) {
      const bx = 8 + k * 6, top = 6 + Math.random() * 16, lean = (Math.random() - 0.5) * 14;
      x.strokeStyle = `rgba(${200 + Math.floor(Math.random() * 55)},${215 + Math.floor(Math.random() * 40)},${170 + Math.floor(Math.random() * 60)},1)`;
      x.lineWidth = 2.2; x.beginPath(); x.moveTo(bx, 64); x.quadraticCurveTo(bx + lean * 0.4, 40, bx + lean, top); x.stroke();
    }
    const t = new THREE.CanvasTexture(c); this._tuft = t; return t;
  },
  tuftGeometry() {
    const g = new THREE.BufferGeometry();
    const v = [], uv = [], idx = [];
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3, cx = Math.cos(a) * 0.45, cz = Math.sin(a) * 0.45;
      const b = v.length / 3;
      v.push(-cx, 0, -cz, cx, 0, cz, cx, 0.7, cz, -cx, 0.7, -cz);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const nn = new Float32Array(v.length); for (let k = 0; k < v.length; k += 3) { nn[k] = 0; nn[k + 1] = 1; nn[k + 2] = 0; }
    g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    return g;
  },
  // tree crowns: three stacked pine tiers, or a rounded broadleaf crown
  canopyGeometry(kind) {
    const parts = [];
    if (kind === 'round') {
      for (const [r, y, sx] of [[1.35, 0.2, 1], [1.05, 1.1, 1.1], [0.7, 1.9, 1]]) { const s = new THREE.SphereGeometry(r, 10, 8); s.scale(sx, 0.85, sx); s.translate(0, y, 0); parts.push(s); }
    } else {
      for (const [r, h, y] of [[1.35, 1.9, -0.2], [1.05, 1.8, 0.9], [0.7, 1.6, 1.9]]) { const c = new THREE.ConeGeometry(r, h, 10); c.translate(0, y + h / 2, 0); parts.push(c); }
    }
    return this.mergeGeometries(parts);
  },
  mergeGeometries(list) {
    const pos = [], nor = [], uv = [], idx = []; let base = 0;
    for (const g of list) {
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, ix = g.index;
      for (let k = 0; k < p.count; k++) { pos.push(p.getX(k), p.getY(k), p.getZ(k)); nor.push(n.getX(k), n.getY(k), n.getZ(k)); uv.push(u ? u.getX(k) : 0, u ? u.getY(k) : 0); }
      if (ix) for (let k = 0; k < ix.count; k++) idx.push(base + ix.getX(k)); else for (let k = 0; k < p.count; k++) idx.push(base + k);
      base += p.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); out.setIndex(idx);
    return out;
  },
  skyDome() {
    const geo = new THREE.SphereGeometry(1000, 24, 12);
    const pos = geo.attributes.position; const colors = new Float32Array(pos.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -10; m.frustumCulled = false;
    this.tintSky(m, 0x9cc4e4, 0x3f7fd0);
    return m;
  },
  tintSky(mesh, horizonHex, zenithHex) {
    const pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color;
    const hz = new THREE.Color(horizonHex), zn = new THREE.Color(zenithHex), c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) { const t = U.clamp(pos.getY(k) / 1000, -0.2, 1); const f = Math.pow(Math.max(0, t), 0.6); c.copy(hz).lerp(zn, f); col.setXYZ(k, c.r, c.g, c.b); }
    col.needsUpdate = true;
  },
  clouds(n) {
    const g = new THREE.Group();
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    for (let b = 0; b < 6; b++) { const grd = ctx.createRadialGradient(40 + b * 10, 60 + (b % 2) * 14, 2, 40 + b * 10, 60 + (b % 2) * 14, 30); grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128); }
    const tex = new THREE.CanvasTexture(c);
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.55 + Math.random() * 0.3, depthWrite: false, fog: false }));
      const sc = 40 + Math.random() * 50; s.scale.set(sc, sc * 0.45, 1);
      s.position.set((Math.random() - 0.5) * 520, 95 + Math.random() * 40, (Math.random() - 0.5) * 520);
      g.add(s);
    }
    g.renderOrder = -5;
    return g;
  },
  box(w, h, d, mat, x = 0, y = 0, z = 0, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = shadow;
    return m;
  },
  cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 14, shadow = true) {
    if (seg >= 6) seg = Math.max(seg, 14);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = shadow;
    return m;
  },
  cone(r, h, mat, x = 0, y = 0, z = 0, seg = 12) {
    if (seg >= 6) seg = Math.max(seg, 12);
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  },
  sphere(r, mat, x = 0, y = 0, z = 0, seg = 14) {
    seg = Math.max(seg, 12);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  },

  // ------------------------------------------------------------- weapons
  weapon(kind, mat) {
    const g = new THREE.Group();
    const steel = this.mat(0xcfd6dd), wood = this.mat(0x6b4a2a), gold = this.mat(0xd8b040);
    switch (kind) {
      case 'sword':
        g.add(this.box(0.07, 0.07, 0.9, steel, 0, 0, 0.55));
        g.add(this.box(0.28, 0.06, 0.06, gold, 0, 0, 0.1));
        g.add(this.box(0.06, 0.06, 0.22, wood, 0, 0, -0.06));
        break;
      case 'dagger':
        g.add(this.box(0.05, 0.05, 0.45, steel, 0, 0, 0.3));
        g.add(this.box(0.16, 0.05, 0.05, wood, 0, 0, 0.06));
        break;
      case 'axe':
        g.add(this.box(0.06, 0.06, 0.9, wood, 0, 0, 0.35));
        g.add(this.box(0.05, 0.36, 0.28, steel, 0.0, 0.0, 0.7));
        break;
      case 'club':
        g.add(this.cyl(0.14, 0.06, 1.0, wood, 0, 0, 0.45).rotateX(Math.PI / 2));
        break;
      case 'hammer':
        g.add(this.box(0.06, 0.06, 0.7, wood, 0, 0, 0.3));
        g.add(this.box(0.16, 0.16, 0.3, steel, 0, 0, 0.62));
        break;
      case 'mace':
        g.add(this.box(0.05, 0.05, 0.7, wood, 0, 0, 0.3));
        g.add(this.sphere(0.14, steel, 0, 0, 0.7, 6));
        break;
      case 'pike':
        g.add(this.box(0.05, 0.05, 2.2, wood, 0, 0, 0.9));
        g.add(this.cone(0.07, 0.4, steel, 0, 0, 2.15).rotateX(Math.PI / 2));
        break;
      case 'bow': {
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 5, 10, Math.PI), wood);
        bow.rotation.y = Math.PI / 2; bow.rotation.z = -Math.PI / 2;
        bow.castShadow = true;
        g.add(bow);
        const str = this.box(0.01, 1.0, 0.01, this.mat(0xeeeeee), 0, 0, 0);
        g.add(str);
        break;
      }
      case 'staff':
        g.add(this.box(0.06, 0.06, 1.6, wood, 0, 0, 0.5));
        g.add(this.sphere(0.13, mat || this.mat(0xff8040, { emissive: 0xff5010, emissiveIntensity: 0.8 }), 0, 0, 1.35, 8));
        break;
    }
    return g;
  },

  // ------------------------------------------------------------- humanoid
  humanoid(def, team) {
    const g = new THREE.Group();
    const parts = {};
    const cloth = this.freshMat(def.cloth || (team === 'enemy' ? 0x5a3a2a : 0x3a5a9a));
    const armor = this.freshMat(def.color || 0x888888);
    const skin = this.freshMat(def.skin || 0xe8c39e);
    const mats = [cloth, armor, skin];
    const dark = this.mat(0x222222), leather = this.mat(0x4a3320), steel = this.mat(0xb8bcc4);
    const s = def.scale || 1;
    const armoured = !!(def.helmet || def.shield || def.title) && !def.robe && !def.skeleton;

    // legs: tapered limbs with boots
    const legMat = def.skeleton ? skin : (def.robe ? cloth : this.mat(0x3a3a3a));
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(side * 0.15, 0.72, 0);
      if (def.skeleton) hip.add(this.box(0.12, 0.7, 0.12, skin, 0, -0.36, 0));
      else { hip.add(this.cyl(0.105, 0.085, 0.6, legMat, 0, -0.32, 0, 10)); hip.add(this.box(0.2, 0.14, 0.27, leather, 0, -0.66, 0.03)); }
      g.add(hip);
      parts[side < 0 ? 'legL' : 'legR'] = hip;
      if (def.robe) hip.visible = false;
    }
    if (def.robe) {
      const robe = this.cyl(0.3, 0.52, 1.0, cloth, 0, 0.5, 0, 14);
      g.add(robe); parts.robe = robe;
    }
    // torso: an elliptical body with a belt
    let torso;
    if (def.skeleton) {
      torso = this.box(0.5, 0.66, 0.3, skin, 0, 1.05, 0);
      for (let r = 0; r < 3; r++) g.add(this.box(0.54, 0.05, 0.34, dark, 0, 0.85 + r * 0.16, 0, false));
    } else {
      torso = this.cyl(0.27, 0.23, 0.66, cloth, 0, 1.05, 0, 14); torso.scale.z = 0.66;
      g.add(this.cyl(0.255, 0.255, 0.09, leather, 0, 0.77, 0, 14)).scale.z = 0.7;
      g.add(this.box(0.1, 0.09, 0.05, this.mat(0xc8a040), 0, 0.77, 0.18, false));
    }
    g.add(torso); parts.body = torso;
    if (armoured) {
      const chest = this.cyl(0.31, 0.27, 0.44, armor, 0, 1.13, 0, 14); chest.scale.z = 0.68; g.add(chest); parts.chest = chest;
      for (const side of [-1, 1]) { const p = this.sphere(0.14, armor, side * 0.36, 1.36, 0, 12); p.scale.y = 0.7; g.add(p); }
    }
    // neck and head
    g.add(this.cyl(0.07, 0.08, 0.12, skin, 0, 1.42, 0, 10, false));
    const head = this.sphere(0.19, skin, 0, 1.57, 0, 14); head.scale.set(1, 1.08, 0.94);
    g.add(head); parts.head = head;
    if (!def.helmet && !def.hood && !def.hat && !def.skeleton) {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), this.mat(def.hair || 0x3a2416)); hair.position.set(0, 1.58, -0.005); hair.castShadow = true; g.add(hair);
    }
    // eyes
    const eyeMat = def.skeleton ? this.mat(0xff3020, { emissive: 0xff2010, emissiveIntensity: 1 }) : dark;
    g.add(this.box(0.05, 0.05, 0.03, eyeMat, -0.07, 1.6, 0.17, false));
    g.add(this.box(0.05, 0.05, 0.03, eyeMat, 0.07, 1.6, 0.17, false));
    if (def.helmet) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.225, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), armor); dome.position.y = 1.6; dome.castShadow = true; g.add(dome);
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.03, 6, 18), armor).rotateX(Math.PI / 2).translateZ(-1.6));
      g.add(this.box(0.06, 0.2, 0.05, armor, 0, 1.55, 0.2, false));
      if (def.plume || def.title) g.add(this.cone(0.07, 0.5, this.mat(def.plumeColor || 0xc02030), 0, 1.98, -0.06, 8));
    }
    if (def.hood) g.add(this.cone(0.33, 0.55, cloth, 0, 1.85, 0, 12));
    if (def.hat) {
      g.add(this.cyl(0.44, 0.44, 0.05, cloth, 0, 1.75, 0, 16));
      g.add(this.cone(0.24, 0.8, cloth, 0, 2.1, 0, 12));
    }
    if (def.crown) {
      const gold = this.mat(0xffd54a, { emissive: 0x806000, emissiveIntensity: 0.4 });
      g.add(this.cyl(0.2, 0.2, 0.14, gold, 0, 1.78, 0, 12));
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2;
        g.add(this.box(0.06, 0.16, 0.06, gold, Math.sin(a) * 0.18, 1.9, Math.cos(a) * 0.18, false));
      }
    }
    // arms: tapered limbs with rounded hands
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(side * 0.38, 1.32, 0);
      if (def.skeleton) sh.add(this.box(0.1, 0.6, 0.1, skin, 0, -0.28, 0));
      else sh.add(this.cyl(0.085, 0.07, 0.58, def.skeleton ? skin : cloth, 0, -0.27, 0, 10));
      sh.add(this.sphere(0.075, skin, 0, -0.6, 0, 10));
      g.add(sh);
      parts[side < 0 ? 'armL' : 'armR'] = sh;
    }
    if (def.weapon) {
      const w = this.weapon(def.weapon, def.weapon === 'staff' ? this.mat(def.magic || def.abilities ? 0xff8040 : 0x60c0ff, { emissive: def.color || 0xff5010, emissiveIntensity: 0.7 }) : null);
      w.position.set(0, -0.6, 0.05);
      parts.armR.add(w); parts.weapon = w;
      if (def.weapon === 'bow') { w.position.set(0, -0.6, 0.15); w.rotation.y = 0; g.add(this.cyl(0.07, 0.07, 0.55, leather, -0.2, 1.15, -0.22, 8).rotateX(0.35)); }
      if (def.weapon === 'staff') { w.rotation.x = -Math.PI / 2; w.position.set(0, -0.3, 0.1); }
    }
    if (def.shield) {
      const sh = this.cyl(0.3, 0.3, 0.06, armor, -0.12, -0.4, 0.1, 16); sh.rotation.z = Math.PI / 2;
      parts.armL.add(sh);
      const boss = this.sphere(0.07, steel, -0.16, -0.4, 0.1, 8); parts.armL.add(boss);
    }
    if (def.isKing || def.title || def.cape) {
      const capeGeo = new THREE.PlaneGeometry(0.64, 0.95, 3, 6); capeGeo.translate(0, -0.475, 0);
      const cape = new THREE.Mesh(capeGeo, new THREE.MeshLambertMaterial({ color: def.capeColor || (def.isKing ? 0x7a1030 : (def.cloth || 0x3a3a5a)), side: THREE.DoubleSide }));
      cape.position.set(0, 1.4, -0.2); cape.castShadow = true; g.add(cape); parts.cape = cape;
      cape.userData.base = capeGeo.attributes.position.array.slice();
    }
    if (def.wings) {
      const wm = this.freshMat(0x5a3a6a); mats.push(wm);
      for (const s of [-1, 1]) {
        const pivot = new THREE.Group(); pivot.position.set(s * 0.3, 1.3, -0.15);
        const wing = this.box(1.3, 0.06, 0.6, wm, s * 0.65, 0.1, 0); wing.rotation.y = s * 0.3; pivot.add(wing);
        g.add(pivot); parts[s < 0 ? 'wingL' : 'wingR'] = pivot;
      }
    }
    g.scale.setScalar(s);
    return { group: g, parts, mats, eyeHeight: 1.62 * s, height: 1.8 * s, mesh: torso };
  },

  wolf(def) {
    const g = new THREE.Group();
    const fur = this.freshMat(def.color || 0x6a6a6a), dark = this.mat(0x2a2a2a);
    const parts = {};
    const body = this.box(0.5, 0.45, 1.1, fur, 0, 0.62, 0); g.add(body); parts.body = body;
    const head = this.box(0.36, 0.34, 0.5, fur, 0, 0.8, 0.72); g.add(head); parts.head = head;
    g.add(this.box(0.2, 0.16, 0.26, dark, 0, 0.72, 1.02, false));
    for (const s of [-1, 1]) g.add(this.box(0.1, 0.16, 0.06, fur, s * 0.12, 1.02, 0.62, false));
    const eye = this.mat(0xffd040, { emissive: 0xffa000, emissiveIntensity: 0.8 });
    for (const s of [-1, 1]) g.add(this.box(0.06, 0.06, 0.04, eye, s * 0.1, 0.86, 0.96, false));
    const tail = this.box(0.1, 0.1, 0.5, fur, 0, 0.78, -0.75); tail.rotation.x = 0.5; g.add(tail);
    // legs: front pair swing like arms, back pair like legs so the humanoid animation works unchanged
    for (const [name, x, z] of [['armL', -0.18, 0.38], ['armR', 0.18, 0.38], ['legL', -0.18, -0.38], ['legR', 0.18, -0.38]]) {
      const hip = new THREE.Group(); hip.position.set(x, 0.45, z);
      hip.add(this.box(0.13, 0.45, 0.14, fur, 0, -0.22, 0));
      g.add(hip); parts[name] = hip;
    }
    return { group: g, parts, mats: [fur], eyeHeight: 0.85, height: 1.0, mesh: body };
  },
  rider(def) {
    // a horse with the humanoid rider on top; horse legs reuse the limb names so the walk cycle just works
    const g = new THREE.Group();
    const parts = {};
    const horse = this.freshMat(0x6a4a2a), dark = this.mat(0x2a1a10);
    const body = this.box(0.6, 0.6, 1.5, horse, 0, 1.05, 0); g.add(body); parts.body = body;
    const neck = this.box(0.3, 0.7, 0.35, horse, 0, 1.55, 0.75); neck.rotation.x = -0.5; g.add(neck);
    g.add(this.box(0.28, 0.3, 0.55, horse, 0, 1.85, 1.05));
    for (const s of [-1, 1]) g.add(this.box(0.08, 0.16, 0.06, dark, s * 0.1, 2.05, 0.95, false));
    const tail = this.box(0.1, 0.6, 0.1, dark, 0, 1.0, -0.8); tail.rotation.x = 0.5; g.add(tail);
    for (const [name, x, z] of [['armL', -0.22, 0.55], ['armR', 0.22, 0.55], ['legL', -0.22, -0.55], ['legR', 0.22, -0.55]]) {
      const hip = new THREE.Group(); hip.position.set(x, 0.8, z);
      hip.add(this.box(0.16, 0.8, 0.18, horse, 0, -0.4, 0)); g.add(hip); parts[name] = hip;
    }
    const man = this.humanoid(Object.assign({}, def, { scale: 0.85 }), 'player');
    man.group.position.set(0, 0.85, 0);
    // rider legs straddle the horse
    if (man.parts.legL) man.parts.legL.rotation.x = -0.9; if (man.parts.legR) man.parts.legR.rotation.x = -0.9;
    man.parts.legL = null; man.parts.legR = null;
    g.add(man.group);
    parts.riderArmR = man.parts.armR; parts.riderArmL = man.parts.armL; parts.weapon = man.parts.weapon; parts.head = man.parts.head;
    return { group: g, parts, mats: [horse].concat(man.mats), eyeHeight: 2.45, height: 2.7, mesh: body };
  },
  spider(def) {
    const g = new THREE.Group();
    const fur = this.freshMat(def.color || 0x3a2a3a), dark = this.mat(0x1a1018);
    const parts = {};
    const body = this.sphere(0.55, fur, 0, 0.75, 0.2, 8); g.add(body); parts.body = body;
    const abd = this.sphere(0.8, fur, 0, 0.85, -0.9, 8); abd.scale.set(1, 0.85, 1.2); g.add(abd);
    const head = this.sphere(0.32, dark, 0, 0.8, 0.75, 8); g.add(head); parts.head = head;
    const eye = this.mat(0xff3030, { emissive: 0xff1010, emissiveIntensity: 1 });
    for (let k = 0; k < 4; k++) g.add(this.box(0.07, 0.07, 0.05, eye, -0.18 + k * 0.12, 0.88 + (k % 2) * 0.08, 1.02, false));
    for (const s of [-1, 1]) g.add(this.cone(0.06, 0.35, dark, s * 0.12, 0.6, 1.0, 5).rotateX(Math.PI / 2));
    // four leg pairs: each pair hangs from one pivot so the walk cycle animates them
    for (let k = 0; k < 4; k++) {
      const name = ['armL', 'armR', 'legL', 'legR'][k];
      const side = k % 2 === 0 ? -1 : 1, z = 0.55 - Math.floor(k / 2) * 0.9;
      const pivot = new THREE.Group(); pivot.position.set(side * 0.4, 0.8, z);
      for (const zz of [0, -0.45]) {
        const upper = this.box(0.9, 0.09, 0.09, fur, side * 0.45, 0.25, zz); upper.rotation.z = side * -0.6; pivot.add(upper);
        const lower = this.box(0.09, 0.9, 0.09, fur, side * 0.95, -0.2, zz); pivot.add(lower);
      }
      g.add(pivot); parts[name] = pivot;
    }
    const s = def.scale || 1; g.scale.setScalar(s);
    return { group: g, parts, mats: [fur], eyeHeight: 1.1 * s, height: 1.5 * s, mesh: body, legSwing: 0.35 };
  },
  catapult(def) {
    const g = new THREE.Group();
    const wood = this.freshMat(0x6b4a2a), dark = this.mat(0x3a2a1a);
    const parts = {};
    g.add(this.box(1.6, 0.3, 2.4, wood, 0, 0.6, 0));
    g.add(this.box(0.2, 0.9, 0.2, wood, -0.6, 1.1, -0.4)); g.add(this.box(0.2, 0.9, 0.2, wood, 0.6, 1.1, -0.4));
    for (const [x, z] of [[-0.9, 0.9], [0.9, 0.9], [-0.9, -0.9], [0.9, -0.9]]) {
      const wheel = this.cyl(0.4, 0.4, 0.2, dark, x, 0.4, z, 10);
      wheel.rotation.z = Math.PI / 2; g.add(wheel);
    }
    const armPivot = new THREE.Group(); armPivot.position.set(0, 1.5, -0.4);
    const arm = this.box(0.16, 0.16, 2.4, wood, 0, 0, 0.9); armPivot.add(arm);
    const bucket = this.box(0.5, 0.25, 0.5, dark, 0, 0.1, 2.05); armPivot.add(bucket);
    armPivot.rotation.x = -0.9;
    g.add(armPivot); parts.arm = armPivot;
    parts.body = arm;
    return { group: g, parts, mats: [wood], eyeHeight: 1.8, height: 2.6, mesh: arm };
  },

  dragon(def) {
    const g = new THREE.Group();
    const bodyMat = this.freshMat(def.color || 0x8a1a1a), belly = this.mat(0xd8a060), wingMat = this.freshMat(0x5a1010);
    const parts = {};
    const body = this.sphere(1.0, bodyMat, 0, 0, 0, 10); body.scale.set(1.2, 1, 2.2); g.add(body); parts.body = body;
    { const b = this.sphere(0.7, belly, 0, -0.4, 0.2, 8); b.scale.set(1.0, 0.6, 1.8); g.add(b); }
    const neck = this.cyl(0.35, 0.5, 2.0, bodyMat, 0, 0.9, 2.4, 8); neck.rotation.x = -0.9; g.add(neck);
    const head = this.box(0.7, 0.6, 1.3, bodyMat, 0, 1.7, 3.3); g.add(head); parts.head = head;
    const eye = this.mat(0xffe040, { emissive: 0xffc000, emissiveIntensity: 1 });
    g.add(this.box(0.12, 0.12, 0.1, eye, -0.25, 1.85, 3.9, false)); g.add(this.box(0.12, 0.12, 0.1, eye, 0.25, 1.85, 3.9, false));
    for (const s of [-1, 1]) g.add(this.cone(0.1, 0.5, belly, s * 0.25, 2.1, 2.9, 5));
    const tail = this.cone(0.4, 3.5, bodyMat, 0, 0.1, -3.4, 6); tail.rotation.x = -Math.PI / 2 - 0.2; g.add(tail);
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.8, 0.5, 0.2);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 2.6), wingMat);
      wing.position.set(s * 2.1, 0, -0.3); wing.castShadow = true;
      pivot.add(wing);
      const bone = this.box(4.2, 0.16, 0.16, bodyMat, s * 2.1, 0.05, 0.9, false); pivot.add(bone);
      g.add(pivot); parts[s < 0 ? 'wingL' : 'wingR'] = pivot;
    }
    for (const [x, z] of [[-0.7, 1.0], [0.7, 1.0], [-0.8, -1.0], [0.8, -1.0]]) g.add(this.box(0.35, 0.9, 0.35, bodyMat, x, -0.8, z));
    return { group: g, parts, mats: [bodyMat, wingMat], eyeHeight: 2.0, height: 3.0, mesh: body };
  },

  // ------------------------------------------------------------- buildings
  stone: null, stoneDark: null, wood: null, roof: null,
  initMats() {
    const stoneTex = this.noiseTexture(256, 0.16, 5); stoneTex.repeat.set(2, 2);
    const bump = this.noiseTexture(256, 0.5, 15); bump.repeat.set(2, 2);
    this.stone = new THREE.MeshPhongMaterial({ color: 0xa0a098, map: stoneTex, bumpMap: bump, bumpScale: 0.035, shininess: 4, specular: 0x222222, side: THREE.DoubleSide }); this.stoneDark = new THREE.MeshPhongMaterial({ color: 0x74746c, map: stoneTex, bumpMap: bump, bumpScale: 0.035, shininess: 4, specular: 0x222222, side: THREE.DoubleSide }); this.wood = this.mat(0x7a5a38); this.wood.side = THREE.DoubleSide;
    this.roof = this.mat(0x8a3a30); this.plaster = this.mat(0xd8cfb8); this.gold = this.mat(0xe0b040, { emissive: 0x604000, emissiveIntensity: 0.3 });
  },
  // a wall torch: bracket, flame and a flickering light
  torch(g, x, y, z) {
    g.add(this.cyl(0.05, 0.05, 0.5, this.mat(0x2a2a2a), x, y, z, 5, false));
    g.add(this.cyl(0.09, 0.06, 0.16, this.mat(0x3a3a3a), x, y + 0.28, z, 8, false));
    const flame = this.flameSprite(0.9); flame.position.set(x, y + 0.66, z); g.add(flame);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softDot(), color: 0xffa040, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(1.1); glow.position.set(x, y + 0.6, z); g.add(glow);
    const light = new THREE.PointLight(0xffa040, 0.9, 13, 1.6); light.position.set(x, y + 0.6, z); light.castShadow = false; g.add(light);
    light.userData.base = 0.9; light.userData.phase = x * 3 + z * 7; light.userData.flame = flame;
    return light;
  },
  merlons(g, w, d, y, step = 1.0) {
    const m = this.stoneDark;
    const hw = w / 2, hd = d / 2;
    for (let x = -hw + 0.25; x <= hw - 0.25 + 1e-3; x += step) { g.add(this.box(0.5, 0.5, 0.5, m, x, y, -hd + 0.25)); g.add(this.box(0.5, 0.5, 0.5, m, x, y, hd - 0.25)); }
    for (let z = -hd + 0.25 + step; z <= hd - 0.25 - step + 1e-3; z += step) { g.add(this.box(0.5, 0.5, 0.5, m, -hw + 0.25, y, z)); g.add(this.box(0.5, 0.5, 0.5, m, hw - 0.25, y, z)); }
  },
  flag(g, x, y, z, color = 0xc02030) {
    g.add(this.cyl(0.04, 0.04, 2.2, this.mat(0x4a3a2a), x, y + 1.1, z, 5, false));
    g.add(this.box(0.9, 0.5, 0.04, this.mat(color), x + 0.45, y + 1.9, z, false));
  },
  // a pennant in the owner's colour; shared things fly the gold crown
  ownerBanner(color, shared = false, big = false) {
    const g = new THREE.Group();
    const h = big ? 3.2 : 2.0;
    g.add(this.cyl(0.05, 0.05, h, this.mat(0x3a2a1a), 0, h / 2, 0, 5, false));
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(big ? 1.6 : 1.0, big ? 0.9 : 0.6), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
    cloth.position.set((big ? 0.8 : 0.5) + 0.03, h - (big ? 0.5 : 0.35), 0);
    g.add(cloth);
    if (shared) { const crown = this.cyl(0.22, 0.28, 0.22, this.mat(0xffe680, { emissive: 0x806000, emissiveIntensity: 0.4 }), 0, h + 0.15, 0, 8, false); g.add(crown); }
    g.userData.cloth = cloth;
    return g;
  },
  building(def, level = 1) {
    if (!this.stone) this.initMats();
    const g = new THREE.Group();
    const W = def.w * DATA.CELL, D = def.d * DATA.CELL;
    const st = this.stone, sd = this.stoneDark, wd = this.wood;
    switch (def.key) {
      case 'wall':
        g.add(this.box(2, 3.2, 2, st, 0, 1.6, 0));
        g.add(this.box(2.16, 0.3, 2.16, sd, 0, 0.15, 0));
        g.add(this.box(2.1, 0.18, 2.1, this.plaster, 0, 3.21, 0, false));
        for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) g.add(this.box(0.55, 0.55, 0.55, sd, x, 3.45, z));
        break;
      case 'gate':
        g.add(this.box(0.5, 4.0, 2, st, -0.75, 2.0, 0));
        g.add(this.box(0.5, 4.0, 2, st, 0.75, 2.0, 0));
        g.add(this.box(2, 0.8, 2, st, 0, 3.6, 0));
        { const door = new THREE.Group();
          door.add(this.box(1.1, 3.2, 0.35, wd, 0, 1.6, 0));
          door.add(this.box(1.1, 0.1, 0.4, this.mat(0x3a3a3a), 0, 1.0, 0, false));
          door.add(this.box(1.1, 0.1, 0.4, this.mat(0x3a3a3a), 0, 2.2, 0, false));
          for (let k = -2; k <= 2; k++) door.add(this.box(0.08, 3.4, 0.1, this.mat(0x2a2a2a), k * 0.22, 1.6, 0.2, false));
          g.add(door); g.userData.door = door; }
        for (const x of [-0.7, 0.7]) g.add(this.box(0.55, 0.55, 0.55, sd, x, 4.25, 0));
        g.userData.torches = [];
        for (const x of [-1.15, 1.15]) for (const z of [-1.15, 1.15]) g.userData.torches.push(this.torch(g, x, 3.0, z));
        break;
      case 'arrow_tower':
        g.add(this.cyl(1.6, 1.85, 6.5, st, 0, 3.25, 0, 10));
        g.add(this.cyl(2.0, 1.8, 0.6, sd, 0, 6.8, 0, 10));
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.add(this.box(0.5, 0.6, 0.5, sd, Math.sin(a) * 1.75, 7.4, Math.cos(a) * 1.75)); }
        g.add(this.box(0.6, 1.0, 0.3, this.mat(0x2a2a2a), 0, 2.8, 1.78, false));
        this.flag(g, 0, 7.1, 0, 0x3060c0);
        break;
      case 'ballista_tower':
        g.add(this.box(3.4, 5.5, 3.4, st, 0, 2.75, 0));
        g.add(this.box(3.8, 0.5, 3.8, sd, 0, 5.75, 0));
        this.merlons(g, 3.8, 3.8, 6.25, 1.1);
        { const b = new THREE.Group(); b.position.y = 6.2;
          b.add(this.box(0.3, 0.3, 2.6, wd, 0, 0.5, 0)); b.add(this.box(2.4, 0.18, 0.18, wd, 0, 0.5, 1.0));
          b.add(this.box(0.4, 0.5, 0.4, sd, 0, 0.2, -0.3)); g.add(b); g.userData.turret = b; }
        break;
      case 'mage_tower':
        g.add(this.cyl(1.2, 1.5, 8.5, this.mat(0x5a4a6a), 0, 4.25, 0, 10));
        g.add(this.cone(1.7, 2.4, this.mat(0x4a2a7a), 0, 9.6, 0, 10));
        { const orb = this.sphere(0.7, this.mat(0xc080ff, { emissive: 0x8040ff, emissiveIntensity: 1 }), 0, 11.6, 0, 10); g.add(orb); g.userData.orb = orb; }
        for (let k = 0; k < 3; k++) g.add(this.box(0.4, 0.7, 0.2, this.mat(0xffc060, { emissive: 0xff8000, emissiveIntensity: 0.6 }), Math.sin(k * 2.1) * 1.36, 3 + k * 2, Math.cos(k * 2.1) * 1.36, false));
        break;
      case 'frost_tower':
        g.add(this.cyl(1.3, 1.6, 6.0, this.mat(0x8aa0b8), 0, 3.0, 0, 8));
        g.add(this.cyl(1.8, 1.5, 0.5, this.mat(0x6a8098), 0, 6.2, 0, 8));
        { const c = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), this.mat(0x90e0ff, { emissive: 0x40b0ff, emissiveIntensity: 1 })); c.position.y = 7.8; c.castShadow = true; g.add(c); g.userData.orb = c; }
        for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), this.mat(0xc0f0ff, { emissive: 0x60c0ff, emissiveIntensity: 0.6 })); s.position.set(Math.sin(a) * 1.5, 6.7, Math.cos(a) * 1.5); g.add(s); }
        break;
      case 'cannon_tower': {
        g.add(this.box(3.6, 4.5, 3.6, st, 0, 2.25, 0));
        g.add(this.box(4.0, 0.5, 4.0, sd, 0, 4.75, 0));
        this.merlons(g, 4.0, 4.0, 5.25, 1.15);
        const t = new THREE.Group(); t.position.y = 5.2;
        t.add(this.cyl(0.32, 0.4, 2.6, this.mat(0x2a2a2e), 0, 0.6, 0.6, 10).rotateX(Math.PI / 2 - 0.25));
        t.add(this.box(1.2, 0.5, 1.0, wd, 0, 0.25, -0.2)); t.add(this.cyl(0.35, 0.35, 0.25, wd, -0.6, 0.35, -0.2, 8).rotateZ(Math.PI / 2)); t.add(this.cyl(0.35, 0.35, 0.25, wd, 0.6, 0.35, -0.2, 8).rotateZ(Math.PI / 2));
        g.add(t); g.userData.turret = t;
        break;
      }
      case 'lightning_tower': {
        g.add(this.cyl(1.0, 1.4, 7.5, this.mat(0x6a5a4a), 0, 3.75, 0, 8));
        for (let k = 0; k < 3; k++) g.add(new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 6, 14), this.mat(0xc08a40)).rotateX(Math.PI / 2).translateZ(-(2 + k * 2)));
        const orb = this.sphere(0.6, this.mat(0xc0e0ff, { emissive: 0x60a0ff, emissiveIntensity: 1.2 }), 0, 8.6, 0, 10); g.add(orb); g.userData.orb = orb;
        for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; g.add(this.cyl(0.05, 0.05, 1.6, this.mat(0xc08a40), Math.sin(a) * 0.9, 8.2, Math.cos(a) * 0.9, 5, false).rotateX(0.5 * Math.cos(a)).rotateZ(-0.5 * Math.sin(a))); }
        break;
      }
      case 'poison_tower': {
        g.add(this.cyl(1.3, 1.6, 5.0, this.mat(0x5a6a4a), 0, 2.5, 0, 8));
        g.add(this.cyl(1.7, 1.4, 0.6, wd, 0, 5.3, 0, 10));
        const vat = this.cyl(1.2, 1.0, 1.4, this.mat(0x3a4a3a), 0, 6.2, 0, 10); g.add(vat);
        const goo = this.cyl(1.1, 1.1, 0.2, this.mat(0x60ff60, { emissive: 0x30c030, emissiveIntensity: 0.9 }), 0, 6.95, 0, 10); g.add(goo); g.userData.orb = goo;
        for (let k = 0; k < 3; k++) g.add(this.sphere(0.18, this.mat(0x80ff80, { emissive: 0x30c030, emissiveIntensity: 0.8 }), Math.sin(k * 2.1) * 0.6, 7.2 + k * 0.3, Math.cos(k * 2.1) * 0.6, 6));
        break;
      }
      case 'watchtower': {
        for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) g.add(this.box(0.3, 10, 0.3, wd, x, 5, z));
        for (let y = 2.5; y < 9; y += 3) { g.add(this.box(3.4, 0.15, 0.15, wd, 0, y, -1.5)); g.add(this.box(3.4, 0.15, 0.15, wd, 0, y, 1.5)); g.add(this.box(0.15, 0.15, 3.4, wd, -1.5, y, 0)); g.add(this.box(0.15, 0.15, 3.4, wd, 1.5, y, 0)); }
        g.add(this.box(3.8, 0.3, 3.8, wd, 0, 10, 0));
        for (const [x, z] of [[-1.7, 0], [1.7, 0], [0, -1.7], [0, 1.7]]) g.add(this.box(x ? 0.15 : 3.8, 1.0, z ? 0.15 : 3.8, wd, x, 10.6, z));
        { const r = this.cone(3.0, 1.6, this.roof, 0, 12.2, 0, 4); r.rotation.y = Math.PI / 4; g.add(r); }
        this.flag(g, 0, 12.8, 0, 0x3060c0);
        break;
      }
      case 'barricade': {
        for (const s of [-1, 1]) { const b = this.box(0.25, 2.4, 0.25, wd, 0, 0.9, s * 0.35); b.rotation.x = s * 0.7; g.add(b); const sp = this.cone(0.12, 0.5, this.mat(0xcfd6dd), 0, 2.15, s * 1.0, 5); sp.rotation.x = s * 0.7; g.add(sp); }
        g.add(this.box(2.0, 0.25, 0.25, wd, 0, 1.1, 0));
        for (let k = -1; k <= 1; k++) { const sp = this.cone(0.1, 0.6, this.mat(0xcfd6dd), k * 0.7, 0.35, 0.6, 5); sp.rotation.x = -1.2; g.add(sp); }
        break;
      }
      case 'trap': {
        const plate = new THREE.Group();
        plate.add(this.box(1.7, 0.12, 1.7, this.mat(0x5a5248), 0, 0.06, 0));
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) plate.add(this.cone(0.1, 0.7, this.mat(0xcfd6dd), a * 0.5, 0.45, b * 0.5, 5));
        g.add(plate); g.userData.plate = plate;
        break;
      }
      case 'market': {
        g.add(this.box(5.0, 0.4, 5.0, this.plaster, 0, 0.2, 0));
        for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) g.add(this.box(0.25, 3.2, 0.25, wd, x, 1.6, z));
        { const awn = this.box(5.4, 0.2, 5.4, this.mat(0xc04040), 0, 3.3, 0); g.add(awn); }
        for (let k = 0; k < 5; k++) g.add(this.box(1.0, 0.1, 5.4, this.mat(k % 2 ? 0xf0e0c0 : 0xc04040), -2.0 + k * 1.0, 3.42, 0, false));
        g.add(this.box(3.6, 0.9, 1.2, wd, 0, 0.85, 1.4));
        for (let k = 0; k < 4; k++) g.add(this.sphere(0.25, this.mat([0xd04030, 0xe0b040, 0x60a040, 0xe08030][k]), -1.2 + k * 0.8, 1.45, 1.4, 6));
        g.add(this.box(1.2, 1.0, 1.2, wd, -1.4, 0.9, -1.2)); g.add(this.box(1.2, 1.0, 1.2, wd, 1.2, 0.9, -1.4));
        break;
      }
      case 'tavern': {
        g.add(this.box(5.2, 3.4, 4.8, this.plaster, 0, 1.7, 0));
        g.add(this.box(5.4, 1.2, 5.0, wd, 0, 0.6, 0));
        { const r = this.cone(4.2, 2.2, this.mat(0x5a3a2a), 0, 4.5, 0, 4); r.rotation.y = Math.PI / 4; g.add(r); }
        g.add(this.box(0.7, 2.0, 0.7, st, 1.6, 5.2, -1.2));
        g.add(this.box(1.1, 2.0, 0.3, wd, 0, 1.0, 2.45));
        for (const x of [-1.7, 1.7]) g.add(this.box(0.9, 0.8, 0.2, this.mat(0xffd070, { emissive: 0xa06010, emissiveIntensity: 0.6 }), x, 2.0, 2.45, false));
        g.add(this.box(0.1, 1.4, 0.1, wd, 2.9, 3.0, 2.2, false)); g.add(this.box(1.2, 0.8, 0.08, this.mat(0x8a5a2a), 2.9, 3.4, 2.7, false));
        g.add(this.cyl(0.35, 0.35, 0.7, wd, -2.6, 0.35, 2.6, 8)); g.add(this.cyl(0.35, 0.35, 0.7, wd, 2.2, 0.35, -2.7, 8));
        break;
      }
      case 'barracks':
        g.add(this.box(5.4, 3.2, 5.4, this.plaster, 0, 1.6, 0));
        g.add(this.box(5.6, 1.0, 5.6, wd, 0, 0.5, 0));
        { const r = this.cone(4.4, 2.4, this.roof, 0, 4.4, 0, 4); r.rotation.y = Math.PI / 4; g.add(r); }
        g.add(this.box(1.2, 2.0, 0.3, wd, 0, 1.0, 2.75));
        for (const x of [-1.8, 1.8]) g.add(this.box(0.8, 0.8, 0.2, this.mat(0x3a5a8a), x, 2.0, 2.75, false));
        this.flag(g, 2.2, 5.0, 2.2, 0x3060c0);
        { const rack = this.box(2.0, 1.2, 0.2, wd, -1.6, 0.6, -2.9); g.add(rack); for (let k = 0; k < 4; k++) g.add(this.box(0.06, 1.0, 0.06, this.mat(0xcfd6dd), -2.3 + k * 0.45, 0.9, -3.05, false)); }
        break;
      case 'farm':
        g.add(this.box(2.2, 2.0, 2.2, this.plaster, -1.6, 1.0, -1.6));
        { const r = this.cone(1.8, 1.4, this.roof, -1.6, 2.7, -1.6, 4); r.rotation.y = Math.PI / 4; g.add(r); }
        for (let row = 0; row < 4; row++) g.add(this.box(3.2, 0.35, 0.5, this.mat(row % 2 ? 0xb8a040 : 0x8aa040), 1.2, 0.18, -1.9 + row * 0.9, false));
        for (let row = 0; row < 3; row++) g.add(this.box(0.5, 0.35, 2.6, this.mat(row % 2 ? 0xb8a040 : 0x8aa040), -2.0 + row * 0.8, 0.18, 1.6, false));
        for (let k = 0; k < 6; k++) g.add(this.box(0.12, 0.8, 0.12, wd, -2.8 + k * 1.1, 0.4, 2.85, false));
        g.add(this.box(5.6, 0.08, 0.08, wd, 0, 0.7, 2.85, false));
        break;
      case 'mine':
        g.add(this.sphere(2.2, this.mat(0x7a6a5a), 0, -0.6, -0.3, 8));
        g.add(this.box(0.3, 2.2, 0.3, wd, -0.9, 1.1, 1.5)); g.add(this.box(0.3, 2.2, 0.3, wd, 0.9, 1.1, 1.5));
        g.add(this.box(2.2, 0.3, 0.3, wd, 0, 2.2, 1.5));
        g.add(this.box(1.5, 1.9, 0.2, this.mat(0x1a1410), 0, 0.95, 1.4, false));
        for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), this.gold); c.position.set(-1.3 + k * 0.9, 1.4 + (k % 2) * 0.4, -0.8 + (k % 2) * 0.5); g.add(c); }
        g.add(this.box(0.7, 0.5, 0.9, wd, 1.8, 0.25, 1.9));
        break;
      case 'blacksmith':
        g.add(this.box(5.0, 3.0, 4.6, sd, 0, 1.5, 0));
        { const r = this.cone(4.0, 2.0, this.mat(0x3a3a40), 0, 4.0, 0, 4); r.rotation.y = Math.PI / 4; g.add(r); }
        g.add(this.box(0.8, 5.5, 0.8, st, 1.6, 2.75, -1.2));
        g.add(this.box(1.6, 1.0, 1.0, this.mat(0xff7020, { emissive: 0xff4000, emissiveIntensity: 1.0 }), -1.6, 0.9, 2.6, false));
        g.add(this.box(0.9, 0.5, 0.5, this.mat(0x2a2a2a), 1.0, 0.75, 2.6)); g.add(this.box(0.4, 0.5, 0.4, wd, 1.0, 0.25, 2.6));
        g.add(this.box(1.6, 1.4, 0.2, wd, 0, 0.7, 2.35));
        break;
      case 'shrine':
        g.add(this.cyl(1.9, 1.9, 0.4, this.mat(0xe8e4d8), 0, 0.2, 0, 12));
        for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; g.add(this.cyl(0.22, 0.22, 3.0, this.mat(0xf0ecdc), Math.sin(a) * 1.4, 1.9, Math.cos(a) * 1.4, 8)); }
        g.add(this.cyl(1.9, 1.9, 0.3, this.mat(0xe8e4d8), 0, 3.5, 0, 12));
        { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), this.mat(0xa0ffc0, { emissive: 0x40ff80, emissiveIntensity: 1 })); c.position.y = 1.7; g.add(c); g.userData.orb = c; }
        break;
      case 'icewall': {
        const ice = new THREE.MeshLambertMaterial({ color: 0xa8e0ff, emissive: 0x2060a0, emissiveIntensity: 0.35, transparent: true, opacity: 0.75 });
        g.add(this.box(2, 2.8, 1.6, ice, 0, 1.4, 0));
        for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), ice); s.position.set(-0.6 + k * 0.6, 2.9 + (k % 2) * 0.25, 0); g.add(s); }
        break;
      }
      case 'dragon_roost': {
        const crag = this.mat(0x5a4a44);
        for (const [x, z, r, hgt] of [[-1.6, -1.4, 1.6, 2.2], [1.7, -1.2, 1.4, 3.0], [0.2, 1.6, 1.5, 1.8], [-1.2, 1.2, 1.1, 2.6], [1.3, 1.4, 1.0, 1.4]]) { const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), crag); rk.position.set(x, hgt * 0.35, z); rk.scale.set(1, hgt / r * 0.5, 1); rk.rotation.set(0.3, x * 1.3, 0.2); rk.castShadow = true; rk.receiveShadow = true; g.add(rk); }
        const nest = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.35, 8, 18), this.mat(0x6a4a2a)); nest.rotation.x = Math.PI / 2; nest.position.y = 1.35; nest.castShadow = true; g.add(nest);
        for (let k = 0; k < 3; k++) { const egg = this.sphere(0.32, this.mat(0xe8d8b0), Math.sin(k * 2.1) * 0.7, 1.55, Math.cos(k * 2.1) * 0.7, 12); egg.scale.y = 1.35; g.add(egg); }
        for (let k = 0; k < 4; k++) g.add(this.cyl(0.05, 0.08, 1.2, this.mat(0xe8e0d0), Math.sin(k * 1.6) * 2.4, 0.5, Math.cos(k * 1.6) * 2.4, 5, false).rotateZ(0.6 + k * 0.4));
        g.userData.torches = [this.torch(g, 2.4, 1.0, 2.4)];
        break;
      }
      case 'titan_forge': {
        const dark = this.mat(0x3a3a40), iron = this.mat(0x6a6e78);
        g.add(this.box(5.4, 3.2, 4.6, dark, 0, 1.6, 0));
        g.add(this.box(5.8, 0.4, 5.0, iron, 0, 3.4, 0));
        g.add(this.cyl(0.5, 0.7, 3.0, dark, -1.6, 4.9, -1.2, 10));
        { const smoke = this.flameSprite(1.6, 0xff8040); smoke.position.set(-1.6, 6.8, -1.2); g.add(smoke); }
        g.add(this.box(2.0, 1.4, 0.3, this.mat(0xff7020, { emissive: 0xff4000, emissiveIntensity: 1.2 }), 0, 1.2, 2.32, false));   // furnace mouth
        g.add(this.box(1.2, 0.5, 0.6, iron, 1.4, 3.85, 0.4)); g.add(this.box(0.5, 0.6, 0.5, dark, 1.4, 3.45, 0.4));                 // anvil
        g.add(this.box(0.3, 0.25, 0.3, this.mat(0xffc040, { emissive: 0xff8000, emissiveIntensity: 0.9 }), 1.4, 4.2, 0.4, false));
        for (const x of [-2.3, 2.3]) g.add(this.cyl(0.35, 0.4, 3.4, iron, x, 1.7, 2.3, 10));
        g.userData.torches = [this.torch(g, -2.9, 2.2, 2.4), this.torch(g, 2.9, 2.2, 2.4)];
        break;
      }
      case 'arcane_spire': {
        const violet = this.mat(0x4a3a6a), pale = this.mat(0x9a80c0);
        g.add(this.cyl(1.6, 1.9, 1.2, pale, 0, 0.6, 0, 8));
        g.add(this.cyl(0.9, 1.3, 9.0, violet, 0, 5.7, 0, 10));
        for (let k = 0; k < 4; k++) g.add(new THREE.Mesh(new THREE.TorusGeometry(1.15 - k * 0.08, 0.1, 6, 16), pale).rotateX(Math.PI / 2).translateZ(-(2 + k * 2.2)));
        g.add(this.cone(1.5, 2.4, this.mat(0x2a1a4a), 0, 11.3, 0, 10));
        const orb = this.sphere(0.8, this.mat(0xd0a0ff, { emissive: 0xa050ff, emissiveIntensity: 1.2 }), 0, 13.2, 0, 14); g.add(orb); g.userData.orb = orb;
        g.userData.orbiters = [];
        for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), this.mat(0xe0c0ff, { emissive: 0xb070ff, emissiveIntensity: 1 })); c.position.set(Math.sin(k * 2.1) * 1.9, 9.5, Math.cos(k * 2.1) * 1.9); g.add(c); g.userData.orbiters.push(c); }
        for (let k = 0; k < 4; k++) g.add(this.box(0.4, 0.8, 0.2, this.mat(0xc090ff, { emissive: 0x8040ff, emissiveIntensity: 0.8 }), Math.sin(k * 1.57) * 1.1, 4 + k * 1.6, Math.cos(k * 1.57) * 1.1, false).rotateY(k * 1.57));
        break;
      }
      case 'sun_altar': {
        const gold = this.mat(0xe0b040, { emissive: 0x604000, emissiveIntensity: 0.25 }), pale = this.plaster;
        g.add(this.cyl(2.0, 2.2, 0.5, pale, 0, 0.25, 0, 16)); g.add(this.cyl(1.6, 1.8, 0.5, pale, 0, 0.75, 0, 16)); g.add(this.cyl(1.2, 1.4, 0.5, gold, 0, 1.25, 0, 16));
        for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; const leg = this.cyl(0.08, 0.1, 5.0, gold, Math.sin(a) * 1.0, 3.8, Math.cos(a) * 1.0, 6); leg.rotation.set(-Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2); g.add(leg); }
        g.add(new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 6, 20), gold).rotateX(Math.PI / 2).translateZ(-6.1));
        const lens = this.sphere(0.75, this.mat(0xfff0a0, { emissive: 0xffd040, emissiveIntensity: 1.3 }), 0, 6.3, 0, 16); g.add(lens); g.userData.orb = lens;
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softDot(), color: 0xffe080, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.setScalar(4); halo.position.y = 6.3; g.add(halo);
        break;
      }
      case 'royal_treasury': {
        const gold = this.mat(0xe0b040, { emissive: 0x503000, emissiveIntensity: 0.2 });
        g.add(this.box(5.4, 3.4, 5.0, st, 0, 1.7, 0));
        g.add(this.box(5.8, 0.4, 5.4, sd, 0, 3.6, 0));
        for (const [x, z] of [[-2.2, 2.6], [2.2, 2.6], [-2.2, -2.6], [2.2, -2.6]]) g.add(this.cyl(0.3, 0.35, 3.4, this.plaster, x, 1.7, z, 10));
        g.add(new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold).translateY(3.8));
        g.add(this.cyl(0.12, 0.12, 1.0, gold, 0, 6.4, 0, 6, false)); g.add(this.sphere(0.25, gold, 0, 6.9, 0, 10));
        g.add(this.box(1.4, 2.2, 0.3, this.mat(0x5a3a1a), 0, 1.1, 2.55)); g.add(this.box(0.2, 0.2, 0.1, gold, 0.4, 1.1, 2.72, false));
        for (let k = 0; k < 6; k++) g.add(this.box(0.5, 0.5, 0.5, sd, -2.5 + k, 4.0, 2.6));
        g.userData.torches = [this.torch(g, -1.2, 2.4, 2.7), this.torch(g, 1.2, 2.4, 2.7)];
        break;
      }
      case 'keep': {
        const H = 9;
        g.add(this.box(6, H, 0.8, st, 0, H / 2, -2.6));           // north
        g.add(this.box(0.8, H, 6, st, -2.6, H / 2, 0));           // west
        g.add(this.box(0.8, H, 6, st, 2.6, H / 2, 0));            // east
        g.add(this.box(2, H, 0.8, st, -2, H / 2, 2.6));           // south-west
        g.add(this.box(2, H, 0.8, st, 2, H / 2, 2.6));            // south-east
        g.add(this.box(2, H - 3.8, 0.8, st, 0, 3.8 + (H - 3.8) / 2, 2.6)); // lintel above door
        for (const [x, z] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]) {
          g.add(this.cyl(0.6, 0.7, H + 1.5, sd, x, (H + 1.5) / 2, z, 10));
          g.add(this.cone(0.95, 1.5, this.mat(0x3a4a8a), x, H + 2.2, z, 10));
        }
        this.merlons(g, 6, 6, H + 0.25, 1.0);
        g.userData.torches = [this.torch(g, -1.3, 3.2, 3.0), this.torch(g, 1.3, 3.2, 3.0)];
        g.add(this.box(5.2, 0.2, 5.2, this.mat(0x7a7268), 0, 0.1, 0, false));
        g.add(this.box(1.4, 0.05, 5.0, this.mat(0x7a1030), 0, 0.23, 0.2, false));
        g.add(this.box(1.2, 0.5, 1.0, this.gold, 0, 0.45, -1.4)); g.add(this.box(1.2, 1.6, 0.25, this.gold, 0, 1.3, -1.8));
        this.flag(g, 0, H + 0.5, -2.6, 0xc02030);
        break;
      }
    }
    // level bands for towers
    if (def.tower && level > 1) {
      for (let l = 2; l <= level; l++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(W, D) / 2 + 0.1, 0.12, 6, 16), this.gold);
        ring.rotation.x = Math.PI / 2; ring.position.y = 1.2 + (l - 2) * 0.8; g.add(ring);
      }
    }
    return g;
  },

  ghost(def, rot) {
    const g = this.building(def, 1);
    g.traverse(o => { if (o.isMesh) { o.material = this.mat(0x40ff80, { transparent: true, opacity: 0.45 }); o.castShadow = false; o.receiveShadow = false; } });
    return g;
  },
  setGhostValid(g, ok, site = false) {
    const m = this.mat(ok ? (site ? 0xffb347 : 0x40ff80) : 0xff4040, { transparent: true, opacity: 0.45 });
    g.traverse(o => { if (o.isMesh) o.material = m; });
  },

  // ------------------------------------------------------------- projectiles
  projectile(model, color) {
    switch (model) {
      case 'arrow': {
        const g = new THREE.Group();
        g.add(this.cyl(0.03, 0.03, 0.9, this.mat(0x9a7a4a), 0, 0, 0, 4, false).rotateX(Math.PI / 2));
        g.add(this.cone(0.06, 0.2, this.mat(0xcfd6dd), 0, 0, 0.5, 4).rotateX(Math.PI / 2));
        return g;
      }
      case 'ballista': {
        const g = new THREE.Group();
        g.add(this.cyl(0.07, 0.07, 1.8, this.mat(0x5a4a3a), 0, 0, 0, 5, false).rotateX(Math.PI / 2));
        g.add(this.cone(0.14, 0.4, this.mat(0xcfd6dd), 0, 0, 1.0, 5).rotateX(Math.PI / 2));
        return g;
      }
      case 'fireball': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), this.mat(0xffa040, { emissive: 0xff4000, emissiveIntensity: 1.2 }));
        return m;
      }
      case 'boulder': {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), this.mat(0x6a655c));
        m.castShadow = true; return m;
      }
      case 'bolt':
      default: {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), this.mat(color || 0x80ff80, { emissive: color || 0x40ff40, emissiveIntensity: 1.3 }));
        return m;
      }
    }
  },

  // ------------------------------------------------------------- misc
  _barGeo: null,
  _barVert: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  _barFrag: `
    uniform float frac; uniform vec3 color; uniform float aspect; uniform float alpha;
    varying vec2 vUv;
    float rbox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
    void main() {
      vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
      float rad = 0.42;
      float dO = rbox(p, vec2(aspect * 0.5, 0.5), rad);
      float aa = max(fwidth(dO), 0.004) * 1.1;
      float outer = 1.0 - smoothstep(-aa, aa, dO);
      if (outer < 0.01) discard;
      float bw = 0.15;
      float dI = rbox(p, vec2(aspect * 0.5 - bw, 0.5 - bw), rad - bw);
      float inner = 1.0 - smoothstep(-aa, aa, dI);
      float fillEdge = frac * aspect - (p.x + aspect * 0.5);
      float fillMask = smoothstep(-aa, aa, fillEdge);
      vec3 border = vec3(0.05, 0.04, 0.06);
      vec3 empty = vec3(0.20, 0.10, 0.10);
      vec3 fill = color * (0.78 + 0.45 * vUv.y);
      vec3 col = mix(border, mix(empty, fill, fillMask), inner);
      gl_FragColor = vec4(col, outer * alpha);
    }`,
  // crisp rounded health pill drawn in a shader: one plane, per-bar uniforms
  healthBar(width = 1.2, height = 0.17) {
    if (!this._barGeo) this._barGeo = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      uniforms: { frac: { value: 1 }, color: { value: new THREE.Color(0x5ee07a) }, aspect: { value: width / height }, alpha: { value: 0.96 } },
      vertexShader: this._barVert, fragmentShader: this._barFrag, transparent: true, depthTest: false, depthWrite: false,
      extensions: { derivatives: true },
    });
    const mesh = new THREE.Mesh(this._barGeo, mat);
    mesh.scale.set(width, height, 1); mesh.renderOrder = 999;
    g.add(mesh);
    const bar = { group: g, mesh, mat, width, frac: 1, depth: false,
      set(f) { f = Math.max(0, Math.min(1, f)); this.frac = f; mat.uniforms.frac.value = f; },
      setColor(hex) { if (this._col !== hex) { this._col = hex; mat.uniforms.color.value.setHex(hex); } },
      face(q) { g.quaternion.copy(q); },
      setDepth(on) { if (on === this.depth) return; this.depth = on; mat.depthTest = on; mat.needsUpdate = true; } };
    return bar;
  },
  ring(radius, color, opacity = 0.85) {
    const m = new THREE.Mesh(new THREE.RingGeometry(radius * 0.8, radius, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.06; m.renderOrder = 5;
    return m;
  },
  disc(radius, color, opacity = 0.35) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.renderOrder = 4;
    return m;
  },
  tree() {
    const g = new THREE.Group();
    const h = U.rand(0.8, 1.4);
    g.add(this.cyl(0.16, 0.34, 1.6 * h, this.mat(0x5a3a22), 0, 0.8 * h, 0, 9));
    const leaf = this.mat(U.choice([0x2f6b2f, 0x3a7a35, 0x2a5a30]));
    g.add(this.cone(1.5 * h, 2.2 * h, leaf, 0, 2.0 * h, 0, 10));
    g.add(this.cone(1.2 * h, 2.0 * h, leaf, 0, 3.0 * h, 0, 10));
    g.add(this.cone(0.8 * h, 1.7 * h, leaf, 0, 4.0 * h, 0, 10));
    g.rotation.y = Math.random() * Math.PI * 2;
    return g;
  },
  rock() {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(U.rand(0.5, 1.4), 1), this.mat(U.choice([0x777770, 0x8a8a80, 0x6a6a64])));
    m.scale.set(U.rand(0.7, 1.4), U.rand(0.5, 0.9), U.rand(0.7, 1.4));
    m.rotation.set(Math.random(), Math.random() * 3, Math.random());
    m.position.y = 0.1; m.castShadow = true; m.receiveShadow = true;
    return m;
  },
  ground() {
    const size = 200, seg = 100;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const n = U.smoothNoise(x * 0.08 + 50, z * 0.08 + 50) * 0.6 + U.smoothNoise(x * 0.3, z * 0.3) * 0.4;
      const r = Math.max(Math.abs(x), Math.abs(z));
      let base = new THREE.Color(0x4f8a3a).lerp(new THREE.Color(0x7aa14a), n);
      if (r > DATA.BUILD_RADIUS + 1) base.lerp(new THREE.Color(0x5a7a3a), 0.35);
      if (r > 78) base.lerp(new THREE.Color(0x3a5a2a), 0.5);
      c.copy(base);
      colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    return mesh;
  },
  // first-person view model attached to the camera
  viewWeapon(kind) {
    const g = new THREE.Group();
    const w = this.weapon(kind, this.mat(0xff8040, { emissive: 0xff5010, emissiveIntensity: 0.8 }));
    w.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    if (kind === 'bow') { w.rotation.set(0.1, -0.55, 0.25); w.position.set(-0.22, -0.28, -0.75); w.scale.setScalar(0.42); }
    else if (kind === 'staff') { w.rotation.set(0.25, Math.PI + 0.25, 0.15); w.position.set(0.3, -0.42, -0.55); w.scale.setScalar(0.45); }
    else if (kind === 'pike') { w.rotation.set(0.12, Math.PI + 0.12, 0.05); w.position.set(0.28, -0.3, -0.45); w.scale.setScalar(0.45); }
    else { w.rotation.set(0.3, Math.PI - 0.35, 0.25); w.position.set(0.28, -0.18, -0.55); w.scale.setScalar(0.55); }
    g.add(w);
    g.userData.weapon = w;
    g.userData.base = { pos: w.position.clone(), rot: w.rotation.clone() };
    return g;
  },
};
