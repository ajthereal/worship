/* Worship edit: operations on a lead sheet (chords, band rhythm, pitches, bars). Pure, works on the sheet object. */
(function () {
'use strict';
var W = window.WCore;
var E = {};

function rbOf(sheet, i) { return W.resolveBars(sheet)[i]; }
function ctxOf(rb) { return { units: rb.units, bu: rb.bu, sub: rb.sub }; }

function materialize(bar, rb) {
  if (!bar.ev || !bar.ev.length) bar.ev = W.defaultEvents(rb.units, rb.bu);
  bar.ev.sort(function (a, b) { return a.at - b.at; });
  // fill any gap with a rest so the cells stay continuous
  var pos = 0, out = [];
  bar.ev.forEach(function (e) {
    if (e.at > pos) out.push({ at: pos, d: e.at - pos, k: 'r' });
    out.push(e); pos = Math.max(pos, e.at + e.d);
  });
  if (pos < rb.units) out.push({ at: pos, d: rb.units - pos, k: 'r' });
  bar.ev = out;
  return bar.ev;
}
function eventAt(bar, u) {
  var ev = bar.ev || [];
  for (var i = 0; i < ev.length; i++) if (u >= ev[i].at && u < ev[i].at + ev[i].d) return ev[i];
  return null;
}
// Make sure an event starts exactly at unit u. Returns it.
function splitAt(bar, rb, u) {
  materialize(bar, rb);
  var e = eventAt(bar, u);
  if (!e) return null;
  if (e.at === u) return e;
  var rest = { at: u, d: e.at + e.d - u, k: e.k };
  if (e.p) rest.p = e.p.slice();
  if (e.a) rest.a = e.a;
  if (e.tie) { rest.tie = true; }
  e.d = u - e.at; delete e.tie;
  bar.ev.splice(bar.ev.indexOf(e) + 1, 0, rest);
  return rest;
}
E.eventAt = eventAt; E.splitAt = splitAt; E.materialize = materialize;

// One cell of the editor per unit
E.cells = function (bar, rb) {
  var ev = (bar.ev && bar.ev.length) ? bar.ev.slice().sort(function (a, b) { return a.at - b.at; }) : W.defaultEvents(rb.units, rb.bu);
  var cells = [], chAt = {};
  (bar.ch || []).forEach(function (c) { chAt[c.at] = c.c; });
  for (var u = 0; u < rb.units; u++) {
    var e = null;
    for (var i = 0; i < ev.length; i++) if (u >= ev[i].at && u < ev[i].at + ev[i].d) { e = ev[i]; break; }
    var starts = !!e && e.at === u;
    var band = '·';
    if (e) band = starts ? (e.k === 'r' ? 'Rest' : e.k === 'h' ? 'Hit' : e.k === 'n' ? 'Notes' : 'Comp') : '—';
    cells.push({ u: u, chord: chAt[u] || null, band: band, ev: e, starts: starts, acc: starts && e && e.a ? e.a : '', notes: starts && e && e.p ? e.p : [], tie: starts && e && e.tie });
  }
  return cells;
};

E.setChord = function (sheet, bi, u, sym) {
  var bar = sheet.bars[bi]; bar.ch = bar.ch || [];
  bar.ch = bar.ch.filter(function (c) { return c.at !== u; });
  if (sym) { bar.ch.push({ at: u, c: W.normChordSym(sym) }); bar.ch.sort(function (a, b) { return a.at - b.at; }); }
  return bar;
};
E.chordAt = function (bar, u) { var c = (bar.ch || []).filter(function (x) { return x.at === u; })[0]; return c ? c.c : null; };
// the chord sounding at unit u (the last one at or before it in this bar), or null
E.chordIn = function (bar, u) { var r = null; (bar.ch || []).forEach(function (c) { if (c.at <= u && (!r || c.at >= r.at)) r = c; }); return r ? r.c : null; };

E.setBand = function (sheet, bi, u, kind) {
  var rb = rbOf(sheet, bi), bar = sheet.bars[bi];
  var e = splitAt(bar, rb, u); if (!e) return;
  e.k = kind;
  if (kind !== 'n') delete e.p;
  if (kind === 'r') { delete e.a; delete e.tie; }
  return e;
};
E.toggleAccent = function (sheet, bi, u, a) {
  var rb = rbOf(sheet, bi), bar = sheet.bars[bi];
  var e = splitAt(bar, rb, u); if (!e || e.k === 'r') return false;
  if (e.a === a) delete e.a; else e.a = a;
  return true;
};
E.toggleTie = function (sheet, bi, u) {
  var rb = rbOf(sheet, bi), bar = sheet.bars[bi];
  materialize(bar, rb);
  var e = eventAt(bar, u); if (!e || e.k === 'r') return false;
  if (e.tie) delete e.tie; else e.tie = true;
  return true;
};
// merge the event that starts at u into the one before it (longer note)
E.hold = function (sheet, bi, u) {
  var rb = rbOf(sheet, bi), bar = sheet.bars[bi];
  materialize(bar, rb);
  var e = eventAt(bar, u); if (!e) return false;
  var idx = bar.ev.indexOf(e);
  if (e.at === u && idx > 0) {
    var prev = bar.ev[idx - 1];
    prev.d += e.d; bar.ev.splice(idx, 1);
    if (prev.k === 'r') prev.k = 's';
    return true;
  }
  return false;
};
E.toggleFermata = function (sheet, bi) { var b = sheet.bars[bi]; if (b.ferm) delete b.ferm; else b.ferm = true; };

// Push: the chord on a beat moves one unit earlier and is tied in
E.togglePush = function (sheet, bi, u) {
  var rb = rbOf(sheet, bi), bar = sheet.bars[bi];
  materialize(bar, rb);
  var bu = rb.bu;
  // undo: a chord one unit before a beat with a tied one-unit hit
  var pe = bar.ev.filter(function (e) { return e.at === u && e.k === 'h' && e.d === 1 && e.tie; })[0];
  var ch = (bar.ch || []).filter(function (c) { return c.at === u; })[0];
  if (pe && ch && (u + 1) % bu === 0) {
    ch.at = u + 1;
    var nxt = bar.ev.filter(function (e) { return e.at === u + 1; })[0];
    bar.ev.splice(bar.ev.indexOf(pe), 1);
    var prev = bar.ev.filter(function (e) { return e.at + e.d === u; })[0];
    if (prev) prev.d += 1; else if (nxt) { nxt.at = u; nxt.d += 1; }
    return 'off';
  }
  if (u % bu !== 0 || u === 0) return 'no';
  var chord = (bar.ch || []).filter(function (c) { return c.at === u; })[0];
  if (!chord) return 'nochord';
  var before = eventAt(bar, u - 1);
  if (!before) return 'no';
  chord.at = u - 1;
  if (before.d > 1) before.d -= 1; else { bar.ev.splice(bar.ev.indexOf(before), 1); }
  bar.ev.push({ at: u - 1, d: 1, k: 'h', tie: true });
  var at = eventAt(bar, u); if (at && at.at === u) at.k = 'h';
  bar.ev.sort(function (a, b) { return a.at - b.at; });
  return 'on';
};

E.togglePitch = function (sheet, bi, u, pitch) {
  var rb = rbOf(sheet, bi), bar = sheet.bars[bi];
  var e = splitAt(bar, rb, u); if (!e) return;
  var m = W.pitchMidi(pitch);
  e.p = e.p || [];
  var idx = -1;
  e.p.forEach(function (p, i) { if (W.pitchMidi(p) === m) idx = i; });
  if (idx >= 0) e.p.splice(idx, 1); else e.p.push(pitch);
  e.p.sort(function (a, b) { return W.pitchMidi(a) - W.pitchMidi(b); });
  if (e.p.length) { e.k = 'n'; } else { delete e.p; e.k = 's'; }
  return e;
};
E.clearPitches = function (sheet, bi, u) {
  var bar = sheet.bars[bi], e = eventAt(bar, u);
  if (e && e.p) { delete e.p; if (e.k === 'n') e.k = 's'; }
};

/* chord quality buttons */
var QMAP = { 'maj7': 'maj7', '7': '7', 'm7': 'm7', 'sus': 'sus', 'add9': 'add9', 'ø': 'm7b5', '°': 'dim', '9': '9', '11': '11', '13': '13', 'alt': 'alt' };
E.setQuality = function (sym, q) {
  var c = W.chordRoot(sym); if (!c) return sym;
  var cur = c.qual, minor = /^(m|min|-)(?!aj)/.test(cur) && !/^m7b5/.test(cur);
  var next = QMAP[q];
  if (q === 'm7') next = 'm7';
  else if (minor && (q === '9' || q === '11' || q === '13')) next = 'm' + q;
  if (cur === next) next = minor && q !== 'm7' ? 'm' : '';
  var flats = /b/.test(c.rootName);
  return c.rootName + next + (c.bass >= 0 ? '/' + W.noteName(c.bass, flats) : '');
};
E.setBass = function (sym, pc, flats) {
  var c = W.chordRoot(sym); if (!c) return sym;
  return c.rootName + c.qual + (pc == null || pc < 0 ? '' : '/' + W.noteName(pc, flats));
};
E.activeQualities = function (sym) {
  var c = W.chordRoot(sym); if (!c) return {};
  var q = c.qual, out = {};
  Object.keys(QMAP).forEach(function (k) { if (q === QMAP[k]) out[k] = true; });
  if (c.bass >= 0) out['/bass'] = true;
  return out;
};

/* palette: seven diatonic chords of the key in force plus the first inversion of the tonic */
E.palette = function (keyStr) {
  var k = W.parseKey(keyStr); if (!k) return [];
  var flats = W.usesFlats(keyStr), out = [];
  var d = W.diatonicChords(keyStr);
  var minor = k.minor;
  var rel = minor ? W.noteName(k.root + 3, flats) : null;
  var seven = minor ? 7 : 10; // bVII of the major key; VII of natural minor is also a whole step below tonic
  d.forEach(function (c, i) { if (i < 6 || minor) out.push(c); });
  if (!minor) out.push(W.noteName(k.root + 10, flats));
  var tonic = W.noteName(k.root, flats) + (minor ? 'm' : '');
  out = out.slice(0, 7);
  out.push(tonic + '/' + W.noteName(k.root + (minor ? 3 : 4), flats));
  return out.map(function (c) { return { sym: c, roman: W.romanFor(c, keyStr) }; });
};

/* typed text -> bar */
E.applyText = function (sheet, bi, text) {
  var rb = rbOf(sheet, bi), bar = sheet.bars[bi];
  var r = W.parseBarText(text, ctxOf(rb));
  if (r.errors.length) return { ok: false, errors: r.errors, warnings: r.warnings };
  var nb = r.bar;
  // keep pitches of events that did not change
  var oldEv = (bar.ev || []).filter(function (e) { return e.p; });
  bar.ch = nb.ch; bar.ev = nb.ev;
  if (nb.rep) bar.rep = nb.rep; else delete bar.rep;
  if (nb.mark) { bar.mark = nb.mark === '*' ? (bar.mark || nextMark(sheet, bi)) : nb.mark; if (nb.label) bar.label = nb.label; }
  if (nb.ending) bar.ending = nb.ending;
  if (nb.text) bar.text = nb.text;
  oldEv.forEach(function (o) { var n = bar.ev.filter(function (e) { return e.at === o.at && e.d === o.d && e.k !== 'r'; })[0]; if (n) { n.p = o.p; n.k = 'n'; } });
  return { ok: true, warnings: r.warnings };
};
function nextMark(sheet, bi) {
  var used = {}; sheet.bars.forEach(function (b) { if (b.mark) used[b.mark] = 1; });
  for (var c = 65; c < 91; c++) if (!used[String.fromCharCode(c)]) return String.fromCharCode(c);
  return 'Z';
}
E.nextMark = nextMark;

// Replace bars starting at bi with parsed bars (several bars pasted at once). Extra bars are added at the end.
E.pasteParsed = function (sheet, bi, bars, replace) {
  bars.forEach(function (nb, k) {
    var idx = bi + k;
    if (nb.mark === '*') nb.mark = nextMark(sheet, idx);
    if (replace && idx < sheet.bars.length) {
      var old = sheet.bars[idx];
      var merged = Object.assign({}, old, nb);
      ['mark', 'label', 'repStart', 'repEnd', 'ending', 'double', 'final', 'text', 'rep'].forEach(function (key) { if (!(key in nb)) delete merged[key]; });
      // keep key/time/tempo/dyn from the old bar when the paste did not set them
      sheet.bars[idx] = merged;
    } else sheet.bars.splice(idx, 0, nb);
  });
};

E.blankBar = function () { return { ch: [], ev: [] }; };
E.insertBar = function (sheet, idx, bar) { sheet.bars.splice(idx, 0, bar || E.blankBar()); };
E.deleteBars = function (sheet, from, to) {
  if (sheet.bars.length <= to - from + 1) { sheet.bars = [E.blankBar()]; return; }
  var removed = sheet.bars.splice(from, to - from + 1);
  // keep a mark that was on the first deleted bar by moving it forward
  if (removed[0].mark && sheet.bars[from] && !sheet.bars[from].mark) { sheet.bars[from].mark = removed[0].mark; sheet.bars[from].label = removed[0].label; }
  if (from === 0 && removed[0].key && sheet.bars[0] && !sheet.bars[0].key) { /* the sheet key stays */ }
};
E.copyBars = function (sheet, from, to) { return JSON.parse(JSON.stringify(sheet.bars.slice(from, to + 1))); };
E.pasteBars = function (sheet, idx, bars) {
  var copy = JSON.parse(JSON.stringify(bars));
  copy.forEach(function (b) { delete b.mark; delete b.label; });
  Array.prototype.splice.apply(sheet.bars, [idx, 0].concat(copy));
};
E.duplicateBars = function (sheet, from, to) {
  var bars = E.copyBars(sheet, from, to);
  E.pasteBars(sheet, to + 1, bars);
};
// change the grid between eighths (8) and sixteenths (16). Down only when every position is even.
E.rescaleSub = function (sheet, newSub) {
  var old = sheet.sub || 8;
  if (newSub === old) return true;
  var up = newSub > old, f = up ? newSub / old : old / newSub;
  if (!up) {
    var ok = true;
    sheet.bars.forEach(function (b) { (b.ev || []).forEach(function (e) { if (e.at % f || e.d % f) ok = false; }); (b.ch || []).forEach(function (c) { if (c.at % f) ok = false; }); });
    if (!ok) return false;
  }
  sheet.bars.forEach(function (b) {
    (b.ev || []).forEach(function (e) { e.at = up ? e.at * f : e.at / f; e.d = up ? e.d * f : e.d / f; });
    (b.ch || []).forEach(function (c) { c.at = up ? c.at * f : c.at / f; });
    if (b.units) b.units = up ? b.units * f : b.units / f;
  });
  sheet.sub = newSub;
  return true;
};
E.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

/* history */
E.History = function (limit) {
  var undo = [], redo = [], max = limit || 80;
  return {
    push: function (snap) { undo.push(snap); if (undo.length > max) undo.shift(); redo.length = 0; },
    undo: function (cur) { if (!undo.length) return null; redo.push(cur); return undo.pop(); },
    redo: function (cur) { if (!redo.length) return null; undo.push(cur); return redo.pop(); },
    canUndo: function () { return undo.length > 0; }, canRedo: function () { return redo.length > 0; }
  };
};

window.WEdit = E;
})();
