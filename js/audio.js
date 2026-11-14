/* ==========================================================================
   NGÂN HÀ VŨ MÔN — âm thanh tổng hợp bằng WebAudio (không cần tệp âm thanh)
   Thang ngũ cung: chuỗi thắng càng dài, tiếng chuông càng leo cao.
   ========================================================================== */
(function (root) {
  'use strict';

  let ac = null, master = null, dry = null, wet = null, noiseBuf = null, pad = null;
  let muted = false;
  const VOL = 0.85;
  const PENTA = [0, 2, 4, 7, 9];
  const hz = (step, base) => {
    const o = Math.floor(step / 5), i = ((step % 5) + 5) % 5;
    return (base || 220) * Math.pow(2, (o * 12 + PENTA[i]) / 12);
  };

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ac = new AC();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
      master = ac.createGain(); master.gain.value = muted ? 0 : VOL;
      comp.connect(master); master.connect(ac.destination);
      dry = ac.createGain(); dry.connect(comp);
      const conv = ac.createConvolver();
      const len = Math.floor(ac.sampleRate * 2.6), buf = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
      }
      conv.buffer = buf;
      wet = ac.createGain(); wet.gain.value = 0.34;
      wet.connect(conv); conv.connect(comp);
      const nl = ac.sampleRate;
      noiseBuf = ac.createBuffer(1, nl, ac.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { ac = null; return false; }
  }

  function tone(type, f, t0, dur, g, o) {
    if (!ac) return;
    o = o || {};
    const os = ac.createOscillator(), v = ac.createGain();
    os.type = type;
    os.frequency.setValueAtTime(Math.max(20, f), t0);
    if (o.to) os.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    v.gain.setValueAtTime(0.0001, t0);
    v.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t0 + (o.a || 0.006));
    v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    os.connect(v); v.connect(dry);
    const rv = o.rev == null ? 0.5 : o.rev;
    if (rv > 0) { const s = ac.createGain(); s.gain.value = rv; v.connect(s); s.connect(wet); }
    os.start(t0); os.stop(t0 + dur + 0.06);
  }
  function noise(t0, dur, g, type, f0, f1, q, rev) {
    if (!ac) return;
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.Q.value = q || 0.8;
    fl.frequency.setValueAtTime(f0, t0);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const v = ac.createGain();
    v.gain.setValueAtTime(0.0001, t0);
    v.gain.exponentialRampToValueAtTime(g, t0 + Math.min(0.02, dur * 0.2));
    v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(fl); fl.connect(v); v.connect(dry);
    if (rev) { const s = ac.createGain(); s.gain.value = rev; v.connect(s); s.connect(wet); }
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
  }
  function bell(step, vol, t0, base) {
    const f = hz(step, base);
    tone('sine', f, t0, 1.2, 0.2 * vol, { rev: 0.7 });
    tone('sine', f * 2.005, t0, 0.7, 0.07 * vol, { rev: 0.6 });
    tone('sine', f * 3.01, t0, 0.32, 0.035 * vol, { rev: 0.4 });
    tone('triangle', f * 0.5, t0, 0.45, 0.07 * vol, { rev: 0.3 });
  }
  const now = () => ac.currentTime + 0.005;
  const ok = () => !!ac && !muted;

  const Sfx = {
    init,
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      if (master) master.gain.setTargetAtTime(m ? 0 : VOL, ac.currentTime, 0.05);
    },
    resume() { if (ac && ac.state === 'suspended') ac.resume(); },

    ui() { if (!ok()) return; const t = now(); tone('sine', 740, t, 0.07, 0.08, { rev: 0.2 }); },
    tick(k) {
      if (!ok()) return; const t = now();
      tone('triangle', 1250 + 500 * k, t, 0.035, 0.035 + 0.05 * k, { rev: 0.12 });
      noise(t, 0.02, 0.03, 'highpass', 5000);
    },
    spawn(i) { if (!ok()) return; tone('sine', hz(5 + (i % 10)), now(), 0.35, 0.03, { rev: 0.8 }); },
    dash() { if (!ok()) return; noise(now(), 0.22, 0.07, 'bandpass', 900, 3200, 1.2, 0.2); },
    lit(streak, crit) {
      if (!ok()) return; const t = now();
      const step = Math.min(streak - 1, 17) + (streak > 18 ? (streak % 3) : 0);
      bell(step, 1, t);
      noise(t, 0.18, 0.05, 'highpass', 3500, 9000, 0.7, 0.3);
      if (crit) { bell(step + 2, 0.8, t + 0.07); bell(step + 4, 0.8, t + 0.14); bell(step + 7, 0.9, t + 0.21); }
    },
    cascade(streak) {
      if (!ok()) return; const t = now();
      const step = Math.min(streak - 1, 17) + (streak > 18 ? (streak % 3) : 0);
      const f = hz(step);
      tone('triangle', f, t, 0.3, 0.13, { rev: 0.5 });
      tone('sine', f * 2, t, 0.45, 0.08, { rev: 0.7 });
    },
    chainEnd(n) {
      if (!ok()) return; const t = now();
      const k = Math.min(1, n / 12);
      [0, 2, 4].forEach((s, i) => bell(5 + s + (n >= 8 ? 5 : 0), 0.55 + k * 0.4, t + i * 0.035));
      tone('sine', 82, t, 0.6, 0.18 + 0.2 * k, { to: 41, rev: 0.2 });
    },
    fail() {
      if (!ok()) return; const t = now();
      tone('sawtooth', 196, t, 0.55, 0.11, { to: 49, rev: 0.4 });
      tone('sine', 110, t, 0.6, 0.3, { to: 34, rev: 0.2 });
      noise(t, 0.5, 0.22, 'lowpass', 900, 90, 0.9, 0.4);
    },
    hurt() { if (!ok()) return; const t = now() + 0.08; tone('square', 155, t, 0.16, 0.05, { rev: 0.3 }); tone('square', 147, t + 0.02, 0.2, 0.05, { rev: 0.3 }); },
    shield() { if (!ok()) return; const t = now(); tone('triangle', 880, t, 0.25, 0.12, { rev: 0.6 }); tone('triangle', 1320, t + 0.04, 0.3, 0.09, { rev: 0.6 }); noise(t, 0.12, 0.08, 'bandpass', 2600, 0, 4); },
    heal() { if (!ok()) return; const t = now(); bell(7, 0.7, t); bell(9, 0.7, t + 0.09); bell(12, 0.8, t + 0.18); },
    clover() { if (!ok()) return; const t = now(); [10, 12, 14, 17].forEach((s, i) => tone('sine', hz(s), t + i * 0.05, 0.3, 0.07, { rev: 0.8 })); },
    coin(i) { if (!ok()) return; const t = now(); tone('sine', 1760 + (i % 5) * 180, t, 0.09, 0.035, { rev: 0.3 }); tone('sine', 2640 + (i % 5) * 180, t + 0.03, 0.12, 0.03, { rev: 0.3 }); },
    near() { if (!ok()) return; const t = now(); tone('sine', 520, t, 0.25, 0.08, { to: 300, rev: 0.4 }); },
    second() { if (!ok()) return; const t = now(); [3, 5, 7, 10].forEach((s, i) => tone('triangle', hz(s), t + i * 0.06, 0.22, 0.1, { rev: 0.5 })); noise(t, 0.4, 0.06, 'bandpass', 500, 4000, 1.5, 0.3); },
    nova() {
      if (!ok()) return; const t = now();
      noise(t, 0.7, 0.2, 'bandpass', 300, 6000, 0.7, 0.5);
      [5, 7, 9, 12, 14].forEach((s, i) => bell(s, 0.6, t + i * 0.03));
      tone('sine', 70, t, 0.8, 0.3, { to: 35, rev: 0.2 });
    },
    shoot() { if (!ok()) return; const t = now(); tone('sine', 2400, t, 0.35, 0.06, { to: 700, rev: 0.7 }); noise(t, 0.3, 0.05, 'highpass', 6000, 2000, 0.7, 0.4); },
    omen() { if (!ok()) return; const t = now(); for (let i = 0; i < 4; i++) noise(t + i * 0.07 + Math.random() * 0.03, 0.04, 0.09, 'highpass', 4000, 0, 1); tone('sawtooth', 62, t, 0.5, 0.05, { rev: 0.5 }); },
    thunder() {
      if (!ok()) return; const t = now();
      noise(t, 0.09, 0.5, 'highpass', 2500, 0, 0.7, 0.5);
      noise(t + 0.03, 1.5, 0.5, 'lowpass', 500, 60, 0.6, 0.7);
      tone('sine', 60, t, 1.1, 0.4, { to: 28, rev: 0.3 });
    },
    mystery(tier) { if (!ok()) return; const t = now(); const n = 3 + tier * 2; for (let i = 0; i < n; i++) tone('sine', hz(8 + i * 2), t + i * 0.055, 0.4, 0.07, { rev: 0.8 }); },
    gateRise(dur) {
      if (!ok()) return; const t = now();
      tone('sine', 82, t, dur, 0.16, { to: 330, a: dur * 0.7, rev: 0.4 });
      tone('triangle', 123, t, dur, 0.07, { to: 495, a: dur * 0.8, rev: 0.4 });
      noise(t, dur, 0.09, 'bandpass', 300, 5000, 2, 0.4);
    },
    heartbeat() { if (!ok()) return; const t = now(); tone('sine', 58, t, 0.16, 0.34, { to: 40, rev: 0.1 }); tone('sine', 52, t + 0.17, 0.2, 0.26, { to: 36, rev: 0.1 }); },
    seal(n) {
      if (!ok()) return; const t = now();
      tone('sine', 98 * (1 + n * 0.12), t, 2.2, 0.3, { rev: 0.8 });
      tone('sine', 196.6 * (1 + n * 0.12), t, 1.6, 0.14, { rev: 0.8 });
      tone('sine', 294.9 * (1 + n * 0.12), t, 1.1, 0.07, { rev: 0.8 });
      noise(t, 0.3, 0.14, 'bandpass', 1200, 300, 1, 0.6);
      [5, 7, 10].forEach((s, i) => bell(s + n * 2, 0.6, t + 0.1 + i * 0.06));
    },
    gateFail() { if (!ok()) return; const t = now(); tone('sine', 98, t, 1.2, 0.3, { to: 58, rev: 0.7 }); tone('sawtooth', 147, t, 0.5, 0.07, { to: 60, rev: 0.5 }); noise(t, 0.6, 0.2, 'lowpass', 700, 80, 0.8, 0.5); },
    gateOpen() {
      if (!ok()) return; const t = now();
      [0, 2, 4, 5, 7, 9, 10, 12, 14, 15, 17].forEach((s, i) => bell(s, 0.75, t + i * 0.055));
      tone('sine', 55, t, 2.2, 0.4, { to: 110, a: 0.3, rev: 0.4 });
      noise(t, 1.6, 0.16, 'bandpass', 400, 8000, 0.8, 0.7);
      [5, 7, 9, 12].forEach((s) => tone('triangle', hz(s, 110), t + 0.65, 2.4, 0.07, { a: 0.2, rev: 0.9 }));
    },
    card(i, r) { if (!ok()) return; const t = now(); tone('triangle', hz(5 + i * 2 + r * 2), t, 0.3, 0.09, { rev: 0.6 }); noise(t, 0.1, 0.04, 'highpass', 3000); if (r === 2) [12, 14, 17, 19].forEach((s, k) => tone('sine', hz(s), t + 0.08 + k * 0.05, 0.5, 0.06, { rev: 0.9 })); },
    buy() { if (!ok()) return; const t = now(); bell(7, 0.6, t); bell(10, 0.6, t + 0.08); },
    deny() { if (!ok()) return; const t = now(); tone('square', 180, t, 0.09, 0.05, { rev: 0.1 }); tone('square', 150, t + 0.09, 0.12, 0.05, { rev: 0.1 }); },
    shake() { if (!ok()) return; const t = now(); for (let i = 0; i < 9; i++) { noise(t + i * 0.085, 0.05, 0.1, 'bandpass', 1800 + (i % 3) * 500, 0, 5, 0.2); tone('triangle', 900 + (i % 2) * 200, t + i * 0.085, 0.04, 0.03, { rev: 0.2 }); } },
    over() { if (!ok()) return; const t = now(); [9, 7, 4, 2, 0].forEach((s, i) => tone('sine', hz(s, 110), t + i * 0.3, 1.6, 0.16, { rev: 0.9 })); tone('sine', 55, t + 1.2, 2.5, 0.2, { rev: 0.6 }); },
    win() {
      if (!ok()) return; const t = now();
      for (let i = 0; i < 16; i++) bell(i, 0.7, t + i * 0.09);
      [0, 2, 4, 7, 9, 12].forEach((s) => tone('triangle', hz(s, 110), t + 1.5, 4, 0.08, { a: 0.4, rev: 0.9 }));
      tone('sine', 55, t + 1.5, 4, 0.3, { a: 0.3, rev: 0.4 });
      noise(t + 1.4, 2.5, 0.14, 'bandpass', 500, 9000, 0.7, 0.8);
    },
    roar() { if (!ok()) return; const t = now(); tone('sawtooth', 70, t, 1.6, 0.16, { to: 130, a: 0.5, rev: 0.7 }); noise(t, 1.6, 0.25, 'bandpass', 200, 1400, 1.2, 0.8); },

    feverReady() { if (!ok()) return; const t = now(); bell(10, 0.7, t); bell(14, 0.8, t + 0.1); },
    fever() {
      if (!ok()) return; const t = now();
      for (let i = 0; i < 10; i++) tone('triangle', hz(i * 2), t + i * 0.035, 0.5, 0.09, { rev: 0.7 });
      [10, 12, 14, 17].forEach((s) => bell(s, 0.7, t + 0.36));
      tone('sine', 55, t, 1.4, 0.35, { to: 110, a: 0.25, rev: 0.3 });
      noise(t, 1.1, 0.14, 'bandpass', 600, 9000, 0.8, 0.7);
    },
    feverEnd() { if (!ok()) return; const t = now(); tone('sine', 660, t, 0.6, 0.08, { to: 220, rev: 0.7 }); },
    wishAppear() { if (!ok()) return; const t = now(); [17, 19, 21].forEach((s, i) => tone('sine', hz(s), t + i * 0.07, 0.5, 0.05, { rev: 0.9 })); },
    wish() {
      if (!ok()) return; const t = now();
      for (let i = 0; i < 8; i++) tone('sine', hz(8 + i * 2), t + i * 0.04, 0.45, 0.075, { rev: 0.9 });
      noise(t, 0.5, 0.07, 'highpass', 5000, 9000, 0.7, 0.6);
    },
    achieve() { if (!ok()) return; const t = now(); [7, 9, 12, 14].forEach((s, i) => bell(s, 0.65, t + i * 0.09)); tone('triangle', hz(5, 110), t + 0.3, 1.2, 0.07, { a: 0.1, rev: 0.9 }); },
    evolve() {
      if (!ok()) return; const t = now();
      tone('sawtooth', 82, t, 1.1, 0.1, { to: 165, a: 0.4, rev: 0.7 });
      noise(t, 1.0, 0.16, 'bandpass', 300, 5000, 1, 0.7);
      [5, 7, 10, 12, 14].forEach((s, i) => bell(s, 0.7, t + 0.5 + i * 0.07));
    },
    chime() { if (!ok()) return; const t = now(); const s = 8 + Math.floor(Math.random() * 10); tone('sine', hz(s), t, 2.2, 0.022, { a: 0.02, rev: 1 }); if (Math.random() < 0.35) tone('sine', hz(s + 2), t + 0.28, 2, 0.016, { a: 0.02, rev: 1 }); },

    /* tiếng nền mơ màng, đổi giọng theo tầng trời */
    mood(level) {
      if (!ac) return;
      const roots = [0, 2, -3, 4, -1, -5, 2, -4, 0, 0];
      const semi = roots[(level - 1) % roots.length] || 0;
      const base = 110 * Math.pow(2, semi / 12);
      const fr = [base, base * 1.5, base * 2.25, base * 3];
      if (!pad) {
        const out = ac.createGain(); out.gain.value = 0.0001;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.4;
        out.connect(lp); lp.connect(dry);
        const s = ac.createGain(); s.gain.value = 0.9; lp.connect(s); s.connect(wet);
        const lfo = ac.createOscillator(), lg = ac.createGain();
        lfo.frequency.value = 0.07; lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
        const voices = fr.map((f, i) => {
          const a = ac.createOscillator(), b = ac.createOscillator(), g = ac.createGain();
          a.type = 'sine'; b.type = 'triangle';
          a.frequency.value = f; b.frequency.value = f * 1.004;
          g.gain.value = [0.5, 0.3, 0.2, 0.1][i];
          a.connect(g); b.connect(g); g.connect(out); a.start(); b.start();
          return [a, b];
        });
        pad = { out, voices };
        out.gain.setTargetAtTime(0.05, ac.currentTime, 2.5);
      } else {
        pad.voices.forEach((v, i) => {
          v[0].frequency.setTargetAtTime(fr[i], ac.currentTime, 1.2);
          v[1].frequency.setTargetAtTime(fr[i] * 1.004, ac.currentTime, 1.2);
        });
      }
    },
  };

  root.Sfx = Sfx;
})(window);
