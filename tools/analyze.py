#!/usr/bin/env python
"""Worship song analyser: audio -> draft lead sheet (app JSON) + report.

Usage: python analyze.py song.mp3 --key-hint E --out out_dir
Needs: madmom 0.16.1 (Python 3.11 env), numpy, ffmpeg.
"""
import argparse, json, os, subprocess, sys, warnings
import numpy as np
warnings.filterwarnings('ignore')

from madmom.features.downbeats import RNNDownBeatProcessor, DBNDownBeatTrackingProcessor
from madmom.features.key import CNNKeyRecognitionProcessor, key_prediction_to_label
from madmom.audio.chroma import DeepChromaProcessor
from madmom.audio.signal import Signal
from madmom.audio.spectrogram import Spectrogram

NOTES_S = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
NOTES_F = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
FLAT_KEYS = {'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'}
QUAL = {  # name: (intervals, prior penalty)
    '': ([0, 4, 7], 0.0), 'm': ([0, 3, 7], 0.0),
    '7': ([0, 4, 7, 10], 0.06), 'maj7': ([0, 4, 7, 11], 0.07), 'm7': ([0, 3, 7, 10], 0.05),
    'sus4': ([0, 5, 7], 0.06), 'sus2': ([0, 2, 7], 0.08), 'add9': ([0, 2, 4, 7], 0.07),
    'dim': ([0, 3, 6], 0.12), 'm7b5': ([0, 3, 6, 10], 0.12),
}
MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]


def spell(pc, key_root_name):
    return (NOTES_F if key_root_name in FLAT_KEYS else NOTES_S)[pc % 12]


def build_templates(key_pc):
    labels, mats, pri = [], [], []
    diat = {(key_pc + s) % 12 for s in MAJOR_STEPS}
    for r in range(12):
        for q, (iv, p) in QUAL.items():
            v = np.zeros(12)
            for k, i in enumerate(iv):
                v[(r + i) % 12] = 1.0 if k < 3 else 0.8
            v /= np.linalg.norm(v)
            tones = {(r + i) % 12 for i in iv}
            out_of_key = len(tones - diat)
            labels.append((r, q)); mats.append(v); pri.append(p + 0.05 * out_of_key)
    return labels, np.array(mats), np.array(pri)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('audio'); ap.add_argument('--out', default='out'); ap.add_argument('--key-hint', default='')
    ap.add_argument('--title', default='')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    wav = os.path.join(a.out, 'mono.wav')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', a.audio, '-ac', '1', '-ar', '44100', wav], check=True)

    # 1. beats + downbeats (neural)
    act = RNNDownBeatProcessor()(wav)
    db = DBNDownBeatTrackingProcessor(beats_per_bar=[3, 4], fps=100)(act)
    bt, bp = db[:, 0], db[:, 1].astype(int)
    bpb = int(np.bincount(bp).argmax() if False else bp.max())
    tempo = 60.0 / np.median(np.diff(bt))
    # 2. key
    key_label = key_prediction_to_label(CNNKeyRecognitionProcessor()(wav))  # e.g. 'E major'
    kroot, kmode = key_label.split()
    kpc = NOTES_S.index(kroot) if kroot in NOTES_S else NOTES_F.index(kroot)
    if a.key_hint:
        kroot = a.key_hint; kpc = NOTES_S.index(kroot) if kroot in NOTES_S else NOTES_F.index(kroot)
    keyname = spell(kpc, kroot if kroot in FLAT_KEYS else '')

    # 3. features: deep chroma (10 fps), bass chroma + onset + energy (100 fps)
    dch = DeepChromaProcessor()(wav)  # frames x 12, 10 fps
    sig = Signal(wav, sample_rate=44100, num_channels=1)
    spec = Spectrogram(sig, frame_size=4096, hop_size=441)
    fr = spec.bin_frequencies
    bass_mask = (fr >= 38) & (fr <= 200)
    bf = fr[bass_mask]; bpc = (np.round(12 * np.log2(bf / 440.0)) + 9) % 12
    bmag = np.asarray(spec[:, bass_mask])
    bass = np.zeros((len(spec), 12))
    for pc in range(12):
        bass[:, pc] = bmag[:, bpc == pc].sum(1)
    logm = np.log1p(np.asarray(spec) * 10)
    onset = np.concatenate([[0], np.maximum(0, np.diff(logm, axis=0)).sum(1)])
    energy = np.log10(np.asarray(spec).sum(1) + 1e-9) * 10  # dB-ish

    # 4. eighth-note units from the beat grid
    units = []  # (start, end, bar_index, unit_in_bar)
    bar_starts = []
    bar = -1
    for i in range(len(bt)):
        if bp[i] == 1:
            bar += 1; bar_starts.append(bt[i])
        if bar < 0:
            continue
        nxt = bt[i + 1] if i + 1 < len(bt) else bt[i] + (bt[i] - bt[i - 1])
        mid = (bt[i] + nxt) / 2
        u0 = (bp[i] - 1) * 2
        units.append((bt[i], mid, bar, u0)); units.append((mid, nxt, bar, u0 + 1))
    nbars = bar + 1
    end_time = units[-1][1]

    def avg(arr, fps, s, e):
        a0, a1 = int(s * fps), max(int(s * fps) + 1, int(e * fps))
        return arr[a0:a1].mean(0) if a1 <= len(arr) else arr[-1]

    KP = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
    nb0 = bar + 1
    barc = np.zeros((nb0, 12))
    for (s0, e0, b0, u0) in units: barc[b0] += avg(dch, 10, s0, e0)
    local = []
    W = 8
    for b0 in range(nb0):
        v = barc[max(0, b0 - W):b0 + W].sum(0)
        sc = [np.corrcoef(np.roll(KP, r), v)[0, 1] for r in range(12)]
        local.append(int(np.argmax(sc)))
    # smooth: keep runs of >= 12 bars, else fall back to global key
    lk = np.array(local)
    runs = []
    i = 0
    while i < nb0:
        j = i
        while j < nb0 and lk[j] == lk[i]: j += 1
        runs.append([i, j, lk[i]]); i = j
    for r in runs:
        if r[1] - r[0] < 12: r[2] = None
    cur = kpc
    for r in runs:
        if r[2] is None: r[2] = cur
        cur = r[2]
    bar_key = np.zeros(nb0, dtype=int)
    for r in runs: bar_key[r[0]:r[1]] = r[2]
    tmpl = {}
    for kk in set(bar_key.tolist()): tmpl[kk] = build_templates(kk)
    labels = tmpl[kpc][0]
    U = len(units)
    feat = np.array([avg(dch, 10, s, e) for s, e, _, _ in units])
    featn = feat / (np.linalg.norm(feat, axis=1, keepdims=True) + 1e-9)
    emis = np.zeros((U, len(labels)))
    for t in range(U):
        _, T, pri = tmpl[bar_key[units[t][2]]]
        emis[t] = featn[t] @ T.T - pri
    # 5. Viterbi: change cost by metrical position (units per bar = bpb*2)
    upb = bpb * 2

    def change_cost(u):
        if u == 0: return 0.14
        if bpb == 4 and u == 4: return 0.24
        if u == upb - 1: return 0.30  # push into the next bar
        if u % 2 == 0: return 0.42
        return 0.70
    S = len(labels)
    score = emis[0].copy(); back = np.zeros((U, S), dtype=np.int32)
    for t in range(1, U):
        cc = change_cost(units[t][3])
        best = score.argmax()
        stay = score
        jump = score[best] - cc
        take_jump = jump > stay
        back[t] = np.where(take_jump, best, np.arange(S))
        score = np.where(take_jump, jump, stay) + emis[t]
    path = np.zeros(U, dtype=int); path[-1] = score.argmax()
    for t in range(U - 1, 0, -1):
        path[t - 1] = back[t, path[t]]

    # 6. chord segments, bass for slash chords
    segs = []
    for t in range(U):
        if t == 0 or path[t] != path[t - 1]:
            segs.append([t, t, path[t]])
        else:
            segs[-1][1] = t

    def kname(pc):
        return NOTES_F[pc] if NOTES_F[pc] in FLAT_KEYS else NOTES_S[pc]
    def chord_name(r, q, bass_pc, kpc_local=None):
        kn = kname(kpc_local if kpc_local is not None else kpc)
        name = spell(r, kn) + q
        iv = QUAL[q][0]
        tones = {(r + i) % 12 for i in iv}
        if bass_pc is not None and bass_pc != r and (bass_pc in tones or (bass_pc - r) % 12 in (2, 9)):
            name += '/' + spell(bass_pc, kn)
        return name
    chords_by_bar = [[] for _ in range(nbars)]
    conf_by_bar = [[] for _ in range(nbars)]
    for s, e, st in segs:
        r, q = labels[st]
        t0, t1 = units[s][0], units[e][1]
        bvec = avg(bass, 100, t0, t1)
        bass_pc = int(bvec.argmax()) if bvec.max() > 0 else None
        if bass_pc is not None and bvec[bass_pc] < 1.3 * np.median(bvec):
            bass_pc = None
        c = chord_name(r, q, bass_pc, int(bar_key[units[s][2]]))
        conf = float(np.clip((emis[s:e + 1, st].mean() - 0.55) / 0.4, 0, 1))
        b, u = units[s][2], units[s][3]
        if u == upb - 1 and b + 1 < nbars and e > s:   # push: write it on the "and of 4"
            pass
        chords_by_bar[b].append({'at': u, 'c': c}); conf_by_bar[b].append(round(conf, 2))
    # carry chord into bars that have none at unit 0 (for readability)
    last = None
    for b in range(nbars):
        if not chords_by_bar[b] or chords_by_bar[b][0]['at'] != 0:
            if last and not (chords_by_bar[b] and chords_by_bar[b][0]['at'] == 0):
                pass
        if chords_by_bar[b]:
            last = chords_by_bar[b][-1]['c']

    # 7. per-bar energy + sections (self-similarity of bar chroma, novelty)
    bar_ch = np.zeros((nbars, 12)); bar_en = np.zeros(nbars)
    for (s, e, b, u) in units:
        bar_ch[b] += avg(dch, 10, s, e); bar_en[b] += avg(energy[:, None], 100, s, e)[0] / upb
    bcn = bar_ch / (np.linalg.norm(bar_ch, axis=1, keepdims=True) + 1e-9)
    ssm = bcn @ bcn.T
    K = 4
    nov = np.zeros(nbars)
    ker = np.kron(np.array([[1, -1], [-1, 1]]), np.ones((K, K)))
    for i in range(K, nbars - K):
        nov[i] = (ssm[i - K:i + K, i - K:i + K] * ker).sum()
    en_s = np.convolve(bar_en, np.ones(2) / 2, mode='same')
    jump = np.abs(np.diff(en_s, prepend=en_s[0]))
    score_b = nov / (nov.max() + 1e-9) + 0.6 * jump / (jump.max() + 1e-9)
    bounds = [0]
    keychg = [b0 for b0 in range(1, nbars) if bar_key[b0] != bar_key[b0 - 1]]
    for i in range(2, nbars - 2):
        if i in keychg and i - bounds[-1] >= 2:
            bounds.append(i); continue
        if i - bounds[-1] >= 4 and score_b[i] >= max(score_b[i - 2:i + 3]) and score_b[i] > 0.22:
            # snap to multiples of 4 bars from the previous boundary when close
            off = (i - bounds[-1]) % 4
            j = i - off if off <= 1 else i + (4 - off)
            if j - bounds[-1] >= 4 and j < nbars:
                bounds.append(j)
    secs = [(bounds[k], (bounds[k + 1] if k + 1 < len(bounds) else nbars)) for k in range(len(bounds))]
    # cluster sections by bar-chroma sequence similarity
    def sec_sig(s, e):
        L = min(8, e - s); return bcn[s:s + L]
    letters, sig_list = [], []
    for s, e in secs:
        sg = sec_sig(s, e); found = None
        for li, (L, ref) in enumerate(sig_list):
            n = min(len(sg), len(ref))
            if n and float((sg[:n] * ref[:n]).sum(1).mean()) > 0.9:
                found = L; break
        if not found:
            found = chr(ord('A') + len(sig_list)); sig_list.append((found, sg))
        letters.append(found)
    # name guesses: most frequent loud letter = Chorus, first = Intro if short and quiet
    from collections import Counter
    cnt = Counter(letters)
    loud = {L: np.mean([bar_en[s:e].mean() for (s, e), l in zip(secs, letters) if l == L]) for L in cnt}
    chorus = max(cnt, key=lambda L: (cnt[L] >= 2, loud[L]))
    names = {}
    for L in cnt:
        names[L] = 'Chorus' if L == chorus else ('Verse' if cnt[L] >= 2 else 'Section')
    if secs and secs[0][1] - secs[0][0] <= 8 and letters[0] != chorus and cnt[letters[0]] == 1:
        names[letters[0]] = 'Intro'
    if len(secs) > 1 and cnt[letters[-1]] == 1 and letters[-1] != chorus:
        names[letters[-1]] = 'Outro'

    # 8. tutti: stops (energy drop after a strong onset) and syncopated accents
    bars_out = []
    q = np.percentile(bar_en, [25, 50, 75])
    def dyn(e):
        return 'mp' if e < q[0] else ('mf' if e < q[1] else ('f' if e < q[2] else 'ff'))
    prev_dyn = None
    sec_start = {s: (letters[k], names[letters[k]]) for k, (s, e) in enumerate(secs)}
    for b in range(nbars):
        ub = [u for u in units if u[2] == b]
        on = np.array([onset[int(s * 100):int(s * 100) + 6].max() if int(s * 100) + 6 <= len(onset) else 0 for s, _, _, _ in ub])
        en = np.array([avg(energy[:, None], 100, s, e)[0] for s, e, _, _ in ub])
        bar = {'ch': chords_by_bar[b]}
        if b > 0 and bar_key[b] != bar_key[b - 1]:
            bar['key'] = kname(int(bar_key[b]))
        if b in sec_start:
            L, nm = sec_start[b]; bar['mark'] = L; bar['label'] = nm
            d = dyn(bar_en[b])
            if d != prev_dyn: bar['dyn'] = d; prev_dyn = d
        ev = []
        med_on = np.median(on) if len(on) else 0
        loud_bar = np.median(en) if len(en) else 0
        # stop: from some unit on, energy falls >9 dB below the bar's start for >= 2 units
        stop_at = None
        for k in range(1, len(en) - 1):
            if en[k] < en[0] - 9 and en[k + 1] < en[0] - 9:
                stop_at = k; break
        accents = [k for k in range(len(on)) if k % 2 == 1 and on[k] > 2.2 * max(med_on, 1e-6) and on[k] > np.percentile(onset, 90)]
        if stop_at is not None or accents:
            k = 0
            while k < upb:
                if stop_at is not None and k >= stop_at:
                    ev.append({'at': k, 'd': upb - k, 'k': 'r'}); break
                if k in accents:
                    ev.append({'at': k, 'd': 1, 'k': 'h', 'a': '>'}); k += 1; continue
                if stop_at is not None and k == stop_at - 1:
                    ev.append({'at': k, 'd': 1, 'k': 'h', 'a': '^'}); k += 1; continue
                step = 2 if k % 2 == 0 else 1
                if stop_at is not None: step = min(step, stop_at - 1 - k) or 1
                ev.append({'at': k, 'd': step, 'k': 's'}); k += step
            bar['ev'] = ev
            if stop_at is not None: bar['text'] = 'Stop?'
        bars_out.append(bar)

    sheet = {'v': 1, 'key': keyname, 'mode': 'major' if kmode == 'major' else 'minor',
             'time': f'{bpb}/4', 'tempo': int(round(tempo)), 'sub': 8, 'bars': bars_out,
             'src': 'analysis'}
    grid = {'b': [round(float(x), 3) for x in bar_starts], 'end': round(float(end_time), 3)}
    json.dump(sheet, open(os.path.join(a.out, 'sheet.json'), 'w'), default=lambda o: o.item() if hasattr(o, 'item') else str(o))
    json.dump(grid, open(os.path.join(a.out, 'grid.json'), 'w'))
    # report
    lines = [f"Key {key_label}  ·  {tempo:.1f} BPM  ·  {bpb}/4  ·  {nbars} bars  ·  {end_time:.0f} s"]
    for k, (s, e) in enumerate(secs):
        lines.append(f"\n[{letters[k]} {names[letters[k]]}] bars {s+1}-{e} ({bar_starts[s]:.1f}s)")
        row = []
        for b in range(s, e):
            cs = ' '.join((('&' if c['at'] % 2 else '') + c['c'] + ('@' + str(c['at'] // 2 + 1) if c['at'] not in (0,) else '')) for c in chords_by_bar[b]) or '%'
            tag = ' (' + bars_out[b]['text'] + ')' if 'text' in bars_out[b] else ''
            if any(x.get('a') == '>' for x in bars_out[b].get('ev', [])): tag += ' >'
            row.append(f"| {cs}{tag} ")
        for i in range(0, len(row), 4): lines.append(''.join(row[i:i + 4]) + '|')
    open(os.path.join(a.out, 'report.txt'), 'w').write('\n'.join(lines))
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
