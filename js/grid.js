'use strict';

// Grid flags
const CELL_FREE = 0, CELL_SOLID = 1, CELL_GATE = 2;

class Grid {
  constructor(n = DATA.GRID, cell = DATA.CELL) {
    this.n = n; this.cell = cell; this.half = n / 2;
    this.occ = new Array(n * n).fill(null);   // building occupying the cell
    this.flag = new Uint8Array(n * n);        // CELL_FREE / CELL_SOLID / CELL_GATE
    this.shelter = new Uint8Array(n * n);     // 1 = keep interior
    this.natural = new Uint8Array(n * n);     // water / rock / forest: impassable, unbuildable, unbreakable (7 = marsh: walkable, unbuildable)
    this.terrain = new Uint8Array(n * n);     // full terrain kind per cell (0 open, 6 road, 7 marsh, ...)
    this.integ = new Float64Array(n * n);     // flow-field integration values (enemy -> king)
    this.flowDirty = true;
    this.flowTarget = null;
  }
  idx(i, j) { return j * this.n + i; }
  inBounds(i, j) { return i >= 0 && j >= 0 && i < this.n && j < this.n; }
  // cell (half, half) is centred on the world origin; cell boundaries sit on odd coordinates
  worldToCell(x, z) {
    return { i: Math.floor(x / this.cell + this.half + 0.5), j: Math.floor(z / this.cell + this.half + 0.5) };
  }
  cellToWorld(i, j) {
    return { x: (i - this.half) * this.cell, z: (j - this.half) * this.cell };
  }
  flagAt(i, j) { return this.inBounds(i, j) ? this.flag[this.idx(i, j)] : CELL_SOLID; }
  buildingAt(i, j) { return this.inBounds(i, j) ? this.occ[this.idx(i, j)] : null; }
  buildingAtWorld(x, z) { const c = this.worldToCell(x, z); return this.buildingAt(c.i, c.j); }
  isSolidAt(i, j) { return this.flagAt(i, j) === CELL_SOLID; }
  // can a unit of the given team walk through cell?
  passable(i, j, team) {
    const f = this.flagAt(i, j);
    if (f === CELL_FREE) return true;
    if (f === CELL_GATE) return team === 'player';
    return false;
  }
  passableWorld(x, z, team) {
    if (Math.abs(x) > DATA.MAP_HALF || Math.abs(z) > DATA.MAP_HALF) return false;
    const c = this.worldToCell(x, z);
    return this.passable(c.i, c.j, team);
  }
  // is a circle of radius r at (x,z) clear of every cell the team cannot enter (and inside the map)?
  circleFree(x, z, r, team) {
    const H = DATA.MAP_HALF;
    if (x < -H + r || x > H - r || z < -H + r || z > H - r) return false;
    const c0 = this.worldToCell(x - r, z - r), c1 = this.worldToCell(x + r, z + r);
    const hc = this.cell / 2, r2 = r * r;
    for (let j = c0.j; j <= c1.j; j++) for (let i = c0.i; i <= c1.i; i++) {
      if (this.passable(i, j, team)) continue;
      const w = this.cellToWorld(i, j);
      const px = U.clamp(x, w.x - hc, w.x + hc), pz = U.clamp(z, w.z - hc, w.z + hc);
      const dx = x - px, dz = z - pz;
      if (dx * dx + dz * dz < r2) return false;
    }
    return true;
  }
  // push vector that moves a circle out of the solid cells it overlaps; null if the centre itself is inside a cell
  circlePushOut(x, z, r, team) {
    const c0 = this.worldToCell(x - r, z - r), c1 = this.worldToCell(x + r, z + r);
    const hc = this.cell / 2;
    let px = 0, pz = 0, inside = false;
    for (let j = c0.j; j <= c1.j; j++) for (let i = c0.i; i <= c1.i; i++) {
      if (this.passable(i, j, team)) continue;
      const w = this.cellToWorld(i, j);
      const qx = U.clamp(x, w.x - hc, w.x + hc), qz = U.clamp(z, w.z - hc, w.z + hc);
      const dx = x - qx, dz = z - qz;
      const d = Math.hypot(dx, dz);
      if (d < 1e-4) { inside = true; continue; }
      if (d < r) { px += dx / d * (r - d); pz += dz / d * (r - d); }
    }
    return inside ? null : { x: px, z: pz };
  }
  shelteredWorld(x, z) {
    const c = this.worldToCell(x, z);
    return this.inBounds(c.i, c.j) && this.shelter[this.idx(c.i, c.j)] === 1;
  }

  // footprint cells for a building def anchored at top-left (i,j), rotated rot*90deg
  footprint(def, i, j, rot) {
    const w = (rot % 2 === 0) ? def.w : def.d;
    const d = (rot % 2 === 0) ? def.d : def.w;
    const cells = [];
    const interior = new Set();
    if (def.interior) {
      for (const [dx, dz] of def.interior) {
        // rotate interior offsets within the footprint
        let rx = dx, rz = dz;
        for (let r = 0; r < rot; r++) {
          const nx = (def.d - 1) - rz, nz = rx; // rotate 90deg clockwise inside w x d box (approximation valid for square boxes)
          rx = nx; rz = nz;
        }
        interior.add(rx + ',' + rz);
      }
    }
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) {
      cells.push({ i: i + dx, j: j + dz, solid: !interior.has(dx + ',' + dz) });
    }
    return { cells, w, d };
  }

  canPlace(def, i, j, rot, game) {
    const fp = this.footprint(def, i, j, rot);
    const lim = DATA.BUILD_RADIUS;
    for (const c of fp.cells) {
      if (!this.inBounds(c.i, c.j)) return { ok: false, reason: 'Out of bounds', cells: fp.cells };
      const w = this.cellToWorld(c.i, c.j);
      if (!def.temporary && (Math.abs(w.x) > lim || Math.abs(w.z) > lim)) return { ok: false, reason: 'Outside the buildable area', cells: fp.cells };
      if (this.natural[this.idx(c.i, c.j)]) { const nk = this.natural[this.idx(c.i, c.j)]; return { ok: false, reason: nk === CELL_WATER ? 'Cannot build on water' : (nk === 8 ? 'Cannot build on lava' : (nk === 7 ? 'Too soft: marsh' : 'Blocked by rock or forest')), cells: fp.cells }; }
      if (this.occ[this.idx(c.i, c.j)]) return { ok: false, reason: 'Occupied', cells: fp.cells };
    }
    if (game) {
      for (const u of game.units) {
        if (u.team !== 'enemy' || u.dead) continue;
        const uc = this.worldToCell(u.pos.x, u.pos.z);
        for (const c of fp.cells) if (c.i === uc.i && c.j === uc.j && c.solid) return { ok: false, reason: 'Enemy in the way', cells: fp.cells };
      }
    }
    return { ok: true, cells: fp.cells, w: fp.w, d: fp.d };
  }

  place(b) {
    for (const c of b.cells) {
      const k = this.idx(c.i, c.j);
      this.occ[k] = b;
      this.flag[k] = c.solid ? (b.def.gate ? CELL_GATE : CELL_SOLID) : CELL_FREE;
      this.shelter[k] = (!c.solid && b.def.keep) ? 1 : 0;
    }
    this.flowDirty = true;
  }
  remove(b) {
    for (const c of b.cells) {
      const k = this.idx(c.i, c.j);
      if (this.occ[k] === b) { this.occ[k] = null; const nk = this.natural[k]; this.flag[k] = (nk && nk !== 7) ? ((nk === CELL_WATER || nk === 8) ? CELL_WATER : CELL_ROCK) : CELL_FREE; this.shelter[k] = 0; }
    }
    this.flowDirty = true;
  }

  // ----- flow field (enemies -> king). Solid cells are passable at a cost so enemies breach walls.
  wallCost(b) { return 30 + (b ? b.hp / 40 : 0); }
  computeFlow(ti, tj) {
    const n = this.n, integ = this.integ;
    integ.fill(Infinity);
    if (!this.inBounds(ti, tj)) return;
    const heap = new MinHeap();
    integ[this.idx(ti, tj)] = 0;
    heap.push(0, this.idx(ti, tj));
    const flag = this.flag, occ = this.occ;
    let guard = 0;
    while (heap.size) {
      if (++guard > 5000000) throw new Error('computeFlow runaway');
      const { key: d, val: k } = heap.pop();
      if (d > integ[k]) continue;
      const i = k % n, j = (k - i) / n;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        if (di && dj) {
          // no corner cutting past solid cells
          if (flag[j * n + ni] !== CELL_FREE || flag[nj * n + i] !== CELL_FREE) continue;
        }
        if (flag[nk] === CELL_WATER || flag[nk] === CELL_ROCK) continue;
        let step = (di && dj) ? 1.4142 : 1;
        if (flag[nk] !== CELL_FREE) step += this.wallCost(occ[nk]);
        const nd = d + step;
        if (nd < integ[nk]) { integ[nk] = nd; heap.push(nd, nk); }
      }
    }
    this.flowDirty = false;
    this.flowTarget = { i: ti, j: tj };
  }
  // best neighbour cell to step into from (i,j) following the flow
  nextFlowCell(i, j) {
    const n = this.n, integ = this.integ, flag = this.flag;
    let best = null, bestV = integ[this.idx(i, j)];
    if (!isFinite(bestV)) bestV = Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
      if (di && dj && (flag[j * n + ni] !== CELL_FREE || flag[nj * n + i] !== CELL_FREE)) continue;
      const v = integ[nj * n + ni];
      if (v < bestV) { bestV = v; best = { i: ni, j: nj }; }
    }
    return best;
  }
  flowValueWorld(x, z) {
    const c = this.worldToCell(x, z);
    return this.inBounds(c.i, c.j) ? this.integ[this.idx(c.i, c.j)] : Infinity;
  }

  // straight line free of obstacles for the given team?
  lineClear(x1, z1, x2, z2, team) {
    const d = Math.hypot(x2 - x1, z2 - z1);
    if (!isFinite(d) || d > 400) return false;
    const steps = Math.max(1, Math.ceil(d / 0.6));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      if (!this.passableWorld(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, team)) return false;
    }
    return true;
  }

  // ----- A* for player units (gates passable, solids not)
  nearestPassable(i, j, team, maxR = 12) {
    if (this.inBounds(i, j) && this.passable(i, j, team)) return { i, j };
    for (let r = 1; r <= maxR; r++) {
      let best = null, bestD = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ni = i + di, nj = j + dj;
        if (this.inBounds(ni, nj) && this.passable(ni, nj, team)) {
          const d = di * di + dj * dj;
          if (d < bestD) { bestD = d; best = { i: ni, j: nj }; }
        }
      }
      if (best) return best;
    }
    return null;
  }
  astar(si, sj, ti, tj, team) {
    const t0 = performance.now();
    const r = this._astar(si, sj, ti, tj, team);
    if (window.game && window.game.prof) { window.game.prof.astar += performance.now() - t0; window.game.prof.astarN++; }
    return r;
  }
  _astar(si, sj, ti, tj, team) {
    const n = this.n;
    if (!this.inBounds(si, sj)) return null;
    const goal = this.nearestPassable(ti, tj, team);
    if (!goal) return null;
    ti = goal.i; tj = goal.j;
    if (si === ti && sj === tj) return [];
    const g = new Float64Array(n * n).fill(Infinity);
    const parent = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    const heap = new MinHeap();
    const sk = this.idx(si, sj), gk = this.idx(ti, tj);
    g[sk] = 0;
    const h = (i, j) => { const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
    heap.push(h(si, sj), sk);
    let iter = 0;
    while (heap.size && iter++ < 20000) {
      const { val: k } = heap.pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === gk) break;
      const i = k % n, j = (k - i) / n;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        if (!this.passable(ni, nj, team)) continue;
        if (di && dj && (!this.passable(ni, j, team) || !this.passable(i, nj, team))) continue;
        const nk = nj * n + ni;
        if (closed[nk]) continue;
        const ng = g[k] + ((di && dj) ? 1.4142 : 1) + (this.flag[nk] === CELL_GATE ? 0.5 : 0);
        if (ng < g[nk]) { g[nk] = ng; parent[nk] = k; heap.push(ng + h(ni, nj), nk); }
      }
    }
    if (parent[gk] === -1 && gk !== sk) {
      // unreachable: walk to the closed cell nearest to the goal
      let bestK = -1, bestH = Infinity;
      for (let k = 0; k < n * n; k++) if (closed[k]) {
        const i = k % n, j = (k - i) / n; const hv = h(i, j);
        if (hv < bestH) { bestH = hv; bestK = k; }
      }
      if (bestK === -1 || bestK === sk) return null;
      return this._tracePath(parent, bestK, sk);
    }
    return this._tracePath(parent, gk, sk);
  }
  _tracePath(parent, k, sk) {
    const path = [];
    let guard = 0;
    while (k !== sk && k !== -1) {
      if (++guard > this.n * this.n) throw new Error('tracePath cycle');
      const i = k % this.n, j = (k - i) / this.n;
      path.push(this.cellToWorld(i, j));
      k = parent[k];
    }
    path.reverse();
    return this._smooth(path);
  }
  _smooth(path) {
    // drop intermediate points that are collinear
    if (path.length < 3) return path;
    const out = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const a = out[out.length - 1], b = path[i], c = path[i + 1];
      const d1x = b.x - a.x, d1z = b.z - a.z, d2x = c.x - b.x, d2z = c.z - b.z;
      if (Math.abs(d1x * d2z - d1z * d2x) > 1e-3) out.push(b);
    }
    out.push(path[path.length - 1]);
    return out;
  }
}
