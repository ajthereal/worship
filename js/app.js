/* Worship app shell: router, tab bar, Songs list, song header, menus, connect and settings sheets. */
(function () {
'use strict';
var WS = window.WS, W = window.WCore;
var h = WS.h, add = WS.add, $ = WS.$, icon = WS.icon, ib = WS.ib, toast = WS.toast, sheet = WS.sheet, S = WS.S;

var NAV = WS.NAV = { tab: 'sets', stack: [{ k: 'sets' }], cleanup: [] };
var views = WS.views = {};

WS.isWide = function () { return window.innerWidth >= 900; };
WS.isPhone = function () { return Math.min(window.innerWidth, window.innerHeight) < 600; };
function go(v) { NAV.stack.push(v); render(); }
function back() { if (NAV.stack.length > 1) { NAV.stack.pop(); render(); } }
function setTab(t) { NAV.tab = t; NAV.stack = [{ k: t }]; render(); }
function cur() { return NAV.stack[NAV.stack.length - 1]; }
function replaceTop(v) { NAV.stack[NAV.stack.length - 1] = v; render(); }
function onLeave(fn) { NAV.cleanup.push(fn); }
WS.go = go; WS.back = back; WS.setTab = setTab; WS.cur = cur; WS.replaceTop = replaceTop; WS.onLeave = onLeave;

var TABS = [['sets', 'Sets', 'sets'], ['songs', 'Songs', 'songs'], ['keys', 'Keys', 'keys']];
var FULL = { song: 1, keys2: 1 };

function render(keepScroll) {
  var app = $('#app');
  NAV.cleanup.splice(0).forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
  var v = cur(), el, scroll = 0;
  var old = app.querySelector('.scroll'); if (keepScroll && old) scroll = old.scrollTop;
  WS.applyTheme(v.k === 'song' && v.mode === 'live' || v.k === 'liveset' ? WS.liveTheme() : WS.baseTheme());
  try {
    el = (views[v.k] || views.sets)(v);
  } catch (e) {
    console.error(e);
    el = h('div', { class: 'page' }, h('h1', { text: 'Something went wrong' }), h('p', { class: 'err', text: 'This screen could not open: ' + (e && e.message || e) }), h('button', { class: 'btn', text: 'Back', onclick: back }));
  }
  WS.clear(app);
  var wrap = h('div', { class: 'view' }, el);
  app.appendChild(wrap);
  var showTabs = !(v.k === 'song' || v.k === 'paste' || v.k === 'set' || v.k === 'keysong' || v.k === 'share');
  if (showTabs && NAV.stack.length === 1) app.appendChild(tabbar());
  if (scroll) { var sc = app.querySelector('.scroll'); if (sc) sc.scrollTop = scroll; }
  WS.updateSyncUI();
}
WS.render = render;

function tabbar() {
  return h('nav', { class: 'tabbar', 'aria-label': 'Main' }, TABS.map(function (t) {
    return h('button', { class: NAV.tab === t[0] ? 'on' : '', type: 'button', onclick: function () { setTab(t[0]); }, html: icon(t[2]) + '<span>' + t[1] + '</span>' });
  }));
}

WS.topBar = function (title, o) {
  o = o || {};
  var left = o.noBack ? null : ib('back', 'Back', back);
  return h('div', { class: 'top' }, left, h('h1', { text: title }), o.actions || null, o.noPill ? null : WS.pillEl());
};

WS.keyOptions = function () {
  var out = [], flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  flats.forEach(function (k) { out.push(k); });
  flats.forEach(function (k) { out.push(k + 'm'); });
  return out;
};
WS.keySelect = function (val, onchange, allowNone) {
  var sel = h('select', { 'aria-label': 'Key' });
  if (allowNone) sel.appendChild(h('option', { value: '', text: 'None' }));
  var list = WS.keyOptions();
  if (val && list.indexOf(val) < 0) list.unshift(val);
  list.forEach(function (k) { sel.appendChild(h('option', { value: k, text: k })); });
  sel.value = val || '';
  sel.addEventListener('change', function () { onchange(sel.value); });
  return sel;
};

/* ---------- song header shared by the four modes ---------- */
var MODES = [['transcribe', 'Transcribe'], ['practice', 'Practice'], ['listen', 'Listen'], ['live', 'Live']];
WS.modeSeg = function (cur2, onPick) {
  return h('nav', { class: 'seg modeseg', 'aria-label': 'Mode' }, MODES.map(function (m) {
    return h('button', { type: 'button', class: cur2 === m[0] ? 'on' : '', text: m[1], onclick: function () { onPick(m[0]); } });
  }));
};
WS.songHeader = function (song, mode, o) {
  o = o || {};
  var phone = WS.isPhone();
  var demo = song.id === WS.demoId();
  var sub = o.sub || '';
  var ttl = h('div', { class: 'ttl' }, h('div', { class: 't' }, song.title || 'Untitled', demo ? h('span', { class: 'tag demo demo-badge', text: 'Demo song' }) : null), h('div', { class: 's', text: sub }));
  var seg = WS.modeSeg(mode, function (m) {
    if (m === mode) return;
    var v = cur();
    replaceTop({ k: 'song', id: song.id, mode: m, setId: v.setId, idx: v.idx });
  });
  var more = ib('more', 'More', function () { WS.songMenu(song, o); });
  var hd;
  if (phone) {
    hd = h('div', null, h('div', { class: 'shead phone' }, ib('back', 'Back', back), ttl, o.right || null, more), h('div', { class: 'modebar' }, seg));
  } else {
    hd = h('div', { class: 'shead' }, ib('back', 'Back to songs', back), ttl, seg, o.right || null, o.noPill ? null : WS.pillEl(), more);
  }
  return hd;
};

/* ---------- songs list ---------- */
var SONGQ = '';
views.songs = function () {
  var page = h('div', { class: 'page' });
  page.appendChild(WS.topBar('Songs', { noBack: true, actions: ib('plus', 'New song', function () { newSong(); }) }));
  var q = h('input', { type: 'search', placeholder: 'Search songs', value: SONGQ, 'aria-label': 'Search songs' });
  var list = h('div');
  function draw() {
    WS.clear(list);
    var all = [WS.songById(WS.demoId())].concat(WS.live(S.songs).slice().sort(function (a, b) { return a.title.localeCompare(b.title); }));
    var t = SONGQ.trim().toLowerCase();
    var songs = all.filter(function (s) { return !t || s.title.toLowerCase().indexOf(t) >= 0 || (s.artist || '').toLowerCase().indexOf(t) >= 0; });
    if (!songs.length) add(list, h('p', { class: 'note', text: t ? 'No song matches.' : 'No songs yet. Tap + to add one.' }));
    songs.forEach(function (s) { list.appendChild(songRow(s)); });
  }
  q.addEventListener('input', function () { SONGQ = q.value; draw(); });
  add(page, h('div', { style: { margin: '6px 0 4px' } }, q), list);
  draw();
  var off = WS.on('data', function () { draw(); });
  var off2 = WS.on('audio', function () { draw(); });
  onLeave(off); onLeave(off2);
  return h('div', { class: 'scroll' }, page);
};
function songRow(s) {
  var sh = WS.getSheet(s.id), pr = WS.sheetProgress(sh);
  var st = WS.Audio.state(s.audio);
  var parts = [];
  if (s.artist) parts.push(s.artist);
  parts.push(s.key ? s.key : 'No key');
  if (s.bpm) parts.push(s.bpm + ' BPM');
  var tags = [];
  if (s.id === WS.demoId()) tags.push(h('span', { class: 'tag demo', text: 'Demo song' }));
  if (pr.total) tags.push(h('span', { class: 'tag' + (pr.done === pr.total ? ' ok' : ''), text: pr.done + ' of ' + pr.total + ' bars' }));
  else tags.push(h('span', { class: 'tag', text: 'No lead sheet' }));
  if (s.audio) tags.push(h('span', { class: 'tag' + (st === 'device' ? ' ok' : ''), text: st === 'device' ? 'On this device' : 'Audio in Drive' }));
  else tags.push(h('span', { class: 'tag', text: 'No audio' }));
  return h('button', { class: 'li', type: 'button', onclick: function () { go({ k: 'song', id: s.id, mode: WS.lsGet('ws-lastmode', 'transcribe') === 'live' ? 'practice' : 'transcribe' }); } },
    h('div', { class: 'm' }, h('b', { text: s.title }), h('small', { text: parts.join(' · ') }), h('div', { class: 'row', style: { gap: '4px', marginTop: '5px', flexWrap: 'wrap' } }, tags)));
}
function newSong() {
  var s = WS.newSongRow({ title: '', key: 'C', bpm: '90' });
  var fields = songFields(s, true);
  var sh = sheet([h('h3', { text: 'New song' }), fields.el, h('div', { class: 'row' },
    h('button', { class: 'btn grow', text: 'Cancel', onclick: function () { sh.close(); } }),
    h('button', { class: 'btn pri grow', text: 'Add song', onclick: function () {
      fields.read();
      if (!s.title.trim()) { toast('Give the song a title first.'); return; }
      WS.commitSong(s); sh.close(); go({ k: 'song', id: s.id, mode: 'transcribe' });
    } })
  )]);
}

function songFields(s, isNew) {
  var el = h('div', { class: 'col', style: { gap: '12px' } });
  var title = h('input', { type: 'text', value: s.title, placeholder: 'Title', 'aria-label': 'Title' });
  var artist = h('input', { type: 'text', value: s.artist, placeholder: 'Singer or artist', 'aria-label': 'Singer' });
  var key = WS.keySelect(s.key || 'C', function () {});
  var bpm = h('input', { type: 'number', value: s.bpm, inputmode: 'numeric', min: 40, max: 220, 'aria-label': 'Tempo' });
  var time = h('select', { 'aria-label': 'Time signature' });
  ['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'].forEach(function (t) { time.appendChild(h('option', { value: t, text: t })); });
  time.value = s.time || '4/4';
  var patch = h('input', { type: 'text', value: s.patch, placeholder: 'Keyboard sound, for example Rhodes + warm pad', 'aria-label': 'Keyboard sound' });
  var notes = h('textarea', { 'aria-label': 'Notes', placeholder: 'Notes for the band', style: { minHeight: '70px' } }); notes.value = s.notes || '';
  var yt = h('textarea', { 'aria-label': 'YouTube links', placeholder: 'YouTube links, one per line', style: { minHeight: '70px' } }); yt.value = s.yt || '';
  add(el, h('div', { class: 'fld' }, h('small', { text: 'Title' }), title), h('div', { class: 'fld' }, h('small', { text: 'Singer' }), artist),
    h('div', { class: 'kv' }, h('div', { class: 'fld' }, h('small', { text: 'Key the chart is written in' }), key), h('div', { class: 'fld' }, h('small', { text: 'Tempo (BPM)' }), bpm)),
    h('div', { class: 'fld' }, h('small', { text: 'Time' }), time),
    h('div', { class: 'fld' }, h('small', { text: 'Keyboard sound (shown in Live)' }), patch),
    h('div', { class: 'fld' }, h('small', { text: 'Notes' }), notes),
    h('div', { class: 'fld' }, h('small', { text: 'YouTube links' }), yt));
  return {
    el: el,
    read: function () { s.title = title.value.trim(); s.artist = artist.value.trim(); s.key = key.value; s.bpm = String(Number(bpm.value) || ''); s.time = time.value; s.patch = patch.value.trim(); s.notes = notes.value; s.yt = yt.value; },
    key: key
  };
}

// edit details of an existing song
WS.editSong = function (song, done) {
  if (song.id === WS.demoId()) { toast('The demo song cannot be edited here.'); return; }
  var before = { key: song.key, time: song.time, bpm: song.bpm };
  var f = songFields(song);
  var sh = sheet([h('h3', { text: 'Song details' }), f.el, h('div', { class: 'row' },
    h('button', { class: 'btn grow', text: 'Cancel', onclick: function () { sh.close(); } }),
    h('button', { class: 'btn pri grow', text: 'Save', onclick: function () {
      f.read();
      if (!song.title) { toast('The title cannot be empty.'); return; }
      var sheetObj = WS.getSheet(song.id);
      var keyChanged = before.key !== song.key && sheetObj && sheetObj.bars.some(function (b) { return b.ch && b.ch.length; });
      function finish(transposeIt) {
        if (sheetObj) {
          if (transposeIt) { sheetObj = W.sheetToKey(sheetObj, song.key); } else sheetObj.key = song.key;
          sheetObj.tempo = Number(song.bpm) || sheetObj.tempo;
          if (before.time !== song.time) sheetObj.time = song.time;
          WS.saveSheet(song.id, sheetObj);
        }
        WS.commitSong(song); sh.close(); if (done) done();
      }
      if (keyChanged) {
        var s2 = sheet([h('h3', { text: 'Key changed' }), h('p', { class: 'note', text: 'Move the chords and notes to ' + song.key + ', or only change the label?' }),
          h('button', { class: 'btn pri block', text: 'Transpose the sheet to ' + song.key, onclick: function () { s2.close(); finish(true); } }),
          h('button', { class: 'btn block', text: 'Only change the label', onclick: function () { s2.close(); finish(false); } })]);
      } else finish(false);
    } })
  )]);
};

WS.songMenu = function (song, o) {
  var demo = song.id === WS.demoId();
  var items = [];
  function item(label, fn, cls) { items.push(h('button', { type: 'button', class: cls || '', text: label, onclick: function () { s.close(); fn(); } })); }
  item('Song details', function () { WS.editSong(song, function () { WS.render(true); }); });
  item('Audio file', function () { WS.audioSheet(song, function () { WS.render(true); }); });
  item('How to type bars', function () { WS.helpSheet(); });
  item('Settings', function () { WS.settingsSheet(); });
  if (!demo) item('Delete this song', function () { WS.confirmSheet('Delete "' + song.title + '"?', 'It is removed from the library on all your devices. The audio file in Drive is not touched.', 'Delete', function () { WS.deleteSong(song); NAV.stack = [{ k: 'songs' }]; NAV.tab = 'songs'; render(); }, true); }, 'bad');
  var s = sheet([h('h3', { text: song.title }), h('div', { class: 'menu-list' }, items)]);
};

/* ---------- audio file sheet: link from Drive, download, remove ---------- */
WS.audioSheet = function (song, done) {
  var A = WS.Audio, demo = song.id === WS.demoId();
  var body = h('div', { class: 'col', style: { gap: '12px' } });
  var sh = sheet([h('h3', { text: 'Audio file' }), body]);
  function draw() {
    WS.clear(body);
    var st = A.state(song.audio), m = A.meta[song.audio];
    if (demo) { add(body, h('p', { class: 'note', text: 'The demo song has no audio.' })); return; }
    if (song.audio) {
      add(body, h('div', { class: 'card' }, h('b', { text: song.audioName || 'Linked file' }),
        h('div', { class: 'small', text: st === 'device' ? 'On this device (' + WS.mb(m.size) + '). Plays offline.' : st === 'partial' ? 'Part of the file is on this device (' + m.got + ' of ' + m.n + ' parts).' : 'In Drive. Not on this device yet.' })));
      var prog = h('div', { class: 'prog hide' }, h('i')), msg = h('div', { class: 'small' }), err = h('div', { class: 'err' });
      var dl = h('button', { class: 'btn pri block', text: st === 'device' ? 'Downloaded' : st === 'partial' ? 'Continue download' : 'Download to this device', disabled: st === 'device', onclick: function () {
        err.textContent = ''; prog.classList.remove('hide'); dl.disabled = true;
        var cancel = h('button', { class: 'btn block', text: 'Cancel download', onclick: function () { A.cancel(song.audio); } });
        add(body, cancel);
        A.download(song.audio, { name: song.audioName, onProgress: function (i, n) { prog.firstChild.style.width = Math.round(i / n * 100) + '%'; msg.textContent = 'Part ' + i + ' of ' + n; } })
          .then(function () { toast('Saved on this device.'); draw(); WS.emit('audio'); })
          .catch(function (e) { err.textContent = (e && e.message) || 'The download failed.'; dl.disabled = false; draw(); body.appendChild(err); });
      } });
      add(body, dl, prog, msg, err);
      if (st !== 'drive') add(body, h('button', { class: 'btn block bad', text: 'Remove from this device', onclick: function () { A.remove(song.audio).then(function () { draw(); toast('Removed from this device.'); }); } }));
      add(body, h('button', { class: 'btn block', text: 'Choose a different file', onclick: pick }));
      add(body, h('button', { class: 'btn ghost block', text: 'Unlink', onclick: function () { song.audio = ''; song.audioName = ''; song.grid = ''; WS.commitSong(song); draw(); if (done) done(); } }));
    } else {
      add(body, h('p', { class: 'note', text: 'Put one mp3 or m4a per song in the Drive folder "Worship Audio", then link it here.' }), h('button', { class: 'btn pri block', text: 'Choose from Drive', onclick: pick }));
    }
    add(body, h('div', { class: 'small', id: 'au-usage' }));
    A.usage().then(function (u) { var e = body.querySelector('#au-usage'); if (e) e.textContent = 'Audio on this device: ' + WS.mb(u.used) + (u.quota ? ' of about ' + WS.mb(u.quota) + ' available.' : '.'); });
  }
  function pick() {
    WS.clear(body); add(body, h('p', { class: 'note', text: 'Loading the list from Drive…' }));
    A.list().then(function (files) {
      WS.clear(body);
      var sug = A.suggest(song.title, files);
      add(body, h('p', { class: 'note', text: files.length ? 'Pick the file for this song.' : 'The folder is empty. Add an mp3 or m4a to "Worship Audio" in Drive.' }));
      var list = h('div', { class: 'apick' });
      files.slice().sort(function (a, b) { return (b === sug) - (a === sug) || String(a.name).localeCompare(b.name); }).forEach(function (f) {
        list.appendChild(h('button', { type: 'button', onclick: function () {
          song.audio = f.id; song.audioName = f.name; song.grid = ''; WS.commitSong(song); draw(); if (done) done();
        } }, h('span', null, h('b', { text: f.name }), h('small', { text: WS.mb(f.size || 0) + (f === sug ? ' · looks like this song' : '') })), f === sug ? h('span', { class: 'tag ok', text: 'Match' }) : null));
      });
      add(body, list, h('button', { class: 'btn block', text: 'Back', onclick: draw }));
    }).catch(function (e) {
      WS.clear(body);
      add(body, h('p', { class: 'err', text: (e && e.message) || 'The audio list could not load.' }), h('button', { class: 'btn block', text: 'Back', onclick: draw }));
    });
  }
  draw();
};

/* ---------- help: typed syntax ---------- */
WS.helpSheet = function () {
  var el = h('div', { class: 'help' });
  el.innerHTML = '<h3>Typing bars</h3>' +
    '<p>One word per beat, separated by spaces. Press Enter to go to the next bar. You can paste many bars at once.</p>' +
    '<pre>E . . .          E on beat 1, comp slashes after\nE . A .          E, then A on beat 3\nE! . r r         E as a hit for two beats, then rests\nE . . ^B/D#      B/D# pushed, lands on the "and" of 3\nA,B . C .        A on 1, B on the "and" of 1\n%                repeat the previous bar</pre>' +
    '<p><code>.</code> holds. <code>r</code> rest. <code>!</code> after a chord is a hit, alone it is a hit with no new chord. <code>^</code> before a chord is a push. <code>,</code> splits a beat in two (or four in 16ths).</p>' +
    '<pre>[A Intro] |: E . . . | A . . . :|\n[B Verse] | 1. B . . . | 2. C . . . |]\n| E . . . (Band stop) |</pre>' +
    '<p>Bar lines: <code>|</code> <code>||</code> <code>|:</code> <code>:|</code> <code>|]</code>. A <code>[A Name]</code> before a bar starts a rehearsal mark. <code>1.</code> and <code>2.</code> are endings. Text in brackets is a cue under the bar.</p>' +
    '<p>Pitched lines and voicings are added in the bar grid with the piano or a MIDI keyboard, not by typing.</p>';
  var s = sheet([el, h('button', { class: 'btn block', text: 'Close', onclick: function () { s.close(); } })]);
};

/* ---------- connect ---------- */
WS.openConnect = function () {
  var conn = S.conn;
  var url = h('input', { type: 'text', placeholder: 'https://script.google.com/macros/s/…/exec', value: conn ? conn.url : '', autocapitalize: 'none', autocorrect: 'off', 'aria-label': 'Apps Script address' });
  var tok = h('input', { type: 'text', placeholder: 'Code', value: conn ? conn.token : '', autocapitalize: 'none', autocorrect: 'off', 'aria-label': 'Code' });
  var msg = h('div', { class: 'note' });
  var p = WS.syncPill();
  var info = conn
    ? 'Connected' + (conn.from === 'hq' ? ' through HQ' : '') + '. ' + p.txt + '. Last sync ' + (S.meta.last.wsongs ? new Date(S.meta.last.wsongs).toLocaleString() : 'not yet') + '.'
    : 'Not connected. Everything is kept on this device only. Open Worship from HQ to connect, or paste the address and code.';
  var sh = sheet([h('h3', { text: 'Sheet connection' }), h('p', { class: 'note', text: info }),
    h('div', { class: 'fld' }, h('small', { text: 'Apps Script address' }), url), h('div', { class: 'fld' }, h('small', { text: 'Code' }), tok), msg,
    h('button', { class: 'btn pri block', text: 'Connect', onclick: function () {
      var u = url.value.trim(), t = tok.value.trim();
      if (!/^https?:\/\//.test(u)) { msg.className = 'err'; msg.textContent = 'The address must start with https://'; return; }
      if (!t) { msg.className = 'err'; msg.textContent = 'Paste the code too.'; return; }
      WS.saveConn({ url: u, token: t }); msg.className = 'note'; msg.textContent = 'Checking…';
      WS.apiGet(S.conn, 'wsongs').then(function (j) {
        if (j.error) { msg.className = 'err'; msg.textContent = WS.plainError(j); return; }
        msg.textContent = 'Connected. Syncing…'; WS.syncAll().then(function () { sh.close(); render(true); toast('Connected.'); });
      }).catch(function (e) { msg.className = 'err'; msg.textContent = WS.plainError(e); });
    } }),
    conn ? h('button', { class: 'btn block', text: 'Sync now', onclick: function () { WS.syncAll().then(function () { sh.close(); render(true); toast(WS.syncPill().txt); }); } }) : null,
    conn && conn.from !== 'hq' ? h('button', { class: 'btn ghost block bad', text: 'Disconnect', onclick: function () { WS.saveConn(null); sh.close(); render(true); } }) : null,
    h('button', { class: 'btn ghost block', text: 'Close', onclick: function () { sh.close(); } })]);
};

/* ---------- settings ---------- */
WS.settingsSheet = function () {
  var A = WS.Audio;
  var th = WS.baseTheme(), lt = WS.lsGet('ws-live-theme', 'dark');
  var body = h('div', { class: 'col', style: { gap: '14px' } });
  var sh = sheet([h('h3', { text: 'Settings' }), body]);
  function seg(label, cur2, opts, fn) {
    return h('div', { class: 'fld' }, h('small', { text: label }), h('div', { class: 'seg' }, opts.map(function (o) {
      return h('button', { type: 'button', class: cur2 === o[0] ? 'on' : '', text: o[1], onclick: function () { fn(o[0]); draw(); } });
    })));
  }
  function draw() {
    WS.clear(body);
    th = WS.baseTheme(); lt = WS.lsGet('ws-live-theme', 'dark');
    add(body,
      seg('Look', th, [['light', 'Light'], ['dark', 'Dark everywhere']], function (v) { WS.lsSet('ws-theme', v); WS.applyTheme(v); }),
      seg('Look in Live', lt, [['dark', 'Dark'], ['light', 'Light']], function (v) { WS.lsSet('ws-live-theme', v); }),
      seg('Maj7 symbol', WS.lsGet('ws-tri', true) ? 'tri' : 'maj', [['tri', 'Δ7'], ['maj', 'maj7']], function (v) { WS.lsSet('ws-tri', v === 'tri'); }),
      h('div', { class: 'card', id: 'st-box' }, h('b', { text: 'Storage' }), h('div', { class: 'small', id: 'st-txt', text: 'Checking…' })));
    A.usage().then(function (u) {
      var t = body.querySelector('#st-txt'); if (!t) return;
      t.textContent = 'Audio on this device: ' + WS.mb(u.used) + (u.quota ? ' of about ' + WS.mb(u.quota) + ' available' : '') + '. ' + u.shifted + ' pitch-shifted ' + (u.shifted === 1 ? 'copy' : 'copies') + '. Safari and the home-screen app keep separate downloads, so use the home-screen app as your main place.';
      A.shiftedList().then(function (list) {
        var box = body.querySelector('#st-box');
        list.forEach(function (x) {
          var sid = x.key.split(':')[0], semi = x.key.split(':')[1];
          var sg = WS.S.songs.filter(function (s) { return s.audio === sid; })[0];
          box.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'grow small', text: (sg ? sg.title : 'Song') + ', ' + (semi > 0 ? '+' : '') + semi + ' semitones, ' + WS.mb(x.size) }),
            h('button', { class: 'btn sm', text: 'Delete', onclick: function () { A.removeShifted(x.key).then(draw); } })));
        });
      });
    });
    add(body, h('button', { class: 'btn block', text: 'Connection', onclick: function () { sh.close(); WS.openConnect(); } }), h('button', { class: 'btn block', text: 'How to type bars', onclick: function () { sh.close(); WS.helpSheet(); } }), h('button', { class: 'btn pri block', text: 'Done', onclick: function () { sh.close(); render(true); } }));
  }
  draw();
};

/* ---------- start ---------- */
WS.start = function () {
  WS.applyTheme(WS.baseTheme());
  if (WS.HASH.connectNote) setTimeout(function () { toast(WS.HASH.connectNote); }, 400);
  if (WS.HASH.share && WS.views.share) NAV.stack = [{ k: 'share', code: WS.HASH.share }];
  // test hooks and deep links: #open=song/<id>/<mode>
  render();
  if (S.conn && !WS.HASH.share) WS.syncAll();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () { /* offline use is optional */ });
  window.addEventListener('resize', WS.debounce(function () { WS.emit('resize'); }, 150));
  window.addEventListener('orientationchange', function () { setTimeout(function () { WS.emit('resize'); }, 300); });
};
})();
