/* ゆっくり編集地獄 - 効果音とBGM（すべてWebAudioでその場で合成。音源ファイルなし） */
(function (root) {
  'use strict';
  var YG = root.YG = root.YG || {};

  var A = {
    ctx: null, master: null, seBus: null, bgmBus: null, noiseBuf: null,
    seOn: true, bgmOn: true, vol: 1, analyser: null, meterBuf: null, meterVal: 0,
    bgm: { name: null, timer: null, step: 0, next: 0, bpm: 120, pat: null }
  };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return true; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try { A.ctx = new AC(); } catch (e) { return false; }
    var c = A.ctx;
    A.master = c.createGain(); A.master.gain.value = 0.8 * A.vol;
    var comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    A.master.connect(comp); comp.connect(c.destination);
    // レベルメーター用に出力を分岐して測る
    A.analyser = c.createAnalyser(); A.analyser.fftSize = 512; comp.connect(A.analyser);
    A.meterBuf = new Float32Array(A.analyser.fftSize);
    A.seBus = c.createGain(); A.seBus.gain.value = A.seOn ? 1 : 0; A.seBus.connect(A.master);
    A.bgmBus = c.createGain(); A.bgmBus.gain.value = A.bgmOn ? 0.55 : 0; A.bgmBus.connect(A.master);
    var len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.noiseBuf = buf;
    if (c.state === 'suspended') c.resume();
    return true;
  };
  A.setVolume = function (v) { A.vol = Math.max(0, Math.min(1, v)); if (A.master) A.master.gain.value = 0.8 * A.vol; };
  // 出力レベル 0..1（-50dB〜0dB）。メーターがなめらかに落ちるよう減衰させる
  A.level = function () {
    if (!A.analyser) return 0;
    A.analyser.getFloatTimeDomainData(A.meterBuf);
    var sum = 0;
    for (var i = 0; i < A.meterBuf.length; i++) sum += A.meterBuf[i] * A.meterBuf[i];
    var db = 20 * Math.log10(Math.sqrt(sum / A.meterBuf.length) + 1e-9);
    var v = Math.max(0, Math.min(1, (db + 50) / 50));
    A.meterVal = v > A.meterVal ? v : A.meterVal * 0.9;
    return A.meterVal;
  };
  A.setSe = function (on) { A.seOn = on; if (A.seBus) A.seBus.gain.value = on ? 1 : 0; };
  A.setBgm = function (on) { A.bgmOn = on; if (A.bgmBus) A.bgmBus.gain.value = on ? 0.55 : 0; };

  // ---- 部品 ----
  function env(g, t, a, peak, dec, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    if (end) g.gain.setValueAtTime(0, t + a + dec + 0.01);
  }
  function osc(type, f, t, dur, peak, bus, opt) {
    var c = A.ctx, o = c.createOscillator(), g = c.createGain();
    opt = opt || {};
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t + (opt.glide || dur));
    if (opt.detune) o.detune.value = opt.detune;
    env(g, t, opt.a || 0.005, peak, dur);
    var node = o;
    if (opt.lp) { var fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = opt.lp; o.connect(fl); node = fl; }
    node.connect(g); g.connect(bus || A.seBus);
    o.start(t); o.stop(t + (opt.a || 0.005) + dur + 0.05);
    return o;
  }
  function noise(t, dur, peak, type, freq, q, bus, opt) {
    var c = A.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    opt = opt || {};
    s.buffer = A.noiseBuf; s.loop = true;
    f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq || 1000, t); if (q) f.Q.value = q;
    if (opt.to) f.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
    env(g, t, opt.a || 0.005, peak, dur);
    s.connect(f); f.connect(g); g.connect(bus || A.seBus);
    s.start(t, Math.random()); s.stop(t + (opt.a || 0.005) + dur + 0.05);
    return g;
  }

  // ---- 編集用の効果音 ----
  var SE = {
    don: function (t) {
      osc('sine', 150, t, 0.55, 0.95, null, { to: 40, glide: 0.4 });
      osc('triangle', 90, t, 0.4, 0.5, null, { to: 45 });
      noise(t, 0.12, 0.5, 'lowpass', 900);
    },
    bomb: function (t) {
      noise(t, 1.4, 0.9, 'lowpass', 4000, 0.5, null, { to: 120 });
      osc('sine', 70, t, 1.0, 0.9, null, { to: 30 });
      noise(t + 0.05, 0.6, 0.4, 'bandpass', 300, 0.8);
    },
    cheer: function (t) {
      noise(t, 1.5, 0.45, 'bandpass', 1300, 0.6, null, { a: 0.15 });
      noise(t, 1.3, 0.25, 'bandpass', 2600, 1.2, null, { a: 0.2 });
      for (var i = 0; i < 7; i++) {
        var f = 260 + Math.random() * 380, st = t + Math.random() * 0.3;
        osc('sawtooth', f, st, 0.7 + Math.random() * 0.5, 0.035, null, { to: f * (1.1 + Math.random() * 0.3), a: 0.08, lp: 1600 });
      }
    },
    shu: function (t) { noise(t, 0.22, 0.6, 'bandpass', 700, 2, null, { to: 6000 }); },
    kane: function (t) {
      var base = 180;
      [[0.56, 0.5], [0.92, 0.35], [1.19, 0.3], [1.71, 0.2], [2, 0.18], [2.74, 0.12], [3, 0.1], [4.07, 0.06]].forEach(function (p) {
        osc('sine', base * p[0] * 2, t, 2.8 - p[0] * 0.3, p[1] * 0.7);
      });
      noise(t, 0.05, 0.3, 'bandpass', 1200, 2);
    },
    zawa: function (t) {
      [0, 0.65].forEach(function (d) {
        var g = noise(t + d, 0.55, 0.5, 'bandpass', 500, 1.2, null, { a: 0.08 });
        var c = A.ctx, lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = 11; lg.gain.value = 0.25; lfo.connect(lg); lg.connect(g.gain);
        lfo.start(t + d); lfo.stop(t + d + 0.7);
        osc('sawtooth', 110, t + d, 0.5, 0.06, null, { lp: 400, a: 0.06 });
      });
    },
    clap: function (t) {
      for (var i = 0; i < 26; i++) noise(t + Math.random() * 1.3, 0.05, 0.22 + Math.random() * 0.2, 'bandpass', 1500 + Math.random() * 900, 1.2);
    },
    chin: function (t) {
      osc('sine', 1568, t, 2.2, 0.35); osc('sine', 1568 * 2.76, t, 1.2, 0.12); osc('sine', 1568 * 5.4, t, 0.5, 0.05);
      noise(t, 0.02, 0.2, 'highpass', 4000);
    },
    hyu: function (t) {
      var o = osc('sine', 1900, t, 0.95, 0.35, null, { to: 220, glide: 0.95 });
      var c = A.ctx, l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = 7; lg.gain.value = 40; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 1);
    }
  };
  // ---- UI音 ----
  var UI = {
    click: function (t) { osc('square', 880, t, 0.04, 0.06, null, { lp: 3000 }); },
    select: function (t) { osc('triangle', 660, t, 0.08, 0.15, null, { to: 990, glide: 0.06 }); },
    cut: function (t) { noise(t, 0.08, 0.3, 'highpass', 2500); osc('square', 300, t, 0.05, 0.05); },
    tick: function (t) { osc('square', 1400, t, 0.03, 0.06); },
    alarm: function (t) { for (var i = 0; i < 3; i++) { osc('square', 988, t + i * 0.16, 0.08, 0.12, null, { lp: 2500 }); } },
    phone: function (t) {
      for (var r = 0; r < 2; r++) for (var i = 0; i < 12; i++) osc('sine', i % 2 ? 1060 : 1320, t + r * 0.55 + i * 0.033, 0.03, 0.12);
    },
    stamp: function (t) { SE.don(t); noise(t, 0.3, 0.3, 'lowpass', 1500); },
    fanfare: function (t) {
      [523, 659, 784, 1047].forEach(function (f, i) { osc('square', f, t + i * 0.09, 0.12, 0.07, null, { lp: 3000 }); });
      [523, 659, 784].forEach(function (f) { osc('triangle', f, t + 0.38, 0.9, 0.12); });
      osc('square', 1047, t + 0.38, 0.9, 0.05, null, { lp: 2500 });
    },
    sad: function (t) { [392, 370, 349, 330].forEach(function (f, i) { osc('triangle', f, t + i * 0.22, i === 3 ? 0.9 : 0.2, 0.14); }); },
    whoosh: function (t) { noise(t, 0.35, 0.3, 'bandpass', 400, 1, null, { to: 3000, a: 0.1 }); },
    count: function (t) { osc('square', 1200 + Math.random() * 300, t, 0.025, 0.04, null, { lp: 3500 }); },
    buzzer: function (t) { osc('sawtooth', 196, t, 0.7, 0.18, null, { lp: 1500 }); osc('sawtooth', 207, t, 0.7, 0.18, null, { lp: 1500 }); },
    rec: function (t) { osc('sine', 1000, t, 0.12, 0.12); }
  };

  A.play = function (key, delay) {
    if (!A.ctx || !A.seOn) return;
    var f = SE[key] || UI[key];
    if (!f) return;
    try { f(A.ctx.currentTime + (delay || 0) + 0.01); } catch (e) { /* 音が鳴らなくてもゲームは続ける */ }
  };

  // ---- BGM（小さなステップシーケンサ） ----
  var NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  function midi(name) { var m = /^([A-G]#?)(-?\d)$/.exec(name); return m ? 12 * (parseInt(m[2], 10) + 1) + NOTE[m[1]] : null; }
  function hz(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function seq(str) {
    return str.trim().split(/\s+/).map(function (tok) {
      if (tok === '.') return null;
      if (tok === 'x') return 'x';
      return tok.split('+').map(midi);
    });
  }
  function rep(str, n) { var a = []; for (var i = 0; i < n; i++) a.push(str); return a.join(' '); }

  var PATTERNS = {
    edit: {
      bpm: 132, tracks: [
        { inst: 'bass', seq: seq('C3 . . C3 . . G2 . A#2 . . A#2 . . F2 . C3 . . C3 . . G2 . A#2 . A#2 . F2 . G2 .') },
        { inst: 'lead', seq: seq('C5 . E5 . G5 . E5 . A#4 . D5 . F5 . D5 . C5 . E5 . G5 . C6 . A#5 . G5 . F5 . E5 .') },
        { inst: 'kick', seq: seq(rep('x . . . x . . . x . . . x . . .', 2)) },
        { inst: 'hat', seq: seq(rep('. . x . . . x . . . x . . . x x', 2)) }
      ]
    },
    title: {
      bpm: 110, tracks: [
        { inst: 'bass', seq: seq('C3 . . . G2 . . . A2 . . . F2 . . . C3 . . . G2 . . . F2 . . . G2 . . .') },
        { inst: 'pluck', seq: seq('E5 . G5 . C6 . G5 . D5 . G5 . B5 . G5 . C5 . E5 . A5 . E5 . C5 . F5 . A5 . F5 . E5 . G5 . C6 . G5 . D5 . G5 . B5 . G5 . A4 . C5 . F5 . C5 . B4 . D5 . G5 . D5 .') },
        { inst: 'hat', seq: seq(rep('. . x .', 8)) }
      ]
    },
    fukusen: {
      bpm: 76, tracks: [
        { inst: 'pad', seq: seq('A3+C4+E4 . . . . . . . F3+A3+C4 . . . . . . . C4+E4+G4 . . . . . . . G3+B3+D4 . . . . . . .') },
        { inst: 'timp', seq: seq('A1 . . . . . . . F1 . . . . . . . C2 . . . . . . . G1 . . G1 . G1 G1 .') },
        { inst: 'pluck', seq: seq('A4 . C5 . E5 . A5 . F4 . A4 . C5 . F5 . C5 . E5 . G5 . C6 . G4 . B4 . D5 . G5 .') }
      ]
    },
    horror: {
      bpm: 64, tracks: [
        { inst: 'drone', seq: seq('C2+C#2 . . . . . . . . . . . . . . . C2+F#2 . . . . . . . . . . . . . . .') },
        { inst: 'ting', seq: seq('. . . . . . C7 . . . . . . . . . . . . F#6 . . . . . . . . . . . .') },
        { inst: 'kick', seq: seq('x . . . . . . . . . . . . . . . x . . x . . . . . . . . . . . .') }
      ]
    },
    sports: {
      bpm: 156, tracks: [
        { inst: 'bass', seq: seq('C3 . G2 . C3 . G2 . F2 . C3 . F2 . G2 . C3 . G2 . C3 . E3 . F3 . G3 . G2 . B2 .') },
        { inst: 'lead', seq: seq('G5 . . G5 C6 . . . A5 . . A5 F5 . . . G5 . . E5 C5 . E5 . F5 . A5 . G5 . . .') },
        { inst: 'kick', seq: seq(rep('x . . . x . . . x . . . x . . .', 2)) },
        { inst: 'snare', seq: seq(rep('. . . . x . . . . . . . x . x .', 2)) },
        { inst: 'hat', seq: seq(rep('x . x . x . x . x . x . x . x x', 2)) }
      ]
    },
    emo: {
      bpm: 72, tracks: [
        { inst: 'pluck', seq: seq('C4 E4 G4 C5 E5 C5 G4 E4 A3 C4 E4 A4 C5 A4 E4 C4 F3 A3 C4 F4 A4 F4 C4 A3 G3 B3 D4 G4 B4 G4 D4 B3') },
        { inst: 'pad', seq: seq('C3+G3 . . . . . . . A2+E3 . . . . . . . F2+C3 . . . . . . . G2+D3 . . . . . . .') }
      ]
    }
  };

  function voice(inst, notes, t, stepDur) {
    var bus = A.bgmBus;
    notes.forEach(function (n) {
      if (n == null) return;
      var f = hz(n);
      switch (inst) {
        case 'bass': osc('triangle', f, t, stepDur * 1.8, 0.28, bus); break;
        case 'lead': osc('square', f, t, stepDur * 0.9, 0.05, bus, { lp: 2400 }); break;
        case 'pluck': osc('triangle', f, t, 0.5, 0.12, bus); osc('sine', f * 2, t, 0.25, 0.03, bus); break;
        case 'pad': osc('sawtooth', f, t, stepDur * 7, 0.045, bus, { a: 0.25, lp: 900 }); osc('sawtooth', f, t, stepDur * 7, 0.035, bus, { a: 0.25, lp: 900, detune: 9 }); break;
        case 'timp': osc('sine', f * 2, t, 0.9, 0.35, bus, { to: f * 1.6 }); noise(t, 0.08, 0.1, 'lowpass', 400, 0, bus); break;
        case 'drone': osc('sawtooth', f, t, stepDur * 15, 0.06, bus, { a: 0.6, lp: 320 }); break;
        case 'ting': osc('sine', f, t, 2.2, 0.07, bus); break;
      }
    });
  }
  function drum(inst, t) {
    var bus = A.bgmBus;
    if (inst === 'kick') osc('sine', 150, t, 0.16, 0.5, bus, { to: 45 });
    else if (inst === 'hat') noise(t, 0.03, 0.08, 'highpass', 7000, 0, bus);
    else if (inst === 'snare') { noise(t, 0.12, 0.18, 'bandpass', 1800, 0.8, bus); osc('triangle', 220, t, 0.06, 0.08, bus); }
  }

  function schedule() {
    var b = A.bgm, c = A.ctx;
    if (!b.pat || !c) return;
    var stepDur = 60 / b.bpm / 4;
    while (b.next < c.currentTime + 0.15) {
      b.pat.tracks.forEach(function (tr) {
        var v = tr.seq[b.step % tr.seq.length];
        if (v == null) return;
        if (v === 'x') drum(tr.inst, b.next); else voice(tr.inst, v, b.next, stepDur);
      });
      b.next += stepDur; b.step++;
    }
  }
  A.startBgm = function (name, bpmScale) {
    if (!A.ctx) return;
    if (A.bgm.name === name && A.bgm.timer) { A.setBgmSpeed(bpmScale || 1); return; }
    A.stopBgm();
    var pat = PATTERNS[name]; if (!pat) return;
    A.bgm.name = name; A.bgm.pat = pat; A.bgm.bpm = pat.bpm * (bpmScale || 1); A.bgm.step = 0; A.bgm.next = A.ctx.currentTime + 0.06;
    A.bgm.timer = setInterval(schedule, 30);
    schedule();
  };
  A.setBgmSpeed = function (scale) { if (A.bgm.pat) A.bgm.bpm = A.bgm.pat.bpm * scale; };
  A.stopBgm = function () {
    if (A.bgm.timer) clearInterval(A.bgm.timer);
    A.bgm.timer = null; A.bgm.name = null; A.bgm.pat = null;
  };

  YG.Audio = A;
})(typeof window !== 'undefined' ? window : globalThis);
