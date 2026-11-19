/* Worship Keys: check what you play against the chart. Mic (chroma) or a MIDI keyboard. */
(function () {
'use strict';
var WS = window.WS, W = window.WCore, E = window.WEdit;
var h = WS.h, add = WS.add, icon = WS.icon, ib = WS.ib, toast = WS.toast, sheet = WS.sheet;
var P = WS.Player;

function norm(c) { var s = 0; for (var i = 0; i < c.length; i++) s += c[i] * c[i]; return Math.sqrt(s) || 1; }
// guess a chord or a single note from a 12 bin chroma
function readChroma(ch, flats) {
  var n = norm(ch), tot = 0, mx = 0, mi = 0, i;
  for (i = 0; i < 12; i++) { tot += ch[i]; if (ch[i] > mx) { mx = ch[i]; mi = i; } }
  if (tot <= 0) return { single: null, chord: null };
  var active = 0; for (i = 0; i < 12; i++) if (ch[i] > mx * 0.35) active++;
  if (active <= 1 || mx / tot > 0.62) return { single: W.noteName(mi, flats), chord: null };
  var best = null;
  for (var r = 0; r < 12; r++) {
    [[0, 4, 7, ''], [0, 3, 7, 'm'], [0, 4, 7, 11, 'maj7'], [0, 3, 7, 10, 'm7'], [0, 4, 7, 10, '7']].forEach(function (t) {
      var name = t[t.length - 1], tones = t.slice(0, -1), v = 0, cnt = 0;
      tones.forEach(function (x) { v += ch[(r + x) % 12]; cnt++; });
      var off = tot - v, score = (v / tot) - (off / tot) * 0.7 - (cnt > 3 ? 0.04 : 0);
      if (!best || score > best.s) best = { s: score, name: W.noteName(r, flats) + name };
    });
  }
  return { single: null, chord: best && best.s > 0.35 ? best.name : null };
}

/* ---- mic ---- */
WS.Mic = {
  ctx: null, stream: null, an: null, raf: null, on: false,
  start: function (cb, fail) {
    var self = this;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fail('This browser cannot use the microphone. Open the app in Safari and allow the mic.'); return Promise.resolve(false); }
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) { /* ignore */ }
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
      var AC = window.AudioContext || window.webkitAudioContext; self.ctx = new AC(); self.stream = stream;
      var src = self.ctx.createMediaStreamSource(stream), an = self.ctx.createAnalyser();
      an.fftSize = 8192; an.smoothingTimeConstant = 0.6; src.connect(an); self.an = an; self.on = true;
      var buf = new Float32Array(an.frequencyBinCount), sr = self.ctx.sampleRate, binHz = sr / an.fftSize;
      var flats = false;
      (function loop() {
        if (!self.on) return;
        an.getFloatFrequencyData(buf);
        var ch = new Array(12).fill(0), lvl = 0;
        for (var i = Math.ceil(65 / binHz); i < Math.min(buf.length, 2100 / binHz); i++) {
          var f = i * binHz, mag = Math.pow(10, buf[i] / 20); if (mag > lvl) lvl = mag;
          if (buf[i] < -85) continue;
          var midi = 69 + 12 * Math.log2(f / 440), pc = ((Math.round(midi) % 12) + 12) % 12, w = Math.abs(midi - Math.round(midi)) < 0.35 ? 1 : 0.3;
          ch[pc] += mag * w;
        }
        var db = 20 * Math.log10(lvl + 1e-9);
        var r = db < -62 ? { single: null, chord: null } : readChroma(ch, WS.Mic.flats);
        var mx = Math.max.apply(null, ch) || 1;
        r.chroma = ch.map(function (x) { return x / mx; }); r.level = db;
        cb(r); self.raf = requestAnimationFrame(loop);
      })();
      return true;
    }).catch(function (e) {
      var m = e && e.name === 'NotAllowedError' ? 'The mic is blocked. Allow it in Safari: aA menu, Website Settings, Microphone.' : 'The mic could not start: ' + ((e && e.message) || 'unknown problem');
      fail(m); return false;
    });
  },
  stop: function () {
    this.on = false; if (this.raf) cancelAnimationFrame(this.raf);
    try { this.stream && this.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ }
    try { this.ctx && this.ctx.close(); } catch (e2) { /* ignore */ }
    this.ctx = null; this.stream = null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e3) { /* ignore */ }
  },
  flats: false
};

/* ---- MIDI ---- */
WS.Midi = {
  access: null, held: {}, onNote: null, onChange: null, names: [], supported: !!navigator.requestMIDIAccess,
  start: function () {
    var self = this;
    if (!navigator.requestMIDIAccess) return Promise.reject({ message: 'MIDI keyboards need a browser with Web MIDI, such as the Web MIDI Browser app. In Safari use the mic.' });
    return navigator.requestMIDIAccess().then(function (a) {
      self.access = a; self.hook();
      a.onstatechange = function () { self.hook(); };
      return self.names;
    }, function () { throw { message: 'MIDI access was denied. Allow it when the browser asks.' }; });
  },
  hook: function () {
    var self = this; self.names = [];
    self.access.inputs.forEach(function (inp) {
      self.names.push(inp.name || 'MIDI keyboard');
      inp.onmidimessage = function (m) {
        var d = m.data, st = d[0] & 0xf0, n = d[1], vel = d[2];
        if (st === 0x90 && vel > 0) { self.held[n] = 1; if (self.onNote) self.onNote(n, true, vel / 127); }
        else if (st === 0x80 || st === 0x90) { delete self.held[n]; if (self.onNote) self.onNote(n, false, 0); }
        if (self.onChange) self.onChange(Object.keys(self.held).map(Number));
      };
    });
    if (self.onChange) self.onChange(Object.keys(self.held).map(Number));
  }
};

/* ---- Keys screen ---- */
WS.viewKeys = function (v) {
  var song = WS.songById(v.id);
  var root = h('div', { class: 'keys' });
  if (!song) { add(root, h('p', { class: 'err', text: 'This song is gone.' }), h('button', { class: 'btn', text: 'Back', onclick: WS.back })); return root; }
  var sh0 = WS.getSheet(song.id);
  var semis = WS.lsGet('ws-pr-semis-' + song.id, 0);
  var playKey = W.transposeKeyName(song.key || (sh0 && sh0.key) || 'C', semis);
  var sh = sh0 ? W.sheetToKey(sh0, playKey) : null;
  var flats = W.usesFlats(playKey); WS.Mic.flats = flats;
  var st = { bar: P.loop ? P.loop[0] : 0, mode: 'off', last: null, msg: '' };
  if (P.id === song.id && P.el && P.grid) { var g0 = W.gridBarAt(P.grid, P.el.currentTime); if (g0.bar >= 0) st.bar = g0.bar; }
  var rsel = null;

  var title = h('div', { class: 'grow' }, h('div', { style: { font: '600 16px var(--tight)' }, text: 'Keys · ' + song.title }), h('div', { class: 'small', id: 'ksub' }));
  var playBtn = h('button', { class: 'play', type: 'button', 'aria-label': 'Play', style: { width: '44px', height: '44px' }, onclick: function () { if (P.el) P.toggle(); else toast('There is no audio playing for this song. Open Practice to start it.'); } });
  var head = h('div', { class: 'kh' }, ib('back', 'Back', WS.back), title, playBtn);
  var says = h('div', { class: 'v' }), saysSub = h('div', { class: 'small' });
  var played = h('div', { class: 'v' }), playedSub = h('div', { class: 'small' });
  var chromaEl = h('div', { class: 'chroma' });
  var cols = [];
  for (var i = 0; i < 12; i++) { var b = h('b'); cols.push(b); chromaEl.appendChild(h('div', null, h('i', null, b), h('span', { text: W.noteName(i, flats) }))); }
  var stepper = h('div', { class: 'row', style: { gap: '4px' } }, ib('prev', 'Previous bar', function () { st.bar = Math.max(0, st.bar - 1); paintSays(); }), ib('next', 'Next bar', function () { st.bar = Math.min((sh ? sh.bars.length : 1) - 1, st.bar + 1); paintSays(); }));
  var read = h('div', { class: 'read' },
    h('div', { style: { width: '170px' } }, h('div', { class: 'lbl', text: 'Chart says' }), says, saysSub),
    h('div', { style: { width: '190px' } }, h('div', { class: 'lbl', html: icon('mic') + '<span id="lmode">You played</span>' }), played, playedSub), chromaEl);
  var piano = WS.Piano({ lo: 48, hi: 71, flats: flats, onDown: function (m) { WS.Synth.unlock(); WS.Synth.on(m, 0.8); st.tapped = st.tapped || {}; st.tapped[m] = 1; midiShow(Object.keys(st.tapped).map(Number)); }, onUp: function (m) { WS.Synth.off(m); if (st.tapped) delete st.tapped[m]; midiShow(Object.keys(st.tapped || {}).map(Number)); } });
  var pw = h('div', { class: 'pwrap' }, piano.el);
  var micBtn = h('button', { class: 'btn', type: 'button', onclick: toggleMic });
  var midiBtn = h('button', { class: 'btn', type: 'button', text: 'MIDI keyboard', onclick: startMidi });
  var note = h('div', { class: 'small', style: { flex: 1 } });
  var foot = h('div', { class: 'row', style: { gap: '8px' } }, micBtn, midiBtn, note);
  add(root, head, read, pw, foot);

  function chartChord() {
    if (!sh || !sh.bars.length) return { c: null, bar: 0 };
    var bar = st.bar;
    if (P.id === song.id && P.el && P.grid && P.playing()) { var g = W.gridBarAt(P.grid, P.el.currentTime); if (g.bar >= 0) { bar = g.bar; st.bar = bar; var rb0 = W.resolveBars(sh)[bar]; st.unit = Math.floor(g.frac * rb0.units); } }
    else st.unit = st.unit == null ? 0 : st.unit;
    var b = sh.bars[Math.min(bar, sh.bars.length - 1)], rb = W.resolveBars(sh)[Math.min(bar, sh.bars.length - 1)];
    var u = P.playing() ? (st.unit || 0) : 0, c = E.chordIn(b, u);
    if (!c) for (var k = bar - 1; k >= 0 && !c; k--) { var cs = sh.bars[k].ch; if (cs && cs.length) c = cs[cs.length - 1].c; }
    return { c: c, bar: bar };
  }
  function tonesOf(sym) { return sym ? WS.Synth.chordMidis(sym, 60).map(function (m) { return m % 12; }) : []; }
  function paintSays() {
    var x = chartChord(), disp = x.c ? W.chordDisplay(x.c) : '—';
    says.textContent = disp; saysSub.textContent = sh ? 'bar ' + (x.bar + 1) : 'no lead sheet';
    var tones = tonesOf(x.c), pcs = [];
    for (var m = 48; m <= 71; m++) if (tones.indexOf(m % 12) >= 0) pcs.push(m);
    piano.setTones(pcs);
    st.says = x.c;
    return x;
  }
  function paintSub() {
    var el = root.querySelector('#ksub'); if (!el) return;
    var l = P.loop && P.id === song.id ? 'Looping ' + (function () { var s = sh && W.sheetSections(sh).filter(function (z) { return z.from === P.loop[0] && z.to === P.loop[1]; })[0]; return s ? (s.label || s.mark) : 'bars ' + (P.loop[0] + 1) + '–' + (P.loop[1] + 1); })() + ' at ' + Math.round(P.speed * 100) + '%' : 'Pick a bar with the arrows, or play the audio from Practice';
    el.textContent = l;
  }
  function paintPlay() { var pl = P.id === song.id && P.playing(); playBtn.innerHTML = icon(pl ? 'pause' : 'play'); playBtn.setAttribute('aria-label', pl ? 'Pause' : 'Play'); playBtn.style.opacity = P.id === song.id && P.el ? 1 : 0.45; }
  function show(r) {
    var cmp = null, want = st.says ? W.normChordSym(st.says) : null;
    var text = r.chord ? W.chordDisplay(r.chord) : (r.single || '—');
    played.textContent = text;
    played.className = 'v';
    if (r.chord && want) { var ok = W.normChordSym(r.chord) === want || (W.chordRoot(r.chord) === W.chordRoot(st.says) && (r.chord.indexOf('m') > 0) === (st.says.replace(/maj/, '').indexOf('m') > 0)); played.classList.add(ok ? 'ok' : 'miss'); playedSub.textContent = ok ? 'matches' : 'chart says ' + W.chordDisplay(st.says); }
    else if (r.single) playedSub.textContent = 'single note'; else playedSub.textContent = st.mode === 'off' ? 'Turn on the mic or a MIDI keyboard' : 'Listening…';
    if (r.chroma) cols.forEach(function (b, i) { var x = r.chroma[i] || 0; b.style.height = Math.max(3, Math.round(x * 46)) + 'px'; var inChord = tonesOf(st.says).indexOf(i) >= 0; b.className = x > 0.5 && inChord ? 'hot' : ''; });
  }
  function midiShow(notes) {
    var ch = new Array(12).fill(0); notes.forEach(function (n) { ch[n % 12] = 1; });
    var r = readChroma(ch, flats); r.chroma = ch; r.midi = notes;
    piano.setOn(notes); show(r);
  }
  function toggleMic() {
    if (st.mode === 'mic') { WS.Mic.stop(); st.mode = 'off'; micBtn.innerHTML = icon('mic') + '<span>Mic off</span>'; note.textContent = ''; show({}); return; }
    micBtn.innerHTML = icon('mic') + '<span>Starting…</span>';
    WS.Mic.start(function (r) { show(r); }, function (m) { st.mode = 'off'; micBtn.innerHTML = icon('mic') + '<span>Mic off</span>'; note.textContent = m; toast(m); }).then(function (ok) {
      if (ok) { st.mode = 'mic'; micBtn.innerHTML = icon('mic') + '<span>Mic on</span>'; micBtn.className = 'btn acc'; note.textContent = P.playing() ? 'The mic also hears the recording. Use headphones or play quietly.' : 'Play your keyboard near the phone.'; }
      else micBtn.className = 'btn';
    });
  }
  function startMidi() {
    WS.Midi.start().then(function (names) {
      st.mode = 'midi'; midiBtn.className = 'btn acc';
      note.textContent = names.length ? 'Connected: ' + names.join(', ') : 'MIDI is ready. Plug in the keyboard.';
      WS.Midi.onChange = function (notes) { midiShow(notes); };
    }).catch(function (e) { note.textContent = (e && e.message) || 'MIDI could not start.'; toast(note.textContent); });
  }
  micBtn.innerHTML = icon('mic') + '<span>Check by mic</span>';
  var off = P.on(function (ev) { if (ev === 'tick') { var before = st.says; paintSays(); } else if (ev === 'state' || ev === 'loop' || ev === 'speed') { paintPlay(); paintSub(); } });
  WS.onLeave(function () { off(); WS.Mic.stop(); WS.Midi.onChange = null; });
  setTimeout(function () { paintSays(); paintSub(); paintPlay(); show({}); }, 0);
  window.__keys = { st: st };
  return root;
};
})();
