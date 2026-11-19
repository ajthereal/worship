/* Worship Live: set list rail, lead sheet fitted to the screen, page turns by half a page, edge taps and pedal keys. */
(function () {
'use strict';
var WS = window.WS, W = window.WCore;
var h = WS.h, add = WS.add, icon = WS.icon, ib = WS.ib, toast = WS.toast, S = WS.S;

function queueFor(v) {
  var set = v.setId ? WS.setById(v.setId) : null;
  if (set) return { set: set, items: WS.itemsOf(set) };
  var song = WS.songById(v.id);
  return { set: null, items: song ? [{ t: 'song', song: song.id, title: song.title, key: song.key }] : [] };
}

WS.viewLive = function (v) {
  var Q = queueFor(v), items = Q.items;
  var idx = Math.max(0, Math.min(items.length - 1, v.idx || 0));
  var phone = WS.isPhone();
  var settings = { bpl: WS.lsGet('ws-live-bpl', phone ? 2 : (window.innerWidth < 1000 ? 3 : 4)), scale: WS.lsGet('ws-live-scale', 1), grid: WS.lsGet('ws-live-grid', false), nash: WS.lsGet('ws-live-nash', false) };
  var full = {};               // item index -> show full for chorus-only
  var st = { top: 0, lines: [], handle: null, pages: 1, wl: null, wlTried: false };
  var root = h('div', { class: 'live' + (phone ? ' phone' : '') });
  var rail = h('aside', { class: 'rail', 'aria-label': 'Set list' });
  var main = h('div', { class: 'main' });
  var head = h('div', { class: 'lhead' });
  var roadmap = h('div', { class: 'roadmap' });
  var stage = h('div', { class: 'stage' });
  var inner = h('div', { class: 'inner' });
  var tools = h('div', { class: 'ltools' });
  stage.appendChild(inner);
  var zl = h('button', { class: 'zone l', type: 'button', 'aria-label': 'Previous page or song', onclick: function () { turn(-1); } });
  var zr = h('button', { class: 'zone r', type: 'button', 'aria-label': 'Next page or song', onclick: function () { turn(1); } });
  stage.appendChild(zl); stage.appendChild(zr);
  var hint = h('div', { class: 'pagehint' }); stage.appendChild(hint);
  add(main, head, roadmap, stage, tools);
  add(root, rail, main);

  function curItem() { return items[idx]; }
  function curSong() { var it = curItem(); return it && it.t === 'song' ? WS.songById(it.song) : null; }

  function drawRail() {
    WS.clear(rail);
    var set = Q.set;
    add(rail, h('div', { class: 'rh' }, h('small', { text: set && set.date ? W.fmtDate(set.date) : '' }), h('b', { text: set ? set.name : (curSong() ? curSong().title : 'Live') })));
    var n = 0;
    items.forEach(function (it, i) {
      if (it.t === 'song') n++;
      var on = i === idx;
      add(rail, h('button', { class: 'ri' + (on ? ' on' : '') + (it.t === 'cue' ? ' cue' : ''), type: 'button', onclick: function () { goto(i); } },
        h('span', { class: 'n', text: it.t === 'song' ? String(n) : '' }), h('span', { class: 't', text: it.t === 'cue' ? it.text : WS.itemTitle(it) }),
        h('span', { class: 'k', text: it.t === 'cue' ? (it.trans && it.trans.length < 9 ? it.trans : '') : keyShort(it) })));
    });
    var song = curSong(), it = curItem();
    if (song && song.patch) add(rail, h('div', { class: 'box' }, h('span', { class: 'lb', text: 'Sound' }), song.patch));
    var next = items[idx + 1];
    if (it && it.trans) add(rail, h('div', { class: 'box hit' }, h('span', { class: 'lb', text: 'Into next' + (next && next.t === 'song' && next.key ? ' · ' + next.key : '') }), it.trans));
    add(rail, h('div', { class: 'foot', id: 'lockfoot' }, h('span', { html: icon('lock') }), h('span', { id: 'locktxt', text: st.wl ? 'Screen stays on · pedal ready' : 'Pedal ready' })));
  }
  function keyShort(it) { var k = it.key || (WS.songById(it.song) || {}).key || ''; return k ? k + (it.to ? '→' + it.to : '') : ''; }

  function goto(i, keepTop) {
    if (i < 0 || i >= items.length) return;
    idx = i; st.top = 0; v.idx = i;
    layout();
  }
  function nextSongIdx(d) {
    var i = idx + d;
    return i >= 0 && i < items.length ? i : -1;
  }
  function visibleCount(lines, top, H) {
    var n = 0, y0 = lines[top].y;
    for (var i = top; i < lines.length; i++) { if (lines[i].y + lines[i].h - y0 <= H + 2 || i === top) n++; else break; }
    return n;
  }
  function turn(d) {
    var lines = st.lines, H = stage.clientHeight;
    if (lines.length) {
      var vis = visibleCount(lines, st.top, H);
      if (d > 0 && st.top + vis < lines.length) { st.top = Math.min(lines.length - 1, st.top + Math.max(1, Math.ceil(vis / 2))); paintTop(); return; }
      if (d < 0 && st.top > 0) { st.top = Math.max(0, st.top - Math.max(1, Math.ceil(vis / 2))); paintTop(); return; }
    }
    var ni = nextSongIdx(d);
    if (ni >= 0) { goto(ni); if (d < 0) { var l2 = st.lines; if (l2.length) { var vv = visibleCount(l2, 0, stage.clientHeight); st.top = Math.max(0, l2.length - vv); paintTop(); } } }
    else toast(d > 0 ? 'End of the set.' : 'This is the first item.');
  }
  function paintTop() {
    var lines = st.lines;
    var y = lines.length ? lines[Math.min(st.top, lines.length - 1)].y : 0;
    inner.style.transform = 'translateY(' + (-y) + 'px)';
    var H = stage.clientHeight, pages = 1;
    if (lines.length) { var t = 0; pages = 1; while (true) { var vis = visibleCount(lines, t, H); if (t + vis >= lines.length) break; t += Math.max(1, Math.ceil(vis / 2)); pages++; if (pages > 20) break; } }
    var pageNo = 1;
    if (lines.length) { var t2 = 0, p2 = 1; while (t2 < st.top) { var vis2 = visibleCount(lines, t2, H); t2 += Math.max(1, Math.ceil(vis2 / 2)); p2++; if (p2 > 20) break; } pageNo = p2; }
    st.pages = pages; st.pageNo = pageNo;
    var pl = head.querySelector('.pg'); if (pl) pl.textContent = pages > 1 ? 'Page ' + pageNo + ' of ' + pages : '';
    hint.textContent = pages > 1 && pageNo < pages ? 'Tap right edge for the next half page' : '';
    WS.$$('.roadmap button', roadmap).forEach(function (b) {
      var li = Number(b.getAttribute('data-line'));
      var on = li >= st.top && li < st.top + Math.max(1, visibleCount(lines, Math.min(st.top, lines.length - 1), H));
      b.classList.toggle('on', on && li === currentSectionLine());
    });
  }
  function currentSectionLine() { return st.top; }

  function layout() {
    drawRail();
    var it = curItem(), song = curSong();
    WS.clear(head); WS.clear(roadmap); WS.clear(inner); WS.clear(tools);
    st.lines = []; st.handle = null;
    if (!it) { add(inner, h('p', { class: 'note', text: 'Nothing to show.' })); return; }
    if (it.t === 'cue') {
      add(head, h('div', null, h('h1', { text: it.text }), h('div', { class: 'lmeta' }, h('span', { text: it.trans || 'Service moment' }))), h('div', { class: 'gap' }), modeSeg());
      add(inner, h('div', { style: { padding: '40px 0', fontSize: '22px', color: 'var(--mut)', fontStyle: 'italic' }, text: it.trans ? 'Keyboard: ' + it.trans : '' }));
      inner.style.position = 'absolute';
      paintTop(); addTools(null); return;
    }
    var sheetObj = song ? WS.getSheet(song.id) : null;
    var itemKey = it.key || (song && song.key) || (sheetObj && sheetObj.key) || 'C';
    var keyLine = itemKey + (it.to ? ' → ' + it.to : '') + (it.alt ? ' or ' + it.alt : '');
    var tempo = (song && Number(song.bpm)) || (sheetObj && sheetObj.tempo) || 0;
    add(head, h('div', null,
      h('h1', { text: WS.itemTitle(it) }),
      h('div', { class: 'lmeta' }, h('b', { class: 'key', text: keyLine }), tempo ? h('span', { text: tempo + ' BPM' }) : null, it.singer ? h('span', { text: it.singer }) : null, it.only === 'chorus' && !full[idx] ? h('span', { class: 'tag hit', text: 'Chorus only' }) : null, h('span', { class: 'pg' }))),
      h('div', { class: 'gap' }), song && !phone ? modeSeg() : null);
    if (it.note && !/^chorus only$/i.test(it.note)) add(head.firstChild, h('div', { class: 'lmeta', style: { color: 'var(--hit)' }, text: it.note.replace(/;?\s*chorus only/i, '') }));
    if (!sheetObj || !sheetObj.bars.length) {
      add(inner, h('div', { class: 'card', style: { marginTop: '20px', maxWidth: '520px' } }, h('b', { text: 'No lead sheet yet' }),
        h('p', { class: 'note', text: song ? 'Open this song in Transcribe to write the chords.' : 'This song is not in the library yet. Add it from the Songs tab.' }),
        song ? h('button', { class: 'btn pri', text: 'Open in Transcribe', onclick: function () { WS.go({ k: 'song', id: song.id, mode: 'transcribe' }); } }) : null));
      addTools(null); return;
    }
    var shown = W.sheetToKey(sheetObj, itemKey);
    var onlyChorus = it.only === 'chorus' && !full[idx];
    var ranges = null;
    if (onlyChorus) {
      var secs = W.chorusBarRange(shown);
      if (secs.length) ranges = secs.map(function (s) { return [s.from, s.to]; });
    }
    // roadmap strip
    var secsAll = W.sheetSections(shown);
    var drawWidth = stage.clientWidth ? stage.clientWidth - (phone ? 16 : 56) : 800;
    function draw() {
      WS.clear(inner);
      var theme = document.documentElement.getAttribute('data-theme');
      var H = stage.clientHeight || 600;
      var lines;
      if (settings.grid) {
        var rows = Math.ceil(((ranges ? ranges.reduce(function (a, r) { return a + r[1] - r[0] + 1; }, 0) : shown.bars.length)) / settings.bpl);
        var fs = Math.max(18, Math.min(48, Math.floor((H - 40) / (rows + secsAll.length * 0.45) / 2.0 * settings.scale)));
        inner.style.setProperty('--cgs', fs + 'px');
        st.handle = WNote.renderGrid(inner, shown, { ranges: ranges, barsPerLine: settings.bpl, nashville: settings.nash });
        st.lines = [];
        inner.style.transform = 'none';
        return;
      }
      WNote.load().then(function () {
        // choose the largest scale that fits, down to a floor; otherwise pages
        var sc = settings.scale, best = sc, fit = false;
        for (var s = sc; s >= 0.62; s -= 0.04) {
          var P = WNote.plan(shown, { width: drawWidth, scale: s, barsPerLine: settings.bpl, ranges: ranges, nashville: settings.nash });
          best = s; if (P.height * s <= H - 6) { fit = true; break; }
        }
        if (!fit) best = Math.max(0.8, Math.min(sc, 1));
        try {
          st.handle = WNote.render(inner, shown, { width: drawWidth, scale: best, barsPerLine: settings.bpl, ranges: ranges, theme: theme, nashville: settings.nash, triangle: WS.lsGet('ws-tri', true) });
          st.lines = st.handle.lines.map(function (l) { return { y: l.y * best, h: l.h * best, from: l.from, to: l.to }; });
          st.top = Math.min(st.top, Math.max(0, st.lines.length - 1));
          mapRoadmap();
        } catch (e) {
          console.error(e);
          st.handle = WNote.renderGrid(inner, shown, { ranges: ranges, barsPerLine: settings.bpl, nashville: settings.nash });
          add(inner, h('p', { class: 'err', text: 'The staff could not be drawn (' + (e && e.message || e) + '). Showing a chord grid instead.' }));
        }
      }).catch(function (e) {
        st.handle = WNote.renderGrid(inner, shown, { ranges: ranges, barsPerLine: settings.bpl, nashville: settings.nash });
        inner.insertBefore(h('p', { class: 'err', text: 'The notation library could not load (' + (e && e.message || e) + '). Showing a chord grid instead.' }), inner.firstChild);
      });
    }
    function buildRoadmap() {
      WS.clear(roadmap);
      secsAll.forEach(function (s) {
        if (ranges && !ranges.some(function (r) { return s.from >= r[0] && s.from <= r[1]; })) return;
        var b = h('button', { type: 'button', 'data-from': s.from, 'data-line': 0, onclick: function () { st.top = Number(b.getAttribute('data-line')); paintTop(); } }, s.mark && s.mark !== '*' ? h('b', { text: s.mark }) : null, h('span', { text: s.label || 'Start' }));
        roadmap.appendChild(b);
      });
    }
    function mapRoadmap() {
      WS.$$('button', roadmap).forEach(function (b) {
        var from = Number(b.getAttribute('data-from')), li = 0;
        st.lines.forEach(function (l, i) { if (from >= l.from && from <= l.to) li = i; });
        b.setAttribute('data-line', li);
      });
      paintTop();
    }
    addTools(function () { draw(); });
    if (it.only === 'chorus') {
      var showFull = h('button', { class: 'chip', type: 'button', text: full[idx] ? 'Chorus only' : 'Show full', onclick: function () { full[idx] = !full[idx]; layout(); } });
      tools.insertBefore(showFull, tools.firstChild);
    }
    // wait for layout so stage has a size
    buildRoadmap();
    requestAnimationFrame(function () { drawWidth = stage.clientWidth ? stage.clientWidth - (phone ? 16 : 56) : drawWidth; draw(); });
  }
  function modeSeg() {
    var song = curSong(); if (!song) return null;
    return WS.modeSeg('live', function (m) { WS.replaceTop({ k: 'song', id: song.id, mode: m, setId: v.setId, idx: idx }); });
  }
  function addTools(redraw) {
    if (!redraw) { add(tools, h('span', { class: 'small', text: '' })); return; }
    function stepper(label, key, min, max, fmt) {
      return h('div', { class: 'row', style: { gap: '4px' } }, h('span', { class: 'small', text: label }),
        h('button', { class: 'chip', type: 'button', 'aria-label': label + ' down', text: '−', onclick: function () { settings[key] = Math.max(min, +(settings[key] - (key === 'scale' ? 0.1 : 1)).toFixed(2)); WS.lsSet('ws-live-' + key, settings[key]); layout(); } }),
        h('span', { class: 'small tabnum', style: { minWidth: '34px', textAlign: 'center' }, text: fmt(settings[key]) }),
        h('button', { class: 'chip', type: 'button', 'aria-label': label + ' up', text: '+', onclick: function () { settings[key] = Math.min(max, +(settings[key] + (key === 'scale' ? 0.1 : 1)).toFixed(2)); WS.lsSet('ws-live-' + key, settings[key]); layout(); } }));
    }
    add(tools, stepper('Bars per line', 'bpl', 2, 6, String), stepper('Size', 'scale', 0.6, 1.6, function (x) { return Math.round(x * 100) + '%'; }),
      h('button', { class: 'chip' + (settings.grid ? ' on' : ''), type: 'button', text: 'Chord grid', 'aria-pressed': settings.grid ? 'true' : 'false', onclick: function () { settings.grid = !settings.grid; WS.lsSet('ws-live-grid', settings.grid); layout(); } }),
      h('button', { class: 'chip' + (settings.nash ? ' on' : ''), type: 'button', text: '1 4 5', 'aria-label': 'Nashville numbers', 'aria-pressed': settings.nash ? 'true' : 'false', onclick: function () { settings.nash = !settings.nash; WS.lsSet('ws-live-nash', settings.nash); layout(); } }),
      h('span', { class: 'grow' }),
      phone ? null : h('button', { class: 'chip', type: 'button', text: 'Theme', onclick: function () { WS.lsSet('ws-live-theme', WS.liveTheme() === 'dark' ? 'light' : 'dark'); WS.render(); } }),
      ib('back', 'Leave Live', function () { WS.back(); }));
  }

  // wake lock
  function requestWake() {
    if (!('wakeLock' in navigator)) { st.wl = null; setLockText('Pedal ready. If the screen turns off, set Auto-Lock to Never in Settings.'); return; }
    navigator.wakeLock.request('screen').then(function (l) {
      st.wl = l; setLockText('Screen stays on · pedal ready');
      l.addEventListener('release', function () { st.wl = null; setLockText('Screen lock released. Pedal ready.'); });
    }).catch(function () { st.wl = null; setLockText('The screen may turn off. Set Auto-Lock to Never in Settings, Display.'); });
  }
  function setLockText(t) { var e = document.getElementById('locktxt'); if (e) e.textContent = t; st.lockText = t; }
  function onVis() { if (!document.hidden && !st.wl) requestWake(); }
  document.addEventListener('visibilitychange', onVis);
  function onKey(e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'ArrowDown') { e.preventDefault(); turn(1); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp') { e.preventDefault(); turn(-1); }
  }
  document.addEventListener('keydown', onKey);
  var offResize = WS.on('resize', function () { layout(); });
  WS.onLeave(function () {
    document.removeEventListener('visibilitychange', onVis); document.removeEventListener('keydown', onKey); offResize();
    if (st.wl) { try { st.wl.release(); } catch (e) { /* ignore */ } }
  });
  setTimeout(function () { requestWake(); layout(); }, 0);
  root.__live = { turn: turn, goto: goto, state: st };
  return root;
};
})();
