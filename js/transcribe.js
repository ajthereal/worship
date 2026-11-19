/* Worship Transcribe: waveform with bar grid, typed bars, bar grid editor, chord and band panel, piano, transport. */
(function () {
'use strict';
var WS = window.WS, W = window.WCore, E = window.WEdit;
var h = WS.h, add = WS.add, icon = WS.icon, ib = WS.ib, toast = WS.toast, sheet = WS.sheet, $ = WS.$, S = WS.S;
var A = WS.Audio, Synth = WS.Synth;

var SECTION_TINTS = ['var(--seg)', 'var(--accs)', 'var(--hits)'];
function uname(u, rb) {
  // column header: beat numbers on beats, "&" between (eighths) or "e & a" (sixteenths)
  var per = rb.bu, within = u % per, beat = Math.floor(u / per) + 1;
  if (within === 0) return String(beat);
  if (per === 2) return '&';
  if (per === 4) return ['', 'e', '&', 'a'][within];
  if (per === 3) return ['', 'la', 'li'][within];
  return '·';
}
function chordHtml(sym) {
  var p = W.chordParts(sym, { triangle: WS.lsGet('ws-tri', true) });
  if (p.nc) return 'N.C.';
  return WS.esc(p.root + p.acc + p.minor) + (p.sup ? '<sup>' + WS.esc(p.sup) + '</sup>' : '') + (p.bass ? '/' + WS.esc(p.bass + p.bassAcc) : '');
}
function pitchShow(p) { return p.replace('#', '♯').replace(/([A-G])b/, '$1♭'); }

WS.viewTranscribe = function (v) {
  var song = WS.songById(v.id);
  var root = h('div', { class: 'tr' });
  if (!song) { add(root, h('div', { class: 'page' }, h('p', { class: 'err', text: 'This song is gone.' }), h('button', { class: 'btn', text: 'Back', onclick: WS.back }))); return root; }
  var demo = song.id === WS.demoId();
  var sh = WS.getSheet(song.id);
  if (!sh) {
    sh = W.emptySheet(song.key || 'C', song.time || '4/4', Number(song.bpm) || 90);
    sh.bars = [E.blankBar(), E.blankBar(), E.blankBar(), E.blankBar()];
    sh.bars[0].mark = 'A'; sh.bars[0].label = 'Intro';
    WS.saveSheet(song.id, sh);
  }
  var T = {
    song: song, sheet: sh, sel: 0, cell: 0, row: 'chord', hist: E.History(80), loop: null, kind: 'off', speed: 1, playing: false,
    dur: 0, peaks: null, audioEl: null, grid: W.parseGrid(song.grid), win0: 0, taps: null, heard: null, analysing: false, clip: null, mic: false
  };
  var narrow = !WS.isWide();
  if (narrow) root.classList.add('narrow');

  /* ----- header ----- */
  var headHost = h('div');
  function drawHead() {
    WS.clear(headHost);
    var pr = WS.sheetProgress(T.sheet);
    var rb0 = W.resolveBars(T.sheet)[0];
    var sub = (T.sheet.key || '') + ' ' + ((W.parseKey(T.sheet.key) || {}).minor ? 'minor' : 'major') + ' · ' + (T.sheet.tempo || '?') + ' BPM · ' + T.sheet.time + ' · ' + pr.done + ' of ' + pr.total + ' bars done';
    var undo = ib('undo', 'Undo', doUndo, T.hist.canUndo() ? '' : 'dis'), redo = ib('redo', 'Redo', doRedo, T.hist.canRedo() ? '' : 'dis');
    add(headHost, WS.songHeader(song, 'transcribe', { sub: sub, right: h('div', { class: 'row', style: { gap: 0 } }, undo, redo) }));
  }

  /* ----- sections strip + waveform ----- */
  var secStrip = h('div', { class: 'sections' });
  var waveCard = h('div', { class: 'wave' });
  var canvas = h('canvas'); var phEl = h('div', { class: 'ph' }), lpEl = h('div', { class: 'lp' });
  var emptyEl = h('div', { class: 'empty' });
  waveCard.appendChild(canvas); waveCard.appendChild(lpEl); waveCard.appendChild(phEl); waveCard.appendChild(emptyEl);
  var barnums = h('div', { class: 'barnums' });
  var gtools = h('div', { class: 'gridtools' });

  function nBars() { return T.sheet.bars.length; }
  function win() { var n = Math.min(24, nBars()); var w0 = Math.max(0, Math.min(T.win0, nBars() - n)); return { w0: w0, n: n }; }
  function ensureWin(i) { var n = Math.min(24, nBars()); if (i < T.win0 || i >= T.win0 + n) T.win0 = Math.floor(i / 12) * 12; if (T.win0 > nBars() - n) T.win0 = Math.max(0, nBars() - n); }
  // time of a bar start inside the window (grid) or even spacing (no grid)
  function barX(i, wd) {
    var w = win(), W0 = wd;
    if (T.grid && T.grid.b[w.w0] != null) {
      var t0 = T.grid.b[w.w0], last = w.w0 + w.n, t1 = last < T.grid.b.length ? T.grid.b[last] : T.grid.end;
      var t = i < T.grid.b.length ? T.grid.b[i] : T.grid.end;
      return (t - t0) / Math.max(0.01, t1 - t0) * W0;
    }
    return (i - w.w0) / w.n * W0;
  }
  function timeAtX(x, wd) {
    var w = win();
    if (T.grid && T.grid.b[w.w0] != null) {
      var t0 = T.grid.b[w.w0], last = w.w0 + w.n, t1 = last < T.grid.b.length ? T.grid.b[last] : T.grid.end;
      return t0 + x / wd * (t1 - t0);
    }
    return null;
  }
  function barAtX(x, wd) {
    var w = win();
    for (var i = w.w0 + w.n - 1; i >= w.w0; i--) if (x >= barX(i, wd)) return i;
    return w.w0;
  }
  function drawSections() {
    WS.clear(secStrip);
    var w = win(), wd = waveCard.clientWidth || 780;
    var secs = W.sheetSections(T.sheet);
    secs.forEach(function (s, k) {
      var a = Math.max(s.from, w.w0), b = Math.min(s.to, w.w0 + w.n - 1);
      if (a > b) return;
      var x0 = barX(a, wd), x1 = barX(b + 1, wd);
      var el = h('div', { class: 'sc', style: { left: x0 + 'px', width: Math.max(10, x1 - x0 - 3) + 'px', background: SECTION_TINTS[k % 3] }, text: s.label || s.mark || 'Start', onclick: function () { selectBar(s.from, true); } });
      secStrip.appendChild(el);
    });
  }
  function drawWave() {
    var wd = waveCard.clientWidth || 780, hh = waveCard.clientHeight || 84, dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(wd * dpr); canvas.height = Math.round(hh * dpr);
    var c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, wd, hh);
    var cs = getComputedStyle(document.documentElement);
    var lineStrong = cs.getPropertyValue('--line').trim() || '#ddd', ink = cs.getPropertyValue('--wave').trim() || '#2C2F37';
    var w = win();
    // peaks
    if (T.peaks && T.dur) {
      var tA = T.grid && T.grid.b[w.w0] != null ? T.grid.b[w.w0] : 0;
      var tB = T.grid ? (w.w0 + w.n < T.grid.b.length ? T.grid.b[w.w0 + w.n] : T.grid.end) : T.dur;
      c.fillStyle = ink; c.globalAlpha = 0.78;
      var cols = Math.floor(wd / 3.5);
      for (var i = 0; i < cols; i++) {
        var t = tA + (i + 0.5) / cols * (tB - tA), pi = Math.max(0, Math.min(T.peaks.length - 1, Math.floor(t / T.dur * T.peaks.length)));
        var amp = Math.max(0.02, T.peaks[pi]) * (hh - 18);
        c.fillRect(6 + i * (wd - 12) / cols, (hh - amp) / 2, Math.max(1.5, (wd - 12) / cols - 1.5), amp);
      }
      c.globalAlpha = 1;
    }
    // bar lines
    for (var b = w.w0; b <= w.w0 + w.n; b++) {
      var x = Math.round(barX(b, wd)) + 0.5;
      c.strokeStyle = b % 4 === 0 ? lineStrong : lineStrong; c.globalAlpha = b % 4 === 0 ? 1 : 0.55;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, hh); c.stroke();
    }
    c.globalAlpha = 1;
    // bar numbers
    WS.clear(barnums);
    for (var bn = w.w0; bn < w.w0 + w.n; bn++) {
      var sp = h('span', { text: String(bn + 1), style: { left: (barX(bn, wd) + 3) + 'px' } });
      if (bn === T.sel) { sp.style.color = 'var(--acc)'; sp.style.fontWeight = '700'; }
      barnums.appendChild(sp);
    }
    drawLoopEl(wd);
    emptyEl.style.display = T.peaks ? 'none' : 'flex';
    if (!T.peaks) {
      if (demo) emptyEl.textContent = 'The demo song has no audio. Bars still work: tap a bar to select it.';
      else if (!song.audio) emptyEl.textContent = 'No audio linked. Open More, Audio file, to link one from Drive.';
      else if (A.state(song.audio) !== 'device') emptyEl.textContent = 'The audio is in Drive. Download it to this device to see the waveform.';
      else emptyEl.textContent = 'Reading the audio…';
      if (T.sel != null) {
        // still show the selected bar
        var sx = barX(T.sel, wd), ex = barX(T.sel + 1, wd);
        lpEl.style.display = 'block'; lpEl.style.left = sx + 'px'; lpEl.style.width = Math.max(4, ex - sx) + 'px'; lpEl.style.background = 'var(--accs)';
        emptyEl.style.alignItems = 'flex-end'; emptyEl.style.paddingBottom = '6px';
      }
    }
  }
  function drawLoopEl(wd) {
    wd = wd || waveCard.clientWidth || 780;
    var l = T.loop;
    if (!l) { if (T.peaks) lpEl.style.display = 'none'; return; }
    var w = win();
    var a = Math.max(l[0], w.w0), b = Math.min(l[1], w.w0 + w.n - 1);
    if (a > b) { lpEl.style.display = 'none'; return; }
    var x0 = barX(a, wd), x1 = barX(b + 1, wd);
    lpEl.style.display = 'block'; lpEl.style.left = x0 + 'px'; lpEl.style.width = Math.max(4, x1 - x0) + 'px'; lpEl.style.background = '';
  }
  function drawGridTools() {
    WS.clear(gtools);
    if (demo) return;
    if (!song.audio || A.state(song.audio) !== 'device') {
      if (song.audio) add(gtools, h('button', { class: 'btn sm acc', text: 'Download audio', onclick: function () { WS.audioSheet(song, function () { loadAudio(); }); } }));
      else add(gtools, h('button', { class: 'btn sm', text: 'Link audio from Drive', onclick: function () { WS.audioSheet(song, function () { loadAudio(); }); } }));
      return;
    }
    if (T.taps) {
      add(gtools, h('button', { class: 'btn sm pri', text: 'Tap now (bar ' + (T.sel + T.taps.length + 1) + ')', style: { minWidth: '150px' }, onclick: function () {
        if (!T.audioEl) return; T.taps.push(T.audioEl.currentTime); drawGridTools();
      } }), h('button', { class: 'btn sm', text: 'Done', onclick: finishTaps }), h('button', { class: 'btn sm ghost', text: 'Cancel', onclick: function () { T.taps = null; drawGridTools(); } }),
      h('span', { class: 'small', text: 'Play the song and tap on every bar 1.' }));
      return;
    }
    add(gtools, h('button', { class: 'btn sm', text: T.grid ? 'Redo grid from audio' : 'Make beat grid', onclick: autoGrid }));
    if (T.grid) {
      add(gtools,
        h('button', { class: 'btn sm', text: 'Set bar ' + (T.sel + 1) + ' here', onclick: setBarHere }),
        h('button', { class: 'btn sm', text: 'Tap bars', onclick: function () { T.taps = []; if (T.audioEl && T.audioEl.paused) T.audioEl.play(); drawGridTools(); } }),
        h('span', { class: 'row', style: { gap: '2px' } }, h('button', { class: 'btn sm', text: '−', 'aria-label': 'Slower tempo', onclick: function () { nudgeTempo(-0.2); } }), h('span', { class: 'small tabnum', id: 'tempolbl', text: tempoLabel() }), h('button', { class: 'btn sm', text: '+', 'aria-label': 'Faster tempo', onclick: function () { nudgeTempo(0.2); } })));
    }
    if (T.heard) add(gtools, h('span', { class: 'small', text: 'Chords heard in the audio: ' + T.heard.keyName + ', about ' + Math.round(T.heard.bpm) + ' BPM' }));
    else add(gtools, h('button', { class: 'btn sm', text: T.analysing ? 'Listening…' : 'Suggest chords', disabled: T.analysing ? true : null, onclick: runAnalysis }));
  }
  function tempoLabel() {
    if (!T.grid || T.grid.b.length < 2) return '';
    var beats = W.timeInfo(T.sheet.time, T.sheet.sub).beats, bar = T.grid.b[1] - T.grid.b[0];
    return Math.round(60 / bar * beats * 10) / 10 + ' BPM';
  }
  function barBeats() { return W.timeInfo(T.sheet.time, T.sheet.sub).beats; }
  function saveGrid() { song.grid = T.grid ? JSON.stringify(T.grid) : ''; WS.commitSong(song); }
  function setBarHere() {
    if (!T.audioEl || !T.grid) return;
    T.grid = W.gridSetBar(T.grid, T.sel, T.audioEl.currentTime); saveGrid(); redraw();
    toast('Bar ' + (T.sel + 1) + ' now starts at ' + WS.fmtTime(T.audioEl.currentTime) + '.');
  }
  function nudgeTempo(d) {
    if (!T.grid) return;
    var beats = barBeats(), cur = 60 / (T.grid.b[1] - T.grid.b[0]) * beats;
    // keep the selected bar fixed in time while the spacing changes
    var tSel = T.grid.b[T.sel];
    var g = W.gridSetTempo(T.grid, cur + d, beats);
    g = W.gridSetBar(g, T.sel, tSel);
    T.grid = g; saveGrid(); redraw();
  }
  function finishTaps() {
    if (!T.taps || T.taps.length < 2) { toast('Tap on at least two bars first.'); return; }
    var g = W.gridFromTaps(T.taps, T.sel, nBars(), T.dur);
    T.taps = null; T.grid = g; saveGrid(); redraw(); toast('Beat grid set from your taps.');
  }
  function autoGrid() {
    if (!T.audioEl) { toast('The audio is not ready yet.'); return; }
    runAnalysis(true);
  }
  function progressSheet(title) {
    var bar = h('div', { class: 'prog' }, h('i')), msg = h('div', { class: 'small', text: 'Starting…' });
    var s = sheet([h('h3', { text: title }), bar, msg, h('p', { class: 'note', text: 'This is a guess from the sound. You can fix everything.' })]);
    return { s: s, set: function (p, l) { bar.firstChild.style.width = Math.round(p * 100) + '%'; if (l) msg.textContent = l; } };
  }
  function runAnalysis(gridOnly) {
    if (T.analysing) return;
    T.analysing = true; drawGridTools();
    var ps = progressSheet(gridOnly === true ? 'Finding the beat' : 'Listening to the song');
    A.analyze(song.audio, { beatsPerBar: barBeats(), onProgress: function (p, l) { ps.set(p, l); } }).then(function (a) {
      T.heard = a; T.analysing = false;
      var first = a.bars[0] ? a.bars[0].start : 0;
      var n = Math.max(nBars(), 1);
      if (!T.grid || gridOnly === true) {
        // the analysis bar grid, stretched out to the number of bars in the sheet
        T.grid = W.gridFromAnalysis(a, Math.max(nBars(), a.bars.length ? Math.min(a.bars.length, nBars()) : nBars()));
        if (T.grid && T.grid.b.length < nBars()) { var g2 = W.gridFromTempo(a.bpm, first, nBars(), barBeats(), a.duration); T.grid = g2; }
        saveGrid();
      }
      ps.s.close(); redraw(); toast('Done. Chords heard are shown as suggestions in the bar grid.');
    }).catch(function (e) { T.analysing = false; ps.s.close(); drawGridTools(); toast('The audio could not be analysed: ' + ((e && e.message) || 'unknown problem')); });
  }
  // suggestions for the selected bar: per unit, only where the chord changes
  function heardFor(bi) {
    if (!T.heard || !T.grid || T.grid.b[bi] == null) return null;
    var rb = W.resolveBars(T.sheet)[bi], units = rb.units, ranges = [];
    var cache = T.heardCache = T.heardCache || {};
    var key = bi + ':' + units;
    if (cache[key]) return cache[key];
    for (var u = 0; u < units; u++) ranges.push([W.gridTimeAt(T.grid, bi, u / units), W.gridTimeAt(T.grid, bi, (u + 1) / units)]);
    var shift = 0, wk = rb.key; // the audio is taken to be in the song's key
    var res = W.chordsForRanges(T.heard.frames, ranges, wk), flats = W.usesFlats(wk);
    var out = res.map(function (r) {
      if (r.nc) return { name: null, conf: 0 };
      return { name: W.noteName(r.root + shift, flats) + (r.minor ? 'm' : ''), conf: r.conf };
    });
    cache[key] = out; return out;
  }

  /* ----- staff line ----- */
  var staffCard = h('div', { class: 'staffcard' });
  var staffH = null;
  function drawStaff() {
    var bpl = narrow && WS.isPhone() ? 2 : 4;
    var a = Math.floor(T.sel / bpl) * bpl, b = Math.min(nBars() - 1, a + bpl - 1);
    WNote.load().then(function () {
      var wd = (staffCard.clientWidth || 780) - 12;
      try {
        staffH = WNote.render(staffCard, T.sheet, { width: wd, scale: 1, barsPerLine: bpl, ranges: [[a, b]], theme: document.documentElement.getAttribute('data-theme'), triangle: WS.lsGet('ws-tri', true), selected: T.sel, onBar: function (i) { selectBar(i); } });
        staffH.setLoop && T.loop && staffH.setLoop(T.loop[0], T.loop[1]);
        if (T.playBar != null) staffH.setPlaying(T.playBar);
      } catch (e) { console.error(e); staffH = WNote.renderGrid(staffCard, T.sheet, { ranges: [[a, b]], barsPerLine: bpl, onBar: function (i) { selectBar(i); } }); staffH.setSelected(T.sel); }
    }).catch(function (e) {
      staffH = WNote.renderGrid(staffCard, T.sheet, { ranges: [[a, b]], barsPerLine: bpl, onBar: function (i) { selectBar(i); } }); staffH.setSelected(T.sel);
      staffCard.insertBefore(h('p', { class: 'err', text: 'The notation library could not load (' + (e && e.message || e) + '). Showing a chord grid instead.' }), staffCard.firstChild);
    });
  }

  /* ----- typed bars ----- */
  var typedInput = h('input', { type: 'text', 'aria-label': 'Type the bar', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', inputmode: 'text', placeholder: 'E . A .', enterkeyhint: 'next' });
  var typedMsg = h('div', { class: 'small' });
  var typedWrap = h('div', { class: 'typed' }, h('div', { class: 'col' }, h('div', { class: 'row' }, h('span', { class: 'lb', text: 'Type bar ' }), h('span', { class: 'lb', id: 'typedno' }), h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', type: 'button', text: 'Help', onclick: WS.helpSheet })), typedInput, typedMsg),
    h('button', { class: 'btn pri', style: { marginTop: '22px' }, type: 'button', text: 'Next bar', onclick: function () { commitTyped(true); } }));
  function ctxFor(i) { var rb = W.resolveBars(T.sheet)[i]; return rb; }
  function typedText() {
    var b = T.sheet.bars[T.sel], rb = ctxFor(T.sel);
    var pre = '';
    var txt = W.barToText(b, rb);
    if (b.text) txt += ' (' + b.text + ')';
    return txt;
  }
  function refreshTyped() {
    typedInput.value = typedText();
    typedMsg.className = 'small'; typedMsg.textContent = '';
    var no = typedWrap.querySelector('#typedno'); if (no) no.textContent = String(T.sel + 1);
  }
  var typedTimer = null;
  function applyTyped(final) {
    var txt = typedInput.value;
    // several bars pasted at once
    if (/[|\n]/.test(txt)) {
      var r = W.parseBars(txt, function (k) { var i = Math.min(nBars() - 1, T.sel + k); return ctxFor(i); });
      if (r.errors.length) { typedMsg.className = 'err'; typedMsg.textContent = r.errors[0]; return false; }
      if (!r.bars.length) { typedMsg.className = 'err'; typedMsg.textContent = 'No bars found in that text.'; return false; }
      snapshot(); E.pasteParsed(T.sheet, T.sel, r.bars, true); changed(true);
      toast(r.bars.length + (r.bars.length === 1 ? ' bar' : ' bars') + ' written from bar ' + (T.sel + 1) + '.');
      T.sel = Math.min(nBars() - 1, T.sel + r.bars.length - 1); refreshAll(); return true;
    }
    var before = typedText();
    if (txt.trim() === before.trim()) return true;
    var snap = E.clone(T.sheet);
    var res = E.applyText(T.sheet, T.sel, txt);
    if (!res.ok) { typedMsg.className = 'err'; typedMsg.textContent = res.errors[0]; T.sheet = snap; return false; }
    T.hist.push(snap); changed(false);
    typedMsg.className = 'small'; typedMsg.textContent = res.warnings.length ? res.warnings[0] : '';
    redrawBar();
    return true;
  }
  function commitTyped(advance) {
    clearTimeout(typedTimer);
    if (!applyTyped(true)) return;
    if (advance) {
      if (T.sel >= nBars() - 1) { snapshot(); E.insertBar(T.sheet, nBars()); changed(true); }
      selectBar(T.sel + 1, false, true);
      typedInput.focus();
    }
  }
  typedInput.addEventListener('input', function () { clearTimeout(typedTimer); typedTimer = setTimeout(function () { applyTyped(false); }, 500); });
  typedInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); commitTyped(true); }
    else if (e.key === 'ArrowRight' && typedInput.selectionStart === typedInput.value.length && typedInput.selectionEnd === typedInput.value.length) { e.preventDefault(); commitTyped(true); }
    else if (e.key === 'ArrowLeft' && typedInput.selectionStart === 0 && T.sel > 0) { e.preventDefault(); commitTyped(false); selectBar(T.sel - 1, false, true); }
  });
  typedInput.addEventListener('paste', function (e) {
    var t = (e.clipboardData || window.clipboardData) ? (e.clipboardData || window.clipboardData).getData('text') : '';
    if (t && /[|\n]/.test(t)) { e.preventDefault(); typedInput.value = t; applyTyped(true); }
  });

  /* ----- bar grid editor ----- */
  var gedit = h('div', { class: 'gedit' });
  var subSel = 8;
  function drawGrid() {
    WS.clear(gedit);
    var bi = T.sel, bar = T.sheet.bars[bi], rb = ctxFor(bi), cells = E.cells(bar, rb), n = rb.units;
    var heard = heardFor(bi);
    var cols = '78px repeat(' + n + ', minmax(' + (n > 8 ? 54 : 64) + 'px, 1fr))';
    var head = h('div', { class: 'gr', style: { gridTemplateColumns: cols } }, h('div', { class: 'gh', text: 'Bar ' + (bi + 1) }));
    cells.forEach(function (c) { head.appendChild(h('div', { class: 'hd' + (c.u % rb.bu === 0 ? ' b' : ''), text: uname(c.u, rb) })); });
    gedit.appendChild(head);
    function row(label, rowKey, fn) {
      var r = h('div', { class: 'gr', style: { gridTemplateColumns: cols } }, h('div', { class: 'gh', text: label }));
      cells.forEach(function (c) { r.appendChild(fn(c)); });
      gedit.appendChild(r);
    }
    function cellBtn(c, rowKey, cls, html) {
      var sel = T.cell === c.u && T.row === rowKey;
      var b = h('button', { type: 'button', class: 'gc ' + (cls || '') + (sel ? ' sel' : ''), 'data-u': c.u, 'data-r': rowKey, html: html, onclick: function () { selectCell(c.u, rowKey); } });
      return b;
    }
    row('Chord', 'chord', function (c) {
      if (c.chord) return cellBtn(c, 'chord', 'on', chordHtml(c.chord));
      var hd = heard && heard[c.u] && heard[c.u].name && (!heard[c.u - 1] || heard[c.u - 1].name !== heard[c.u].name) && c.u % rb.bu === 0 ? heard[c.u] : null;
      if (hd) { var b = cellBtn(c, 'chord', 'e cue', WS.esc(hd.name) + '?'); b.style.borderStyle = 'dashed'; b.title = 'Heard ' + hd.name + ' (' + Math.round(hd.conf * 100) + '%). Tap to select.'; return b; }
      return cellBtn(c, 'chord', 'e', '+');
    });
    row('Band', 'band', function (c) { return cellBtn(c, 'band', c.band === '—' ? 'cont' : c.band === '·' ? 'e' : (c.band === 'Rest' ? 'e' : ''), WS.esc(c.band) + (c.tie ? '⌒' : '')); });
    row('Accent', 'acc', function (c) { return cellBtn(c, 'acc', c.acc ? 'cue' : 'e', c.acc ? WS.esc(c.acc) : '·'); });
    row('Notes', 'notes', function (c) { return cellBtn(c, 'notes', c.notes.length ? '' : 'e', c.notes.length ? WS.esc(c.notes.map(pitchShow).join(' ')) : '·'); });
    // grid size
    var big = (T.sheet.sub || 8) >= 16;
    add(gedit, h('div', { class: 'row', style: { marginTop: '4px', justifyContent: 'space-between' } },
      h('div', { class: 'seg' }, h('button', { type: 'button', class: !big ? 'on' : '', text: 'Eighths', onclick: function () { setSub(8); } }), h('button', { type: 'button', class: big ? 'on' : '', text: '16ths', onclick: function () { setSub(16); } })),
      h('button', { class: 'btn sm', type: 'button', text: 'Bar options', onclick: barOptions })));
  }
  function setSub(s) {
    if ((T.sheet.sub || 8) === s) return;
    var snap = E.clone(T.sheet);
    if (!E.rescaleSub(T.sheet, s)) { toast('Some notes sit between the eighths. Keep the 16ths, or move them first.'); return; }
    T.hist.push(snap); T.cell = Math.min(T.cell * (s > (snap.sub || 8) ? 2 : 0.5), 999); changed(true); refreshAll();
  }

  /* ----- right panel ----- */
  var panel = h('div', { class: 'tr-right' });
  function selChord() {
    var bar = T.sheet.bars[T.sel];
    var exact = E.chordAt(bar, T.cell);
    if (exact) return { sym: exact, exact: true };
    var inForce = E.chordIn(bar, T.cell);
    if (inForce) return { sym: inForce, exact: false };
    // look back across bars
    for (var i = T.sel - 1; i >= 0; i--) { var cs = T.sheet.bars[i].ch; if (cs && cs.length) return { sym: cs[cs.length - 1].c, exact: false }; }
    return { sym: null };
  }
  function keyNow() { return W.resolveBars(T.sheet)[T.sel].key; }
  function drawPanel() {
    WS.clear(panel);
    var rb = ctxFor(T.sel), bar = T.sheet.bars[T.sel], key = rb.key;
    var ch = selChord(), flats = W.usesFlats(key);
    var heard = heardFor(T.sel), hc = heard && heard[T.cell] && heard[T.cell].name ? heard[T.cell] : null;
    var beat = Math.floor(T.cell / rb.bu) + 1, within = T.cell % rb.bu;
    add(panel, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'small', text: 'Bar ' + (T.sel + 1) + ' · beat ' + beat + (within ? (rb.bu === 2 ? '&' : '+') : '') }),
      hc ? h('button', { class: 'small', type: 'button', style: { textDecoration: 'underline' }, text: 'Heard ' + hc.name + ' · ' + Math.round(hc.conf * 100) + '%', onclick: function () { setChord(hc.name); } }) : null));
    var big = h('div', { class: 'cbig', html: ch.sym ? chordHtml(ch.sym) : '<span class="mu">No chord</span>', style: { opacity: ch.exact ? 1 : 0.55 } });
    var roman = ch.sym ? W.romanFor(ch.sym, key) : '';
    var pushNote = '';
    var pe = (bar.ev || []).filter(function (e) { return e.at === T.cell && e.k === 'h' && e.d === 1 && e.tie && (e.at + 1) % rb.bu === 0; })[0];
    if (pe && ch.exact) pushNote = ' · push into beat ' + ((T.cell + 1) / rb.bu + 1);
    add(panel, h('div', null, big, h('div', { class: 'small', style: { marginTop: '4px' }, text: (roman ? roman + ' in ' + key : '') + pushNote + (ch.sym && !ch.exact ? ' · carried from before' : '') })));
    // heard chips for this bar
    if (heard) {
      var seen = {}, chips = [];
      heard.forEach(function (x, u) { if (x.name && u % rb.bu === 0 && !seen[x.name] && x.conf > 0.15) { seen[x.name] = 1; chips.push(x.name); } });
      if (chips.length) add(panel, h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, h('span', { class: 'small', text: 'Heard in this bar' }), chips.map(function (n2) { return h('button', { class: 'chip pill', type: 'button', text: n2, onclick: function () { setChord(n2); } }); })));
    }
    add(panel, h('div', { class: 'hr' }));
    // palette
    var pal = E.palette(key), palEl = h('div', { class: 'pal' });
    pal.forEach(function (p) {
      var on = ch.sym && W.normChordSym(ch.sym) === p.sym;
      palEl.appendChild(h('button', { type: 'button', class: on ? 'on' : '', onclick: function () { setChord(p.sym); }, html: WS.esc('') + chordHtml(p.sym) + '<small>' + WS.esc(p.roman) + '</small>' }));
    });
    add(panel, palEl);
    // qualities
    var act = ch.sym ? E.activeQualities(ch.sym) : {}, qual = h('div', { class: 'qual' });
    ['maj7', '7', 'm7', 'sus', 'add9', '/bass', 'ø', '°', '9', '11', '13', 'alt'].forEach(function (q) {
      qual.appendChild(h('button', { type: 'button', class: act[q] ? 'on' : '', text: q, onclick: function () { doQuality(q); } }));
    });
    add(panel, qual, h('div', { class: 'hr' }));
    // band rhythm
    var cell = E.cells(bar, rb)[T.cell] || {}, ev = cell.ev || {};
    function bb(label, fn, cls, on) { return h('button', { type: 'button', class: (cls || '') + (on ? ' on' : ''), text: label, onclick: fn }); }
    add(panel, h('div', { class: 'small', text: 'Band rhythm' }), h('div', { class: 'band' },
      bb('Comp', function () { setBand('s'); }, '', ev.k === 's'), bb('Hit', function () { setBand('h'); }, '', ev.k === 'h'), bb('Rest', function () { setBand('r'); }, '', ev.k === 'r'), bb('Tie', doTie, '', !!ev.tie),
      bb('Accent >', function () { doAccent('>'); }, 't', ev.a === '>'), bb('Marcato ^', function () { doAccent('^'); }, 't', ev.a === '^'), bb('Fermata', doFermata, 't', !!bar.ferm), bb('Push', doPush, ''),
      bb('Hold', doHold, ''), bb('Staccato .', function () { doAccent('.'); }, 't', ev.a === '.'), bb('Clear chord', function () { setChord(null); }, ''), bb('Bar options', barOptions, '')));
    add(panel, h('p', { class: 'note', text: 'Pick a cell in the bar grid, then tap a button. In the Notes row, tap piano keys to write the band line or voicing on that beat.' }));
  }

  /* ----- piano bar ----- */
  var pianoBar = h('div', { class: 'pianobar' });
  var micMsg = h('div', { class: 'small', id: 'micmsg' });
  var piano = null;
  function buildPiano() {
    WS.clear(pianoBar);
    piano = WS.Piano({ lo: 48, hi: 83, wpx: 46, flats: W.usesFlats(keyNow()), onDown: pianoDown, onUp: pianoUp });
    var wrap = h('div', { class: 'pwrap' }, piano.el);
    var playBtn = h('button', { class: 'btn pri', type: 'button', text: 'Play ' + playLabel(), onclick: playCell });
    var micBtn = h('button', { class: 'btn', type: 'button', html: icon('mic') + '<span>' + (T.mic ? 'Stop mic' : 'Check by mic') + '</span>', onclick: toggleMic });
    add(pianoBar, h('div', { class: 'pbtn' }, playBtn, micBtn, micMsg), wrap);
    setTimeout(function () { wrap.scrollLeft = 46 * 3.5 - 8; }, 0);
    paintTones();
  }
  function playLabel() {
    var rb = ctxFor(T.sel), beat = Math.floor(T.cell / rb.bu) + 1, within = T.cell % rb.bu;
    return 'beat ' + beat + (within ? '&' : '');
  }
  function chordTonesMidi(sym) {
    if (!sym) return [];
    var c = W.chordRoot(sym); if (!c) return [];
    var pcs = Synth.chordMidis(sym, 60).map(function (m) { return m % 12; });
    var out = [];
    for (var m = 48; m <= 83; m++) if (pcs.indexOf(m % 12) >= 0) out.push(m);
    return out;
  }
  function paintTones() {
    if (!piano) return;
    var cs = selChord();
    var cellEv = E.cells(T.sheet.bars[T.sel], ctxFor(T.sel))[T.cell] || {};
    var notes = (cellEv.notes || []).map(W.pitchMidi);
    piano.setTones(T.row === 'notes' ? [] : chordTonesMidi(cs.sym));
    piano.setOn(T.row === 'notes' ? notes : []);
  }
  function midiName(m) { return W.midiPitch(m, W.usesFlats(keyNow())); }
  function pianoDown(m) {
    Synth.on(m, 0.8);
    if (T.row === 'notes') { var snap = E.clone(T.sheet); E.togglePitch(T.sheet, T.sel, T.cell, midiName(m)); T.hist.push(snap); changed(true); redrawBar(); }
    else { var pk = piano.keys[m]; if (pk) pk.classList.add('on'); }
  }
  function pianoUp(m) { Synth.off(m); if (T.row !== 'notes') { var pk = piano.keys[m]; if (pk) pk.classList.remove('on'); } }
  function playCell() {
    Synth.unlock();
    var bar = T.sheet.bars[T.sel], c = E.cells(bar, ctxFor(T.sel))[T.cell] || {};
    if (c.notes && c.notes.length) { Synth.chord(c.notes.map(W.pitchMidi), { strum: 0 }); return; }
    var cs = selChord();
    if (cs.sym) Synth.chord(Synth.chordMidis(cs.sym, 52)); else toast('No chord or notes on this beat yet.');
  }
  function toggleMic() {
    if (!WS.Mic) { toast('The mic check is not available.'); return; }
    if (T.mic) { WS.Mic.stop(); T.mic = false; micMsg.textContent = ''; buildPiano(); return; }
    WS.Mic.start(function (r) {
      var cs = selChord();
      var txt = r.single ? 'You played ' + r.single : (r.chord ? 'You played ' + r.chord : 'Listening…');
      if (cs.sym && r.chord) txt += W.normChordSym(r.chord) === W.normChordSym(cs.sym) ? ' · matches' : ' · chart says ' + chordDisplay(cs.sym);
      micMsg.textContent = txt;
    }, function (err) { T.mic = false; micMsg.textContent = err; buildPiano(); micMsg.textContent = err; }).then(function (ok) { if (ok) { T.mic = true; buildPiano(); } });
  }
  function chordDisplay(s) { return W.chordDisplay(s); }

  /* ----- editing ops ----- */
  function snapshot() { T.hist.push(E.clone(T.sheet)); }
  var persistSoon = WS.debounce(function () { WS.saveSheet(song.id, T.sheet); drawHead(); }, 300);
  function changed(structure) {
    if (structure) T.heardCache = null;
    persistSoon();
    if (structure) { var pr = WS.sheetProgress(T.sheet); }
    updateUndoBtns();
  }
  function updateUndoBtns() { /* header redraw happens in persistSoon */ }
  function doUndo() { var s = T.hist.undo(E.clone(T.sheet)); if (!s) return; T.sheet = s; T.sel = Math.min(T.sel, nBars() - 1); changed(true); refreshAll(); WS.saveSheet(song.id, T.sheet); drawHead(); }
  function doRedo() { var s = T.hist.redo(E.clone(T.sheet)); if (!s) return; T.sheet = s; T.sel = Math.min(T.sel, nBars() - 1); changed(true); refreshAll(); WS.saveSheet(song.id, T.sheet); drawHead(); }
  function op(fn, structure) { snapshot(); fn(); changed(structure !== false); refreshEdit(); }
  function setChord(sym) { op(function () { E.setChord(T.sheet, T.sel, T.cell, sym); if (sym) { var ev = E.eventAt(T.sheet.bars[T.sel], T.cell); } }); if (sym) { Synth.unlock(); Synth.chord(Synth.chordMidis(sym, 52)); } }
  function doQuality(q) {
    var cs = selChord();
    if (!cs.sym) { toast('Pick a chord first.'); return; }
    if (q === '/bass') { bassPicker(cs.sym); return; }
    var next = E.setQuality(cs.sym, q);
    op(function () { E.setChord(T.sheet, T.sel, T.cell, next); });
    Synth.unlock(); Synth.chord(Synth.chordMidis(next, 52));
  }
  function bassPicker(sym) {
    var flats = W.usesFlats(keyNow()), s2;
    var grid = h('div', { class: 'pal' }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (pc) { return h('button', { type: 'button', text: W.noteName(pc, flats), onclick: function () { s2.close(); op(function () { E.setChord(T.sheet, T.sel, T.cell, E.setBass(sym, pc, flats)); }); } }); }));
    s2 = sheet([h('h3', { text: 'Bass note' }), grid, h('button', { class: 'btn block', text: 'No bass note', onclick: function () { s2.close(); op(function () { E.setChord(T.sheet, T.sel, T.cell, E.setBass(sym, -1, flats)); }); } })]);
  }
  function setBand(k) { op(function () { E.setBand(T.sheet, T.sel, T.cell, k); }); }
  function doTie() { op(function () { if (!E.toggleTie(T.sheet, T.sel, T.cell)) toast('A rest cannot be tied.'); }); }
  function doAccent(a) { op(function () { if (!E.toggleAccent(T.sheet, T.sel, T.cell, a)) toast('Rests have no accent.'); }); }
  function doFermata() { op(function () { E.toggleFermata(T.sheet, T.sel); }); }
  function doHold() { op(function () { if (!E.hold(T.sheet, T.sel, T.cell)) toast('Pick a beat that comes after another one to hold the one before it.'); }); }
  function doPush() {
    var r = null;
    op(function () { r = E.togglePush(T.sheet, T.sel, T.cell); });
    if (r === 'nochord') toast('Put the chord on a beat first, then tap Push.');
    else if (r === 'no') toast('A push needs a chord on a beat after beat 1.');
  }

  /* ----- selection ----- */
  function selectBar(i, seek, focusTyped) {
    if (i < 0 || i >= nBars()) return;
    if (T.sel !== i) commitTypedQuiet();
    T.sel = i; T.cell = Math.min(T.cell, ctxFor(i).units - 1);
    ensureWin(i);
    if (seek && T.audioEl && T.grid && T.grid.b[i] != null) { T.audioEl.currentTime = T.grid.b[i]; }
    if (T.kind === 'bar') T.loop = [i, i]; else if (T.kind === 'sec') T.loop = sectionOf(i);
    refreshAll();
  }
  function commitTypedQuiet() { clearTimeout(typedTimer); if (document.activeElement === typedInput || true) applyTypedSilently(); }
  function applyTypedSilently() {
    var txt = typedInput.value;
    if (!txt || /[|\n]/.test(txt)) return;
    if (txt.trim() === typedText().trim()) return;
    var snap = E.clone(T.sheet), res = E.applyText(T.sheet, T.sel, txt);
    if (!res.ok) { T.sheet = snap; return; }
    T.hist.push(snap); changed(false);
  }
  function selectCell(u, row) { T.cell = u; T.row = row; drawGrid(); drawPanel(); paintTones(); var pb = pianoBar.querySelector('.btn.pri'); if (pb) pb.textContent = 'Play ' + playLabel(); if (row === 'chord') { var c = E.chordAt(T.sheet.bars[T.sel], u); if (c) { Synth.unlock(); Synth.chord(Synth.chordMidis(c, 52), { vel: 0.5 }); } } }
  function sectionOf(i) {
    var secs = W.sheetSections(T.sheet);
    for (var k = 0; k < secs.length; k++) if (i >= secs[k].from && i <= secs[k].to) return [secs[k].from, secs[k].to];
    return [i, i];
  }

  /* ----- bar options sheet ----- */
  function barOptions() {
    var bi = T.sel, bar = T.sheet.bars[bi], rb = ctxFor(bi), s2;
    function field(label, el) { return h('div', { class: 'fld' }, h('small', { text: label }), el); }
    function toggle(label, key, extra) {
      var b = h('button', { type: 'button', class: 'chip' + (bar[key] ? ' on' : ''), text: label, 'aria-pressed': bar[key] ? 'true' : 'false', onclick: function () {
        snapshot(); if (bar[key]) delete bar[key]; else bar[key] = true; if (extra) extra(bar[key]); changed(true); b.classList.toggle('on', !!bar[key]); b.setAttribute('aria-pressed', bar[key] ? 'true' : 'false'); refreshAll();
      } });
      return b;
    }
    function textField(key, ph) {
      var inp = h('input', { type: 'text', value: bar[key] || '', placeholder: ph || '' });
      inp.addEventListener('change', function () { snapshot(); if (inp.value.trim()) bar[key] = inp.value.trim(); else delete bar[key]; changed(true); refreshAll(); });
      return inp;
    }
    function selectField(key, opts, after) {
      var sel = h('select');
      opts.forEach(function (o) { sel.appendChild(h('option', { value: o[0], text: o[1] })); });
      sel.value = bar[key] == null ? '' : String(bar[key]);
      sel.addEventListener('change', function () { snapshot(); if (sel.value === '') delete bar[key]; else bar[key] = sel.value; if (after) after(sel.value); changed(true); refreshAll(); });
      return sel;
    }
    var mark = h('input', { type: 'text', value: bar.mark && bar.mark !== '*' ? bar.mark : '', placeholder: 'A', maxlength: 2, style: { width: '64px', textAlign: 'center' } });
    var label = h('input', { type: 'text', value: bar.label || '', placeholder: 'Verse, Chorus, Tag…' });
    function saveMark() { snapshot(); if (mark.value.trim()) bar.mark = mark.value.trim().toUpperCase(); else if (label.value.trim()) bar.mark = '*'; else delete bar.mark; if (label.value.trim()) bar.label = label.value.trim(); else delete bar.label; changed(true); refreshAll(); }
    mark.addEventListener('change', saveMark); label.addEventListener('change', saveMark);
    var keyOpts = [['', 'No change']].concat(WS.keyOptions().map(function (k) { return [k, k]; }));
    var timeOpts = [['', 'No change']].concat(['4/4', '3/4', '2/4', '6/8', '12/8', '5/4'].map(function (k) { return [k, k]; }));
    var body = h('div', { class: 'col', style: { gap: '12px' } },
      h('h3', { text: 'Bar ' + (bi + 1) }),
      h('div', { class: 'row' }, field('Rehearsal mark', mark), h('div', { class: 'fld grow' }, h('small', { text: 'Name' }), label)),
      h('div', { class: 'row', style: { flexWrap: 'wrap' } }, toggle('Repeat starts', 'repStart'), toggle('Repeat ends', 'repEnd'), toggle('Vamp till cue', 'vamp'), toggle('Fermata', 'ferm'), toggle('Pickup bar', 'pickup', function (on) { if (on) bar.units = Math.max(1, Math.floor(rb.units / 2)); else delete bar.units; })),
      h('div', { class: 'kv' }, field('Play times (end of repeat)', selectField('times', [['', '2'], ['3', '3'], ['4', '4']])), field('Ending', selectField('ending', [['', 'None'], ['1.', '1st'], ['2.', '2nd']]))),
      h('div', { class: 'row', style: { flexWrap: 'wrap' } }, toggle('Double bar line', 'double'), toggle('Final bar line', 'final'), toggle('Segno', 'segno'), toggle('Coda', 'coda'), toggle('Fine', 'fine')),
      field('Jump', selectField('ds', [['', 'None'], ['D.S. al Coda', 'D.S. al Coda'], ['D.S. al Fine', 'D.S. al Fine'], ['D.C. al Fine', 'D.C. al Fine'], ['D.C. al Coda', 'D.C. al Coda'], ['To Coda', 'To Coda']])),
      h('div', { class: 'kv' }, field('Key changes here', selectField('key', keyOpts)), field('Time changes here', selectField('time', timeOpts, function () { resetBarForTime(bi); }))),
      h('div', { class: 'kv' }, field('Dynamics', selectField('dyn', [['', 'None'], ['pp', 'pp'], ['p', 'p'], ['mp', 'mp'], ['mf', 'mf'], ['f', 'f'], ['ff', 'ff']])), field('Hairpin', selectField('hairpin', [['', 'None'], ['<', 'Louder <'], ['>', 'Softer >']]))),
      h('div', { class: 'kv' }, field('Text cue under the bar', textField('text', 'Band stop')), field('Who plays (line label)', textField('who', 'All, Bass+Gtr'))),
      field('Tempo changes here (BPM)', (function () { var i2 = h('input', { type: 'number', value: bar.tempo || '', inputmode: 'numeric', placeholder: 'No change' }); i2.addEventListener('change', function () { snapshot(); if (Number(i2.value)) bar.tempo = Number(i2.value); else delete bar.tempo; changed(true); refreshAll(); }); return i2; })()),
      h('h3', { text: 'Bars' }),
      h('div', { class: 'row', style: { flexWrap: 'wrap' } },
        btn('Insert before', function () { op(function () { E.insertBar(T.sheet, bi); }); s2.close(); }), btn('Insert after', function () { op(function () { E.insertBar(T.sheet, bi + 1); }); s2.close(); selectBar(bi + 1); }),
        btn('Duplicate', function () { op(function () { E.duplicateBars(T.sheet, bi, bi); }); s2.close(); selectBar(bi + 1); }),
        btn('Repeat sign %', function () { op(function () { var b = T.sheet.bars[bi]; if (b.rep === '%') delete b.rep; else b.rep = '%'; }); s2.close(); }),
        btn('Copy bar', function () { T.clip = E.copyBars(T.sheet, bi, bi); toast('Bar copied.'); s2.close(); }),
        btn('Copy section', function () { var r = sectionOf(bi); T.clip = E.copyBars(T.sheet, r[0], r[1]); toast('Section copied (' + (r[1] - r[0] + 1) + ' bars).'); s2.close(); }),
        btn('Paste after', function () { if (!T.clip) { toast('Copy a bar or a section first.'); return; } op(function () { E.pasteBars(T.sheet, bi + 1, T.clip); }); s2.close(); selectBar(bi + 1); }),
        btn('Clear bar', function () { op(function () { var b = T.sheet.bars[bi]; b.ch = []; b.ev = []; delete b.rep; }); s2.close(); }),
        btn('Delete bar', function () { op(function () { E.deleteBars(T.sheet, bi, bi); T.sel = Math.min(T.sel, nBars() - 1); }); s2.close(); refreshAll(); }, 'bad')),
      h('button', { class: 'btn pri block', text: 'Done', onclick: function () { s2.close(); } }));
    function btn(t, fn, cls) { return h('button', { class: 'btn sm ' + (cls || ''), type: 'button', text: t, onclick: fn }); }
    s2 = sheet(body);
  }
  function resetBarForTime(bi) {
    var bar = T.sheet.bars[bi], rb = W.resolveBars(T.sheet)[bi];
    bar.ev = []; bar.ch = (bar.ch || []).filter(function (c) { return c.at < rb.units; });
  }

  /* ----- audio and transport ----- */
  var timeEl = h('span', { class: 'small tabnum', text: '0:00 / 0:00' });
  var playBtnEl = h('button', { class: 'play', type: 'button', 'aria-label': 'Play', html: icon('play'), onclick: togglePlay });
  var loopBtn = h('button', { class: 'btn acc', type: 'button', onclick: cycleLoop });
  var speedChips = h('div', { class: 'chips' });
  var speedRange = h('input', { type: 'range', min: 40, max: 100, value: 100, 'aria-label': 'Speed', style: { width: '110px' } });
  speedRange.addEventListener('input', function () { setSpeed(Number(speedRange.value) / 100); });
  var transport = h('div', { class: 'transport' },
    h('button', { class: 'btn', type: 'button', text: '−5 s', onclick: function () { if (T.audioEl) T.audioEl.currentTime = Math.max(0, T.audioEl.currentTime - 5); } }), playBtnEl, loopBtn,
    h('span', { class: 'small', text: 'Speed' }), speedChips, speedRange, h('span', { class: 'grow' }), timeEl);
  function drawTransportBits() {
    WS.clear(speedChips);
    [0.5, 0.75, 1].forEach(function (s) { speedChips.appendChild(h('button', { class: 'chip' + (Math.abs(T.speed - s) < 0.01 ? ' on' : ''), type: 'button', text: Math.round(s * 100) + '%', onclick: function () { setSpeed(s); } })); });
    speedRange.value = Math.round(T.speed * 100);
    var lbl = 'Loop off';
    if (T.kind === 'bar') lbl = 'Loop bar ' + (T.sel + 1);
    else if (T.kind === 'sec') { var r = sectionOf(T.sel); var sc = W.sheetSections(T.sheet).filter(function (s) { return s.from === r[0]; })[0]; lbl = 'Loop ' + (sc && (sc.label || sc.mark) || 'section'); }
    else if (T.kind === 'ab') lbl = 'Loop bars ' + (T.loop[0] + 1) + '–' + (T.loop[1] + 1);
    loopBtn.innerHTML = icon('loop') + '<span>' + WS.esc(lbl) + '</span>';
    loopBtn.className = 'btn ' + (T.kind === 'off' ? '' : 'acc');
    playBtnEl.innerHTML = icon(T.playing ? 'pause' : 'play');
    playBtnEl.setAttribute('aria-label', T.playing ? 'Pause' : 'Play');
  }
  function cycleLoop() {
    var order = ['off', 'bar', 'sec'];
    T.kind = order[(order.indexOf(T.kind) + 1) % order.length];
    if (T.kind === 'off') T.loop = null; else if (T.kind === 'bar') T.loop = [T.sel, T.sel]; else T.loop = sectionOf(T.sel);
    refreshLoop();
  }
  function refreshLoop() { drawTransportBits(); drawLoopEl(); if (staffH && staffH.setLoop) { if (T.loop) staffH.setLoop(T.loop[0], T.loop[1]); else staffH.setLoop(null); } }
  function setSpeed(s) { T.speed = Math.max(0.4, Math.min(1, s)); if (T.audioEl) { T.audioEl.playbackRate = T.speed; } drawTransportBits(); }
  function togglePlay() {
    if (!T.audioEl) { toast(demo ? 'The demo song has no audio.' : (song.audio ? 'Download the audio to this device first (More, Audio file).' : 'Link an audio file first (More, Audio file).')); return; }
    if (T.audioEl.paused) {
      if (T.loop && T.grid) { var t = T.audioEl.currentTime, a = W.gridTimeAt(T.grid, T.loop[0], 0), b = W.gridBarEnd(T.grid, T.loop[1]); if (t < a || t >= b) T.audioEl.currentTime = a; }
      T.audioEl.playbackRate = T.speed; T.audioEl.play().catch(function (e) { toast('The audio could not start: ' + (e && e.message || 'blocked by the browser')); });
    } else T.audioEl.pause();
  }
  var raf = null;
  function tick() {
    var el = T.audioEl; if (!el) return;
    var t = el.currentTime;
    if (T.loop && T.grid && !el.paused) {
      var b = W.gridBarEnd(T.grid, T.loop[1]);
      if (t >= b - 0.02) { el.currentTime = W.gridTimeAt(T.grid, T.loop[0], 0); t = el.currentTime; }
    }
    timeEl.textContent = WS.fmtTime(t) + ' / ' + WS.fmtTime(T.dur || el.duration || 0);
    var wd = waveCard.clientWidth || 780, w = win();
    if (T.grid) {
      var g = W.gridBarAt(T.grid, t);
      var pb = g.bar >= 0 ? g.bar : null;
      if (pb !== T.playBar) { T.playBar = pb; if (staffH && staffH.setPlaying) staffH.setPlaying(pb); if (pb != null && T.playing && (pb < w.w0 || pb >= w.w0 + w.n)) { ensureWin(pb); drawSections(); drawWave(); } }
      if (pb != null && pb >= w.w0 && pb < w.w0 + w.n) { phEl.style.display = 'block'; phEl.style.left = (barX(pb, wd) + (barX(pb + 1, wd) - barX(pb, wd)) * g.frac) + 'px'; } else phEl.style.display = 'none';
    } else phEl.style.display = 'none';
    if (!el.paused) raf = requestAnimationFrame(tick); else raf = null;
  }
  function loadAudio() {
    if (demo || !song.audio) { drawWave(); drawGridTools(); drawTransportBits(); return; }
    A.init().then(function () {
      if (A.state(song.audio) !== 'device') { drawWave(); drawGridTools(); return; }
      return A.url(song.audio).then(function (url) {
        if (T.audioEl) { T.audioEl.pause(); }
        var el = new Audio(url); el.preload = 'auto'; el.playbackRate = T.speed;
        try { el.preservesPitch = true; el.webkitPreservesPitch = true; el.mozPreservesPitch = true; } catch (e) { /* ignore */ }
        T.audioEl = el;
        el.addEventListener('loadedmetadata', function () { T.dur = el.duration; tick(); });
        el.addEventListener('play', function () { T.playing = true; drawTransportBits(); if (!raf) raf = requestAnimationFrame(tick); });
        el.addEventListener('pause', function () { T.playing = false; drawTransportBits(); tick(); });
        el.addEventListener('ended', function () { T.playing = false; drawTransportBits(); });
        el.addEventListener('error', function () { toast('This audio file could not be played. Try downloading it again.'); });
        el.addEventListener('seeked', tick);
        return A.peaks(song.audio, 1200).then(function (p) { T.peaks = p.p; T.dur = p.dur; drawWave(); drawSections(); drawGridTools(); tick(); }).catch(function (e) { toast((e && e.message) || 'The waveform could not be drawn.'); drawWave(); });
      });
    }).catch(function (e) { toast((e && e.message) || 'The audio could not be opened.'); });
    drawGridTools(); drawTransportBits();
  }
  // tap on the waveform
  waveCard.addEventListener('click', function (e) {
    var r = waveCard.getBoundingClientRect(), x = e.clientX - r.left, wd = r.width;
    var bi = barAtX(x, wd);
    selectBar(bi, false);
    var tt = timeAtX(x, wd);
    if (T.audioEl && tt != null) T.audioEl.currentTime = Math.max(0, tt);
  });

  /* ----- assemble ----- */
  function redrawBar() { refreshTypedLazy(); drawGrid(); drawPanel(); drawStaff(); drawSections(); drawWave(); paintTones(); }
  function refreshTypedLazy() { /* the typed field is the one being edited */ }
  function refreshEdit() { refreshTyped(); drawGrid(); drawPanel(); drawStaff(); drawSections(); drawWave(); paintTones(); }
  function refreshAll() { refreshTyped(); drawGrid(); drawPanel(); drawStaff(); drawSections(); drawWave(); drawGridTools(); drawTransportBits(); paintTones(); var pb = pianoBar.querySelector('.btn.pri'); if (pb) pb.textContent = 'Play ' + playLabel(); drawHead(); }
  function redraw() { drawSections(); drawWave(); drawGridTools(); drawTransportBits(); }

  var topBox = h('div', { class: 'tr-top' }, secStrip, waveCard, barnums, transport);
  var left = h('div', { class: 'tr-left' }, topBox, gtools, staffCard, typedWrap, gedit);
  var main = h('div', { class: 'tr-main' }, left, panel);
  add(root, headHost, main, pianoBar);

  // MIDI keyboard: notes go into the Notes row
  if (WS.Midi) {
    WS.Midi.onNote = function (m, on, vel) {
      if (on) { Synth.on(m, vel || 0.8); if (T.row === 'notes') { var snap = E.clone(T.sheet); E.togglePitch(T.sheet, T.sel, T.cell, midiName(m)); T.hist.push(snap); changed(true); redrawBar(); } }
      else Synth.off(m);
    };
  }
  function onKey(e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
    else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  }
  document.addEventListener('keydown', onKey);
  var offResize = WS.on('resize', function () { drawStaff(); drawWave(); drawSections(); });
  var offAudio = WS.on('audio', function () { if (!T.audioEl) loadAudio(); });
  WS.onLeave(function () {
    persistSoon.flush(); commitTypedQuiet(); WS.saveSheet(song.id, T.sheet);
    document.removeEventListener('keydown', onKey); offResize(); offAudio();
    if (T.audioEl) { T.audioEl.pause(); T.audioEl = null; }
    if (raf) cancelAnimationFrame(raf);
    if (T.mic && WS.Mic) WS.Mic.stop();
    if (WS.Midi) WS.Midi.onNote = null;
    Synth.allOff();
  });
  window.__tr = T; T.api = { selectBar: selectBar, selectCell: selectCell, refreshAll: refreshAll, setChord: setChord, barOptions: barOptions, redraw: redraw };
  setTimeout(function () {
    drawHead(); buildPiano(); refreshAll(); loadAudio();
    if (WS.Midi && WS.Midi.autoStart) WS.Midi.autoStart();
  }, 0);
  return root;
};
})();
