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

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('Failed: ' + failures.join('; ')); process.exit(1); }
})();
