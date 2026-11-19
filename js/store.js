/* Worship store: local data, connection to the Sheet, sync for wsongs, wsets and wsheets. */
(function () {
'use strict';
var WS = window.WS, W = window.WCore;
var lsGet = WS.lsGet, lsSet = WS.lsSet, toast = WS.toast;

var TABS = {
  wsongs: { key: 'songs', cols: W.SONG_COLS, ls: 'ws-songs' },
  wsets: { key: 'sets', cols: W.SET_COLS, ls: 'ws-sets' }
};
var S = WS.S = {
  songs: lsGet('ws-songs', []), sets: lsGet('ws-sets', []),
  sheets: lsGet('ws-sheets', {}),        // songId -> {u: updated, b: last remote updated, j: sheet}
  meta: lsGet('ws-meta', null) || { loaded: {}, pend: {}, last: {} },
  conn: null, rev: {}, sync: { state: 'idle', msg: '' }
};
S.meta.loaded = S.meta.loaded || {}; S.meta.pend = S.meta.pend || {}; S.meta.last = S.meta.last || {};

/* tiny event hub */
var subs = {};
WS.on = function (ev, fn) { (subs[ev] = subs[ev] || []).push(fn); return function () { subs[ev] = (subs[ev] || []).filter(function (f) { return f !== fn; }); }; };
WS.emit = function (ev, a) { (subs[ev] || []).slice().forEach(function (f) { try { f(a); } catch (e) { console.error(e); } }); };

function deviceName() { var u = navigator.userAgent || ''; return /iPhone/.test(u) ? 'iPhone' : /iPad|Macintosh/.test(u) && 'ontouchend' in document ? 'iPad' : 'device'; }
WS.deviceName = deviceName;

/* ---------- connection ---------- */
function loadConn() {
  var c = lsGet('ws-conn', null);
  if (c && c.url && c.token) return c;
  var q = lsGet('hq-sync', null);
  if (q && q.url && q.token) return { url: q.url, token: q.token, from: 'hq' };
  return null;
}
WS.saveConn = function (c) {
  S.conn = c;
  if (c) lsSet('ws-conn', { url: c.url, token: c.token });
  else { try { localStorage.removeItem('ws-conn'); } catch (e) { /* ignore */ } }
};
S.conn = loadConn();

function utf8FromB64(b) {
  b = b.replace(/-/g, '+').replace(/_/g, '/');
  var bin = atob(b);
  return decodeURIComponent(Array.prototype.map.call(bin, function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join(''));
}
var HASH = WS.HASH = { share: null, connectNote: '' };
(function readHash() {
  var hs = location.hash || '';
  var m = /[#&]connect=([^&]+)/.exec(hs);
  if (m) {
    try {
      var j = JSON.parse(utf8FromB64(decodeURIComponent(m[1])));
      if (j && /^https?:\/\//.test(j.url || '') && j.token) { WS.saveConn({ url: j.url, token: j.token }); HASH.connectNote = 'Connected to your Sheet.'; }
      else HASH.connectNote = 'That connect link is incomplete. Use Connect and paste the address and code.';
    } catch (e) { HASH.connectNote = 'That connect link is damaged. Use Connect and paste the address and code.'; }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e2) { /* ignore */ }
  }
  var s = /[#&]share=([^&]+)/.exec(hs);
  if (s) HASH.share = s[1];
})();

/* ---------- plain errors, requests ---------- */
function plainError(e) {
  if (!e) return 'Something went wrong.';
  if (e.error === 'token' || e.kind === 'token') return 'The code does not match your Sheet. Open Connect and check it.';
  if (e.kind === 'offline') return 'No internet right now.';
  if (e.kind === 'network') return 'The Sheet address cannot be reached.';
  if (e.kind === 'notjson') return 'That address did not answer like your Apps Script. Check that you pasted the web app address.';
  if (e.kind === 'http') return 'The Sheet answered with an error (' + e.status + ').';
  if (e.error === 'empty-refused') return 'The Sheet refused an empty save to protect your data.';
  if (e.error === 'bad-request') return 'The Sheet script did not understand the request.';
  if (e.error === 'server') return 'The Sheet script had a problem' + (e.message ? ' (' + String(e.message).slice(0, 80) + ')' : '') + '.';
  if (e.message && !e.error) return String(e.message);
  if (e.error) return 'The Sheet said ' + e.error + '.';
  return 'Something went wrong.';
}
WS.plainError = plainError;
function fetchJson(url, opts, timeout) {
  var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctl) ctl.abort(); }, timeout || 25000);
  var o = opts || {};
  if (ctl) o.signal = ctl.signal;
  return fetch(url, o).then(function (r) {
    clearTimeout(timer);
    if (!r.ok) throw { kind: 'http', status: r.status };
    return r.text();
  }).then(function (t) {
    try { return JSON.parse(t); } catch (e) { throw { kind: 'notjson' }; }
  }).catch(function (e) {
    clearTimeout(timer);
    if (e && e.kind) throw e;
    throw { kind: navigator.onLine === false ? 'offline' : 'network' };
  });
}
WS.fetchJson = fetchJson;
function apiUrl(conn, name, extra) { return conn.url + (conn.url.indexOf('?') < 0 ? '?' : '&') + 'token=' + encodeURIComponent(conn.token) + '&name=' + encodeURIComponent(name) + (extra || ''); }
WS.apiGet = function (conn, name, extra, timeout) { return fetchJson(apiUrl(conn, name, extra), null, timeout); };
function apiPost(conn, name, rows) {
  return fetchJson(conn.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token: conn.token, name: name, rows: rows }) }, 60000);
}
var apiGet = WS.apiGet;

/* ---------- sync engine ---------- */
var busy = {}, again = {}, timers = {}, retryT = null;
function persist(tab) {
  if (tab === 'wsheets') lsSet('ws-sheets', cleanSheets());
  else { var T = TABS[tab]; lsSet(T.ls, S[T.key]); }
  lsSet('ws-meta', S.meta);
}
function cleanSheets() { var o = {}; Object.keys(S.sheets).forEach(function (k) { if (k !== WDemoId()) o[k] = S.sheets[k]; }); return o; }
function WDemoId() { return window.WDemo ? window.WDemo.id : 'demo-song'; }
function touch(tab) {
  S.meta.pend[tab] = true; S.rev[tab] = (S.rev[tab] || 0) + 1;
  persist(tab);
  scheduleSync(tab, tab === 'wsheets' ? 1500 : 800);
  updateSyncUI();
}
function scheduleSync(tab, delay) {
  clearTimeout(timers[tab]);
  if (HASH.share || !S.conn) { setSync(); return; }
  timers[tab] = setTimeout(function () { syncTab(tab); }, delay == null ? 800 : delay);
}
function adopt(T, merged) {
  var old = {};
  S[T.key].forEach(function (r) { old[r.id] = r; });
  return merged.map(function (r) {
    var o = old[r.id];
    if (o && o.updated === r.updated && JSON.stringify(W.normRow(o, T.cols)) === JSON.stringify(r)) return o;
    return r;
  });
}
function syncFailed(e) {
  var offline = e && (e.kind === 'offline' || e.kind === 'network') && navigator.onLine === false;
  S.sync = { state: offline ? 'offline' : 'error', msg: plainError(e), kind: e && (e.kind || e.error) };
  if (e && e.kind === 'network') S.sync.state = navigator.onLine === false ? 'offline' : 'error';
  clearTimeout(retryT); retryT = setTimeout(function () { syncAll(); }, 30000);
}

function syncTab(tab) {
  if (tab === 'wsheets') return syncSheets();
  if (!S.conn) { setSync(); return Promise.resolve(); }
  if (busy[tab]) { again[tab] = true; return busy[tab]; }
  var T = TABS[tab], conn = S.conn;
  setSync('saving');
  busy[tab] = apiGet(conn, tab).then(function (j) {
    if (j.error) throw j;
    var remote = (j.rows || []).filter(function (r) { return r && r.id; }).map(function (r) { return W.normRow(r, T.cols); });
    var local = S[T.key].filter(function (r) { return r.id !== WDemoId(); });
    var merged = W.mergeRows(local, remote).map(function (r) { return W.normRow(r, T.cols); });
    S[T.key] = adopt(T, merged);
    var revAtMerge = S.rev[tab] || 0;
    S.meta.loaded[tab] = true;
    var finish = function () {
      S.meta.last[tab] = W.nowISO();
      if ((S.rev[tab] || 0) === revAtMerge) S.meta.pend[tab] = false; else again[tab] = true;
      persist(tab);
    };
    if (W.rowsEqual(merged, remote, T.cols)) { finish(); return; }
    return apiPost(conn, tab, merged).then(function (r) {
      if (r.error) throw r;
      finish();
    });
  }).then(function () {
    S.sync = { state: 'ok', msg: '' };
  }).catch(syncFailed).then(function () {
    busy[tab] = null;
    var more = again[tab]; again[tab] = false;
    updateSyncUI(); WS.emit('data', tab);
    if (more && S.sync.state === 'ok') return syncTab(tab);
  });
  return busy[tab];
}

function isDirty(loc) { return !!loc && (!loc.b || W.tsCmp(loc.u, loc.b) > 0); }
function syncSheets() {
  var tab = 'wsheets';
  if (!S.conn) { setSync(); return Promise.resolve(); }
  if (busy[tab]) { again[tab] = true; return busy[tab]; }
  var conn = S.conn;
  setSync('saving');
  busy[tab] = apiGet(conn, tab).then(function (j) {
    var remoteRows;
    if (j.error) {
      if (/tab|sheet|found|unknown/i.test(String(j.error)) && j.error !== 'token') remoteRows = []; // tab does not exist yet
      else throw j;
    } else remoteRows = (j.rows || []).filter(function (r) { return r && r.id; }).map(function (r) { return W.normRow(r, W.SHEET_COLS); });
    var groups = W.groupSheetRows(remoteRows), rmap = {};
    groups.forEach(function (g) { rmap[g.id] = g; });
    var revAtMerge = S.rev[tab] || 0;
    var jobs = [], conflicts = [];
    groups.forEach(function (g) {
      if (g.id === WDemoId()) return;
      var loc = S.sheets[g.id];
      var tomb = g.parts.length && g.parts[0].deleted === '1';
      if (tomb) return;
      var act = W.sheetSyncAction(loc, g.updated, S.meta.cfv && S.meta.cfv[g.id]);
      if (act !== 'skip') {
        jobs.push(W.unpackSheet(g.parts).then(function (sheetObj) {
          if (!sheetObj) return;
          if (act === 'conflict') conflicts.push({ id: g.id, local: loc, ru: g.updated });
          S.sheets[g.id] = { u: g.updated, b: g.updated, j: sheetObj, w: loc && loc.w ? loc.w : [] };
        }).catch(function () { /* unreadable remote sheet: keep local */ }));
      }
    });
    return Promise.all(jobs).then(function () {
      conflicts.forEach(function (c) {
        S.meta.cfv = S.meta.cfv || {}; S.meta.cfv[c.id] = c.ru; // one copy per (song, remote version)
        var song = songById(c.id), title = song ? song.title : 'a song';
        var copyId = W.uid(), stamp = W.fmtDate(W.todayISO()) + ' ' + new Date().toTimeString().slice(0, 5);
        if (song) {
          var cp = W.normRow(Object.assign({}, song, { id: copyId, title: song.title + ' (conflict copy ' + stamp + ')', updated: W.nowISO(), audio: '', audioName: '', grid: '' }), W.SONG_COLS);
          S.songs.push(cp); touch('wsongs');
        }
        S.sheets[copyId] = { u: W.nowISO(), b: '', j: c.local.j, w: [] };
        toast('Another device changed "' + title + '" while you were editing. Your version is saved as a conflict copy in Songs.', 8000);
      });
      var dirtyIds = Object.keys(S.sheets).filter(function (id) { return id !== WDemoId() && isDirty(S.sheets[id]); });
      if (!dirtyIds.length) { S.meta.loaded[tab] = true; return null; }
      return Promise.all(dirtyIds.map(function (id) { return W.packSheet(id, S.sheets[id].j, S.sheets[id].u); })).then(function (packs) {
        var mine = [];
        packs.forEach(function (p) { mine = mine.concat(p.rows); });
        var merged = W.mergeSheetRows(mine, remoteRows);
        return apiPost(conn, tab, merged).then(function (r) {
          if (r.error) throw r;
          dirtyIds.forEach(function (id, i) { W.sheetMarkWritten(S.sheets[id], packs[i].rows[0].updated); });
          S.meta.loaded[tab] = true;
        });
      });
    }).then(function () {
      S.meta.last[tab] = W.nowISO();
      var anyDirty = Object.keys(S.sheets).some(function (id) { return id !== WDemoId() && isDirty(S.sheets[id]); });
      if (!anyDirty && (S.rev[tab] || 0) === revAtMerge) S.meta.pend[tab] = false; else if (anyDirty) again[tab] = true;
      persist(tab);
    });
  }).then(function () {
    S.sync = { state: 'ok', msg: '' };
  }).catch(function (e) {
    if (e && e.message && !e.kind && !e.error) e = { error: 'sheet', message: e.message };
    syncFailed(e);
    if (e && e.error === 'sheet') S.sync.msg = e.message;
  }).then(function () {
    busy[tab] = null;
    var more = again[tab]; again[tab] = false;
    updateSyncUI(); WS.emit('data', tab);
    if (more && S.sync.state === 'ok') return syncSheets();
  });
  return busy[tab];
}
function syncAll() { return Promise.all([syncTab('wsongs'), syncTab('wsets'), syncTab('wsheets')]); }
function pendingAny() { return !!(S.meta.pend.wsongs || S.meta.pend.wsets || S.meta.pend.wsheets); }
function setSync(state) { if (state) S.sync.state = state; updateSyncUI(); }
function anyBusy() { return !!(busy.wsongs || busy.wsets || busy.wsheets); }

function syncPill() {
  var txt = '', cls = '', dev = deviceName();
  if (!S.conn) { txt = 'Not connected'; cls = 'nc'; }
  else if (anyBusy()) { txt = 'Saving…'; cls = 'saving'; }
  else if (S.sync.state === 'error') { txt = S.sync.msg.replace(/\.$/, ''); cls = 'bad'; }
  else if (S.sync.state === 'offline' || navigator.onLine === false) { txt = pendingAny() ? 'Offline, saved on this ' + dev : 'Offline, showing saved copy'; cls = ''; }
  else if (pendingAny()) { txt = 'Saving…'; cls = 'saving'; }
  else if (S.sync.state === 'ok') { txt = 'Saved'; cls = 'ok'; }
  else { txt = 'Saved on this ' + dev; cls = ''; }
  return { txt: txt, cls: cls };
}
function updateSyncUI() {
  var p = syncPill();
  WS.$$('.pill.sync').forEach(function (el) { el.className = 'pill sync ' + p.cls; var t = el.querySelector('.t'); if (t) t.textContent = p.txt; });
}
WS.pillEl = function () {
  var p = syncPill();
  return WS.h('button', { class: 'pill sync ' + p.cls, 'aria-label': 'Sync status', type: 'button', onclick: function () { WS.openConnect(); } }, WS.h('i', { class: 'dot' }), WS.h('span', { class: 't', text: p.txt }));
};
window.addEventListener('online', function () { if (S.conn && !HASH.share) syncAll(); updateSyncUI(); });
window.addEventListener('offline', function () { setSync(); });
document.addEventListener('visibilitychange', function () { if (!document.hidden && S.conn && !HASH.share && !anyBusy()) syncAll(); });
window.addEventListener('focus', function () { if (S.conn && !HASH.share && pendingAny() && !anyBusy()) syncAll(); });

/* ---------- data helpers ---------- */
function live(rows) { return rows.filter(function (r) { return r.deleted !== '1'; }); }
function demoSong() {
  var D = window.WDemo;
  return W.normRow({ id: D.id, title: D.title, artist: D.singer, key: D.key, bpm: String(D.bpm), time: '4/4', patch: 'Rhodes + warm pad. Pad up in C.', notes: 'Demo song. Never saved to your Sheet.', updated: '2000-01-01T00:00:00Z' }, W.SONG_COLS);
}
function songById(id) {
  if (id === WDemoId()) return demoSong();
  for (var i = 0; i < S.songs.length; i++) if (S.songs[i].id === id && S.songs[i].deleted !== '1') return S.songs[i];
  return null;
}
function setById(id) {
  if (id === 'demo-set') return demoSet();
  for (var i = 0; i < S.sets.length; i++) if (S.sets[i].id === id) return S.sets[i];
  return null;
}
function demoSet() {
  return W.normRow({ id: 'demo-set', date: '2026-11-21', name: 'Demo set', updated: '2000-01-01T00:00:00Z', items: JSON.stringify([
    { t: 'song', song: WDemoId(), title: 'Demo song', key: 'E', to: 'F', singer: 'Fero', note: '', trans: 'Hold pad, drop back to E' },
    { t: 'song', song: '', title: 'I Will Run to You', key: 'E', to: 'F', singer: 'Jess' },
    { t: 'song', song: '', title: 'Kau Tetap Allah', key: 'F', to: 'G' },
    { t: 'cue', text: 'Prayer', trans: 'pad' },
    { t: 'song', song: '', title: 'Saatku MenyembahMu', key: 'F', singer: 'Fero', only: 'chorus' }]) }, W.SET_COLS);
}
function newSongRow(o) { return W.normRow(Object.assign({ id: W.uid(), time: '4/4', updated: W.nowISO() }, o || {}), W.SONG_COLS); }
function commitSong(song) {
  if (song.id === WDemoId()) return;
  song.updated = W.nowISO();
  var i = S.songs.findIndex(function (r) { return r.id === song.id; });
  if (i < 0) S.songs.push(song); else S.songs[i] = song;
  touch('wsongs');
}
function deleteSong(song) { song.deleted = '1'; commitSong(song); }
function itemsOf(set) { try { var a = JSON.parse(set.items || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function commitSet(set, items) {
  if (set.id === 'demo-set') return;
  if (items) set.items = JSON.stringify(items);
  set.updated = W.nowISO();
  var i = S.sets.findIndex(function (r) { return r.id === set.id; });
  if (i < 0) S.sets.push(set); else S.sets[i] = set;
  touch('wsets');
}
function marksOf(song) { try { var o = JSON.parse(song.marks || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }

/* lead sheets */
var demoSheetObj = null;
function getSheet(songId) {
  if (songId === WDemoId()) { if (!demoSheetObj) demoSheetObj = window.WDemo.sheet(); return demoSheetObj; }
  var e = S.sheets[songId];
  if (e) return e.j;
  var song = songById(songId);
  if (!song) return null;
  if (song.chart && song.chart.trim() && (!S.conn || S.meta.loaded.wsheets)) {
    var sh = W.chartToSheet(song.chart, song.key, song.time || '4/4', Number(song.bpm) || 0);
    if (sh && sh.bars.length) { saveSheet(songId, sh); return sh; }
  }
  return null;
}
function saveSheet(songId, sheet) {
  if (songId === WDemoId()) { demoSheetObj = sheet; return; }
  var e = S.sheets[songId];
  S.sheets[songId] = { u: W.nowISO(), b: e ? e.b : '', j: sheet, w: e && e.w ? e.w : [] };
  touch('wsheets');
}
function hasSheet(songId) { return songId === WDemoId() || !!S.sheets[songId] || (function () { var s = songById(songId); return !!(s && s.chart && s.chart.trim()); })(); }
function sheetProgress(sheet) {
  if (!sheet || !sheet.bars) return { done: 0, total: 0 };
  var done = sheet.bars.filter(function (b) { return (b.ch && b.ch.length) || b.rep === '%'; }).length;
  return { done: done, total: sheet.bars.length };
}

Object.assign(WS, {
  TABS: TABS, syncTab: syncTab, syncAll: syncAll, syncPill: syncPill, updateSyncUI: updateSyncUI, pendingAny: pendingAny, anyBusy: anyBusy,
  live: live, songById: songById, setById: setById, demoSet: demoSet, newSongRow: newSongRow, commitSong: commitSong, deleteSong: deleteSong,
  itemsOf: itemsOf, commitSet: commitSet, marksOf: marksOf, getSheet: getSheet, saveSheet: saveSheet, hasSheet: hasSheet, sheetProgress: sheetProgress,
  touch: touch, apiPost: apiPost, demoId: WDemoId
});
})();
