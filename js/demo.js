/* A demo song with every kind of mark, built in code. It is never synced to the Sheet. No lyrics. */
(function () {
'use strict';
// bar: [ [at, d, kind, chord, accent, tie, pitches], ... ] as in the design mockup
function B(evs, extra) {
  var bar = { ch: [], ev: [] };
  evs.forEach(function (t) {
    var e = { at: t[0], d: t[1], k: t[2] };
    if (t[3]) bar.ch.push({ at: t[0], c: t[3] });
    if (t[4]) e.a = t[4];
    if (t[5]) e.tie = true;
    if (t[6]) e.p = t[6];
    bar.ev.push(e);
  });
  Object.keys(extra || {}).forEach(function (k) { bar[k] = extra[k]; });
  return bar;
}
function build() {
  var bars = [
    // A Intro
    B([[0, 2, 's', 'Emaj7'], [2, 2, 's'], [4, 2, 's'], [6, 2, 's']], { mark: 'A', label: 'Intro', dyn: 'mp' }),
    B([[0, 2, 's', 'B/D#'], [2, 2, 's'], [4, 2, 's', 'C#m7'], [6, 2, 's']]),
    B([[0, 2, 's', 'A2'], [2, 2, 's'], [4, 2, 's'], [6, 2, 's']]),
    B([[0, 3, 'h', 'Bsus'], [3, 1, 'h', 'B', '>'], [4, 2, 'r'], [6, 2, 'r']], { double: true, text: 'Band stop' }),
    // B Verse
    B([[0, 2, 's', 'E'], [2, 2, 's'], [4, 2, 's'], [6, 2, 's']], { mark: 'B', label: 'Verse', repStart: true }),
    B([[0, 2, 's', 'B/D#'], [2, 2, 's'], [4, 1, 'h'], [5, 1, 'h', 'C#m7', '>', true], [6, 2, 'h']]),
    B([[0, 2, 's', 'A'], [2, 2, 's'], [4, 2, 's', 'E/G#'], [6, 2, 's']], { hairpin: '<' }),
    B([[0, 2, 's', 'F#m7'], [2, 2, 's'], [4, 2, 's', 'Bsus'], [6, 1, 's'], [7, 1, 'h', 'B', '>']], { repEnd: true, times: 2 }),
    // C Chorus
    B([[0, 1, 'n', 'A', '^', false, ['A4', 'C#5', 'E5']], [1, 1, 'r'], [2, 2, 'r'], [4, 2, 's'], [6, 1, 'n', null, null, false, ['F#4']], [7, 1, 'n', 'B', '>', true, ['G#4']]], { mark: 'C', label: 'Chorus', dyn: 'f', text: 'Tutti' }),
    B([[0, 4, 'n', null, null, false, ['G#4']], [4, 2, 's', 'C#m7'], [6, 2, 's']]),
    B([[0, 3, 'n', 'A', '>', false, ['C#5']], [3, 1, 'n', 'B', '>', false, ['D#5']], [4, 2, 'r'], [6, 1, 'n', null, null, false, ['B4']], [7, 1, 'n', 'E/G#', '>', false, ['G#4']]], { text: 'Unison' }),
    B([[0, 2, 'n', 'F#m7', '^', false, ['A4', 'C#5', 'E5']], [2, 2, 'r'], [4, 2, 'n', 'B', '^', false, ['A4', 'D#5', 'F#5']], [6, 2, 'r']]),
    B([[0, 2, 's', 'A'], [2, 2, 's'], [4, 2, 's', 'B'], [6, 2, 's']]),
    B([[0, 2, 's', 'C#m7'], [2, 2, 's'], [4, 1, 'h'], [5, 1, 'h', 'B/D#', '>'], [6, 2, 'h']]),
    B([[0, 2, 's', 'A'], [2, 2, 's'], [4, 2, 's', 'Bsus'], [6, 2, 's', 'B']], { ending: '1.', repEnd: true, times: 2 }),
    B([[0, 3, 'h', 'A', '>'], [3, 1, 'h', 'B', '>'], [4, 4, 'r']], { ending: '2.', double: true, text: 'Pad holds, key change' }),
    // D Chorus in F
    B([[0, 2, 's', 'Bb'], [2, 2, 's'], [4, 2, 's', 'C'], [6, 2, 's']], { mark: 'D', label: 'Chorus in F', key: 'F', dyn: 'ff' }),
    B([[0, 2, 's', 'Dm7'], [2, 2, 's'], [4, 1, 'h'], [5, 1, 'h', 'C/E', '>', true], [6, 2, 'h']]),
    B([[0, 2, 's', 'Bb'], [2, 2, 's'], [4, 2, 's', 'C'], [6, 1, 'h'], [7, 1, 'h', 'Dm7', '>']], { ds: 'D.S. al Coda' }),
    B([[0, 8, 's', 'Fadd9']], { ferm: true, final: true, text: 'rit. last time' })
  ];
  // Bars that also show a segno, a coda, a vamp and a unison line in the key change
  bars[4].segno = true;
  bars[19].coda = true;
  var sheet = { v: 1, key: 'E', mode: 'major', time: '4/4', tempo: 72, sub: 8, bars: bars, demo: true };
  return sheet;
}
window.WDemo = { sheet: build, id: 'demo-song', title: 'Demo song', singer: 'Fero', key: 'E', bpm: 72 };
})();
