/* Worship follow: seek helpers for the transport, and a scrolling waveform window (WaveView) that follows playback. */
(function () {
'use strict';
var WS = window.WS, W = window.WCore;
var h = WS.h;

/* ---------- seek helpers ---------- */
// loop is [startSec, endSec] or null. Seeking inside a loop keeps the loop: back stops at the loop start, forward wraps inside it.
WS.seekBy = function (el, d, loop) {
  if (!el) return null;
  var dur = el.duration, cur = el.currentTime || 0, t = cur + d;
  if (loop && cur >= loop[0] - 0.05 && cur < loop[1] + 0.05 && loop[1] > loop[0]) {
    var len = loop[1] - loop[0];
    if (d < 0) t = Math.max(loop[0], t);
    else if (t >= loop[1]) t = loop[0] + ((t - loop[0]) % len);
  }
  t = Math.max(0, t);
  if (isFinite(dur) && dur > 0) t = Math.min(dur, t);
  el.currentTime = t;
  return t;
};
// To the start. With a loop the first tap goes to the loop start, a second tap within 1 s goes to the song start.
WS.toStart = function (el, loop, memo) {
  if (!el) return null;
  var now = Date.now(), t = 0;
  if (loop && !(memo.last && now - memo.last < 1000)) t = loop[0];
  memo.last = now;
  el.currentTime = t;
  return t;
};

/* ---------- WaveView ---------- */
var LEVELS = [4, 8, 16, 32, 64, 0]; // bars in view, 0 = the whole song
var TILE = 1024;

/* o: { host, strip, nums, ov, data(): {grid, nBars, secs, sel, loop, peaks, dur, pseudoSec},
        secColor(k), isPlaying(), onTap({bar, time}), onSeek(t), onFollow(on), zoomKey } */
WS.WaveView = function (o) {
  var V = { follow: true, scroll: 0, level: WS.lsGet(o.zoomKey || 'ws-wzoom', WS.isPhone() ? 8 : 16), playT: null };
  if (LEVELS.indexOf(V.level) < 0) V.level = 16;
  var host = o.host;
  var world = h('div', { style: { position: 'absolute', left: '0', top: '0', height: '100%', willChange: 'transform' } });
  host.insertBefore(world, host.firstChild);
  var selEl = h('div', { style: { position: 'absolute', top: '0', bottom: '0', display: 'none', pointerEvents: 'none' } });
  var loopEl = h('div', { class: 'lp', style: { display: 'none', position: 'absolute', top: '0', bottom: '0', background: 'var(--accs)', borderLeft: '2px solid var(--acc)', borderRight: '2px solid var(--acc)', boxSizing: 'border-box', pointerEvents: 'none' } });
  var phEl = h('div', { class: 'ph', style: { display: 'none', position: 'absolute', top: '0', bottom: '0', left: '0', width: '2px', background: 'var(--hit)', pointerEvents: 'none', zIndex: '2', willChange: 'transform' } });
  world.appendChild(selEl); world.appendChild(loopEl);
  host.appendChild(phEl);
  var stripW = null, numsW = null, ovSegs = null, ovView = null, ovPh = null;
  if (o.strip) { stripW = h('div', { style: { position: 'absolute', left: '0', top: '0', height: '100%', willChange: 'transform' } }); o.strip.style.overflow = 'hidden'; o.strip.appendChild(stripW); }
  if (o.nums) { numsW = h('div', { style: { position: 'absolute', left: '0', top: '0', height: '100%', willChange: 'transform' } }); o.nums.style.overflow = 'hidden'; o.nums.appendChild(numsW); }
  if (o.ov) {
    ovSegs = h('div', { style: { position: 'absolute', left: '0', right: '0', top: '50%', height: '12px', marginTop: '-6px', borderRadius: '4px', background: 'var(--seg)', overflow: 'hidden' } });
    ovView = h('div', { style: { position: 'absolute', top: '50%', height: '18px', marginTop: '-9px', border: '2px solid var(--acc)', borderRadius: '5px', pointerEvents: 'none', boxSizing: 'border-box' } });
    ovPh = h('div', { style: { position: 'absolute', top: '50%', height: '18px', marginTop: '-9px', width: '2px', background: 'var(--hit)', pointerEvents: 'none' } });
    o.ov.style.position = 'relative'; o.ov.appendChild(ovSegs); o.ov.appendChild(ovView); o.ov.appendChild(ovPh);
  }

  /* geometry: bar-float <-> time, and world pixels */
  var G = null, sig = '', tiles = {};
  function geom() {
    var d = o.data(), g = d.grid && d.grid.b && d.grid.b.length > 1 ? d.grid : null, wd = host.clientWidth || 780, hh = host.clientHeight || 68;
    var r = { d: d, g: g, wd: wd, hh: hh, barMode: !!g || !d.dur };
    if (g) {
      var n = g.b.length, s0 = g.b[1] - g.b[0], sl = g.b[n - 1] - g.b[n - 2] || s0;
      r.bf = function (t) {
        if (t <= g.b[0]) return (t - g.b[0]) / s0;
        if (t >= g.end) return n + (t - g.end) / sl;
        var x = W.gridBarAt(g, t); return x.bar + x.frac;
      };
      r.tOf = function (b) {
        if (b < 0) return g.b[0] + b * s0;
        if (b >= n) return g.end + (b - n) * sl;
        var i = Math.floor(b); return W.gridTimeAt(g, i, b - i);
      };
      r.from = Math.min(0, Math.floor(r.bf(0) * 4) / 4);
      r.to = Math.max(n, d.dur ? r.bf(d.dur) : 0, d.nBars || 0);
    } else if (d.dur) {
      var ps = d.pseudoSec || 2.5;
      r.bf = function (t) { return t / ps; }; r.tOf = function (b) { return b * ps; };
      r.from = 0; r.to = d.dur / ps;
    } else {
      r.bf = function (t) { return t; }; r.tOf = function (b) { return null; };
      r.from = 0; r.to = Math.max(1, d.nBars || 1);
    }
    r.span = Math.max(1, r.to - r.from);
    var winBars = V.level || r.span;
    winBars = Math.min(winBars, r.span);
    r.pxBar = wd / winBars;
    r.worldW = Math.ceil(r.span * r.pxBar);
    r.maxScroll = Math.max(0, r.worldW - wd);
    r.x = function (b) { return (b - r.from) * r.pxBar; };
    r.barAtX = function (x) { return (x / r.pxBar) + r.from; };
    return r;
  }
  function gridKey(g) { return g && g.b && g.b.length ? g.b.length + ':' + g.b[0] + ':' + g.b[g.b.length >> 1] + ':' + g.end : ''; }

  function clamp(x) { return Math.max(0, Math.min(G ? G.maxScroll : 0, x)); }
  function applyScroll() {
    var tr = 'translate3d(' + (-V.scroll) + 'px,0,0)';
    world.style.transform = tr;
    if (stripW) stripW.style.transform = tr;
    if (numsW) numsW.style.transform = tr;
    ensureTiles();
    placePh();
    placeOv();
  }
  V.setScroll = function (x) { if (!G) return; var c = clamp(x); if (c !== V.scroll) { V.scroll = c; applyScroll(); } };

  /* canvas tiles, made only for what is near the screen */
  function drawTile(k, cv) {
    var x0 = k * TILE, wd = Math.min(TILE, G.worldW - x0), hh = G.hh, dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(wd * dpr)); cv.height = Math.round(hh * dpr);
    cv.style.width = wd + 'px'; cv.style.height = hh + 'px';
    var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, wd, hh);
    var cs = getComputedStyle(document.documentElement);
    var line = cs.getPropertyValue('--line').trim() || '#ddd', ink = cs.getPropertyValue('--wave').trim() || '#2C2F37';
    var d = G.d, peaks = d.peaks, N = peaks ? peaks.length : 0;
    if (peaks && d.dur) {
      c.fillStyle = ink; c.globalAlpha = 0.78;
      var step = 3.5, cols = Math.ceil(wd / step);
      for (var i = 0; i < cols; i++) {
        var xa = x0 + i * step, xb = xa + step;
        var ta = G.tOf(G.barAtX(xa)), tb = G.tOf(G.barAtX(xb));
        if (ta == null || tb < 0 || ta > d.dur) continue;
        var pa = Math.max(0, Math.min(N - 1, Math.floor(ta / d.dur * N))), pb = Math.max(pa, Math.min(N - 1, Math.floor(tb / d.dur * N)));
        var mx = 0; for (var q = pa; q <= pb; q++) if (peaks[q] > mx) mx = peaks[q];
        var amp = Math.max(0.02, mx) * (hh - 18);
        c.fillRect(i * step, (hh - amp) / 2, Math.max(1.5, step - 1.5), amp);
      }
      c.globalAlpha = 1;
    }
    if (G.barMode) {
      // bar lines, thinned out when the bars are narrow
      var every = G.pxBar >= 16 ? 1 : G.pxBar >= 8 ? 2 : G.pxBar >= 4 ? 4 : 8;
      var bA = Math.max(0, Math.ceil(G.barAtX(x0))), bB = Math.floor(G.barAtX(x0 + wd));
      for (var b = bA; b <= bB; b++) {
        if (b % every) continue;
        var x = Math.round(G.x(b) - x0) + 0.5;
        c.strokeStyle = line; c.globalAlpha = b % 4 === 0 ? 1 : 0.55;
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, hh); c.stroke();
      }
      c.globalAlpha = 1;
    } else {
      // no beat grid: a tick every few seconds
      var ps = (G.d.pseudoSec || 2.5), tickBars = Math.max(1, Math.round(4)), b0 = Math.max(0, Math.ceil(G.barAtX(x0))), b1 = Math.floor(G.barAtX(x0 + wd));
      for (var b2 = b0; b2 <= b1; b2++) { if (b2 % tickBars) continue; var xx = Math.round(G.x(b2) - x0) + 0.5; c.strokeStyle = line; c.globalAlpha = 0.6; c.beginPath(); c.moveTo(xx, 0); c.lineTo(xx, hh); c.stroke(); }
      c.globalAlpha = 1;
    }
  }
  function ensureTiles() {
    if (!G) return;
    var kA = Math.max(0, Math.floor((V.scroll - TILE * 0.6) / TILE)), kB = Math.min(Math.floor((G.worldW - 1) / TILE), Math.floor((V.scroll + G.wd + TILE * 0.6) / TILE));
    Object.keys(tiles).forEach(function (k) { if (Number(k) < kA - 1 || Number(k) > kB + 1) { world.removeChild(tiles[k]); delete tiles[k]; } });
    for (var k = kA; k <= kB; k++) {
      if (tiles[k]) continue;
      var cv = document.createElement('canvas');
      cv.style.cssText = 'position:absolute;top:0;left:' + (k * TILE) + 'px';
      world.insertBefore(cv, world.firstChild);
      tiles[k] = cv; drawTile(k, cv);
    }
  }
  function clearTiles() { Object.keys(tiles).forEach(function (k) { world.removeChild(tiles[k]); delete tiles[k]; }); }

  /* overlays in world coordinates */
  function labelStep() { var s = 1; while (s * G.pxBar < 26 && s < 64) s *= 2; return s; }
  function drawOverlays() {
    var d = G.d;
    world.style.width = G.worldW + 'px';
    // selected bar (only shown while there is no waveform)
    if (G.barMode && d.sel != null && !d.peaks) { selEl.style.display = 'block'; selEl.style.left = G.x(d.sel) + 'px'; selEl.style.width = Math.max(4, G.pxBar) + 'px'; selEl.style.background = 'var(--accs)'; }
    else selEl.style.display = 'none';
    if (G.barMode && d.loop) { loopEl.style.display = 'block'; loopEl.style.left = G.x(d.loop[0]) + 'px'; loopEl.style.width = Math.max(4, G.x(d.loop[1] + 1) - G.x(d.loop[0])) + 'px'; }
    else loopEl.style.display = 'none';
    if (stripW) {
      WS.clear(stripW); stripW.style.width = G.worldW + 'px';
      if (G.barMode) (d.secs || []).forEach(function (s, k) {
        var x0 = G.x(s.from), x1 = G.x(s.to + 1);
        stripW.appendChild(h('div', { class: 'sc', style: { left: x0 + 'px', width: Math.max(10, x1 - x0 - 3) + 'px', background: o.secColor ? o.secColor(k) : '' }, text: s.label || s.mark || 'Start', onclick: function () { if (o.onSection) o.onSection(s); } }));
      });
    }
    if (numsW) {
      WS.clear(numsW); numsW.style.width = G.worldW + 'px';
      if (G.barMode) {
        var st = labelStep(), nb = d.nBars || 0;
        for (var b = 0; b < nb; b += 1) { if (b % st) continue; var sp = h('span', { text: String(b + 1), style: { left: (G.x(b) + 3) + 'px' } }); if (b === d.sel) { sp.style.color = 'var(--acc)'; sp.style.fontWeight = '700'; } numsW.appendChild(sp); }
      } else {
        var every = Math.max(1, Math.round(26 / G.pxBar)) * 4;
        for (var b3 = 0; b3 <= G.to; b3 += every) { var tt = G.tOf(b3); numsW.appendChild(h('span', { text: WS.fmtTime(tt), style: { left: (G.x(b3) + 3) + 'px' } })); }
      }
    }
    if (o.ov) {
      WS.clear(ovSegs);
      if (G.barMode) (d.secs || []).forEach(function (s, k) {
        var a = (s.from - G.from) / G.span * 100, w = (s.to + 1 - s.from) / G.span * 100;
        ovSegs.appendChild(h('div', { style: { position: 'absolute', top: 0, bottom: 0, left: a + '%', width: 'calc(' + w + '% - 1px)', background: o.secColor ? o.secColor(k) : 'var(--seg)', opacity: 0.9 } }));
      });
    }
  }
  function placePh() {
    if (!G || V.playT == null) { phEl.style.display = 'none'; return; }
    var x = G.x(G.bf(V.playT)) - V.scroll;
    if (x < -2 || x > G.wd + 2) { phEl.style.display = 'none'; return; }
    phEl.style.display = 'block'; phEl.style.transform = 'translate3d(' + x + 'px,0,0)';
  }
  function placeOv() {
    if (!o.ov || !G) return;
    var W0 = o.ov.clientWidth || 1, s = G.worldW || 1;
    ovView.style.left = (V.scroll / s * W0) + 'px'; ovView.style.width = Math.max(8, Math.min(W0, G.wd / s * W0)) + 'px';
    if (V.playT != null) { ovPh.style.display = 'block'; ovPh.style.left = Math.max(0, Math.min(W0 - 2, G.x(G.bf(V.playT)) / s * W0)) + 'px'; } else ovPh.style.display = 'none';
  }

  /* public */
  V.refresh = function (force) {
    var g0 = G, n = geom();
    var key = [n.wd, n.hh, Math.round(n.pxBar * 100), n.from, Math.round(n.span * 100), n.d.nBars, n.d.dur, n.d.peaks ? n.d.peaks.length : 0, gridKey(n.g), document.documentElement.getAttribute('data-theme') || '', n.barMode].join('|');
    // keep the same moment in the middle of the view when the zoom or the width changes
    var centre = null;
    if (g0 && key !== sig && g0.pxBar !== n.pxBar) centre = g0.barAtX(V.scroll + g0.wd * 0.3);
    G = n;
    if (key !== sig || force) { sig = key; clearTiles(); }
    if (centre != null) V.scroll = clamp(n.x(centre) - n.wd * 0.3);
    else V.scroll = clamp(V.scroll);
    drawOverlays(); applyScroll();
  };
  V.level_ = function () { return V.level; };
  V.zoom = function (dir) {
    var i = LEVELS.indexOf(V.level), j = Math.max(0, Math.min(LEVELS.length - 1, i + dir));
    // "all" sits after 64; zooming in from "all" goes back to 64
    if (j === i) return;
    manual(false);
    V.level = LEVELS[j]; WS.lsSet(o.zoomKey || 'ws-wzoom', V.level);
    var centreBar = G ? G.barAtX(V.scroll + G.wd * 0.3) : 0;
    V.refresh();
    if (V.follow && V.playT != null && o.isPlaying && o.isPlaying()) V.tick(V.playT, true); else V.setScroll(G.x(centreBar) - G.wd * 0.3);
    if (o.onZoom) o.onZoom();
  };
  V.zoomLabel = function () { return V.level ? V.level + ' bars' : 'All'; };
  V.canZoom = function (dir) { var i = LEVELS.indexOf(V.level), j = i + dir; return j >= 0 && j < LEVELS.length; };
  // keep a bar in view (used when a bar is picked somewhere else)
  V.reveal = function (bar) {
    if (!G || !G.barMode) return;
    var x0 = G.x(bar), x1 = G.x(bar + 1);
    if (x0 < V.scroll || x1 > V.scroll + G.wd) V.setScroll(x0 - G.wd * 0.2);
  };
  V.setFollow = function (on) {
    on = !!on; var ch = V.follow !== on; V.follow = on;
    if (on && G && V.playT != null) V.setScroll(G.x(G.bf(V.playT)) - G.wd * 0.3);
    if (o.onFollow) o.onFollow(on, ch);
  };
  // called every frame (and on seeks). t in seconds.
  V.tick = function (t, playing) {
    V.playT = t;
    if (!G) return;
    var px = G.x(G.bf(t));
    if (V.follow && playing) V.setScroll(px - G.wd * 0.3);
    else if (V.follow && (px < V.scroll || px > V.scroll + G.wd)) V.setScroll(px - G.wd * 0.3);
    placePh(); placeOv();
  };
  V.clearPlayhead = function () { V.playT = null; placePh(); placeOv(); };
  V.destroy = function () { clearTiles(); };

  /* touch: drag to scroll, pinch to zoom, tap to pick */
  function manual() { if (o.isPlaying && o.isPlaying() && V.follow) V.setFollow(false); }
  var ptrs = {}, drag = null, pinch = null;
  function nPtr() { return Object.keys(ptrs).length; }
  host.addEventListener('pointerdown', function (e) {
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    try { host.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    if (nPtr() === 1) drag = { x0: e.clientX, y0: e.clientY, s0: V.scroll, moved: false };
    else if (nPtr() === 2) { var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) }; if (drag) drag.moved = true; }
  });
  host.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pinch && nPtr() === 2) {
      var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > pinch.d0 * 1.4) { V.zoom(-1); pinch.d0 = d; } else if (d < pinch.d0 * 0.7) { V.zoom(1); pinch.d0 = d; }
      return;
    }
    if (drag && nPtr() === 1) {
      var dx = e.clientX - drag.x0;
      if (!drag.moved && Math.abs(dx) > 7) { drag.moved = true; manual(); }
      if (drag.moved) V.setScroll(drag.s0 - dx);
    }
  });
  function up(e) {
    var p = ptrs[e.pointerId]; if (!p) return;
    delete ptrs[e.pointerId];
    if (nPtr() < 2) pinch = null;
    if (drag && nPtr() === 0) {
      var wasTap = !drag.moved && e.type === 'pointerup'; drag = null;
      if (wasTap) tap(e.clientX);
    }
  }
  host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
  host.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && G && G.maxScroll > 0) { e.preventDefault(); manual(); V.setScroll(V.scroll + e.deltaX); }
  }, { passive: false });
  function tap(cx) {
    if (!G) return;
    var r = host.getBoundingClientRect(), bf = G.barAtX(cx - r.left + V.scroll);
    manual();
    var nb = G.d.nBars || 0, bar = Math.max(0, Math.min(Math.max(0, nb - 1), Math.floor(bf)));
    var t = G.tOf(bf);
    if (o.onTap) o.onTap({ bar: G.barMode ? bar : null, time: t == null ? null : Math.max(0, t) });
  }
  if (o.ov) {
    o.ov.addEventListener('click', function (e) {
      if (!G) return;
      var r = o.ov.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), bf = G.from + f * G.span, t = G.tOf(bf);
      if (t != null && o.onSeek) o.onSeek(Math.max(0, t));
      V.setScroll(G.x(bf) - G.wd * 0.3);
    });
  }
  return V;
};
})();
