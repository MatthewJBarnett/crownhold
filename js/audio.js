'use strict';

// Tiny procedural sound effects (no assets needed)
const SFX = {
  ctx: null, muted: false, master: null, recent: [], lastPlay: {}, volume: 0.5,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume; this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; },
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); if (this.master && !this.muted) this.master.gain.value = this.volume; },
  noiseBuffer(dur) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },
  play(name, vol = 1) {
    if (window.game && window.game.netHost) window.game.netHost.sound(name);
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    // rate limit: identical sounds at most every 60ms, and 24 sounds per 100ms
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.06) return;
    this.recent = this.recent.filter(t => now - t < 0.1);
    if (this.recent.length > 24) return;
    this.recent.push(now); this.lastPlay[name] = now;
    const c = this.ctx, g = c.createGain(); g.connect(this.master);
    const tone = (type, f0, f1, dur, v = 1, delay = 0) => {
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, now + delay);
      if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + delay + dur);
      const og = c.createGain(); og.gain.setValueAtTime(v * vol, now + delay); og.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      o.connect(og); og.connect(g); o.start(now + delay); o.stop(now + delay + dur + 0.02);
    };
    const noise = (dur, v = 1, filterF = 2000, type = 'lowpass', delay = 0) => {
      const s = c.createBufferSource(); s.buffer = this.noiseBuffer(dur);
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filterF;
      const ng = c.createGain(); ng.gain.setValueAtTime(v * vol, now + delay); ng.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      s.connect(f); f.connect(ng); ng.connect(g); s.start(now + delay); s.stop(now + delay + dur + 0.02);
    };
    switch (name) {
      case 'hit': noise(0.08, 0.5, 1800); tone('square', 220, 90, 0.08, 0.15); break;
      case 'heavyhit': noise(0.18, 0.8, 900); tone('square', 120, 50, 0.18, 0.3); break;
      case 'swing': noise(0.15, 0.25, 1200, 'bandpass'); break;
      case 'bow': tone('triangle', 900, 300, 0.12, 0.25); noise(0.05, 0.2, 4000, 'highpass'); break;
      case 'ballista': tone('sawtooth', 300, 80, 0.2, 0.3); noise(0.1, 0.4, 2000); break;
      case 'cast': tone('sine', 400, 1200, 0.25, 0.25); tone('sine', 600, 1800, 0.25, 0.15, 0.05); break;
      case 'catapult': tone('sawtooth', 80, 40, 0.3, 0.4); noise(0.2, 0.3, 500); break;
      case 'explode': noise(0.5, 0.9, 700); tone('sine', 120, 30, 0.5, 0.6); break;
      case 'die': tone('sawtooth', 300, 80, 0.3, 0.25); break;
      case 'allydie': tone('sawtooth', 240, 60, 0.45, 0.35); tone('sine', 180, 50, 0.45, 0.2); break;
      case 'bossdie': tone('sawtooth', 200, 30, 1.2, 0.6); noise(1.0, 0.6, 600); break;
      case 'bossroar': tone('sawtooth', 90, 60, 1.0, 0.6); tone('square', 140, 70, 1.0, 0.3); noise(0.8, 0.4, 400); break;
      case 'summon': tone('sine', 200, 800, 0.4, 0.25); tone('sine', 150, 600, 0.4, 0.2, 0.08); break;
      case 'slam': noise(0.4, 0.9, 400); tone('sine', 80, 30, 0.4, 0.7); break;
      case 'breath': noise(1.2, 0.5, 900, 'bandpass'); break;
      case 'blink': tone('sine', 1200, 200, 0.25, 0.3); break;
      case 'warcry': tone('sawtooth', 180, 260, 0.5, 0.35); tone('sawtooth', 270, 390, 0.5, 0.25, 0.1); break;
      case 'heal': tone('sine', 500, 1000, 0.5, 0.25); tone('sine', 750, 1500, 0.5, 0.2, 0.1); break;
      case 'horn': tone('sawtooth', 220, 220, 0.5, 0.35); tone('sawtooth', 330, 330, 0.6, 0.35, 0.35); tone('sawtooth', 440, 440, 0.8, 0.35, 0.7); break;
      case 'build': noise(0.08, 0.5, 1200); tone('square', 180, 120, 0.12, 0.25); break;
      case 'click': tone('square', 800, 600, 0.05, 0.15); break;
      case 'coin': tone('sine', 1200, 1200, 0.08, 0.2); tone('sine', 1800, 1800, 0.15, 0.2, 0.08); break;
      case 'error': tone('square', 200, 150, 0.15, 0.25); break;
      case 'wavecleared': [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.35, 0.3, i * 0.12)); break;
      case 'gameover': [440, 370, 311, 220].forEach((f, i) => tone('sawtooth', f, f * 0.98, 0.6, 0.35, i * 0.4)); break;
      case 'levelup': [660, 880, 1320].forEach((f, i) => tone('sine', f, f, 0.25, 0.3, i * 0.08)); break;
    }
  },
};
window.addEventListener('pointerdown', () => { SFX.init(); SFX.resume(); }, { once: false });
window.addEventListener('keydown', () => { SFX.init(); SFX.resume(); }, { once: false });
