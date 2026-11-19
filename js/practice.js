/* Worship Practice and Listen. Practice: loop a section, slow it down, play in another key. Listen: audio only, queue from the set. */
(function () {
'use strict';
var WS = window.WS, W = window.WCore, E = window.WEdit;
var h = WS.h, add = WS.add, icon = WS.icon, ib = WS.ib, toast = WS.toast, sheet = WS.sheet, S = WS.S;
var A = WS.Audio, Synth = WS.Synth;

/* ---------------- shared player for Practice and Keys ---------------- */
var P = WS.Player = {
  id: null, el: null, grid: null, loop: null, speed: 1, ramp: false, loops: 0, click: false, countIn: false, semis: 0, beats: 4,
  subs: [], timer: null, lastBeat: -1, counting: false, dur: 0
};
P.on = function (fn) { P.subs.push(fn); return function () { P.subs = P.subs.filter(function (f) { return f !== fn; }); }; };
function emit(ev) { P.subs.slice().forEach(function (f) { try { f(ev); } catch (e) { console.error(e); } }); }
P.open = function (song, url) {
  P.stop();
  P.id = song.id; P.grid = W.parseGrid(song.grid); P.loops = 0; P.dur = 0;
  var el = new Audio(url); el.preload = 'auto';
  try { el.preservesPitch = true; el.webkitPreservesPitch = true; el.mozPreservesPitch = true; } catch (e) { /* ignore */ }
  el.playbackRate = P.speed;
  el.addEventListener('loadedmetadata', function () { P.dur = el.duration; el.playbackRate = P.speed; emit('meta'); });
  el.addEventListener('play', function () { emit('state'); });
  el.addEventListener('pause', function () { emit('state'); });
  el.addEventListener('ended', function () { emit('state'); });
  el.addEventListener('error', function () { toast('This audio could not be played. Try downloading it again.'); emit('state'); });
  P.el = el;
  P.timer = setInterval(P.tick, 40);
  return el;
};
P.stop = function () {
  clearInterval(P.timer); P.timer = null; P.counting = false;
  if (P.el) { try { P.el.pause(); } catch (e) { /* ignore */ } P.el.removeAttribute('src'); try { P.el.load(); } catch (e2) { /* ignore */ } }
  P.el = null; emit('state');
};
P.playing = function () { return !!(P.el && !P.el.paused) || P.counting; };
P.beatSec = function () {
  var g = P.grid; if (!g || g.b.length < 2) return 0.6 / Math.max(0.4, P.speed);
  return (g.b[1] - g.b[0]) / P.beats / Math.max(0.4, P.speed);
};
P.setSpeed = function (s) { P.speed = Math.max(0.4, Math.min(1, Math.round(s * 100) / 100)); if (P.el) P.el.playbackRate = P.speed; emit('speed'); };
P.setLoop = function (l) { P.loop = l; P.loops = 0; emit('loop'); };
P.loopStart = function () { return P.loop && P.grid ? W.gridTimeAt(P.grid, P.loop[0], 0) : 0; };
P.play = function () {
  if (!P.el) return;
  Synth.unlock();
  if (P.loop && P.grid) { var t = P.el.currentTime; if (t < P.loopStart() - 0.05 || t >= W.gridBarEnd(P.grid, P.loop[1])) P.el.currentTime = P.loopStart(); }
  P.el.playbackRate = P.speed;
  if (P.countIn && P.grid) {
    var n = P.beats, bs = P.beatSec(), i = 0;
    P.counting = true; emit('state');
    var go = function () {
      if (!P.counting) return;
      if (i < n) { Synth.click(i === 0); i++; setTimeout(go, bs * 1000); }
      else { P.counting = false; P.lastBeat = -1; P.el.play().catch(playFail); }
    };
    go();
  } else { P.lastBeat = -1; P.el.play().catch(playFail); }
};
function playFail(e) { toast('The audio could not start: ' + ((e && e.message) || 'blocked by the browser. Tap play again.')); }
P.pause = function () { P.counting = false; if (P.el) P.el.pause(); emit('state'); };
P.toggle = function () { if (P.playing()) P.pause(); else P.play(); };
P.tick = function () {
  var el = P.el; if (!el) return;
  var t = el.currentTime;
  if (P.loop && P.grid && !el.paused) {
    var endT = W.gridBarEnd(P.grid, P.loop[1]);
    if (t >= endT - 0.03) {
      P.loops++;
      if (P.ramp && P.speed < 1) P.setSpeed(P.speed + 0.05);
      el.currentTime = P.loopStart(); t = el.currentTime; P.lastBeat = -1; emit('loopwrap');
    }
  }
  if (P.click && P.grid && !el.paused) {
    var g = W.gridBarAt(P.grid, t);
    if (g.bar >= 0) {
      var beat = Math.floor(g.frac * P.beats + 0.02), key = g.bar * 16 + beat;
      if (key !== P.lastBeat) { P.lastBeat = key; Synth.click(beat === 0); }
    }
  }
  emit('tick');
};
P.loopSecs = function () { return P.loop && P.grid ? [P.loopStart(), W.gridBarEnd(P.grid, P.loop[1])] : null; };
P.seekBy = function (d) { if (!P.el || P.counting) return; WS.seekBy(P.el, d, P.loopSecs()); emit('tick'); };
P.toStart = function () { if (!P.el || P.counting) return; P.memo = P.memo || {}; WS.toStart(P.el, P.loopSecs(), P.memo); emit('tick'); };
P.keyFor = function (song, semis) { return W.transposeKeyName ? W.transposeKeyName(song.key, semis) : song.key; };

/* ---------------- Practice ---------------- */
function modSemis(n) { return ((n % 12) + 12) % 12; }

WS.viewPractice = function (v) {
  var song = WS.songById(v.id);
  var root = h('div', { class: 'prac' });
  if (!song) { add(root, h('div', { class: 'page' }, h('p', { class: 'err', text: 'This song is gone.' }), h('button', { class: 'btn', text: 'Back', onclick: WS.back }))); return root; }
  var demo = song.id === WS.demoId();
  var sh0 = WS.getSheet(song.id);
  var sets = v.setId ? WS.setById(v.setId) : null;
  var key0 = song.key || (sh0 && sh0.key) || 'C';
  var st = { follow: true, page: null, playBar: null, semis: WS.lsGet('ws-pr-semis-' + song.id, 0), secIdx: -1, pick: 0, handle: null, wave: null, dur: 0, shifting: null, hasAudio: false, usingShift: false };
  var wasPlayer = P.id === song.id && P.el;
  if (P.id !== song.id) { P.speed = WS.lsGet('ws-pr-speed', 0.7); P.ramp = WS.lsGet('ws-pr-ramp', false); P.countIn = WS.lsGet('ws-pr-count', false); P.click = false; P.loop = null; }
  var playKey = function () { return W.transposeKeyName(key0, st.semis); };

  var head = h('div'), chipsEl = h('div', { class: 'ph-chips' }), waveBox = h('div', { class: 'card prac-wave', style: { position: 'relative', overflow: 'hidden', padding: 0 } });
  var waveMsg = h('div', { class: 'small', style: { position: 'absolute', inset: 0, display: 'none', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 12px', pointerEvents: 'none' } });
  add(waveBox, waveMsg);
  var ovHost = h('div', { class: 'ovstrip', 'aria-label': 'Whole song. Tap to jump.' }), zoomLbl = h('span', { class: 'small tabnum zlbl' });
  var zoomOut = ib('zout', 'Show more bars', function () { V.zoom(1); drawZoom(); }), zoomIn = ib('zin', 'Show fewer bars', function () { V.zoom(-1); drawZoom(); });
  var waveWrap = h('div', { class: 'wavewrap' }, waveBox, h('div', { class: 'wzoom' }, ovHost, zoomLbl, zoomOut, zoomIn));
  function drawZoom() { zoomLbl.textContent = V.zoomLabel(); zoomOut.classList.toggle('dis', !V.canZoom(1)); zoomIn.classList.toggle('dis', !V.canZoom(-1)); }
  var V = WS.WaveView({
    host: waveBox, ov: ovHost, zoomKey: 'ws-wzoom',
    data: function () { return { grid: P.grid, nBars: nBars(), secs: [], sel: null, loop: P.loop, peaks: st.wave, dur: st.dur, pseudoSec: 60 / ((sh0 && Number(sh0.tempo)) || 90) * P.beats }; },
    isPlaying: function () { return P.playing(); },
    onTap: function (t) { if (P.el && t.time != null) P.el.currentTime = t.time; },
    onSeek: function (t) { if (P.el) P.el.currentTime = t; },
    onFollow: function (on) { st.follow = on; drawFollow(); if (on && !syncSheet()) keepInView(); },
    onZoom: drawZoom
  });
  var sheetBox = h('div', { class: 'card', style: { padding: '4px 6px 2px', minHeight: '80px' } });
  var hint = h('div', { class: 'small', style: { textAlign: 'center' } });
  var speedCard = h('button', { class: 'card stat', type: 'button', style: { textAlign: 'left', minHeight: '44px' }, onclick: speedSheet });
  var keyCard = h('button', { class: 'card stat', type: 'button', style: { textAlign: 'left', minHeight: '44px' }, onclick: keySheet });
  var countBtn = h('button', { class: 'btn', type: 'button', onclick: function () { P.countIn = !P.countIn; WS.lsSet('ws-pr-count', P.countIn); drawOpts(); } });
  var clickBtn = h('button', { class: 'btn', type: 'button', onclick: function () { P.click = !P.click; drawOpts(); } });
  var optsRow = h('div', { class: 'row', style: { gap: '8px' } });
  optsRow.style.display = 'flex';
  [countBtn, clickBtn].forEach(function (b) { b.style.flex = '1 1 0'; });
  add(optsRow, countBtn, clickBtn);
  var loopLbl = h('div', { class: 'small tabnum' });
  var playBtn = h('button', { class: 'play big', type: 'button', 'aria-label': 'Play', onclick: function () { if (!P.el) { toast(st.msg || 'There is no audio on this device yet. Open More, Audio file.'); return; } P.toggle(); } });
  var keysBtn = h('button', { class: 'btn acc', type: 'button', html: icon('keys') + '<span>Keys</span>', onclick: function () { st.keep = true; WS.go({ k: 'keys', id: song.id, setId: v.setId, idx: v.idx }); } });
  var followBtn = h('button', { class: 'btn', type: 'button', onclick: function () { V.setFollow(!st.follow); } });
  function noAudio() { toast(st.msg || 'There is no audio on this device yet. Open More, Audio file.'); }
  var tstart = ib('tostart', 'Back to the start', function () { if (!P.el) { noAudio(); return; } P.toStart(); if (st.follow) V.setFollow(true); });
  var tback = ib('back10', 'Back 10 seconds', function () { if (!P.el) { noAudio(); return; } P.seekBy(-10); });
  var tfwd = ib('fwd10', 'Forward 10 seconds', function () { if (!P.el) { noAudio(); return; } P.seekBy(10); });
  var body = h('div', { class: 'ph-body' }, waveWrap, sheetBox, hint, h('div', { class: 'twocol' }, speedCard, keyCard), optsRow);
  var bottom = h('div', { class: 'pbar' }, h('div', { class: 'prow' }, tstart, tback, playBtn, tfwd, followBtn), h('div', { class: 'prow2' }, loopLbl, keysBtn));
  add(root, head, chipsEl, body, bottom);
  function drawFollow() {
    followBtn.innerHTML = icon('follow') + '<span>Follow</span>';
    followBtn.className = 'btn' + (st.follow ? ' acc' : '');
    followBtn.setAttribute('aria-pressed', st.follow ? 'true' : 'false');
    followBtn.setAttribute('aria-label', st.follow ? 'Follow is on. Tap to stop following the playhead.' : 'Follow is off. Tap to follow the playhead.');
  }

  function sections() { return sh0 ? W.sheetSections(sh0) : []; }
  function nBars() { return sh0 ? sh0.bars.length : 0; }
  function shown() { return sh0 ? W.sheetToKey(sh0, playKey()) : null; }

  function drawHead() {
    WS.clear(head);
    var tempo = sh0 && sh0.tempo ? ' · ' + sh0.tempo + ' BPM' : '';
    var k = key0 + (st.semis ? ' → ' + playKey() : '');
    add(head, WS.songHeader(song, 'practice', { sub: k + tempo, noPill: true }));
  }
  function drawChips() {
    WS.clear(chipsEl);
    var secs = sections();
    var all = h('button', { class: 'chip' + (!P.loop ? ' on' : ''), type: 'button', text: 'Whole song', onclick: function () { st.secIdx = -1; st.pick = 0; P.setLoop(null); } });
    chipsEl.appendChild(all);
    secs.forEach(function (s, i) {
      var on = P.loop && P.loop[0] === s.from && P.loop[1] === s.to;
      chipsEl.appendChild(h('button', { class: 'chip' + (on ? ' on' : ''), type: 'button', text: s.label || s.mark || 'Start', onclick: function () { st.secIdx = i; st.pick = 0; P.setLoop([s.from, s.to]); } }));
    });
  }
  function drawSpeed() {
    WS.clear(speedCard);
    add(speedCard, h('div', { class: 'small', text: 'Speed' }), h('div', { class: 'big', text: Math.round(P.speed * 100) + '%' }), h('div', { class: P.ramp && P.speed < 1 ? 'acc' : 'mu small', text: P.ramp ? '+5% each loop → 100%' : 'Tap to change' }));
  }
  function drawKey() {
    WS.clear(keyCard);
    var d = st.semis ? (st.semis > 0 ? '+' : '') + st.semis + ' from ' + key0 : 'Original key';
    var ln = 'Chart moves';
    if (st.semis) ln = st.usingShift ? 'Audio and chart both move' : (st.shifting ? 'Preparing audio…' : (st.hasAudio ? 'Audio is not shifted yet' : 'Chart moves'));
    add(keyCard, h('div', { class: 'small', text: 'Play in' }), h('div', { class: 'row', style: { alignItems: 'baseline', gap: '8px' } }, h('div', { class: 'big', text: playKey() }), h('div', { class: 'small', text: d })), h('div', { class: 'small', text: ln }));
  }
  function drawOpts() {
    countBtn.innerHTML = '<span>Count-in ' + (P.countIn ? 'on' : 'off') + '</span>';
    countBtn.className = 'btn' + (P.countIn ? ' acc' : '');
    clickBtn.innerHTML = icon('metro') + '<span>Click ' + (P.click ? 'on' : 'off') + '</span>';
    clickBtn.className = 'btn' + (P.click ? ' acc' : '');
  }
  function drawPlay() {
    var pl = P.playing();
    playBtn.innerHTML = icon(pl ? 'pause' : 'play'); playBtn.setAttribute('aria-label', pl ? 'Pause' : 'Play');
    loopLbl.textContent = P.el && !P.grid ? 'Set the beat grid to follow bars.' : (P.loop ? 'Loop ' + (P.loops + 1) + ' of ∞' : (P.el ? 'No loop' : 'No audio'));
    var no = !P.el; playBtn.style.opacity = no ? 0.45 : 1;
  }
  function hintText() {
    if (!sh0) return 'This song has no lead sheet yet. Open Transcribe to write one.';
    if (!P.grid && P.el) return 'No beat grid yet. Open Transcribe and tap Make beat grid so the loop knows where the bars are.';
    if (st.pick === 1) return 'Now tap the last bar of the loop.';
    return 'Tap a bar to start a loop, then tap the last bar.';
  }

  /* sheet of the loop. Without a loop it shows a page of 8 bars, and the page follows the playing bar. */
  function pageOf(bar) { var a = Math.floor(bar / 8) * 8; return [a, Math.min(nBars() - 1, a + 7)]; }
  function shownRange() { return P.loop || st.page || (st.page = pageOf(0)); }
  function drawSheet() {
    WS.clear(sheetBox);
    if (!sh0 || !nBars()) { add(sheetBox, h('p', { class: 'note', style: { padding: '18px 12px' }, text: 'No lead sheet for this song yet.' })); hint.textContent = hintText(); return; }
    var l = shownRange();
    var sh = shown();
    WNote.load().then(function () {
      WS.clear(sheetBox);
      var wd = (sheetBox.clientWidth || 358) - 12;
      try {
        st.handle = WNote.render(sheetBox, sh, { width: wd, scale: 1, barsPerLine: 2, ranges: [l], theme: document.documentElement.getAttribute('data-theme'), triangle: WS.lsGet('ws-tri', true), loop: P.loop, onBar: onBarTap });
        if (st.playBar != null) { st.handle.setPlaying(st.playBar); if (st.playFrac != null && P.playing()) st.handle.setBeat(st.playBar, st.playFrac); }
        keepInView();
      } catch (e) { console.error(e); st.handle = WNote.renderGrid(sheetBox, sh, { ranges: [l], barsPerLine: 2, onBar: onBarTap }); }
    }).catch(function (e) { WS.clear(sheetBox); st.handle = WNote.renderGrid(sheetBox, sh, { ranges: [l], barsPerLine: 2, onBar: onBarTap }); toast('The notation library could not load: ' + ((e && e.message) || e) + '. Showing a chord grid.'); });
    hint.textContent = hintText();
  }
  function onBarTap(i) {
    if (P.playing() && st.follow) V.setFollow(false);
    if (st.pick === 1 && P.loop) { var a = P.loop[0]; P.setLoop([Math.min(a, i), Math.max(a, i)]); st.pick = 0; return; }
    st.pick = 1; P.setLoop([i, i]);
    if (P.el && P.grid && P.grid.b[i] != null) P.el.currentTime = P.grid.b[i];
  }
  // keep the line with the playing bar on screen (the waveform stays pinned at the top)
  function keepInView() {
    if (!st.follow || !st.handle || !st.handle.lineOf || st.playBar == null || !P.playing()) return;
    var ln = st.handle.lineOf(st.playBar); if (!ln || !st.handle.svg) return;
    var sr = st.handle.svg.getBoundingClientRect(), k = sr.height / (st.handle.height || sr.height);
    var top = sr.top + ln.y * k, bot = top + ln.h * k;
    var br = body.getBoundingClientRect(), minTop = waveWrap.getBoundingClientRect().bottom + 6, maxBot = br.bottom - 8;
    if (top < minTop) body.scrollBy({ top: top - minTop, behavior: 'smooth' });
    else if (bot > maxBot) body.scrollBy({ top: bot - maxBot, behavior: 'smooth' });
  }
  // when the playing bar is not on the shown page, show the page it is on (no loop)
  function syncSheet() {
    if (!sh0 || !nBars() || P.loop || st.playBar == null) return false;
    var pg = pageOf(st.playBar);
    if (!st.page || pg[0] !== st.page[0]) { st.page = pg; drawSheet(); return true; }
    return false;
  }

  /* waveform */
  function drawWave() {
    V.refresh();
    waveMsg.style.display = st.wave ? 'none' : 'flex'; waveMsg.textContent = st.msg || '';
    drawZoom();
  }
  function drawLoopEl() { V.refresh(); }

  /* speed sheet */
  function speedSheet() {
    var s2, lbl = h('div', { class: 'big', style: { font: '700 34px var(--tight)' }, text: Math.round(P.speed * 100) + '%' });
    var rng = h('input', { type: 'range', min: 40, max: 100, step: 5, value: Math.round(P.speed * 100), 'aria-label': 'Speed', style: { width: '100%' } });
    rng.addEventListener('input', function () { P.setSpeed(Number(rng.value) / 100); WS.lsSet('ws-pr-speed', P.speed); lbl.textContent = Math.round(P.speed * 100) + '%'; });
    var ramp = h('button', { class: 'chip' + (P.ramp ? ' on' : ''), type: 'button', text: 'Add 5% each loop until 100%', onclick: function () { P.ramp = !P.ramp; WS.lsSet('ws-pr-ramp', P.ramp); ramp.classList.toggle('on', P.ramp); drawSpeed(); } });
    var quick = h('div', { class: 'chips' }, [50, 60, 70, 80, 90, 100].map(function (n) { return h('button', { class: 'chip', type: 'button', text: n + '%', onclick: function () { rng.value = n; rng.dispatchEvent(new Event('input')); } }); }));
    s2 = sheet([h('h3', { text: 'Speed' }), lbl, rng, quick, ramp, h('p', { class: 'note', text: 'The pitch stays the same when you slow the audio down. Below 50% some phones sound rough.' }), h('button', { class: 'btn pri block', text: 'Done', onclick: function () { s2.close(); } })]);
  }

  /* key sheet */
  function keySheet() {
    var s2, body = h('div', { class: 'col', style: { gap: '12px' } });
    s2 = sheet([h('h3', { text: 'Play in' }), body]);
    function draw() {
      WS.clear(body);
      var grid = h('div', { class: 'pal' });
      for (var d = -6; d <= 6; d++) {
        (function (d2) {
          var kn = W.transposeKeyName(key0, d2);
          grid.appendChild(h('button', { type: 'button', class: st.semis === d2 ? 'on' : '', html: WS.esc(kn) + '<small>' + (d2 > 0 ? '+' : '') + d2 + '</small>', onclick: function () { pick(d2); } }));
        })(d);
      }
      add(body, h('p', { class: 'note', text: 'The chart changes right away. The audio is shifted by a copy made on this phone. It takes about a minute and is kept for this song only.' }), grid);
      if (st.shifting) {
        var bar = h('div', { class: 'prog' }, h('i', { style: { width: Math.round((st.shiftP || 0) * 100) + '%' } }));
        add(body, h('div', { class: 'small', text: 'Shifting the audio to ' + playKey() + '…' }), bar, h('button', { class: 'btn block', text: 'Cancel', onclick: function () { st.shifting.cancel(); } }));
      }
      add(body, h('button', { class: 'btn pri block', text: 'Done', onclick: function () { s2.close(); } }));
    }
    st.redrawKeySheet = draw; draw();
  }
  function pick(d) {
    if (st.shifting) st.shifting.cancel();
    st.semis = d; WS.lsSet('ws-pr-semis-' + song.id, d);
    drawHead(); drawSheet(); drawKey();
    loadAudio();
    if (st.redrawKeySheet) st.redrawKeySheet();
  }

  /* audio */
  function loadAudio() {
    st.msg = ''; st.usingShift = false;
    if (demo) { st.msg = 'The demo song has no audio.'; drawWave(); drawPlay(); drawKey(); return; }
    if (!song.audio) { st.msg = 'No audio linked yet. Open More, Audio file.'; drawWave(); drawPlay(); drawKey(); return; }
    A.init().then(function () {
      st.hasAudio = A.state(song.audio) === 'device';
      if (!st.hasAudio) { st.msg = 'The audio is in Drive. Open More, Audio file, to download it to this phone.'; drawWave(); drawPlay(); drawKey(); return; }
      var shiftP = st.semis ? A.shiftedUrl(song.audio, st.semis) : Promise.resolve(null);
      return shiftP.then(function (su) {
        var wantShift = st.semis && !su;
        st.usingShift = !!su;
        if (wantShift && !st.shifting) startShift();
        return (su ? Promise.resolve(su) : A.url(song.audio)).then(function (url) {
          var wasPlaying = P.playing(), t = P.el && P.id === song.id ? P.el.currentTime : 0;
          if (!(P.id === song.id && P.el && P.src === url)) {
            var el = P.open(song, url); P.src = url;
            el.addEventListener('loadedmetadata', function () { if (t) el.currentTime = Math.min(t, el.duration || t); if (wasPlaying) P.play(); });
          }
          P.beats = sh0 ? W.timeInfo(sh0.time, sh0.sub).beats : 4;
          drawPlay(); drawKey();
          return A.peaks(song.audio, 3000).then(function (p) { st.wave = p.p; st.dur = p.dur; drawWave(); });
        });
      });
    }).catch(function (e) { st.msg = (e && e.message) || 'The audio could not be opened.'; toast(st.msg); drawWave(); drawPlay(); });
  }
  function startShift() {
    var semis = st.semis, sj = A.prepareShift(song.audio, semis, { onProgress: function (p) { st.shiftP = p; if (st.redrawKeySheet) st.redrawKeySheet(); } });
    st.shifting = sj; drawKey();
    sj.promise.then(function () { st.shifting = null; if (semis === st.semis) { toast('The audio is now in ' + playKey() + '.'); loadAudio(); } drawKey(); if (st.redrawKeySheet) st.redrawKeySheet(); })
      .catch(function (e) { st.shifting = null; drawKey(); if (st.redrawKeySheet) st.redrawKeySheet(); if (!(e && e.cancelled)) toast((e && e.message) || 'The audio could not be shifted.'); });
  }

  /* player events */
  var off = P.on(function (ev) {
    if (ev === 'tick') {
      var el = P.el; if (!el) return;
      var t = el.currentTime, playing = !el.paused;
      if (P.grid) {
        var g = W.gridBarAt(P.grid, t), pb = g.bar >= 0 ? g.bar : (g.over ? null : 0);
        st.playFrac = pb != null ? g.frac : null;
        if (pb !== st.playBar) {
          st.playBar = pb;
          // the shown page follows the bar (VexFlow is only drawn again when the page changes)
          var redrawn = st.follow && playing && pb != null && syncSheet();
          if (!redrawn) { if (st.handle && st.handle.setPlaying) st.handle.setPlaying(pb); if (st.follow && playing) keepInView(); }
        }
        if (st.handle && st.handle.setBeat) st.handle.setBeat(playing && pb != null ? pb : null, g.frac);
      } else st.playBar = null;
      V.tick(t, playing);
    } else if (ev === 'state') {
      var pl = P.playing();
      if (pl && !st.wasPlaying && !st.follow) V.setFollow(true);
      st.wasPlaying = pl;
      if (!pl && st.handle && st.handle.setBeat) st.handle.setBeat(null);
      drawPlay();
    }
    else if (ev === 'speed') drawSpeed();
    else if (ev === 'loop') { drawChips(); drawSheet(); drawLoopEl(); drawPlay(); }
    else if (ev === 'loopwrap') drawPlay();
    else if (ev === 'meta') { drawPlay(); }
  });
  var offRes = WS.on('resize', function () { drawSheet(); drawWave(); });
  var offAudio = WS.on('audio', function () { if (!P.el) loadAudio(); });
  WS.onLeave(function () {
    off(); offRes(); offAudio();
    if (st.shifting) st.shifting.cancel();
    V.destroy(); if (!st.keep) { P.stop(); P.id = null; }
  });

  setTimeout(function () {
    drawHead(); drawChips(); drawSpeed(); drawKey(); drawOpts(); drawPlay(); drawFollow(); drawSheet(); drawWave(); loadAudio();
    if (P.loop) { drawChips(); }
  }, 0);
  window.__pr = { st: st, P: P, V: V };
  return root;
};

/* ---------------- Listen ---------------- */
var SPEEDS = [1, 0.9, 0.75, 0.6, 0.5];
var L = { el: null };
WS.Synth.extPlaying = function () { return !!(L.el && !L.el.paused); };
WS.viewListen = function (v) {
  var root = h('div', { class: 'listen' });
  var set = v.setId ? WS.setById(v.setId) : null;
  var raw = set ? WS.itemsOf(set).filter(function (it) { return it.t === 'song'; }) : [];
  if (!raw.length) { var s1 = WS.songById(v.id); raw = s1 ? [{ t: 'song', song: s1.id, title: s1.title, key: s1.key }] : []; }
  var q = raw.map(function (it) { var sg = WS.songById(it.song); return { it: it, song: sg, sheet: sg ? WS.getSheet(sg.id) : null, ok: false }; }).filter(function (x) { return x.song; });
  var cur = Math.max(0, q.findIndex(function (x) { return x.song.id === v.id; }));
  var st = { idx: cur, speedI: Math.max(0, SPEEDS.indexOf(WS.lsGet('ws-ls-speed', 1))), repeat: WS.lsGet('ws-ls-repeat', 'all'), msg: '' };
  var firstSong = q[cur] && q[cur].song;
  var head = h('div'), card = h('div', { class: 'nowcard' }), lockNote = h('div', { class: 'small row', style: { gap: '8px' } }), upnext = h('div');
  add(root, head, h('div', { class: 'ph-body', style: { padding: '6px 20px 0', gap: '18px' } }, card, lockNote, upnext));

  var els = {};
  function cardBuild() {
    WS.clear(card);
    els.top = h('div', { class: 'row mu2', style: { justifyContent: 'space-between' } }, h('span'), h('span'));
    els.sec = h('div', { class: 'big' }); els.ch = h('div', { class: 'chordbig' }); els.nx = h('div', { class: 'mu2', style: { textAlign: 'right' } });
    els.bar = h('div', { class: 'bar' }, h('i')); els.t0 = h('span', { text: '0:00' }); els.t1 = h('span', { text: '0:00' });
    els.rep = ib('loop', 'Repeat', cycleRepeat); els.play = h('button', { class: 'play', type: 'button', 'aria-label': 'Play', onclick: toggle });
    els.spd = h('button', { class: 'ib', type: 'button', 'aria-label': 'Speed', style: { fontSize: '13px', fontWeight: '600' }, onclick: cycleSpeed });
    add(card, els.top,
      h('div', { class: 'row', style: { alignItems: 'flex-end', justifyContent: 'space-between' } }, h('div', null, h('div', { class: 'mu2', text: 'Now in' }), els.sec), h('div', null, els.ch, els.nx)),
      h('div', { class: 'col', style: { gap: '6px' } }, els.bar, h('div', { class: 'row mu2 tabnum', style: { justifyContent: 'space-between', fontSize: '11.5px' } }, els.t0, els.t1)),
      h('div', { class: 'ctl' }, ib('prev', 'Previous song', function () { go(-1); }), ib('back10', 'Back 10 seconds', function () { skip(-10); }), els.play, ib('fwd10', 'Forward 10 seconds', function () { skip(10); }), ib('next', 'Next song', function () { go(1); })),
      h('div', { class: 'ctl2' }, els.rep, h('button', { class: 'txtb', type: 'button', 'aria-label': 'Back to the start of this song', html: icon('tostart') + '<span>To start</span>', onclick: toStart }), els.spd));
    paintCtl();
  }
  function cur2() { return q[st.idx]; }
  function drawHead() {
    WS.clear(head);
    var x = cur2(); if (!x) return;
    var sh = x.sheet, k = x.it.key || x.song.key || '';
    var sub = [x.song.artist, (x.song.key && k && k !== x.song.key ? x.song.key + ' → ' + k : k), sh && sh.tempo ? sh.tempo + ' BPM' : ''].filter(Boolean).join(' · ');
    add(head, WS.songHeader(x.song, 'listen', { sub: sub, noPill: true }));
  }
  function paintCtl() {
    var pl = L.el && !L.el.paused;
    els.play.innerHTML = icon(pl ? 'pause' : 'play'); els.play.setAttribute('aria-label', pl ? 'Pause' : 'Play');
    els.rep.className = 'ib' + (st.repeat !== 'off' ? ' on' : ''); els.rep.setAttribute('aria-label', 'Repeat ' + st.repeat);
    els.rep.title = st.repeat === 'one' ? 'Repeat this song' : st.repeat === 'all' ? 'Repeat the set' : 'Repeat off';
    els.spd.textContent = (SPEEDS[st.speedI] === 1 ? '1' : SPEEDS[st.speedI]) + '×';
    var x = cur2();
    els.top.firstChild.textContent = (set ? (set.name || 'Set') + (set.date ? ' · ' + W.fmtDate(set.date) : '') : 'Single song');
    els.top.lastChild.textContent = (st.idx + 1) + ' of ' + q.length;
    if (x && !x.ok) { els.sec.textContent = st.msg || 'No audio'; }
  }
  function drawUp() {
    WS.clear(upnext);
    add(upnext, h('div', { class: 'small', style: { fontWeight: 600, letterSpacing: '.08em', paddingBottom: '4px' }, text: 'UP NEXT' }));
    q.forEach(function (x, i) {
      if (i <= st.idx && q.length > 1 && i < st.idx) return;
      var sh = x.sheet;
      var row = h('button', { type: 'button', class: 'row', style: { minHeight: '54px', width: '100%', borderBottom: '1px solid var(--line)', gap: '12px', textAlign: 'left', opacity: x.ok === false && x.checked ? 0.5 : 1 }, onclick: function () { play(i); } },
        h('div', { style: { width: '6px', height: '6px', borderRadius: '3px', background: i === st.idx ? 'var(--acc)' : 'transparent' } }),
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600, fontSize: '14.5px' }, text: x.song.title }), h('div', { class: 'small', text: [x.it.key || x.song.key, x.song.audio ? (x.checked && !x.ok ? 'Audio not on this phone' : '') : 'No audio linked'].filter(Boolean).join(' · ') })),
        h('div', { class: 'small tabnum', text: x.dur ? WS.fmtTime(x.dur) : '' }));
      upnext.appendChild(row);
    });
  }
  function secAt(x, t) {
    var g = W.parseGrid(x.song.grid); if (!g || !x.sheet) return null;
    var gb = W.gridBarAt(g, t); if (gb.bar < 0) return null;
    var secs = W.sheetSections(x.sheet), sec = null;
    secs.forEach(function (s) { if (gb.bar >= s.from && gb.bar <= s.to) sec = s; });
    var bar = x.sheet.bars[gb.bar], rb = W.resolveBars(x.sheet)[gb.bar];
    var unit = Math.floor(gb.frac * rb.units), chord = E.chordIn(bar, unit);
    if (!chord) for (var i = gb.bar - 1; i >= 0 && !chord; i--) { var c = x.sheet.bars[i].ch; if (c && c.length) chord = c[c.length - 1].c; }
    // next chord: the next chord symbol after this unit, across bars
    var next = null, bi = gb.bar, u = unit + 1;
    for (var n = 0; n < 12 && !next && bi < x.sheet.bars.length; n++) {
      var bb = x.sheet.bars[bi], units = W.resolveBars(x.sheet)[bi].units;
      (bb.ch || []).forEach(function (c2) { if (!next && c2.at >= u && W.normChordSym(c2.c) !== W.normChordSym(chord || '')) next = c2.c; });
      bi++; u = 0;
    }
    var itemKey = x.it.key || x.song.key, shift = W.signedShift(x.sheet.key, itemKey);
    function sh(c) { return c ? W.chordDisplay(W.transposeChordSym(c, shift, W.usesFlats(itemKey))) : ''; }
    return { section: sec ? (sec.label || sec.mark || 'Start') : '', chord: sh(chord), next: sh(next), bar: gb.bar + 1 };
  }
  function tick() {
    var el = L.el, x = cur2(); if (!el || !x) return;
    var t = el.currentTime, d = el.duration || x.dur || 0;
    els.bar.firstChild.style.width = (d ? Math.min(100, t / d * 100) : 0) + '%';
    els.t0.textContent = WS.fmtTime(t); els.t1.textContent = WS.fmtTime(d);
    var s = secAt(x, t);
    if (s) { els.sec.textContent = s.section || ('Bar ' + s.bar); els.ch.textContent = s.chord; els.nx.textContent = s.next ? 'next ' + s.next : ''; }
    else { els.sec.textContent = x.song.title; els.ch.textContent = ''; els.nx.textContent = x.song.grid ? '' : 'No beat grid yet'; }
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && d && isFinite(d)) { try { navigator.mediaSession.setPositionState({ duration: d, playbackRate: el.playbackRate || 1, position: Math.min(t, d) }); } catch (e) { /* ignore */ } }
  }
  var timer = null;
  function setSrc(i) {
    var x = q[i]; if (!x) return Promise.resolve(false);
    st.idx = i; st.msg = '';
    drawHead(); paintCtl(); drawUp();
    if (!x.song.audio) { x.checked = true; x.ok = false; st.msg = 'No audio linked to this song'; paintCtl(); drawUp(); return Promise.resolve(false); }
    return A.init().then(function () {
      if (A.state(x.song.audio) !== 'device') { x.checked = true; x.ok = false; st.msg = 'Audio is not on this phone. Open More, Audio file.'; paintCtl(); drawUp(); return false; }
      return A.url(x.song.audio).then(function (url) {
        x.ok = true; x.checked = true;
        if (!L.el) { L.el = new Audio(); L.el.preload = 'auto'; wire(L.el); }
        var el = L.el; el.src = url; try { el.preservesPitch = true; el.webkitPreservesPitch = true; } catch (e) { /* ignore */ }
        applySpeed();
        mediaMeta(x); prefetch(i + 1);
        return true;
      });
    }).catch(function (e) { st.msg = (e && e.message) || 'The audio could not be opened.'; toast(st.msg); paintCtl(); return false; });
  }
  function applySpeed() { if (L.el) { L.el.playbackRate = SPEEDS[st.speedI]; L.el.defaultPlaybackRate = SPEEDS[st.speedI]; } }
  function prefetch(i) { var x = q[i] || (st.repeat === 'all' ? q[0] : null); if (x && x.song.audio && A.state(x.song.audio) === 'device') A.url(x.song.audio).catch(function () { /* ignore */ }); }
  function wire(el) {
    el.addEventListener('loadedmetadata', function () { var x = cur2(); if (x) x.dur = el.duration; applySpeed(); drawUp(); tick(); });
    el.addEventListener('play', function () { applySpeed(); paintCtl(); if (!timer) timer = setInterval(tick, 200); });
    el.addEventListener('pause', function () { paintCtl(); tick(); });
    el.addEventListener('seeked', function () { tick(); });
    el.addEventListener('ended', function () { advance(); });
    el.addEventListener('error', function () { toast('This audio could not be played. Try downloading it again.'); paintCtl(); });
  }
  function advance() {
    if (st.repeat === 'one') { L.el.currentTime = 0; L.el.play(); return; }
    var n = st.idx + 1; if (n >= q.length) { if (st.repeat === 'all') n = 0; else { paintCtl(); return; } }
    play(n, true);
  }
  function play(i, auto) {
    setSrc(i).then(function (ok) {
      if (ok) L.el.play().catch(function (e) { toast('The audio could not start: ' + ((e && e.message) || 'blocked by the browser. Tap play.')); });
      else if (auto) { // skip songs without audio, but never loop forever
        var any = q.some(function (z) { return z.song.audio && A.state(z.song.audio) === 'device'; });
        if (any && i + 1 < q.length) play(i + 1, true);
      }
    });
  }
  function toggle() {
    if (!L.el || !L.el.src) { play(st.idx); return; }
    if (L.el.paused) L.el.play().catch(function (e) { toast('The audio could not start: ' + ((e && e.message) || 'blocked by the browser. Tap play.')); }); else L.el.pause();
  }
  function go(d) {
    var n = st.idx + d;
    if (n < 0) { if (L.el && L.el.currentTime > 3) { L.el.currentTime = 0; return; } n = st.repeat === 'all' ? q.length - 1 : 0; }
    if (n >= q.length) n = st.repeat === 'all' ? 0 : q.length - 1;
    var was = L.el && !L.el.paused;
    setSrc(n).then(function (ok) { if (ok && (was || true)) L.el.play().catch(function () { /* user can tap play */ }); });
  }
  function skip(d) { if (!L.el || !L.el.src) { toast(st.msg || 'There is no audio loaded yet.'); return; } WS.seekBy(L.el, d, null); tick(); }
  function toStart() { if (!L.el || !L.el.src) { toast(st.msg || 'There is no audio loaded yet.'); return; } L.el.currentTime = 0; tick(); }
  function cycleSpeed() { st.speedI = (st.speedI + 1) % SPEEDS.length; WS.lsSet('ws-ls-speed', SPEEDS[st.speedI]); applySpeed(); paintCtl(); }
  function cycleRepeat() { st.repeat = st.repeat === 'all' ? 'one' : st.repeat === 'one' ? 'off' : 'all'; WS.lsSet('ws-ls-repeat', st.repeat); paintCtl(); toast(st.repeat === 'one' ? 'Repeating this song.' : st.repeat === 'all' ? 'Repeating the whole set.' : 'Repeat is off.'); }
  function mediaMeta(x) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: x.song.title, artist: x.song.artist || (set && set.name) || 'Worship', album: set ? set.name : 'Worship' });
      var ms = navigator.mediaSession;
      ms.setActionHandler('play', function () { toggle(); }); ms.setActionHandler('pause', function () { if (L.el) L.el.pause(); });
      ms.setActionHandler('previoustrack', function () { go(-1); }); ms.setActionHandler('nexttrack', function () { go(1); });
      ms.setActionHandler('seekto', function (d) { if (L.el && d.seekTime != null) { var du = L.el.duration; L.el.currentTime = Math.max(0, isFinite(du) ? Math.min(du, d.seekTime) : d.seekTime); tick(); } });
      ms.setActionHandler('seekbackward', function (d) { skip(-((d && d.seekOffset) || 10)); });
      ms.setActionHandler('seekforward', function (d) { skip((d && d.seekOffset) || 10); });
    } catch (e) { /* ignore */ }
  }
  lockNote.innerHTML = icon('lock') + '<span>Keeps playing with the screen locked. Songs stay on this phone for offline use.</span>';
  lockNote.style.color = 'var(--mut)';
  var offAudio = WS.on('audio', function () { drawUp(); });
  WS.onLeave(function () {
    clearInterval(timer); timer = null; offAudio();
    if (L.el) { L.el.pause(); L.el.removeAttribute('src'); try { L.el.load(); } catch (e) { /* ignore */ } }
    L.el = null;
    if ('mediaSession' in navigator) { try { navigator.mediaSession.metadata = null; ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward'].forEach(function (a) { navigator.mediaSession.setActionHandler(a, null); }); } catch (e) { /* ignore */ } }
  });
  setTimeout(function () {
    cardBuild(); drawHead(); paintCtl(); drawUp();
    // check which songs have audio here, then load the first one (no autoplay)
    A.init().then(function () {
      q.forEach(function (x) { x.checked = true; x.ok = !!(x.song.audio && A.state(x.song.audio) === 'device'); });
      drawUp();
      return setSrc(st.idx).then(function () { tick(); });
    });
  }, 0);
  window.__ls = { q: q, st: st, L: L };
  return root;
};
})();
