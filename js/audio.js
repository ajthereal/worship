/* Worship audio: Drive file list and download into IndexedDB, blob URLs, peaks, analysis, pitch-shifted copies. */
(function () {
'use strict';
var WS = window.WS, W = window.WCore;
var DBN = 'worship-audio', dbp = null;

function db() {
  if (dbp) return dbp;
  dbp = new Promise(function (res, rej) {
    if (!window.indexedDB) { rej(new Error('This browser cannot keep audio on the device (no IndexedDB).')); return; }
    var rq = indexedDB.open(DBN, 1);
    rq.onupgradeneeded = function () {
      var d = rq.result;
      ['parts', 'files', 'shift', 'peaks'].forEach(function (n) { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); });
    };
    rq.onsuccess = function () { res(rq.result); };
    rq.onerror = function () { dbp = null; rej(new Error('The audio store on this device could not be opened.')); };
  });
  return dbp;
}
function tx(store, mode, fn) {
  return db().then(function (d) {
    return new Promise(function (res, rej) {
      var t = d.transaction(store, mode), s = t.objectStore(store), out;
      try { out = fn(s); } catch (e) { rej(e); return; }
      t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
      t.onerror = function () { rej(t.error || new Error('Storage error')); };
      t.onabort = function () { rej(t.error || new Error('The device ran out of space for audio.')); };
    });
  });
}
function get(store, key) { return tx(store, 'readonly', function (s) { return s.get(key); }); }
function put(store, key, val) { return tx(store, 'readwrite', function (s) { return s.put(val, key); }); }
function del(store, key) { return tx(store, 'readwrite', function (s) { return s.delete(key); }); }
function allKeys(store) { return tx(store, 'readonly', function (s) { return s.getAllKeys(); }); }

var A = { meta: {}, urls: {}, loaded: false };

// load the list of what is stored, so screens can show "On this device"
A.init = function () {
  if (A.initP) return A.initP;
  A.initP = db().then(function (d) {
    return new Promise(function (res) {
      var out = {}, t = d.transaction('files', 'readonly'), s = t.objectStore('files'), rq = s.openCursor();
      rq.onsuccess = function () { var c = rq.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
      rq.onerror = function () { res({}); };
    });
  }).then(function (m) { A.meta = m; A.loaded = true; WS.emit('audio'); return m; }).catch(function () { A.loaded = true; return {}; });
  return A.initP;
};
A.state = function (id) {
  var m = A.meta[id];
  if (!id) return 'none';
  if (m && m.done) return 'device';
  if (m && m.got > 0) return 'partial';
  return 'drive';
};
A.has = function (id) { return !!(A.meta[id] && A.meta[id].done); };

/* Drive list */
A.list = function () {
  var conn = WS.S.conn;
  if (!conn) return Promise.reject({ message: 'Connect to your Sheet first, then the audio list can load.' });
  return WS.apiGet(conn, '_waudio').then(function (j) {
    if (j.error) {
      if (j.error === 'token') throw j;
      throw { message: 'Audio list not available. Update the Apps Script (see README).' };
    }
    if (!Array.isArray(j.rows)) throw { message: 'Audio list not available. Update the Apps Script (see README).' };
    A.driveList = j.rows; A.folder = j.folder;
    return j.rows;
  }).catch(function (e) {
    if (e && e.message && !e.kind && !e.error) throw e;
    throw { message: WS.plainError(e) };
  });
};
A.suggest = function (title, files) {
  var best = null, bs = 0;
  (files || []).forEach(function (f) {
    var nm = String(f.name || '').replace(/\.[a-z0-9]+$/i, '');
    var s = W.titleScore(title, nm);
    if (s > bs) { bs = s; best = f; }
  });
  return bs >= 0.6 ? best : null;
};

/* download: one 3 MB part at a time, each part stored when it arrives, resumable */
function b64bytes(s) { var a = atob(s), u = new Uint8Array(a.length); for (var i = 0; i < a.length; i++) u[i] = a.charCodeAt(i); return u; }
function fetchPart(conn, id, i, tries) {
  return WS.apiGet(conn, '_file', '&id=' + encodeURIComponent(id) + '&part=' + i, 60000).then(function (j) {
    if (j.error) throw { message: j.error === 'token' ? 'The code does not match your Sheet.' : 'The Sheet script could not read this file (' + j.error + (j.message ? ': ' + String(j.message).slice(0, 80) : '') + ').' };
    if (typeof j.data !== 'string' || !j.n) throw { message: 'The Apps Script is too old for audio downloads. Update it (see README).' };
    return j;
  }).catch(function (e) {
    var t = tries || 0;
    if (t < 2 && !(e && e.message && !e.kind)) return new Promise(function (ok) { setTimeout(ok, 1200 * (t + 1)); }).then(function () { return fetchPart(conn, id, i, t + 1); });
    if (e && e.message && !e.kind) throw e;
    throw { message: 'Part ' + (i + 1) + ' failed after 3 tries: ' + WS.plainError(e) };
  });
}
A.running = {};
A.download = function (id, o) {
  o = o || {};
  var conn = WS.S.conn;
  if (!conn) return Promise.reject({ message: 'Connect to your Sheet first, then audio can download.' });
  if (A.running[id]) return A.running[id].promise;
  var run = { cancel: false };
  var p = A.init().then(function () {
    var m = A.meta[id] || { id: id, name: o.name || '', got: 0, n: 0, size: 0, mime: '', done: false };
    if (m.done) return m;
    function step(i) {
      if (run.cancel) { var ce = { message: 'Download cancelled. What arrived is kept, so it can continue.', cancelled: true }; throw ce; }
      return fetchPart(conn, id, i, 0).then(function (j) {
        var bytes = b64bytes(j.data);
        m.n = j.n; m.size = j.size; m.mime = j.mime || m.mime || 'audio/mpeg';
        return put('parts', id + ':' + i, bytes.buffer).then(function () {
          m.got = i + 1; m.part = (m.part || 0) + bytes.length;
          A.meta[id] = m;
          return put('files', id, m);
        }).then(function () {
          if (o.onProgress) o.onProgress(i + 1, m.n);
          if (i + 1 < m.n) return step(i + 1);
        });
      });
    }
    return step(m.got || 0).then(function () {
      // verify the total size
      var total = 0, tasks = [];
      for (var i = 0; i < m.n; i++) tasks.push(get('parts', id + ':' + i));
      return Promise.all(tasks).then(function (bufs) {
        bufs.forEach(function (b) { total += b ? b.byteLength : 0; });
        if (total !== m.size) {
          m.got = 0; m.part = 0; return put('files', id, m).then(function () { throw { message: 'The download came out the wrong size (' + total + ' of ' + m.size + ' bytes). Try again.' }; });
        }
        m.done = true; m.ts = Date.now(); m.name = m.name || o.name || '';
        A.meta[id] = m;
        return put('files', id, m).then(function () { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ } WS.emit('audio'); return m; });
      });
    });
  }).catch(function (e) {
    if (e && e.name === 'QuotaExceededError') e = { message: 'This device is out of space for audio. Free some in Settings, Storage.' };
    throw e;
  });
  run.promise = p.then(function (m) { delete A.running[id]; return m; }, function (e) { delete A.running[id]; throw e; });
  A.running[id] = run;
  return run.promise;
};
A.cancel = function (id) { if (A.running[id]) A.running[id].cancel = true; };

A.blob = function (id) {
  var m = A.meta[id];
  if (!m || !m.done) return Promise.reject({ message: 'This audio is not on this device yet.' });
  var tasks = [];
  for (var i = 0; i < m.n; i++) tasks.push(get('parts', id + ':' + i));
  return Promise.all(tasks).then(function (bufs) {
    if (bufs.some(function (b) { return !b; })) throw { message: 'Part of the saved audio is missing. Download it again.' };
    return new Blob(bufs, { type: m.mime || 'audio/mpeg' });
  });
};
A.url = function (id) {
  if (A.urls[id]) return Promise.resolve(A.urls[id]);
  return A.blob(id).then(function (b) { A.urls[id] = URL.createObjectURL(b); return A.urls[id]; });
};
A.remove = function (id) {
  var m = A.meta[id], tasks = [];
  if (m) for (var i = 0; i < Math.max(m.n, m.got || 0); i++) tasks.push(del('parts', id + ':' + i));
  tasks.push(del('files', id)); tasks.push(del('peaks', id));
  if (A.urls[id]) { URL.revokeObjectURL(A.urls[id]); delete A.urls[id]; }
  delete A.meta[id];
  return Promise.all(tasks).then(function () { WS.emit('audio'); });
};

/* storage use */
A.usage = function () {
  var used = 0;
  Object.keys(A.meta).forEach(function (k) { used += A.meta[k].part || 0; });
  return allKeys('shift').catch(function () { return []; }).then(function (keys) {
    return Promise.all(keys.map(function (k) { return get('shift', k).then(function (v) { return v && v.size || 0; }); })).then(function (sizes) {
      sizes.forEach(function (s) { used += s; });
      var est = navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve({});
      return est.then(function (e) { return { used: used, quota: e.quota || 0, usage: e.usage || 0, shifted: keys.length }; }).catch(function () { return { used: used, quota: 0, usage: 0, shifted: keys.length }; });
    });
  });
};

/* decoding, peaks, analysis input */
function decodeBuf(blob) {
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return Promise.reject({ message: 'This browser cannot decode audio.' });
  return blob.arrayBuffer().then(function (ab) {
    var c = new AC();
    return new Promise(function (res, rej) {
      var p = c.decodeAudioData(ab, res, rej);
      if (p && p.then) p.then(res, rej);
    }).then(function (b) { try { c.close(); } catch (e) { /* ignore */ } return b; }, function () { try { c.close(); } catch (e) { /* ignore */ } throw { message: 'This audio file could not be read. Try an mp3 or m4a.' }; });
  });
}
A.decode = function (id) { return A.blob(id).then(decodeBuf); };
A.peaks = function (id, n) {
  n = n || 1200;
  return get('peaks', id).then(function (c) {
    if (c && c.p && c.p.length === n) return c;
    return A.decode(id).then(function (buf) {
      var ch = buf.numberOfChannels, len = buf.length, p = new Array(n), per = len / n, data = [];
      for (var k = 0; k < ch; k++) data.push(buf.getChannelData(k));
      for (var i = 0; i < n; i++) {
        var s = Math.floor(i * per), e = Math.min(len, Math.floor((i + 1) * per)), mx = 0, step = Math.max(1, Math.floor((e - s) / 64));
        for (var j = s; j < e; j += step) for (var q = 0; q < ch; q++) { var v = Math.abs(data[q][j]); if (v > mx) mx = v; }
        p[i] = Math.round(mx * 1000) / 1000;
      }
      var rec = { p: p, dur: buf.duration };
      put('peaks', id, rec);
      return rec;
    });
  });
};
// mono 11025 Hz samples for the analysis
A.mono = function (id) {
  return A.blob(id).then(decodeBuf).then(function (buf) {
    var sr = 11025, len = Math.ceil(buf.duration * sr);
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var oc = new OAC(1, len, sr), src = oc.createBufferSource();
    src.buffer = buf; src.connect(oc.destination); src.start();
    return new Promise(function (res, rej) {
      var p = oc.startRendering();
      if (p && p.then) p.then(res, rej); else oc.oncomplete = function (e) { res(e.renderedBuffer); };
    }).then(function (rb) { return { samples: rb.getChannelData(0), sr: sr, duration: buf.duration }; });
  });
};
A.analyze = function (id, o) {
  o = o || {};
  return A.mono(id).then(function (m) {
    return W.analyzeAudio(m.samples, m.sr, { beatsPerBar: o.beatsPerBar || 4, maxSeconds: 600, onProgress: o.onProgress });
  });
};

/* pitch-shifted copies */
function wavHeader(dataBytes, sr, ch) {
  var b = new ArrayBuffer(44), v = new DataView(b);
  function s(o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); }
  s(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, dataBytes, true);
  return b;
}
A.shiftKey = function (id, semis) { return id + ':' + semis; };
A.shiftedUrl = function (id, semis) {
  var key = A.shiftKey(id, semis);
  if (A.urls[key]) return Promise.resolve(A.urls[key]);
  return get('shift', key).then(function (r) {
    if (!r || !r.blob) return null;
    A.urls[key] = URL.createObjectURL(r.blob);
    return A.urls[key];
  });
};
A.shiftedList = function () {
  return allKeys('shift').then(function (keys) { return Promise.all(keys.map(function (k) { return get('shift', k).then(function (v) { return { key: k, size: v ? v.size : 0, ts: v ? v.ts : 0 }; }); })); });
};
A.removeShifted = function (key) { if (A.urls[key]) { URL.revokeObjectURL(A.urls[key]); delete A.urls[key]; } return del('shift', key); };
// Prepare a copy shifted by `semis` semitones. Keeps one copy per song: older ones for the same song are removed.
A.prepareShift = function (id, semis, o) {
  o = o || {};
  var state = { cancel: false, worker: null };
  var promise = A.blob(id).then(decodeBuf).then(function (buf) {
    var sr = buf.sampleRate, nch = Math.min(2, buf.numberOfChannels), len = buf.length;
    var worker;
    try { worker = new Worker('js/pitch-worker.js'); } catch (e) { throw { message: 'This browser cannot run the pitch shifter in the background.' }; }
    state.worker = worker;
    var CH = sr * 10, pieces = [[], []];
    return new Promise(function (res, rej) {
      var ci = 0, pos = 0, total = nch * len;
      function fail(m) { try { worker.terminate(); } catch (e) { /* ignore */ } rej({ message: m }); }
      worker.onerror = function (e) { fail('The pitch shifter stopped: ' + (e && e.message || 'unknown error')); };
      worker.onmessageerror = function () { fail('The pitch shifter sent back something unreadable.'); };
      function send() {
        if (state.cancel) { try { worker.terminate(); } catch (e) { /* ignore */ } rej({ message: 'Cancelled.', cancelled: true }); return; }
        var end = Math.min(len, pos + CH), last = end >= len;
        var data = buf.getChannelData(ci).slice(pos, end);
        worker.postMessage({ cmd: 'chunk', data: data, last: last }, [data.buffer]);
        pos = end;
      }
      worker.onmessage = function (e) {
        var m = e.data;
        if (m.cmd === 'error') { fail('The pitch shifter had a problem: ' + m.message); return; }
        if (m.cmd !== 'out') return;
        pieces[ci].push(m.data);
        if (o.onProgress) o.onProgress((ci * len + pos) / total);
        if (m.last) {
          ci++; pos = 0;
          if (ci >= nch) { try { worker.terminate(); } catch (er) { /* ignore */ } res(); return; }
          worker.postMessage({ cmd: 'channel' });
        }
        send();
      };
      worker.postMessage({ cmd: 'start', semis: semis, sr: sr });
      worker.postMessage({ cmd: 'channel' });
      send();
    }).then(function () {
      // interleave to 16-bit WAV pieces
      var flat = [0, 1].map(function (c) {
        if (!pieces[c].length) return null;
        var n = pieces[c].reduce(function (a, b) { return a + b.length; }, 0), out = new Int16Array(n), p = 0;
        pieces[c].forEach(function (x) { out.set(x, p); p += x.length; });
        return out;
      });
      pieces = null;
      var n = Math.min(len, flat[0].length), outCh = nch, blobs = [];
      var BL = 1 << 18;
      for (var s = 0; s < n; s += BL) {
        var e2 = Math.min(n, s + BL), seg = new Int16Array((e2 - s) * outCh);
        for (var i = s; i < e2; i++) { for (var c = 0; c < outCh; c++) seg[(i - s) * outCh + c] = flat[c][i]; }
        blobs.push(seg);
      }
      var blob = new Blob([wavHeader(n * outCh * 2, sr, outCh)].concat(blobs), { type: 'audio/wav' });
      return A.shiftedList().then(function (list) {
        var old = list.filter(function (x) { return x.key.indexOf(id + ':') === 0 && x.key !== A.shiftKey(id, semis); });
        return Promise.all(old.map(function (x) { return A.removeShifted(x.key); }));
      }).then(function () { return put('shift', A.shiftKey(id, semis), { blob: blob, size: blob.size, ts: Date.now() }); })
        .then(function () { WS.emit('audio'); return blob.size; });
    });
  }).catch(function (e) {
    if (e && e.name === 'QuotaExceededError') throw { message: 'This device is out of space for the shifted copy. Free some in Settings, Storage.' };
    if (e instanceof RangeError || (e && /memory|allocation/i.test(String(e.message || e)))) throw { message: 'This device ran out of memory while shifting the pitch. Close other apps and try again.' };
    throw e;
  });
  return { promise: promise, cancel: function () { state.cancel = true; try { state.worker && state.worker.postMessage({ cmd: 'cancel' }); } catch (e) { /* ignore */ } } };
};

WS.Audio = A;
A.init();
})();
