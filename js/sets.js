/* Worship sets: list, paste from WhatsApp, set view, share link, offline download. */
(function () {
'use strict';
var WS = window.WS, W = window.WCore;
var h = WS.h, add = WS.add, icon = WS.icon, ib = WS.ib, toast = WS.toast, sheet = WS.sheet, S = WS.S, views = WS.views;
var go = WS.go, render = WS.render, live = WS.live, songById = WS.songById, itemsOf = WS.itemsOf, commitSet = WS.commitSet, commitSong = WS.commitSong;

WS.itemTitle = function (it) { var s = it.t === 'song' ? songById(it.song) : null; return s ? s.title : (it.title || 'Song not found'); };
WS.itemKeyLine = function (it) { var k = it.key || (songById(it.song) || {}).key || ''; return k ? k + (it.to ? ' → ' + it.to : '') : ''; };

function setCard(set) {
  var items = itemsOf(set), songs = items.filter(function (i) { return i.t === 'song'; }).length, cues = items.length - songs;
  return h('button', { class: 'li', type: 'button', onclick: function () { go({ k: 'set', id: set.id }); } },
    h('div', { class: 'm' }, h('small', { text: set.date ? W.fmtDate(set.date, true) : 'No date' }), h('b', { text: set.name || 'Untitled set' }),
      h('small', { text: songs + (songs === 1 ? ' song' : ' songs') + (cues ? ' · ' + cues + (cues === 1 ? ' cue' : ' cues') : '') })),
    set.id === 'demo-set' ? h('span', { class: 'tag demo', text: 'Demo' }) : null);
}
views.sets = function () {
  var page = h('div', { class: 'page' });
  page.appendChild(WS.topBar('Sets', { noBack: true, actions: ib('gear', 'Settings', function () { WS.settingsSheet(); }) }));
  page.appendChild(h('button', { class: 'btn pri block', style: { minHeight: '56px', fontSize: '17px', margin: '6px 0 4px' }, type: 'button', onclick: function () { PASTE = null; go({ k: 'paste', fresh: true }); }, html: icon('plus') + '<span>New from WhatsApp</span>' }));
  var sets = live(S.sets), today = W.todayISO();
  var up = sets.filter(function (s) { return !s.date || s.date >= today; }).sort(function (a, b) { return (a.date || '9999') < (b.date || '9999') ? -1 : 1; });
  var past = sets.filter(function (s) { return s.date && s.date < today; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  if (!sets.length) {
    page.appendChild(h('div', { class: 'card', style: { marginTop: '14px' } }, h('b', { text: 'No sets yet' }),
      h('p', { class: 'note', text: 'Paste the song list from the WhatsApp group and it turns into a set.' }),
      h('button', { class: 'btn', text: 'Try it with the Doa Puasa list', onclick: function () { PASTE = null; go({ k: 'paste', sample: true }); } })));
    if (!S.conn) page.appendChild(h('p', { class: 'note', text: 'Everything works on this device without a connection. Tap the pill at the top to connect your Sheet.' }));
  }
  if (up.length) { page.appendChild(h('h2', { class: 'sec', text: 'Upcoming' })); up.forEach(function (s) { page.appendChild(setCard(s)); }); }
  if (past.length) { page.appendChild(h('h2', { class: 'sec', text: 'Past' })); past.forEach(function (s) { page.appendChild(setCard(s)); }); }
  page.appendChild(h('h2', { class: 'sec', text: 'Demo' }));
  page.appendChild(setCard(WS.setById('demo-set')));
  var off = WS.on('data', function () { render(true); });
  WS.onLeave(off);
  return h('div', { class: 'scroll' }, page);
};

/* ---------- Paste from WhatsApp ---------- */
var SAMPLE = 'Shalomm..\n\nBerikut list lagu Doa Puasa\n\nAllah Sanggup (Fero) E/F\nhttps://youtube.com/watch?v=J9zNq2vV2WQ&si=10LSDR-JZZIRCaKmr\n\nI will Run to You (Jess) E/F\nhttps://youtu.be/8Q6FTjogqE0?si=TBRpdFpnFKmXDYyt\n\nKau Tetap Allah (betapa dahsyat) F/G\n\nDOA\n\nSaatku MenyembahMu / Reff Only (Fero) F\nhttps://youtube.com/watch?v=-wc5MUdvrV4&si=gf3hOhdPO0eh-pFIM\nhttps://youtube.com/watch?v=GS4hVB-Jmql&si=AxYEo4Hcux070NfH';
var PASTE = null;
WS.PASTE_SAMPLE = SAMPLE;

views.paste = function (v) {
  if (!PASTE || v.fresh) PASTE = null;
  if (!PASTE) PASTE = { text: v.sample ? SAMPLE : '', draft: null };
  v.fresh = false;
  var page = h('div', { class: 'page' });
  page.appendChild(WS.topBar('New set', { noPill: true }));
  if (!PASTE.draft) {
    var read;
    var ta = h('textarea', { rows: 12, placeholder: 'Paste the WhatsApp message here', 'aria-label': 'WhatsApp message', autocapitalize: 'off', spellcheck: 'false', style: { minHeight: '220px' } });
    ta.value = PASTE.text;
    ta.addEventListener('input', function () { PASTE.text = ta.value; read.disabled = !ta.value.trim(); });
    read = h('button', { class: 'btn pri grow', text: 'Read the list', onclick: function () {
      PASTE.text = ta.value;
      var res = W.parseWhatsApp(PASTE.text, { today: W.todayISO() });
      if (!res.items.length) { toast('No songs found in that text. Check it is the song list.'); return; }
      PASTE.draft = makeDraft(res);
      render();
    } });
    read.disabled = !ta.value.trim();
    page.appendChild(h('p', { class: 'note', text: 'Copy the song list message in WhatsApp, then paste it here. You can fix everything before saving.' }));
    page.appendChild(ta);
    var row = h('div', { class: 'row', style: { marginTop: '12px' } });
    if (navigator.clipboard && navigator.clipboard.readText) {
      row.appendChild(h('button', { class: 'btn grow', text: 'Paste from clipboard', onclick: function () {
        navigator.clipboard.readText().then(function (t) { ta.value = t; PASTE.text = t; read.disabled = !t.trim(); }).catch(function () { toast('Paste is blocked here. Press and hold in the box and choose Paste.'); });
      } }));
    }
    row.appendChild(read);
    page.appendChild(row);
    return h('div', { class: 'scroll' }, page);
  }
  return h('div', { class: 'scroll' }, pasteDraftView(page));
};

function makeDraft(res) {
  var lib = live(S.songs);
  return {
    name: res.name || 'Service', date: res.date || W.todayISO(), ignored: res.ignored,
    items: res.items.map(function (it) {
      if (it.t === 'cue') return { t: 'cue', text: it.text, orig: it.orig };
      var m = W.matchSong(it.title, lib);
      return Object.assign({}, it, { match: m, useMatch: !!m });
    })
  };
}
function pasteDraftView(page) {
  var D = PASTE.draft;
  page.appendChild(h('div', { class: 'kv' },
    h('label', { class: 'fld' }, h('small', { text: 'Set name' }), h('input', { type: 'text', value: D.name, oninput: function (e) { D.name = e.target.value; } })),
    h('label', { class: 'fld' }, h('small', { text: 'Date' }), h('input', { type: 'date', value: D.date, oninput: function (e) { D.date = e.target.value; } }))));
  page.appendChild(h('h2', { class: 'sec', text: 'What I found' }));
  D.items.forEach(function (it, idx) { page.appendChild(pasteRow(D, it, idx)); });
  if (D.ignored && D.ignored.length) page.appendChild(h('p', { class: 'note', text: 'Skipped lines: ' + D.ignored.join(' · ') }));
  page.appendChild(h('div', { class: 'row', style: { marginTop: '16px' } },
    h('button', { class: 'btn grow', text: 'Back to text', onclick: function () { PASTE.draft = null; render(); } }),
    h('button', { class: 'btn pri grow', text: 'Save set', onclick: function () { savePasteDraft(); } })));
  return page;
}
function pasteRow(D, it, idx) {
  var card = h('div', { class: 'card', style: { marginBottom: '10px' } });
  function remove() { D.items.splice(idx, 1); render(true); }
  if (it.t === 'cue') {
    card.appendChild(h('div', { class: 'row' }, h('span', { class: 'tag hit', text: 'Cue' }),
      h('input', { type: 'text', value: it.text, 'aria-label': 'Cue text', oninput: function (e) { it.text = e.target.value; } }), ib('close', 'Remove', remove)));
    if (it.orig && it.orig !== it.text) card.appendChild(h('div', { class: 'small', style: { marginTop: '6px' }, text: 'Written as "' + it.orig + '" in the message' }));
    return card;
  }
  card.appendChild(h('div', { class: 'row' }, h('span', { class: 'tag', text: String(idx + 1) }),
    h('input', { type: 'text', value: it.title, 'aria-label': 'Song title', oninput: function (e) { it.title = e.target.value; } }), ib('close', 'Remove', remove)));
  var kv = h('div', { class: 'kv', style: { marginTop: '8px', gridTemplateColumns: '1fr 1fr 1.4fr' } });
  kv.appendChild(h('div', { class: 'fld' }, h('small', { text: 'Key' }), WS.keySelect(it.key, function (v) { it.key = v; }, true)));
  kv.appendChild(h('div', { class: 'fld' }, h('small', { text: it.keyMode === 'alt' ? 'Alt key' : 'Modulates to' }), WS.keySelect(it.to, function (v) { it.to = v; render(true); }, true)));
  kv.appendChild(h('div', { class: 'fld' }, h('small', { text: 'Singer' }), h('input', { type: 'text', value: it.singer, 'aria-label': 'Singer', oninput: function (e) { it.singer = e.target.value; } })));
  card.appendChild(kv);
  if (it.to) {
    card.appendChild(h('div', { style: { marginTop: '8px' } }, h('div', { class: 'seg', role: 'group', 'aria-label': 'What the second key means' },
      h('button', { type: 'button', class: it.keyMode !== 'alt' ? 'on' : '', text: 'Modulates', onclick: function () { it.keyMode = 'mod'; render(true); } }),
      h('button', { type: 'button', class: it.keyMode === 'alt' ? 'on' : '', text: 'Alt key', onclick: function () { it.keyMode = 'alt'; render(true); } }))));
  }
  card.appendChild(h('label', { class: 'fld', style: { marginTop: '8px' } }, h('small', { text: 'Note' }), h('input', { type: 'text', value: it.note, oninput: function (e) { it.note = e.target.value; if (/chorus only/i.test(it.note)) it.only = 'chorus'; } })));
  card.appendChild(h('label', { class: 'row', style: { minHeight: '44px', marginTop: '4px' } }, h('input', { type: 'checkbox', style: { width: '22px', height: '22px' }, checked: it.only === 'chorus' ? true : null, onchange: function (e) { it.only = e.target.checked ? 'chorus' : ''; if (e.target.checked && !/chorus only/i.test(it.note)) it.note = (it.note ? it.note + '; ' : '') + 'Chorus only'; render(true); } }), h('span', { text: 'Play the chorus only' })));
  if (it.warn) card.appendChild(h('div', { style: { marginTop: '4px' } }, h('span', { class: 'tag hit', text: it.warn })));
  it.links.forEach(function (l, li) {
    card.appendChild(h('div', { class: 'row', style: { marginTop: '6px' } },
      h('span', { class: 'tag' + (l.valid ? ' ok' : ' hit'), text: l.valid ? 'Link OK' : (l.id ? 'Bad video id' : 'Not a YouTube link') }),
      h('span', { class: 'grow small', text: l.valid ? l.id : l.orig }), ib('close', 'Remove link', function () { it.links.splice(li, 1); render(true); })));
  });
  if (it.match) {
    card.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } },
      h('span', { class: 'tag' + (it.useMatch ? ' ok' : ''), text: it.useMatch ? 'In your library' : 'New song' }),
      h('span', { class: 'small grow', text: it.useMatch ? it.match.title : 'Will be added as a new song' }),
      h('button', { class: 'btn sm ghost', text: it.useMatch ? 'Add as new' : 'Use library', onclick: function () { it.useMatch = !it.useMatch; render(true); } })));
  } else card.appendChild(h('div', { style: { marginTop: '8px' } }, h('span', { class: 'tag', text: 'New song' })));
  return card;
}
function savePasteDraft() {
  var D = PASTE.draft, items = [], newSongs = 0;
  D.items.forEach(function (it) {
    if (it.t === 'cue') { if (it.text.trim()) items.push({ t: 'cue', text: it.text.trim() }); return; }
    if (!it.title.trim()) return;
    var yt = it.links.filter(function (l) { return l.valid; }).map(function (l) { return l.url + (l.label ? ' ' + l.label : ''); });
    var song;
    if (it.useMatch && it.match) {
      song = it.match;
      var have = W.parseYtList(song.yt).map(function (l) { return l.id; });
      var addYt = yt.filter(function (u) { return have.indexOf(W.extractYouTube(u.split(' ')[0]).id) < 0; });
      var changed = false;
      if (addYt.length) { song.yt = (song.yt ? song.yt + '\n' : '') + addYt.join('\n'); changed = true; }
      if (!song.key && it.key) { song.key = it.key; changed = true; }
      if (changed) commitSong(song);
    } else {
      song = WS.newSongRow({ title: it.title.trim(), key: it.key, yt: yt.join('\n') });
      commitSong(song); newSongs++;
    }
    var item = { t: 'song', song: song.id, title: song.title, key: it.key || song.key || '', singer: it.singer || '', note: it.note || '', only: it.only || '', trans: '' };
    if (it.to) { if (it.keyMode === 'alt') item.alt = it.to; else item.to = it.to; }
    items.push(item);
  });
  if (!items.length) { toast('Nothing to save yet.'); return; }
  var set = W.normRow({ id: W.uid(), date: D.date, name: (D.name || 'Service').trim(), items: JSON.stringify(items), raw: PASTE.text, updated: W.nowISO() }, W.SET_COLS);
  commitSet(set);
  PASTE = null;
  WS.NAV.stack.pop();
  go({ k: 'set', id: set.id });
  toast('Saved' + (newSongs ? '. ' + newSongs + (newSongs === 1 ? ' new song added to the library' : ' new songs added to the library') : ''));
}

/* ---------- set view ---------- */
views.set = function (v) {
  var set = WS.setById(v.id);
  var page = h('div', { class: 'page' });
  if (!set || set.deleted === '1') {
    page.appendChild(WS.topBar('Set'));
    page.appendChild(h('div', { class: 'card' }, h('b', { text: 'This set is gone' }), h('button', { class: 'btn', style: { marginTop: '10px' }, text: 'Back to Sets', onclick: function () { WS.setTab('sets'); } })));
    return h('div', { class: 'scroll' }, page);
  }
  var items = itemsOf(set), isDemo = set.id === 'demo-set';
  page.appendChild(h('div', { class: 'top' }, ib('back', 'Back', WS.back), h('div', { class: 'ttl' }, h('div', { class: 's', text: set.date ? W.fmtDate(set.date, true) : 'No date' }), h('div', { class: 't', style: { fontSize: '22px' }, text: set.name || 'Untitled set' })),
    isDemo ? null : ib('edit', 'Edit name and date', function () { editSetMeta(set); })));
  var hasAny = items.some(function (i) { return i.t === 'song'; });
  page.appendChild(h('div', { class: 'row', style: { margin: '8px 0 6px' } },
    h('button', { class: 'btn pri grow', style: { minHeight: '52px' }, text: 'Live', disabled: hasAny ? null : true, onclick: function () { go({ k: 'song', mode: 'live', setId: set.id, idx: firstSong(items) }); } }),
    h('button', { class: 'btn grow', style: { minHeight: '52px' }, text: 'Listen', disabled: hasAny ? null : true, onclick: function () { go({ k: 'song', mode: 'listen', setId: set.id, idx: firstSong(items) }); } }),
    h('button', { class: 'btn', style: { minHeight: '52px' }, text: 'Share', disabled: hasAny ? null : true, onclick: function () { openShare(set); } })));
  var dlBox = h('div');
  page.appendChild(dlBox);
  drawDownload(dlBox, set);
  if (!items.length) page.appendChild(h('p', { class: 'note', text: 'Nothing in this set yet.' }));
  items.forEach(function (it, i) {
    var m = h('div', { class: 'm' });
    var s = it.t === 'song' ? songById(it.song) : null;
    if (it.t === 'cue') {
      m.appendChild(h('b', { text: it.text }));
      if (it.trans) m.appendChild(h('small', { text: it.trans }));
    } else {
      m.appendChild(h('b', { text: WS.itemTitle(it) }));
      var line = [it.singer || '', it.only === 'chorus' ? 'Chorus only' : '', !s ? 'Not in library' : (!WS.hasSheet(s.id) ? 'No lead sheet' : '')].filter(Boolean).join(' · ');
      if (line) m.appendChild(h('small', { text: line }));
      if (s && s.audio) m.appendChild(h('small', { text: WS.Audio.state(s.audio) === 'device' ? 'Audio on this device' : 'Audio in Drive' }));
    }
    var row = h('div', { class: 'li' + (it.t === 'cue' ? ' cue' : '') },
      h('button', { type: 'button', class: 'row grow', style: { textAlign: 'left', minHeight: '44px' }, 'aria-label': 'Open ' + WS.itemTitle(it), onclick: function () { if (!isDemo) editItem(set, i); else if (s) go({ k: 'song', id: s.id, mode: 'live' }); } }, h('span', { class: 'n', text: String(i + 1) }), m),
      h('span', { class: 'k', text: it.t === 'song' ? WS.itemKeyLine(it) : '' }),
      isDemo ? null : ib('up', 'Move up', function () { moveItem(set, i, -1); }, i === 0 ? 'dis' : ''),
      isDemo ? null : ib('down', 'Move down', function () { moveItem(set, i, 1); }, i === items.length - 1 ? 'dis' : ''));
    page.appendChild(row);
  });
  if (!isDemo) {
    page.appendChild(h('div', { class: 'row', style: { marginTop: '14px' } },
      h('button', { class: 'btn grow', html: icon('plus') + '<span>Song</span>', onclick: function () { addSongToSet(set); } }),
      h('button', { class: 'btn grow', html: icon('plus') + '<span>Cue</span>', onclick: function () { addCueToSet(set); } })));
    page.appendChild(h('button', { class: 'btn bad ghost block', style: { marginTop: '18px' }, text: 'Delete this set', onclick: function () {
      WS.confirmSheet('Delete this set?', 'The songs stay in your library.', 'Delete set', function () { set.deleted = '1'; commitSet(set); WS.setTab('sets'); toast('Set deleted'); }, true);
    } }));
  }
  var off = WS.on('audio', function () { drawDownload(dlBox, set); });
  WS.onLeave(off);
  return h('div', { class: 'scroll' }, page);
};
function firstSong(items) { for (var i = 0; i < items.length; i++) if (items[i].t === 'song') return i; return 0; }

// "Download for offline": every song in the set that has audio in Drive
function drawDownload(box, set) {
  WS.clear(box);
  var A = WS.Audio;
  var songs = itemsOf(set).filter(function (i) { return i.t === 'song'; }).map(function (i) { return songById(i.song); }).filter(function (s) { return s && s.audio; });
  if (!songs.length) { return; }
  var uniq = {}; songs = songs.filter(function (s) { if (uniq[s.audio]) return false; uniq[s.audio] = 1; return true; });
  var todo = songs.filter(function (s) { return A.state(s.audio) !== 'device'; });
  var card = h('div', { class: 'card', style: { margin: '8px 0' } });
  if (!todo.length) {
    card.appendChild(h('div', { class: 'row' }, h('span', { class: 'tag ok', text: 'Ready offline' }), h('span', { class: 'small', text: 'All ' + songs.length + ' audio files are on this device.' })));
    box.appendChild(card); return;
  }
  var prog = h('div', { class: 'prog hide', style: { marginTop: '8px' } }, h('i')), msg = h('div', { class: 'small', style: { marginTop: '6px' } }), err = h('div', { class: 'err' });
  var btn = h('button', { class: 'btn acc block', html: icon('dl') + '<span>Download for offline (' + todo.length + ' of ' + songs.length + ')</span>', onclick: function () {
    err.textContent = ''; btn.disabled = true; prog.classList.remove('hide');
    var i = 0, cancelled = false;
    var cancel = h('button', { class: 'btn ghost block', text: 'Cancel', onclick: function () { cancelled = true; if (todo[i]) A.cancel(todo[i].audio); } });
    card.appendChild(cancel);
    (function next() {
      if (cancelled || i >= todo.length) { drawDownload(box, set); return; }
      var s = todo[i];
      msg.textContent = (i + 1) + ' of ' + todo.length + ': ' + s.title;
      A.download(s.audio, { name: s.audioName, onProgress: function (p, n) { prog.firstChild.style.width = Math.round(((i + p / n) / todo.length) * 100) + '%'; } }).then(function () { i++; next(); }).catch(function (e) {
        err.textContent = s.title + ': ' + ((e && e.message) || 'The download failed.'); btn.disabled = false; if (cancel.parentNode) cancel.parentNode.removeChild(cancel);
      });
    })();
  } });
  card.appendChild(btn); card.appendChild(prog); card.appendChild(msg); card.appendChild(err);
  box.appendChild(card);
}

function moveItem(set, i, d) {
  var items = itemsOf(set), j = i + d;
  if (j < 0 || j >= items.length) return;
  var t = items[i]; items[i] = items[j]; items[j] = t;
  commitSet(set, items); render(true);
}
function editSetMeta(set) {
  var name = h('input', { type: 'text', value: set.name }), date = h('input', { type: 'date', value: set.date });
  var s = sheet([h('h3', { text: 'Set' }), h('label', { class: 'fld' }, h('small', { text: 'Name' }), name), h('label', { class: 'fld' }, h('small', { text: 'Date' }), date),
    h('button', { class: 'btn pri block', text: 'Save', onclick: function () { set.name = name.value.trim() || 'Service'; set.date = date.value; commitSet(set); s.close(); render(true); } })]);
}
function addCueToSet(set) {
  var inp = h('input', { type: 'text', placeholder: 'Prayer, Offering, Sermon…', autocapitalize: 'sentences' });
  var s = sheet([h('h3', { text: 'Add a cue' }), h('p', { class: 'note', text: 'A moment in the service that is not a song.' }), inp,
    h('div', { class: 'row', style: { flexWrap: 'wrap' } }, ['Prayer', 'Offering', 'Sermon', 'Communion', 'Announcements'].map(function (c) { return h('button', { class: 'chip', type: 'button', text: c, onclick: function () { inp.value = c; } }); })),
    h('button', { class: 'btn pri block', text: 'Add', onclick: function () { if (!inp.value.trim()) { toast('Type a name first'); return; } var items = itemsOf(set); items.push({ t: 'cue', text: inp.value.trim() }); commitSet(set, items); s.close(); render(true); } })]);
}
function addSongToSet(set) {
  var list = h('div'), q = h('input', { type: 'search', placeholder: 'Search songs', 'aria-label': 'Search songs' });
  function draw() {
    WS.clear(list);
    var t = W.normTitle(q.value);
    var songs = live(S.songs).filter(function (s) { return !t || W.normTitle(s.title + ' ' + s.artist).indexOf(t) >= 0; }).sort(function (a, b) { return a.title.localeCompare(b.title); });
    songs.forEach(function (sg) {
      list.appendChild(h('button', { class: 'li', type: 'button', onclick: function () {
        var items = itemsOf(set); items.push({ t: 'song', song: sg.id, title: sg.title, key: sg.key, singer: '', note: '', only: '', trans: '' });
        commitSet(set, items); s.close(); render(true);
      } }, h('div', { class: 'm' }, h('b', { text: sg.title }), h('small', { text: sg.artist || '' })), sg.key ? h('span', { class: 'k', text: sg.key }) : null));
    });
    if (!songs.length) list.appendChild(h('p', { class: 'note', text: t ? 'No match.' : 'The library is empty.' }));
    if (t) list.appendChild(h('button', { class: 'btn block', style: { marginTop: '10px' }, text: 'Add "' + q.value.trim() + '" as a new song', onclick: function () {
      var sg = WS.newSongRow({ title: q.value.trim() }); commitSong(sg);
      var items = itemsOf(set); items.push({ t: 'song', song: sg.id, title: sg.title, key: '', singer: '', note: '', only: '', trans: '' });
      commitSet(set, items); s.close(); render(true);
    } }));
  }
  q.addEventListener('input', draw);
  var s = sheet([h('h3', { text: 'Add a song' }), q, list]);
  draw();
}
function editItem(set, i) {
  var items = itemsOf(set), it = items[i], s;
  function save() { commitSet(set, items); }
  if (it.t === 'cue') {
    var ci = h('input', { type: 'text', value: it.text }), ct = h('input', { type: 'text', value: it.trans || '', placeholder: 'e.g. pad under the prayer' });
    s = sheet([h('h3', { text: 'Cue' }), h('label', { class: 'fld' }, h('small', { text: 'Text' }), ci), h('label', { class: 'fld' }, h('small', { text: 'Keyboard note' }), ct),
      h('div', { class: 'row' }, h('button', { class: 'btn bad grow', text: 'Remove', onclick: function () { items.splice(i, 1); save(); s.close(); render(true); } }),
        h('button', { class: 'btn pri grow', text: 'Save', onclick: function () { it.text = ci.value.trim() || it.text; it.trans = ct.value.trim(); save(); s.close(); render(true); } }))]);
    return;
  }
  var song = songById(it.song);
  var keySel = WS.keySelect(it.key || (song && song.key) || '', function (v) { it.key = v; }, true);
  var toSel = WS.keySelect(it.to || '', function (v) { it.to = v; }, true);
  var singer = h('input', { type: 'text', value: it.singer || '' }), note = h('input', { type: 'text', value: it.note || '' });
  var trans = h('input', { type: 'text', value: it.trans || '', placeholder: 'e.g. keep pad, go to F' });
  var only = h('input', { type: 'checkbox', style: { width: '22px', height: '22px' }, checked: it.only === 'chorus' ? true : null });
  s = sheet([h('h3', { text: WS.itemTitle(it) }),
    song && song.key ? h('p', { class: 'note', text: 'The chart is written in ' + song.key + '.' }) : h('p', { class: 'note', text: 'This song has no key yet, so the chart cannot be transposed.' }),
    h('div', { class: 'kv' }, h('label', { class: 'fld' }, h('small', { text: 'Key to play in' }), keySel), h('label', { class: 'fld' }, h('small', { text: 'Modulates to' }), toSel)),
    h('label', { class: 'fld' }, h('small', { text: 'Singer' }), singer), h('label', { class: 'fld' }, h('small', { text: 'Note' }), note),
    h('label', { class: 'fld' }, h('small', { text: 'Keyboard note into the next item' }), trans),
    h('label', { class: 'row', style: { minHeight: '44px' } }, only, h('span', { text: 'Play the chorus only' })),
    song ? h('div', { class: 'row' },
      h('button', { class: 'btn grow', text: 'Practice', onclick: function () { s.close(); go({ k: 'song', id: song.id, mode: 'practice', setId: set.id, idx: i }); } }),
      h('button', { class: 'btn grow', text: 'Open song', onclick: function () { s.close(); go({ k: 'song', id: song.id, mode: 'transcribe' }); } })) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn bad grow', text: 'Remove', onclick: function () { items.splice(i, 1); save(); s.close(); render(true); } }),
      h('button', { class: 'btn pri grow', text: 'Save', onclick: function () {
        it.singer = singer.value.trim(); it.note = note.value.trim(); it.trans = trans.value.trim(); it.only = only.checked ? 'chorus' : '';
        if (it.only === 'chorus' && !/chorus only/i.test(it.note)) it.note = (it.note ? it.note + '; ' : '') + 'Chorus only';
        if (!it.to) delete it.to;
        save(); s.close(); render(true);
      } }))]);
}

/* ---------- share link (read-only roadmap) ---------- */
function roadmapOf(song) {
  var sh = song && WS.getSheet(song.id);
  if (!sh || !sh.bars) return [];
  var out = [];
  W.sheetSections(sh).forEach(function (s) {
    var times = 0; for (var i = s.from; i <= s.to; i++) if (sh.bars[i].repEnd && sh.bars[i].times > 1) times = sh.bars[i].times;
    var name = (s.label || s.mark || 'Part');
    out.push(name + (times > 1 ? ' x' + times : ''));
    var kc = sh.bars[s.from] && sh.bars[s.from].key; if (kc) out.push('Key ' + kc);
  });
  return out;
}
function buildShare(set, dropCues) {
  var items = itemsOf(set), out = [];
  items.forEach(function (it) {
    if (it.t === 'cue') { if (!dropCues) out.push({ c: it.text }); return; }
    var s = songById(it.song);
    var o = { s: WS.itemTitle(it), k: it.key || (s && s.key) || '' };
    if (it.to) o.t = it.to;
    if (s && s.bpm) o.b = Number(s.bpm);
    if (it.singer) o.g = it.singer;
    if (it.note) o.o = it.note;
    if (it.only === 'chorus') o.y = 1;
    var r = roadmapOf(s); if (r.length) o.r = r;
    out.push(o);
  });
  return { v: 1, n: set.name, d: set.date, m: new Date().toISOString().slice(0, 10), i: out };
}
function openShare(set) {
  var body = h('div', { class: 'col' }, h('p', { class: 'note', text: 'Making the link…' }));
  var s = sheet([h('h3', { text: 'Share with the team' }), body]);
  W.encodeShare(buildShare(set, false)).then(function (code) {
    if (code.length > 2000) return W.encodeShare(buildShare(set, true)).then(function (c2) { return { code: c2, trimmed: true }; });
    return { code: code };
  }).then(function (r) {
    var url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'index.html#share=' + r.code;
    WS.clear(body);
    add(body, h('p', { class: 'note', text: 'Anyone with the link sees the order, keys, BPM and roadmap. No chords and no login.' + (r.trimmed ? ' The link was long, so the cues are left out.' : '') }),
      h('div', { class: 'sharebox', text: url }),
      h('div', { class: 'row' },
        navigator.share ? h('button', { class: 'btn pri grow', text: 'Share…', onclick: function () { navigator.share({ title: set.name, url: url }).catch(function () { /* cancelled */ }); } }) : null,
        h('button', { class: 'btn grow', text: 'Copy link', onclick: function () { copyLink(url); } })));
  }).catch(function () { WS.clear(body); add(body, h('p', { class: 'note', text: 'Could not make the link on this device.' })); });
}
function copyLink(url) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { toast('Link copied.'); }).catch(function () { toast('Copy is blocked here. Press and hold the link to copy it.'); });
  else toast('Press and hold the link to copy it.');
}
views.share = function (v) {
  var page = h('div', { class: 'page' }, h('p', { class: 'note', text: 'Loading…' }));
  W.decodeShare(v.code).then(function (p) {
    WS.clear(page);
    add(page, h('div', { class: 'top' }, h('div', { class: 'ttl' }, h('div', { class: 's', text: p.d ? W.fmtDate(p.d, true) : '' }), h('div', { class: 't', style: { fontSize: '24px' }, text: p.n || 'Set' }))),
      h('p', { class: 'note', text: 'Shared on ' + (p.m || '') + '. Read-only.' }));
    var n = 0;
    (p.i || []).forEach(function (x) {
      if (x.c) { add(page, h('div', { class: 'li cue' }, h('div', { class: 'm' }, h('b', { text: x.c })))); return; }
      n++;
      var meta = [x.k ? x.k + (x.t ? ' → ' + x.t : '') : '', x.b ? x.b + ' BPM' : '', x.g || '', x.y ? 'Chorus only' : ''].filter(Boolean).join(' · ');
      var m = h('div', { class: 'm' }, h('b', { text: n + '. ' + x.s }), h('small', { text: meta }));
      if (x.o) m.appendChild(h('small', { text: x.o }));
      if (x.r && x.r.length) m.appendChild(h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px', marginTop: '5px' } }, x.r.map(function (r) { return h('span', { class: 'tag', text: r }); })));
      add(page, h('div', { class: 'li' }, m));
    });
  }).catch(function () { WS.clear(page); add(page, h('p', { class: 'err', text: 'This link is damaged or incomplete. Ask for a new one.' })); });
  return h('div', { class: 'scroll' }, page);
};

/* song screen dispatcher */
views.song = function (v) {
  var mode = v.mode || 'transcribe';
  WS.lsSet('ws-lastmode', mode);
  if (mode === 'live') return WS.viewLive(v);
  if (mode === 'listen') return WS.viewListen(v);
  if (mode === 'practice') return WS.viewPractice(v);
  return WS.viewTranscribe(v);
};
views.keys = function (v) { return WS.viewKeys(v); };
})();
