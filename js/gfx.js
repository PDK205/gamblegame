/* ==========================================================================
   NGÂN HÀ VŨ MÔN — lớp hình ảnh
   Cảnh chính dựng bằng 3D (scene3d.js). Tệp này lo phần còn lại: đồng hồ hoạt cảnh,
   lớp 2D phủ lên trên (con số tỉ lệ, chữ bay, tia lửa, ngọc bay về túi) và là mặt
   tiền duy nhất mà vòng chơi gọi tới.
   ========================================================================== */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const ease = {
    lin: (t) => t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inCubic: (t) => t * t * t,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
  const COL = {
    gold: [255, 208, 112], amber: [255, 150, 60], white: [255, 255, 255], ice: [168, 200, 255],
    jade: [94, 242, 200], rose: [255, 86, 130], violet: [164, 112, 255], red: [255, 70, 70], sky: [150, 222, 255],
  };
  const TYPE_COL = { normal: 'ice', fortune: 'gold', life: 'rose', wish: 'jade', nova: 'sky', mystery: 'violet', cursed: 'red', gate: 'gold' };
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  const S = root.S3;

  const G = {
    ease, COL, TYPE_COL,
    time: 0, atime: 0, speed: 1, boost: 1, timeScale: 1,
    W: 0, H: 0, dpr: 1, unit: 1, squash: 0.7,
    play: { x: 0, y: 0, w: 100, h: 100 },
    stars: [], edges: [], lv: null, fog: false,
    world: { oy: 0, alpha: 1 },
    hover: -1, reduced: false, fever: false, wish: null, onFrame: null,
    koi: S.koi, three: true,
  };

  let cv, ctx;
  const waits = [], tweens = [];
  const parts = [], rings = [], floats = [], fliers = [], bolts = [], streaks = [];
  const sprites = {};

  /* ---------- đồng hồ: wait / tween chạy theo thời gian của game ---------- */
  G.wait = (sec) => new Promise((res) => waits.push({ t: G.atime + sec, res }));
  G.tween = (sec, fn, e) => new Promise((res) => { tweens.push({ t0: G.atime, dur: Math.max(1e-4, sec), fn, e: e || ease.lin, res }); });
  function runTimers() {
    for (let i = waits.length - 1; i >= 0; i--) if (waits[i].t <= G.atime) { const w = waits[i]; waits.splice(i, 1); w.res(); }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i], k = clamp((G.atime - tw.t0) / tw.dur, 0, 1);
      tw.fn(tw.e(k), k);
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
  }

  function makeGlow(c) {
    const s = 96, cn = document.createElement('canvas'); cn.width = cn.height = s;
    const x = cn.getContext('2d'), g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, rgba(c, 1)); g.addColorStop(0.14, rgba(c, 0.7)); g.addColorStop(0.36, rgba(c, 0.22)); g.addColorStop(1, rgba(c, 0));
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    return cn;
  }
  function glow(name, x, y, size, a) {
    if (a <= 0.004 || size <= 0) return;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(sprites[name], x - size / 2, y - size / 2, size, size);
  }

  /* ---------- hiệu ứng ---------- */
  G.burst = function (x, y, color, n, speed, opt) {
    opt = opt || {};
    if (G.reduced) n = Math.ceil(n * 0.4);
    n = Math.ceil(n * 0.75);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = speed * (0.25 + Math.random() * 0.95);
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * (opt.round ? 1 : 0.8) - (opt.round ? 0 : sp * 0.25),
        life: 0, max: (opt.life || 0.8) * rand(0.55, 1.25), size: (opt.size || 7) * rand(0.6, 1.4) * G.unit,
        c: color, drag: opt.drag != null ? opt.drag : 2.4, g: opt.g != null ? opt.g : 260 * G.unit, streak: !!opt.streak,
      });
    }
  };
  G.implode = function (x, y, color, n, radius) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = radius * rand(0.6, 1.3), life = rand(0.35, 0.6);
      parts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * G.squash, vx: -Math.cos(a) * r / life + Math.sin(a) * 40, vy: (-Math.sin(a) * r / life - Math.cos(a) * 40) * G.squash, life: 0, max: life, size: rand(4, 8) * G.unit, c: color, drag: 0, g: 0, streak: true });
    }
  };
  // vòng sóng: vẽ dẹt theo góc nhìn để trông như nằm trên mặt nước
  G.ring = function (x, y, color, r0, r1, dur, width) { rings.push({ x, y, c: color, r0, r1, t: 0, dur, w: width || 3 }); };
  G.text = function (x, y, str, opt) {
    opt = opt || {};
    floats.push({ x, y, str, t: 0, dur: opt.dur || 1.1, size: (opt.size || 15) * G.unit, c: opt.color || 'gold', vy: opt.vy != null ? opt.vy : -38, bold: opt.bold !== false, delay: opt.delay || 0 });
  };
  G.flow = function (from, to, color, dur) {
    const a = G.stars[from], b = G.stars[to];
    if (!a || !b) return;
    S.orb(a.wx, a.wz, b.wx, b.wz, color, (dur || 0.2) * 1.6 / (G.speed * G.boost));
  };
  G.fly = function (x, y, tx, ty, color, cb, delay) {
    const mx = (x + tx) / 2 + rand(-70, 70), my = Math.min(y, ty) - rand(10, 80);
    fliers.push({ x0: x, y0: y, cx: mx, cy: my, x1: tx, y1: ty, t: -(delay || 0), dur: rand(0.5, 0.75), c: color, cb });
  };
  G.bolt = function (x0, y0, x1, y1) {
    const mk = (ax, ay, bx, by, disp, depth) => {
      let pts = [[ax, ay], [bx, by]];
      for (let d = 0; d < depth; d++) {
        const out = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], nx = -(b[1] - a[1]), ny = b[0] - a[0], l = Math.hypot(nx, ny) || 1, k = (Math.random() - 0.5) * disp;
          out.push([(a[0] + b[0]) / 2 + nx / l * k, (a[1] + b[1]) / 2 + ny / l * k], b);
        }
        pts = out; disp *= 0.55;
      }
      return pts;
    };
    const main = mk(x0, y0, x1, y1, 90 * G.unit, 5), forks = [];
    for (let k = 0; k < 3; k++) { const a = main[Math.floor(rand(4, main.length - 6))]; forks.push(mk(a[0], a[1], a[0] + rand(-90, 90) * G.unit, a[1] + rand(40, 120) * G.unit, 40 * G.unit, 3)); }
    bolts.push({ main, forks, t: 0, dur: 0.42 });
  };
  G.streak = function (x0, y0, x1, y1, dur, color) { streaks.push({ x0, y0, x1, y1, t: 0, dur: dur || 0.3, c: color || 'white' }); };
  G.shake = function (a) { if (!G.reduced) S.shake = Math.max(S.shake, a * 0.02); };
  G.punch = function (z) { if (!G.reduced) S.punch = Math.max(S.punch, z * 1.4); };
  G.flashBG = function (name, a) {
    const c = COL[name] || COL.gold, k = a * 0.5;
    S.flash[0] = Math.max(S.flash[0], c[0] / 255 * k); S.flash[1] = Math.max(S.flash[1], c[1] / 255 * k); S.flash[2] = Math.max(S.flash[2], c[2] / 255 * k);
  };
  G.setPalette = function () { /* màu sắc do S3.setMood quyết định */ };
  G.setMood = function (i, instant) { S.setMood(i, instant); };

  /* ---------- sao băng ước nguyện (bay ngang màn hình, chạm trúng là bắt được) ---------- */
  G.spawnWish = function () {
    const pl = G.play, left = Math.random() < 0.5;
    const y0 = pl.y + pl.h * rand(0.1, 0.36), y1 = pl.y + pl.h * rand(0.3, 0.6);
    const x0 = left ? -50 : G.W + 50, x1 = left ? G.W + 50 : -50;
    G.wish = { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: Math.min(y0, y1) - pl.h * 0.2, t: 0, dur: clamp(G.W / 170, 3, 5.5), x: x0, y: y0 };
  };
  G.wishAt = function (x, y) { const w = G.wish; return !!w && Math.hypot(w.x - x, w.y - y) < Math.max(48, 42 * G.unit); };
  G.catchWish = function () {
    const w = G.wish; if (!w) return null;
    G.wish = null;
    G.burst(w.x, w.y, 'sky', 40, 300 * G.unit, { streak: true, life: 0.8, round: true, g: 0 });
    G.burst(w.x, w.y, 'white', 16, 150 * G.unit, { life: 0.6, round: true, g: 0 });
    const p = S.fromScreen(w.x, w.y); if (p) S.splash(p.x, p.z, 0.8);
    return { x: w.x, y: w.y };
  };
  function wishPos(w, k) { const m = 1 - k; return [m * m * w.x0 + 2 * m * k * w.cx + k * k * w.x1, m * m * w.y0 + 2 * m * k * w.cy + k * k * w.y1]; }

  /* ---------- chòm đèn ---------- */
  G.radius = (s) => Math.max(10, s.sr || 14);
  G.setLevel = function (lv, run, getOdds) {
    G.lv = lv; G.fog = !!lv.fog;
    G.stars = lv.stars.map((m) => {
      const s = {
        id: m.id, nx: m.x, ny: m.y, x: -999, y: -999, wx: 0, wz: 0, sr: 14, sry: 10, lx: 0, ly: 0, row: m.row, type: m.type, nb: m.nb,
        state: m.state, arc: m.arc, p: getOdds(m), pt: 0,
        born: G.atime + 0.35 + m.row * 0.085 + Math.random() * 0.06,
        litT: m.state === 'lit' ? -5 : -99, voidT: m.state === 'void' ? -5 : -99,
        pulse: 0, shake: 0, rolling: false, mark: 0, result: 0, omen: false, clover: false,
        seals: 0, sealsNeed: lv.sealsNeed, open: 0, rescue: 0, hidden: false,
      };
      s.pt = s.p;
      return s;
    });
    G.edges = lv.edges.map((e) => ({ a: e[0], b: e[1] }));
    S.layout(G.stars, G.play);
    S.setLevel(G.stars, G.edges);
    bolts.length = 0;
  };
  G.clearLevel = function () { G.stars = []; G.edges = []; S.clearLevel(); };
  G.relayout = function (top, bottom) {
    const padX = Math.max(14, G.W * 0.035);
    const t = top + 6, b = bottom - 6;
    const h = Math.max(220, b - t), w = G.W - padX * 2;
    G.play = { x: padX, y: t, w, h };
    S.layout(G.stars, G.play);
    G.squash = clamp(Math.sin(S.cam.pitch), 0.4, 1);
    // thước đo chung cho hiệu ứng 2D: bán kính vành đèn ở giữa hồ, tính bằng điểm ảnh
    const a = S.toScreen(0, 0, 0, {}), b2 = S.toScreen(S.ringR, 0, 0, {});
    G.unit = clamp(Math.abs(b2.x - a.x) / 22, 0.8, 1.35);
  };
  G.starAt = function (x, y) {
    let best = -1, bd = 1e9;
    for (const s of G.stars) {
      if (G.atime < s.born) continue;
      const dx = s.x - x, dy = (s.y - y) / Math.max(0.5, G.squash);
      const d = Math.hypot(dx, dy), r = Math.max(27, G.radius(s) + 9);
      if (d < r && d < bd) { bd = d; best = s.id; }
    }
    return best;
  };
  G.setOdds = function (id, p) { const s = G.stars[id]; if (s) { if (p > s.pt + 0.001) s.pulse = 1; s.pt = p; } };

  /* ---------- cập nhật lớp 2D ---------- */
  function update(dt) {
    const stars = G.stars;
    for (const s of stars) {
      s.p = lerp(s.p, s.pt, Math.min(1, dt * 9));
      if (Math.abs(s.p - s.pt) < 0.002) s.p = s.pt;
      s.pulse = Math.max(0, s.pulse - dt * 2.4);
      s.shake = Math.max(0, s.shake - dt * 2.5);
      if (G.fog && s.type !== 'gate' && s.row > 0 && s.state === 'dormant') {
        let seen = false;
        for (const id of s.nb) if (stars[id].state === 'lit') { seen = true; break; }
        s.hidden = !seen;
      } else s.hidden = false;
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy = p.vy * d + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (parts.length > 1600) parts.splice(0, parts.length - 1600);
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t >= rings[i].dur) rings.splice(i, 1); }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.t += dt; f.y += f.vy * dt * (1 - f.t / f.dur);
      if (f.t >= f.dur) floats.splice(i, 1);
    }
    for (let i = fliers.length - 1; i >= 0; i--) { const f = fliers[i]; f.t += dt; if (f.t >= f.dur) { fliers.splice(i, 1); if (f.cb) f.cb(); } }
    for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].t += dt; if (bolts[i].t >= bolts[i].dur) bolts.splice(i, 1); }
    for (let i = streaks.length - 1; i >= 0; i--) { streaks[i].t += dt; if (streaks[i].t >= streaks[i].dur) streaks.splice(i, 1); }
    if (G.wish) {
      const w = G.wish; w.t += dt;
      const k = w.t / w.dur;
      if (k >= 1) G.wish = null;
      else {
        const q = wishPos(w, k); w.x = q[0]; w.y = q[1];
        if (!G.reduced) parts.push({ x: w.x + rand(-4, 4), y: w.y + rand(-4, 4), vx: rand(-20, 20), vy: rand(-10, 30), life: 0, max: rand(0.5, 1), size: rand(3, 7) * G.unit, c: Math.random() < 0.6 ? 'sky' : 'white', drag: 1, g: 30, streak: false });
      }
    }
  }

  /* ---------- vẽ lớp 2D ---------- */
  function label(str, x, y, px, fill, a) {
    ctx.font = '700 ' + px.toFixed(1) + 'px ' + G.font;
    ctx.globalAlpha = a;
    ctx.lineWidth = Math.max(2.5, px * 0.3); ctx.strokeStyle = 'rgba(3,6,14,0.9)'; ctx.lineJoin = 'round';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = fill; ctx.fillText(str, x, y);
  }
  function draw() {
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.clearRect(0, 0, G.W, G.H);
    const wa = G.world.alpha;

    // con số tỉ lệ dưới mỗi ngọn đèn
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const s of G.stars) {
      if (s.state !== 'dormant') continue;
      const age = G.atime - s.born;
      if (age < 0.25) continue;
      const a = Math.min(1, (age - 0.25) / 0.3) * wa;
      const hid = s.hidden && !s.rolling;
      const gate = s.type === 'gate';
      const px = clamp(G.radius(s) * (gate ? 0.46 : 0.6), gate ? 13 : 9.5, gate ? 20 : 15);
      const str = hid ? '?' : Math.round(s.p * 100) + '%';
      label(str, s.lx, s.ly, px, hid ? '#b9c6e8' : s.pulse > 0.05 ? '#fff0b8' : gate ? '#fff6dc' : '#f1f5ff', a);
      if (s.omen) { ctx.font = '800 ' + (px * 1.2).toFixed(1) + 'px ' + G.font; ctx.globalAlpha = a; ctx.fillStyle = '#ffe27a'; ctx.fillText('⚡', s.x + G.radius(s), s.y - G.radius(s) * 1.5); }
    }
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const k = p.life / p.max, a = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
      if (p.streak) {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 4) {
          ctx.globalAlpha = a * 0.9; ctx.strokeStyle = rgba(COL[p.c], 1); ctx.lineWidth = p.size * 0.24; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
        }
      }
      glow(p.c, p.x, p.y, p.size * (1.5 - k * 0.7), a);
    }
    for (const r of rings) {
      const k = r.t / r.dur, e = ease.outCubic(k), rad = Math.max(0.5, lerp(r.r0, r.r1, e));
      ctx.globalAlpha = Math.pow(1 - k, 1.6) * 0.7; ctx.strokeStyle = rgba(COL[r.c], 1); ctx.lineWidth = r.w * G.unit * (1 - k * 0.7);
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * G.squash, 0, 0, TAU); ctx.stroke();
    }
    for (const s of streaks) {
      const k = clamp(s.t / s.dur, 0, 1), h = ease.outCubic(k), tl = Math.max(0, h - 0.4);
      const hx = lerp(s.x0, s.x1, h), hy = lerp(s.y0, s.y1, h);
      const g = ctx.createLinearGradient(lerp(s.x0, s.x1, tl), lerp(s.y0, s.y1, tl), hx, hy);
      g.addColorStop(0, rgba(COL[s.c], 0)); g.addColorStop(1, rgba(COL[s.c], 1));
      ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = 2.6 * G.unit; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(lerp(s.x0, s.x1, tl), lerp(s.y0, s.y1, tl)); ctx.lineTo(hx, hy); ctx.stroke();
      glow(s.c, hx, hy, 26 * G.unit, 1);
    }
    for (const b of bolts) {
      const k = b.t / b.dur, a = (1 - k) * (0.55 + 0.45 * Math.sin(b.t * 90));
      const path = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); };
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.globalAlpha = a * 0.35; ctx.strokeStyle = 'rgba(200,215,255,1)'; ctx.lineWidth = 12 * G.unit; path(b.main);
      ctx.globalAlpha = a * 0.7; ctx.strokeStyle = 'rgba(225,235,255,1)'; ctx.lineWidth = 4.5 * G.unit; path(b.main);
      ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8 * G.unit; path(b.main);
      ctx.globalAlpha = a * 0.6; ctx.lineWidth = 1.1 * G.unit; for (const f of b.forks) path(f);
    }
    if (G.wish) {
      const w = G.wish, k = w.t / w.dur, u = G.unit;
      const fade = Math.min(1, k / 0.08, (1 - k) / 0.08);
      for (let j = 14; j >= 1; j--) { const q = wishPos(w, Math.max(0, k - j * 0.012)); glow(j % 3 ? 'sky' : 'white', q[0], q[1], (24 - j * 1.4) * u, fade * (0.5 - j * 0.03)); }
      glow('sky', w.x, w.y, 58 * u, fade * 0.8); glow('white', w.x, w.y, 22 * u, fade);
      const ph = (G.time * 1.6) % 1;
      ctx.globalAlpha = fade * (1 - ph) * 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.arc(w.x, w.y, (20 + 9 * ph) * u, 0, TAU); ctx.stroke();
    }
    for (const f of fliers) {
      if (f.t < 0) continue;
      const k = ease.inOut(clamp(f.t / f.dur, 0, 1)), m = 1 - k;
      const x = m * m * f.x0 + 2 * m * k * f.cx + k * k * f.x1, y = m * m * f.y0 + 2 * m * k * f.cy + k * k * f.y1;
      glow(f.c, x, y, 18 * G.unit, 0.95); glow('white', x, y, 6 * G.unit, 0.95);
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const f of floats) {
      if (f.delay > 0) continue;
      const k = f.t / f.dur;
      const a = k < 0.1 ? k / 0.1 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const sc = k < 0.16 ? lerp(0.5, 1.18, ease.outBack(k / 0.16)) : lerp(1.18, 1, Math.min(1, (k - 0.16) / 0.2));
      ctx.font = (f.bold ? '800 ' : '600 ') + (f.size * sc).toFixed(1) + 'px ' + G.font;
      ctx.globalAlpha = a;
      ctx.lineWidth = Math.max(3, f.size * 0.26); ctx.strokeStyle = 'rgba(3,6,14,0.9)';
      ctx.strokeText(f.str, f.x, f.y);
      ctx.fillStyle = rgba(COL[f.c] || COL.gold, 1);
      ctx.fillText(f.str, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- vòng lặp ---------- */
  let last = 0, perfAcc = 0, perfN = 0, perfSlow = 0, perfWarm = 0;
  // máy yếu thì tự hạ độ nét của cảnh 3D để giữ nhịp khung hình
  function watchPerf(raw) {
    if (raw > 0.25 || G.qualityLock) return;
    if (perfWarm < 120) { perfWarm++; return; }
    perfAcc += raw; perfN++;
    if (perfN < 60) return;
    const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
    perfSlow = avg > 0.027 ? perfSlow + 1 : Math.max(0, perfSlow - 1);
    if (perfSlow >= 3 && S.quality > 0) { S.setQuality(S.quality >= 1 ? 0.5 : 0); perfSlow = 0; perfWarm = 0; }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    watchPerf((now - last) / 1000);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)) * G.timeScale;
    last = now;
    G.time += dt;
    G.atime += dt * G.speed * G.boost;
    runTimers();
    if (G.onFrame) G.onFrame(dt);
    update(dt);
    S.hover = G.hover; S.fever = G.fever; S.fade = clamp(1 - G.world.alpha, 0, 1);
    S.update(dt, G.atime, G.stars);
    S.render();
    draw();
  }

  G.resize = function () {
    const W = window.innerWidth, H = window.innerHeight;
    G.W = W; G.H = H;
    G.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * G.dpr); cv.height = Math.round(H * G.dpr);
    S.resize(W, H, window.devicePixelRatio || 1);
  };

  G.init = function (bgCanvas, fxCanvas) {
    cv = fxCanvas; ctx = cv.getContext('2d');
    G.font = '"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    try { G.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { G.reduced = false; }
    for (const k in COL) sprites[k] = makeGlow(COL[k]);
    const ok = S.init && S.init(bgCanvas);
    if (!ok) { G.three = false; return false; }
    G.resize();
    last = performance.now();
    requestAnimationFrame(frame);
    return true;
  };

  root.Gfx = G;
})(window);
