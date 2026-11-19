/* Worship notation: lead sheet drawn with VexFlow (staff, slashes, notes, beams, ties, barlines) and our own layer
   (chord symbols, rehearsal marks, endings, dynamics, cues, articulations). Needs core.js (WCore). */
(function () {
'use strict';
var W = window.WCore;
var NS = 'http://www.w3.org/2000/svg';
var vfPromise = null;

function loadVF() {
  if (window.Vex) return Promise.resolve(window.Vex);
  if (vfPromise) return vfPromise;
  vfPromise = new Promise(function (res, rej) {
    var s = document.createElement('script');
    s.src = 'vendor/vexflow-bravura.js';
    s.onload = function () { window.Vex ? res(window.Vex) : rej(new Error('Notation library did not start')); };
    s.onerror = function () { vfPromise = null; rej(new Error('Notation library could not be loaded')); };
    document.head.appendChild(s);
  });
  return vfPromise;
}
function VF() { return window.Vex.Flow; }

var THEMES = {
  light: { ink: '#16181D', mut: '#5E626B', line: '#7c7f87', acc: '#2348D8', accSoft: '#E9EEFD', hit: '#B5470B', bg: '#FFFFFF' },
  dark: { ink: '#F3F1EC', mut: '#A3A7AF', line: '#8b8a88', acc: '#8EAEFF', accSoft: 'rgba(142,174,255,0.14)', hit: '#FFB86B', bg: '#0C0D10' }
};
function theme(name) { return THEMES[name] || THEMES.light; }

/* ---------- helpers ---------- */
function el(tag, attrs, text) {
  var e = document.createElementNS(NS, tag);
  if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  if (text != null) e.textContent = text;
  return e;
}
var VF_KEYS = { 'C': 1, 'G': 1, 'D': 1, 'A': 1, 'E': 1, 'B': 1, 'F#': 1, 'C#': 1, 'F': 1, 'Bb': 1, 'Eb': 1, 'Ab': 1, 'Db': 1, 'Gb': 1, 'Cb': 1,
  'Am': 1, 'Em': 1, 'Bm': 1, 'F#m': 1, 'C#m': 1, 'G#m': 1, 'D#m': 1, 'A#m': 1, 'Dm': 1, 'Gm': 1, 'Cm': 1, 'Fm': 1, 'Bbm': 1, 'Ebm': 1, 'Abm': 1 };
function vfKey(k) {
  var p = W.parseKey(k);
  if (!p) return 'C';
  var name = (k || 'C').replace(/♯/g, '#').replace(/♭/g, 'b').replace(/(min|minor)$/, 'm').replace(/(maj|major|M)$/, '');
  if (VF_KEYS[name]) return name;
  return W.keyLabel(p.root, p.minor).replace('G#', 'Ab').replace('D#', 'Eb').replace('A#', 'Bb') + (p.minor && !/m$/.test(W.keyLabel(p.root, p.minor)) ? 'm' : '');
}
function mix(a, b, t) {
  function p(h) { h = h.replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  if (a.charAt(0) !== '#' || b.charAt(0) !== '#') return a;
  var x = p(a), y = p(b);
  return '#' + x.map(function (v, i) { var m = Math.round(v * (1 - t) + y[i] * t); return (m < 16 ? '0' : '') + m.toString(16); }).join('');
}

/* ---------- rhythm splitting ---------- */
function pow2(n) { var p = 1; while (p * 2 <= n) p *= 2; return p; }
// Split an event of d units starting at `at` into pieces that have a plain written length.
function splitLen(at, d, ti) {
  var sub = ti.sub, LEN = sub >= 16 ? [16, 12, 8, 6, 4, 3, 2, 1] : [8, 6, 4, 3, 2, 1];
  var out = [], s = at, r = d;
  while (r > 0) {
    var pick = 1;
    for (var i = 0; i < LEN.length; i++) {
      var L = LEN[i];
      if (L > r) continue;
      var p2 = pow2(L);
      if (s % p2 !== 0) continue;
      if (s % ti.bu !== 0 && (s % ti.bu) + L > ti.bu) continue; // do not cross a beat from the middle of it
      pick = L; break;
    }
    out.push({ at: s, d: pick });
    s += pick; r -= pick;
  }
  return out;
}
// units (of 1/sub whole) -> {dur, dots}
function durOf(d, sub) {
  var u16 = d * 16 / sub;
  var map = { 16: ['w', 0], 12: ['h', 1], 8: ['h', 0], 6: ['q', 1], 4: ['q', 0], 3: ['8', 1], 2: ['8', 0], 1: ['16', 0] };
  var m = map[u16] || ['q', 0];
  return { dur: m[0], dots: m[1] };
}

/* ---------- plan: bars -> lines ---------- */
function chordWidth(sym, size, o) {
  var s = o && o.nash ? W.nashSym(sym, o.key) : W.chordDisplay(sym, o);
  return s.length * size * 0.58 + 4;
}
function barNeed(rb, size, o) {
  var b = rb.bar, ev = b.ev ? b.ev.length : rb.beats, w = 0;
  (b.ch || []).forEach(function (c) { w += chordWidth(c.c, size, o) + 6; });
  var evw = Math.max(rb.beats * 26, ev * 20);
  if (b.rep === '%') return 70;
  return Math.max(70, evw, w + 24) + (b.repStart || b.repEnd ? 14 : 0) + (b.ending ? 8 : 0);
}

function plan(sheet, opts) {
  var rs = W.resolveBars(sheet), s = opts.scale || 1, sp = 10;
  var width = (opts.width || 800) / s;
  var size = sp * 2.15;
  var maxPer = opts.barsPerLine || opts.maxPerLine || 4;
  var list = [];
  if (opts.ranges && opts.ranges.length) opts.ranges.forEach(function (r) { for (var i = r[0]; i <= r[1]; i++) if (rs[i]) list.push(i); });
  else for (var i = 0; i < rs.length; i++) list.push(i);
  var lines = [], cur = null, prevKey = null, prevTime = null, first = true;
  var fixed = !!opts.barsPerLine;
  list.forEach(function (bi, k) {
    var rb = rs[bi], b = rb.bar;
    var gap = k > 0 && list[k - 1] !== bi - 1; // a gap in the range list starts a new line
    var needNew = !cur || gap;
    if (!needNew) {
      if (cur.bars.length >= maxPer) needNew = true;
      else if (b.mark && cur.bars.length) needNew = true;
      else if (rb.key !== prevKey || rb.time !== prevTime) needNew = true;
      else if (!fixed) {
        var need = cur.need + barNeed(rb, size, opts);
        if (need + cur.prefix > width && cur.bars.length) needNew = true;
      }
    }
    if (needNew) {
      var showTime = first || !prevTime || rb.time !== prevTime || !!opts.timeEveryLine;
      var keyN = Math.abs(accCount(rb.key));
      cur = { bars: [], need: 0, prefix: 34 + (keyN ? keyN * 9 + 8 : 0) + (showTime ? 26 : 0) + 8, showTime: showTime, from: bi };
      lines.push(cur);
    }
    cur.bars.push(rb); cur.need += barNeed(rb, size, opts);
    prevKey = rb.key; prevTime = rb.time; first = false;
  });
  // heights
  var y = 6;
  lines.forEach(function (L) {
    var hasMark = false, hasEnd = false, hasArt = false, hasTop = false, hasBelow = false, hasWho = false;
    L.bars.forEach(function (rb) {
      var b = rb.bar;
      if (b.mark) hasMark = true;
      if (b.ending) hasEnd = true;
      if (b.segno || b.coda || b.fine || b.ds === 'To Coda') hasTop = true;
      if (b.who) hasWho = true;
      if (b.dyn || b.hairpin || b.text || b.ds || (b.repEnd && b.times > 1)) hasBelow = true;
      (b.ev || []).forEach(function (e) { if (e.a) hasArt = true; });
      if (b.ferm) hasArt = true;
    });
    L.hasMark = hasMark; L.hasEnd = hasEnd; L.hasArt = hasArt; L.hasBelow = hasBelow; L.hasWho = hasWho;
    var top = 38 + (hasArt ? 16 : 0);
    if (hasEnd) top = Math.max(top, hasArt ? 80 : 56);
    if (hasMark) top = Math.max(top, 66);
    if (hasTop) top = Math.max(top, 56);
    L.top = top; L.bottom = hasBelow ? 36 : 22;
    L.y = y + top;           // y of the top staff line
    L.h = top + 4 * sp + L.bottom;
    y += L.h;
  });
  return { lines: lines, height: y + 6, width: width, scale: s, sp: sp, rs: rs, size: size };
}
function accCount(key) {
  var k = W.parseKey(key);
  if (!k) return 0;
  var maj = W.relMajorRootPublic ? W.relMajorRootPublic(k.root, k.minor) : (k.minor ? (k.root + 3) % 12 : k.root);
  var sharps = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: 7 }, flats = { 5: 1, 10: 2, 3: 3, 8: 4, 1: 5, 6: 6 };
  if (W.usesFlats(key) && flats[maj] != null) return flats[maj];
  return sharps[maj] != null ? sharps[maj] : (flats[maj] || 0);
}

/* ---------- the renderer ---------- */
// host: element. sheet: lead sheet. opts: see top of file. Returns a handle.
function render(host, sheet, opts) {
  opts = opts || {};
  var th = theme(opts.theme);
  var P = plan(sheet, opts);
  var s = P.scale, sp = P.sp, size = P.size;
  var Wd = opts.width || host.clientWidth || 800;
  var Hd = Math.ceil(P.height * s);
  host.innerHTML = '';
  var div = document.createElement('div');
  div.className = 'vfhost';
  host.appendChild(div);
  var F = VF();
  var renderer = new F.Renderer(div, F.Renderer.Backends.SVG);
  renderer.resize(Wd, Hd);
  var ctx = renderer.getContext();
  ctx.scale(s, s);
  var svg = ctx.svg;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Lead sheet');
  svg.style.display = 'block';
  svg.style.overflow = 'visible';
  var lineCol = th.line;
  ctx.setFillStyle(th.ink); ctx.setStrokeStyle(th.ink);

  var underLayer = el('g', { 'data-layer': 'under' });
  svg.insertBefore(underLayer, svg.firstChild);
  var textLayer = el('g', { 'data-layer': 'text' });
  var hitLayer = el('g', { 'data-layer': 'hit' });
  var barInfo = {}, lineInfo = [];
  var innerW = P.width;
  var X0 = 4, LW = innerW - 8;

  function text(x, y, str, o) {
    o = o || {};
    var t = el('text', { x: x.toFixed(1), y: y.toFixed(1), fill: o.fill || th.ink, 'font-size': o.size || 12, 'font-weight': o.weight || 500, 'text-anchor': o.anchor || 'start' }, str);
    t.setAttribute('font-family', o.family || 'Inter, system-ui, sans-serif');
    if (o.style) t.setAttribute('font-style', o.style);
    if (o.ls) t.setAttribute('letter-spacing', o.ls);
    (o.layer || textLayer).appendChild(t);
    return t;
  }
  function serif(x, y, str, size2, anchor) {
    return text(x, y, str, { size: size2, weight: 700, style: 'italic', family: "'Noto Serif', 'Times New Roman', Georgia, serif", anchor: anchor });
  }
  function glyph(x, y, name, pt, color) {
    ctx.save();
    ctx.setFillStyle(color || th.ink); ctx.setStrokeStyle(color || th.ink);
    try { F.Glyph.renderGlyph(ctx, x, y, pt, name); } catch (e) { /* glyph missing: skip */ }
    ctx.restore();
  }
  function chordEl(x, y, sym, fill, sizePx, nashKey) {
    var t = el('text', { x: x.toFixed(1), y: y.toFixed(1), fill: fill || th.ink });
    t.setAttribute('font-family', "'Inter Tight', Inter, system-ui, sans-serif");
    t.setAttribute('font-weight', '600');
    t.setAttribute('font-size', sizePx);
    if (opts.nashville) {
      t.textContent = W.nashSym(sym, nashKey);
      textLayer.appendChild(t);
      return t;
    }
    var p = W.chordParts(sym, { triangle: opts.triangle !== false });
    if (p.nc) { t.textContent = 'N.C.'; textLayer.appendChild(t); return t; }
    t.appendChild(document.createTextNode(p.root + p.acc + p.minor));
    if (p.sup) {
      var a = el('tspan', { dy: (-sizePx * 0.36).toFixed(1), 'font-size': (sizePx * 0.66).toFixed(1) }, p.sup);
      t.appendChild(a);
      t.appendChild(el('tspan', { dy: (sizePx * 0.36).toFixed(1) }, ''));
    }
    if (p.bass) t.appendChild(document.createTextNode('/' + p.bass + p.bassAcc));
    textLayer.appendChild(t);
    return t;
  }
  function artic(x, y, a, col) {
    var g = el('path', { fill: 'none', stroke: col, 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    if (a === '>') g.setAttribute('d', 'M' + (x - 6) + ',' + (y - 5.5) + ' L' + (x + 6) + ',' + (y - 0.5) + ' L' + (x - 6) + ',' + (y + 4.5));
    else if (a === '^') g.setAttribute('d', 'M' + (x - 5.5) + ',' + (y + 3) + ' L' + x + ',' + (y - 6) + ' L' + (x + 5.5) + ',' + (y + 3));
    else if (a === '.') { g = el('circle', { cx: x, cy: y, r: 1.8, fill: col }); }
    else if (a === '-') g.setAttribute('d', 'M' + (x - 5) + ',' + y + ' L' + (x + 5) + ',' + y);
    else return;
    textLayer.appendChild(g);
  }

  var allTies = [];
  P.lines.forEach(function (L, li) {
    var weights = L.bars.map(function (rb) {
      var wgt = Math.max(0.55, barNeed(rb, size, opts) / 150);
      if (!opts.barsPerLine) wgt = Math.max(1, wgt);
      if (rb.bar.pickup) wgt *= 0.6;
      return wgt;
    });
    var totalW = weights.reduce(function (a, b) { return a + b; }, 0);
    var avail = LW - L.prefix;
    var xs = [], x = X0;
    L.bars.forEach(function (rb, bi) {
      var bw = avail * weights[bi] / totalW;
      var w2 = bw + (bi === 0 ? L.prefix : 0);
      xs.push({ x: x, w: w2, bw: bw });
      x += w2;
    });
    var yTop = L.y;
    lineInfo.push({ y: yTop - L.top, h: L.h, from: L.bars[0].i, to: L.bars[L.bars.length - 1].i, top: yTop });
    var endingRuns = [], placed = [];
    L.bars.forEach(function (rb, bi) {
      var b = rb.bar, X = xs[bi];
      var stave = new F.Stave(X.x, yTop, X.w, { space_above_staff_ln: 0, space_below_staff_ln: 0 });
      stave.setStyle({ strokeStyle: lineCol, fillStyle: lineCol, lineWidth: 1 });
      var Bt = F.Barline.type;
      stave.setBegBarType(bi === 0 ? Bt.SINGLE : Bt.NONE);
      if (b.repStart) stave.setBegBarType(Bt.REPEAT_BEGIN);
      var endT = Bt.SINGLE;
      if (b.repEnd) endT = Bt.REPEAT_END; else if (b.final) endT = Bt.END; else if (b.double) endT = Bt.DOUBLE;
      stave.setEndBarType(endT);
      if (bi === 0) {
        stave.addClef('treble');
        try { stave.addKeySignature(vfKey(rb.key)); } catch (e) { /* ignore a key we cannot draw */ }
        if (L.showTime) stave.addTimeSignature(rb.n + '/' + rb.d);
      }
      stave.setContext(ctx).draw();
      // clef / key / time use the ink colour
      var startX = stave.getNoteStartX(), endX = stave.getNoteEndX();
      var barRight = X.x + X.w;
      barInfo[rb.i] = { x: X.x + (bi === 0 ? L.prefix - 8 : 0), w: X.w - (bi === 0 ? L.prefix - 8 : 0), y: yTop - L.top, h: L.h, line: li, top: yTop, noteX: startX, right: barRight };

      /* --- rhythm voice --- */
      var units = rb.units, bu = rb.bu, sub = rb.sub;
      var tinfo = { sub: sub, bu: bu, units: units };
      var notes = [], pieces = [];
      if (b.rep === '%') {
        var rn = new F.GhostNote({ duration: 'w' });
        notes.push(rn);
        pieces.push({ at: 0, d: units, note: rn, ghost: true });
      } else {
        var evs = W.evSorted(b, tinfo), pos = 0, fixedEv = [];
        evs.forEach(function (e) {
          if (e.at > pos) fixedEv.push({ at: pos, d: e.at - pos, k: 'r' });
          if (e.at >= pos || true) fixedEv.push(e);
          pos = Math.max(pos, e.at + e.d);
        });
        if (pos < units) fixedEv.push({ at: pos, d: units - pos, k: 'r' });
        var lastRealPiece = null;
        fixedEv.forEach(function (e) {
          if (e.at >= units) return;
          var d = Math.min(e.d, units - e.at);
          var ps = splitLen(e.at, d, tinfo);
          ps.forEach(function (p, pi) {
            var dd = durOf(p.d, sub), note, k = e.k || 's';
            if (k === 'r') {
              note = new F.StaveNote({ keys: ['b/4'], duration: dd.dur + 'r', dots: dd.dots, clef: 'treble' });
            } else if (k === 'n' && e.p && e.p.length) {
              var keys = e.p.slice().sort(function (a, b2) { return W.pitchMidi(a) - W.pitchMidi(b2); }).map(function (pp) {
                var m = /^([A-G])([#b]?)(-?\d)$/.exec(pp.replace('♯', '#').replace('♭', 'b'));
                return m ? (m[1].toLowerCase() + m[2] + '/' + m[3]) : 'b/4';
              });
              note = new F.StaveNote({ keys: keys, duration: dd.dur, dots: dd.dots, clef: 'treble', stem_direction: 1, auto_stem: false });
            } else {
              note = new F.StaveNote({ keys: ['b/4'], duration: dd.dur, type: 's', dots: dd.dots, clef: 'treble', stem_direction: 1, auto_stem: false });
              if (k === 's' && p.d * 16 / sub >= 4) note.drawStem = function () {};
            }
            for (var di = 0; di < dd.dots; di++) { try { F.Dot.buildAndAttach([note], { all: true }); } catch (er) { /* ignore */ } }
            note.setStyle({ fillStyle: th.ink, strokeStyle: th.ink });
            notes.push(note);
            var piece = { at: p.at, d: p.d, note: note, ev: e, first: pi === 0, last: pi === ps.length - 1, k: k };
            pieces.push(piece);
            if (k !== 'r' && lastRealPiece && lastRealPiece.tieNext) { allTies.push([lastRealPiece.note, note, lastRealPiece.k]); lastRealPiece.tieNext = false; }
            if (k !== 'r') {
              if (pi > 0) allTies.push([pieces[pieces.length - 2].note, note, k]);
              if (pi === ps.length - 1 && e.tie) piece.tieNext = true;
              lastRealPiece = piece;
            }
          });
        });
        // a tie that runs out of the bar goes to the first note of the next bar (drawn open to the right)
        if (lastRealPiece && lastRealPiece.tieNext) allTies.push([lastRealPiece.note, null, lastRealPiece.k]);
      }
      var voice = new F.Voice({ num_beats: units, beat_value: sub }).setMode(F.Voice.Mode.SOFT);
      voice.addTickables(notes);
      try { F.Accidental.applyAccidentals([voice], vfKey(rb.key)); } catch (e2) { /* ignore */ }
      pieces.forEach(function (p) {
        if (p.k === 's' || p.k === 'h') p.note.modifiers = p.note.modifiers.filter(function (m) { return m.getCategory() !== F.Accidental.CATEGORY; });
      });
      var beamGroups = [new F.Fraction(Math.round(bu), sub)];
      var beams = [];
      try {
        beams = F.Beam.generateBeams(notes.filter(function (n) { return !(n instanceof F.GhostNote); }), { groups: beamGroups, stem_direction: 1, maintain_stem_directions: true });
      } catch (e3) { beams = []; }
      var fmt = new F.Formatter();
      fmt.joinVoices([voice]);
      var noteW = Math.max(30, endX - startX - 14);
      fmt.format([voice], noteW, { align_rests: false });
      voice.setStave(stave);
      // shift to the note start
      voice.draw(ctx, stave);
      beams.forEach(function (bm) { bm.setStyle({ fillStyle: th.ink, strokeStyle: th.ink }); bm.setContext(ctx).draw(); });

      // x positions per piece
      pieces.forEach(function (p) {
        var n = p.note, hb, he;
        try { hb = n.getNoteHeadBeginX(); he = n.getNoteHeadEndX(); } catch (e4) { hb = n.getAbsoluteX(); he = hb + 12; }
        p.x = hb; p.cx = (hb + he) / 2;
      });
      function xAtUnit(u) {
        for (var i = 0; i < pieces.length; i++) {
          var p = pieces[i];
          if (u >= p.at && u < p.at + p.d) {
            if (u === p.at) return { x: p.x, cx: p.cx };
            var nx = pieces[i + 1] ? pieces[i + 1].x : endX - 6;
            return { x: p.x + (nx - p.x) * (u - p.at) / p.d, cx: 0 };
          }
        }
        return { x: startX + 4, cx: 0 };
      }
      b._x = null;

      /* --- % repeat --- */
      if (b.rep === '%') {
        glyph((startX + endX) / 2 - 12, yTop + 2 * sp + 7, 'repeat1Bar', 36, th.ink);
        var ghostChords = [];
      }

      /* --- chord layer --- */
      var evAtU = {};
      (b.ev || []).forEach(function (e2) { evAtU[e2.at] = e2; });
      (b.ch || []).slice().sort(function (a, b2) { return a.at - b2.at; }).forEach(function (c) {
        var pos2 = xAtUnit(c.at), x2 = pos2.x - 4;
        var chordY = yTop - sp * 1.5 + 2 - ((evAtU[c.at] && evAtU[c.at].a) || (c.at === 0 && b.ferm) ? 17 : 0);
        var t = chordEl(x2, chordY, c.c, th.ink, size, rb.key);
        var bb;
        try { bb = t.getBBox(); } catch (e5) { bb = { width: chordWidth(c.c, size, opts) }; }
        var wdt = bb.width || chordWidth(c.c, size, opts);
        var prev = placed[placed.length - 1];
        if (prev && x2 < prev.x + prev.w + 9) { x2 = prev.x + prev.w + 9; t.setAttribute('x', x2.toFixed(1)); }
        placed.push({ x: x2, w: wdt });
      });

      /* --- articulations --- */
      pieces.forEach(function (p) {
        if (!p.ev || !p.ev.a || !p.first || p.k === 'r') return;
        var ay = yTop - sp * 2.5;
        artic(p.cx, ay, p.ev.a, th.hit);
      });
      if (b.ferm) {
        var f0 = pieces.filter(function (p) { return p.k !== 'r'; })[0] || pieces[0];
        glyph((f0 ? f0.cx : startX) - 11, yTop - sp * 0.7, 'fermataAbove', 38, th.ink);
      }

      /* --- bar-level marks --- */
      var padL = Math.max(startX, X.x + 6);
      if (b.mark && b.mark !== '*' || (b.mark === '*' && b.label)) {
        var mx = X.x + 1, my = yTop - sp * 6.7;
        var mk = b.mark === '*' ? '' : b.mark;
        var bw0 = mk ? sp * 2.8 : 0;
        if (mk) {
          textLayer.appendChild(el('rect', { x: mx, y: my, width: bw0, height: sp * 2.8, rx: 3, fill: 'none', stroke: th.ink, 'stroke-width': 1.6 }));
          text(mx + bw0 / 2, my + sp * 2.0, mk, { size: sp * 1.95, weight: 700, family: "'Inter Tight', Inter, sans-serif", anchor: 'middle' });
        }
        if (b.label) text(mx + bw0 + (mk ? 7 : 0), my + sp * 2.0, b.label.toUpperCase(), { size: sp * 1.35, weight: 600, fill: th.mut, ls: '0.06em' });
      }
      if (b.who) {
        text(X.x + (bi === 0 ? L.prefix - 2 : 6), yTop - sp * 4.3, b.who, { size: sp * 1.25, weight: 700, fill: th.hit, style: 'italic' });
      }
      var sgX = b.mark ? X.x + 150 : startX + 2, sgY = b.mark ? yTop - sp * 4.3 : yTop - sp * 5.7;
      if (b.segno) glyph(sgX, sgY, 'segno', 26, th.ink);
      if (b.coda) glyph(sgX, sgY, 'coda', 26, th.ink);
      if (b.fine) text(X.x + X.w - 6, yTop - sp * 3.4, 'Fine', { size: sp * 1.5, weight: 700, style: 'italic', anchor: 'end', family: "'Noto Serif', Georgia, serif" });
      if (b.ds === 'To Coda') text(X.x + X.w - 6, yTop - sp * 3.4, 'To Coda', { size: sp * 1.4, weight: 700, style: 'italic', anchor: 'end', family: "'Noto Serif', Georgia, serif" });
      else if (b.ds) text(X.x + X.w - 14, yTop + 4 * sp + sp * 2.6, b.ds, { size: sp * 1.5, weight: 700, style: 'italic', anchor: 'end', family: "'Noto Serif', Georgia, serif" });
      var belowY = yTop + 4 * sp + sp * 2.7;
      var dx = padL + 2;
      if (b.dyn) {
        var dt = serif(dx, belowY, b.dyn, sp * 1.95);
        var dw = b.dyn.length * sp * 1.05 + 4;
        dx += dw + 4;
        if (b.hairpin) {
          var hx1 = dx, hx2 = X.x + X.w - 8, hy = belowY - sp * 0.7;
          var open = b.hairpin === '<';
          textLayer.appendChild(el('path', { d: open ? ('M' + hx1 + ',' + hy + ' L' + hx2 + ',' + (hy - 5) + ' M' + hx1 + ',' + hy + ' L' + hx2 + ',' + (hy + 5)) : ('M' + hx1 + ',' + (hy - 5) + ' L' + hx2 + ',' + hy + ' M' + hx1 + ',' + (hy + 5) + ' L' + hx2 + ',' + hy), fill: 'none', stroke: th.ink, 'stroke-width': 1.1 }));
        }
      } else if (b.hairpin) {
        var hx1b = padL + 4, hx2b = X.x + X.w - 8, hyb = belowY - sp * 0.7, op = b.hairpin === '<';
        textLayer.appendChild(el('path', { d: op ? ('M' + hx1b + ',' + hyb + ' L' + hx2b + ',' + (hyb - 5) + ' M' + hx1b + ',' + hyb + ' L' + hx2b + ',' + (hyb + 5)) : ('M' + hx1b + ',' + (hyb - 5) + ' L' + hx2b + ',' + hyb + ' M' + hx1b + ',' + (hyb + 5) + ' L' + hx2b + ',' + hyb), fill: 'none', stroke: th.ink, 'stroke-width': 1.1 }));
        dx = hx2b;
      }
      if (b.text) {
        var tx = b.hairpin ? Math.max(dx + 8, X.x + X.w * 0.55) : dx + (b.dyn ? 4 : 0);
        text(tx, belowY, b.text, { size: sp * 1.35, weight: 600, fill: th.hit });
      }
      if (b.repEnd && b.times > 1 && !b.text) {
        text(X.x + X.w - 12, belowY, 'Play ' + b.times + '×', { size: sp * 1.3, weight: 600, fill: th.hit, anchor: 'end' });
      }
      if (b.vamp) text(X.x + X.w - 12, belowY, 'Vamp till cue', { size: sp * 1.3, weight: 600, fill: th.hit, anchor: 'end' });
      if (rb.tempo && bi === 0 && rb.i > 0 && b.tempo) text(X.x + 4, yTop - sp * 2.9, '♩ = ' + b.tempo, { size: sp * 1.35, weight: 600, fill: th.mut });
      endingRuns.push({ rb: rb, X: X });

      // tap target and highlights
      var hl = el('rect', { x: barInfo[rb.i].x + 1, y: yTop - sp * 3.6, width: Math.max(4, barInfo[rb.i].w - 2), height: sp * 9.2 + (L.hasBelow ? 12 : 0), rx: 4, fill: 'transparent', stroke: 'none', 'data-bar': rb.i, class: 'bar-hl' });
      underLayer.appendChild(hl);
      barInfo[rb.i].hl = hl;
      var tap = el('rect', { x: barInfo[rb.i].x, y: yTop - L.top + 2, width: barInfo[rb.i].w, height: L.h - 4, fill: 'transparent', stroke: 'none', 'data-bar': rb.i, class: 'bar-tap' });
      hitLayer.appendChild(tap);
    });

    // volta brackets (runs of bars with the same ending)
    var runStart = null;
    for (var q = 0; q <= endingRuns.length; q++) {
      var e = endingRuns[q], pe = endingRuns[q - 1];
      if (runStart != null && (!e || e.rb.bar.ending !== pe.rb.bar.ending)) {
        var xa = endingRuns[runStart].X, xb = pe.X;
        var xs0 = xa.x + (runStart === 0 ? L.prefix - 4 : 4), xe0 = xb.x + xb.w - 2;
        var vy = yTop - sp * (L.hasArt ? 6.4 : 4.3);
        textLayer.appendChild(el('path', { d: 'M' + xs0 + ',' + (vy + sp * 1.4) + ' V' + vy + ' H' + xe0, fill: 'none', stroke: th.ink, 'stroke-width': 1.2 }));
        text(xs0 + 5, vy + sp * 1.25, endingRuns[runStart].rb.bar.ending, { size: sp * 1.3, weight: 600 });
        runStart = null;
      }
      if (e && e.rb.bar.ending && runStart == null) runStart = q;
    }
  });

  // ties
  allTies.forEach(function (t) {
    try {
      var tie = new F.StaveTie({ first_note: t[0], last_note: t[1] || undefined, first_indices: [0], last_indices: [0] });
      tie.setStyle({ strokeStyle: th.ink, fillStyle: th.ink });
      tie.setContext(ctx).draw();
    } catch (e) { /* skip a tie we cannot draw */ }
  });

  svg.appendChild(textLayer);
  svg.appendChild(hitLayer);

  var handle = {
    svg: svg, plan: P, bars: barInfo, lines: lineInfo, scale: s, height: Hd, width: Wd,
    setBarFill: function (from, to, color) {
      Object.keys(barInfo).forEach(function (k) {
        var i = Number(k), on = from != null && i >= from && i <= to;
        barInfo[k].hl.setAttribute('fill', on ? color : 'transparent');
      });
    },
    hilite: function (idx, color) { Object.keys(barInfo).forEach(function (k) { if (barInfo[k].mode === 'sel' || barInfo[k].mode === 'play') return; }); },
    setSelected: function (i) {
      Object.keys(barInfo).forEach(function (k) { barInfo[k].sel = Number(k) === i; paint(Number(k)); });
    },
    setLoop: function (from, to) { handle.loop = from == null ? null : [from, to]; Object.keys(barInfo).forEach(function (k) { paint(Number(k)); }); },
    setPlaying: function (i) { handle.playing = i; Object.keys(barInfo).forEach(function (k) { paint(Number(k)); }); },
    barAt: function (i) { return barInfo[i] || null; },
    // thin moving line inside the playing bar. frac 0 to 1 across the bar. i null hides it.
    setBeat: function (i, frac) {
      var b = i == null ? null : barInfo[i];
      if (!b) { if (beatLine) beatLine.setAttribute('visibility', 'hidden'); return; }
      if (!beatLine) { beatLine = el('rect', { width: 2, rx: 1, fill: th.acc, 'pointer-events': 'none', class: 'beat-line' }); svg.appendChild(beatLine); }
      var x0 = b.noteX != null ? b.noteX : b.x, x1 = b.right != null ? b.right - 4 : b.x + b.w;
      beatLine.setAttribute('x', (x0 + Math.max(0, Math.min(1, frac || 0)) * (x1 - x0)).toFixed(1));
      beatLine.setAttribute('y', b.hl.getAttribute('y')); beatLine.setAttribute('height', b.hl.getAttribute('height'));
      beatLine.setAttribute('visibility', 'visible');
    },
    lineOf: function (i) { var b = barInfo[i]; return b ? lineInfo[b.line] : null; }
  };
  var beatLine = null;
  function paint(i) {
    var b = barInfo[i]; if (!b) return;
    var fill = 'transparent', op = 1;
    if (handle.loop && i >= handle.loop[0] && i <= handle.loop[1]) fill = th.accSoft;
    if (handle.playing === i) fill = th.accSoft === 'rgba(142,174,255,0.14)' ? 'rgba(142,174,255,0.28)' : '#D6DFFB';
    if (b.sel) fill = th.accSoft === 'rgba(142,174,255,0.14)' ? 'rgba(142,174,255,0.24)' : '#DCE4FC';
    b.hl.setAttribute('fill', fill);
  }
  if (opts.onBar) {
    hitLayer.addEventListener('click', function (e) {
      var t = e.target.getAttribute && e.target.getAttribute('data-bar');
      if (t != null) opts.onBar(Number(t), e);
    });
  }
  if (opts.selected != null) handle.setSelected(opts.selected);
  if (opts.loop) handle.setLoop(opts.loop[0], opts.loop[1]);
  return handle;
}

/* ---------- plain chord grid, used when the notation library fails and in "Chord grid" view ---------- */
function renderGrid(host, sheet, opts) {
  opts = opts || {};
  host.innerHTML = '';
  var rs = W.resolveBars(sheet), wrap = document.createElement('div');
  wrap.className = 'cgrid';
  var secs = [];
  if (opts.ranges && opts.ranges.length) opts.ranges.forEach(function (r) { secs.push({ from: r[0], to: r[1] }); });
  else secs.push({ from: 0, to: rs.length - 1 });
  var per = opts.barsPerLine || 4, barRefs = {};
  secs.forEach(function (sec) {
    var row = null, n = 0;
    for (var i = sec.from; i <= sec.to; i++) {
      var rb = rs[i]; if (!rb) continue;
      if (!row || n >= per || rb.bar.mark) {
        if (rb.bar.mark || !row) {
          var head = document.createElement('div'); head.className = 'cg-head';
          if (rb.bar.mark) head.innerHTML = '<b>' + (rb.bar.mark === '*' ? '' : rb.bar.mark) + '</b> <span></span>';
          if (rb.bar.label) head.querySelector('span').textContent = rb.bar.label;
          if (rb.bar.mark) wrap.appendChild(head);
        }
        row = document.createElement('div'); row.className = 'cg-row'; wrap.appendChild(row); n = 0;
      }
      var cell = document.createElement('button');
      cell.className = 'cg-bar'; cell.setAttribute('data-bar', i); cell.type = 'button';
      var hits = (rb.bar.ev || []).filter(function (e) { return e.k === 'h' || e.a; }).length;
      var inner = '';
      if (rb.bar.rep === '%') inner = '<span class="cg-ch">%</span>';
      (rb.bar.ch || []).forEach(function (c) {
        var p = W.chordParts(c.c);
        var ev = (rb.bar.ev || []).filter(function (e) { return e.at === c.at; })[0];
        var mark = ev && ev.a ? '<i class="cg-a">' + ev.a + '</i>' : (ev && ev.k === 'h' ? '<i class="cg-a">!</i>' : '');
        var txt = opts.nashville ? W.nashSym(c.c, rb.key) : (p.nc ? 'N.C.' : p.root + p.acc + p.minor + (p.sup ? '<sup>' + p.sup + '</sup>' : '') + (p.bass ? '/' + p.bass + p.bassAcc : ''));
        inner += '<span class="cg-ch">' + mark + txt + '</span>';
      });
      if (rb.bar.text) inner += '<small>' + rb.bar.text.replace(/</g, '&lt;') + '</small>';
      cell.innerHTML = inner || '<span class="cg-ch mu">·</span>';
      if (rb.bar.repStart) cell.classList.add('rs');
      if (rb.bar.repEnd) cell.classList.add('re');
      if (opts.onBar) cell.addEventListener('click', function (e) { opts.onBar(Number(e.currentTarget.getAttribute('data-bar')), e); });
      row.appendChild(cell); n++; barRefs[i] = cell;
    }
  });
  host.appendChild(wrap);
  return {
    bars: {}, lines: [], height: wrap.scrollHeight, grid: true,
    setSelected: function (i) { Object.keys(barRefs).forEach(function (k) { barRefs[k].classList.toggle('sel', Number(k) === i); }); },
    setLoop: function (a, b) { Object.keys(barRefs).forEach(function (k) { barRefs[k].classList.toggle('loop', a != null && Number(k) >= a && Number(k) <= b); }); },
    setPlaying: function (i) { Object.keys(barRefs).forEach(function (k) { barRefs[k].classList.toggle('play', Number(k) === i); }); },
    setBeat: function () { },
    barEl: function (i) { return barRefs[i]; }
  };
}

window.WNote = { load: loadVF, render: render, plan: plan, renderGrid: renderGrid, theme: theme, vfKey: vfKey, THEMES: THEMES, splitLen: splitLen };
})();
