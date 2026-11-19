/* Worship synth: a soft piano-like voice from a few partials, plus a click. No samples. */
(function () {
'use strict';
var WS = window.WS;
var ctx = null, master = null, comp = null, held = {};

function ac() {
  if (!ctx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.7;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

// partials: [ratio, gain, decay seconds]
var PARTS = [[1, 1, 1.6], [2, 0.42, 1.0], [3, 0.2, 0.7], [4, 0.1, 0.45], [5.01, 0.05, 0.3]];

function voice(midi, vel, hold) {
  var a = ac(); if (!a) return null;
  var t0 = a.currentTime, f = hz(midi), g = a.createGain(), lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = Math.min(9000, 1800 + f * 4); lp.Q.value = 0.3;
  var peak = 0.22 * (vel == null ? 0.8 : vel);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
  var oscs = [];
  PARTS.forEach(function (p, i) {
    var o = a.createOscillator(), pg = a.createGain();
    o.type = i === 0 ? 'triangle' : 'sine';
    o.frequency.value = f * p[0];
    o.detune.value = (i === 0 ? 0 : (i % 2 ? 4 : -3));
    var dec = p[2] * (1.2 - Math.min(1, (midi - 36) / 80));
    pg.gain.setValueAtTime(p[1], t0);
    pg.gain.exponentialRampToValueAtTime(Math.max(0.001, p[1] * 0.04), t0 + dec);
    o.connect(pg); pg.connect(lp); o.start(t0);
    oscs.push(o);
  });
  lp.connect(g); g.connect(master);
  var v = { g: g, oscs: oscs, midi: midi };
  v.stop = function (rel) {
    var t = a.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (rel || 0.35));
    oscs.forEach(function (o) { try { o.stop(t + (rel || 0.35) + 0.05); } catch (e) { /* ignore */ } });
  };
  if (!hold) { var d = 1.6; setTimeout(function () { v.stop(0.5); }, d * 1000); }
  return v;
}

var Synth = {
  available: function () { return !!(window.AudioContext || window.webkitAudioContext); },
  unlock: function () { return ac(); },
  state: function () { return ctx ? ctx.state : 'none'; },
  note: function (midi, vel) { return voice(midi, vel, false); },
  chord: function (midis, o) {
    o = o || {};
    midis.slice().sort(function (a, b) { return a - b; }).forEach(function (m, i) {
      setTimeout(function () { voice(m, o.vel == null ? 0.7 : o.vel, false); }, i * (o.strum == null ? 14 : o.strum));
    });
  },
  on: function (midi, vel) { if (held[midi]) held[midi].stop(0.1); held[midi] = voice(midi, vel, true); },
  off: function (midi) { if (held[midi]) { held[midi].stop(0.4); delete held[midi]; } },
  allOff: function () { Object.keys(held).forEach(function (m) { held[m].stop(0.2); }); held = {}; },
  click: function (accent, when) {
    var a = ac(); if (!a) return;
    var t = when || a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'square'; o.frequency.value = accent ? 1500 : 1000;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.22, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.07);
  },
  now: function () { return ctx ? ctx.currentTime : 0; },
  ctx: function () { return ac(); },
  master: function () { ac(); return master; },
  // MIDI note numbers of a chord symbol, around middle C
  chordMidis: function (sym, base) {
    var c = window.WCore.chordRoot(sym); if (!c) return [];
    base = base || 48;
    var q = c.qual || '', iv = [0, 4, 7];
    if (/^(m|min|-)(?!aj)/.test(q)) iv = [0, 3, 7];
    if (/dim|°/.test(q)) iv = [0, 3, 6];
    if (/aug|\+/.test(q)) iv = [0, 4, 8];
    if (/^m7b5|ø/.test(q)) iv = [0, 3, 6, 10];
    if (/sus4|sus$/.test(q)) iv = [0, 5, 7]; else if (/sus2|^2/.test(q)) iv = [0, 2, 7];
    if (/maj7|Δ/.test(q)) iv = iv.concat([11]); else if (/7/.test(q) && !/ø|m7b5|dim7|°7/.test(q)) iv = iv.concat([10]); else if (/dim7|°7/.test(q)) iv = iv.concat([9]);
    if (/6/.test(q) && !/ 7/.test(q)) iv = iv.concat([9]);
    if (/9|add9/.test(q)) iv = iv.concat([14]);
    if (/11/.test(q)) iv = iv.concat([17]);
    if (/13/.test(q)) iv = iv.concat([21]);
    var root = base + ((c.root - base % 12) + 12) % 12;
    var out = iv.map(function (i) { return root + i; });
    if (c.bass >= 0) { var b = base - 12 + ((c.bass - (base - 12) % 12) + 12) % 12; out.unshift(b); }
    return out;
  }
};
WS.Synth = Synth;
})();
