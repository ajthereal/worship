/* Worship synth: a soft piano-like voice from a few partials, plus a click. No samples. */
(function () {
'use strict';
var WS = window.WS;
var ctx = null, master = null, comp = null, held = {};

var lastWarn = 0, ka = null, kaUrl = null, unlocked = false;

function warn(msg) {
  var n = Date.now();
  if (n - lastWarn < 30000) return;
  lastWarn = n;
  if (WS.toast) WS.toast(msg, 5000);
}
var NO_SOUND = 'No sound. Turn off Silent mode or turn up the volume, then tap again.';

// Make iOS play Web Audio with the ringer switch on. Leaves the mic mode (play-and-record) alone.
function setPlaybackSession() {
  try {
    var s = navigator.audioSession;
    if (s && s.type !== 'play-and-record' && s.type !== 'playback') s.type = 'playback';
  } catch (e) { /* ignore */ }
}

// Fallback for iOS without navigator.audioSession: a silent looping element switches iOS to the playback category.
function silentWav() {
  var rate = 8000, n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  function str(o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
function startKeepAlive() {
  if (navigator.audioSession) return;
  try {
    if (Synth.extPlaying && Synth.extPlaying()) return;
    if (!ka) {
      kaUrl = silentWav();
      ka = new Audio(); ka.src = kaUrl; ka.loop = true; ka.volume = 1;
      ka.setAttribute('playsinline', ''); ka.setAttribute('webkit-playsinline', '');
    }
    if (ka.paused) { var p = ka.play(); if (p && p.catch) p.catch(function () { /* blocked until a gesture, retried on the next one */ }); }
  } catch (e) { /* ignore */ }
}
function stopKeepAlive() { try { if (ka && !ka.paused) ka.pause(); } catch (e) { /* ignore */ } }

function ac() {
  if (!ctx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { warn('No sound. This browser cannot play audio. Open the app in Safari.'); return null; }
    setPlaybackSession();
    try { ctx = new AC(); } catch (e) { warn('No sound. The audio could not start: ' + ((e && e.message) || 'unknown error') + '.'); return null; }
    master = ctx.createGain(); master.gain.value = 0.7;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state !== 'running') resumeCtx();
  return ctx;
}
function resumeCtx() {
  try {
    var p = ctx.resume();
    if (p && p.catch) p.catch(function () { /* checked below */ });
    return p;
  } catch (e) { return null; }
}
// Runs inside a gesture. Warns once per 30 s if the context is still not running after a moment.
function unlockNow(quiet) {
  var a = ac(); if (!a) return null;
  startKeepAlive();
  if (a.state !== 'running') {
    var p = resumeCtx();
    if (!quiet) setTimeout(function () { if (ctx && ctx.state !== 'running') warn(NO_SOUND); }, 400);
    return p;
  }
  return null;
}
function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

// partials: [ratio, gain, decay seconds]
var PARTS = [[1, 1, 1.6], [2, 0.42, 1.0], [3, 0.2, 0.7], [4, 0.1, 0.45], [5.01, 0.05, 0.3]];

function voice(midi, vel, hold) {
  var a = ac(); if (!a) return null;
  if (a.state !== 'running') {
    // The context is still waking up. Play the note as soon as it runs so the first tap is not lost.
    var pend = { stopped: false, midi: midi, real: null };
    pend.stop = function (rel) { pend.stopped = true; if (pend.real) pend.real.stop(rel); };
    var go = function () {
      if (pend.stopped) return;
      if (ctx.state !== 'running') return;
      pend.real = build(midi, vel, hold);
    };
    var p = resumeCtx();
    if (p && p.then) p.then(go, function () { /* warned by the unlock check */ });
    setTimeout(function () { if (ctx && ctx.state !== 'running') warn(NO_SOUND); }, 400);
    return pend;
  }
  return build(midi, vel, hold);
}
function build(midi, vel, hold) {
  var a = ctx;
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
  unlock: function () { return unlockNow(); },
  extPlaying: null,
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

// Global unlock: the first real gesture creates and resumes the context. Later gestures only act if it fell asleep.
function onGesture() {
  if (!unlocked) { unlocked = true; unlockNow(true); return; }
  if (ctx && ctx.state !== 'running') unlockNow(true);
  else startKeepAlive();
}
document.addEventListener('pointerdown', onGesture, true);
document.addEventListener('touchend', onGesture, true);
document.addEventListener('visibilitychange', function () {
  if (document.hidden) { stopKeepAlive(); }
});
})();
