'use strict';

class UI {
  constructor(game) {
    this.game = game;
    this.$ = (id) => document.getElementById(id);
    this.dirty = true; this.tick = 0; this.mapTick = 1; this.showDamage = false;
    this.selectedHero = 'knight'; this.difficulty = 'normal';
    this.buildMenu();
    this.buildPanels();
    this.bindHud();
    this.minimap = this.$('minimap'); this.mctx = this.minimap.getContext('2d');
  }

  // ------------------------------------------------------------ menu
  buildMenu() {
    if (this.$('buildstamp')) this.$('buildstamp').textContent = 'build ' + DATA.build;
    const cards = this.$('herocards');
    cards.innerHTML = '';
    for (const h of Object.values(DATA.heroes)) {
      const el = document.createElement('div');
      el.className = 'hero-card' + (h.key === this.selectedHero ? ' on' : '');
      el.dataset.hero = h.key;
      const abil = h.abilities.map(k => `<div class="ab"><b>${DATA.abilities[k].key}</b> ${DATA.abilities[k].name}: ${DATA.abilities[k].desc}</div>`).join('');
      el.innerHTML = `<div class="swatch" style="background:#${h.color.toString(16).padStart(6, '0')}"></div>
        <h3>${h.name}</h3><div class="role">${h.title} · ${h.role}</div>
        <ul>${h.traits.map(t => `<li>${t}</li>`).join('')}</ul>${abil}<div class="passive">${h.passive}</div>`;
      el.addEventListener('click', () => { this.selectedHero = h.key; cards.querySelectorAll('.hero-card').forEach(c => c.classList.toggle('on', c.dataset.hero === h.key)); SFX.play('click'); });
      cards.appendChild(el);
    }
    this.selectedMap = 'random';
    this.$('mapsel').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      this.selectedMap = b.dataset.m;
      this.$('mapsel').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      this.$('mapdesc').textContent = b.dataset.m === 'random' ? 'A different layout every game.' : DATA.mapTypes[b.dataset.m].desc;
    }));
    this.$('difficulty').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      this.difficulty = b.dataset.d;
      this.$('difficulty').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    }));
    this.$('startbtn').addEventListener('click', () => { SFX.init(); SFX.resume(); this.hideMenu(); this.game.newGame(this.selectedHero, this.difficulty); });
    setTimeout(() => this.checkForNewerBuild(), 1500);
    document.querySelectorAll('.settings').forEach(r => this.bindSettings(r));
    this.refreshSettings();
    this.$('settingsbtn').addEventListener('click', () => this.toggleSettings());
    this.$('menusettings').addEventListener('click', () => this.toggleSettings(true));
    this.$('settingsclose').addEventListener('click', () => this.toggleSettings(false));
    this.$('copycode').addEventListener('click', () => { const g = this.game; const code = g.netHost ? g.netHost.code : (g.netClient ? g.netClient.code : ''); if (code) this.copyText(code, this.$('copycode')); });
    this.$('copylink').addEventListener('click', () => { const g = this.game; const code = g.netHost ? g.netHost.code : (g.netClient ? g.netClient.code : ''); if (code) this.copyText(this.inviteLink(code), this.$('copylink')); });
    { const jc = new URLSearchParams(location.search).get('join'); if (jc) { this.$('joincode').value = jc.toUpperCase().slice(0, 6); this.mpStatus(`Room code ${jc.toUpperCase()} filled in. Pick your hero, enter a name, and press Join.`); } }
    this.$('lobbystart').addEventListener('click', () => this.game.hostBegin());
    this.$('lobbyleave').addEventListener('click', () => location.reload());
    this.$('lobbycopy').addEventListener('click', () => { const code = this.$('lobbycode').textContent; if (code) this.copyText(code, this.$('lobbycopy')); });
    this.$('lobbylink').addEventListener('click', () => { const code = this.$('lobbycode').textContent; if (code) this.copyText(this.inviteLink(code), this.$('lobbylink')); });
    this.$('restartbtn').addEventListener('click', () => { if (this.game.netHost) { this.$('gameover').classList.add('hidden'); this.game.netHost.toLobby(); return; } if (this.game.replica) { location.reload(); return; } this.$('gameover').classList.add('hidden'); this.$('menu').classList.remove('hidden'); this.$('hud').classList.add('hidden'); this.game.started = false; });
    // multiplayer lobby
    const nameOf = () => (this.$('mpname').value || '').trim().slice(0, 16) || 'Player';
    this.setupEmbeddedFallbacks();
    this.$('joincode').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.$('joinbtn').click(); e.stopPropagation(); });
    this.$('mpname').addEventListener('keydown', (e) => e.stopPropagation());
    this.$('hostbtn').addEventListener('click', () => {
      if (typeof Peer === 'undefined') { this.mpStatus('The peer library did not load. Check your connection and reload.', true); return; }
      this.mpStatus('Creating room…');
      SFX.init(); SFX.resume();
      this.game.startHost(this.selectedHero, this.difficulty, nameOf(), (err, code) => {
        if (err) { this.mpStatus(this.netErrorText(err, 'create a room'), true); return; }
        this.hideMenu();
      });
    });
    this.$('joinbtn').addEventListener('click', () => {
      const code = (this.$('joincode').value || '').trim().toUpperCase();
      if (code.length < 4) { this.mpStatus('Enter the room code the host sees at the top of their screen.', true); return; }
      if (typeof Peer === 'undefined') { this.mpStatus('The peer library did not load. Check your connection and reload.', true); return; }
      this.mpStatus('Connecting to ' + code + '…');
      SFX.init(); SFX.resume();
      this.game.startJoin(code, this.selectedHero, nameOf(), (err) => {
        if (err) { this.mpStatus(this.netErrorText(err, 'join'), true); return; }
        this.hideMenu();
      });
    });
    this.$('helpclose').addEventListener('click', () => this.toggleHelp(false));
  }
  hideMenu() { this.$('menu').classList.add('hidden'); }
  showLobby() { this.$('menu').classList.add('hidden'); this.$('connecting').classList.add('hidden'); this.$('lobby').classList.remove('hidden'); this.$('hud').classList.add('hidden'); const g = this.game; if (g.netHost) this.renderLobby(g.netHost.lobbyState(), true); else if (g.netClient && g.netClient.lobby) this.renderLobby(g.netClient.lobby, false); else this.$('lobbyplayers').innerHTML = '<div class="p"><span class="nm">Connecting…</span></div>'; }
  hideLobby() { this.$('lobby').classList.add('hidden'); }
  renderLobby(state, isHost) {
    const g = this.game;
    this.$('lobbycode').textContent = state.code || '';
    const me = isHost ? 'host' : (g.netClient ? g.netClient.myId : null);
    this.$('lobbyplayers').innerHTML = state.players.map((p, k) => { const h = DATA.heroes[p.hero]; return `<div class="p"><span class="sw" style="background:#${(h ? h.color : 0x888888).toString(16).padStart(6, '0')}"></span><span class="nm">${p.name}</span><span class="hero">${h ? h.name + ', ' + h.title : ''}</span>${p.id === 'host' ? '<span class="tag">host</span>' : ''}${p.id === me ? '<span class="tag">you</span>' : ''}</div>`; }).join('');
    const mt = state.mapType && DATA.mapTypes[state.mapType] ? DATA.mapTypes[state.mapType].label : 'Random map';
    this.$('lobbyinfo').textContent = `${mt} · ${DATA.difficulties[state.difficulty] ? DATA.difficulties[state.difficulty].label : 'Normal'} difficulty · ${state.players.length} defender${state.players.length === 1 ? '' : 's'}. Shared: the King and the starting castle. Yours alone: gold, hero, soldiers, buildings and upgrades. Waves start when every defender is ready.`;
    this.$('lobbystart').classList.toggle('hidden', !isHost);
    this.$('lobbywait').classList.toggle('hidden', isHost);
  }
  webrtcSupported() {
    if (/[?&]nowebrtc/.test(location.search)) return false;
    try { if (typeof RTCPeerConnection !== 'function') return false; const pc = new RTCPeerConnection(); pc.createDataChannel('probe'); pc.close(); return true; } catch (e) { return false; }
  }
  // when this page is embedded somewhere that blocks direct connections (or mouse capture), offer the standalone file
  setupEmbeddedFallbacks() {
    this.downloads = null;
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then((d) => { this.downloads = d || null; this.refreshEmbeddedHints(); }).catch(() => {});
    }
    this.refreshEmbeddedHints();
  }
  copyText(text, btn) {
    const done = () => { if (btn) { const old = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = old; }, 1500); } };
    const fallback = () => { try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); } catch (e) { this.toast('Could not copy. The code is: ' + text, 'error', 6000); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(fallback); else fallback();
  }
  inviteLink(code) { return DATA.siteUrl + '?join=' + code; }
  // sensitivity slider + raw-input toggle, present on the menu and in the help screen
  bindSettings(root) {
    const c = this.game.controls, g = this.game;
    const q = (s) => root.querySelector(s);
    if (q('.sens')) q('.sens').addEventListener('input', () => c.setSensitivity(parseInt(q('.sens').value, 10) / 100, true));
    if (q('.raw')) q('.raw').addEventListener('change', () => c.setRawInput(q('.raw').checked));
    if (q('.inverty')) q('.inverty').addEventListener('change', () => { c.invertY = q('.inverty').checked; g.savePref('inverty', c.invertY ? '1' : '0'); });
    if (q('.vol')) q('.vol').addEventListener('input', () => { SFX.setVolume(parseInt(q('.vol').value, 10) / 100); g.savePref('volume', q('.vol').value); this.refreshSettings(); });
    if (q('.shadows')) q('.shadows').addEventListener('change', () => g.setShadows(q('.shadows').checked));
    if (q('.bloom')) q('.bloom').addEventListener('change', () => g.setBloom(q('.bloom').checked));
    if (q('.spawncheat')) q('.spawncheat').addEventListener('click', () => g.spawnTestChampion());
    if (q('.goldcheat')) q('.goldcheat').addEventListener('click', () => g.cheatGold(parseInt(q('.goldamt').value, 10)));
    if (q('.wavejump')) q('.wavejump').addEventListener('click', () => g.jumpToWave(parseInt(q('.waveamt').value, 10)));
    if (q('.showfps')) q('.showfps').addEventListener('change', () => { g.showFps = q('.showfps').checked; g.savePref('showfps', g.showFps ? '1' : '0'); this.$('fpscounter').classList.toggle('hidden', !g.showFps); });
    root.querySelectorAll('input').forEach(i => i.addEventListener('keydown', (e) => e.stopPropagation()));
  }
  refreshSettings() {
    const c = this.game.controls, g = this.game;
    document.querySelectorAll('.settings').forEach(root => {
      const q = (s) => root.querySelector(s);
      if (q('.sens') && document.activeElement !== q('.sens')) q('.sens').value = Math.round(c.sensMul * 100);
      if (q('.sensval')) q('.sensval').textContent = Math.round(c.sensMul * 100) + '%';
      if (q('.raw')) q('.raw').checked = !!c.rawInput;
      if (q('.inverty')) q('.inverty').checked = !!c.invertY;
      if (q('.vol') && document.activeElement !== q('.vol')) q('.vol').value = Math.round(SFX.volume * 100);
      if (q('.volval')) q('.volval').textContent = Math.round(SFX.volume * 100) + '%';
      if (q('.shadows')) q('.shadows').checked = !!g.shadowsOn;
      if (q('.bloom')) q('.bloom').checked = !!g.bloomOn;
      if (q('.showfps')) q('.showfps').checked = !!g.showFps;
    });
  }
  toggleSettings(force) {
    const el = this.$('settings');
    const show = force !== undefined ? force : el.classList.contains('hidden');
    el.classList.toggle('hidden', !show);
    if (show) this.refreshSettings();
    if (this.game.started && !this.game.over && !this.game.replica) { if (show && !this.game.paused) { this.game.togglePause(); this.settingsPaused = true; } else if (!show && this.settingsPaused) { this.settingsPaused = false; if (this.game.paused) this.game.togglePause(); } }
  }
  urlBox() {
    return `<span class="url"><input type="text" readonly value="${DATA.siteUrl}" onclick="this.select()"><button data-a="copy">Copy</button></span>`;
  }
  wireCopy(root) {
    const b = root.querySelector('[data-a=copy]'); if (!b) return;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const done = () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); };
      const inp = root.querySelector('input'); inp.select();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(DATA.siteUrl).then(done).catch(() => { try { document.execCommand('copy'); done(); } catch (err) {} });
      else { try { document.execCommand('copy'); done(); } catch (err) {} }
    });
  }
  refreshEmbeddedHints() {
    const framed = window.self !== window.top || /[?&]forceframed/.test(location.search);
    const em = this.$('embedded');
    em.classList.toggle('hidden', !framed);
    if (framed) { em.innerHTML = `This embedded view blocks mouse capture and multiplayer. The full game is at ${this.urlBox()}<br>Paste it into a new tab, or bookmark it.`; this.wireCopy(em); }
    const blocked = !this.webrtcSupported();
    this.$('mprow').classList.toggle('hidden', blocked);
    const mb = this.$('mpblocked');
    mb.classList.toggle('hidden', !blocked);
    if (blocked) mb.innerHTML = `Playing together needs a direct connection between browsers, and this page blocks those. Host and join from the full game at ${this.urlBox()}`;
    if (blocked) this.wireCopy(mb);
    const dl = this.$('dlbtn'); if (dl) dl.addEventListener('click', () => this.downloadGame());
    this.onLockChanged();
  }
  downloadGame() {
    const src = window.__selfSource;
    if (!this.downloads || !src) { this.toast('Download is not available here', 'error'); return; }
    this.downloads.save({ filename: 'crownhold.html', data: src }).then(() => this.toast('Saved. Open crownhold.html on your computer for mouse capture and multiplayer.', 'good', 7000))
      .catch((e) => { if (e && e.code === 'declined') return; this.toast('Could not save the file' + (e && e.message ? ': ' + e.message : ''), 'error'); });
  }
  mpStatus(text, err) { const el = this.$('mpstatus'); el.textContent = text; el.classList.toggle('err', !!err); }
  netErrorText(err, what) {
    const m = String((err && (err.message || err.type)) || err || '');
    if (/WebRTC/i.test(m)) return `Could not ${what}: this page blocks direct connections between browsers. Play from the game file on your computer instead.`;
    if (/peer-unavailable|Could not connect to peer/i.test(m)) return `Could not ${what}: no room with that code is open. Check the code with the host.`;
    if (/network|server|socket/i.test(m)) return `Could not ${what}: the matchmaking server could not be reached. Check your connection and try again.`;
    return `Could not ${what}: ${m}`;
  }
  onConnected() { this.$('connecting').classList.add('hidden'); this.toast('Connected. Your hero is at the keep: select them and press C to take control.', 'good', 7000); }
  // GitHub Pages caches index.html for ten minutes: compare our build stamp with the one on the server
  checkForNewerBuild() {
    if (!/^https?:/.test(location.protocol) || location.hostname === '127.0.0.1' || location.hostname === 'localhost') return;
    fetch('js/data.js?nocache=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '').then(txt => {
      const m = txt.match(/DATA\.build = '([^']+)'/);
      if (!m || !DATA.build || m[1] === DATA.build) return;
      const el = document.createElement('div');
      el.className = 'banner'; el.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:200;cursor:pointer';
      el.innerHTML = `A newer build is on the server (${m[1]}); this page is from ${DATA.build}. <b>Click to reload the latest.</b>`;
      el.addEventListener('click', () => { location.href = location.pathname + '?r=' + Date.now() + location.hash; });
      document.body.appendChild(el);
    }).catch(() => {});
  }
  onGameStart() {
    if (this.game.coop) setTimeout(() => { if (this.game.started) this.localToast(`Co-op: rings and pennants show who owns what. You are <span class="sw" style="background:${this.game.cssColor(this.game.playerColor(this.game.localPlayer))}"></span>. Gold crowns mark what everyone shares.`, 'good', 8000); }, 1500);
    this.$('hud').classList.remove('hidden');
    this.$('gameover').classList.add('hidden');
    this.dirty = true;
    this.onSelectionChanged(); this.onModeChanged(); this.refreshPanels();
  }
  showGameOver() {
    const g = this.game;
    this.$('gostats').innerHTML = `Waves survived: <b>${g.stats.wavesCleared}</b> · Enemies slain: <b>${g.stats.kills}</b> · Gold earned: <b>${U.fmt(g.stats.goldEarned)}</b> · Buildings lost: <b>${g.stats.buildingsLost}</b><br>Difficulty: ${g.difficulty.label}`;
    this.$('gameover').classList.remove('hidden');
  }
  toggleHelp(force) {
    const el = this.$('help');
    const show = force !== undefined ? force : el.classList.contains('hidden');
    el.classList.toggle('hidden', !show);
    if (this.game.started && !this.game.over && !this.game.replica) { if (show && !this.game.paused) { this.game.togglePause(); this.helpPaused = true; } else if (!show && this.helpPaused) { this.helpPaused = false; if (this.game.paused) this.game.togglePause(); } }
  }
  closePanels() { this.toggleSettings(false); }

  // ------------------------------------------------------------ panels
  buildPanels() {
    const pb = this.$('panel-build');
    pb.innerHTML = '';
    let lastCat = '';
    for (const key of DATA.buildOrder) {
      const d = DATA.buildings[key];
      if (d.cat !== lastCat) { lastCat = d.cat; const c = document.createElement('div'); c.className = 'cat'; c.textContent = { defense: 'Walls', tower: 'Towers', economy: 'Buildings', wonder: 'Wonders' }[d.cat]; pb.appendChild(c); }
      const b = document.createElement('button');
      b.className = 'item'; b.dataset.build = key;
      b.innerHTML = `<span class="sw" style="background:${{ defense: '#9a9a92', tower: '#c0a060', economy: '#8ab060', wonder: '#e0b0ff' }[d.cat]}"></span><span class="nm">${d.name}</span><span class="cost">${d.cost}</span>`;
      b.addEventListener('click', () => { if (this.game.controls.buildDef && this.game.controls.buildDef.key === key) this.game.controls.cancelBuild(); else this.game.controls.setBuild(key); });
      this.tip(b, () => this.buildingTip(d));
      pb.appendChild(b);
    }
    const pr = this.$('panel-recruit');
    pr.innerHTML = '';
    const c1 = document.createElement('div'); c1.className = 'cat'; c1.textContent = 'Soldiers'; pr.appendChild(c1);
    for (const key of ['swordsman', 'archer', 'pikeman', 'crossbowman', 'cavalry', 'apprentice', 'priest', 'engineer']) {
      const d = DATA.units[key];
      const b = document.createElement('button');
      b.className = 'item'; b.dataset.unit = key;
      b.innerHTML = `<span class="sw" style="background:#${d.cloth.toString(16).padStart(6, '0')}"></span><span class="nm">${d.name}</span><span class="cost">${d.cost}</span>`;
      b.addEventListener('click', (e) => this.game.buyUnit(key, e.shiftKey ? 5 : 1));
      this.tip(b, () => this.unitTip(d));
      pr.appendChild(b);
    }
    const c2 = document.createElement('div'); c2.className = 'cat'; c2.id = 'herocat'; c2.textContent = 'Heroes'; pr.appendChild(c2);
    for (const h of Object.values(DATA.heroes)) {
      const b = document.createElement('button');
      b.className = 'item'; b.dataset.hero = h.key;
      b.innerHTML = `<span class="sw" style="background:#${h.color.toString(16).padStart(6, '0')}"></span><span class="nm">${h.name}<br><span class="lvl">${h.role}</span></span><span class="cost">${DATA.heroBaseCost}</span>`;
      b.addEventListener('click', () => this.game.buyHero(h.key));
      this.tip(b, () => this.unitTip(h, true));
      pr.appendChild(b);
    }
    const pu = this.$('panel-upgrade');
    pu.innerHTML = this.game.coop ? '<div class="note">Your upgrades affect your own units and towers. The shared castle uses the best level among all defenders.</div>' : '';
    for (const d of Object.values(DATA.upgrades)) {
      const b = document.createElement('button');
      b.className = 'item'; b.dataset.upgrade = d.key;
      b.innerHTML = `<span class="sw" style="background:#c8963c"></span><span class="nm">${d.name}<br><span class="lvl"></span></span><span class="cost"></span>`;
      b.addEventListener('click', () => this.game.buyUpgrade(d.key));
      this.tip(b, () => `<b>${d.name}</b><br>${d.desc}`);
      pu.appendChild(b);
    }
    document.querySelectorAll('.tabs button').forEach(t => t.addEventListener('click', () => this.showTab(t.dataset.tab)));
    // holding Shift shows the price of five
    const shift = (on) => { if (this.shiftHeld !== on) { this.shiftHeld = on; this.refreshPanels(); } };
    window.addEventListener('keydown', (e) => { if (e.key === 'Shift') shift(true); });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift') shift(false); });
    window.addEventListener('blur', () => shift(false));
  }
  showTab(name) {
    document.querySelectorAll('.tabs button').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    for (const n of ['build', 'recruit', 'upgrade']) this.$('panel-' + n).classList.toggle('hidden', n !== name);
    this.activeTab = name;
  }
  togglePanel(name) { this.showTab(name); }
  refreshPanels() {
    const g = this.game;
    document.querySelectorAll('[data-build]').forEach(b => {
      const d = DATA.buildings[b.dataset.build];
      const cost = g.buildingCost(d);
      const built = !!(d.unique && g.hasBuilding(d.key, g.localPlayer));
      const cannot = !g.canAfford(cost) || built;
      b.classList.toggle('disabled', cannot);
      b.classList.toggle('on', !!(g.controls.buildDef && g.controls.buildDef.key === d.key));
      b.querySelector('.cost').textContent = built ? 'built' : (cost === 0 && g.freeTokens && g.freeTokens[d.key] > 0 ? 'free' : cost);
    });
    const capFull = g.soldierCount() >= g.soldierCap();
    const mult = this.shiftHeld ? 5 : 1;
    document.querySelectorAll('[data-unit]').forEach(b => { const d = DATA.units[b.dataset.unit]; const full = d.noCap ? g.engineerCount() >= d.maxCount : capFull; b.classList.toggle('disabled', !!(!g.canAfford(d.cost * mult) || full)); const c = b.querySelector('.cost'); if (c) c.textContent = mult > 1 ? `${d.cost * mult} (x5)` : d.cost; });
    document.querySelectorAll('[data-hero]').forEach(b => {
      if (!b.classList.contains('item')) return;
      const owned = g.heroInPlay(b.dataset.hero);
      b.classList.toggle('disabled', owned || !g.canAfford(g.heroCost()));
      b.classList.toggle('owned', owned);
      b.querySelector('.cost').textContent = owned ? 'in play' : g.heroCost();
    });
    { const hc = this.$('herocat'); if (hc) hc.textContent = `Heroes (${g.heroCost()} gold, each one bought raises the price)`; }
    document.querySelectorAll('[data-upgrade]').forEach(b => {
      const d = DATA.upgrades[b.dataset.upgrade]; const lvl = g.upgrades[d.key] || 0;
      const maxed = lvl >= d.max; const cost = g.upgradeCost(d.key);
      const locked = !!(d.requires && !g.hasActive(d.requires, g.localPlayer));
      b.querySelector('.lvl').textContent = maxed ? `Level ${lvl} (max)` : `Level ${lvl}/${d.max}` + (locked ? ` · needs your own ${DATA.buildings[d.requires].name}` : '');
      b.querySelector('.cost').textContent = maxed ? '—' : cost;
      b.classList.toggle('disabled', !!(maxed || locked || !g.canAfford(cost)));
    });
  }
  buildingTip(d) {
    let s = `<b>${d.name}</b> · ${this.game.buildingCost(d)} gold<br>${d.desc}<br><span class="st">HP ${d.hp}`;
    if (d.tower) s += ` · Damage ${d.dmg} · Range ${this.game.towerRangeFor(d).toFixed(0)}m · every ${d.cd}s`;
    if (d.income) s += ` · +${d.income} gold/wave`;
    if (d.soldierCap) s += ` · +${d.soldierCap} soldier cap`;
    s += ` · ${d.w}×${d.d} cells</span>`;
    return s;
  }
  unitTip(d, hero) {
    let s = `<b>${d.name}</b>${hero ? ` · ${d.title}` : ''}<br>${d.desc || d.passive || ''}<br><span class="st">HP ${d.hp} · Damage ${d.dmg} · Range ${d.range}m · Speed ${d.speed} · Armor ${Math.round((d.armor || 0) * 100)}%</span>`;
    if (d.abilities) s += '<br>' + d.abilities.map(k => `<b>${DATA.abilities[k].key}</b> ${DATA.abilities[k].name}`).join(' · ');
    if (hero) s += `<br><span class="st">Costs ${this.game.heroCost()} gold now; every hero you buy raises the next price by 50%. A fallen hero stays dead until bought back. Only one of each hero can exist.</span>`;
    return s;
  }
  tip(el, fn) {
    const tt = this.$('tooltip');
    el.addEventListener('mouseenter', () => { tt.innerHTML = fn(); tt.classList.remove('hidden'); this.placeTip(el); });
    el.addEventListener('mouseleave', () => tt.classList.add('hidden'));
  }
  placeTip(el) {
    const tt = this.$('tooltip'); const r = el.getBoundingClientRect();
    let x = r.right + 10, y = r.top;
    if (x + 270 > window.innerWidth) x = r.left - 270;
    if (y + tt.offsetHeight > window.innerHeight - 10) y = window.innerHeight - tt.offsetHeight - 10;
    tt.style.left = x + 'px'; tt.style.top = y + 'px';
  }

  // ------------------------------------------------------------ hud bindings
  bindHud() {
    const g = this.game;
    this.$('nextwave').addEventListener('click', () => g.tryStartWave());
    this.$('pausebtn').addEventListener('click', () => g.togglePause());
    this.$('helpbtn').addEventListener('click', () => this.toggleHelp());
    this.$('mutebtn').addEventListener('click', () => { SFX.toggleMute(); this.$('mutebtn').classList.toggle('on', SFX.muted); });
    this.$('fsbtn').addEventListener('click', () => g.controls.toggleFullscreen());
    if (!document.fullscreenEnabled) this.$('fsbtn').classList.add('hidden');
    this.$('speed').querySelectorAll('button').forEach(b => b.addEventListener('click', () => g.setTimeScale(parseInt(b.dataset.s, 10))));
    document.querySelectorAll('.quick button').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'selectAll') g.controls.selectAllSoldiers();
      else if (a === 'selectArmy') g.controls.selectArmy();
      else if (a === 'selectKing') g.controls.selectKing();
      else if (a === 'selectHeroes') g.controls.selectHeroes();
      else if (a === 'selectEngineers') { const es = g.units.filter(u => u.def.repair && !u.dead); if (es.length) { g.controls.setSelection(es); g.controls.focusOnSelection(); } else this.toast('No engineers. Recruit them in the Recruit tab.'); }
    }));
    const ra = this.$('repairall');
    ra.addEventListener('click', () => g.repairAll());
    ra.addEventListener('mouseenter', () => { this.showDamage = true; });
    ra.addEventListener('mouseleave', () => { this.showDamage = false; });
    this.$('autorepairbox').addEventListener('change', (e) => { if (g.replica) { g.net.send({ t: 'autoRepair', on: e.target.checked }); return; } g.autoRepair = e.target.checked; this.toast(g.autoRepair ? 'Auto-repair on: damaged buildings are repaired after each wave' : 'Auto-repair off'); });
    this.$('minimap').addEventListener('mousedown', (e) => {
      const r = this.minimap.getBoundingClientRect();
      const SPAN = DATA.GRID * DATA.CELL + 20;
      const x = ((e.clientX - r.left) / r.width - 0.5) * SPAN, z = ((e.clientY - r.top) / r.height - 0.5) * SPAN;
      if (g.controls.mode === 'rts') { g.controls.focus.set(x, 0, z); g.controls.clampFocus(); }
    });
    // stop HUD clicks from reaching the canvas selection logic
    for (const id of ['topbar', 'left', 'right', 'selpanel']) this.$(id).addEventListener('mousedown', (e) => e.stopPropagation());
  }

  // ------------------------------------------------------------ state changes
  onSelectionChanged() {
    const c = this.game.controls;
    const panel = this.$('selpanel');
    const units = [...c.selected].filter(u => !u.dead);
    const b = c.selectedBuilding;
    if (b && b.def.tower && !c.buildDef) this.game.showRange(b.pos.x, b.pos.z, b.range); else if (!c.buildDef) this.game.showRange(null);
    if (!units.length && !b) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    if (b) {
      const canUp = b.canUpgrade();
      const g = this.game, coop = g.coop, mine = g.ownsOrShared(b);
      const ownerLine = coop ? `<div class="owner"><span class="sw" style="background:${g.cssColor(g.ownerColor(b))}"></span>${!b.owner ? 'Shared: any defender can repair or upgrade it. Upgrades use the best level among you.' : (mine ? 'Yours: only you can repair, upgrade or sell it.' : `${g.playerName(b.owner)}'s: only they can repair, upgrade or sell it.`)}</div>` : '';
      panel.innerHTML = `<div><div class="nm">${b.name}${b.def.tower ? ` · Level ${b.level}` : ''}${b.high ? ' · high ground (+30% range, +15% damage, out of melee reach)' : ''}${g.isMuster(b, g.localPlayer) ? ' · muster point' : ''}${b.underConstruction ? ' · under construction' : ''}</div><div class="sub">${b.underConstruction ? 'Engineers finish it during the wave; it completes on its own when the wave ends.' : b.def.desc}</div>${ownerLine}
        <div class="bar"><div class="fill" id="selhp"></div></div>
        <div class="stats" id="selstats"></div>
        <div class="row">
          <button data-a="repair"${mine ? '' : ' class="disabled" title="Not yours"'}>Repair (${b.repairCost()})</button>
          ${canUp ? `<button data-a="upgrade"${mine ? '' : ' class="disabled" title="Not yours"'}>Upgrade (${b.upgradeCost()})</button>` : ''}
          ${b.def.soldierCap && !b.def.keep ? `<button data-a="muster"${mine ? '' : ' class="disabled" title="Not yours"'}>${g.isMuster(b, g.localPlayer) ? 'Muster point (click to unset)' : 'Muster recruits here'}</button>` : ''}
          ${b.def.keep ? '' : `<button data-a="sell"${mine ? '' : ' class="disabled" title="Not yours"'}>Sell (+${b.sellValue()})</button>`}
        </div></div>`;
      if (mine) {
        const mb = panel.querySelector('[data-a=muster]'); if (mb) mb.addEventListener('click', () => { this.game.setMuster(b); this.onSelectionChanged(); });
        panel.querySelector('[data-a=repair]').addEventListener('click', () => this.game.repairBuilding(b));
        if (canUp) panel.querySelector('[data-a=upgrade]').addEventListener('click', () => this.game.upgradeBuilding(b));
        if (!b.def.keep) panel.querySelector('[data-a=sell]').addEventListener('click', () => this.game.sellBuilding(b));
      }
      this.selRef = b;
      return;
    }
    if (units.length === 1) {
      const u = units[0];
      const mine = u.team === 'player' && (!u.owner || u.owner === this.game.localPlayer);
      const own = mine;
      const ownerNote = u.team === 'player' && u.owner && u.owner !== this.game.localPlayer ? ` · ${this.game.playerName(u.owner)}'s` : (u.team === 'player' && !u.owner && this.game.playerOrder.length > 1 ? ' · shared' : '');
      const g = this.game;
      const ownerLine = g.coop && u.team === 'player' ? `<div class="owner"><span class="sw" style="background:${g.cssColor(g.ownerColor(u))}"></span>${!u.owner ? 'Shared: any defender can command or control the King.' : (mine ? 'Yours: only you can command them.' : `${g.playerName(u.owner)}'s: only they can command them.`)}</div>` : '';
      const abil = u.abilities.length ? `<div class="abil">${u.abilities.map(a => `<span data-ab="${a.key}"><b>${a.def.key}</b> ${a.def.name}</span>`).join('')}</div>` : '';
      const lvl = u.isHero ? ` · Level ${u.level}${u.level < DATA.heroMaxLevel ? ` (${u.xp}/${DATA.heroXp(u.level)} xp)` : ''}` : '';
      const affix = u.affix ? `<div class="owner"><span class="sw" style="background:${g.cssColor(u.affix.color)}"></span>Elite: ${u.affix.desc} Double bounty.</div>` : '';
      panel.innerHTML = `<div><div class="nm">${u.name}${u.isHero ? ` · ${u.def.title}` : ''}${lvl}${ownerNote}</div><div class="sub">${u.def.desc || u.def.passive || (u.isKing ? 'If he falls, the game is lost.' : (u.team === 'player' ? '' : 'Enemy'))}</div>${affix}${ownerLine}
        <div class="bar"><div class="fill" id="selhp"></div></div>
        <div class="stats" id="selstats"></div>${abil}
        ${own ? `<div class="row"><button class="ctl" data-a="control">Take control <kbd>C</kbd></button><button data-a="hold">Hold <kbd>H</kbd></button><button data-a="follow">Follow hero <kbd>F</kbd></button></div>` : ''}</div>`;
      if (own) {
        panel.querySelector('[data-a=control]').addEventListener('click', () => c.enterControl(u));
        panel.querySelector('[data-a=hold]').addEventListener('click', () => c.holdSelected());
        panel.querySelector('[data-a=follow]').addEventListener('click', () => c.followSelected());
      }
      this.selRef = u;
      return;
    }
    const counts = {};
    for (const u of units) counts[u.name] = (counts[u.name] || 0) + 1;
    panel.innerHTML = `<div><div class="nm">${units.length} units selected</div><div class="sub">${Object.entries(counts).map(([n, k]) => `${k} ${n}`).join(', ')}</div>
      <div class="row"><button class="ctl" data-a="control">Take control of ${units[0].name} <kbd>C</kbd></button><button data-a="hold">Hold <kbd>H</kbd></button><button data-a="follow">Follow hero <kbd>F</kbd></button></div></div>`;
    panel.querySelector('[data-a=control]').addEventListener('click', () => c.controlSelected());
    panel.querySelector('[data-a=hold]').addEventListener('click', () => c.holdSelected());
    panel.querySelector('[data-a=follow]').addEventListener('click', () => c.followSelected());
    this.selRef = null;
  }
  updateSelPanel() {
    const r = this.selRef;
    if (!r || this.$('selpanel').classList.contains('hidden')) return;
    const hp = this.$('selhp'), st = this.$('selstats');
    if (!hp) return;
    if (r.dead) { this.onSelectionChanged(); return; }
    hp.style.width = Math.max(0, r.hp / r.maxHp * 100) + '%';
    if (r instanceof Unit) {
      let s = `<span>HP <b>${Math.round(r.hp)}/${Math.round(r.maxHp)}</b></span><span>Damage <b>${Math.round(r.effDmg)}</b></span><span>Range <b>${r.range}m</b></span><span>Armor <b>${Math.round(r.armor * 100)}%</b></span>`;
      if (r.command) s += `<span>Order: <b>${r.command.type}</b></span>`;
      st.innerHTML = s;
      for (const a of r.abilities) { const el = this.$('selpanel').querySelector(`[data-ab="${a.key}"]`); if (el) el.classList.toggle('cd', a.timer > 0); }
    } else {
      const rb = this.$('selpanel').querySelector('[data-a=repair]');
      if (rb) { const locked = this.game.repairsLocked(); rb.classList.toggle('disabled', locked || r.repairCost() <= 0); rb.textContent = locked ? 'Repair (engineers only during waves)' : `Repair (${r.repairCost()})`; }
      let s = `<span>HP <b>${Math.round(r.hp)}/${Math.round(r.maxHp)}</b></span>`;
      if (r.underConstruction) s += `<span>Built <b>${Math.round(r.progress * 100)}%</b></span>`;
      if (r.def.tower) s += `<span>Damage <b>${Math.round(r.dmg)}</b></span><span>Range <b>${r.range.toFixed(1)}m</b></span>`;
      st.innerHTML = s;
    }
  }
  // co-op: name the owner of whatever the cursor is over
  updateHoverLabel() {
    const g = this.game, c = g.controls, el = this.$('hoverlabel');
    if (!el) return;
    const o = c.mode === 'fps' ? null : (c.hovered && c.hovered.team === 'player' ? c.hovered : c.hoveredBuilding);
    if (!g.coop || !o || c.buildDef) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const label = g.ownerLabel(o);
    el.innerHTML = `<span class="sw" style="background:${g.cssColor(g.ownerColor(o))}"></span>${label === 'Yours' ? 'Your ' + o.name : (label === 'Shared' ? 'Shared: ' + o.name : label + ' ' + o.name)}`;
    el.style.left = (c.mouse.x + 16) + 'px'; el.style.top = (c.mouse.y + 18) + 'px';
  }
  onModeChanged() {
    const c = this.game.controls;
    const fps = c.mode === 'fps';
    this.$('fpshud').classList.toggle('hidden', !fps);
    this.$('left').classList.toggle('hidden', fps);
    this.$('right').classList.toggle('passive', fps);
    this.$('topbar').classList.toggle('passive', fps);
    this.onLockChanged();
    this.$('selpanel').classList.toggle('hidden', fps || (!c.selected.size && !c.selectedBuilding));
    if (fps) {
      const u = c.controlled;
      this.$('fpsname').textContent = u.name + (u.isHero ? ` · ${u.def.title} · Lv ${u.level}` : '') + (u.def.repair ? ' · hold LMB at a damaged building to repair it' : '');
      this.$('fpsabil').innerHTML = u.abilities.map(a => `<div class="abbox" data-ab="${a.key}"><div class="cdfill"></div><div class="n"><kbd>${a.def.key}</kbd>${a.def.name}</div></div>`).join('');
    }
    this.dirty = true;
  }
  onLockChanged() {
    const c = this.game.controls;
    const el = this.$('lockhint');
    if (!el) return;
    if (c.mode !== 'fps') { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (c.lookLocked) { el.classList.add('hidden'); return; }
    const fsOk = !!document.fullscreenEnabled;
    const extra = `${fsOk ? ' <button data-a="fs">Fullscreen</button>' : ''}<button data-a="pop">Open in its own window</button>${this.downloads ? '<button data-a="dl">Download the game for full mouse capture</button>' : ''}`;
    if (c.lockUnavailable) el.innerHTML = `This page will not let the game capture the mouse${c.lockError ? ` (${c.lockError})` : ''}. For full mouse look open the game at ${this.urlBox()}<br>Here, mouse look works inside the frame, and <b>holding the right mouse button</b> (or the left while attacking) keeps it working beyond it; a right-button tap still orders your soldiers.${extra}`;
    else el.innerHTML = `<b>Click</b> the game to capture the mouse.${extra}`;
    const fsb = el.querySelector('[data-a=fs]'); if (fsb) fsb.addEventListener('click', (e) => { e.stopPropagation(); c.toggleFullscreen(); });
    this.wireCopy(el);
    el.querySelector('[data-a=pop]').addEventListener('click', (e) => { e.stopPropagation(); c.popOut(); });
    const dlb = el.querySelector('[data-a=dl]'); if (dlb) dlb.addEventListener('click', (e) => { e.stopPropagation(); this.downloadGame(); });
  }
  setCrosshair(x, y) {
    const ch = this.$('crosshair');
    if (x === null) { if (this.chFree) { this.chFree = false; ch.style.left = '50%'; ch.style.top = '50%'; ch.classList.remove('free'); } return; }
    this.chFree = true; ch.classList.add('free');
    ch.style.left = x + 'px'; ch.style.top = y + 'px';
  }
  onBuildModeChanged() {
    this.refreshPanels();
    if (!this.game.controls.buildDef) this.$('buildhint').classList.add('hidden');
    this.$('minimap').style.opacity = 1;
  }
  showBuildHint(text) {
    const el = this.$('buildhint'), d = this.game.controls.buildDef;
    if (!d) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.classList.toggle('err', !!text && !/walls/.test(text));
    const during = this.game.waves && this.game.waves.active;
    const eng = this.game.engineerCount();
    el.innerHTML = text ? text : `<b>${d.name}</b> · ${this.game.buildingCost(d)} gold · ${d.drag ? 'drag to build a line' : 'click to place'} · <kbd>R</kbd> rotate · right click to cancel${during ? `<br><span class="${eng ? 'note' : 'warnnote'}">Wave in progress: placed as a construction site for your ${eng} engineer${eng === 1 ? '' : 's'}${eng ? '' : ' (you have none: recruit one, or it finishes after the wave)'}</span>` : ''}`;
  }
  showSelBox(a, b) {
    const el = this.$('selbox');
    el.classList.remove('hidden');
    el.style.left = Math.min(a.x, b.x) + 'px'; el.style.top = Math.min(a.y, b.y) + 'px';
    el.style.width = Math.abs(a.x - b.x) + 'px'; el.style.height = Math.abs(a.y - b.y) + 'px';
  }
  hideSelBox() { this.$('selbox').classList.add('hidden'); }
  flashMarker(x, z, color) {
    const m = this.game.marker;
    m.position.set(x, 0.08, z); m.material.color.setHex(color); m.visible = true; m.scale.setScalar(0.6); m.material.opacity = 0.9;
    this.game.markerT = 0.7;
  }
  onPause() {
    const p = this.game.paused;
    this.$('pausebtn').classList.toggle('on', p);
    let badge = document.querySelector('.paused-badge');
    if (p && !badge) { badge = document.createElement('div'); badge.className = 'paused-badge'; badge.textContent = 'Paused'; this.$('hud').appendChild(badge); }
    if (!p && badge) badge.remove();
  }
  // shown only on this screen, may carry markup
  localToast(html, type = 'info', dur = 3200) {
    const box = this.$('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + type; el.innerHTML = html;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), dur);
  }
  toast(msg, type = 'info', dur = 3200) {
    if (this.game.netHost) this.game.netHost.toast(msg, type, dur);
    const box = this.$('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + type; el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 450); }, dur);
  }

  // ------------------------------------------------------------ per-frame
  update(dt) {
    const g = this.game;
    this.tick += dt; this.mapTick += dt;
    if (this.tick < 0.12 && !this.dirty) return;
    this.tick = 0;
    this.$('gold').textContent = U.fmt(g.gold);
    this.$('wave').textContent = g.waves.active ? g.waves.number : `${g.waves.number} done`;
    this.$('enemies').textContent = g.waves.active ? `${g.enemiesAlive()} (+${g.waves.pending.length} coming)` : '0';
    this.$('soldiers').textContent = `${g.soldierCount()}/${g.soldierCap()}`;
    if (g.king) this.$('kinghp').style.width = Math.max(0, g.king.hp / g.king.maxHp * 100) + '%';
    const boss = g.boss && !g.boss.dead ? g.boss : null;
    this.$('bossbar').classList.toggle('hidden', !boss);
    if (boss) { this.$('bossname').textContent = boss.name; this.$('bosshp').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%'; }
    const nw = this.$('nextwave');
    nw.classList.toggle('disabled', g.waves.active || g.over);
    const coop = g.playerOrder.length > 1;
    nw.innerHTML = g.waves.active ? `Wave ${g.waves.number} in progress` : (coop ? `${g.isReady(g.localPlayer) ? 'Ready' : 'Ready up'} for wave ${g.waves.preview.n} (${g.readyCount()}/${g.playerOrder.length}) <kbd>N</kbd>` : `Start Wave ${g.waves.preview.n} <kbd>N</kbd>`);
    nw.classList.toggle('on', coop && !g.waves.active && g.isReady(g.localPlayer));
    if (this.dirty || this.tick === 0) {
      const d = g.waves.describe(g.waves.preview);
      const modLine = d.mod ? `<br><span class="mod">${d.mod}</span>` : '', ctLine = d.contract ? `<br><span class="contract">Contract. ${d.contract}</span>` : '';
      const live = g.contract ? `<br><span class="contract">${DATA.contracts[g.contract.key].name}: ${g.contract.failed ? 'failed' : (g.contract.need ? `${g.contract.progress}/${g.contract.need}` : 'on track')}</span>` : '';
      const liveMod = g.waveMod ? `<br><span class="mod">${g.waveMod.name}</span>` : '';
      const mis = g.missions && g.missions.active ? `<br><span class="mission">King's errand: <b>${g.missions.active.def.name}</b>. ${g.missions.brief()}${g.missions.active.def.type === 'work' && g.missions.active.progress > 0 ? ` ${Math.round(g.missions.active.progress / g.missions.active.def.work * 100)}%` : ''}</span>` : '';
      this.$('wavepreview').innerHTML = g.waves.active ? `<b>Wave ${g.waves.number}</b>: ${g.waves.total} enemies${liveMod}${live}${mis}` : `<b>Next: wave ${g.waves.preview.n}</b> from the ${d.from.join(', ')}<br>${d.units.map(u => u.startsWith('BOSS') ? `<span class="boss">${u}</span>` : u).join(', ')}${modLine}${ctLine}`;
    }
    this.$('speed').querySelectorAll('button').forEach(b => b.classList.toggle('on', parseInt(b.dataset.s, 10) === g.timeScale));
    { const total = g.repairTotal(), ra = this.$('repairall');
      const damaged = g.buildings.filter(b => b.repairCost() > 0 && g.ownsOrShared(b)).length;
      const locked = g.repairsLocked();
      ra.innerHTML = locked ? `Engineers repair during waves${damaged ? ` (${damaged} damaged)` : ''}` : (damaged ? `Repair ${damaged} building${damaged === 1 ? '' : 's'}${g.coop ? ' (yours + shared)' : ''} <span class="cost">${total}g</span> <kbd>R</kbd>` : 'Nothing to repair');
      ra.classList.toggle('disabled', !damaged || locked); }
    this.$('autorepairbox').checked = !!g.autoRepair;
    { const rs = this.$('roomstat'), rt = this.$('roomtext');
      const roster = g.playerOrder.map(id => { const p = g.players[id]; return `<span class="sw" style="background:${g.cssColor(g.playerColor(id))}"></span>${p.name}${id === g.localPlayer ? ' (you)' : ''} ${U.fmt(p.gold)}g`; }).join(' · ') + (g.coop ? ` · <span class="sw" style="background:${g.cssColor(DATA.sharedColor)}"></span>shared` : '');
      if (g.netHost) { rs.classList.remove('hidden'); rt.innerHTML = `Room <b>${g.netHost.code}</b> · ${roster}`; }
      else if (g.netClient) { rs.classList.remove('hidden'); rt.innerHTML = `Room <b>${g.netClient.code || ''}</b> · ${roster}${g.netClient.lost ? ' · <span class="bad">disconnected</span>' : ''}`; }
      else rs.classList.add('hidden'); }
    if (this.dirty) { this.refreshPanels(); this.dirty = false; }
    this.updateSelPanel();
    this.updateHoverLabel();
    if (g.controls.mode === 'fps') {
      const u = g.controls.controlled;
      if (u) {
        this.$('fpshp').style.width = Math.max(0, u.hp / u.maxHp * 100) + '%';
        u.abilities.forEach(a => {
          const el = this.$('fpsabil').querySelector(`[data-ab="${a.key}"]`); if (!el) return;
          el.classList.toggle('ready', a.timer <= 0);
          el.querySelector('.cdfill').style.width = a.timer > 0 ? (a.timer / a.def.cd * 100) + '%' : '0%';
        });
      }
    }
    if (this.mapTick > 0.2) { this.mapTick = 0; this.drawMinimap(); }
  }
  drawMinimap() {
    const g = this.game, ctx = this.mctx, W = this.minimap.width;
    const SPAN = DATA.GRID * DATA.CELL + 20, HALF = SPAN / 2;
    const s = W / SPAN;
    ctx.fillStyle = '#2e5a2a'; ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = '#3f7a35'; ctx.beginPath(); ctx.arc(W / 2, W / 2, DATA.BUILD_RANGE * s, 0, Math.PI * 2); ctx.fill();
    const px = (x) => (x + HALF) * s, pz = (z) => (z + HALF) * s;
    if (g.world) {
      const cs = DATA.CELL * s;
      for (let j = 0; j < g.world.n; j++) for (let i = 0; i < g.world.n; i++) {
        const k = g.world.kind[g.world.idx(i, j)]; if (!k) continue;
        ctx.fillStyle = k === CELL_WATER ? '#3a7fc0' : (k === CELL_ROCK ? '#6a6a64' : (k === 6 ? '#8a7048' : (k === 7 ? '#3a4a24' : (k === 8 ? '#ff6a10' : (k === 9 ? '#c8b070' : (k === 12 ? '#8a8078' : (k === 10 ? '#a07040' : (k === 11 ? '#15151c' : '#1f4a25'))))))));
        const c = g.world.cellCenter(i, j); ctx.fillRect(px(c.x - 1), pz(c.z - 1), cs + 0.5, cs + 0.5);
      }
    }
    const coop = g.coop;
    for (const bl of g.buildings) {
      ctx.fillStyle = coop && bl.owner ? g.cssColor(g.playerColor(bl.owner)) : (bl.def.tower ? '#e0c060' : (bl.def.keep ? '#ffd040' : (bl.def.gate ? '#b08040' : (bl.def.temporary ? '#a0e0ff' : (bl.def.cat === 'economy' ? '#80c0ff' : (bl.def.cat === 'wonder' ? '#e0a0ff' : (coop ? '#ffd040' : '#bbb')))))));
      for (const c of bl.cells) { const w = g.grid.cellToWorld(c.i, c.j); ctx.fillRect(px(w.x - 1), pz(w.z - 1), 2 * s + 0.5, 2 * s + 0.5); }
    }
    for (const u of g.units) {
      if (u.dead) continue;
      ctx.fillStyle = u.team === 'enemy' ? (u.isBoss ? '#ff3020' : '#ff7060') : (coop ? g.cssColor(g.ownerColor(u)) : (u.isKing ? '#ffe040' : (u.isHero ? '#60c0ff' : '#80ff90')));
      const r = u.isBoss ? 4 : (u.isHero || u.isKing ? 3 : 1.6);
      ctx.beginPath(); ctx.arc(px(u.pos.x), pz(u.pos.z), r, 0, Math.PI * 2); ctx.fill();
    }
    // lanes enemies can use, and the ones the next wave will take
    if (g.world && g.world.laneSpawns) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; for (const si of g.world.laneSpawns) { const sp = DATA.spawnPoints[si]; ctx.beginPath(); ctx.arc(px(sp.x), pz(sp.z), 6, 0, Math.PI * 2); ctx.stroke(); } }
    const plan = g.waves.active ? null : g.waves.preview;
    if (plan && plan.dirs) { ctx.fillStyle = 'rgba(255,80,60,0.9)'; for (const a of plan.dirs) { const x = Math.cos(a) * DATA.SPAWN_RADIUS, z = Math.sin(a) * DATA.SPAWN_RADIUS; ctx.beginPath(); ctx.arc(px(x), pz(z), 5, 0, Math.PI * 2); ctx.fill(); } }
    // the King's errand
    if (g.missions && g.missions.active && !g.missions.active.carried) { const m = g.missions.active; ctx.fillStyle = '#ffe080'; ctx.beginPath(); ctx.moveTo(px(m.x), pz(m.z) - 7); ctx.lineTo(px(m.x) + 6, pz(m.z) + 4); ctx.lineTo(px(m.x) - 6, pz(m.z) + 4); ctx.closePath(); ctx.fill(); }
    // camera focus
    const c = g.controls;
    const f = c.mode === 'fps' ? c.controlled.pos : c.focus;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px(f.x), pz(f.z), c.mode === 'fps' ? 4 : Math.max(6, c.camDist * 0.35 * s), 0, Math.PI * 2); ctx.stroke();
  }
}
