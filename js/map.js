'use strict';

// ===========================================================================
// World generation: a seeded layout with a river and fords, rock outcrops,
// dense forests and rolling hills. Water and rock cells are impassable for
// ground units and cannot be built on; every spawn point is guaranteed a path.
// ===========================================================================
const CELL_WATER = 3, CELL_ROCK = 4;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class WorldMap {
  constructor(seed, type = 'valley') {
    this.seed = seed >>> 0;
    this.type = DATA.mapTypes[type] ? type : 'valley';
    this.cfg = DATA.mapTypes[this.type];
    this.n = DATA.GRID; this.cell = DATA.CELL; this.half = this.n / 2;
    this.kind = new Uint8Array(this.n * this.n);       // natural obstacle per cell: 0 free, CELL_WATER, CELL_ROCK, 5 forest (rock-like)
    this.hs = this.n + 1;                                // height samples (one per cell corner)
    this.h = new Float32Array(this.hs * this.hs);
    this.h0 = new Float32Array(this.hs * this.hs);       // the same without the river/marsh carve
    this.fords = []; this.river = []; this.rocks = []; this.forests = [];
    this.generate();
  }
  idx(i, j) { return j * this.n + i; }
  inBounds(i, j) { return i >= 0 && j >= 0 && i < this.n && j < this.n; }
  kindAt(i, j) { return this.inBounds(i, j) ? this.kind[this.idx(i, j)] : CELL_ROCK; }
  cellCenter(i, j) { return { x: (i - this.half) * this.cell, z: (j - this.half) * this.cell }; }

  // ---------------------------------------------------------------- terrain height
  baseHeight(x, z) {
    const r = Math.max(Math.abs(x), Math.abs(z));
    const t = U.clamp((r - (DATA.BUILD_RADIUS + 4)) / 22, 0, 1);
    const s = t * t * (3 - 2 * t);
    const n = U.smoothNoise(x * 0.045 + this.seed % 97, z * 0.045 + this.seed % 89) * 0.7 + U.smoothNoise(x * 0.12 + 3, z * 0.12 + 7) * 0.3;
    return s * n * 7 * (this.cfg ? this.cfg.hills : 1);
  }
  heightAt(x, z, arr) {
    x = U.clamp(x, -DATA.MAP_HALF, DATA.MAP_HALF); z = U.clamp(z, -DATA.MAP_HALF, DATA.MAP_HALF);
    const fx = x / this.cell + this.half, fz = z / this.cell + this.half;
    const i = U.clamp(Math.floor(fx), 0, this.hs - 2), j = U.clamp(Math.floor(fz), 0, this.hs - 2);
    const tx = U.clamp(fx - i, 0, 1), tz = U.clamp(fz - j, 0, 1);
    const h = arr || this.h, w = this.hs;
    const a = h[j * w + i], b = h[j * w + i + 1], c = h[(j + 1) * w + i], d = h[(j + 1) * w + i + 1];
    return U.lerp(U.lerp(a, b, tx), U.lerp(c, d, tx), tz);
  }

  // ---------------------------------------------------------------- layout
  generate() {
    for (let attempt = 0; attempt < 30; attempt++) {
      const rnd = mulberry32(this.seed + attempt * 7919);
      this.kind.fill(0); this.fords = []; this.river = []; this.rocks = []; this.forests = []; this.lakes = []; this.chests = [];
      const cfg = this.cfg, t = this.type;
      const pick = (r) => r[0] + Math.floor(rnd() * (r[1] - r[0] + 1));
      if (t === 'valley') {
        this.layRiver(rnd); this.layTributary(rnd);
        this.layBlobs(rnd, pick(cfg.rocks), CELL_ROCK, [1.5, 3.2], 1, this.rocks);
        this.layBlobs(rnd, pick(cfg.forests), 5, [2.6, 4.6], 0.8, this.forests);
        this.layMarshNearWater(rnd, 3);
      } else if (t === 'highlands') {
        this.layRidges(rnd);
        this.layBlobs(rnd, 2, CELL_WATER, [2.6, 4.2], 1, this.lakes);
        this.layBlobs(rnd, pick(cfg.rocks), CELL_ROCK, [1.4, 2.4], 1, this.rocks);
        this.layBlobs(rnd, pick(cfg.forests), 5, [2.2, 3.6], 0.8, this.forests);
      } else if (t === 'darkwood') {
        this.layRiver(rnd);
        this.layForestBelt(rnd);
        this.layBlobs(rnd, pick(cfg.forests), 5, [2.5, 4], 0.8, this.forests);
        this.layBlobs(rnd, pick(cfg.rocks), CELL_ROCK, [1.4, 2.6], 1, this.rocks);
        this.layMarshNearWater(rnd, 2);
      } else if (t === 'badlands') {
        this.layCanyons(rnd);
        this.layBlobs(rnd, pick(cfg.rocks), CELL_ROCK, [1.4, 2.6], 1, this.rocks);
        this.layBlobs(rnd, 1, CELL_WATER, [2, 3], 1, this.lakes);
      } else if (t === 'frozen') {
        this.layBlobs(rnd, 3, CELL_WATER, [2.6, 4.5], 1, this.lakes);
        this.layBlobs(rnd, 5, 7, [2.2, 3.8], 0.9, []);
        this.layBlobs(rnd, pick(cfg.rocks), CELL_ROCK, [1.4, 2.8], 1, this.rocks);
        this.layBlobs(rnd, pick(cfg.forests), 5, [2, 3.2], 0.8, this.forests);
      } else if (t === 'volcanic') {
        this.layRiver(rnd, 8);
        this.layBlobs(rnd, 2, 8, [2, 3.4], 1, this.lakes);
        this.layBlobs(rnd, pick(cfg.rocks), CELL_ROCK, [1.2, 2.4], 1, this.rocks);
      }
      if (this.connected()) { this.usedSeed = this.seed + attempt * 7919; break; }
      if (attempt === 29) { this.usedSeed = this.seed + attempt * 7919; this.carveOpen(); }
    }
    this.layRoads();
    this.placeChests(mulberry32(this.usedSeed + 99));
    this.bakeHeights();
  }
  blocked(k) { return k === CELL_WATER || k === CELL_ROCK || k === 5 || k === 8; }
  // a thinner second stream from a random edge that joins the main river
  layTributary(rnd) {
    if (!this.river.length) return;
    const h = this.half, join = this.river[2 + Math.floor(rnd() * 3)];
    const side = Math.floor(rnd() * 4);
    const start = side === 0 ? { i: 2 + rnd() * (this.n - 4), j: 1 } : side === 1 ? { i: 2 + rnd() * (this.n - 4), j: this.n - 2 } : side === 2 ? { i: 1, j: 2 + rnd() * (this.n - 4) } : { i: this.n - 2, j: 2 + rnd() * (this.n - 4) };
    const mid = { i: (start.i + join.i) / 2 + (rnd() - 0.5) * 12, j: (start.j + join.j) / 2 + (rnd() - 0.5) * 12 };
    const pts = [start, mid, join];
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
      const c = this.cellCenter(i, j);
      if (Math.max(Math.abs(c.x), Math.abs(c.z)) <= 22) continue;
      if (this.distToPolyline(i, j, pts) <= 0.8 && !this.kind[this.idx(i, j)]) this.kind[this.idx(i, j)] = CELL_WATER;
    }
    // one ford on the tributary
    const p = this.pointOnPolyline(pts, 0.45); this.fords.push(p);
    for (let j = Math.floor(p.j) - 3; j <= Math.floor(p.j) + 3; j++) for (let i = Math.floor(p.i) - 3; i <= Math.floor(p.i) + 3; i++) if (this.inBounds(i, j) && Math.hypot(i + 0.5 - p.i, j + 0.5 - p.j) <= 2.2 && this.kind[this.idx(i, j)] === CELL_WATER) this.kind[this.idx(i, j)] = 0;
  }
  // bog next to water: walkable but slow
  layMarshNearWater(rnd, count) {
    const waterCells = [];
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) if (this.kind[this.idx(i, j)] === CELL_WATER) waterCells.push([i, j]);
    let placed = 0, guard = 0;
    while (placed < count && waterCells.length && guard++ < 60) {
      const [wi, wj] = waterCells[Math.floor(rnd() * waterCells.length)];
      const c = this.cellCenter(wi, wj);
      if (Math.max(Math.abs(c.x), Math.abs(c.z)) < 26) continue;
      const r = 2 + rnd() * 1.8;
      for (let j = wj - 4; j <= wj + 4; j++) for (let i = wi - 4; i <= wi + 4; i++) {
        if (!this.inBounds(i, j) || this.kind[this.idx(i, j)]) continue;
        const cc = this.cellCenter(i, j); if (Math.max(Math.abs(cc.x), Math.abs(cc.z)) < 24) continue;
        if (Math.hypot(i - wi, j - wj) <= r * (0.8 + 0.4 * U.smoothNoise(i * 0.6, j * 0.6))) this.kind[this.idx(i, j)] = 7;
      }
      placed++;
    }
  }
  // two rings of ridge with a few passes each
  layRidges(rnd) {
    const h = this.half;
    for (const [rc, thick, gaps] of [[19, 1.4, 3], [31, 1.8, 4]]) {
      const gapAngles = []; for (let g = 0; g < gaps; g++) gapAngles.push(rnd() * Math.PI * 2);
      const phase = rnd() * 10;
      for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
        const dx = i + 0.5 - h - 0.5, dz = j + 0.5 - h - 0.5;
        const ang = Math.atan2(dz, dx), r = Math.hypot(dx, dz);
        const wob = rc + Math.sin(ang * 3 + phase) * 1.6 + Math.sin(ang * 7 + phase * 2) * 0.8;
        if (Math.abs(r - wob) > thick) continue;
        if (gapAngles.some(ga => Math.abs(Math.atan2(Math.sin(ang - ga), Math.cos(ang - ga))) < 0.28)) continue;
        const c = this.cellCenter(i, j);
        if (DATA.spawnPoints.some(sp => U.dist(sp.x, sp.z, c.x, c.z) < 12)) continue;
        if (!this.kind[this.idx(i, j)]) this.kind[this.idx(i, j)] = CELL_ROCK;
      }
    }
  }
  // a forest annulus with lanes and clearings
  layForestBelt(rnd) {
    const h = this.half, r0 = 17, r1 = 26;
    const lanes = []; for (let k = 0; k < 4; k++) lanes.push(k * Math.PI / 2 + (rnd() - 0.5) * 0.8);
    const clearings = []; for (let k = 0; k < 3; k++) clearings.push({ a: rnd() * Math.PI * 2, r: r0 + 2 + rnd() * (r1 - r0 - 4), rad: 2 + rnd() * 1.5 });
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
      if (this.kind[this.idx(i, j)]) continue;
      const dx = i + 0.5 - h - 0.5, dz = j + 0.5 - h - 0.5;
      const ang = Math.atan2(dz, dx), r = Math.hypot(dx, dz);
      const edge = 1.2 * U.smoothNoise(i * 0.5 + 3, j * 0.5 + 9);
      if (r < r0 + edge || r > r1 - edge) continue;
      if (lanes.some(la => Math.abs(Math.atan2(Math.sin(ang - la), Math.cos(ang - la))) < 0.11)) continue;
      if (clearings.some(cl => Math.hypot(dx - Math.cos(cl.a) * cl.r, dz - Math.sin(cl.a) * cl.r) < cl.rad)) continue;
      this.kind[this.idx(i, j)] = 5;
    }
  }
  // radial canyon walls with breaks
  layCanyons(rnd) {
    const h = this.half, n = 5 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const ang = k / n * Math.PI * 2 + (rnd() - 0.5) * 0.5, wob = rnd() * 10;
      const gapAt = 18 + rnd() * 10, gap2 = 30 + rnd() * 6;
      for (let r = 14; r < 36; r += 0.5) {
        if (Math.abs(r - gapAt) < 1.6 || Math.abs(r - gap2) < 1.4) continue;
        const a = ang + Math.sin(r * 0.35 + wob) * 0.12;
        const i = Math.round(h + Math.cos(a) * r), j = Math.round(h + Math.sin(a) * r);
        for (let dj = 0; dj <= 0; dj++) for (let di = 0; di <= 0; di++) {
          if (!this.inBounds(i + di, j + dj) || this.kind[this.idx(i + di, j + dj)]) continue;
          const c = this.cellCenter(i + di, j + dj);
          if (DATA.spawnPoints.some(sp => U.dist(sp.x, sp.z, c.x, c.z) < 12)) continue;
          this.kind[this.idx(i + di, j + dj)] = CELL_ROCK;
        }
      }
    }
  }
  // dirt roads: the shortest walkable route from each spawn point to the gate
  layRoads() {
    const h = this.half, n = this.n;
    const target = this.idx(h, h + 12);
    const passable = (k) => !this.blocked(this.kind[k]);
    const dist = new Int32Array(n * n).fill(-1), prev = new Int32Array(n * n).fill(-1);
    const q = [target]; dist[target] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi]; const i = k % n, j = (k - i) / n;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj; if (!this.inBounds(ni, nj)) continue;
        const nk = this.idx(ni, nj); if (dist[nk] >= 0 || !passable(nk)) continue;
        dist[nk] = dist[k] + (this.kind[nk] === 7 ? 3 : 1); prev[nk] = k; q.push(nk);
      }
    }
    for (const sp of DATA.spawnPoints) {
      let i = Math.floor(sp.x / this.cell + h + 0.5), j = Math.floor(sp.z / this.cell + h + 0.5);
      let k = this.idx(i, j);
      if (dist[k] < 0) { let best = -1, bd = 1e9; for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const a = i + di, b = j + dj; if (this.inBounds(a, b) && dist[this.idx(a, b)] >= 0) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = this.idx(a, b); } } } k = best; }
      let guard = 0;
      while (k >= 0 && k !== target && guard++ < 4000) { if (this.kind[k] === 0) { const c = this.cellCenter(k % n, (k - k % n) / n); if (Math.max(Math.abs(c.x), Math.abs(c.z)) > 21) this.kind[k] = 6; } k = prev[k]; }
    }
  }
  placeChests(rnd) {
    const h = this.half;
    let guard = 0;
    while (this.chests.length < 4 && guard++ < 200) {
      const ang = rnd() * Math.PI * 2, rad = 34 + rnd() * 38;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const i = Math.floor(x / this.cell + h + 0.5), j = Math.floor(z / this.cell + h + 0.5);
      if (!this.inBounds(i, j) || this.kind[this.idx(i, j)] !== 0) continue;
      if (this.chests.some(c => U.dist(c.x, c.z, x, z) < 20)) continue;
      this.chests.push({ x: (i - h) * this.cell, z: (j - h) * this.cell, taken: false });
    }
  }
  layRiver(rnd, kind = CELL_WATER) {
    const n = this.n, h = this.half;
    // enters on one side, leaves on the opposite side, bending around the castle
    const vertical = rnd() < 0.5;
    const flip = rnd() < 0.5 ? 1 : -1;
    const pts = [];
    const segs = 6;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      let a = (t * 2 - 1) * (h - 1);                       // along axis: -39..39 cells
      let b = flip * (14 + 6 * Math.sin(t * Math.PI * 1.7)) + (rnd() - 0.5) * 6; // offset side: keeps clear of the keep
      pts.push(vertical ? { i: h + b, j: h + a } : { i: h + a, j: h + b });
    }
    this.river = pts;
    const width = 1.3;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const d = this.distToPolyline(i, j, pts);
      const c = this.cellCenter(i, j);
      if (d <= width && Math.max(Math.abs(c.x), Math.abs(c.z)) > 12) this.kind[this.idx(i, j)] = kind;
    }
    // fords: three crossings, each three cells wide
    for (const t of [0.22, 0.5, 0.78]) {
      const p = this.pointOnPolyline(pts, t);
      this.fords.push(p);
      for (let j = Math.floor(p.j) - 3; j <= Math.floor(p.j) + 3; j++) for (let i = Math.floor(p.i) - 3; i <= Math.floor(p.i) + 3; i++) {
        if (!this.inBounds(i, j)) continue;
        if (Math.hypot(i + 0.5 - p.i, j + 0.5 - p.j) <= 2.2 && this.kind[this.idx(i, j)] === kind) this.kind[this.idx(i, j)] = 0;
      }
    }
  }
  distToPolyline(i, j, pts) {
    let best = Infinity;
    const px = i + 0.5, pz = j + 0.5;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const vx = b.i - a.i, vz = b.j - a.j, wx = px - a.i, wz = pz - a.j;
      const t = U.clamp((vx * wx + vz * wz) / (vx * vx + vz * vz || 1), 0, 1);
      best = Math.min(best, Math.hypot(px - (a.i + vx * t), pz - (a.j + vz * t)));
    }
    return best;
  }
  pointOnPolyline(pts, t) {
    const k = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
    const f = t * (pts.length - 1) - k;
    return { i: U.lerp(pts[k].i, pts[k + 1].i, f), j: U.lerp(pts[k].j, pts[k + 1].j, f) };
  }
  // rounded (or elongated, squash < 1) patches of one kind, kept clear of the castle, the river and the spawn points
  layBlobs(rnd, count, kind, radiusRange, squash, out) {
    const h = this.half, lim = DATA.MAP_HALF - 8;
    let placed = 0, guard = 0;
    while (placed < count && guard++ < 300) {
      const ang = rnd() * Math.PI * 2, rad = 26 + rnd() * (lim - 30);
      const cx = Math.cos(ang) * rad, cz = Math.sin(ang) * rad;
      if (DATA.spawnPoints.some(sp => U.dist(sp.x, sp.z, cx, cz) < 14)) continue;
      const r = radiusRange[0] + rnd() * (radiusRange[1] - radiusRange[0]);
      const rot = rnd() * Math.PI, ca = Math.cos(rot), sa = Math.sin(rot);
      const rx = r, rz = r * (squash < 1 ? squash + rnd() * 0.15 : 1);
      const ci = Math.round(cx / this.cell + h), cj = Math.round(cz / this.cell + h);
      const cells = [];
      const R = Math.ceil(r) + 1;
      let blocked = false;
      for (let j = cj - R; j <= cj + R && !blocked; j++) for (let i = ci - R; i <= ci + R; i++) {
        if (!this.inBounds(i, j)) continue;
        const dx = i - ci, dz = j - cj;
        const ex = dx * ca + dz * sa, ez = -dx * sa + dz * ca;
        const wob = 0.8 + 0.4 * U.smoothNoise(i * 0.7 + this.seed % 13, j * 0.7 + this.seed % 17);
        if ((ex * ex) / (rx * rx) + (ez * ez) / (rz * rz) > wob) continue;
        const c = this.cellCenter(i, j);
        if (Math.max(Math.abs(c.x), Math.abs(c.z)) < 23 || Math.max(Math.abs(c.x), Math.abs(c.z)) > lim) continue;
        if (this.kind[this.idx(i, j)] && !(kind === 7 && this.kind[this.idx(i, j)] === 6)) { blocked = true; break; }
        cells.push([i, j]);
      }
      if (blocked || cells.length < 3) continue;
      for (const [i, j] of cells) this.kind[this.idx(i, j)] = kind;
      out.push(cells);
      placed++;
    }
  }
  // last resort: clear a straight lane from every cut-off spawn point toward the keep
  carveOpen() {
    const h = this.half;
    for (const sp of DATA.spawnPoints) {
      let i = Math.floor(sp.x / this.cell + h + 0.5), j = Math.floor(sp.z / this.cell + h + 0.5);
      let guard = 0;
      while ((i !== h || j !== h) && guard++ < 400) {
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (this.inBounds(i + di, j + dj)) this.kind[this.idx(i + di, j + dj)] = 0;
        if (Math.abs(h - i) > Math.abs(h - j)) i += Math.sign(h - i); else j += Math.sign(h - j);
      }
    }
  }
  // every spawn point must reach the keep without crossing water or rock (walls are breakable, so they are ignored)
  connected() {
    const n = this.n, h = this.half;
    const seen = new Uint8Array(n * n);
    const q = [this.idx(h, h)]; seen[this.idx(h, h)] = 1;
    while (q.length) {
      const k = q.pop(); const i = k % n, j = (k - i) / n;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (!this.inBounds(ni, nj)) continue;
        const nk = this.idx(ni, nj);
        if (seen[nk] || this.blocked(this.kind[nk])) continue;
        seen[nk] = 1; q.push(nk);
      }
    }
    return DATA.spawnPoints.every(sp => {
      const i = Math.floor(sp.x / this.cell + h + 0.5), j = Math.floor(sp.z / this.cell + h + 0.5);
      // the spawn cell itself may sit on an obstacle edge; accept any free neighbour
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a = i + di, b = j + dj; if (this.inBounds(a, b) && seen[this.idx(a, b)]) return true; }
      return false;
    });
  }
  bakeHeights() {
    const w = this.hs;
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      const x = (i - this.half) * this.cell - this.cell / 2, z = (j - this.half) * this.cell - this.cell / 2;
      let y = this.baseHeight(x, z);
      this.h0[j * w + i] = y;
      // carve the river bed: a corner is lowered when any touching cell is water
      let water = 0, cnt = 0;
      for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { if (this.inBounds(i + di, j + dj)) { cnt++; const kk = this.kind[this.idx(i + di, j + dj)]; if (kk === CELL_WATER || kk === 8) water++; } }
      if (water) y -= 1.4 * (water / cnt) + 0.3;
      else { let marsh = 0; for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (this.inBounds(i + di, j + dj) && this.kind[this.idx(i + di, j + dj)] === 7) marsh++; if (marsh) y -= 0.25 * (marsh / cnt); }
      this.h[j * w + i] = y;
    }
  }

  // ---------------------------------------------------------------- apply to the grid and the scene
  applyToGrid(grid) {
    for (let k = 0; k < this.n * this.n; k++) {
      const kind = this.kind[k];
      grid.terrain[k] = kind;
      if (!kind || kind === 6) continue;
      if (kind === 7) { grid.natural[k] = 7; continue; }           // marsh: walkable, slow, unbuildable
      grid.flag[k] = (kind === CELL_WATER || kind === 8) ? CELL_WATER : CELL_ROCK;
      grid.natural[k] = kind;
    }
    grid.flowDirty = true;
  }
  kindAtWorld(x, z) { const i = Math.floor(x / this.cell + this.half + 0.5), j = Math.floor(z / this.cell + this.half + 0.5); return this.kindAt(i, j); }
  buildScene(scene) {
    const group = new THREE.Group();
    // ground with heights and painted cells
    const size = this.n * this.cell, seg = this.n;
    const geo = new THREE.PlaneGeometry(size + 40, size + 40, seg + 20, seg + 20);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const pal = this.cfg.palette;
    const c = new THREE.Color(), grass = new THREE.Color(pal.grass), grass2 = new THREE.Color(pal.grass2), mud = new THREE.Color(this.type === 'volcanic' ? 0x2a1a14 : 0x6b5a3a), rock = new THREE.Color(this.type === 'frozen' ? 0x9aa0a8 : 0x777770), forest = new THREE.Color(this.type === 'frozen' ? 0x8aa090 : 0x2f5a2a), dry = new THREE.Color(pal.dry), road = new THREE.Color(pal.road || 0x9a7a4a), marsh = new THREE.Color(pal.marsh || 0x4a5a2a);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      pos.setY(k, this.heightAt(U.clamp(x, -DATA.MAP_HALF, DATA.MAP_HALF), U.clamp(z, -DATA.MAP_HALF, DATA.MAP_HALF)));
      const i = Math.floor(x / this.cell + this.half + 0.5), j = Math.floor(z / this.cell + this.half + 0.5);
      const kind = this.kindAt(i, j);
      const nz = U.smoothNoise(x * 0.08 + 50, z * 0.08 + 50) * 0.6 + U.smoothNoise(x * 0.3, z * 0.3) * 0.4;
      c.copy(grass).lerp(grass2, nz);
      const r = Math.max(Math.abs(x), Math.abs(z));
      if (r > DATA.BUILD_RADIUS + 1) c.lerp(dry, 0.25);
      if (kind === CELL_WATER || kind === 8) c.copy(mud);
      else if (kind === CELL_ROCK) c.lerp(rock, 0.7);
      else if (kind === 5) c.lerp(forest, 0.6);
      else if (kind === 6) c.lerp(road, 0.75);
      else if (kind === 7) c.lerp(marsh, 0.8);
      else {
        // banks, rock edges, road shoulders
        let nearWater = false, nearRock = false, nearRoad = false;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = this.kindAt(i + di, j + dj); if (kk === CELL_WATER || kk === 8) nearWater = true; if (kk === CELL_ROCK) nearRock = true; if (kk === 6) nearRoad = true; }
        if (nearWater) c.lerp(mud, 0.45); else if (nearRock) c.lerp(rock, 0.3); else if (nearRoad) c.lerp(road, 0.3);
      }
      const y = pos.getY(k); if (y > 1) c.lerp(dry, Math.min(0.35, y * 0.06));
      colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const gtex = Models.noiseTexture(256, 0.22, 2); gtex.repeat.set(52, 52);
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: gtex }));
    ground.receiveShadow = true;
    group.add(ground); this.ground = ground;
    // water: one big plane just below the plain; it only shows inside the carved bed
    const wgeo = new THREE.PlaneGeometry(size + 28, size + 28, seg + 14, seg + 14);
    wgeo.rotateX(-Math.PI / 2);
    { const wp = wgeo.attributes.position; for (let k = 0; k < wp.count; k++) { const x = wp.getX(k), z = wp.getZ(k); wp.setY(k, this.heightAt(x, z, this.h0) - 0.5); } wgeo.computeVertexNormals(); }
    const lava = this.type === 'volcanic';
    const wtex = Models.noiseTexture(256, 0.3, 9); wtex.repeat.set(34, 34);
    const water = new THREE.Mesh(wgeo, new THREE.MeshPhongMaterial({ color: pal.water || 0x3a7fc0, transparent: !lava, opacity: lava ? 1 : 0.8, emissive: pal.waterGlow || 0x0a2a50, emissiveIntensity: lava ? 0.9 : 0.35, map: wtex, shininess: lava ? 10 : 90, specular: lava ? 0x402000 : 0x9ad0ff }));
    water.receiveShadow = !lava;
    group.add(water); this.water = water;
    // fords: wooden planks over the crossings
    const plank = Models.mat(0x7a5a38);
    for (const f of this.fords) {
      const cc = this.cellCenter(f.i - 0.5, f.j - 0.5);
      const b = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 7), plank);
      b.position.set(cc.x, 0.02, cc.z); b.castShadow = true; b.receiveShadow = true;
      group.add(b);
      for (let k = -3; k <= 3; k++) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.2), plank); rail.position.set(cc.x + k * 1.1, 0.5, cc.z + 3.4); group.add(rail); const rail2 = rail.clone(); rail2.position.z = cc.z - 3.4; group.add(rail2); }
    }
    // marsh reeds and treasure chests
    const reedMat = Models.mat(this.type === 'frozen' ? 0x8a9a8a : 0x5a6a2a);
    const reedGeo = new THREE.CylinderGeometry(0.03, 0.05, 1.1, 4);
    const marshCells = []; for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) if (this.kind[this.idx(i, j)] === 7) marshCells.push([i, j]);
    if (marshCells.length) {
      const reeds = new THREE.InstancedMesh(reedGeo, reedMat, marshCells.length * 4); reeds.frustumCulled = false;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
      const rr = mulberry32(this.usedSeed + 7); let k = 0;
      for (const [i, j] of marshCells) { const cc = this.cellCenter(i, j); for (let t = 0; t < 4; t++) { const x = cc.x + (rr() - 0.5) * 1.8, z = cc.z + (rr() - 0.5) * 1.8; q.setFromEuler(new THREE.Euler((rr() - 0.5) * 0.3, rr() * 6, (rr() - 0.5) * 0.3)); p.set(x, this.heightAt(x, z) + 0.5, z); m.compose(p, q, s); reeds.setMatrixAt(k++, m); } }
      reeds.instanceMatrix.needsUpdate = true; group.add(reeds);
    }
    for (const ch of this.chests) {
      const g = new THREE.Group();
      g.add(Models.box(1.0, 0.6, 0.7, Models.mat(0x6a4a2a), 0, 0.3, 0));
      g.add(Models.box(1.04, 0.28, 0.74, Models.mat(0xd8b040, { emissive: 0x604000, emissiveIntensity: 0.3 }), 0, 0.72, 0));
      g.add(Models.box(0.2, 0.2, 0.1, Models.mat(0x3a3a3a), 0, 0.55, 0.4, false));
      g.position.set(ch.x, this.heightAt(ch.x, ch.z), ch.z); g.rotation.y = ch.x * 0.3;
      group.add(g); ch.mesh = g;
    }
    // rocks and forests as instanced meshes
    const rockCells = [], forestCells = [];
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) { const k = this.kind[this.idx(i, j)]; if (k === CELL_ROCK) rockCells.push([i, j]); else if (k === 5) forestCells.push([i, j]); }
    const rnd = mulberry32(this.usedSeed || this.seed);
    if (rockCells.length) {
      const rockGeo = new THREE.DodecahedronGeometry(1, 0);
      const inst = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), rockCells.length * 2);
      inst.castShadow = true; inst.receiveShadow = true; inst.frustumCulled = false;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
      let k = 0;
      for (const [i, j] of rockCells) {
        const cc = this.cellCenter(i, j);
        for (let t = 0; t < 2; t++) {
          const sx = 0.8 + rnd() * 0.9, sy = 0.9 + rnd() * 1.6, sz = 0.8 + rnd() * 0.9;
          p.set(cc.x + (rnd() - 0.5) * 1.2, this.heightAt(cc.x, cc.z) + sy * 0.3, cc.z + (rnd() - 0.5) * 1.2);
          q.setFromEuler(new THREE.Euler(rnd() * 0.6, rnd() * 6, rnd() * 0.6)); s.set(sx, sy, sz);
          m.compose(p, q, s); inst.setMatrixAt(k, m);
          col.setHex((this.type === 'frozen' ? [0xc8d0d8, 0xb0b8c0, 0xd8e0e8, 0xa0a8b0] : (this.type === 'volcanic' ? [0x3a3a3a, 0x4a4040, 0x2a2a2a, 0x5a4a44] : [0x777770, 0x8a8a80, 0x6a6a64, 0x9a958a]))[Math.floor(rnd() * 4)]); inst.setColorAt(k, col); k++;
        }
      }
      inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      group.add(inst);
    }
    if (forestCells.length) {
      const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6), leafGeo = new THREE.ConeGeometry(1.3, 3.2, 7);
      const per = 3;
      const trunks = new THREE.InstancedMesh(trunkGeo, Models.mat(0x5a3a22), forestCells.length * per);
      const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), forestCells.length * per);
      trunks.castShadow = true; leaves.castShadow = true; trunks.frustumCulled = false; leaves.frustumCulled = false;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
      let k = 0;
      for (const [i, j] of forestCells) {
        const cc = this.cellCenter(i, j);
        for (let t = 0; t < per; t++) {
          const x = cc.x + (rnd() - 0.5) * 1.6, z = cc.z + (rnd() - 0.5) * 1.6, sc = 0.8 + rnd() * 0.7, y = this.heightAt(x, z);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6); s.set(sc, sc, sc);
          p.set(x, y + 0.8 * sc, z); m.compose(p, q, s); trunks.setMatrixAt(k, m);
          p.set(x, y + 0.8 * sc + 2.1 * sc, z); m.compose(p, q, s); leaves.setMatrixAt(k, m);
          col.setHex((pal.leaves || [0x2f6b2f, 0x3a7a35, 0x2a5a30, 0x1f4a25])[Math.floor(rnd() * 4)]); leaves.setColorAt(k, col); k++;
        }
      }
      trunks.instanceMatrix.needsUpdate = true; leaves.instanceMatrix.needsUpdate = true; if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
      group.add(trunks); group.add(leaves);
    }
    // dead trees on the dry maps (walkable decoration)
    if (this.cfg.decor === 'dead') {
      const bark = Models.mat(0x3a2a20);
      for (let k = 0; k < 40; k++) {
        let x, z, tries = 0;
        do { x = (rnd() - 0.5) * 2 * (DATA.MAP_HALF - 4); z = (rnd() - 0.5) * 2 * (DATA.MAP_HALF - 4); tries++; } while (tries < 20 && (Math.max(Math.abs(x), Math.abs(z)) < 24 || this.kindAtWorld(x, z)));
        const y = this.heightAt(x, z), t = new THREE.Group();
        t.add(Models.cyl(0.12, 0.22, 3 + rnd() * 2, bark, 0, 1.6 + rnd(), 0, 5));
        for (let b = 0; b < 3; b++) { const br = Models.box(0.1, 1.4, 0.1, bark, 0, 2.4 + b * 0.5, 0); br.rotation.set((rnd() - 0.5) * 1.4, rnd() * 6, (rnd() - 0.5) * 1.4); t.add(br); }
        t.position.set(x, y, z); group.add(t);
      }
    }
    // ruins: a few broken wall stubs for atmosphere (walkable)
    for (let k = 0; k < (this.cfg.ruins || 6); k++) {
      let x, z, tries = 0;
      do { x = (rnd() - 0.5) * 140; z = (rnd() - 0.5) * 140; tries++; } while (tries < 20 && (Math.max(Math.abs(x), Math.abs(z)) < 26 || this.kindAt(Math.floor(x / 2 + this.half + 0.5), Math.floor(z / 2 + this.half + 0.5))));
      const y = this.heightAt(x, z);
      const stub = new THREE.Mesh(new THREE.BoxGeometry(2.5 + rnd() * 3, 0.6 + rnd() * 1.6, 0.9), Models.mat(0x8a8578));
      stub.position.set(x, y + 0.3, z); stub.rotation.y = rnd() * 3; stub.rotation.z = (rnd() - 0.5) * 0.2; stub.castShadow = true; stub.receiveShadow = true;
      group.add(stub);
    }
    scene.add(group);
    this.group = group;
    return group;
  }
  dispose(scene) { if (this.group) { scene.remove(this.group); this.group.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); this.group = null; } }
}
