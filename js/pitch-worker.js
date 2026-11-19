/* Worship pitch shifter: a streaming phase vocoder (time-stretch) followed by resampling. One channel at a time.
   Messages in: {cmd:'start', semis, sr} then per channel {cmd:'channel'} and {cmd:'chunk', data:Float32Array, last:bool}.
   Messages out: {cmd:'out', data:Int16Array, last:bool} */
importScripts('../core.js');
var N = 2048, HS = 512, fft = self.WCore.makeFFT(N);
var win = (function () { var w = new Float64Array(N); for (var i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); return w; })();
var OLA_NORM = 1 / (N / HS * 0.375);
var ratio = 1, st = null, cancelled = false;

function fresh() {
  return {
    inBuf: new Float32Array(0), inStart: 0,   // absolute index of inBuf[0]
    nextIn: 0,                                  // absolute (float) analysis position
    prevStart: null, prevPhase: new Float64Array(N / 2 + 1), synPhase: new Float64Array(N / 2 + 1), first: true,
    outBuf: new Float32Array(N * 2), outBase: 0, // stretched stream: absolute index of outBuf[0]
    outPos: 0, emitted: 0,                      // frames written / stretched samples finalised
    rpos: 0,                                     // resample read position (absolute stretched coords)
    pend: new Float32Array(0), pendBase: 0
  };
}

function appendIn(s, data) {
  var nb = new Float32Array(s.inBuf.length + data.length);
  nb.set(s.inBuf); nb.set(data, s.inBuf.length); s.inBuf = nb;
}

function processFrames(s, flush) {
  var re = new Float64Array(N), im = new Float64Array(N), Ha = HS / ratio, k;
  var haveEnd = s.inStart + s.inBuf.length;
  while (true) {
    var start = Math.round(s.nextIn);
    if (start + N > haveEnd) { if (!flush) break; if (start >= haveEnd + N) break; }
    var off = start - s.inStart;
    for (k = 0; k < N; k++) { var ix = off + k; re[k] = (ix >= 0 && ix < s.inBuf.length ? s.inBuf[ix] : 0) * win[k]; im[k] = 0; }
    fft(re, im);
    var ph = new Float64Array(N / 2 + 1), mag = new Float64Array(N / 2 + 1);
    for (k = 0; k <= N / 2; k++) { mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]); ph[k] = Math.atan2(im[k], re[k]); }
    if (s.first) { for (k = 0; k <= N / 2; k++) s.synPhase[k] = ph[k]; s.first = false; }
    else {
      var ha = start - s.prevStart;
      for (k = 0; k <= N / 2; k++) {
        var omega = 2 * Math.PI * k / N, d = ph[k] - s.prevPhase[k] - omega * ha;
        d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
        s.synPhase[k] += (omega + d / ha) * HS;
      }
    }
    for (k = 0; k <= N / 2; k++) s.prevPhase[k] = ph[k];
    s.prevStart = start;
    // inverse FFT of mag*e^{i synPhase} via the conjugate trick
    for (k = 0; k <= N / 2; k++) { re[k] = mag[k] * Math.cos(s.synPhase[k]); im[k] = -mag[k] * Math.sin(s.synPhase[k]); }
    for (k = 1; k < N / 2; k++) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    fft(re, im);
    var at = s.outPos - s.outBase;
    if (at + N > s.outBuf.length) { var nb = new Float32Array(Math.max(s.outBuf.length * 2, at + N + HS)); nb.set(s.outBuf); s.outBuf = nb; }
    for (k = 0; k < N; k++) s.outBuf[at + k] += (re[k] / N) * win[k] * OLA_NORM;
    s.outPos += HS; s.nextIn += Ha;
    // everything before outPos is final now
    s.emitted = s.outPos;
    if (flush && start >= haveEnd) break;
  }
  // drop input we no longer need
  var keepFrom = Math.round(s.nextIn) - 2;
  var drop = Math.min(s.inBuf.length, Math.max(0, keepFrom - s.inStart));
  if (drop > 0) { s.inBuf = s.inBuf.slice(drop); s.inStart += drop; }
}

// resample the finalised stretched signal by `ratio` (read faster = higher pitch)
function resample(s, flush) {
  var out = [], end = s.emitted - 2;
  if (flush) end = s.emitted - 2;
  var buf = s.outBuf, base = s.outBase;
  while (s.rpos + 2 < end) {
    var i = Math.floor(s.rpos), f = s.rpos - i, o = i - base;
    var y0 = o > 0 ? buf[o - 1] : 0, y1 = buf[o], y2 = buf[o + 1], y3 = buf[o + 2];
    var a = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3, b = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c = -0.5 * y0 + 0.5 * y2;
    out.push(((a * f + b) * f + c) * f + y1);
    s.rpos += ratio;
  }
  // drop finished stretched samples
  var keep = Math.floor(s.rpos) - 2 - base;
  if (keep > 4096) {
    var tail = s.outBuf.subarray(keep, Math.max(keep, s.emitted - base + N));
    var nb = new Float32Array(Math.max(N * 2, s.outBuf.length - keep));
    nb.set(s.outBuf.subarray(keep));
    s.outBuf = nb; s.outBase += keep;
  }
  return out;
}

function toInt16(arr) {
  var o = new Int16Array(arr.length);
  for (var i = 0; i < arr.length; i++) { var v = arr[i]; v = v > 1 ? 1 : v < -1 ? -1 : v; o[i] = v < 0 ? v * 32768 : v * 32767; }
  return o;
}

self.onmessage = function (e) {
  var m = e.data;
  try {
    if (m.cmd === 'start') { ratio = Math.pow(2, m.semis / 12); cancelled = false; return; }
    if (m.cmd === 'cancel') { cancelled = true; return; }
    if (m.cmd === 'channel') { st = fresh(); return; }
    if (m.cmd === 'chunk') {
      if (cancelled) { self.postMessage({ cmd: 'cancelled' }); return; }
      appendIn(st, m.data);
      processFrames(st, !!m.last);
      var out = resample(st, !!m.last);
      var i16 = toInt16(out);
      self.postMessage({ cmd: 'out', data: i16, last: !!m.last }, [i16.buffer]);
    }
  } catch (err) {
    self.postMessage({ cmd: 'error', message: String(err && err.message || err) });
  }
};
