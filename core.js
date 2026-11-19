/* Worship core: pure logic, no DOM. Works as a plain <script> and with require() in Node. */
(function (root) {
'use strict';

/* ---------- notes, keys ---------- */
var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
var NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
var FLAT_MAJOR_ROOTS = [5, 10, 3, 8, 1, 6]; // F Bb Eb Ab Db Gb

function mod12(n) { return ((n % 12) + 12) % 12; }

function noteIndex(name) {
  var m = /^([A-G])([#b]?)$/.exec(name);
  if (!m) return -1;
  return mod12(NAT[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0));
}

function noteName(pc, flats) { return (flats ? FLAT : SHARP)[mod12(pc)]; }

// "E", "F#m", "Bb", "C#min" -> {root, minor, acc}
function parseKey(s) {
  if (s == null) return null;
  var t = String(s).replace(/♯/g, '#').replace(/♭/g, 'b');
  var m = /^\s*([A-G])([#b]?)\s*(m|min|minor|maj|major|M)?\s*$/.exec(t);
  if (!m) return null;
  var root = noteIndex(m[1] + m[2]);
  return { root: root, minor: m[3] === 'm' || m[3] === 'min' || m[3] === 'minor', acc: m[2] };
}

function relMajorRoot(root, minor) { return minor ? mod12(root + 3) : root; }

function flatsForRoot(root, minor) {
  return FLAT_MAJOR_ROOTS.indexOf(relMajorRoot(root, minor)) >= 0;
}

// Spelling for a written key string: explicit accidental wins, else by the key's family.
function usesFlats(keyStr) {
  var k = parseKey(keyStr);
  if (!k) return false;
  if (k.acc === 'b') return true;
  if (k.acc === '#') return false;
  return flatsForRoot(k.root, k.minor);
}

function keyLabel(root, minor) { return noteName(root, flatsForRoot(root, minor)) + (minor ? 'm' : ''); }

function transposeKeyName(keyStr, semis) {
  var k = parseKey(keyStr);
  if (!k) return keyStr;
  var r = mod12(k.root + semis);
  return keyLabel(r, k.minor);
}

function semitoneShift(fromKey, toKey) {
  var a = parseKey(fromKey), b = parseKey(toKey);
  if (!a || !b) return 0;
  return mod12(b.root - a.root);
}

/* ---------- chords ---------- */
var QUAL = '(?:maj|min|dim|aug|sus|add|m|M|\\+|°|ø|-|\\d+|[#b]\\d+)*';
var CHORD_RE = new RegExp('^(\\^)?([A-G][#b]?)(' + QUAL + ')(?:\\/([A-G][#b]?))?(!)?$');

function parseChord(tok) {
  if (/^\^?N\.?C\.?!?$/i.test(tok)) return { nc: true, raw: tok };
  var m = CHORD_RE.exec(tok);
  if (!m) return null;
  return { push: !!m[1], root: noteIndex(m[2]), qual: m[3] || '', bass: m[4] ? noteIndex(m[4]) : -1, hit: !!m[5], raw: tok };
}

var DEG_MAJOR = { 0: '1', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 11: '7' };
var DEG_CHROM = { 1: 'b2', 3: 'b3', 6: '#4', 8: 'b6', 10: 'b7' };
function degree(pc, refRoot) {
  var d = mod12(pc - refRoot);
  return DEG_MAJOR[d] || DEG_CHROM[d];
}

function chordText(c, o) {
  // o: {shift, flats, nash, ref}
  if (c.nc) return 'N.C.';
  var s;
  if (o.nash) {
    s = degree(c.root, o.ref) + c.qual + (c.bass >= 0 ? '/' + degree(c.bass, o.ref) : '');
  } else {
    s = noteName(c.root + o.shift, o.flats) + c.qual + (c.bass >= 0 ? '/' + noteName(c.bass + o.shift, o.flats) : '');
  }
  return s;
}

/* ---------- chart parsing ---------- */
function tokenize(s) {
  var out = [], i = 0, j;
  while (i < s.length) {
    var c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '|') { out.push({ k: 'bar' }); i++; continue; }
    if (c === '(') {
      j = s.indexOf(')', i);
      if (j < 0) j = s.length;
      out.push({ k: 'cue', text: s.slice(i + 1, j).trim() });
      i = j + 1; continue;
    }
    j = i;
    while (j < s.length && !/[\s|(]/.test(s[j])) j++;
    out.push({ k: 'w', text: s.slice(i, j) });
    i = j;
  }
  return out;
}

function canonSection(name) {
  var n = String(name).trim().replace(/\s+/g, ' ');
  var m = /^(pre[- ]?(?:reff?|chorus)|reff?|refrain|chorus|bait|verse|intro|bridge|interlude|tag|outro|ending|instrumental|inst|turnaround|vamp|coda)\b\s*(.*)$/i.exec(n);
  if (!m) return { name: n.charAt(0).toUpperCase() + n.slice(1), kind: n.toLowerCase().split(' ')[0] };
  var b = m[1].toLowerCase(), base;
  if (/^pre/.test(b)) base = 'Pre-Chorus';
  else if (/^(reff?|refrain|chorus)$/.test(b)) base = 'Chorus';
  else if (b === 'bait') base = 'Verse';
  else if (b === 'ending') base = 'Outro';
  else if (b === 'inst') base = 'Instrumental';
  else base = b.charAt(0).toUpperCase() + b.slice(1);
  var rest = m[2] ? ' ' + m[2] : '';
  return { name: base + rest, kind: base.toLowerCase() };
}

function parseKeyToken(rest, prevKey) {
  var t = rest.trim();
  if (!t) return { key: null, delta: null };
  var d = /^([+-])\s*(\d+)$/.exec(t);
  if (d) return { key: null, delta: (d[1] === '-' ? -1 : 1) * Number(d[2]) };
  return { key: parseKey(t), delta: null };
}

// Returns [{type:'sec'|'mod'|'text', ...}]
function parseChart(text) {
  var out = [];
  String(text || '').split(/\r?\n/).forEach(function (line) {
    var s = line.trim();
    if (!s) return;
    if (/^>>/.test(s)) {
      var r = s.replace(/^>>\s*/, '');
      var kk = parseKeyToken(r);
      out.push({ type: 'mod', key: kk.key, delta: kk.delta, raw: r });
      return;
    }
    var name = '', body = s, m = /^\[([^\]]*)\]\s*(.*)$/.exec(s);
    if (m) { name = m[1]; body = m[2]; }
    var toks = tokenize(body);
    var hasMusic = toks.some(function (t) { return t.k === 'bar' || (t.k === 'w' && (parseChord(t.text) || /^(?:[x×]\d+|\d+x)$/i.test(t.text))); });
    if (!m && !hasMusic) { out.push({ type: 'text', text: s }); return; }
    var sec = canonSection(name || '');
    var node = { type: 'sec', name: name ? sec.name : '', kind: name ? sec.kind : '', bars: [], rep: 0, cues: [] };
    var cur = null;
    function close() { if (cur && cur.chords.length) node.bars.push(cur); cur = null; }
    toks.forEach(function (t) {
      if (t.k === 'bar') { close(); return; }
      if (t.k === 'cue') { if (t.text) node.cues.push(t.text); return; }
      var rm = /^(?:[x×](\d+)|(\d+)x)$/i.exec(t.text);
      if (rm) { node.rep = Number(rm[1] || rm[2]); return; }
      var c = parseChord(t.text);
      if (c) { if (!cur) cur = { chords: [] }; cur.chords.push(c); return; }
      node.cues.push(t.text); // not a chord: shown as-is
    });
    close();
    out.push(node);
  });
  return out;
}

function firstChordKey(model) {
  for (var i = 0; i < model.length; i++) {
    if (model[i].type !== 'sec') continue;
    for (var b = 0; b < model[i].bars.length; b++) {
      var c = model[i].bars[b].chords[0];
      if (c && !c.nc) return { root: c.root, minor: /^m(?!aj)/.test(c.qual) || /^min/.test(c.qual), acc: '' };
    }
  }
  return null;
}

// Transpose / convert a chart into display strings.
// o: {songKey, key, shift?, nash?, only?}
function layoutChart(text, o) {
  o = o || {};
  var model = parseChart(text);
  var sk = parseKey(o.songKey), tk = parseKey(o.key);
  var shift = o.shift != null ? o.shift : (sk && tk ? mod12(tk.root - sk.root) : 0);
  var cur = sk || firstChordKey(model);
  var flats = tk ? usesFlats(o.key) : (cur ? flatsForRoot(mod12(cur.root + shift), cur.minor) : false);
  var lines = [];
  model.forEach(function (n) {
    if (n.type === 'text') { lines.push({ type: 'text', text: n.text }); return; }
    if (n.type === 'mod') {
      var nk = n.key;
      if (!nk && n.delta != null && cur) nk = { root: mod12(cur.root + n.delta), minor: cur.minor, acc: '' };
      if (nk) {
        cur = nk;
        flats = flatsForRoot(mod12(nk.root + shift), nk.minor);
        lines.push({ type: 'mod', label: keyLabel(mod12(nk.root + shift), nk.minor), root: mod12(nk.root + shift), minor: nk.minor });
      } else {
        lines.push({ type: 'mod', label: n.raw || '', root: -1, minor: false });
      }
      return;
    }
    var ref = cur ? relMajorRoot(cur.root, cur.minor) : 0;
    var co = { shift: shift, flats: flats, nash: !!o.nash, ref: ref };
    lines.push({
      type: 'sec', name: n.name, kind: n.kind, rep: n.rep, cues: n.cues.slice(),
      bars: n.bars.map(function (b) {
        return { chords: b.chords.map(function (c) { return { t: chordText(c, co), push: !!c.push, hit: !!c.hit, nc: !!c.nc }; }) };
      })
    });
  });
  var filtered = false;
  if (o.only === 'chorus') {
    var keep = lines.filter(function (l) { return l.type === 'sec' && /^(chorus|tag)$/.test(l.kind); });
    if (keep.length) {
      filtered = true;
      lines = lines.filter(function (l, i) {
        if (l.type === 'sec') return /^(chorus|tag)$/.test(l.kind);
        if (l.type === 'mod') {
          for (var j = i + 1; j < lines.length; j++) {
            if (lines[j].type === 'mod') return false;
            if (lines[j].type === 'sec') return /^(chorus|tag)$/.test(lines[j].kind);
          }
          return false;
        }
        return false;
      });
    }
  }
  return { lines: lines, filtered: filtered, shift: shift, hasMod: model.some(function (n) { return n.type === 'mod'; }) };
}

function chordStr(c) { return (c.push ? '^' : '') + c.t + (c.hit ? '!' : ''); }

function formatLayout(lines) {
  return lines.map(function (l) {
    if (l.type === 'text') return l.text;
    if (l.type === 'mod') return '>> ' + l.label;
    var s = (l.name ? '[' + l.name + '] ' : '');
    s += l.bars.map(function (b) { return '| ' + b.chords.map(chordStr).join(' ') + ' '; }).join('') + (l.bars.length ? '|' : '');
    if (l.rep) s += ' x' + l.rep;
    if (l.cues.length) s += ' ' + l.cues.map(function (c) { return '(' + c + ')'; }).join(' ');
    return s.trim();
  }).join('\n');
}

function transposeChartText(text, o) { return formatLayout(layoutChart(text, o).lines); }

// Section names with repeats, for the share link and the Practice jump list
function roadmap(text, o) {
  var lay = layoutChart(text, o);
  var out = [];
  lay.lines.forEach(function (l) {
    if (l.type === 'mod') out.push('Key ' + l.label);
    else if (l.type === 'sec' && l.name) {
      out.push(l.name + (l.rep > 1 ? ' x' + l.rep : '') + (l.cues.length ? ' (' + l.cues.join(', ') + ')' : ''));
    }
  });
  return out;
}

function sectionNames(text) {
  var seen = {}, out = [];
  parseChart(text).forEach(function (n) {
    if (n.type === 'sec' && n.name && !seen[n.name]) { seen[n.name] = 1; out.push(n.name); }
  });
  return out;
}

function diatonicChords(keyStr) {
  var k = parseKey(keyStr);
  if (!k) return [];
  var flats = usesFlats(keyStr);
  var maj = [0, 2, 4, 5, 7, 9, 11], majQ = ['', 'm', 'm', '', '', 'm', 'dim'];
  var min = [0, 2, 3, 5, 7, 8, 10], minQ = ['m', 'dim', '', 'm', 'm', '', ''];
  var st = k.minor ? min : maj, q = k.minor ? minQ : majQ;
  return st.map(function (s, i) { return noteName(k.root + s, flats) + q[i]; });
}

/* ---------- YouTube ---------- */
function extractYouTube(url) {
  if (!url) return null;
  var s = String(url).trim();
  var m = /^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)(\/[^\s]*)?$/i.exec(s);
  if (!m) return null;
  var host = m[1].toLowerCase(), rest = m[2] || '/', id = '';
  var path = rest.split(/[?#]/)[0], query = (rest.split('?')[1] || '').split('#')[0];
  if (host === 'youtu.be') id = path.split('/')[1] || '';
  else {
    var seg = /^\/(?:shorts|embed|live|v)\/([^\/?#]*)/.exec(path);
    if (seg) id = seg[1];
    else {
      var q = /(?:^|&)v=([^&]*)/.exec(query);
      if (q) id = q[1];
    }
  }
  try { id = decodeURIComponent(id); } catch (e) { /* keep as is */ }
  return { id: id, valid: /^[A-Za-z0-9_-]{11}$/.test(id), url: id ? 'https://www.youtube.com/watch?v=' + id : s };
}

// "yt" column: one link per line, optional label after a space
function parseYtList(text) {
  var out = [];
  String(text || '').split(/\r?\n/).forEach(function (line) {
    var s = line.trim();
    if (!s) return;
    var i = s.search(/\s/), url = i < 0 ? s : s.slice(0, i), label = i < 0 ? '' : s.slice(i + 1).trim();
    var y = extractYouTube(url);
    out.push({ url: url, label: label, id: y ? y.id : '', valid: !!(y && y.valid) });
  });
  return out;
}

/* ---------- WhatsApp parser ---------- */
var MONTHS = { jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8, august: 8, sep: 9, sept: 9, september: 9, okt: 10, oct: 10, oktober: 10, october: 10, nov: 11, nop: 11, nopember: 11, november: 11, des: 12, dec: 12, desember: 12, december: 12 };

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function todayISO(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  var t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}

// -> {date:'yyyy-mm-dd', index, length} or null
function findDate(text, today) {
  today = today || todayISO();
  var ty = Number(today.slice(0, 4));
  function fix(y, m, d) {
    if (y < 100) y += 2000;
    return y;
  }
  function yearGuess(m, d) {
    var y = ty;
    var cand = new Date(y, m - 1, d), tdy = new Date(today + 'T00:00:00');
    if ((tdy - cand) / 864e5 > 45) y++;
    return y;
  }
  var re1 = /\b(\d{1,2})\s*[-\/.]?\s*([A-Za-z]{3,10})\.?(?:[\s,]+(\d{4}|\d{2})\b)?/g, m;
  while ((m = re1.exec(text))) {
    var mon = MONTHS[m[2].toLowerCase()];
    if (!mon) continue;
    var d = Number(m[1]), y = m[3] ? fix(Number(m[3])) : yearGuess(mon, d);
    if (validDate(y, mon, d)) return { date: y + '-' + pad2(mon) + '-' + pad2(d), index: m.index, length: m[0].length };
  }
  var re2 = /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}|\d{2}))?\b/g;
  while ((m = re2.exec(text))) {
    var dd = Number(m[1]), mm = Number(m[2]), yy = m[3] ? fix(Number(m[3])) : yearGuess(mm, dd);
    if (validDate(yy, mm, dd)) return { date: yy + '-' + pad2(mm) + '-' + pad2(dd), index: m.index, length: m[0].length };
  }
  return null;
}

var URL_RE = /(?:https?:\/\/|(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/)[^\s<>"']+/gi;

function cleanLine(line) {
  var s = line
    .replace(/[​-‏⁠﻿‪-‮]/g, '')
    .replace(/[   ]/g, ' ')
    .replace(/[️\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/\p{Extended_Pictographic}/gu, '');
  // WhatsApp export prefix: "[21/11/26 10:00] Name: " or "21/11/2026, 10.00 - Name: "
  s = s.replace(/^\s*\[?\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4},?\s+\d{1,2}[.:]\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?\]?\s*(?:-\s*)?[^:\n]{1,40}:\s+/, '');
  // strip *bold* _italic_ ~strike~ markers outside of links
  s = s.split(/(\s+)/).map(function (tk) {
    if (/^(?:https?:|www\.|m\.|music\.|youtu|youtube)/i.test(tk.replace(/^[*_~]+/, ''))) return tk.replace(/^[*_~]+|[*_~]+$/g, '');
    return tk.replace(/[*_~]/g, '');
  }).join('');
  s = s.replace(/^\s*(?:\d{1,2}[.)]\s+|[-•·▪▫●○◦*]\s+)/, '');
  return s.replace(/\s+/g, ' ').trim();
}

var CUE_MAP = {
  'doa': 'Prayer', 'prayer': 'Prayer', 'berdoa': 'Prayer', 'doa syafaat': 'Intercession', 'doa penutup': 'Closing prayer',
  'doa pembuka': 'Opening prayer', 'persembahan': 'Offering', 'offering': 'Offering', 'khotbah': 'Sermon', 'firman': 'Sermon',
  'sermon': 'Sermon', 'perjamuan kudus': 'Communion', 'perjamuan': 'Communion', 'komuni': 'Communion', 'pembacaan alkitab': 'Scripture',
  'bacaan alkitab': 'Scripture', 'ayat': 'Scripture', 'warta': 'Announcements', 'warta jemaat': 'Announcements', 'berkat': 'Benediction',
  'doa berkat': 'Benediction', 'amin': 'Amen'
};
var GREETING_RE = /^(?:shalo+m+|syalo+m+|salam|halo+|hai+|hi|hello|selamat|pagi|siang|sore|malam|gbu|tuhan\s+(?:yesus\s+)?(?:memberkati|berkati)|terima\s*kasih|makasih|thanks?|tks|ok(?:e|ay)?|noted|sip|baik|amin)\b/i;
var HEADER_RE = /\b(?:berikut|list\s+lagu|daftar\s+lagu|setlist|set\s+list|lagu\s+untuk|lagu\s+(?:ibadah|minggu|hari))\b/i;
var KEY_TOK = '[A-G][#b]?m?';
var KEY_END_RE = new RegExp('(?:^|\\s)(?:(?:key|nada(?:\\s+dasar)?|kunci)\\s*[:=]?\\s*)?(' + KEY_TOK + ')(?:\\s*(?:\\/|->|→|>|-|–|to|ke)\\s*(' + KEY_TOK + '))?\\s*$', 'i');

function normKeyTok(k) {
  if (!k) return '';
  var m = /^([A-Ga-g])([#b]?)(m?)$/.exec(k);
  if (!m) return '';
  return m[1].toUpperCase() + m[2] + m[3].toLowerCase();
}

function titleCase(s) { return s.toLowerCase().replace(/(^|\s)(\S)/g, function (a, b, c) { return b + c.toUpperCase(); }); }

function extractLinks(str) {
  var links = [], rest = str.replace(URL_RE, function (u) {
    u = u.replace(/[),.;]+$/, '');
    var y = extractYouTube(u);
    links.push({ url: y ? y.url : u, id: y ? y.id : '', valid: !!(y && y.valid), label: '', orig: u });
    return ' ';
  });
  return { links: links, rest: rest.replace(/\s+/g, ' ').trim() };
}

// Parse one "Title (singer) E/F" line. Returns item or null when no title.
function parseSongLine(s) {
  var singer = '', noteParts = [], only = '', key = '', to = '', parenKey = '';
  var work = s;
  // "/ Reff Only"
  var ro = /\s*[\/\-–|,]*\s*\b(?:reff?|refr?ain|chorus|korus)\s+(?:only|saja|aja)\b\.?/i;
  if (ro.test(work)) { only = 'chorus'; work = work.replace(ro, ' '); }
  // parentheses
  var parens = [];
  work = work.replace(/\(([^)]*)\)/g, function (a, inner) { parens.push(inner.trim()); return ' '; });
  work = work.replace(/\s+/g, ' ').trim();
  // key at the end
  var km = KEY_END_RE.exec(work);
  if (km) {
    key = normKeyTok(km[1]); to = normKeyTok(km[2]);
    work = work.slice(0, km.index).trim();
  }
  parens.forEach(function (p) {
    if (!p) return;
    if (!key && new RegExp('^' + KEY_TOK + '(?:\\s*[\\/→>-]\\s*' + KEY_TOK + ')?$').test(p) && /^[A-G]/.test(p)) {
      var pm = /^([A-G][#b]?m?)(?:\s*[\/→>-]\s*([A-G][#b]?m?))?$/.exec(p);
      if (pm) { key = normKeyTok(pm[1]); to = normKeyTok(pm[2]); return; }
    }
    var isOneWord = /^[^\s()]{1,14}$/.test(p) && /[A-Za-zÀ-ÿ]/.test(p);
    var isNames = /^[A-Za-zÀ-ÿ.'-]+(?:\s*[&+,\/]\s*[A-Za-zÀ-ÿ.'-]+)+$/.test(p);
    if (!singer && (isOneWord || isNames)) singer = p;
    else noteParts.push(p);
  });
  var title = work.replace(/[\s\/\-–|:,.]+$/, '').replace(/^[\s\/\-–|:,.]+/, '').trim();
  if (!title) return null;
  if (only) noteParts.push('Chorus only');
  // keep "Chorus only" last, alt title first
  var note = noteParts.filter(function (x) { return x !== 'Chorus only'; }).concat(only ? ['Chorus only'] : []).join('; ');
  return { t: 'song', title: title, singer: singer, key: key, to: to, keyMode: 'mod', note: note, only: only, links: [], raw: s };
}

// Main entry: returns {name, date, items, ignored}
function parseWhatsApp(raw, opts) {
  opts = opts || {};
  var today = opts.today || todayISO();
  var lines = String(raw || '').split(/\r?\n/).map(cleanLine);
  var res = { name: '', date: '', items: [], ignored: [] };
  var cur = null, started = false;

  function nextNonBlank(i) {
    for (var j = i + 1; j < lines.length; j++) if (lines[j]) return lines[j];
    return '';
  }
  function hasUrl(s) { URL_RE.lastIndex = 0; var r = URL_RE.test(s); URL_RE.lastIndex = 0; return r; }

  for (var i = 0; i < lines.length; i++) {
    var L = lines[i];
    if (!L) continue;
    if (hasUrl(L)) {
      var ex = extractLinks(L);
      var rest = ex.rest;
      if (!rest || /^[-–•:|]*$/.test(rest)) {
        if (cur) { cur.links = cur.links.concat(ex.links); } else res.ignored.push(L);
        continue;
      }
      var lb = /^([^\s:]{1,15}(?:\s\S{1,15})?)\s*[:\-–]\s*$/.exec(rest);
      if (lb && cur) { ex.links.forEach(function (l) { l.label = lb[1]; }); cur.links = cur.links.concat(ex.links); continue; }
      var sg = parseSongLine(rest);
      if (sg) { sg.links = ex.links; sg.raw = L; res.items.push(sg); cur = sg; started = true; continue; }
      res.ignored.push(L); continue;
    }
    var low = L.toLowerCase().replace(/[.!:,]+$/, '').trim();
    if (CUE_MAP[low]) { res.items.push({ t: 'cue', text: CUE_MAP[low], orig: L }); cur = null; started = true; continue; }
    var hasKey = KEY_END_RE.test(L.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()) || /\(\s*[A-G][#b]?m?(?:\s*[\/→>-]\s*[A-G][#b]?m?)?\s*\)\s*$/.test(L);
    if (!started && !res.name && HEADER_RE.test(L) && !hasKey) {
      var nm = L.replace(/^.*?\b(?:berikut\s+)?(?:list|daftar)?\s*(?:lagu|setlist|set\s+list)\b\s*(?:untuk|:)?\s*/i, '');
      if (nm === L) nm = L.replace(/^.*?\bberikut\b\s*/i, '');
      var dt = findDate(nm, today);
      if (dt) { res.date = res.date || dt.date; nm = (nm.slice(0, dt.index) + ' ' + nm.slice(dt.index + dt.length)); }
      nm = nm.replace(/[\s\-–:,.|]+$/, '').replace(/^[\s\-–:,.|]+/, '').replace(/\s+/g, ' ').trim();
      res.name = nm;
      continue;
    }
    if (!started && GREETING_RE.test(L) && !hasKey) { res.ignored.push(L); continue; }
    if (started && GREETING_RE.test(L) && !hasKey && L.length < 40) { res.ignored.push(L); continue; }
    if (!started && !hasKey) {
      var d2 = findDate(L, today);
      if (d2 && !res.date) { res.date = d2.date; continue; }
    }
    if (hasKey) {
      var sg2 = parseSongLine(L);
      if (sg2) { res.items.push(sg2); cur = sg2; started = true; continue; }
    }
    if (/^[A-Z0-9 .'&-]{2,24}$/.test(L) && /[A-Z]/.test(L) && !/\d/.test(L)) {
      res.items.push({ t: 'cue', text: titleCase(L), orig: L }); cur = null; started = true; continue;
    }
    if (hasUrl(nextNonBlank(i)) || (started && L.length <= 60)) {
      var sg3 = parseSongLine(L);
      if (sg3) { sg3.warn = 'No key found'; res.items.push(sg3); cur = sg3; started = true; continue; }
    }
    res.ignored.push(L);
  }
  return res;
}

/* ---------- fuzzy title match ---------- */
function normTitle(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
  var m = a.length, n = b.length, i, j;
  if (!m) return n; if (!n) return m;
  var prev = [], curr = [];
  for (j = 0; j <= n; j++) prev[j] = j;
  for (i = 1; i <= m; i++) {
    curr[0] = i;
    for (j = 1; j <= n; j++) curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    var t = prev; prev = curr; curr = t;
  }
  return prev[n];
}
function titleScore(a, b) {
  a = normTitle(a); b = normTitle(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  var r = 1 - lev(a, b) / Math.max(a.length, b.length);
  var aw = a.split(' '), bw = b.split(' '), inter = aw.filter(function (w) { return bw.indexOf(w) >= 0; }).length;
  var jac = inter / (aw.length + bw.length - inter);
  return Math.max(r, jac);
}
function matchSong(title, songs) {
  var best = null, bs = 0;
  (songs || []).forEach(function (s) {
    if (s.deleted === '1') return;
    var sc = titleScore(title, s.title);
    if (sc > bs) { bs = sc; best = s; }
  });
  return bs >= 0.8 ? best : null;
}

/* ---------- ids, time, rows ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function nowISO() { return new Date().toISOString(); }

var SONG_COLS = ['id', 'title', 'artist', 'key', 'bpm', 'time', 'chart', 'yt', 'marks', 'notes', 'patch', 'updated', 'deleted'];
var SET_COLS = ['id', 'date', 'name', 'items', 'raw', 'updated', 'deleted'];

function normRow(r, cols) {
  var o = {};
  cols.forEach(function (c) { o[c] = r[c] == null ? '' : String(r[c]); });
  return o;
}

// Merge by id, newer `updated` wins. Tombstones are ordinary rows with deleted='1', so a newer tombstone wins.
function mergeRows(local, remote) {
  var map = {}, order = [];
  function put(r, isRemote) {
    if (!r || r.id == null || r.id === '') return;
    var id = String(r.id);
    if (!map.hasOwnProperty(id)) { map[id] = r; order.push(id); return; }
    var a = String(map[id].updated || ''), b = String(r.updated || '');
    if (b > a || (b === a && isRemote)) map[id] = r;
  }
  (remote || []).forEach(function (r) { put(r, true); });
  (local || []).forEach(function (r) { put(r, false); });
  return order.map(function (id) { return map[id]; });
}

function rowsEqual(a, b, cols) {
  function key(rows) {
    return JSON.stringify(rows.map(function (r) { return normRow(r, cols); }).sort(function (x, y) { return x.id < y.id ? -1 : x.id > y.id ? 1 : 0; }));
  }
  return key(a) === key(b);
}

/* ---------- tap tempo ---------- */
function tapBpm(times) {
  if (times.length < 2) return 0;
  var iv = [];
  for (var i = 1; i < times.length; i++) iv.push(times[i] - times[i - 1]);
  iv = iv.slice(-8);
  var sorted = iv.slice().sort(function (a, b) { return a - b; });
  var med = sorted[Math.floor(sorted.length / 2)];
  var ok = iv.filter(function (x) { return Math.abs(x - med) <= med * 0.3; });
  var avg = ok.reduce(function (a, b) { return a + b; }, 0) / ok.length;
  return Math.round(60000 / avg);
}

/* ---------- share ---------- */
function bytesToB64u(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i += 0x2000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x2000));
  var b = typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uToBytes(str) {
  var b = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  var s = typeof atob === 'function' ? atob(b) : Buffer.from(b, 'base64').toString('binary');
  var out = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function streamBytes(kind, bytes) {
  var cs = new (kind === 'c' ? CompressionStream : DecompressionStream)('deflate-raw');
  var w = cs.writable.getWriter();
  w.write(bytes); w.close();
  var buf = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(buf);
}
// Format: 'z' + base64url(deflate-raw(json)) or 'r' + base64url(json) when no compression is available.
async function encodeShare(obj, opts) {
  opts = opts || {};
  var bytes = new TextEncoder().encode(JSON.stringify(obj));
  var hasCS = typeof CompressionStream !== 'undefined' && !opts.forceZlib;
  if (hasCS) return 'z' + bytesToB64u(await streamBytes('c', bytes));
  if (typeof require === 'function') {
    try { var z = require('zlib'); return 'z' + bytesToB64u(new Uint8Array(z.deflateRawSync(Buffer.from(bytes)))); } catch (e) { /* fall through */ }
  }
  return 'r' + bytesToB64u(bytes);
}
async function decodeShare(str, opts) {
  opts = opts || {};
  var kind = str.charAt(0), bytes = b64uToBytes(str.slice(1));
  if (kind === 'z') {
    if (typeof DecompressionStream !== 'undefined' && !opts.forceZlib) bytes = await streamBytes('d', bytes);
    else bytes = new Uint8Array(require('zlib').inflateRawSync(Buffer.from(bytes)));
  } else if (kind !== 'r') throw new Error('Unknown share format');
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* ---------- audio analysis (guess) ---------- */
var fftCache = {};
function makeFFT(n) {
  if (fftCache[n]) return fftCache[n];
  var levels = Math.round(Math.log(n) / Math.LN2), cos = new Float64Array(n / 2), sin = new Float64Array(n / 2), rev = new Uint32Array(n), i;
  for (i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
  for (i = 0; i < n; i++) rev[i] = (rev[i >> 1] >> 1) | ((i & 1) << (levels - 1));
  var f = function (re, im) {
    var i, j, t, size, half, step, k, l, tre, tim;
    for (i = 0; i < n; i++) { j = rev[i]; if (j > i) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (size = 2; size <= n; size <<= 1) {
      half = size >> 1; step = n / size;
      for (i = 0; i < n; i += size) {
        for (j = i, k = 0; j < i + half; j++, k += step) {
          l = j + half;
          tre = re[l] * cos[k] + im[l] * sin[k];
          tim = -re[l] * sin[k] + im[l] * cos[k];
          re[l] = re[j] - tre; im[l] = im[j] - tim;
          re[j] += tre; im[j] += tim;
        }
      }
    }
  };
  fftCache[n] = f;
  return f;
}
function hann(n) { var w = new Float64Array(n); for (var i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); return w; }

var KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
var KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a, b) {
  var n = a.length, ma = 0, mb = 0, i;
  for (i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  var num = 0, da = 0, db = 0;
  for (i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) * (a[i] - ma); db += (b[i] - mb) * (b[i] - mb); }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

// Krumhansl-Schmuckler
function detectKey(chroma) {
  var best = null, second = -2;
  var scores = [];
  for (var r = 0; r < 12; r++) {
    var rot = new Array(12);
    for (var i = 0; i < 12; i++) rot[i] = chroma[(i + r) % 12];
    scores.push({ root: r, minor: false, r: pearson(rot, KS_MAJOR) });
    scores.push({ root: r, minor: true, r: pearson(rot, KS_MINOR) });
  }
  scores.sort(function (a, b) { return b.r - a.r; });
  best = scores[0]; second = scores[1].r;
  return { root: best.root, minor: best.minor, r: best.r, margin: best.r - second, name: keyLabel(best.root, best.minor) };
}

var TEMPLATES = (function () {
  var t = [];
  for (var r = 0; r < 12; r++) {
    var maj = new Float64Array(12), min = new Float64Array(12);
    maj[r] = 1; maj[(r + 4) % 12] = 0.85; maj[(r + 7) % 12] = 0.9;
    min[r] = 1; min[(r + 3) % 12] = 0.85; min[(r + 7) % 12] = 0.9;
    [maj, min].forEach(function (v, qi) {
      var n = 0; for (var i = 0; i < 12; i++) n += v[i] * v[i];
      n = Math.sqrt(n); for (i = 0; i < 12; i++) v[i] /= n;
      t.push({ root: r, minor: qi === 1, v: v });
    });
  }
  return t;
})();

function cosSim(a, T) {
  var d = 0, na = 0;
  for (var i = 0; i < 12; i++) { d += a[i] * T[i]; na += a[i] * a[i]; }
  return na ? d / Math.sqrt(na) : 0;
}

// Choose one chord per bar with a light Viterbi so it does not flip on every bar.
function chordsPerBar(barChroma, energy) {
  var nb = barChroma.length, S = TEMPLATES.length + 1, NC = TEMPLATES.length, LAMBDA = 0.07;
  if (!nb) return [];
  var em = [], b, s, p;
  for (b = 0; b < nb; b++) {
    var e = new Float64Array(S);
    for (s = 0; s < TEMPLATES.length; s++) e[s] = cosSim(barChroma[b], TEMPLATES[s].v);
    e[NC] = energy[b] < 1e-6 ? 0.99 : 0.30;
    em.push(e);
  }
  var score = new Float64Array(S), back = [];
  for (s = 0; s < S; s++) score[s] = em[0][s];
  for (b = 1; b < nb; b++) {
    var ns = new Float64Array(S), bp = new Int16Array(S);
    for (s = 0; s < S; s++) {
      var bestV = -1e9, bestP = 0;
      for (p = 0; p < S; p++) {
        var v = score[p] - (p === s ? 0 : LAMBDA);
        if (v > bestV) { bestV = v; bestP = p; }
      }
      ns[s] = bestV + em[b][s]; bp[s] = bestP;
    }
    score = ns; back.push(bp);
  }
  var st = 0; for (s = 1; s < S; s++) if (score[s] > score[st]) st = s;
  var path = new Array(nb);
  for (b = nb - 1; b >= 0; b--) { path[b] = st; if (b > 0) st = back[b - 1][st]; }
  return path.map(function (s, i) {
    if (s === NC) return { nc: true, conf: 0.2 };
    var e = em[i][s];
    return { root: TEMPLATES[s].root, minor: TEMPLATES[s].minor, conf: Math.max(0, Math.min(1, (e - 0.55) / 0.35)) };
  });
}

function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }
function nowMs() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }

// samples: Float32Array mono. opts: {beatsPerBar, onProgress(0..1,label), maxSeconds, budget}
async function analyzeAudio(samples, sr, opts) {
  opts = opts || {};
  var bpb = opts.beatsPerBar || 4, budget = opts.budget || 40;
  var onP = opts.onProgress || function () {};
  var maxN = Math.min(samples.length, Math.floor((opts.maxSeconds || 480) * sr));
  var tick = nowMs();
  async function maybeYield(p, label) {
    if (nowMs() - tick > budget) { onP(p, label); await yieldUI(); tick = nowMs(); }
  }
  var i, t, k;

  /* 1. onset strength (spectral flux), N=1024 hop=256 */
  var N1 = 1024, H1 = 256, fft1 = makeFFT(N1), w1 = hann(N1);
  var nf1 = Math.max(0, Math.floor((maxN - N1) / H1));
  var onset = new Float32Array(nf1), prev = new Float32Array(N1 / 2), re = new Float64Array(N1), im = new Float64Array(N1);
  var kHi = Math.min(N1 / 2, Math.floor(3000 * N1 / sr));
  for (t = 0; t < nf1; t++) {
    var o0 = t * H1;
    for (i = 0; i < N1; i++) { re[i] = samples[o0 + i] * w1[i]; im[i] = 0; }
    fft1(re, im);
    var flux = 0;
    for (k = 1; k < kHi; k++) {
      var mag = Math.log(1 + 20 * Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N1 * 8);
      var df = mag - prev[k]; if (df > 0) flux += df;
      prev[k] = mag;
    }
    onset[t] = flux;
    if ((t & 31) === 0) await maybeYield(0.4 * t / nf1, 'Listening for the beat');
  }
  // remove slow trend
  var env = new Float32Array(nf1), fr = sr / H1, win = Math.max(3, Math.round(fr));
  var acc = 0;
  for (t = 0; t < nf1; t++) {
    acc += onset[t]; if (t >= win) acc -= onset[t - win];
    var mean = acc / Math.min(t + 1, win);
    env[t] = Math.max(0, onset[t] - mean);
  }

  /* 2. tempo: autocorrelation over 60-180 BPM with octave folding */
  function acAt(lag) {
    var n = nf1 - Math.ceil(lag) - 1, s = 0, li = Math.floor(lag), fr0 = lag - li;
    if (n <= 0) return 0;
    for (var j = 0; j < n; j++) s += env[j] * (env[j + li] * (1 - fr0) + env[j + li + 1] * fr0);
    return s / n;
  }
  var cands = [], bpmv, best = { bpm: 100, sc: -1 };
  for (bpmv = 60; bpmv <= 180; bpmv += 0.5) {
    var lag = 60 * fr / bpmv;
    var r1 = acAt(lag), r2 = acAt(lag / 2), r3 = acAt(lag * 2);
    var prior = Math.exp(-0.5 * Math.pow(Math.log(bpmv / 105) / Math.LN2 / 0.9, 2));
    var sc = (r1 + 0.5 * r2 + 0.35 * r3) * (0.6 + 0.4 * prior);
    cands.push([bpmv, sc]);
    if (sc > best.sc) best = { bpm: bpmv, sc: sc };
    if (((bpmv * 2) & 7) === 0) await maybeYield(0.4 + 0.1 * (bpmv - 60) / 120, 'Working out the tempo');
  }
  // fine refine around the best (0.05 BPM)
  var fine = { bpm: best.bpm }, fineBest = -1;
  for (bpmv = best.bpm - 0.6; bpmv <= best.bpm + 0.6; bpmv += 0.05) {
    var lg = 60 * fr / bpmv, s2 = acAt(lg) + 0.5 * acAt(lg / 2) + 0.35 * acAt(lg * 2);
    if (s2 > fineBest) { fineBest = s2; fine = { bpm: bpmv }; }
  }
  var bpm = fine.bpm, period = 60 * fr / bpm;
  var meanSc = cands.reduce(function (a, c) { return a + c[1]; }, 0) / cands.length;
  var bpmConf = Math.max(0, Math.min(1, (best.sc / (meanSc || 1) - 1) / 2));

  /* 3. beat tracking: phase by comb sum, then follow onsets */
  var bestPh = 0, bestPhS = -1, ph;
  for (ph = 0; ph < period; ph += 0.5) {
    var ps = 0;
    for (t = ph; t < nf1 - 1; t += period) ps += env[Math.round(t)];
    if (ps > bestPhS) { bestPhS = ps; bestPh = ph; }
  }
  var beats = [], pos = bestPh;
  while (pos < nf1 - 1) {
    beats.push(pos);
    var next = pos + period, lo = Math.max(0, Math.round(next - 0.18 * period)), hi = Math.min(nf1 - 1, Math.round(next + 0.18 * period));
    var pk = -1, pv = 0;
    for (t = lo; t <= hi; t++) { var vv = env[t] * (1 - 0.5 * Math.abs(t - next) / (0.18 * period + 1)); if (vv > pv) { pv = vv; pk = t; } }
    pos = pk >= 0 ? next + 0.35 * (pk - next) : next;
  }
  var beatSec = beats.map(function (b) { return (b * H1 + N1 / 2) / sr; });

  /* 4. chroma, N=4096 hop=2048 */
  var N2 = 4096, H2 = 2048, fft2 = makeFFT(N2), w2 = hann(N2);
  var nf2 = Math.max(0, Math.floor((maxN - N2) / H2));
  var re2 = new Float64Array(N2), im2 = new Float64Array(N2);
  var kLo = Math.ceil(100 * N2 / sr), kHi2 = Math.min(N2 / 2 - 1, Math.floor(1600 * N2 / sr));
  var binPc0 = new Int8Array(kHi2 + 1), binPc1 = new Int8Array(kHi2 + 1), binW = new Float32Array(kHi2 + 1);
  for (k = kLo; k <= kHi2; k++) {
    var midi = 69 + 12 * Math.log(k * sr / N2 / 440) / Math.LN2, fl = Math.floor(midi), fp = midi - fl;
    binPc0[k] = mod12(fl); binPc1[k] = mod12(fl + 1); binW[k] = fp;
  }
  var chroma = [], energy = new Float32Array(nf2), total = new Float64Array(12);
  for (t = 0; t < nf2; t++) {
    var o2 = t * H2, e = 0;
    for (i = 0; i < N2; i++) { var sv = samples[o2 + i]; re2[i] = sv * w2[i]; im2[i] = 0; e += sv * sv; }
    energy[t] = e / N2;
    var c = new Float32Array(12);
    if (energy[t] > 1e-8) {
      fft2(re2, im2);
      for (k = kLo; k <= kHi2; k++) {
        var m2 = Math.pow(Math.sqrt(re2[k] * re2[k] + im2[k] * im2[k]), 0.8);
        c[binPc0[k]] += m2 * (1 - binW[k]); c[binPc1[k]] += m2 * binW[k];
      }
      var mx = 0; for (i = 0; i < 12; i++) if (c[i] > mx) mx = c[i];
      if (mx > 0) for (i = 0; i < 12; i++) c[i] /= mx;
      for (i = 0; i < 12; i++) total[i] += c[i];
    }
    chroma.push(c);
    if ((t & 7) === 0) await maybeYield(0.5 + 0.45 * t / nf2, 'Listening for the harmony');
  }
  var key = detectKey(total);
  var frameSec = function (f) { return (f * H2 + N2 / 2) / sr; };

  /* 5. bars: group beats, pick the downbeat offset where harmony changes most */
  var novelty = new Float32Array(nf2);
  for (t = 1; t < nf2; t++) { var d = 0; for (i = 0; i < 12; i++) d += Math.abs(chroma[t][i] - chroma[t - 1][i]); novelty[t] = d; }
  function noveltyAt(sec) {
    var f = Math.round((sec * sr - N2 / 2) / H2), s = 0;
    for (var q = f - 1; q <= f + 1; q++) if (q > 0 && q < nf2) s += novelty[q];
    return s;
  }
  var bestOff = 0, bestOffS = -1, off;
  for (off = 0; off < bpb; off++) {
    var os = 0, cnt = 0;
    for (var bi = off; bi < beatSec.length; bi += bpb) { os += noveltyAt(beatSec[bi]); cnt++; }
    os = cnt ? os / cnt : 0;
    if (os > bestOffS) { bestOffS = os; bestOff = off; }
  }
  var bars = [];
  for (var bb = bestOff; bb + bpb < beatSec.length; bb += bpb) bars.push({ start: beatSec[bb], end: beatSec[bb + bpb] });
  var barChroma = [], barEnergy = [];
  bars.forEach(function (bar) {
    var acc = new Float32Array(12), en = 0, n = 0;
    // skip the first quarter of the bar: the chord is smeared at the change
    var from = bar.start + 0.2 * (bar.end - bar.start);
    for (var f = 0; f < nf2; f++) {
      var fs = frameSec(f);
      if (fs >= from && fs < bar.end) { for (var q = 0; q < 12; q++) acc[q] += chroma[f][q]; en += energy[f]; n++; }
    }
    barChroma.push(acc); barEnergy.push(n ? en / n : 0);
  });
  var picks = chordsPerBar(barChroma, barEnergy);
  var flats = flatsForRoot(key.root, key.minor);
  var chords = picks.map(function (p, idx) {
    return { start: bars[idx].start, end: bars[idx].end, nc: !!p.nc, root: p.root, minor: p.minor, conf: p.conf, name: p.nc ? 'N.C.' : noteName(p.root, flats) + (p.minor ? 'm' : '') };
  });
  onP(1, 'Done');
  return { bpm: Math.round(bpm * 10) / 10, bpmConf: bpmConf, key: key, keyName: key.name, beatsPerBar: bpb, bars: chords, duration: maxN / sr };
}

// Turn analysis bars into chart text, shifted into targetKey (song key) if given.
function draftChart(bars, fromKeyName, toKeyName) {
  var shift = toKeyName ? semitoneShift(fromKeyName, toKeyName) : 0;
  var flats = usesFlats(toKeyName || fromKeyName);
  var names = bars.map(function (b) {
    if (b.nc) return 'N.C.';
    return noteName(b.root + shift, flats) + (b.minor ? 'm' : '');
  });
  var out = [];
  for (var i = 0; i < names.length; i += 8) {
    out.push('[Part ' + (i / 8 + 1) + '] ' + names.slice(i, i + 8).map(function (n) { return '| ' + n + ' '; }).join('') + '|');
  }
  return out.join('\n');
}

/* ---------- dates for display ---------- */
var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso, withYear) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + (withYear ? ' ' + d.getFullYear() : '');
}

var api = {
  SHARP: SHARP, FLAT: FLAT, SONG_COLS: SONG_COLS, SET_COLS: SET_COLS,
  parseKey: parseKey, usesFlats: usesFlats, flatsForRoot: flatsForRoot, keyLabel: keyLabel, noteName: noteName,
  transposeKeyName: transposeKeyName, semitoneShift: semitoneShift,
  parseChord: parseChord, parseChart: parseChart, layoutChart: layoutChart, formatLayout: formatLayout,
  transposeChartText: transposeChartText, roadmap: roadmap, sectionNames: sectionNames, diatonicChords: diatonicChords,
  canonSection: canonSection,
  extractYouTube: extractYouTube, parseYtList: parseYtList,
  parseWhatsApp: parseWhatsApp, parseSongLine: parseSongLine, findDate: findDate, matchSong: matchSong, titleScore: titleScore, normTitle: normTitle,
  uid: uid, nowISO: nowISO, normRow: normRow, mergeRows: mergeRows, rowsEqual: rowsEqual,
  tapBpm: tapBpm, encodeShare: encodeShare, decodeShare: decodeShare,
  makeFFT: makeFFT, detectKey: detectKey, analyzeAudio: analyzeAudio, draftChart: draftChart,
  todayISO: todayISO, fmtDate: fmtDate
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.WCore = api;
})(typeof window !== 'undefined' ? window : this);
