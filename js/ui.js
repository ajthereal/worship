/* Worship UI helpers: DOM builder, icons, toast, sheets, theme. */
(function () {
'use strict';
var WS = window.WS = window.WS || {};

function h(tag, attrs) {
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    var v = attrs[k];
    if (v == null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  });
  for (var i = 2; i < arguments.length; i++) addOne(el, arguments[i]);
  return el;
}
function add(el) {
  for (var i = 1; i < arguments.length; i++) addOne(el, arguments[i]);
  return el;
}
function addOne(el, c) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) { c.forEach(function (x) { addOne(el, x); }); return; }
  el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
}
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

var ICON = {
  back: '<path d="M15 5l-7 7 7 7"/>', more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  sets: '<rect x="4" y="5" width="16" height="4" rx="1"/><rect x="4" y="11" width="16" height="4" rx="1"/><rect x="4" y="17" width="10" height="2" rx="1"/>',
  songs: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  keys: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 6v7M12 6v7M16 6v7M8 13h0"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 12" transform="translate(0 -6)"/>',
  redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 000 12" transform="translate(0 -6)"/>',
  prev: '<path d="M6 5v14M18 5L9 12l9 7z"/>', next: '<path d="M18 5v14M6 5l9 7-9 7z"/>',
  loop: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 014-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 01-4 4H4"/>',
  repeat1: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 014-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 01-4 4H4"/><path d="M11 10h1.5v5"/>',
  metro: '<path d="M8 21h8l-2-16h-4z"/><path d="M12 15l4-7"/>',
  up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
  cloud: '<path d="M7 18a4 4 0 010-8 5 5 0 019.6-1A4 4 0 0117 18z"/>', dl: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.8.6-1.5 1-1.5 2M12 17h0"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  staff: '<path d="M3 8h18M3 11h18M3 14h18M3 17h18"/>', tostart: '<path d="M5 5v14"/><path d="M19 5L9 12l10 7z"/>',
  back10: '<path d="M5 12a7.5 7.5 0 107.5-7.5H8"/><path d="M10.5 1.5L7.8 4.5l2.7 3"/><text x="12.5" y="15.2" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">10</text>',
  fwd10: '<path d="M19 12a7.5 7.5 0 11-7.5-7.5H16"/><path d="M13.5 1.5l2.7 3-2.7 3"/><text x="11.5" y="15.2" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">10</text>',
  follow: '<circle cx="12" cy="12" r="3"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
  zin: '<path d="M12 6v12M6 12h12"/>', zout: '<path d="M6 12h12"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>', pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>'
};
function icon(n) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICON[n] || '') + '</svg>'; }
function ib(n, label, fn, cls) { return h('button', { class: 'ib ' + (cls || ''), 'aria-label': label, title: label, html: icon(n), onclick: fn, type: 'button' }); }

var toastT;
function toast(msg, ms) {
  var t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, ms || 3200);
}

function sheet(content, o) {
  o = o || {};
  var bg = h('div', { class: 'sheet-bg', onclick: function (e) { if (e.target === bg) close(); } });
  var box = h('div', { class: 'sheet', role: 'dialog' });
  addOne(box, content);
  bg.appendChild(box);
  document.body.appendChild(bg);
  function close() { if (bg.parentNode) bg.parentNode.removeChild(bg); if (api.onclose) api.onclose(); }
  var api = { el: box, bg: bg, close: close };
  return api;
}
function confirmSheet(title, text, label, fn, bad) {
  var s = sheet([h('h3', { text: title }), h('p', { class: 'note', text: text }),
    h('div', { class: 'row' }, h('button', { class: 'btn grow', text: 'Cancel', onclick: function () { s.close(); } }),
      h('button', { class: 'btn pri grow' + (bad ? ' bad' : ''), text: label, onclick: function () { s.close(); fn(); } }))]);
  return s;
}
function debounce(fn, ms) {
  var t = null;
  function d() { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { t = null; fn.apply(self, a); }, ms); }
  d.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
  d.cancel = function () { clearTimeout(t); t = null; };
  return d;
}
function fmtTime(s) { s = Math.max(0, s || 0); var m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + (x < 10 ? '0' : '') + x; }
function mb(bytes) { return (bytes / 1048576).toFixed(bytes > 10485760 ? 0 : 1) + ' MB'; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/* theme: ws-theme is 'light' or 'dark' (everywhere). Live uses ws-live-theme, dark unless set. */
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
var quotaWarned = false;
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch (e) {
    if (!quotaWarned) { quotaWarned = true; toast('This device has no room to keep a copy. Free some space, your changes may not be saved here.', 6000); }
    return false;
  }
}
function applyTheme(name) {
  document.documentElement.setAttribute('data-theme', name);
  var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', name === 'dark' ? '#0C0D10' : '#FBFAF7');
}
function baseTheme() { return lsGet('ws-theme', 'light'); }
function liveTheme() { return lsGet('ws-live-theme', null) || (baseTheme() === 'dark' ? 'dark' : 'dark'); }

Object.assign(WS, { h: h, add: add, $: $, $$: $$, clear: clear, icon: icon, ib: ib, toast: toast, sheet: sheet, confirmSheet: confirmSheet, debounce: debounce, fmtTime: fmtTime, mb: mb, esc: esc, lsGet: lsGet, lsSet: lsSet, applyTheme: applyTheme, baseTheme: baseTheme, liveTheme: liveTheme, ICON: ICON });
})();
