/* ==========================================================================
   NGÂN HÀ VŨ MÔN — đồ hoạ: nền tinh vân (WebGL), chòm sao, cá chép, hạt sáng
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

  /* bảng màu ánh sáng */
  const COL = {
    gold:   [255, 208, 112],
    amber:  [255, 150, 60],
    white:  [255, 255, 255],
    ice:    [168, 200, 255],
    jade:   [94, 242, 200],
    rose:   [255, 86, 130],
    violet: [164, 112, 255],
    red:    [255, 70, 70],
    sky:    [150, 222, 255],
  };
  const TYPE_COL = {
    normal: 'ice', fortune: 'gold', life: 'rose', wish: 'jade',
    nova: 'sky', mystery: 'violet', cursed: 'red', gate: 'gold',
  };
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';

  const G = {
    ease, COL, TYPE_COL,
    time: 0, atime: 0, speed: 1, timeScale: 1,
    W: 0, H: 0, dpr: 1, unit: 1,
    play: { x: 0, y: 0, w: 100, h: 100 },
    stars: [], edges: [], lv: null, fog: false,
    world: { oy: 0, alpha: 1 },
    cam: { shake: 0, sx: 0, sy: 0, zoom: 0 },
    hover: -1, scroll: 0, flash: [0, 0, 0],
    reduced: false,
  };

  let cv, ctx, bgCv, gl, glInfo = null;
  const waits = [], tweens = [];
  const parts = [], rings = [], floats = [], flows = [], fliers = [], bolts = [], streaks = [];
  const dust = [];
  const sprites = {};
  let pal = { cur: [[0.03, 0.08, 0.2], [0.1, 0.35, 0.65], [0.35, 0.88, 0.82]], tgt: null };

  /* ---------- thời gian: wait / tween theo đồng hồ của game ---------- */
  G.wait = (sec) => new Promise((res) => waits.push({ t: G.atime + sec, res }));
  G.tween = (sec, fn, e) => new Promise((res) => {
    tweens.push({ t0: G.atime, dur: Math.max(1e-4, sec), fn, e: e || ease.lin, res });
  });
  function runTimers() {
    for (let i = waits.length - 1; i >= 0; i--) {
      if (waits[i].t <= G.atime) { const w = waits[i]; waits.splice(i, 1); w.res(); }
    }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const k = clamp((G.atime - tw.t0) / tw.dur, 0, 1);
      tw.fn(tw.e(k), k);
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
  }

  /* ---------- sprite phát sáng dựng sẵn ---------- */
  function makeGlow(c) {
    const s = 128, cn = document.createElement('canvas');
    cn.width = cn.height = s;
    const x = cn.getContext('2d');
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, rgba(c, 1));
    g.addColorStop(0.12, rgba(c, 0.75));
    g.addColorStop(0.32, rgba(c, 0.28));
    g.addColorStop(0.62, rgba(c, 0.07));
    g.addColorStop(1, rgba(c, 0));
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    return cn;
  }
  function makeFlare(c) {
    const s = 256, cn = document.createElement('canvas');
    cn.width = cn.height = s;
    const x = cn.getContext('2d');
    x.translate(s / 2, s / 2);
    x.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      x.save(); x.rotate(k * Math.PI / 2); x.scale(1, 0.045);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, s / 2);
      g.addColorStop(0, rgba(c, 1)); g.addColorStop(0.3, rgba(c, 0.5)); g.addColorStop(1, rgba(c, 0));
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, s / 2, 0, TAU); x.fill();
      x.restore();
    }
    return cn;
  }
  function buildSprites() {
    for (const k in COL) sprites[k] = makeGlow(COL[k]);
    sprites.flareGold = makeFlare([255, 236, 180]);
    sprites.flareWhite = makeFlare([255, 255, 255]);
  }
  function glow(name, x, y, size, a) {
    if (a <= 0.003 || size <= 0) return;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(sprites[name], x - size / 2, y - size / 2, size, size);
  }

  /* ---------- nền tinh vân bằng shader ---------- */
  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = [
    'precision mediump float;',
    'uniform vec2 uRes;uniform float uT;uniform float uScroll;uniform vec3 uA;uniform vec3 uB;uniform vec3 uC;uniform vec3 uFlash;',
    'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/uRes;',
    ' vec2 p=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);',
    ' p.y+=uScroll;',
    ' float t=uT*.018;',
    ' vec2 q=vec2(fbm(p*1.3+vec2(0.,t)),fbm(p*1.3+vec2(5.2,-t*1.3)));',
    ' vec2 r=vec2(fbm(p*1.7+3.*q+vec2(1.7,9.2)+t*.7),fbm(p*1.7+3.*q+vec2(8.3,2.8)-t*.5));',
    ' float f=fbm(p*1.5+2.6*r);',
    // dải Ngân Hà uốn lượn dọc màn hình
    ' float bx=p.x+.22*sin(p.y*1.25+.8)+.08*sin(p.y*3.3+uT*.03);',
    ' float band=exp(-bx*bx*5.5);',
    ' vec3 col=uA*(.5+.6*uv.y);',
    ' col=mix(col,uB,smoothstep(.28,.9,f)*(.22+.62*band));',
    ' col+=uC*pow(smoothstep(.42,1.05,f*(.55+length(r))),2.2)*(.10+.58*band);',
    ' col+=uB*.10*band;',
    ' float d=fbm(p*5.+r*2.);',
    ' col*=.78+.42*smoothstep(.25,.75,d);',
    ' col+=uC*.05*pow(band,3.);',
    ' vec2 v=uv-.5;col*=1.-dot(v,v)*.95;',
    ' col=col/(1.+.55*dot(col,vec3(.33)));',
    ' col+=uFlash*(.35+.65*band);',
    ' col+=(hash(gl_FragCoord.xy+uT)-.5)*.012;',
    ' gl_FragColor=vec4(col,1.);}',
  ].join('\n');

  function initGL() {
    try {
      gl = bgCv.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' });
      if (!gl) return false;
      const mk = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const pr = gl.createProgram();
      gl.attachShader(pr, mk(gl.VERTEX_SHADER, VS));
      gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      glInfo = {};
      ['uRes', 'uT', 'uScroll', 'uA', 'uB', 'uC', 'uFlash'].forEach((n) => { glInfo[n] = gl.getUniformLocation(pr, n); });
      return true;
    } catch (e) {
      gl = null; glInfo = null;
      return false;
    }
  }
  function drawBG() {
    if (!gl || !glInfo) return;
    gl.viewport(0, 0, bgCv.width, bgCv.height);
    gl.uniform2f(glInfo.uRes, bgCv.width, bgCv.height);
    gl.uniform1f(glInfo.uT, G.time);
    gl.uniform1f(glInfo.uScroll, G.scroll);
    const c = pal.cur;
    gl.uniform3f(glInfo.uA, c[0][0], c[0][1], c[0][2]);
    gl.uniform3f(glInfo.uB, c[1][0], c[1][1], c[1][2]);
    gl.uniform3f(glInfo.uC, c[2][0], c[2][1], c[2][2]);
    gl.uniform3f(glInfo.uFlash, G.flash[0], G.flash[1], G.flash[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  G.setPalette = function (arr, instant) {
    pal.tgt = arr.map(hex);
    // giữ nền đủ tối để chòm sao luôn nổi bật
    pal.tgt[1] = pal.tgt[1].map((v) => v * 0.72);
    pal.tgt[2] = pal.tgt[2].map((v) => v * 0.85);
    if (instant) pal.cur = pal.tgt.map((c) => c.slice());
    if (!gl && bgCv) {
      const a = arr;
      bgCv.style.background = 'radial-gradient(120% 80% at 40% 30%,' + a[1] + '55,transparent 60%),linear-gradient(180deg,' + a[0] + ',#03040b)';
    }
  };
  G.flashBG = function (name, a) {
    const c = COL[name] || COL.gold;
    G.flash[0] = Math.max(G.flash[0], c[0] / 255 * a);
    G.flash[1] = Math.max(G.flash[1], c[1] / 255 * a);
    G.flash[2] = Math.max(G.flash[2], c[2] / 255 * a);
  };

  /* ---------- hiệu ứng ---------- */
  G.burst = function (x, y, color, n, speed, opt) {
    opt = opt || {};
    if (G.reduced) n = Math.ceil(n * 0.4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = speed * (0.25 + Math.random() * 0.95);
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: (opt.life || 0.8) * rand(0.55, 1.25),
        size: (opt.size || 9) * rand(0.6, 1.5) * G.unit,
        c: color, drag: opt.drag != null ? opt.drag : 2.6, g: opt.g || 0, streak: !!opt.streak,
      });
    }
  };
  G.spark = function (x, y, color, vx, vy, life, size) {
    parts.push({ x, y, vx, vy, life: 0, max: life, size: size * G.unit, c: color, drag: 1.5, g: 0, streak: false });
  };
  G.implode = function (x, y, color, n, radius) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = radius * rand(0.6, 1.3), life = rand(0.35, 0.6);
      parts.push({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
        vx: -Math.cos(a) * r / life + Math.sin(a) * 40, vy: -Math.sin(a) * r / life - Math.cos(a) * 40,
        life: 0, max: life, size: rand(5, 10) * G.unit, c: color, drag: 0, g: 0, streak: true,
      });
    }
  };
  G.ring = function (x, y, color, r0, r1, dur, width) {
    rings.push({ x, y, c: color, r0, r1, t: 0, dur, w: width || 3 });
  };
  G.text = function (x, y, str, opt) {
    opt = opt || {};
    floats.push({
      x, y, str, t: 0, dur: opt.dur || 1.1, size: (opt.size || 15) * G.unit, c: opt.color || 'gold',
      vy: opt.vy != null ? opt.vy : -38, bold: opt.bold !== false, delay: opt.delay || 0,
    });
  };
  G.flow = function (from, to, color, dur) {
    flows.push({ from, to, c: color, t: 0, dur: dur || 0.2 });
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
          const a = pts[i], b = pts[i + 1];
          const nx = -(b[1] - a[1]), ny = b[0] - a[0];
          const l = Math.hypot(nx, ny) || 1, k = (Math.random() - 0.5) * disp;
          out.push([(a[0] + b[0]) / 2 + nx / l * k, (a[1] + b[1]) / 2 + ny / l * k], b);
        }
        pts = out; disp *= 0.55;
      }
      return pts;
    };
    const main = mk(x0, y0, x1, y1, 90 * G.unit, 5);
    const forks = [];
    for (let k = 0; k < 3; k++) {
      const i = Math.floor(rand(4, main.length - 6));
      const a = main[i];
      forks.push(mk(a[0], a[1], a[0] + rand(-90, 90) * G.unit, a[1] + rand(40, 120) * G.unit, 40 * G.unit, 3));
    }
    bolts.push({ main, forks, t: 0, dur: 0.42 });
  };
  G.streak = function (x0, y0, x1, y1, dur, color) {
    streaks.push({ x0, y0, x1, y1, t: 0, dur: dur || 0.3, c: color || 'white' });
  };
  G.shake = function (a) { if (!G.reduced) G.cam.shake = Math.max(G.cam.shake, a); };
  G.punch = function (z) { if (!G.reduced) G.cam.zoom = Math.max(G.cam.zoom, z); };

  /* ---------- cá chép ---------- */
  const STAGES = [
    { n: 14, seg: 4.6, w: 5.2, body: '#fff3e2', spot: '#ff4a2a', spot2: '#ffb347', fin: [255, 190, 150], horn: 0, barb: 7, glow: 'amber' },
    { n: 18, seg: 4.8, w: 5.6, body: '#fff0cc', spot: '#ff5a2a', spot2: '#ffd24a', fin: [255, 205, 130], horn: 5, barb: 11, glow: 'gold' },
    { n: 24, seg: 5.0, w: 6.0, body: '#ffe296', spot: '#3fd9b0', spot2: '#ff7a3a', fin: [150, 240, 215], horn: 9, barb: 16, glow: 'gold' },
    { n: 46, seg: 5.6, w: 8.2, body: '#ffd86a', spot: '#34d6ac', spot2: '#fff6c8', fin: [130, 240, 210], horn: 15, barb: 26, glow: 'gold' },
  ];
  const koi = {
    stage: 0, pts: [], x: 0, y: 0, a: -Math.PI / 2, v: 0,
    mode: 'wander', anchor: { x: 0, y: 0 }, phase: 0, alpha: 1, seed: Math.random() * 10,
    hurt: 0, big: 1, wr: 1, pearl: false,
  };
  G.koi = koi;
  koi.setStage = function (st) {
    koi.stage = st;
    const S = STAGES[st];
    while (koi.pts.length < S.n) {
      const l = koi.pts[koi.pts.length - 1] || { x: koi.x, y: koi.y };
      koi.pts.push({ x: l.x, y: l.y });
    }
    koi.pts.length = S.n;
  };
  koi.tele = function (x, y, a) {
    koi.x = x; koi.y = y; if (a != null) koi.a = a;
    const S = STAGES[koi.stage], L = S.seg * G.unit * koi.big;
    for (let i = 0; i < koi.pts.length; i++) {
      koi.pts[i].x = x - Math.cos(koi.a) * L * i;
      koi.pts[i].y = y - Math.sin(koi.a) * L * i;
    }
  };
  koi.head = function (x, y, a) {
    const dx = x - koi.x, dy = y - koi.y;
    koi.v = lerp(koi.v, Math.hypot(dx, dy) * 60, 0.3);
    koi.x = x; koi.y = y;
    if (a != null) koi.a = a; else if (dx * dx + dy * dy > 0.01) koi.a = Math.atan2(dy, dx);
  };
  function updateKoi(dt) {
    const S = STAGES[koi.stage], u = G.unit * koi.big;
    if (koi.mode === 'wander') {
      const t = G.time, r = koi.wr;
      const tx = koi.anchor.x + Math.cos(t * 0.5 + koi.seed) * 46 * G.unit * r + Math.cos(t * 0.23) * 14 * G.unit;
      const ty = koi.anchor.y + Math.sin(t * 0.83 + koi.seed) * 20 * G.unit * r;
      const dx = tx - koi.x, dy = ty - koi.y, d = Math.hypot(dx, dy);
      let da = Math.atan2(dy, dx) - koi.a;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      const turn = clamp(da, -3.4 * dt, 3.4 * dt);
      koi.a += turn;
      const sp = clamp(d * 1.6, 16 * G.unit, 210 * G.unit) * (1 - Math.min(0.6, Math.abs(da) * 0.25));
      koi.v = lerp(koi.v, sp, Math.min(1, dt * 4));
      koi.x += Math.cos(koi.a) * koi.v * dt;
      koi.y += Math.sin(koi.a) * koi.v * dt;
    }
    koi.phase += dt * (5 + Math.min(14, koi.v / (16 * G.unit)));
    koi.hurt = Math.max(0, koi.hurt - dt * 2.2);
    const L = S.seg * u, p = koi.pts;
    if (!p.length) return;
    p[0].x = koi.x; p[0].y = koi.y;
    for (let i = 1; i < p.length; i++) {
      const dx = p[i].x - p[i - 1].x, dy = p[i].y - p[i - 1].y;
      const d = Math.hypot(dx, dy) || 1;
      p[i].x = p[i - 1].x + dx / d * L;
      p[i].y = p[i - 1].y + dy / d * L;
    }
    // vệt sáng sau đuôi
    if (koi.alpha > 0.3 && koi.v > 60 * G.unit && Math.random() < 0.5 && !G.reduced) {
      const tl = p[p.length - 1];
      parts.push({ x: tl.x + rand(-3, 3), y: tl.y + rand(-3, 3), vx: rand(-8, 8), vy: rand(-8, 8), life: 0, max: rand(0.4, 0.8), size: rand(4, 8) * G.unit, c: S.glow, drag: 1, g: 0, streak: false });
    }
  }
  function drawKoi() {
    const p = koi.pts, n = p.length;
    if (!n || koi.alpha <= 0.01) return;
    const S = STAGES[koi.stage], u = G.unit * koi.big, A = koi.alpha;
    const P = [], N = [], Wd = [];
    const prof = (k) => (k < 0.16 ? lerp(0.62, 1, ease.outCubic(k / 0.16)) : lerp(1, 0.13, Math.pow((k - 0.16) / 0.84, 1.1)));
    const amp = (1.1 + Math.min(2.2, koi.v / (70 * G.unit))) * u;
    for (let i = 0; i < n; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
      let tx = a.x - b.x, ty = a.y - b.y;
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const k = i / (n - 1);
      const wig = Math.sin(koi.phase - i * (S.n > 30 ? 0.36 : 0.62)) * amp * (0.15 + k * 1.15);
      N.push([-ty, tx]);
      P.push([p[i].x - ty * wig, p[i].y + tx * wig, tx, ty]);
      Wd.push(S.w * u * prof(k) * (koi.stage >= 2 && i < 3 ? 1.28 - i * 0.09 : 1));
    }
    // hào quang
    ctx.globalCompositeOperation = 'lighter';
    const gstep = Math.max(3, Math.floor(n / 5));
    for (let i = 0; i < n; i += gstep) glow(S.glow, P[i][0], P[i][1], (34 + S.w * 3) * u, 0.2 * A);
    if (koi.stage >= 3) for (let i = 0; i < n; i += 4) glow('amber', P[i][0], P[i][1], 60 * u, 0.16 * A);
    if (koi.pearl) {
      const px = P[0][0] + P[0][2] * 34 * u + Math.cos(G.time * 3.1) * 5 * u, py = P[0][1] + P[0][3] * 34 * u + Math.sin(G.time * 2.3) * 5 * u;
      glow('sky', px, py, 60 * u, 0.6 * A); glow('white', px, py, 24 * u, A); glow('white', px, py, 10 * u, A);
    }
    if (koi.hurt > 0) glow('rose', P[0][0], P[0][1], 70 * u, 0.5 * koi.hurt * A);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = A;

    // vây ngực + vây bụng
    const fin = (i, len, spread, flap) => {
      if (i >= n) return;
      for (let side = -1; side <= 1; side += 2) {
        const bx = P[i][0] + N[i][0] * Wd[i] * 0.8 * side, by = P[i][1] + N[i][1] * Wd[i] * 0.8 * side;
        const ang = Math.atan2(P[i][3], P[i][2]) + Math.PI + side * (spread + Math.sin(koi.phase * 0.9 + i) * flap);
        const ex = bx + Math.cos(ang) * len * u, ey = by + Math.sin(ang) * len * u;
        const px = -Math.sin(ang) * len * u * 0.36, py = Math.cos(ang) * len * u * 0.36;
        const g = ctx.createLinearGradient(bx, by, ex, ey);
        g.addColorStop(0, rgba(S.fin, 0.85)); g.addColorStop(1, rgba(S.fin, 0.08));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(bx, by);
        ctx.quadraticCurveTo((bx + ex) / 2 + px, (by + ey) / 2 + py, ex, ey);
        ctx.quadraticCurveTo((bx + ex) / 2 - px, (by + ey) / 2 - py, bx, by);
        ctx.fill();
      }
    };
    fin(Math.round(n * 0.2), 9.5 + S.w * 0.5, 0.95, 0.28);
    fin(Math.round(n * 0.52), 6, 0.8, 0.2);
    if (koi.stage >= 2) { fin(1, 13 + S.w * 0.4, 0.5, 0.3); fin(2, 10 + S.w * 0.3, 0.78, 0.26); }
    if (S.n > 20) fin(Math.round(n * 0.36), 8, 0.9, 0.25);
    if (S.n > 30) { fin(Math.round(n * 0.66), 7, 0.85, 0.22); fin(Math.round(n * 0.8), 5, 0.8, 0.2); }

    // đuôi xoè
    {
      const i = n - 1, bx = P[i][0], by = P[i][1];
      const base = Math.atan2(P[i][3], P[i][2]) + Math.PI + Math.sin(koi.phase - i * 0.62) * 0.35;
      const len = (11 + S.w * 0.9) * u;
      for (let side = -1; side <= 1; side += 2) {
        const ang = base + side * 0.42;
        const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
        const px = -Math.sin(ang) * len * 0.3 * side, py = Math.cos(ang) * len * 0.3 * side;
        const g = ctx.createLinearGradient(bx, by, ex, ey);
        g.addColorStop(0, rgba(S.fin, 0.9)); g.addColorStop(1, rgba(S.fin, 0.05));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(bx, by);
        ctx.quadraticCurveTo((bx + ex) / 2 + px, (by + ey) / 2 + py, ex, ey);
        ctx.quadraticCurveTo(bx + Math.cos(base) * len * 0.45, by + Math.sin(base) * len * 0.45, bx, by);
        ctx.fill();
      }
    }

    // thân
    const nose = [P[0][0] + P[0][2] * Wd[0] * 1.25, P[0][1] + P[0][3] * Wd[0] * 1.25];
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(nose[0], nose[1]);
      let lx = P[0][0] + N[0][0] * Wd[0], ly = P[0][1] + N[0][1] * Wd[0];
      ctx.quadraticCurveTo(nose[0] + N[0][0] * Wd[0] * 0.9, nose[1] + N[0][1] * Wd[0] * 0.9, lx, ly);
      for (let i = 1; i < n; i++) {
        const x = P[i][0] + N[i][0] * Wd[i], y = P[i][1] + N[i][1] * Wd[i];
        ctx.quadraticCurveTo(lx, ly, (lx + x) / 2, (ly + y) / 2); lx = x; ly = y;
      }
      ctx.lineTo(P[n - 1][0], P[n - 1][1]);
      lx = P[n - 1][0] - N[n - 1][0] * Wd[n - 1]; ly = P[n - 1][1] - N[n - 1][1] * Wd[n - 1];
      for (let i = n - 2; i >= 0; i--) {
        const x = P[i][0] - N[i][0] * Wd[i], y = P[i][1] - N[i][1] * Wd[i];
        ctx.quadraticCurveTo(lx, ly, (lx + x) / 2, (ly + y) / 2); lx = x; ly = y;
      }
      ctx.quadraticCurveTo(nose[0] - N[0][0] * Wd[0] * 0.9, nose[1] - N[0][1] * Wd[0] * 0.9, nose[0], nose[1]);
      ctx.closePath();
    };
    ctx.save();
    body();
    ctx.fillStyle = S.body;
    ctx.fill();
    ctx.clip();
    // hoa văn
    const spots = S.n > 30
      ? [[2, 0.2, 1.3, 0], [6, -0.4, 1.4, 1], [10, 0.3, 1.5, 0], [15, -0.2, 1.4, 0], [20, 0.4, 1.3, 1], [25, -0.3, 1.3, 0], [30, 0.2, 1.2, 0], [35, -0.2, 1.1, 1], [40, 0.1, 1, 0]]
      : [[1, 0.25, 1.15, 0], [4, -0.45, 1.3, 0], [7, 0.4, 1.1, 1], [10, -0.2, 1.2, 0], [14, 0.3, 1.1, 0], [18, -0.3, 1, 1], [21, 0.1, 1, 0]];
    for (const sp of spots) {
      const i = sp[0]; if (i >= n - 1) continue;
      ctx.fillStyle = sp[3] ? S.spot2 : S.spot;
      ctx.beginPath();
      ctx.arc(P[i][0] + N[i][0] * Wd[i] * sp[1], P[i][1] + N[i][1] * Wd[i] * sp[1], Wd[i] * sp[2] * 0.82, 0, TAU);
      ctx.fill();
    }
    // sống lưng bắt sáng
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.1 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(P[1][0], P[1][1]);
    for (let i = 2; i < n - 2; i++) ctx.lineTo(P[i][0], P[i][1]);
    ctx.stroke();
    if (koi.hurt > 0) { ctx.fillStyle = 'rgba(255,60,90,' + (0.55 * koi.hurt) + ')'; ctx.fillRect(koi.x - 400, koi.y - 400, 800, 800); }
    ctx.restore();
    ctx.globalAlpha = A;
    body();
    ctx.strokeStyle = 'rgba(255,225,170,0.75)'; ctx.lineWidth = 0.9 * u; ctx.stroke();

    // bờm rồng
    if (koi.stage >= 2) {
      ctx.strokeStyle = rgba(S.fin, 0.8); ctx.lineWidth = 1.15 * u; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 3; i < n - 3; i += 1) {
        for (let sd0 = -1; sd0 <= 1; sd0 += 2) {
          const sd = sd0 * Wd[i] * 0.6;
          ctx.moveTo(P[i][0], P[i][1]);
          ctx.lineTo(P[i][0] - P[i][2] * 3.4 * u + N[i][0] * sd, P[i][1] - P[i][3] * 3.4 * u + N[i][1] * sd);
        }
      }
      ctx.stroke();
    }
    // sừng
    if (S.horn) {
      ctx.strokeStyle = 'rgba(255,236,190,0.95)'; ctx.lineWidth = 1.5 * u; ctx.lineCap = 'round';
      for (let side = -1; side <= 1; side += 2) {
        const bx = P[0][0] + N[0][0] * Wd[0] * 0.55 * side, by = P[0][1] + N[0][1] * Wd[0] * 0.55 * side;
        const ex = bx - P[0][2] * S.horn * u + N[0][0] * S.horn * 0.55 * u * side;
        const ey = by - P[0][3] * S.horn * u + N[0][1] * S.horn * 0.55 * u * side;
        ctx.beginPath(); ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + N[0][0] * S.horn * 0.6 * u * side, by + N[0][1] * S.horn * 0.6 * u * side, ex, ey);
        ctx.stroke();
        if (koi.stage >= 2) {
          ctx.beginPath(); ctx.moveTo((bx + ex) / 2 + N[0][0] * 2 * u * side, (by + ey) / 2 + N[0][1] * 2 * u * side);
          ctx.lineTo((bx + ex) / 2 + N[0][0] * S.horn * 0.6 * u * side - P[0][2] * 2 * u, (by + ey) / 2 + N[0][1] * S.horn * 0.6 * u * side - P[0][3] * 2 * u);
          ctx.stroke();
        }
      }
    }
    // râu
    ctx.strokeStyle = 'rgba(255,240,210,0.9)'; ctx.lineWidth = 0.9 * u; ctx.lineCap = 'round';
    for (let side = -1; side <= 1; side += 2) {
      const bx = nose[0] + N[0][0] * Wd[0] * 0.45 * side, by = nose[1] + N[0][1] * Wd[0] * 0.45 * side;
      const w = Math.sin(koi.phase * 0.8 + side) * 2 * u;
      const ex = bx - P[0][2] * S.barb * 0.6 * u + N[0][0] * (S.barb * 0.8 * u * side + w);
      const ey = by - P[0][3] * S.barb * 0.6 * u + N[0][1] * (S.barb * 0.8 * u * side + w);
      ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + P[0][2] * 3 * u + N[0][0] * S.barb * 0.7 * u * side, by + P[0][3] * 3 * u + N[0][1] * S.barb * 0.7 * u * side, ex, ey);
      ctx.stroke();
    }
    // mắt
    for (let side = -1; side <= 1; side += 2) {
      const ex = P[0][0] + P[0][2] * Wd[0] * 0.35 + N[0][0] * Wd[0] * 0.66 * side;
      const ey = P[0][1] + P[0][3] * Wd[0] * 0.35 + N[0][1] * Wd[0] * 0.66 * side;
      ctx.fillStyle = '#16090a'; ctx.beginPath(); ctx.arc(ex, ey, 1.25 * u, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(ex + 0.4 * u, ey - 0.4 * u, 0.42 * u, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- chòm sao ---------- */
  function place(s) {
    const pl = G.play, u = G.unit;
    const mT = 28 * u, mB = 60 * u;
    s.x = pl.x + s.nx * pl.w;
    s.y = pl.y + mT + (1 - s.ny) * (pl.h - mT - mB);
  }
  G.radius = (s) => (s.type === 'gate' ? 27 : s.type === 'normal' ? 14.5 : 16) * G.unit;

  G.setLevel = function (lv, run, getOdds) {
    G.lv = lv; G.fog = !!lv.fog;
    G.stars = lv.stars.map((m) => {
      const s = {
        id: m.id, nx: m.x, ny: m.y, x: 0, y: 0, row: m.row, type: m.type, nb: m.nb,
        state: m.state, arc: m.arc, p: getOdds(m), pt: 0,
        born: G.atime + 0.35 + m.row * 0.085 + Math.random() * 0.06,
        litT: m.state === 'lit' ? -5 : -99, voidT: m.state === 'void' ? -5 : -99,
        pulse: 0, shake: 0, rolling: false, mark: 0, result: 0, omen: false, clover: false,
        seals: 0, sealsNeed: lv.sealsNeed, open: 0, rescue: 0, spin: Math.random() * TAU, hidden: false,
      };
      s.pt = s.p;
      place(s);
      return s;
    });
    G.edges = lv.edges.map((e) => ({ a: e[0], b: e[1], seed: Math.random() * 10 }));
    flows.length = 0; bolts.length = 0;
  };
  G.relayout = function (top, bottom) {
    const padX = Math.max(26, G.W * 0.06);
    const t = top + 10, b = bottom - 10;
    const h = Math.max(220, b - t);
    const w = Math.min(G.W - padX * 2, h * 0.86);
    G.play = { x: (G.W - w) / 2, y: t, w, h };
    G.unit = clamp(Math.min(w / 330, h / 590), 0.7, 1.75);
    for (const s of G.stars) place(s);
  };
  G.starAt = function (x, y) {
    let best = -1, bd = 1e9;
    for (const s of G.stars) {
      if (G.atime < s.born) continue;
      const d = Math.hypot(s.x - x, s.y + G.world.oy - y);
      const r = Math.max(27, G.radius(s) + 11 * G.unit);
      if (d < r && d < bd) { bd = d; best = s.id; }
    }
    return best;
  };
  G.setOdds = function (id, p) { const s = G.stars[id]; if (s) { if (p > s.pt + 0.001) s.pulse = 1; s.pt = p; } };

  function oddsColor(p) {
    // đỏ cam → vàng kim → ngọc bích
    let h, s = 96, l = 60;
    if (p < 0.6) h = lerp(8, 44, p / 0.6);
    else { h = lerp(44, 152, Math.pow((p - 0.6) / 0.4, 1.6)); l = lerp(60, 62, (p - 0.6) / 0.4); }
    return 'hsl(' + h.toFixed(0) + ',' + s + '%,' + l + '%)';
  }

  function drawIcon(type, x, y, r, a) {
    const c = COL[TYPE_COL[type]];
    ctx.globalAlpha = a;
    if (type === 'normal') {
      ctx.fillStyle = '#e6eeff';
      ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.fill();
    } else if (type === 'fortune') {
      // đồng tiền cổ: tròn, lỗ vuông
      ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#a86a10'; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#3a2204'; ctx.fillRect(x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.6);
    } else if (type === 'life') {
      ctx.fillStyle = rgba(c, 1);
      const s = r * 1.05;
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.85);
      ctx.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.75, y - s * 1.15, x, y - s * 0.38);
      ctx.bezierCurveTo(x + s * 0.75, y - s * 1.15, x + s * 1.5, y - s * 0.1, x, y + s * 0.85);
      ctx.fill();
    } else if (type === 'wish') {
      ctx.fillStyle = rgba(c, 1);
      for (let k = 0; k < 4; k++) {
        const a2 = k * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath(); ctx.arc(x + Math.cos(a2) * r * 0.52, y + Math.sin(a2) * r * 0.52, r * 0.5, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#0c5a45'; ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, TAU); ctx.fill();
    } else if (type === 'nova') {
      ctx.fillStyle = '#f2fbff';
      ctx.beginPath();
      for (let k = 0; k < 16; k++) {
        const a2 = k * Math.PI / 8 + G.time * 0.6, rr = k % 2 ? r * 0.42 : (k % 4 === 0 ? r * 1.35 : r * 0.95);
        ctx.lineTo(x + Math.cos(a2) * rr, y + Math.sin(a2) * rr);
      }
      ctx.closePath(); ctx.fill();
    } else if (type === 'mystery') {
      ctx.fillStyle = rgba(c, 0.95); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a0d38'; ctx.font = '800 ' + (r * 1.5).toFixed(1) + 'px ' + G.font;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', x, y + r * 0.08);
    } else if (type === 'cursed') {
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath();
      for (let k = 0; k < 12; k++) {
        const a2 = k * Math.PI / 6 - G.time * 0.8, rr = k % 2 ? r * 0.5 : r * 1.3;
        ctx.lineTo(x + Math.cos(a2) * rr, y + Math.sin(a2) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a0006'; ctx.beginPath(); ctx.arc(x, y, r * 0.34, 0, TAU); ctx.fill();
    }
  }

  function setA(a) { ctx.globalAlpha = clamp(a * G.world.alpha, 0, 1); }

  function drawEdges() {
    const u = G.unit, S = G.stars;
    ctx.lineCap = 'round';
    for (const e of G.edges) {
      const a = S[e.a], b = S[e.b];
      const vis = Math.min(clamp((G.atime - a.born) / 0.4, 0, 1), clamp((G.atime - b.born) / 0.4, 0, 1));
      if (vis <= 0) continue;
      const al = a.state === 'lit', bl = b.state === 'lit';
      const av = a.state === 'void', bv = b.state === 'void';
      if (av || bv) {
        setA(0.2 * vis); ctx.strokeStyle = rgba(COL.violet, 1); ctx.lineWidth = 1 * u;
        ctx.setLineDash([2 * u, 6 * u]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
      } else if (al && bl) {
        ctx.globalCompositeOperation = 'lighter';
        setA(0.42 * vis); ctx.strokeStyle = rgba(COL.gold, 1); ctx.lineWidth = 1.7 * u;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        setA(0.5 * vis); ctx.strokeStyle = '#fff6da'; ctx.lineWidth = 1.1 * u;
        ctx.setLineDash([3 * u, 22 * u]); ctx.lineDashOffset = -G.time * 26 * u + e.seed * 9;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalCompositeOperation = 'source-over';
      } else if (al || bl) {
        const from = al ? a : b, to = al ? b : a;
        const g = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
        g.addColorStop(0, rgba(COL.gold, 0.7)); g.addColorStop(1, rgba(COL.ice, 0.16));
        setA(vis); ctx.strokeStyle = g; ctx.lineWidth = 1.35 * u;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        // hạt vận chảy về phía sao còn ngủ
        const k = (G.time * 0.55 + e.seed) % 1;
        ctx.globalCompositeOperation = 'lighter';
        glow('gold', lerp(from.x, to.x, k), lerp(from.y, to.y, k), 9 * u, 0.55 * vis * Math.sin(k * Math.PI) * G.world.alpha);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        setA(0.17 * vis); ctx.strokeStyle = rgba(COL.ice, 1); ctx.lineWidth = 1 * u;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawStar(s) {
    const u = G.unit, t = G.time;
    const age = G.atime - s.born;
    if (age < 0) return;
    const pop = age < 0.4 ? ease.outBack(age / 0.4) : 1;
    let x = s.x, y = s.y;
    if (s.shake > 0) { x += Math.sin(t * 70) * s.shake * 4 * u; y += Math.cos(t * 63) * s.shake * 3 * u; }
    const R = G.radius(s) * pop * (G.hover === s.id && s.state === 'dormant' ? 1.1 : 1);
    const wa = G.world.alpha;
    const tc = TYPE_COL[s.type];

    if (s.type === 'gate') return drawGate(s, x, y, R, pop);

    if (s.state === 'void') {
      const k = clamp((t - s.voidT) / 0.5, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      glow('violet', x, y, R * 4.2, 0.22 * wa);
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createRadialGradient(x, y, 0, x, y, R * 1.05);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.72, 'rgba(2,0,8,0.98)'); g.addColorStop(1, 'rgba(20,6,40,0)');
      setA(k); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 1.05, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a0 = t * (1.6 + i * 0.7) + i * 2.1 + s.spin;
        setA(0.75 * k); ctx.strokeStyle = rgba(i === 1 ? COL.rose : COL.violet, 1); ctx.lineWidth = (1.7 - i * 0.3) * u;
        ctx.beginPath(); ctx.arc(x, y, R * (0.8 + i * 0.1), a0, a0 + 1.5 - i * 0.3); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      return;
    }

    if (s.state === 'lit') {
      const k = clamp((t - s.litT) / 0.5, 0, 1);
      const pulse = 1 + Math.sin(t * 2.2 + s.spin) * 0.07;
      const boom = 1 + (1 - k) * 1.1;
      const main = s.type === 'normal' ? 'gold' : tc;
      ctx.globalCompositeOperation = 'lighter';
      glow(main, x, y, R * 6.4 * pulse * boom, 0.55 * wa);
      glow('gold', x, y, R * 3.2 * pulse, 0.7 * wa);
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.22 + s.spin);
      const fs = R * 6.5 * pulse * boom;
      ctx.globalAlpha = 0.85 * wa; ctx.drawImage(sprites.flareGold, -fs / 2, -fs / 2, fs, fs);
      ctx.rotate(Math.PI / 4);
      ctx.globalAlpha = 0.4 * wa; ctx.drawImage(sprites.flareGold, -fs * 0.3, -fs * 0.3, fs * 0.6, fs * 0.6);
      ctx.restore();
      glow('white', x, y, R * 1.5, 0.95 * wa);
      ctx.globalCompositeOperation = 'source-over';
      if (s.type !== 'normal') drawIcon(s.type, x, y, R * 0.36, 0.9 * wa);
      ctx.globalAlpha = 1;
      return;
    }

    // --- sao còn ngủ ---
    const p = s.p;
    const hid = s.hidden && !s.rolling;
    ctx.globalCompositeOperation = 'lighter';
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.7 + s.spin);
    glow(tc, x, y, R * (3.3 + breathe * 0.5 + s.pulse * 1.6), (0.3 + s.pulse * 0.4 + (s.type !== 'normal' ? 0.16 : 0)) * wa);
    if (s.omen) glow('gold', x, y, R * 5, (0.3 + 0.3 * Math.sin(t * 18)) * wa);
    ctx.globalCompositeOperation = 'source-over';

    // đĩa nền tối cho dễ đọc
    setA(0.55); ctx.fillStyle = '#060a1c';
    ctx.beginPath(); ctx.arc(x, y, R + 1.5 * u, 0, TAU); ctx.fill();

    // vành nền
    ctx.lineCap = 'butt';
    setA(s.rolling ? 0.5 : 0.24);
    ctx.strokeStyle = s.rolling ? 'rgba(120,70,200,1)' : rgba(COL.ice, 1);
    ctx.lineWidth = (s.rolling ? 3.2 : 2) * u;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();

    if (hid) {
      setA(0.55); ctx.strokeStyle = rgba(COL.ice, 1); ctx.lineWidth = 2.2 * u;
      ctx.setLineDash([3 * u, 5 * u]); ctx.lineDashOffset = t * 12;
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // cung vận may
      const col = oddsColor(p);
      const a0 = s.arc, a1 = s.arc + clamp(p, 0, 1) * TAU;
      ctx.lineCap = p > 0.985 ? 'butt' : 'round';
      if (s.rolling || s.pulse > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        setA(0.3 + s.pulse * 0.4); ctx.strokeStyle = col; ctx.lineWidth = (7 + s.pulse * 4) * u;
        ctx.beginPath(); ctx.arc(x, y, R, a0, a1); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      setA(1); ctx.strokeStyle = col; ctx.lineWidth = (s.rolling ? 4.2 : 3.2) * u;
      ctx.beginPath(); ctx.arc(x, y, R, a0, a1); ctx.stroke();
      if (s.rescue > 0 && p < 1) {
        setA(0.9); ctx.strokeStyle = rgba(COL.jade, 1); ctx.lineWidth = 2.2 * u; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(x, y, R, a1 + 0.05, a1 + Math.min(s.rescue, 1 - p) * TAU); ctx.stroke();
      }
    }

    if (s.type === 'normal' && !hid) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.save(); ctx.translate(x, y); ctx.rotate(s.spin + t * 0.15);
      const fs = R * (2.3 + breathe * 0.7);
      ctx.globalAlpha = (0.5 + breathe * 0.3) * wa; ctx.drawImage(sprites.flareWhite, -fs / 2, -fs / 2, fs, fs);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }
    drawIcon(s.type, x, y, (s.type === 'normal' ? 6 : 6.4) * u * pop, wa);

    if (s.clover) {
      ctx.globalCompositeOperation = 'lighter';
      setA(0.7 + 0.3 * Math.sin(t * 5)); ctx.strokeStyle = rgba(COL.jade, 1); ctx.lineWidth = 1.3 * u;
      ctx.beginPath(); ctx.arc(x, y, R + 4.5 * u, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (s.omen) {
      setA(1); ctx.fillStyle = '#ffe27a';
      ctx.font = '800 ' + (13 * u).toFixed(1) + 'px ' + G.font;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚡', x + R * 0.95, y - R * 0.95);
    }

    // kim chỉ lúc đang quay
    if (s.rolling) {
      const mx = x + Math.cos(s.mark) * R, my = y + Math.sin(s.mark) * R;
      ctx.globalCompositeOperation = 'lighter';
      const mc = s.result === 1 ? 'gold' : s.result === -1 ? 'rose' : 'white';
      glow(mc, mx, my, 26 * u, wa);
      glow('white', mx, my, 10 * u, wa);
      ctx.globalCompositeOperation = 'source-over';
      setA(1); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * u; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(s.mark) * (R - 5 * u), y + Math.sin(s.mark) * (R - 5 * u));
      ctx.lineTo(x + Math.cos(s.mark) * (R + 5 * u), y + Math.sin(s.mark) * (R + 5 * u));
      ctx.stroke();
    }

    // con số tỉ lệ
    const label = hid ? '?' : Math.round(p * 100) + '%';
    ctx.font = '700 ' + (10.5 * u).toFixed(1) + 'px ' + G.font;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ty = y + R + 10.5 * u;
    setA(0.9); ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(4,6,16,0.9)'; ctx.lineJoin = 'round';
    ctx.strokeText(label, x, ty);
    ctx.fillStyle = hid ? '#b9c6e8' : (s.pulse > 0.05 ? '#fff6c8' : '#e9f0ff');
    ctx.fillText(label, x, ty);
    ctx.globalAlpha = 1;
  }

  function drawGate(s, x, y, R, pop) {
    const u = G.unit, t = G.time, wa = G.world.alpha;
    const open = s.open;
    ctx.globalCompositeOperation = 'lighter';
    glow('gold', x, y, R * (4.6 + open * 6 + s.pulse), (0.3 + open * 0.6 + s.pulse * 0.3) * wa);
    // xoáy sáng bên trong cổng
    for (let i = 0; i < 5; i++) {
      const a0 = t * (0.5 + i * 0.13) * (i % 2 ? -1 : 1) + i * 1.3;
      setA(0.22 + open * 0.5); ctx.strokeStyle = rgba(i % 2 ? COL.gold : COL.sky, 1);
      ctx.lineWidth = (2.4 - i * 0.3) * u; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y, R * (0.22 + i * 0.13), a0, a0 + 2.3); ctx.stroke();
    }
    if (open > 0) {
      glow('white', x, y, R * 3.5 * open, open * wa);
      // cột sáng xuyên trời
      const g = ctx.createLinearGradient(x, y, x, y - G.H);
      g.addColorStop(0, 'rgba(255,240,190,' + (0.8 * open) + ')'); g.addColorStop(1, 'rgba(255,240,190,0)');
      setA(1); ctx.fillStyle = g; ctx.fillRect(x - R * 0.5 * open, y - G.H, R * open, G.H);
    }
    ctx.globalCompositeOperation = 'source-over';

    setA(0.6); ctx.fillStyle = '#070a1c';
    ctx.beginPath(); ctx.arc(x, y, R * 0.42, 0, TAU); ctx.fill();

    // vành cổng
    ctx.lineCap = 'butt';
    setA(s.rolling ? 0.55 : 0.3);
    ctx.strokeStyle = s.rolling ? 'rgba(120,70,200,1)' : rgba(COL.gold, 1);
    ctx.lineWidth = (s.rolling ? 4.5 : 2.6) * u;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    // đinh tán quanh cổng
    setA(0.75); ctx.fillStyle = '#ffe6a6';
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12 + t * 0.12;
      const rr = R + 6 * u;
      ctx.save(); ctx.translate(x + Math.cos(a) * rr, y + Math.sin(a) * rr); ctx.rotate(a + Math.PI / 4);
      const d = (i % 3 === 0 ? 2.1 : 1.2) * u;
      ctx.fillRect(-d, -d, d * 2, d * 2); ctx.restore();
    }
    if (s.state !== 'lit') {
      const p = s.p, col = oddsColor(p);
      const a0 = s.arc, a1 = s.arc + clamp(p, 0, 1) * TAU;
      ctx.lineCap = p > 0.985 ? 'butt' : 'round';
      ctx.globalCompositeOperation = 'lighter';
      setA(0.3 + s.pulse * 0.4); ctx.strokeStyle = col; ctx.lineWidth = (9 + s.pulse * 5) * u;
      ctx.beginPath(); ctx.arc(x, y, R, a0, a1); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      setA(1); ctx.strokeStyle = col; ctx.lineWidth = (s.rolling ? 5.4 : 4.2) * u;
      ctx.beginPath(); ctx.arc(x, y, R, a0, a1); ctx.stroke();
      if (s.rescue > 0 && p < 1) {
        setA(0.9); ctx.strokeStyle = rgba(COL.jade, 1); ctx.lineWidth = 2.6 * u; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(x, y, R, a1 + 0.04, a1 + Math.min(s.rescue, 1 - p) * TAU); ctx.stroke();
      }
      if (s.clover) {
        ctx.globalCompositeOperation = 'lighter';
        setA(0.8); ctx.strokeStyle = rgba(COL.jade, 1); ctx.lineWidth = 1.4 * u;
        ctx.beginPath(); ctx.arc(x, y, R + 11 * u, 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      if (s.rolling) {
        const mx = x + Math.cos(s.mark) * R, my = y + Math.sin(s.mark) * R;
        ctx.globalCompositeOperation = 'lighter';
        glow(s.result === 1 ? 'gold' : s.result === -1 ? 'rose' : 'white', mx, my, 34 * u, wa);
        glow('white', mx, my, 12 * u, wa);
        ctx.globalCompositeOperation = 'source-over';
        setA(1); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4 * u; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(s.mark) * (R - 7 * u), y + Math.sin(s.mark) * (R - 7 * u));
        ctx.lineTo(x + Math.cos(s.mark) * (R + 7 * u), y + Math.sin(s.mark) * (R + 7 * u));
        ctx.stroke();
      }
      // con số ngay giữa cổng
      ctx.font = '800 ' + (13.5 * u).toFixed(1) + 'px ' + G.font;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      setA(1); ctx.lineWidth = 3.5 * u; ctx.strokeStyle = 'rgba(4,6,16,0.9)'; ctx.lineJoin = 'round';
      const label = Math.round(p * 100) + '%';
      ctx.strokeText(label, x, y + 0.5 * u);
      ctx.fillStyle = s.pulse > 0.05 ? '#fff6c8' : '#fff';
      ctx.fillText(label, x, y + 0.5 * u);
    }
    // ấn phong
    if (s.sealsNeed > 1) {
      for (let i = 0; i < s.sealsNeed; i++) {
        const sx = x + (i - (s.sealsNeed - 1) / 2) * 15 * u, sy = y + R + 17 * u;
        const on = i < s.seals;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI / 4);
        if (on) { ctx.globalCompositeOperation = 'lighter'; glow('gold', 0, 0, 22 * u, 0.8 * wa); ctx.globalCompositeOperation = 'source-over'; }
        setA(1); ctx.fillStyle = on ? '#ffe6a6' : 'rgba(10,12,30,0.9)';
        ctx.strokeStyle = on ? '#fff' : 'rgba(255,214,122,0.75)'; ctx.lineWidth = 1.3 * u;
        ctx.fillRect(-4 * u, -4 * u, 8 * u, 8 * u); ctx.strokeRect(-4 * u, -4 * u, 8 * u, 8 * u);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- cập nhật ---------- */
  function update(dt) {
    // bảng màu
    if (pal.tgt) {
      const k = Math.min(1, dt * 1.4);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) pal.cur[i][j] = lerp(pal.cur[i][j], pal.tgt[i][j], k);
    }
    for (let i = 0; i < 3; i++) G.flash[i] = Math.max(0, G.flash[i] - dt * 0.9 - G.flash[i] * dt * 3);

    const S = G.stars;
    for (const s of S) {
      s.p = lerp(s.p, s.pt, Math.min(1, dt * 9));
      if (Math.abs(s.p - s.pt) < 0.002) s.p = s.pt;
      s.pulse = Math.max(0, s.pulse - dt * 2.4);
      s.shake = Math.max(0, s.shake - dt * 2.5);
      if (G.fog && s.type !== 'gate' && s.row > 0 && s.state === 'dormant') {
        let seen = false;
        for (const id of s.nb) if (S[id].state === 'lit') { seen = true; break; }
        s.hidden = !seen;
      } else s.hidden = false;
      if (G.reduced || G.atime < s.born) continue;
      if (s.state === 'lit' && Math.random() < dt * 1.6) {
        const a = Math.random() * TAU, r = G.radius(s) * rand(0.4, 1.4);
        parts.push({ x: s.x + Math.cos(a) * r, y: s.y + G.world.oy + Math.sin(a) * r, vx: rand(-10, 10), vy: rand(-26, -8), life: 0, max: rand(0.7, 1.4), size: rand(3, 7) * G.unit, c: 'gold', drag: 0.6, g: 0, streak: false });
      } else if (s.state === 'void' && Math.random() < dt * 5) {
        const a = Math.random() * TAU, r = G.radius(s) * rand(2, 3.2), life = rand(0.5, 0.9);
        parts.push({ x: s.x + Math.cos(a) * r, y: s.y + G.world.oy + Math.sin(a) * r, vx: -Math.cos(a) * r / life + Math.sin(a) * 30, vy: -Math.sin(a) * r / life - Math.cos(a) * 30, life: 0, max: life, size: rand(3, 6) * G.unit, c: 'violet', drag: 0, g: 0, streak: false });
      } else if (s.type === 'gate' && s.state === 'dormant' && Math.random() < dt * 9) {
        // thác sáng đổ xuống từ Thiên Môn
        parts.push({ x: s.x + rand(-1, 1) * G.radius(s) * 0.7, y: s.y + G.world.oy + G.radius(s) * 0.6, vx: rand(-6, 6), vy: rand(25, 70), life: 0, max: rand(0.5, 1.1), size: rand(3, 6) * G.unit, c: Math.random() < 0.5 ? 'sky' : 'gold', drag: 0.3, g: 60, streak: false });
      } else if (s.omen && Math.random() < dt * 14) {
        const a = Math.random() * TAU;
        parts.push({ x: s.x, y: s.y + G.world.oy, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0, max: 0.25, size: 5 * G.unit, c: 'gold', drag: 3, g: 0, streak: true });
      }
    }

    updateKoi(dt);

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy = p.vy * d + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (parts.length > 2600) parts.splice(0, parts.length - 2600);
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t >= rings[i].dur) rings.splice(i, 1); }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      if (f.delay > 0) { f.delay -= dt; continue; }
      f.t += dt; f.y += f.vy * dt * (1 - f.t / f.dur);
      if (f.t >= f.dur) floats.splice(i, 1);
    }
    for (let i = flows.length - 1; i >= 0; i--) { flows[i].t += dt * G.speed; if (flows[i].t >= flows[i].dur) flows.splice(i, 1); }
    for (let i = fliers.length - 1; i >= 0; i--) {
      const f = fliers[i]; f.t += dt;
      if (f.t >= f.dur) { fliers.splice(i, 1); if (f.cb) f.cb(); }
    }
    for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].t += dt; if (bolts[i].t >= bolts[i].dur) bolts.splice(i, 1); }
    for (let i = streaks.length - 1; i >= 0; i--) { streaks[i].t += dt; if (streaks[i].t >= streaks[i].dur) streaks.splice(i, 1); }

    const c = G.cam;
    c.shake = Math.max(0, c.shake - dt * (14 + c.shake * 5));
    c.sx = (Math.random() - 0.5) * 2 * c.shake; c.sy = (Math.random() - 0.5) * 2 * c.shake;
    c.zoom = Math.max(0, c.zoom - dt * (0.12 + c.zoom * 5));

    // sao băng lướt qua nền
    if (!G.reduced && Math.random() < dt * 0.11) {
      const x0 = rand(0, G.W), y0 = rand(0, G.H * 0.5), l = rand(120, 260);
      streaks.push({ x0, y0, x1: x0 - l, y1: y0 + l * 0.55, t: 0, dur: rand(0.5, 0.8), c: 'white', bg: true });
    }
  }

  /* ---------- vẽ ---------- */
  function drawDust() {
    const t = G.time;
    ctx.globalCompositeOperation = 'lighter';
    for (const d of dust) {
      let y = (d.y + G.scroll * 0.22 * d.z) % 1; if (y < 0) y += 1;
      const tw = 0.55 + 0.45 * Math.sin(t * d.tw + d.ph);
      const px = d.x * G.W, py = (1 - y) * G.H;
      if (d.big) glow(d.c, px, py, d.s * 9, 0.5 * tw);
      ctx.globalAlpha = d.a * tw; ctx.fillStyle = d.col;
      ctx.fillRect(px - d.s / 2, py - d.s / 2, d.s, d.s);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.clearRect(0, 0, G.W, G.H);
    drawDust();

    // sao băng nền
    ctx.globalCompositeOperation = 'lighter';
    for (const s of streaks) {
      if (!s.bg) continue;
      const k = s.t / s.dur, h = lerp(0, 1, k), tl = Math.max(0, h - 0.35);
      const g = ctx.createLinearGradient(lerp(s.x0, s.x1, tl), lerp(s.y0, s.y1, tl), lerp(s.x0, s.x1, h), lerp(s.y0, s.y1, h));
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,' + (0.7 * Math.sin(k * Math.PI)) + ')');
      ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(lerp(s.x0, s.x1, tl), lerp(s.y0, s.y1, tl)); ctx.lineTo(lerp(s.x0, s.x1, h), lerp(s.y0, s.y1, h)); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    const c = G.cam;
    ctx.save();
    ctx.translate(G.W / 2 + c.sx, G.H / 2 + c.sy);
    ctx.scale(1 + c.zoom, 1 + c.zoom);
    ctx.translate(-G.W / 2, -G.H / 2);

    if (G.stars.length && G.world.alpha > 0.01) {
      ctx.save();
      ctx.translate(0, G.world.oy);
      drawEdges();
      // dòng vận chảy dọc theo dây nối
      ctx.globalCompositeOperation = 'lighter';
      for (const f of flows) {
        const a = G.stars[f.from], b = G.stars[f.to]; if (!a || !b) continue;
        const k = ease.inOut(clamp(f.t / f.dur, 0, 1));
        for (let j = 0; j < 5; j++) {
          const kk = clamp(k - j * 0.07, 0, 1);
          glow(f.c, lerp(a.x, b.x, kk), lerp(a.y, b.y, kk), (17 - j * 2.6) * G.unit, (0.95 - j * 0.17) * G.world.alpha);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const s of G.stars) if (s.state === 'void') drawStar(s);
      for (const s of G.stars) if (s.state === 'dormant' && !s.rolling) drawStar(s);
      for (const s of G.stars) if (s.state === 'lit') drawStar(s);
      for (const s of G.stars) if (s.state === 'dormant' && s.rolling) drawStar(s);
      ctx.restore();
    }

    drawKoi();

    // hạt sáng
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const k = p.life / p.max;
      const a = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
      if (p.streak) {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 4) {
          ctx.globalAlpha = a * 0.9; ctx.strokeStyle = rgba(COL[p.c], 1); ctx.lineWidth = p.size * 0.22; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045); ctx.stroke();
        }
      }
      glow(p.c, p.x, p.y, p.size * (1.6 - k * 0.7), a);
    }
    // vòng sóng
    for (const r of rings) {
      const k = r.t / r.dur, e = ease.outCubic(k);
      ctx.globalAlpha = Math.pow(1 - k, 1.6) * 0.75; ctx.strokeStyle = rgba(COL[r.c], 1);
      ctx.lineWidth = r.w * G.unit * (1 - k * 0.7);
      ctx.beginPath(); ctx.arc(r.x, r.y, lerp(r.r0, r.r1, e), 0, TAU); ctx.stroke();
    }
    // sao đổi ngôi
    for (const s of streaks) {
      if (s.bg) continue;
      const k = clamp(s.t / s.dur, 0, 1), h = ease.outCubic(k), tl = Math.max(0, h - 0.4);
      const hx = lerp(s.x0, s.x1, h), hy = lerp(s.y0, s.y1, h);
      const g = ctx.createLinearGradient(lerp(s.x0, s.x1, tl), lerp(s.y0, s.y1, tl), hx, hy);
      g.addColorStop(0, rgba(COL[s.c], 0)); g.addColorStop(1, rgba(COL[s.c], 1));
      ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = 3 * G.unit; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(lerp(s.x0, s.x1, tl), lerp(s.y0, s.y1, tl)); ctx.lineTo(hx, hy); ctx.stroke();
      glow(s.c, hx, hy, 30 * G.unit, 1);
    }
    // sét
    for (const b of bolts) {
      const k = b.t / b.dur, a = (1 - k) * (0.55 + 0.45 * Math.sin(b.t * 90));
      const path = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); };
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.globalAlpha = a * 0.35; ctx.strokeStyle = 'rgba(255,220,120,1)'; ctx.lineWidth = 12 * G.unit; path(b.main);
      ctx.globalAlpha = a * 0.7; ctx.strokeStyle = 'rgba(255,240,180,1)'; ctx.lineWidth = 4.5 * G.unit; path(b.main);
      ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8 * G.unit; path(b.main);
      ctx.globalAlpha = a * 0.6; ctx.lineWidth = 1.1 * G.unit; ctx.strokeStyle = 'rgba(255,240,180,1)';
      for (const f of b.forks) path(f);
    }
    // ngọc bay về túi
    for (const f of fliers) {
      if (f.t < 0) continue;
      const k = ease.inOut(clamp(f.t / f.dur, 0, 1)), m = 1 - k;
      const x = m * m * f.x0 + 2 * m * k * f.cx + k * k * f.x1;
      const y = m * m * f.y0 + 2 * m * k * f.cy + k * k * f.y1;
      glow(f.c, x, y, 20 * G.unit, 0.95);
      glow('white', x, y, 7 * G.unit, 0.95);
    }
    ctx.globalCompositeOperation = 'source-over';

    // chữ bay
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const f of floats) {
      if (f.delay > 0) continue;
      const k = f.t / f.dur;
      const a = k < 0.1 ? k / 0.1 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const sc = k < 0.16 ? lerp(0.5, 1.18, ease.outBack(k / 0.16)) : lerp(1.18, 1, Math.min(1, (k - 0.16) / 0.2));
      ctx.font = (f.bold ? '800 ' : '600 ') + (f.size * sc).toFixed(1) + 'px ' + G.font;
      ctx.globalAlpha = a;
      ctx.lineWidth = Math.max(3, f.size * 0.26); ctx.strokeStyle = 'rgba(4,6,16,0.88)';
      ctx.strokeText(f.str, f.x, f.y);
      ctx.fillStyle = rgba(COL[f.c] || COL.gold, 1);
      ctx.fillText(f.str, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ---------- vòng lặp ---------- */
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)) * G.timeScale;
    last = now;
    G.time += dt;
    G.atime += dt * G.speed;
    runTimers();
    update(dt);
    drawBG();
    draw();
  }

  G.resize = function () {
    const W = window.innerWidth, H = window.innerHeight;
    G.W = W; G.H = H;
    G.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * G.dpr); cv.height = Math.round(H * G.dpr);
    const bs = W * H > 900000 ? 0.4 : 0.55;
    bgCv.width = Math.max(2, Math.round(W * bs)); bgCv.height = Math.max(2, Math.round(H * bs));
  };

  G.init = function (bgCanvas, fxCanvas) {
    bgCv = bgCanvas; cv = fxCanvas;
    ctx = cv.getContext('2d');
    G.font = '"Be Vietnam Pro", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    try { G.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { G.reduced = false; }
    buildSprites();
    initGL();
    for (let i = 0; i < 150; i++) {
      const z = Math.random();
      const warm = Math.random() < 0.25;
      dust.push({
        x: Math.random(), y: Math.random(), z: 0.3 + z,
        s: z > 0.93 ? 2.2 : z > 0.6 ? 1.5 : 1, a: 0.25 + z * 0.6,
        tw: rand(0.6, 2.4), ph: Math.random() * TAU, big: z > 0.95,
        c: warm ? 'gold' : 'ice', col: warm ? '#ffe9c0' : '#dbe7ff',
      });
    }
    G.resize();
    koi.setStage(0);
    koi.anchor = { x: G.W / 2, y: G.H * 0.62 };
    koi.tele(G.W / 2, G.H * 0.7, -Math.PI / 2);
    last = performance.now();
    requestAnimationFrame(frame);
  };

  root.Gfx = G;
})(window);
