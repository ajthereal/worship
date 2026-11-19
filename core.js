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

var SONG_COLS = ['id', 'title', 'artist', 'key', 'bpm', 'time', 'chart', 'yt', 'marks', 'notes', 'patch', 'audio', 'audioName', 'grid', 'updated', 'deleted'];
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
  return { bpm: Math.round(bpm * 10) / 10, bpmConf: bpmConf, key: key, keyName: key.name, beatsPerBar: bpb, bars: chords, duration: maxN / sr, frames: { chroma: chroma, energy: energy, hop: H2, N: N2, sr: sr } };
}

// Chord guesses for time ranges (cells of the beat grid) from the chroma frames that analyzeAudio returns.
// ranges: [[t0,t1],...]. Returns [{nc, root, minor, conf, name}] with names spelled for keyName.
function chordsForRanges(frames, ranges, keyName) {
  var flats = keyName ? usesFlats(keyName) : false;
  return ranges.map(function (r) {
    var acc = new Float32Array(12), n = 0, en = 0;
    var from = r[0] + 0.15 * (r[1] - r[0]);
    var f0 = Math.max(0, Math.floor((from * frames.sr - frames.N / 2) / frames.hop)), nfr = frames.chroma.length;
    for (var f = f0; f < nfr; f++) {
      var fs = (f * frames.hop + frames.N / 2) / frames.sr;
      if (fs >= r[1]) break;
      if (fs >= from) { for (var q = 0; q < 12; q++) acc[q] += frames.chroma[f][q]; en += frames.energy[f]; n++; }
    }
    if (!n || en / n < 1e-7) return { nc: true, root: -1, minor: false, conf: 0, name: 'N.C.' };
    var best = 0, bs = -1, second = -1;
    for (var s = 0; s < TEMPLATES.length; s++) {
      var e = cosSim(acc, TEMPLATES[s].v);
      if (e > bs) { second = bs; bs = e; best = s; } else if (e > second) second = e;
    }
    var conf = Math.max(0, Math.min(1, (bs - 0.55) / 0.35)) * (0.6 + 0.4 * Math.min(1, (bs - second) * 8));
    var T = TEMPLATES[best];
    return { nc: false, root: T.root, minor: T.minor, conf: conf, name: noteName(T.root, flats) + (T.minor ? 'm' : '') };
  });
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

/* ====================================================================
   Lead sheet model (v3): typed bar syntax, transposing, grid math,
   chart -> sheet conversion, storage rows for the wsheets tab.
   ==================================================================== */

/* ---------- time signatures ---------- */
function parseTime(t) {
  var m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(t || '4/4'));
  if (!m) return { n: 4, d: 4 };
  var n = Number(m[1]), d = Number(m[2]);
  if (!n || (d !== 2 && d !== 4 && d !== 8)) return { n: 4, d: 4 };
  return { n: n, d: d };
}
// sub = units per whole note (8 means eighths, 16 means sixteenths).
function timeInfo(time, sub) {
  sub = sub || 8;
  var t = parseTime(time);
  var unitsPerQuarter = sub / 4, unitsPerEighth = sub / 8;
  var units = t.d === 4 ? t.n * unitsPerQuarter : t.d === 8 ? t.n * unitsPerEighth : t.n * unitsPerQuarter * 2;
  var compound = t.d === 8 && t.n % 3 === 0 && t.n > 3;
  var bu = compound ? 3 * unitsPerEighth : t.d === 4 ? unitsPerQuarter : t.d === 8 ? unitsPerEighth : unitsPerQuarter * 2;
  return { n: t.n, d: t.d, sub: sub, units: units, bu: bu, beats: Math.round(units / bu), compound: compound, time: t.n + '/' + t.d };
}

function emptySheet(key, time, tempo) {
  var k = parseKey(key) || parseKey('C');
  return { v: 1, key: key || 'C', mode: k.minor ? 'minor' : 'major', time: time || '4/4', tempo: tempo || 90, sub: 8, bars: [] };
}

// Resolve key, time and tempo in force for every bar.
function resolveBars(sheet) {
  var key = sheet.key || 'C', time = sheet.time || '4/4', tempo = sheet.tempo || 0, sub = sheet.sub || 8;
  return (sheet.bars || []).map(function (b, i) {
    if (b.key) key = b.key;
    if (b.time) time = b.time;
    if (b.tempo) tempo = b.tempo;
    var ti = timeInfo(time, sub);
    if (b.pickup && b.units) ti = Object.assign({}, ti, { units: b.units, beats: Math.max(1, Math.round(b.units / ti.bu)) });
    return { i: i, bar: b, key: key, time: time, tempo: tempo, units: ti.units, bu: ti.bu, beats: ti.beats, compound: ti.compound, sub: sub, n: ti.n, d: ti.d };
  });
}

/* ---------- chord symbols ---------- */
function normChordSym(s) {
  return String(s || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[Δ△]/g, 'maj').replace(/∅/g, 'm7b5').replace(/^N\.?C\.?$/i, 'N.C.');
}
function isChordSym(s) {
  s = normChordSym(s);
  if (s === 'N.C.') return true;
  var m = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(s);
  if (!m) return false;
  return new RegExp('^(?:maj|min|dim|aug|sus|add|alt|m|M|\\+|°|ø|-|\\d+|[#b]\\d+|\\(|\\))*$').test(m[2]);
}
function chordRoot(s) {
  s = normChordSym(s);
  var m = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(s);
  if (!m) return null;
  return { root: noteIndex(m[1]), qual: m[2], bass: m[3] ? noteIndex(m[3]) : -1, rootName: m[1], bassName: m[3] || '' };
}
function transposeChordSym(s, semis, flats) {
  s = normChordSym(s);
  var c = chordRoot(s);
  if (!c) return s;
  return noteName(c.root + semis, flats) + c.qual + (c.bass >= 0 ? '/' + noteName(c.bass + semis, flats) : '');
}
// Pieces for drawing: root letter, accidental glyph, inline minor, superscript text, bass.
function chordParts(s, o) {
  o = o || {};
  s = normChordSym(s);
  if (s === 'N.C.') return { nc: true, root: 'N.C.', acc: '', minor: '', sup: '', bass: '', bassAcc: '' };
  var c = chordRoot(s);
  if (!c) return { nc: false, root: s, acc: '', minor: '', sup: '', bass: '', bassAcc: '' };
  var q = c.qual, minor = '';
  var mm = /^(m|min|-)(?!aj)/.exec(q);
  if (/^m7b5/.test(q)) { q = 'ø7' + q.slice(4); mm = null; }
  if (mm) { minor = 'm'; q = q.slice(mm[1].length); }
  var tri = o.triangle !== false;
  q = q.replace(/^maj/, tri ? 'Δ' : 'maj').replace(/^M(?=\d)/, tri ? 'Δ' : 'maj');
  q = q.replace(/dim/g, '°').replace(/b(\d)/g, '♭$1').replace(/#(\d)/g, '♯$1').replace(/^\+/, '+');
  var bass = c.bassName ? c.bassName.charAt(0) : '', bassAcc = c.bassName ? c.bassName.slice(1).replace('#', '♯').replace('b', '♭') : '';
  return { nc: false, root: c.rootName.charAt(0), acc: c.rootName.slice(1).replace('#', '♯').replace('b', '♭'), minor: minor, sup: q, bass: bass, bassAcc: bassAcc };
}
function chordDisplay(s, o) {
  var p = chordParts(s, o);
  return p.nc ? 'N.C.' : p.root + p.acc + p.minor + p.sup + (p.bass ? '/' + p.bass + p.bassAcc : '');
}
function nashSym(s, keyStr) {
  var c = chordRoot(s), k = parseKey(keyStr);
  if (normChordSym(s) === 'N.C.') return 'N.C.';
  if (!c || !k) return s;
  var ref = relMajorRoot(k.root, k.minor);
  var d = degree(c.root, ref).replace('b', '♭').replace('#', '♯');
  return d + c.qual.replace(/maj/, 'Δ') + (c.bass >= 0 ? '/' + degree(c.bass, ref).replace('b', '♭').replace('#', '♯') : '');
}
var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
function romanFor(s, keyStr) {
  var c = chordRoot(s), k = parseKey(keyStr);
  if (!c || !k) return '';
  var ref = relMajorRoot(k.root, k.minor), d = mod12(c.root - ref);
  var map = { 0: [0, ''], 1: [1, 'b'], 2: [1, ''], 3: [2, 'b'], 4: [2, ''], 5: [3, ''], 6: [3, '#'], 7: [4, ''], 8: [5, 'b'], 9: [5, ''], 10: [6, 'b'], 11: [6, ''] };
  var e = map[d], num = ROMAN[e[0]], q = c.qual;
  var minorQ = /^(m|min|dim|ø|°)(?!aj)/.test(q);
  if (minorQ) num = num.toLowerCase();
  var out = (e[1] === 'b' ? '♭' : e[1] === '#' ? '♯' : '') + num;
  if (/^(dim|°)/.test(q)) out += '°'; else if (/^ø|m7b5/.test(q)) out += 'ø';
  if (/7/.test(q) && !/maj|ø|dim7|°7/.test(q)) out += '⁷';
  if (c.bass >= 0 && c.bass !== c.root) {
    var iv = mod12(c.bass - c.root);
    if (iv === 3 || iv === 4) out += '⁶'; else if (iv === 7) out += '⁶₄';
  }
  return out;
}

/* ---------- pitches ---------- */
function pitchMidi(p) {
  var m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(p || '').replace(/♯/g, '#').replace(/♭/g, 'b'));
  if (!m) return null;
  var base = NAT[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (Number(m[3]) + 1) * 12 + base;
}
function midiPitch(midi, flats) {
  var pc = mod12(midi), oct = Math.floor(midi / 12) - 1;
  return noteName(pc, flats) + oct;
}
function transposePitch(p, semis, flats) {
  var m = pitchMidi(p);
  return m == null ? p : midiPitch(m + semis, flats);
}

/* ---------- transposing a whole sheet ---------- */
function signedShift(from, to) {
  var s = semitoneShift(from, to);
  return s > 6 ? s - 12 : s;
}
function transposeSheet(sheet, semis, targetKey) {
  var out = JSON.parse(JSON.stringify(sheet));
  if (!semis && !targetKey) return out;
  semis = semis || 0;
  var tk = targetKey || transposeKeyName(sheet.key, semis);
  out.key = tk;
  var kk = parseKey(tk); if (kk) out.mode = kk.minor ? 'minor' : 'major';
  var curKey = tk;
  (out.bars || []).forEach(function (b, i) {
    if (b.key) {
      var src = sheet.bars[i].key;
      // keep an explicit accidental style of the target when the tonic matches the sheet tonic
      b.key = transposeKeyName(src, semis);
      curKey = b.key;
    }
    var flats = usesFlats(curKey);
    (b.ch || []).forEach(function (c) { c.c = transposeChordSym(c.c, semis, flats); });
    (b.ev || []).forEach(function (e) { if (e.p && e.p.length) e.p = e.p.map(function (p) { return transposePitch(p, semis, flats); }); });
  });
  return out;
}
function sheetToKey(sheet, key) {
  if (!key || !parseKey(key)) return sheet;
  var s = signedShift(sheet.key, key);
  if (!s && sheet.key === key) return sheet;
  return transposeSheet(sheet, s, key);
}

/* ---------- typed bar syntax ---------- */
/*
  One token per beat, separated by spaces. A beat can be split with commas: "A,B" is A on the beat and B on the "and".
    E        chord on this beat, comp slash
    E!       chord as a hit (stab)
    !        hit with no new chord
    ^B/D#    push: the chord lands one subdivision early, tied into this beat
    .        hold: continue the last chord (comp keeps one slash per beat, a hit is lengthened)
    r        rest
    %        repeat the previous bar (whole bar)
  Bar lines: | || |: :| |]   Before a bar: [A Intro] rehearsal mark, 1. or 2. ending. (text) is a cue.
*/
function splitBeats(str) {
  return String(str || '').trim().split(/\s+/).filter(Boolean);
}

// Parse the content of ONE bar. ctx: {units, bu}. Returns {bar:{ch,ev,rep?,text?,mark?,label?,ending?}, errors:[], warnings:[]}
function parseBarText(text, ctx) {
  var errors = [], warnings = [], bar = {}, units = ctx.units, bu = ctx.bu;
  var s = String(text || '');
  // rehearsal mark
  var mk = /^\s*\[([^\]]*)\]\s*/.exec(s);
  if (mk) {
    s = s.slice(mk[0].length);
    var ws = mk[1].trim().split(/\s+/);
    if (ws[0] && /^[A-Z]$/.test(ws[0])) { bar.mark = ws[0]; if (ws.length > 1) bar.label = ws.slice(1).join(' '); }
    else if (mk[1].trim()) { bar.label = mk[1].trim(); bar.mark = '*'; }
  }
  var en = /^\s*([12])\.\s+/.exec(s);
  if (en) { bar.ending = en[1] + '.'; s = s.slice(en[0].length); }
  s = s.replace(/\(([^)]*)\)/g, function (all, t) { if (t.trim()) bar.text = bar.text ? bar.text + ' ' + t.trim() : t.trim(); return ' '; });
  var toks = splitBeats(s);
  if (toks.length === 1 && toks[0] === '%') { bar.rep = '%'; bar.ch = []; bar.ev = []; return { bar: bar, errors: errors, warnings: warnings }; }
  if (!toks.length) { return { bar: Object.assign(bar, { ch: [], ev: [] }), errors: ['Empty bar'], warnings: warnings }; }
  var beats = Math.round(units / bu);
  if (toks.length > beats) errors.push('Too many beats: ' + toks.length + ' for ' + beats + '. Use "A,B" to split a beat.');
  var ch = [], ev = [], last = null;
  function addEv(e) { ev.push(e); last = e; return e; }
  toks.slice(0, beats).forEach(function (tok, b) {
    var parts = tok.split(','), start = b * bu;
    if (bu % parts.length !== 0) { errors.push('Beat ' + (b + 1) + ' has ' + parts.length + ' parts, too many for the grid.'); parts = [parts[0]]; }
    var len = bu / parts.length;
    parts.forEach(function (p, j) {
      var u = start + j * len;
      if (p === '' || p === '.') {
        if (last && last.k === 'h' && last.at + last.d === u) last.d += len;
        else if (last && last.k === 's' && last.at + last.d === u && Math.floor(last.at / bu) === Math.floor(u / bu)) last.d += len;
        else if (last && last.k === 's') addEv({ at: u, d: len, k: 's' });
        else addEv({ at: u, d: len, k: 'r' });
        return;
      }
      if (p === 'r' || p === 'R') { addEv({ at: u, d: len, k: 'r' }); return; }
      if (p === '!') { addEv({ at: u, d: len, k: 'h' }); return; }
      var push = false, hit = false, sym = p;
      if (sym.charAt(0) === '^') { push = true; sym = sym.slice(1); }
      if (/!$/.test(sym)) { hit = true; sym = sym.slice(0, -1); }
      if (!isChordSym(sym)) { errors.push('"' + p + '" is not a chord. Use r for a rest or . to hold.'); addEv({ at: u, d: len, k: 'r' }); return; }
      sym = normChordSym(sym);
      if (push && u === 0) { warnings.push('A push on beat 1 needs the chord in the bar before. Written as a hit.'); push = false; hit = true; }
      if (push) {
        if (last && last.at + last.d === u) { last.d -= 1; if (last.d <= 0) { ev.pop(); last = ev[ev.length - 1] || null; } }
        ch.push({ at: u - 1, c: sym });
        ev.push({ at: u - 1, d: 1, k: 'h', tie: true });
        addEv({ at: u, d: len, k: 'h' });
        return;
      }
      ch.push({ at: u, c: sym });
      addEv({ at: u, d: len, k: hit ? 'h' : 's' });
    });
  });
  while (toks.length < beats) {
    var u2 = toks.length * bu;
    if (last && last.k === 'h' && last.at + last.d === u2) last.d += bu;
    else if (last && last.k === 's') addEv({ at: u2, d: bu, k: 's' });
    else addEv({ at: u2, d: bu, k: 'r' });
    toks.push('.');
  }
  bar.ch = ch; bar.ev = ev;
  return { bar: bar, errors: errors, warnings: warnings };
}

function defaultEvents(units, bu) {
  var out = [];
  for (var u = 0; u < units; u += bu) out.push({ at: u, d: Math.min(bu, units - u), k: 's' });
  return out;
}

function evSorted(bar, ctx) {
  var ev = (bar.ev && bar.ev.length) ? bar.ev.slice() : defaultEvents(ctx.units, ctx.bu);
  return ev.sort(function (a, b) { return a.at - b.at; });
}

function chordStrFor(c, hit) { return c + (hit ? '!' : ''); }

// Bar content as text (no bar lines). Pitches and details that the text cannot hold are not written.
function barToText(bar, ctx) {
  if (bar.rep === '%') return '%';
  var units = ctx.units, bu = ctx.bu, beats = Math.round(units / bu);
  var ev = evSorted(bar, ctx), chAt = {}, evAt = {};
  (bar.ch || []).forEach(function (c) { chAt[c.at] = c.c; });
  ev.forEach(function (e) { evAt[e.at] = e; });
  // pushes: a one-unit tied hit just before a beat, with its chord
  var push = {}, skip = {};
  ev.forEach(function (e) {
    if (e.k === 'h' && e.d === 1 && e.tie && (e.at + 1) % bu === 0 && chAt[e.at] != null && evAt[e.at + 1]) {
      push[(e.at + 1) / bu] = chAt[e.at]; skip[e.at] = true;
    }
  });
  var out = [];
  for (var b = 0; b < beats; b++) {
    var start = b * bu, offs = [];
    for (var u = start + 1; u < start + bu; u++) if (!skip[u] && (chAt[u] != null || evAt[u])) offs.push(u - start);
    var nparts = 1;
    if (offs.length) {
      var cand = [2, 4, bu].filter(function (n, i, a) { return bu % n === 0 && a.indexOf(n) === i; }).sort(function (x, y) { return x - y; });
      nparts = bu;
      for (var ci = 0; ci < cand.length; ci++) {
        var sz = bu / cand[ci];
        if (offs.every(function (o) { return o % sz === 0; })) { nparts = cand[ci]; break; }
      }
    }
    var sz2 = bu / nparts, toks = [];
    for (var j = 0; j < nparts; j++) {
      var uu = start + j * sz2, e2 = evAt[uu], c2 = chAt[uu], tok;
      if (j === 0 && push[b]) tok = '^' + push[b];
      else if (c2 != null && !skip[uu]) tok = chordStrFor(c2, e2 && e2.k === 'h');
      else if (e2 && !skip[uu]) tok = e2.k === 'r' ? 'r' : e2.k === 'h' ? '!' : '.';
      else tok = '.';
      // a hit with no chord that only continues the previous hit is a hold
      if (tok === '!' && j === 0 && !e2) tok = '.';
      toks.push(tok);
    }
    // a continuing slot written as "." after a hit that starts here is just a hold
    out.push(toks.join(','));
  }
  return out.join(' ');
}

// Whole line(s) with bar lines, marks and endings. Returns text.
function barsToLine(rs, from, to) {
  var parts = [];
  for (var i = from; i < to; i++) {
    var r = rs[i], b = r.bar, s = '';
    var prevRep = i > from ? rs[i - 1].bar.repEnd : false;
    parts.push(b.repStart ? '|:' : (i === from || prevRep ? '|' : '|'));
    var pre = '';
    if (b.mark) pre += '[' + (b.mark === '*' ? '' : b.mark + (b.label ? ' ' : '')) + (b.label || '') + '] ';
    if (b.ending) pre += b.ending + ' ';
    var cue = b.text ? ' (' + b.text + ')' : '';
    parts.push(' ' + pre + barToText(b, r) + cue + ' ');
    if (b.repEnd) parts.push(':|');
    else if (b.final) parts.push('|]');
    else if (b.double) parts.push('||');
  }
  var s2 = parts.join('');
  if (!/(\||\]|:\|)$/.test(s2)) s2 += '|';
  return s2;
}

// Parse text with several bars. ctxFn(barIndexInOutput) -> {units, bu}. Returns {bars, errors, warnings}.
function parseBars(text, ctxFn) {
  var errors = [], warnings = [], bars = [];
  String(text || '').split(/\n/).forEach(function (line) {
    var tokens = line.split(/(\|\||\|:|:\||\|\]|\|)/);
    // tokens: content, bl, content, bl ...
    var pendingStart = false, any = false, pendingPrefix = '';
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (i % 2 === 1) {
        if (t === '|:') pendingStart = true;
        else if (bars.length) {
          var lastB = bars[bars.length - 1];
          if (lastB._lineOpen) {
            if (t === ':|') lastB.repEnd = true; else if (t === '|]') lastB.final = true; else if (t === '||') lastB.double = true;
            lastB._lineOpen = false;
          }
        }
        continue;
      }
      if (!t.trim()) continue;
      if (/^\s*(\[[^\]]*\]\s*)?([12]\.\s*)?$/.test(t)) { pendingPrefix += t; continue; }
      t = pendingPrefix + t; pendingPrefix = '';
      var ctx = ctxFn(bars.length);
      var r = parseBarText(t, ctx);
      r.errors.forEach(function (e) { errors.push('Bar ' + (bars.length + 1) + ': ' + e); });
      r.warnings.forEach(function (e) { warnings.push('Bar ' + (bars.length + 1) + ': ' + e); });
      var nb = r.bar;
      if (pendingStart) { nb.repStart = true; pendingStart = false; }
      nb._lineOpen = true;
      bars.push(nb); any = true;
    }
  });
  bars.forEach(function (b) { delete b._lineOpen; });
  return { bars: bars, errors: errors, warnings: warnings };
}

function sheetToText(sheet) {
  var rs = resolveBars(sheet), lines = [], from = 0;
  for (var i = 1; i <= rs.length; i++) {
    if (i === rs.length || rs[i].bar.mark) { lines.push(barsToLine(rs, from, i)); from = i; }
  }
  return lines.join('\n');
}

/* ---------- sections, roadmap ---------- */
function sheetSections(sheet) {
  var out = [], cur = null;
  (sheet.bars || []).forEach(function (b, i) {
    if (b.mark || !cur) {
      cur = { mark: b.mark || '', label: b.label || (b.mark ? '' : 'Start'), from: i, to: i };
      out.push(cur);
    }
    cur.to = i;
  });
  return out;
}
function isChorusLabel(l) { return /(chorus|reff?|refrain|tag)/i.test(l || ''); }
function chorusBarRange(sheet) {
  var secs = sheetSections(sheet).filter(function (s) { return isChorusLabel(s.label); });
  return secs;
}

/* ---------- migration: old chart text -> sheet ---------- */
function chartToSheet(chart, songKey, time, tempo) {
  var model = parseChart(chart);
  var key = (parseKey(songKey) ? songKey : (firstChordKey(model) ? keyLabel(firstChordKey(model).root, firstChordKey(model).minor) : 'C'));
  var sheet = emptySheet(key, time || '4/4', tempo || 0);
  var ti = timeInfo(sheet.time, sheet.sub);
  var pendingKey = null, markCode = 65, curKey = key;
  model.forEach(function (n) {
    if (n.type === 'mod') {
      var nk = n.key;
      if (!nk && n.delta != null) { var ck = parseKey(curKey); if (ck) nk = { root: mod12(ck.root + n.delta), minor: ck.minor }; }
      if (nk) { pendingKey = keyLabel(nk.root, nk.minor); curKey = pendingKey; }
      return;
    }
    if (n.type !== 'sec') return;
    var first = sheet.bars.length, rep = n.rep || 0;
    n.bars.forEach(function (b, bi) {
      var bar = { ch: [], ev: [] }, cs = b.chords, cnt = cs.length;
      if (bi === 0) {
        bar.mark = String.fromCharCode(Math.min(90, markCode++));
        if (n.name) bar.label = n.name;
        if (pendingKey) { bar.key = pendingKey; pendingKey = null; }
        if (n.cues.length) bar.text = n.cues.join(' ');
        if (rep > 1) bar.repStart = true;
      }
      var slots = ti.beats;
      for (var u = 0; u < ti.units; u += ti.bu) bar.ev.push({ at: u, d: ti.bu, k: 's' });
      cs.forEach(function (c, ci) {
        var beat = Math.min(slots - 1, Math.floor(ci * slots / cnt)), at = beat * ti.bu;
        var sym = c.nc ? 'N.C.' : noteName(c.root, usesFlats(curKey)) + c.qual + (c.bass >= 0 ? '/' + noteName(c.bass, usesFlats(curKey)) : '');
        if (c.push && at > 0) {
          bar.ch.push({ at: at - 1, c: sym });
          var prev = bar.ev.filter(function (e) { return e.at + e.d === at; })[0];
          if (prev && prev.d > 1) prev.d -= 1;
          bar.ev.push({ at: at - 1, d: 1, k: 'h', tie: true });
          bar.ev.forEach(function (e) { if (e.at === at) e.k = 'h'; });
        } else {
          bar.ch.push({ at: at, c: sym });
          if (c.hit) bar.ev.forEach(function (e) { if (e.at === at) e.k = 'h'; });
        }
      });
      bar.ev.sort(function (x, y) { return x.at - y.at; });
      if (bi === n.bars.length - 1 && rep > 1) { bar.repEnd = true; bar.times = rep; }
      sheet.bars.push(bar);
    });
    if (first === sheet.bars.length) return;
  });
  if (sheet.bars.length) sheet.bars[sheet.bars.length - 1].final = true;
  return sheet;
}

/* ---------- beat grid: bar start times ---------- */
// grid = {b:[bar start seconds...], end: seconds of the end of the last bar}
function gridFromTempo(bpm, firstDownbeat, bars, beatsPerBar, duration) {
  var barSec = 60 / bpm * (beatsPerBar || 4), b = [];
  for (var i = 0; i < bars; i++) b.push(round3(firstDownbeat + i * barSec));
  return { b: b, end: round3(firstDownbeat + bars * barSec) };
}
function round3(x) { return Math.round(x * 1000) / 1000; }
function gridBarAt(grid, t) {
  var b = grid && grid.b;
  if (!b || !b.length) return { bar: -1, frac: 0 };
  if (t < b[0]) return { bar: -1, frac: 0 };
  var lo = 0, hi = b.length - 1;
  while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (b[mid] <= t) lo = mid; else hi = mid - 1; }
  var end = lo + 1 < b.length ? b[lo + 1] : (grid.end || (b[lo] + (b[lo] - (b[lo - 1] || 0)) || b[lo] + 2));
  var frac = (t - b[lo]) / Math.max(0.001, end - b[lo]);
  if (lo === b.length - 1 && t > end) return { bar: -1, frac: 1, over: true };
  return { bar: lo, frac: Math.min(1, Math.max(0, frac)) };
}
function gridTimeAt(grid, bar, frac) {
  var b = grid && grid.b;
  if (!b || !b.length) return 0;
  bar = Math.max(0, Math.min(b.length, bar));
  var start = bar < b.length ? b[bar] : grid.end;
  var end = bar + 1 < b.length ? b[bar + 1] : (grid.end || start + 2);
  return start + (frac || 0) * (end - start);
}
function gridBarEnd(grid, bar) { return gridTimeAt(grid, bar + 1, 0); }
// Taps on bar 1s while the audio plays. taps: seconds. firstBar: index of the first tapped bar. Fills the rest.
function gridFromTaps(taps, firstBar, totalBars, duration) {
  var t = taps.slice().sort(function (a, b) { return a - b; });
  if (!t.length) return null;
  var iv = [];
  for (var i = 1; i < t.length; i++) iv.push(t[i] - t[i - 1]);
  var med = iv.length ? iv.slice().sort(function (a, b) { return a - b; })[Math.floor(iv.length / 2)] : 2;
  var b = [], k;
  for (k = 0; k < totalBars; k++) {
    var rel = k - firstBar;
    if (rel >= 0 && rel < t.length) b.push(t[rel]);
    else if (rel < 0) b.push(t[0] + rel * med);
    else b.push(t[t.length - 1] + (rel - t.length + 1) * med);
  }
  b = b.map(round3);
  return { b: b, end: round3(b[b.length - 1] + med) };
}
function gridFromAnalysis(a, totalBars) {
  if (!a || !a.bars || !a.bars.length) return null;
  var starts = a.bars.map(function (x) { return x.start; });
  var med = a.bars[0].end - a.bars[0].start;
  var b = starts.slice(0, totalBars);
  while (b.length < totalBars) b.push(b[b.length - 1] + med);
  b = b.map(round3);
  return { b: b, end: round3(b[b.length - 1] + med) };
}
// Shift every bar start so that bar k starts at time t (keeps spacing)
function gridSetBar(grid, k, t) {
  var d = t - grid.b[k];
  return { b: grid.b.map(function (x) { return round3(x + d); }), end: round3(grid.end + d) };
}
// Change the spacing: scale around bar 0 so the bar length becomes barSec
function gridSetTempo(grid, bpm, beatsPerBar) {
  var barSec = 60 / bpm * (beatsPerBar || 4), t0 = grid.b[0];
  var b = grid.b.map(function (x, i) { return round3(t0 + i * barSec); });
  return { b: b, end: round3(t0 + grid.b.length * barSec) };
}
function parseGrid(s) {
  try { var g = typeof s === 'string' ? JSON.parse(s || 'null') : s; return g && Array.isArray(g.b) && g.b.length ? g : null; } catch (e) { return null; }
}

/* ---------- storage rows for the wsheets tab ---------- */
var SHEET_COLS = ['id', 'part', 'data', 'updated', 'deleted'];
var SHEET_PART = 40000, SHEET_MAX = 300000;

async function deflateBytes(bytes) {
  if (typeof CompressionStream !== 'undefined') return streamBytes('c', bytes);
  if (typeof require === 'function') { try { return new Uint8Array(require('zlib').deflateRawSync(Buffer.from(bytes))); } catch (e) { /* fall through */ } }
  return null;
}
async function inflateBytes(bytes) {
  if (typeof DecompressionStream !== 'undefined') return streamBytes('d', bytes);
  return new Uint8Array(require('zlib').inflateRawSync(Buffer.from(bytes)));
}
// -> {rows, size} or throws Error with a plain message
async function packSheet(id, sheet, updated) {
  var json = JSON.stringify(sheet), bytes = new TextEncoder().encode(json);
  var z = await deflateBytes(bytes), data = z ? 'z' + bytesToB64u(z) : 'r' + bytesToB64u(bytes);
  if (data.length > SHEET_MAX) throw new Error('This lead sheet is too big to save (' + Math.round(data.length / 1000) + ' KB of ' + Math.round(SHEET_MAX / 1000) + ' KB). Split it into two songs.');
  var rows = [], n = Math.max(1, Math.ceil(data.length / SHEET_PART));
  for (var i = 0; i < n; i++) rows.push({ id: id, part: String(i), data: data.slice(i * SHEET_PART, (i + 1) * SHEET_PART), updated: updated || nowISO(), deleted: '' });
  return { rows: rows, size: data.length };
}
async function unpackSheet(rows) {
  var parts = rows.filter(function (r) { return r.deleted !== '1'; }).slice().sort(function (a, b) { return Number(a.part) - Number(b.part); });
  if (!parts.length) return null;
  var data = parts.map(function (r) { return r.data; }).join('');
  var kind = data.charAt(0), bytes = b64uToBytes(data.slice(1));
  if (kind === 'z') bytes = await inflateBytes(bytes); else if (kind !== 'r') throw new Error('Unknown sheet format');
  return JSON.parse(new TextDecoder().decode(bytes));
}
function groupSheetRows(rows) {
  var map = {}, order = [];
  (rows || []).forEach(function (r) {
    if (!r || !r.id) return;
    var id = String(r.id);
    if (!map[id]) { map[id] = { id: id, updated: '', parts: [] }; order.push(id); }
    var g = map[id];
    if (String(r.updated || '') > g.updated) { g.updated = String(r.updated || ''); g.parts = [r]; }
    else if (String(r.updated || '') === g.updated) g.parts.push(r);
  });
  return order.map(function (id) { return map[id]; });
}
// Newer group wins as a whole, so parts of an old and a new version never mix.
function mergeSheetRows(local, remote) {
  var L = groupSheetRows(local), R = groupSheetRows(remote), map = {}, order = [];
  R.forEach(function (g) { map[g.id] = g; order.push(g.id); });
  L.forEach(function (g) {
    if (!map[g.id]) { map[g.id] = g; order.push(g.id); }
    else if (g.updated > map[g.id].updated) map[g.id] = g;
  });
  var out = [];
  order.forEach(function (id) { map[id].parts.slice().sort(function (a, b) { return Number(a.part) - Number(b.part); }).forEach(function (r) { out.push(normRow(r, SHEET_COLS)); }); });
  return out;
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
  makeFFT: makeFFT, detectKey: detectKey, analyzeAudio: analyzeAudio, draftChart: draftChart, chordsForRanges: chordsForRanges,
  todayISO: todayISO, fmtDate: fmtDate,
  SHEET_COLS: SHEET_COLS, SHEET_PART: SHEET_PART, SHEET_MAX: SHEET_MAX,
  parseTime: parseTime, timeInfo: timeInfo, emptySheet: emptySheet, resolveBars: resolveBars,
  normChordSym: normChordSym, isChordSym: isChordSym, chordRoot: chordRoot, transposeChordSym: transposeChordSym, chordParts: chordParts, chordDisplay: chordDisplay, nashSym: nashSym, romanFor: romanFor,
  pitchMidi: pitchMidi, midiPitch: midiPitch, transposePitch: transposePitch,
  signedShift: signedShift, transposeSheet: transposeSheet, sheetToKey: sheetToKey,
  parseBarText: parseBarText, barToText: barToText, barsToLine: barsToLine, parseBars: parseBars, sheetToText: sheetToText, defaultEvents: defaultEvents, evSorted: evSorted,
  sheetSections: sheetSections, isChorusLabel: isChorusLabel, chorusBarRange: chorusBarRange, chartToSheet: chartToSheet,
  gridFromTempo: gridFromTempo, gridBarAt: gridBarAt, gridTimeAt: gridTimeAt, gridBarEnd: gridBarEnd, gridFromTaps: gridFromTaps, gridFromAnalysis: gridFromAnalysis, gridSetBar: gridSetBar, gridSetTempo: gridSetTempo, parseGrid: parseGrid,
  packSheet: packSheet, unpackSheet: unpackSheet, groupSheetRows: groupSheetRows, mergeSheetRows: mergeSheetRows
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.WCore = api;
})(typeof window !== 'undefined' ? window : this);
