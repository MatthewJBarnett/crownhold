'use strict';

const U = {
  clamp: (v, a, b) => v < a ? a : (v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a, b) => a + Math.random() * (b - a),
  randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  choice: (arr) => arr[Math.floor(Math.random() * arr.length)],
  dist: (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz),
  dist2: (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz),
  angleLerp(a, b, t) {
    let d = b - a;
    if (!isFinite(d)) return isFinite(b) ? b : 0;
    d = d - Math.PI * 2 * Math.floor((d + Math.PI) / (Math.PI * 2));
    return a + d * t;
  },
  fmt: (n) => Math.round(n).toLocaleString(),
  weightedChoice(items, weightFn) {
    let total = 0;
    for (const it of items) total += weightFn(it);
    let r = Math.random() * total;
    for (const it of items) { r -= weightFn(it); if (r <= 0) return it; }
    return items[items.length - 1];
  },
  // simple value noise for terrain colouring
  noise2(x, y) {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
  },
  smoothNoise(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const a = U.noise2(x0, y0), b = U.noise2(x0 + 1, y0), c = U.noise2(x0, y0 + 1), d = U.noise2(x0 + 1, y0 + 1);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return U.lerp(U.lerp(a, b, ux), U.lerp(c, d, ux), uy);
  },
};

class MinHeap {
  constructor() { this.keys = []; this.vals = []; }
  get size() { return this.keys.length; }
  push(key, val) {
    const k = this.keys, v = this.vals;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.keys, v = this.vals;
    const topK = k[0], topV = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length > 0) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      const n = k.length;
      let guard = 0;
      for (;;) {
        if (++guard > 100000) throw new Error('MinHeap.pop runaway');
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < n && k[l] < k[m]) m = l;
        if (r < n && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return { key: topK, val: topV };
  }
}

// Spatial hash for units (bucket size in metres)
class SpatialHash {
  constructor(bucket = 4) { this.bucket = bucket; this.map = new Map(); }
  clear() { this.map.clear(); }
  _key(x, z) { return (Math.floor(x / this.bucket) + 2048) * 8192 + (Math.floor(z / this.bucket) + 2048); }
  insert(u) {
    const k = this._key(u.pos.x, u.pos.z);
    let arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(u);
  }
  query(x, z, r, out) {
    out.length = 0;
    const b = this.bucket;
    const i0 = Math.floor((x - r) / b), i1 = Math.floor((x + r) / b);
    const j0 = Math.floor((z - r) / b), j1 = Math.floor((z + r) / b);
    const r2 = r * r;
    if (!isFinite(r) || r > 400 || !isFinite(x) || !isFinite(z)) throw new Error('SpatialHash.query bad args ' + x + ',' + z + ' r=' + r);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = this.map.get((i + 2048) * 8192 + (j + 2048));
        if (!arr) continue;
        for (const u of arr) {
          const dx = u.pos.x - x, dz = u.pos.z - z;
          if (dx * dx + dz * dz <= r2) out.push(u);
        }
      }
    }
    return out;
  }
}
