/* Worship piano: an on-screen keyboard that fills its width (percent) or has fixed key widths (px, scrolls). */
(function () {
'use strict';
var WS = window.WS, W = window.WCore;
var WHITE = { 0: 1, 2: 1, 4: 1, 5: 1, 7: 1, 9: 1, 11: 1 };

WS.Piano = function (o) {
  var lo = o.lo == null ? 48 : o.lo, hi = o.hi == null ? 83 : o.hi, wpx = o.wpx || 0, flats = !!o.flats;
  var el = document.createElement('div');
  el.className = 'piano';
  var whites = [];
  for (var m = lo; m <= hi; m++) if (WHITE[m % 12]) whites.push(m);
  var n = whites.length, keys = {};
  if (wpx) el.style.width = (n * wpx) + 'px';
  whites.forEach(function (m, i) {
    var k = document.createElement('div');
    k.className = 'pk w'; k.setAttribute('data-midi', m);
    k.style.left = wpx ? (i * wpx) + 'px' : (i / n * 100) + '%';
    k.style.width = wpx ? wpx + 'px' : (100 / n) + '%';
    if (m % 12 === 0) k.textContent = 'C' + (Math.floor(m / 12) - 1);
    el.appendChild(k); keys[m] = k;
  });
  for (var m2 = lo; m2 <= hi; m2++) {
    if (WHITE[m2 % 12]) continue;
    var wi = whites.indexOf(m2 - 1);
    if (wi < 0) continue;
    var b = document.createElement('div');
    b.className = 'pk b'; b.setAttribute('data-midi', m2);
    var bw = wpx ? wpx * 0.62 : 62 / n;
    b.style.left = wpx ? ((wi + 1) * wpx - bw / 2) + 'px' : (((wi + 1) / n * 100) - bw / 2) + '%';
    b.style.width = wpx ? bw + 'px' : bw + '%';
    el.appendChild(b); keys[m2] = b;
  }
  var down = {}, on = {}, tones = {};
  function label(m) { return W.noteName(m, flats); }
  function paint(m) {
    var k = keys[m]; if (!k) return;
    k.classList.toggle('on', !!on[m]);
    k.classList.toggle('chordtone', !!tones[m] && !on[m]);
    var isC = m % 12 === 0;
    k.textContent = on[m] ? label(m) : (isC ? 'C' + (Math.floor(m / 12) - 1) : '');
  }
  function press(e) {
    var t = e.target.closest ? e.target.closest('.pk') : null;
    if (!t) return;
    e.preventDefault();
    var m = Number(t.getAttribute('data-midi'));
    down[e.pointerId] = m;
    if (o.onDown) o.onDown(m);
  }
  function release(e) {
    var m = down[e.pointerId];
    if (m == null) return;
    delete down[e.pointerId];
    if (o.onUp) o.onUp(m);
  }
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
  return {
    el: el, keys: keys, lo: lo, hi: hi, whiteCount: n,
    setOn: function (list) { var old = Object.keys(on); on = {}; (list || []).forEach(function (m) { on[m] = 1; }); old.forEach(function (m) { paint(Number(m)); }); Object.keys(on).forEach(function (m) { paint(Number(m)); }); },
    setTones: function (list) { var old = Object.keys(tones); tones = {}; (list || []).forEach(function (m) { tones[m] = 1; }); old.forEach(function (m) { paint(Number(m)); }); Object.keys(tones).forEach(function (m) { paint(Number(m)); }); },
    setFlats: function (f) { flats = f; },
    isOn: function (m) { return !!on[m]; }
  };
};
})();
