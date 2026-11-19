// Run: node tests/core.test.js
const C = require('../core.js');
let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { pass++; console.log('  ok   ' + name); },
    (e) => { fail++; failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message || e)); }
  );
}
function eq(a, b, msg) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error((msg ? msg + ': ' : '') + 'expected ' + y + ' got ' + x);
}
const tr = (chart, o) => C.transposeChartText(chart, o);

const SEED = `Shalomm..

Berikut list lagu Doa Puasa

Allah Sanggup (Fero) E/F
https://youtube.com/watch?v=J9zNq2vV2WQ&si=10LSDR-JZZIRCaKmr

I will Run to You (Jess) E/F
https://youtu.be/8Q6FTjogqE0?si=TBRpdFpnFKmXDYyt

Kau Tetap Allah (betapa dahsyat) F/G

DOA

Saatku MenyembahMu / Reff Only (Fero) F
https://youtube.com/watch?v=-wc5MUdvrV4&si=gf3hOhdPO0eh-pFIM
https://youtube.com/watch?v=GS4hVB-Jmql&si=AxYEo4Hcux070NfH`;

function synth(sr, seconds, bpm, chords) {
  // Simple band: chord tones (3 harmonics) plus a click on every beat
  const n = Math.floor(sr * seconds), out = new Float32Array(n);
  const beat = 60 / bpm, bar = beat * 4;
  const freq = (pc, oct) => 440 * Math.pow(2, (pc - 9) / 12 + (oct - 4));
  for (let i = 0; i < n; i++) {
    const ts = i / sr, bi = Math.floor(ts / bar), ch = chords[bi % chords.length];
    let v = 0;
    ch.forEach((pc, k) => {
      for (let h = 1; h <= 3; h++) v += Math.sin(2 * Math.PI * freq(pc, k === 0 ? 3 : 4) * h * ts) / (h * 2);
    });
    const inBeat = ts % beat;
    if (inBeat < 0.03) v += (Math.random() * 2 - 1) * 2.5 * (1 - inBeat / 0.03);
    out[i] = v * 0.15;
  }
  return out;
}

(async () => {
  console.log('Transpose');
  await t('E -> F (flats)', () => eq(tr('[Chorus] | E | B | C#m | A |', { songKey: 'E', key: 'F' }), '[Chorus] | F | C | Dm | Bb |'));
  await t('E -> Eb uses flats', () => eq(tr('[Verse 1] | E | B | C#m | A |', { songKey: 'E', key: 'Eb' }), '[Verse 1] | Eb | Bb | Cm | Ab |'));
  await t('E -> G stays sharps-free', () => eq(tr('| E | B |', { songKey: 'E', key: 'G' }), '| G | D |'));
  await t('E -> F# uses sharps', () => eq(tr('| E | B | A |', { songKey: 'E', key: 'F#' }), '| F# | C# | B |'));
  await t('C#m in key E is 6m', () => eq(tr('[Verse] | E | C#m | A | B |', { songKey: 'E', key: 'E', nash: true }), '[Verse] | 1 | 6m | 4 | 5 |'));
  await t('Nashville does not change when transposed', () => eq(tr('| E | C#m | A | B |', { songKey: 'E', key: 'Ab', nash: true }), '| 1 | 6m | 4 | 5 |'));
  await t('slash chord B/D# +1 -> C/E', () => eq(tr('| B/D# |', { songKey: 'E', key: 'F' }), '| C/E |'));
  await t('slash chord in Nashville', () => eq(tr('| B/D# |', { songKey: 'E', key: 'E', nash: true }), '| 5/7 |'));
  await t('>> modulation shifts too', () => {
    const got = tr('[Bridge] | A | B |\n>> F\n[Chorus] | Bb | C |', { songKey: 'E', key: 'F' }).split('\n');
    eq(got[0], '[Bridge] | Bb | C |');
    eq(got[1], '>> Gb'); // F + 1 semitone; flat-key spelling
    eq(got[2], '[Chorus] | B | Db |');
  });
  await t('>> numbers use the new key', () => eq(tr('[Chorus] | E | A |\n>> F\n[Chorus] | F | Bb |', { songKey: 'E', key: 'E', nash: true }), '[Chorus] | 1 | 4 |\n>> F\n[Chorus] | 1 | 4 |'));
  await t('split bar | E B |', () => eq(tr('| E B | A |', { songKey: 'E', key: 'F' }), '| F C | Bb |'));
  await t('hit E!', () => eq(tr('| E! | A |', { songKey: 'E', key: 'F' }), '| F! | Bb |'));
  await t('push ^A', () => eq(tr('| ^A E |', { songKey: 'E', key: 'F' }), '| ^Bb F |'));
  await t('N.C. untouched', () => eq(tr('| N.C. | E |', { songKey: 'E', key: 'F' }), '| N.C. | F |'));
  await t('cue in parentheses is not transposed', () => eq(tr('[Intro] | E | A | (keys only, A to E) (soft Dm)', { songKey: 'E', key: 'F' }), '[Intro] | F | Bb | (keys only, A to E) (soft Dm)'));
  await t('xN repeat kept', () => eq(tr('[Chorus] | A | B | x2', { songKey: 'E', key: 'E' }), '[Chorus] | A | B | x2'));
  await t('section aliases', () => {
    const l = C.layoutChart('[Reff] | A |\n[Bait 2] | E |\n[Pre-Reff] | B |', { songKey: 'E', key: 'E' }).lines;
    eq(l.map(x => x.name), ['Chorus', 'Verse 2', 'Pre-Chorus']);
  });
  await t('word that looks like text is shown as-is', () => {
    const l = C.layoutChart('[Intro] | E | soft |', { songKey: 'E', key: 'E' }).lines[0];
    eq(l.cues, ['soft']);
  });
  await t('chorus-only filter keeps Chorus and Tag', () => {
    const r = C.layoutChart('[Verse] | A |\n[Chorus] | E |\n[Bridge] | B |\n[Tag] | A |', { songKey: 'E', key: 'E', only: 'chorus' });
    eq(r.lines.map(x => x.name), ['Chorus', 'Tag']); eq(r.filtered, true);
  });
  await t('chorus-only with no chorus shows everything', () => {
    const r = C.layoutChart('[Verse] | A |', { songKey: 'E', key: 'E', only: 'chorus' });
    eq(r.filtered, false); eq(r.lines.length, 1);
  });
  await t('diatonic chords', () => {
    eq(C.diatonicChords('E'), ['E', 'F#m', 'G#m', 'A', 'B', 'C#m', 'D#dim']);
    eq(C.diatonicChords('F'), ['F', 'Gm', 'Am', 'Bb', 'C', 'Dm', 'Edim']);
    eq(C.diatonicChords('Am'), ['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
  });
  await t('transposeKeyName', () => { eq(C.transposeKeyName('E', 1), 'F'); eq(C.transposeKeyName('Am', 2), 'Bm'); eq(C.transposeKeyName('F', 4), 'A'); });

  console.log('WhatsApp parser');
  const wa = C.parseWhatsApp(SEED, { today: '2026-11-19' });
  await t('seed: set name', () => eq(wa.name, 'Doa Puasa'));
  await t('seed: 4 songs + 1 cue', () => { eq(wa.items.filter(i => i.t === 'song').length, 4); eq(wa.items.filter(i => i.t === 'cue').length, 1); });
  await t('seed: order', () => eq(wa.items.map(i => i.t), ['song', 'song', 'song', 'cue', 'song']));
  await t('seed: song 1', () => { const s = wa.items[0]; eq([s.title, s.key, s.to, s.singer, s.links.length, s.keyMode], ['Allah Sanggup', 'E', 'F', 'Fero', 1, 'mod']); });
  await t('seed: song 2', () => { const s = wa.items[1]; eq([s.title, s.key, s.to, s.singer, s.links.length], ['I will Run to You', 'E', 'F', 'Jess', 1]); });
  await t('seed: song 3', () => { const s = wa.items[2]; eq([s.title, s.note, s.key, s.to, s.singer, s.links.length], ['Kau Tetap Allah', 'betapa dahsyat', 'F', 'G', '', 0]); });
  await t('seed: cue DOA -> Prayer', () => { eq(wa.items[3].text, 'Prayer'); eq(wa.items[3].orig, 'DOA'); });
  await t('seed: song 4', () => { const s = wa.items[4]; eq([s.title, s.note, s.only, s.key, s.to, s.singer, s.links.length], ['Saatku MenyembahMu', 'Chorus only', 'chorus', 'F', '', 'Fero', 2]); });
  await t('seed: all links valid', () => eq(wa.items.filter(i => i.t === 'song').every(s => s.links.every(l => l.valid)), true));
  await t('seed: no date found', () => eq(wa.date, ''));
  await t('date and noise: bold, emoji, NBSP, list numbers, zero width', () => {
    const r = C.parseWhatsApp('*Berikut list lagu Ibadah Raya* 21 Nov 2026 \u{1F64F}\n1. *Yesus Kau Baik* (Jess) G​\n2) Doa\n', { today: '2026-11-01' });
    eq(r.name, 'Ibadah Raya'); eq(r.date, '2026-11-21');
    eq(r.items[0].title, 'Yesus Kau Baik'); eq(r.items[0].singer, 'Jess'); eq(r.items[0].key, 'G'); eq(r.items[1].text, 'Prayer');
  });
  await t('parseSongLine key variants', () => {
    eq(C.parseSongLine('Song A (Bob) Bb/B').to, 'B');
    eq(C.parseSongLine('Song A (Bob) Key: C#m').key, 'C#m');
    eq(C.parseSongLine('Song A E/F (Bob)').singer, 'Bob');
    eq(C.parseSongLine('Song A (Fero & Jess) E').singer, 'Fero & Jess');
  });
  await t('findDate formats', () => {
    eq(C.findDate('Sabtu 21 Nov 2026', '2026-11-01').date, '2026-11-21');
    eq(C.findDate('21/11/2026', '2026-11-01').date, '2026-11-21');
    eq(C.findDate('3 Januari', '2026-12-20').date, '2027-01-03');
  });
  await t('matchSong fuzzy', () => {
    const lib = [{ id: '1', title: 'Allah Sanggup', deleted: '' }, { id: '2', title: 'Kau Tetap Allah', deleted: '' }];
    eq(C.matchSong('allah sanggup!', lib).id, '1'); eq(C.matchSong('Kau tetap Allah', lib).id, '2'); eq(C.matchSong('Something else', lib), null);
  });

  console.log('YouTube');
  const yt = (u) => C.extractYouTube(u);
  await t('watch', () => eq([yt('https://www.youtube.com/watch?v=J9zNq2vV2WQ&si=abc').id, yt('https://youtube.com/watch?v=J9zNq2vV2WQ').valid], ['J9zNq2vV2WQ', true]));
  await t('youtu.be', () => eq(yt('https://youtu.be/8Q6FTjogqE0?si=TBRpdFpnFKmXDYyt').id, '8Q6FTjogqE0'));
  await t('shorts', () => eq(yt('https://www.youtube.com/shorts/8Q6FTjogqE0').id, '8Q6FTjogqE0'));
  await t('m.', () => eq(yt('https://m.youtube.com/watch?v=8Q6FTjogqE0').id, '8Q6FTjogqE0'));
  await t('music.', () => eq(yt('https://music.youtube.com/watch?v=8Q6FTjogqE0&list=x').id, '8Q6FTjogqE0'));
  await t('id with dash', () => eq(yt('https://youtube.com/watch?v=-wc5MUdvrV4').valid, true));
  await t('10-char id is flagged', () => { const r = yt('https://youtu.be/abcdefghij'); eq(r.valid, false); eq(r.id, 'abcdefghij'); });
  await t('12-char id is flagged', () => eq(yt('https://youtube.com/watch?v=abcdefghijkl').valid, false));
  await t('not youtube', () => eq(yt('https://example.com/watch?v=8Q6FTjogqE0'), null));
  await t('yt list with label', () => { const l = C.parseYtList('https://youtu.be/8Q6FTjogqE0 Original\nhttps://youtu.be/short'); eq([l[0].label, l[0].valid, l[1].valid], ['Original', true, false]); });

  console.log('Merge');
  const R = (id, updated, extra) => Object.assign({ id, updated, title: 't-' + updated }, extra || {});
  await t('newer wins (remote newer)', () => eq(C.mergeRows([R('a', '2026-01-01')], [R('a', '2026-02-01')])[0].title, 't-2026-02-01'));
  await t('newer wins (local newer)', () => eq(C.mergeRows([R('a', '2026-03-01')], [R('a', '2026-02-01')])[0].title, 't-2026-03-01'));
  await t('union of ids', () => eq(C.mergeRows([R('a', '1')], [R('b', '2')]).map(r => r.id).sort(), ['a', 'b']));
  await t('tombstone wins when newer', () => eq(C.mergeRows([R('a', '2026-05-01', { deleted: '1' })], [R('a', '2026-02-01', { deleted: '' })])[0].deleted, '1'));
  await t('older tombstone loses', () => eq(C.mergeRows([R('a', '2026-01-01', { deleted: '1' })], [R('a', '2026-02-01', { deleted: '' })])[0].deleted, ''));
  await t('rows without id are dropped', () => eq(C.mergeRows([{ title: 'x' }], []).length, 0));

  console.log('Share');
  const payload = { v: 1, n: 'Doa Puasa', d: '2026-11-21', m: '2026-11-19T10:00:00Z', i: [{ s: 'Allah Sanggup', k: 'E', t: 'F', b: '72', r: ['Intro', 'Verse 1', 'Chorus x2'] }, { c: 'Prayer' }] };
  await t('round trip (default path)', async () => { const s = await C.encodeShare(payload); eq(await C.decodeShare(s), payload); });
  await t('round trip (zlib)', async () => { const s = await C.encodeShare(payload, { forceZlib: true }); eq(await C.decodeShare(s, { forceZlib: true }), payload); });
  await t('zlib and CompressionStream interoperate', async () => {
    const a = await C.encodeShare(payload, { forceZlib: true });
    eq(await C.decodeShare(a), payload);
  });
  await t('url safe, short', async () => { const s = await C.encodeShare(payload); eq(/^[zr][A-Za-z0-9_-]+$/.test(s), true); eq(s.length < 400, true); });
  await t('unicode survives', async () => { const p = { n: 'Ibadah Pujian – Doa' }; eq(await C.decodeShare(await C.encodeShare(p)), p); });

  console.log('Misc');
  await t('tap tempo', () => eq(C.tapBpm([0, 500, 1000, 1500, 2000]), 120));
  await t('tap tempo ignores a stray tap', () => eq(C.tapBpm([0, 500, 1000, 1900, 2400, 2900]), 120));
  await t('normRow makes strings', () => eq(C.normRow({ id: 1, bpm: 72 }, ['id', 'bpm', 'x']), { id: '1', bpm: '72', x: '' }));
  await t('rowsEqual ignores order', () => eq(C.rowsEqual([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'a' }], ['id']), true));
  await t('fmtDate', () => eq(C.fmtDate('2026-11-21', true), 'Sat 21 Nov 2026'));

  console.log('Audio analysis (synthetic)');
  await t('FFT finds a 1 kHz tone', () => {
    const n = 1024, re = new Float64Array(n), im = new Float64Array(n), sr = 8192;
    for (let i = 0; i < n; i++) re[i] = Math.sin(2 * Math.PI * 1000 * i / sr);
    C.makeFFT(n)(re, im);
    let best = 0; for (let k = 1; k < n / 2; k++) if (Math.hypot(re[k], im[k]) > Math.hypot(re[best], im[best])) best = k;
    eq(Math.round(best * sr / n), 1000);
  });
  await t('key detection: C major profile', () => {
    const chroma = [6, 0.5, 3, 0.5, 4.5, 4, 0.5, 5, 0.5, 3.5, 0.5, 2.5];
    eq(C.detectKey(chroma).name, 'C');
    const rot = chroma.map((_, i) => chroma[(i + 12 - 4) % 12]);
    eq(C.detectKey(rot).name, 'E');
  });
  await t('band at 100 BPM in C: tempo, key, chords', async () => {
    const sr = 11025, C_ = [0, 4, 7], G_ = [7, 11, 2], Am = [9, 0, 4], F_ = [5, 9, 0];
    const x = synth(sr, 64, 100, [C_, G_, Am, F_]);
    let longest = 0, last = Date.now();
    const r = await C.analyzeAudio(x, sr, { budget: 40, onProgress: () => { longest = Math.max(longest, Date.now() - last); last = Date.now(); } });
    console.log('       bpm ' + r.bpm + ' key ' + r.keyName + ' bars ' + r.bars.length + ' : ' + r.bars.slice(0, 8).map(b => b.name).join(' '));
    eq(Math.abs(r.bpm - 100) <= 2, true, 'bpm ' + r.bpm);
    eq(r.keyName, 'C');
    const want = ['C', 'G', 'Am', 'F'];
    const first = r.bars.findIndex(q => q.name === 'C');
    const good = r.bars.filter((b, i) => b.name === want[(((i - first) % 4) + 4) % 4]).length;
    eq(good / r.bars.length > 0.7, true, 'chord match ' + good + '/' + r.bars.length);
    eq(longest < 400, true, 'longest gap between yields ' + longest + ' ms');
  });
  await t('draftChart text', () => eq(C.draftChart([{ root: 4, minor: false }, { root: 1, minor: true }, { nc: true }], 'E', 'F'), '[Part 1] | F | Dm | N.C. |'));

  /* ---------- lead sheet model ---------- */
  console.log('\nLead sheet');
  const ti = C.timeInfo('4/4', 8);
  const rt = (txt) => { const r = C.parseBarText(txt, ti); if (r.errors.length) throw new Error(txt + ' -> ' + r.errors.join('; ')); return C.barToText(r.bar, ti); };
  await t('time info 4/4, 3/4, 6/8, 16ths', () => {
    eq([ti.units, ti.bu, ti.beats], [8, 2, 4]);
    const a = C.timeInfo('3/4', 8); eq([a.units, a.bu, a.beats], [6, 2, 3]);
    const b = C.timeInfo('6/8', 8); eq([b.units, b.bu, b.beats, b.compound], [6, 3, 2, true]);
    const c = C.timeInfo('4/4', 16); eq([c.units, c.bu], [16, 4]);
  });
  await t('typed bars: round trip', () => {
    for (const x of ['E . . .', 'E . . ^B/D#', 'E! . r r', 'A,B . C .', 'Bsus! B! r r', 'C#m7 . A,B/D# .', 'F#m7 . ^Bsus .', 'r r E! .']) eq(rt(x), x, x);
  });
  await t('typed bars: short bar fills with holds', () => eq(rt('E'), 'E . . .'));
  await t('typed bars: push shortens the previous beat and ties', () => {
    const r = C.parseBarText('E . . ^B/D#', ti);
    eq(r.bar.ch, [{ at: 0, c: 'E' }, { at: 5, c: 'B/D#' }]);
    eq(r.bar.ev.slice(-2), [{ at: 5, d: 1, k: 'h', tie: true }, { at: 6, d: 2, k: 'h' }]);
    eq(r.bar.ev[2], { at: 4, d: 1, k: 's' });
  });
  await t('typed bars: hit holds lengthen, comp holds stay one slash per beat', () => {
    eq(C.parseBarText('E! . r r', ti).bar.ev, [{ at: 0, d: 4, k: 'h' }, { at: 4, d: 2, k: 'r' }, { at: 6, d: 2, k: 'r' }]);
    eq(C.parseBarText('E . . .', ti).bar.ev.map(e => e.k + e.d).join(), 's2,s2,s2,s2');
  });
  await t('typed bars: errors are plain and positional', () => {
    eq(C.parseBarText('E . . . .', ti).errors[0].startsWith('Too many beats'), true);
    eq(/not a chord/.test(C.parseBarText('E Zz . .', ti).errors[0]), true);
    eq(C.parseBarText('^E . . .', ti).warnings.length, 1);
    eq(C.parseBarText('A,B,C . . .', ti).errors.length, 1);
  });
  await t('typed bars: % repeat, mark, ending, cue', () => {
    eq(C.parseBarText('%', ti).bar.rep, '%');
    const m = C.parseBarText('[A Intro] E . . . (Band stop)', ti).bar;
    eq([m.mark, m.label, m.text], ['A', 'Intro', 'Band stop']);
    eq(C.parseBarText('1. A . . .', ti).bar.ending, '1.');
  });
  await t('typed bars: sixteenths', () => {
    const t16 = C.timeInfo('4/4', 16);
    const r = C.parseBarText('E . A,B .', t16);
    eq(r.errors, []);
    eq(C.barToText(r.bar, t16), 'E . A,B .');
    const r2 = C.parseBarText('E . A,.,.,B .', t16);
    eq(C.barToText(r2.bar, t16), 'E . A,.,.,B .');
    eq(r2.bar.ch.map(c => c.at), [0, 8, 11]);
  });
  await t('multi-bar line with repeats and marks', () => {
    const r = C.parseBars('[A Intro] |: E . . . | A . . . :| [B Verse] | B! r r r |]', () => ti);
    eq(r.errors, []);
    eq(r.bars.length, 3);
    eq([r.bars[0].mark, r.bars[0].repStart, r.bars[1].repEnd, r.bars[2].mark, r.bars[2].final], ['A', true, true, 'B', true]);
  });
  await t('sheet text round trip', () => {
    const sh = C.emptySheet('E', '4/4', 72);
    const r = C.parseBars('[A Intro] |: E . . . | A . . . :| [B Verse] | B! r r r || E . . ^B |]', () => ti);
    sh.bars = r.bars;
    const txt = C.sheetToText(sh);
    const r2 = C.parseBars(txt, () => ti);
    eq(r2.errors, []);
    eq(C.sheetToText(Object.assign({}, sh, { bars: r2.bars })), txt);
  });
  await t('chord parts for display', () => {
    eq(C.chordParts('C#m7'), { nc: false, root: 'C', acc: '♯', minor: 'm', sup: '7', bass: '', bassAcc: '' });
    eq(C.chordDisplay('Emaj7'), 'EΔ7');
    eq(C.chordDisplay('Bsus/D#'), 'Bsus/D♯');
    eq(C.chordDisplay('Bbadd9'), 'B♭add9');
    eq(C.chordDisplay('F#m7b5'), 'F♯ø7');
    eq(C.chordDisplay('N.C.'), 'N.C.');
  });
  await t('nashville and roman numerals', () => {
    eq(C.nashSym('B/D#', 'E'), '5/7'); eq(C.nashSym('C#m7', 'E'), '6m7'); eq(C.nashSym('Bb', 'F'), '4');
    eq(C.romanFor('E/G#', 'E'), 'I⁶'); eq(C.romanFor('C#m7', 'E'), 'vi⁷'); eq(C.romanFor('D', 'E'), '♭VII'); eq(C.romanFor('A', 'E'), 'IV');
  });
  const demo = () => {
    const s = C.emptySheet('E', '4/4', 72);
    s.bars = [
      { mark: 'A', label: 'Intro', ch: [{ at: 0, c: 'Emaj7' }, { at: 4, c: 'F#m7' }], ev: [{ at: 0, d: 8, k: 's' }] },
      { ch: [{ at: 0, c: 'A' }], ev: [{ at: 0, d: 3, k: 'n', p: ['C#5', 'E5'], a: '>' }, { at: 3, d: 1, k: 'n', p: ['F#4'] }, { at: 4, d: 4, k: 'r' }] },
      { key: 'F', ch: [{ at: 0, c: 'Bb' }, { at: 4, c: 'C/E' }], ev: [{ at: 0, d: 8, k: 's' }] }
    ];
    return s;
  };
  await t('transpose sheet: chords, pitches and key signatures', () => {
    const up = C.transposeSheet(demo(), 1);
    eq(up.key, 'F');
    eq(up.bars[0].ch.map(c => c.c), ['Fmaj7', 'Gm7']);
    eq(up.bars[1].ev[0].p, ['D5', 'F5']);
    eq(up.bars[1].ev[1].p, ['G4']);
    eq(up.bars[2].key, 'Gb');
    eq(up.bars[2].ch.map(c => c.c), ['B', 'Db/F']);
  });
  await t('transpose sheet: spelling follows the target key', () => {
    const dn = C.transposeSheet(demo(), -2);
    eq(dn.key, 'D'); eq(dn.bars[0].ch.map(c => c.c), ['Dmaj7', 'Em7']);
    const e2 = C.transposeSheet(C.emptySheet('E'), 3); eq(e2.key, 'G');
    const fl = C.transposeSheet(demo(), 1);
    eq(fl.bars[1].ch[0].c, 'Bb');
  });
  await t('sheetToKey picks the short way round', () => {
    const k = C.sheetToKey(demo(), 'D'); eq(k.key, 'D');
    eq(k.bars[1].ev[1].p, ['E4']);
    eq(C.sheetToKey(demo(), 'E').key, 'E');
  });
  await t('chart text -> sheet migration', () => {
    const sh = C.chartToSheet('[Intro] | E | B/D# | C#m | A |\n[Chorus] | A B | C#m7 B/D# | x2\n>> F\n[Chorus] | Bb | C |', 'E', '4/4', 72);
    eq(sh.key, 'E'); eq(sh.bars.length, 8);
    eq([sh.bars[0].mark, sh.bars[0].label, sh.bars[4].mark, sh.bars[4].label], ['A', 'Intro', 'B', 'Chorus']);
    eq(sh.bars[4].ch, [{ at: 0, c: 'A' }, { at: 4, c: 'B' }]);
    eq([sh.bars[4].repStart, sh.bars[5].repEnd, sh.bars[5].times], [true, true, 2]);
    eq(sh.bars[6].key, 'F'); eq(sh.bars[6].ch[0].c, 'Bb');
    eq(sh.bars[7].final, true);
  });
  await t('grid math', () => {
    const g = C.gridFromTempo(120, 1, 8, 4);
    eq(g.b.slice(0, 3), [1, 3, 5]); eq(g.end, 17);
    eq(C.gridBarAt(g, 0.5).bar, -1);
    eq(C.gridBarAt(g, 3.5), { bar: 1, frac: 0.25 });
    eq(C.gridBarAt(g, 16.9).bar, 7);
    eq(C.gridBarAt(g, 20).bar, -1);
    eq(C.gridTimeAt(g, 2, 0.5), 6);
    eq(C.gridTimeAt(g, 8, 0), 17);
    const s = C.gridSetBar(g, 0, 2); eq(s.b[0], 2); eq(s.b[1], 4);
    const q = C.gridSetTempo(g, 60, 4); eq(q.b[1], 5);
  });
  await t('grid from taps fills before and after', () => {
    const g = C.gridFromTaps([2, 4.1, 6.0, 8.1], 1, 8, 20);
    eq(g.b.length, 8); eq(g.b[1], 2); eq(g.b[4], 8.1); eq(g.b[0] < 2, true); eq(g.b[7] > 8.1, true);
  });
  await t('sheet storage: pack, split, unpack', async () => {
    const sh = demo();
    const p = await C.packSheet('s1', sh, '2026-11-19T10:00:00Z');
    eq(p.rows.length, 1); eq(p.rows[0].id, 's1'); eq(p.rows[0].part, '0');
    eq(await C.unpackSheet(p.rows), sh);
    const big = C.emptySheet('C', '4/4', 90);
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 2500; i++) big.bars.push({ ch: [{ at: 0, c: 'C' }], ev: [{ at: 0, d: 8, k: 'n', p: ['C4'] }], text: (rnd() * 1e15).toString(36) + (rnd() * 1e15).toString(36) });
    const p2 = await C.packSheet('s2', big, 'x');
    eq(p2.rows.length > 1, true, 'parts ' + p2.rows.length);
    eq(p2.rows.every(r => r.data.length <= C.SHEET_PART), true);
    eq(await C.unpackSheet(p2.rows.slice().reverse()), big);
  });
  await t('sheet storage: too big gives a plain message', async () => {
    const big = C.emptySheet('C');
    let seed = 3; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 20000; i++) big.bars.push({ text: (rnd() * 1e15).toString(36) + (rnd() * 1e15).toString(36), ch: [], ev: [] });
    let msg = ''; try { await C.packSheet('x', big, 'u'); } catch (e) { msg = e.message; }
    eq(/too big/.test(msg), true, msg);
  });
  await t('sheet rows merge as whole versions', () => {
    const L = [{ id: 'a', part: '0', data: 'new0', updated: '2026-11-02', deleted: '' }, { id: 'a', part: '1', data: 'new1', updated: '2026-11-02', deleted: '' }];
    const R = [{ id: 'a', part: '0', data: 'old0', updated: '2026-11-01', deleted: '' }, { id: 'a', part: '1', data: 'old1', updated: '2026-11-01', deleted: '' }, { id: 'a', part: '2', data: 'old2', updated: '2026-11-01', deleted: '' }, { id: 'b', part: '0', data: 'b0', updated: '2026-11-01', deleted: '' }];
    const m = C.mergeSheetRows(L, R);
    eq(m.map(r => r.data), ['new0', 'new1', 'b0']);
    const m2 = C.mergeSheetRows(R, L); eq(m2.map(r => r.data), ['new0', 'new1', 'b0']);
    const tomb = C.mergeSheetRows([{ id: 'b', part: '0', data: '', updated: '2026-11-03', deleted: '1' }], R);
    eq(tomb.filter(r => r.id === 'b')[0].deleted, '1');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('Failed: ' + failures.join('; ')); process.exit(1); }
})();
