/* ==========================================================================
   NGÂN HÀ VŨ MÔN — cảnh 3D (Three.js)
   Một hồ nước đêm soi bóng dải Ngân Hà. Mỗi ngôi sao là một đèn hoa đăng nổi
   trên mặt nước, cá chép bơi ngay dưới làn nước, cuối hồ là thác và cổng Vũ Môn.
   ========================================================================== */
(function (root) {
  'use strict';

  const T = root.THREE;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const smooth = (t) => t * t * (3 - 2 * t);

  const S = {
    ok: false, W: 1, H: 1, time: 0,
    D: 11.5, Wd: 6.4, ringR: 0.62,
    orbit: { yaw: 0, pitch: 0 }, shake: 0, punch: 0, fade: 0, flash: [0, 0, 0],
    fever: false, quality: 1,
  };
  if (!T) { root.S3 = S; return; }

  let renderer, scene, camera;
  let rtScene, rtBloom = [], postScene, postCam, postQuad, matBright, matDown, matFinal;
  let water, sky, bed, hemi, moonLight, lampPool = [];
  let glowTex, softTex;
  const v3 = new T.Vector3(), v3b = new T.Vector3();
  const C = (hex) => new T.Color(hex);

  /* ---------- không khí của chín tầng trời ---------- */
  // zenith/horizon: màu trời · band: dải Ngân Hà · moon: ánh trăng · deep/shallow: màu nước
  const MOODS = [
    { zen: '#050a24', hor: '#16345e', band: '#3d6fb0', moon: '#dfeaff', deep: '#04101f', shallow: '#0d2c44', fog: '#0a1a30', fogD: 0.016, star: 1.0, wx: 'fireflies', wc: '#ffe9a0', amb: 0.34 },
    { zen: '#070a2a', hor: '#283a78', band: '#8a9be8', moon: '#f4f6ff', deep: '#060d24', shallow: '#17255a', fog: '#141c44', fogD: 0.015, star: 0.8, wx: 'fireflies', wc: '#cfe0ff', amb: 0.42, moonBig: 1.5 },
    { zen: '#06071a', hor: '#2a2452', band: '#5e4fb0', moon: '#cfd0ff', deep: '#05060f', shallow: '#17163a', fog: '#151433', fogD: 0.022, star: 0.25, wx: 'rain', wc: '#b9c8ff', amb: 0.3 },
    { zen: '#03121c', hor: '#0c4a52', band: '#28c0b0', moon: '#e4fff4', deep: '#02141a', shallow: '#0a3a40', fog: '#082a30', fogD: 0.015, star: 1.5, wx: 'fireflies', wc: '#ffd77a', amb: 0.36 },
    { zen: '#0c0822', hor: '#3a2462', band: '#b060d8', moon: '#ffe6f7', deep: '#0a0618', shallow: '#261544', fog: '#1c1238', fogD: 0.017, star: 1.0, wx: 'petals', wc: '#ffb3d1', amb: 0.36 },
    { zen: '#0a0f14', hor: '#34444c', band: '#7c97a2', moon: '#e9f4f8', deep: '#080d10', shallow: '#1c2a30', fog: '#3a4a52', fogD: 0.05, star: 0.2, wx: 'mist', wc: '#dfeef2', amb: 0.4 },
    { zen: '#1a0508', hor: '#6a1c10', band: '#ff7a30', moon: '#ffd2a0', deep: '#120406', shallow: '#3a120c', fog: '#30100a', fogD: 0.02, star: 0.5, wx: 'embers', wc: '#ff8a3a', amb: 0.36 },
    { zen: '#020206', hor: '#120d2a', band: '#5a3fc0', moon: '#b9a8ff', deep: '#010104', shallow: '#0c0820', fog: '#06041a', fogD: 0.024, star: 1.7, wx: 'fireflies', wc: '#a98bff', amb: 0.24 },
    { zen: '#1a1206', hor: '#8a5a14', band: '#ffd070', moon: '#fff2c8', deep: '#0e0a04', shallow: '#3a2a0c', fog: '#3a2808', fogD: 0.014, star: 0.9, wx: 'petals', wc: '#ffe9a8', amb: 0.46 },
  ];
  const mood = { cur: null, tgt: null, k: 1 };
  const moodCols = ['zen', 'hor', 'band', 'moon', 'deep', 'shallow', 'fog'];

  /* ---------- các loại đèn ---------- */
  const TYPES = {
    normal:  { base: '#fff0e2', tip: '#f48aa6', glow: '#ff9a3c', scale: 1 },
    fortune: { base: '#ffe9a6', tip: '#e09a16', glow: '#ffc23a', scale: 1.08, metal: 0.55 },
    life:    { base: '#ffd3dc', tip: '#e2224c', glow: '#ff5a78', scale: 1.05 },
    wish:    { base: '#e9ffec', tip: '#2fc487', glow: '#5cffb6', scale: 1.05 },
    nova:    { base: '#ffffff', tip: '#93d2ff', glow: '#bfe6ff', scale: 1.28, petals: 11 },
    mystery: { base: '#eadcff', tip: '#7748e0', glow: '#a678ff', scale: 1.05 },
    cursed:  { base: '#6a1420', tip: '#14040a', glow: '#ff2238', scale: 1.1, sharp: true },
    gate:    { base: '#ffffff', tip: '#ffd070', glow: '#ffd070', scale: 1 },
  };

  /* ---------- GLSL dùng chung: bầu trời ---------- */
  const SKY = [
    'uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uBand; uniform vec3 uMoonCol; uniform vec3 uMoonDir; uniform float uStar; uniform float uTime; uniform float uMoonSize;',
    'float h13(vec3 p){ p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }',
    'float vn3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);',
    '  return mix(mix(mix(h13(i),h13(i+vec3(1.,0.,0.)),f.x), mix(h13(i+vec3(0.,1.,0.)),h13(i+vec3(1.,1.,0.)),f.x), f.y),',
    '             mix(mix(h13(i+vec3(0.,0.,1.)),h13(i+vec3(1.,0.,1.)),f.x), mix(h13(i+vec3(0.,1.,1.)),h13(i+vec3(1.,1.,1.)),f.x), f.y), f.z); }',
    '#ifdef SKY_LO\nfloat fbm3(vec3 p){ return vn3(p)*.62+vn3(p*2.02+vec3(3.1,1.7,5.3))*.3; }\n#else\nfloat fbm3(vec3 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*vn3(p); p=p*2.02+vec3(3.1,1.7,5.3); a*=.5; } return v; }\n#endif',
    'vec3 skyColor(vec3 d){',
    '  float h=clamp(d.y,0.,1.);',
    '  vec3 col=mix(uHor,uZen,pow(h,.5));',
    '  vec3 bn=normalize(vec3(.42,.5,-.76));',
    '  float bd=dot(d,bn); float band=exp(-bd*bd*8.);',
    '  float cl=fbm3(d*4.5+vec3(0.,uTime*.003,0.));',
    '  col+=uBand*band*(.12+.9*cl*cl);',
    '  col+=uBand*.35*pow(cl,3.)*(1.-band)*h;',
    '  for(int k=0;k<2;k++){',
    '    float sc=(k==0)?110.:230.;',
    '    vec3 p=d*sc; vec3 ip=floor(p); vec3 fp=fract(p)-.5;',
    '    float rnd=h13(ip+float(k)*17.);',
    '    float tw=.62+.38*sin(uTime*(1.+rnd*3.)+rnd*40.);',
    '    float star=step((k==0)?.975:.955,rnd)*smoothstep(.36,.02,length(fp))*tw;',
    '    col+=mix(vec3(.75,.85,1.),vec3(1.,.9,.75),fract(rnd*7.))*star*uStar*((k==0)?1.3:.55)*(.35+band*1.2+h*.5);',
    '  }',
    '  float md=dot(d,uMoonDir);',
    '  float ms=1.-uMoonSize*.0016;',
    '  col+=uMoonCol*smoothstep(ms,ms+.00025,md)*1.5;',
    '  col+=uMoonCol*pow(max(md,0.),190./uMoonSize)*.28;',
    '  col+=uMoonCol*pow(max(md,0.),16.)*.07;',
    '  return col;',
    '}',
  ].join('\n');
  const skyU = {
    uZen: { value: C('#050a24') }, uHor: { value: C('#16345e') }, uBand: { value: C('#3d6fb0') },
    uMoonCol: { value: C('#dfeaff') }, uMoonDir: { value: new T.Vector3(0.18, 0.72, -0.67).normalize() },
    uStar: { value: 1 }, uTime: { value: 0 }, uMoonSize: { value: 1 },
  };

  /* ---------- kết cấu dựng bằng canvas ---------- */
  function makeGlowTex(soft) {
    const s = 128, cn = document.createElement('canvas'); cn.width = cn.height = s;
    const x = cn.getContext('2d'), g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    if (soft) { g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
    else { g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,255,0.8)'); g.addColorStop(0.4, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    const t = new T.CanvasTexture(cn); t.encoding = T.sRGBEncoding; return t;
  }
  function makeIconTex(type) {
    const s = 96, cn = document.createElement('canvas'); cn.width = cn.height = s;
    const x = cn.getContext('2d'); x.translate(s / 2, s / 2);
    const r = 30;
    x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 6;
    if (type === 'fortune') {
      x.fillStyle = '#f2c14e'; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill();
      x.shadowBlur = 0; x.strokeStyle = '#8a5a10'; x.lineWidth = 4; x.beginPath(); x.arc(0, 0, r * 0.76, 0, TAU); x.stroke();
      x.fillStyle = '#2a1803'; x.fillRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6);
    } else if (type === 'life') {
      x.fillStyle = '#e8365a'; const q = r * 1.05;
      x.beginPath(); x.moveTo(0, q * 0.85);
      x.bezierCurveTo(-q * 1.5, -q * 0.1, -q * 0.75, -q * 1.15, 0, -q * 0.38);
      x.bezierCurveTo(q * 0.75, -q * 1.15, q * 1.5, -q * 0.1, 0, q * 0.85); x.fill();
    } else if (type === 'wish') {
      x.fillStyle = '#4fd69a';
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; x.beginPath(); x.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.5, 0, TAU); x.fill(); }
      x.shadowBlur = 0; x.fillStyle = '#0c5a45'; x.beginPath(); x.arc(0, 0, r * 0.16, 0, TAU); x.fill();
    } else if (type === 'nova') {
      x.fillStyle = '#eef9ff'; x.beginPath();
      for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, rr = k % 2 ? r * 0.4 : (k % 4 === 0 ? r * 1.3 : r * 0.9); x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      x.closePath(); x.fill();
    } else if (type === 'mystery') {
      x.fillStyle = '#9a6cf0'; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill();
      x.shadowBlur = 0; x.fillStyle = '#fff'; x.font = '800 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 0, 3);
    } else if (type === 'cursed') {
      x.fillStyle = '#e8232f'; x.beginPath();
      for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, rr = k % 2 ? r * 0.5 : r * 1.25; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      x.closePath(); x.fill();
      x.shadowBlur = 0; x.fillStyle = '#1a0004'; x.beginPath(); x.arc(0, 0, r * 0.32, 0, TAU); x.fill();
    }
    const t = new T.CanvasTexture(cn); t.encoding = T.sRGBEncoding; return t;
  }
  const iconTex = {};

  /* ---------- hình học cánh sen ---------- */
  function lotusGeo(def) {
    const pos = [], col = [], idx = [];
    const cB = C(def.base), cT = C(def.tip), tmp = new T.Color();
    const layer = (count, r0, len, wid, tilt, curl, y0, rot, tint) => {
      const NU = 6, NV = 4;
      for (let k = 0; k < count; k++) {
        const ang = rot + k / count * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
        const b0 = pos.length / 3;
        let rr = r0, yy = y0;
        for (let iu = 0; iu <= NU; iu++) {
          const u = iu / NU;
          const th = tilt + curl * u * u;
          if (iu > 0) { rr += Math.cos(th) * len / NU; yy += Math.sin(th) * len / NU; }
          const w = wid * Math.pow(Math.sin(Math.PI * Math.pow(u, def.sharp ? 0.55 : 0.72)), def.sharp ? 1.5 : 0.9) + 0.008;
          for (let iv = 0; iv <= NV; iv++) {
            const v = iv / NV * 2 - 1;
            const lx = v * w, ly = yy + v * v * w * 0.42;
            pos.push(ca * rr - sa * lx, ly, sa * rr + ca * lx);
            tmp.copy(cB).lerp(cT, Math.pow(u, 0.9) * tint);
            col.push(tmp.r, tmp.g, tmp.b);
          }
        }
        for (let iu = 0; iu < NU; iu++) for (let iv = 0; iv < NV; iv++) {
          const a = b0 + iu * (NV + 1) + iv, b = a + 1, c = a + NV + 1, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
    };
    const n = def.petals || 8;
    layer(n, 0.09, 0.44, def.sharp ? 0.11 : 0.165, 0.2, 0.75, 0.035, 0, 1);
    layer(Math.max(5, n - 2), 0.05, 0.38, def.sharp ? 0.095 : 0.14, 0.78, 0.55, 0.05, Math.PI / n, 0.85);
    layer(5, 0.02, 0.27, 0.1, 1.2, 0.3, 0.06, 0.4, 0.6);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const geoCache = {};
  let padGeo, ringGeo, discGeo, streakGeo, coreGeo;

  /* ---------- vành tỉ lệ nằm trên mặt nước ---------- */
  const RING_VS = 'varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
  const RING_FS = [
    'uniform float uP; uniform float uArc; uniform vec3 uCol; uniform float uA; uniform float uRoll; uniform float uHid; uniform float uRes; uniform float uT; uniform float uPulse; uniform float uIn; uniform float uOut;',
    'varying vec2 vP;',
    'void main(){',
    '  float r=length(vP); float ang=atan(-vP.y,vP.x);',
    '  float d=mod(ang-uArc+6.2831853*4.,6.2831853);',
    '  float t=(r-uIn)/(uOut-uIn);',
    '  float edge=smoothstep(0.,.22,t)*smoothstep(1.,.78,t);',
    '  float inArc=step(d,uP*6.2831853);',
    '  float inRes=step(uP*6.2831853,d)*step(d,(uP+uRes)*6.2831853);',
    '  vec3 col=uCol*(.9+uPulse*.7+uRoll*.25);',
    '  float a=inArc*edge;',
    '  float track=(1.-inArc)*edge*smoothstep(.2,.45,t)*smoothstep(.8,.55,t);',
    '  vec3 tc=mix(vec3(.62,.74,1.),vec3(.62,.36,1.),uRoll);',
    '  float ta=track*(.42+uRoll*.3);',
    '  float al=max(a,max(ta,inRes*edge*.9));',
    '  col=(col*a+tc*ta+vec3(.3,.95,.75)*inRes*edge*.9)/max(al,.001);',
    '  if(uHid>.5){ float dash=step(.5,fract(ang*3.82+uT*.5)); col=vec3(.6,.72,.95)*edge*dash*.7; al=edge*dash*.6; }',
    '  gl_FragColor=vec4(col,al*uA);',
    '  #include <encodings_fragment>',
    '}',
  ].join('\n');

  const WHIRL_FS = [
    'uniform float uT; uniform float uA; varying vec2 vP;',
    'void main(){',
    '  float r=length(vP)/.82; if(r>1.) discard;',
    '  float ang=atan(vP.y,vP.x);',
    '  float sp=sin(ang*3.+r*9.-uT*3.2)*.5+.5;',
    '  float core=smoothstep(.55,.0,r);',
    '  vec3 col=mix(vec3(.02,.0,.06),vec3(.5,.25,1.),pow(sp,3.)*(1.-core)*smoothstep(1.,.5,r));',
    '  col+=vec3(1.,.3,.6)*pow(sp,8.)*smoothstep(1.,.75,r)*.5;',
    '  float al=smoothstep(1.,.82,r)*(.55+.4*core);',
    '  gl_FragColor=vec4(col,al*uA);',
    '  #include <encodings_fragment>',
    '}',
  ].join('\n');

  /* =======================================================================
     Khởi tạo
     ======================================================================= */
  S.init = function (canvas) {
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x02050c, 1);
    renderer.autoClear = true;

    scene = new T.Scene();
    scene.fog = new T.FogExp2(0x0a1a30, 0.016);
    camera = new T.PerspectiveCamera(34, 1, 0.1, 900);

    glowTex = makeGlowTex(false); softTex = makeGlowTex(true);
    ['fortune', 'life', 'wish', 'nova', 'mystery', 'cursed'].forEach((k) => { iconTex[k] = makeIconTex(k); });

    hemi = new T.HemisphereLight(0x7f9fd8, 0x0a1018, 0.6);
    scene.add(hemi);
    moonLight = new T.DirectionalLight(0xdfeaff, 0.7);
    moonLight.position.set(4, 14, -12);
    scene.add(moonLight);
    for (let i = 0; i < 5; i++) {
      const l = new T.PointLight(0xffb45e, 0, 7, 2);
      l.position.set(0, -50, 0); scene.add(l); lampPool.push({ l, id: -1, k: 0 });
    }

    buildSky(); buildWater(); buildShore(); buildGate(); buildFx(); buildKoi(); buildWeather(); buildPost();
    setMoodNow(0);
    S.ok = true;
    return true;
  };

  /* ---------- trời ---------- */
  function buildSky() {
    const m = new T.ShaderMaterial({
      uniforms: skyU, side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z=gl_Position.w*.9999; }',
      fragmentShader: SKY + '\nvarying vec3 vD;\nvoid main(){ vec3 d=normalize(vD); vec3 c=skyColor(vec3(d.x,max(d.y,0.),d.z)); c=mix(c,uHor*.6,smoothstep(.0,-.25,d.y)); gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}',
    });
    sky = new T.Mesh(new T.SphereGeometry(500, 32, 20), m);
    sky.frustumCulled = false; sky.renderOrder = -10;
    scene.add(sky);
  }

  /* ---------- nước ---------- */
  const waterU = {
    uCam: { value: new T.Vector3() }, uDeep: { value: C('#04101f') }, uShallow: { value: C('#0d2c44') },
    uFogCol: { value: C('#0a1a30') }, uFogDen: { value: 0.016 }, uRefl: { value: 0.7 },
    uRip: { value: [] }, uWarm: { value: new T.Vector3(0, 0, 0) },
  };
  const ripples = [];
  let ripI = 0;
  function buildWater() {
    for (let i = 0; i < 8; i++) { ripples.push(new T.Vector4(0, 0, -99, 0)); }
    waterU.uRip.value = ripples;
    const u = Object.assign({}, skyU, waterU);
    const m = new T.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: '#define SKY_LO\n' + SKY + [
        'uniform vec3 uCam; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFogCol; uniform float uFogDen; uniform float uRefl; uniform vec4 uRip[8]; uniform vec3 uWarm;',
        'varying vec3 vW;',
        'float h12(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }',
        'float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h12(i),h12(i+vec2(1.,0.)),f.x), mix(h12(i+vec2(0.,1.)),h12(i+vec2(1.,1.)),f.x), f.y); }',
        'void main(){',
        '  vec2 p=vW.xz; float t=uTime;',
        '  vec2 g=vec2(0.);',
        '  g+=vec2(.8,.6)*.02*cos(dot(p,vec2(.8,.6))*1.6+t*.9);',
        '  g+=vec2(-.6,.8)*.018*cos(dot(p,vec2(-.6,.8))*2.2+t*1.1);',
        '  g+=vec2(.3,-.95)*.012*cos(dot(p,vec2(.3,-.95))*3.6-t*1.4);',
        '  vec2 q=p*2.4+vec2(t*.13,-t*.1); float e=.09; float n0=n2(q);',
        '  g+=vec2(n2(q+vec2(e,0.))-n0, n2(q+vec2(0.,e))-n0)*.4;',
        '  vec2 q2=p*6.5+vec2(-t*.25,t*.2); float n1=n2(q2);',
        '  g+=vec2(n2(q2+vec2(e,0.))-n1, n2(q2+vec2(0.,e))-n1)*.13;',
        '  float foam=0.;',
        '  for(int i=0;i<8;i++){',
        '    vec4 r=uRip[i]; float age=t-r.z;',
        '    if(age>0. && age<4.5){',
        '      vec2 dd=p-r.xy; float dist=length(dd)+.0001; float front=age*1.9;',
        '      float env=exp(-pow((dist-front)*1.5,2.))*r.w*exp(-age*.85);',
        '      g+=(dd/dist)*env*cos((dist-front)*8.)*.55;',
        '      foam+=env*.35;',
        '    }',
        '  }',
        '  vec3 N=normalize(vec3(-g.x,1.,-g.y));',
        '  vec3 V=normalize(uCam-vW);',
        '  float nv=max(dot(N,V),0.);',
        '  float fres=.16+.84*pow(1.-nv,2.6);',
        '  vec3 R=reflect(-V,N); R.y=abs(R.y)+.02; R=normalize(R);',
        '  vec3 refl=skyColor(R)*uRefl;',
        '  float dist=length(uCam-vW);',
        '  vec3 body=mix(uShallow,uDeep,smoothstep(3.,26.,dist));',
        '  vec3 col=mix(body,refl,fres);',
        '  float sp=max(dot(R,uMoonDir),0.);',
        '  col+=uMoonCol*pow(sp,520.)*1.1;',
        '  col+=uWarm*(.25+.75*fres)*(.6+.8*n0);',
        '  col+=vec3(.6,.8,1.)*foam;',
        '  float fog=1.-exp(-uFogDen*uFogDen*dist*dist);',
        '  col=mix(col,uFogCol,fog);',
        '  gl_FragColor=vec4(col,mix(.6,.97,fres));',
        '  #include <tonemapping_fragment>',
        '  #include <encodings_fragment>',
        '}',
      ].join('\n'),
    });
    water = new T.Mesh(new T.PlaneGeometry(900, 900), m);
    water.rotation.x = -Math.PI / 2; water.renderOrder = 1;
    scene.add(water);
    bed = new T.Mesh(new T.PlaneGeometry(900, 900), new T.MeshBasicMaterial({ color: 0x02060c, fog: false }));
    bed.rotation.x = -Math.PI / 2; bed.position.y = -6;
    scene.add(bed);
  }
  S.ripple = function (x, z, amp) {
    const r = ripples[ripI]; ripI = (ripI + 1) % 8;
    r.set(x, z, S.time, amp == null ? 1 : amp);
  };

  /* ---------- bờ hồ, đá, lá sen, núi xa ---------- */
  let rocks, pads, cliff, fall, mounts;
  const fallU = { uT: { value: 0 }, uA: { value: 1 }, uCol: { value: C('#bfe0ff') } };
  function rockGeo(seed) {
    const g = new T.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    let s = seed;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const map = {};
    for (let i = 0; i < p.count; i++) {
      const key = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
      if (map[key] == null) map[key] = 0.72 + rnd() * 0.5;
      const k = map[key];
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  }
  function buildShore() {
    const rockMat = new T.MeshStandardMaterial({ color: 0x232b3a, roughness: 0.92, metalness: 0.02, flatShading: true });
    rocks = new T.Group(); scene.add(rocks);
    cliff = new T.Group(); scene.add(cliff);
    const geos = [rockGeo(11), rockGeo(47), rockGeo(93)];
    // vách đá hai bên thác
    const put = (g, x, y, z, sx, sy, sz, ry, parent) => {
      const m = new T.Mesh(g, rockMat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rand(-0.2, 0.2), ry, rand(-0.2, 0.2));
      (parent || rocks).add(m); return m;
    };
    for (let i = 0; i < 7; i++) {
      put(geos[i % 3], -3.2 - i * 1.7, 2.2 + (i % 3) * 1.1, -3.4 - (i % 2) * 1.2, 2.6, 4.6 + (i % 3) * 1.6, 2.4, i * 1.3, cliff);
      put(geos[(i + 1) % 3], 3.2 + i * 1.7, 2.2 + ((i + 1) % 3) * 1.1, -3.4 - ((i + 1) % 2) * 1.2, 2.6, 4.6 + ((i + 2) % 3) * 1.6, 2.4, i * 2.1, cliff);
    }
    put(geos[0], 0, 6.2, -5.2, 5.4, 4.2, 3, 0.4, cliff);
    put(geos[1], -1.9, 0.2, -1.2, 0.9, 0.7, 0.9, 1, cliff);
    put(geos[2], 2.0, 0.15, -1.3, 0.8, 0.6, 0.8, 2, cliff);
    // thác nước
    const fm = new T.ShaderMaterial({
      uniforms: fallU, transparent: true, depthWrite: false, side: T.DoubleSide, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: [
        'uniform float uT; uniform float uA; uniform vec3 uCol; varying vec2 vUv;',
        'float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }',
        'float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y); }',
        'void main(){',
        '  vec2 u=vUv;',
        '  float s=n(vec2(u.x*26.,u.y*3.+uT*2.2))*.6+n(vec2(u.x*60.,u.y*7.+uT*3.6))*.4;',
        '  float side=smoothstep(0.,.16,u.x)*smoothstep(1.,.84,u.x);',
        '  float a=(.3+.6*s)*side*smoothstep(1.,.86,u.y);',
        '  vec3 col=uCol*(.16+.5*pow(s,1.8));',
        '  col+=vec3(.6,.75,.9)*smoothstep(.1,0.,u.y)*.35;',
        '  gl_FragColor=vec4(col,a*uA*.8);',
        '  #include <encodings_fragment>',
        '}',
      ].join('\n'),
    });
    fall = new T.Mesh(new T.PlaneGeometry(3.3, 9.4, 1, 1), fm);
    fall.position.set(0, 4.7, -2.6);
    cliff.add(fall);
    // bóng của vách và thác trên mặt nước
    const mir = cliff.clone(); mir.scale.y = -1; S.cliffMirror = mir; scene.add(mir);

    // đá rải quanh hồ
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1;
      put(geos[i % 3], side * rand(1.0, 1.25), 0.05, rand(-0.9, 1.05), rand(0.5, 1.5), rand(0.35, 1.1), rand(0.5, 1.5), i * 0.9).userData.edge = true;
    }
    // lá sen
    const pg = new T.CircleGeometry(1, 20, 0.35, TAU - 0.7);
    pads = new T.InstancedMesh(pg, new T.MeshStandardMaterial({ color: 0x1f5a3c, roughness: 0.7, metalness: 0, side: T.DoubleSide }), 60);
    pads.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(pads);
    // núi xa
    mounts = new T.Group(); scene.add(mounts);
    for (let L = 0; L < 3; L++) {
      const sh = new T.Shape(); sh.moveTo(-260, 0);
      let x = -260, s = 7 + L * 13;
      const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      while (x < 260) { x += 12 + rnd() * 26; sh.lineTo(x, (10 + rnd() * 26) * (1 + L * 0.5)); }
      sh.lineTo(260, 0);
      const m = new T.Mesh(new T.ShapeGeometry(sh), new T.MeshBasicMaterial({ color: 0x0a1424, fog: true }));
      m.position.set(0, -1, -70 - L * 45);
      mounts.add(m);
    }
  }
  function placeShore() {
    // dời vách, thác và đá theo kích thước hồ hiện tại
    const zf = -S.D / 2;
    cliff.position.set(0, 0, zf - 1.9);
    S.cliffMirror.position.copy(cliff.position);
    let k = 0;
    rocks.children.forEach((m) => {
      if (!m.userData.edge) return;
      const side = m.position.x > 0 ? 1 : -1;
      if (m.userData.ux == null) { m.userData.ux = Math.abs(m.position.x); m.userData.uz = m.position.z; }
      m.position.x = side * (S.Wd / 2 + 2.3) * m.userData.ux;
      m.position.z = m.userData.uz * (S.D / 2 + 1.5);
      k++;
    });
  }
  function scatterPads(stars) {
    const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p = new T.Vector3();
    const e = new T.Euler();
    let n = 0, guard = 0;
    while (n < 60 && guard++ < 900) {
      const x = rand(-S.Wd / 2 - 3.5, S.Wd / 2 + 3.5), z = rand(-S.D / 2 - 0.5, S.D / 2 + 3);
      let ok = true;
      if (stars) for (const s of stars) { if (Math.hypot(s.wx - x, s.wz - z) < 1.15) { ok = false; break; } }
      if (Math.abs(x) < 1.6 && z < -S.D / 2 + 1.2) ok = false;
      if (!ok) continue;
      const r = rand(0.16, 0.42);
      e.set(-Math.PI / 2, 0, rand(0, TAU)); q.setFromEuler(e);
      p.set(x, 0.012 + n * 0.0004, z); sc.set(r, r, r);
      m4.compose(p, q, sc); pads.setMatrixAt(n, m4); n++;
    }
    pads.count = n; pads.instanceMatrix.needsUpdate = true;
  }

  /* ---------- cổng Vũ Môn ---------- */
  let gate, gateMirror, veil, sealOrbs = [];
  const veilU = { uT: { value: 0 }, uP: { value: 0.1 }, uOpen: { value: 0 }, uCol: { value: C('#9fd2ff') } };
  function buildGate() {
    gate = new T.Group();
    const red = new T.MeshStandardMaterial({ color: 0x8e1d14, roughness: 0.42, metalness: 0.08 });
    const wood = new T.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.7 });
    const tile = new T.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.6, metalness: 0.1 });
    const gold = new T.MeshStandardMaterial({ color: 0xd9a63a, roughness: 0.3, metalness: 0.85, emissive: 0x3a2204, emissiveIntensity: 0.6 });
    const stone = new T.MeshStandardMaterial({ color: 0x4a5261, roughness: 0.9, flatShading: true });
    for (const sx of [-1, 1]) {
      const pil = new T.Mesh(new T.CylinderGeometry(0.15, 0.19, 3.3, 14), red); pil.position.set(sx * 1.38, 1.65, 0); gate.add(pil);
      const base = new T.Mesh(new T.CylinderGeometry(0.3, 0.36, 0.4, 8), stone); base.position.set(sx * 1.38, 0.1, 0); gate.add(base);
      const cap = new T.Mesh(new T.CylinderGeometry(0.2, 0.17, 0.14, 14), gold); cap.position.set(sx * 1.38, 3.0, 0); gate.add(cap);
      const out = new T.Mesh(new T.CylinderGeometry(0.1, 0.12, 2.3, 10), red); out.position.set(sx * 2.25, 1.15, 0); gate.add(out);
      const ob = new T.Mesh(new T.CylinderGeometry(0.2, 0.25, 0.3, 8), stone); ob.position.set(sx * 2.25, 0.08, 0); gate.add(ob);
    }
    const beam = new T.Mesh(new T.BoxGeometry(5.2, 0.2, 0.3), wood); beam.position.set(0, 2.2, 0); gate.add(beam);
    const beam2 = new T.Mesh(new T.BoxGeometry(3.5, 0.22, 0.34), red); beam2.position.set(0, 2.86, 0); gate.add(beam2);
    // mái cong hai tầng
    const roof = (w, y, d, lift) => {
      const sh = new T.Shape();
      sh.moveTo(-w, lift); sh.quadraticCurveTo(-w * 0.55, 0.02, 0, 0.12); sh.quadraticCurveTo(w * 0.55, 0.02, w, lift);
      sh.lineTo(w * 0.93, lift + 0.16); sh.quadraticCurveTo(w * 0.5, 0.3, 0, 0.5); sh.quadraticCurveTo(-w * 0.5, 0.3, -w * 0.93, lift + 0.16);
      sh.closePath();
      const g = new T.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 14 });
      const m = new T.Mesh(g, tile); m.position.set(0, y, -d / 2); gate.add(m);
      const rg = new T.Mesh(new T.BoxGeometry(w * 1.3, 0.06, 0.08), gold); rg.position.set(0, y + 0.5, 0); gate.add(rg);
    };
    roof(2.25, 3.05, 0.9, 0.42);
    roof(3.05, 2.32, 0.7, 0.36);
    const plaque = new T.Mesh(new T.BoxGeometry(0.9, 0.36, 0.06), gold); plaque.position.set(0, 2.55, 0.2); gate.add(plaque);
    // màn sáng giữa hai cột
    veil = new T.Mesh(new T.PlaneGeometry(2.5, 2.9), new T.ShaderMaterial({
      uniforms: veilU, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: [
        'uniform float uT; uniform float uP; uniform float uOpen; uniform vec3 uCol; varying vec2 vUv;',
        'void main(){',
        '  vec2 c=vUv-.5; float r=length(c*vec2(1.,.9)); float a=atan(c.y,c.x);',
        '  float sw=sin(a*3.+r*13.-uT*1.6)*.5+.5;',
        '  float sw2=sin(a*5.-r*20.+uT*2.3)*.5+.5;',
        '  float m=smoothstep(.5,.1,r);',
        '  float e=(.1+.5*uP+uOpen*1.4);',
        '  vec3 col=mix(uCol,vec3(1.,.86,.55),sw2*.6)*(.25+.75*pow(sw,2.))*m*e;',
        '  col+=vec3(1.,.95,.8)*smoothstep(.22,0.,r)*(.15+uOpen*1.6+uP*.3);',
        '  gl_FragColor=vec4(col,1.);',
        '  #include <encodings_fragment>',
        '}',
      ].join('\n'),
    }));
    veil.position.set(0, 1.45, 0); gate.add(veil);
    for (let i = 0; i < 3; i++) {
      const o = new T.Mesh(new T.OctahedronGeometry(0.13), new T.MeshStandardMaterial({ color: 0x2c8a70, roughness: 0.25, metalness: 0.3, emissive: 0xffd070, emissiveIntensity: 0 }));
      o.position.set((i - 1) * 0.55, 1.95, 0.22); gate.add(o); sealOrbs.push(o);
    }
    scene.add(gate);
    gateMirror = gate.clone(); gateMirror.scale.y = -1; scene.add(gateMirror);
  }

  /* ---------- hiệu ứng 3D: bụi nước, vòng sóng, quả cầu vận, đèn trời ---------- */
  const NP = 520;
  let pGeo, pPts, pData = [], pNext = 0;
  const orbs = [], waves = [], lifts = [];
  let marker, markerGlow, hoverRing;
  function buildFx() {
    pGeo = new T.BufferGeometry();
    const pos = new Float32Array(NP * 3), col = new Float32Array(NP * 3), size = new Float32Array(NP);
    for (let i = 0; i < NP; i++) { pos[i * 3 + 1] = -99; pData.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, s: 1 }); }
    pGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
    pGeo.setAttribute('color', new T.BufferAttribute(col, 3));
    pGeo.setAttribute('aSize', new T.BufferAttribute(size, 1));
    pPts = new T.Points(pGeo, new T.ShaderMaterial({
      uniforms: { uMap: { value: glowTex }, uPx: { value: 1 } },
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true, fog: false,
      vertexShader: 'attribute float aSize; uniform float uPx; varying vec3 vC; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=aSize*uPx/max(.1,-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D uMap; varying vec3 vC; void main(){ vec4 t=texture2D(uMap,gl_PointCoord); gl_FragColor=vec4(vC*t.a,1.);\n#include <encodings_fragment>\n}',
    }));
    pPts.frustumCulled = false; pPts.renderOrder = 6;
    scene.add(pPts);

    for (let i = 0; i < 48; i++) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffd070, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
      sp.visible = false; sp.renderOrder = 5; scene.add(sp);
      orbs.push({ sp, t: 0, dur: 0, on: false, ax: 0, az: 0, bx: 0, bz: 0 });
    }
    const wg = new T.RingGeometry(0.92, 1, 64);
    for (let i = 0; i < 14; i++) {
      const m = new T.Mesh(wg, new T.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 3; scene.add(m);
      waves.push({ m, t: 0, dur: 0, r0: 0, r1: 1, on: false });
    }
    const lg = new T.CylinderGeometry(0.15, 0.1, 0.3, 8, 1, true);
    for (let i = 0; i < 34; i++) {
      const g = new T.Group();
      const body = new T.Mesh(lg, new T.MeshBasicMaterial({ color: 0xffa040, side: T.DoubleSide, transparent: true, opacity: 0.95, fog: false }));
      const gl = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffb050, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
      gl.scale.set(1.1, 1.1, 1);
      g.add(body); g.add(gl); g.visible = false; scene.add(g);
      lifts.push({ g, body, gl, on: false, t: 0, vx: 0, vy: 0, vz: 0, ph: 0 });
    }
    marker = new T.Mesh(new T.SphereGeometry(0.075, 12, 10), new T.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    markerGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    markerGlow.scale.set(0.9, 0.9, 1); marker.add(markerGlow);
    marker.visible = false; marker.renderOrder = 7; scene.add(marker);
  }
  const COLS = {
    gold: [1, 0.78, 0.36], amber: [1, 0.55, 0.2], white: [1, 1, 1], ice: [0.62, 0.78, 1], jade: [0.35, 0.95, 0.75],
    rose: [1, 0.33, 0.5], violet: [0.62, 0.42, 1], red: [1, 0.26, 0.26], sky: [0.58, 0.86, 1], water: [0.42, 0.55, 0.7],
  };
  S.spray = function (x, y, z, color, n, speed, opt) {
    opt = opt || {};
    const c = COLS[color] || COLS.water;
    const pos = pGeo.attributes.position.array, col = pGeo.attributes.color.array, size = pGeo.attributes.aSize.array;
    for (let i = 0; i < n; i++) {
      const k = pNext; pNext = (pNext + 1) % NP;
      const a = Math.random() * TAU, up = opt.up != null ? opt.up : 1, sp = speed * (0.35 + Math.random() * 0.8);
      const d = pData[k];
      d.vx = Math.cos(a) * sp * (opt.flat != null ? opt.flat : 0.55); d.vz = Math.sin(a) * sp * (opt.flat != null ? opt.flat : 0.55);
      d.vy = sp * up * (0.5 + Math.random() * 0.8);
      d.g = opt.g != null ? opt.g : 7; d.life = 0; d.max = (opt.life || 0.9) * (0.6 + Math.random() * 0.7); d.s = (opt.size || 0.22) * (0.6 + Math.random() * 0.9);
      d.r = c[0]; d.gc = c[1]; d.b = c[2];
      pos[k * 3] = x + (Math.random() - 0.5) * (opt.spread || 0.15); pos[k * 3 + 1] = y; pos[k * 3 + 2] = z + (Math.random() - 0.5) * (opt.spread || 0.15);
      col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
      size[k] = d.s;
    }
  };
  S.splash = function (x, z, power) {
    const p = power == null ? 1 : power;
    S.spray(x, 0.05, z, 'water', Math.round(16 * p), 3.2 * Math.sqrt(p), { up: 1.25, life: 0.7, size: 0.15 });
    S.ripple(x, z, 1.3 * p);
  };
  S.wave = function (x, z, color, r0, r1, dur) {
    for (const w of waves) {
      if (w.on) continue;
      const c = COLS[color] || COLS.gold;
      w.on = true; w.t = 0; w.dur = dur; w.r0 = r0; w.r1 = r1;
      w.m.material.color.setRGB(c[0], c[1], c[2]);
      w.m.position.set(x, 0.03, z); w.m.visible = true;
      return;
    }
  };
  S.orb = function (ax, az, bx, bz, color, dur) {
    for (const o of orbs) {
      if (o.on) continue;
      const c = COLS[color] || COLS.gold;
      o.on = true; o.t = 0; o.dur = dur; o.ax = ax; o.az = az; o.bx = bx; o.bz = bz;
      o.sp.material.color.setRGB(c[0], c[1], c[2]); o.sp.visible = true;
      return;
    }
  };
  // đèn trời bay lên từ một ngọn hoa đăng
  S.lift = function (x, z, delay) {
    for (const l of lifts) {
      if (l.on) continue;
      l.on = true; l.t = -(delay || 0); l.ph = Math.random() * TAU;
      l.g.position.set(x, 0.4, z); l.vx = rand(-0.25, 0.25); l.vz = rand(-0.5, -0.1); l.vy = rand(0.9, 1.5);
      l.g.visible = false; l.g.scale.setScalar(0.01);
      return;
    }
  };

  /* ---------- đèn hoa đăng ---------- */
  let lanternGroup, edgePts = null, edgeInfo = [];
  const lanterns = [];
  const ringU0 = () => ({
    uP: { value: 0.5 }, uArc: { value: 0 }, uCol: { value: C('#ffd070') }, uA: { value: 1 }, uRoll: { value: 0 }, uHid: { value: 0 },
    uRes: { value: 0 }, uT: { value: 0 }, uPulse: { value: 0 }, uIn: { value: 0.5 }, uOut: { value: 0.72 },
  });
  function oddsColor(p, out) {
    let h, l = 0.56;
    if (p < 0.6) h = lerp(8, 44, p / 0.6); else { h = lerp(44, 152, Math.pow((p - 0.6) / 0.4, 1.6)); l = 0.52; }
    out.setHSL(h / 360, 0.95, l);
    return out;
  }
  function makeLantern(s) {
    const def = TYPES[s.type] || TYPES.normal;
    const isGate = s.type === 'gate';
    const g = new T.Group();
    const L = { s, g, def, isGate, open: 0, lit: 0, sink: 0, born: 0, flick: Math.random() * 10 };
    const R = isGate ? 1.0 : S.ringR * (def.scale > 1.2 ? 1.1 : 1);
    L.R = R;
    // vành tỉ lệ
    const ru = ringU0(); ru.uIn.value = R - 0.075; ru.uOut.value = R + 0.075;
    if (isGate) { ru.uIn.value = R - 0.1; ru.uOut.value = R + 0.1; }
    L.ringU = ru;
    L.ring = new T.Mesh(isGate ? S.gateRingGeo : ringGeo, new T.ShaderMaterial({ uniforms: ru, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, side: T.DoubleSide, fog: false }));
    L.ring.rotation.x = -Math.PI / 2; L.ring.position.y = 0.035; L.ring.renderOrder = 3;
    g.add(L.ring);
    if (!isGate) {
      if (!geoCache[s.type]) geoCache[s.type] = lotusGeo(def);
      L.flower = new T.Group();
      L.mat = new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: 0.5, metalness: def.metal || 0, emissive: C(def.glow), emissiveIntensity: 0.04 });
      L.petals = new T.Mesh(geoCache[s.type], L.mat);
      L.flower.add(L.petals);
      L.pad = new T.Mesh(padGeo, S.padMat); L.pad.rotation.x = -Math.PI / 2; L.pad.position.y = 0.012; L.pad.rotation.z = Math.random() * TAU;
      g.add(L.pad);
      L.core = new T.Mesh(coreGeo, new T.MeshBasicMaterial({ color: C(def.glow).multiplyScalar(0.8), fog: false }));
      L.core.position.y = 0.2; L.core.visible = false; L.flower.add(L.core);
      L.flame = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: C(def.glow), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0, fog: false }));
      L.flame.position.y = 0.26; L.flame.scale.set(1.5, 1.5, 1); L.flame.renderOrder = 5; L.flower.add(L.flame);
      L.flower.scale.setScalar(def.scale);
      g.add(L.flower);
      // bóng đèn kéo dài trên mặt nước
      L.streak = new T.Mesh(streakGeo, new T.MeshBasicMaterial({ map: softTex, color: C(def.glow), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
      L.streak.rotation.x = -Math.PI / 2; L.streak.position.set(0, 0.02, 1.25); L.streak.renderOrder = 2;
      g.add(L.streak);
      L.pool = new T.Mesh(S.poolGeo, new T.MeshBasicMaterial({ map: softTex, color: C(def.glow), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
      L.pool.rotation.x = -Math.PI / 2; L.pool.position.y = 0.018; L.pool.renderOrder = 2;
      g.add(L.pool);
      // bản soi ngược của hoa để làm bóng dưới nước
      L.mirror = new T.Mesh(geoCache[s.type], L.mat); L.mirror.scale.set(def.scale, -def.scale, def.scale); L.mirror.position.y = -0.02;
      g.add(L.mirror);
      // xoáy nước khi đèn tắt
      L.whirlU = { uT: { value: 0 }, uA: { value: 0 } };
      L.whirl = new T.Mesh(discGeo, new T.ShaderMaterial({ uniforms: L.whirlU, vertexShader: RING_VS, fragmentShader: WHIRL_FS, transparent: true, depthWrite: false, fog: false }));
      L.whirl.rotation.x = -Math.PI / 2; L.whirl.position.y = 0.03; L.whirl.visible = false; L.whirl.renderOrder = 2;
      g.add(L.whirl);
      if (iconTex[s.type]) {
        L.icon = new T.Sprite(new T.SpriteMaterial({ map: iconTex[s.type], transparent: true, depthWrite: false, fog: false }));
        L.icon.scale.set(0.42, 0.42, 1); L.icon.position.y = 0.95; L.icon.renderOrder = 8;
        g.add(L.icon);
      }
    }
    g.position.set(s.wx, 0, s.wz);
    lanternGroup.add(g);
    return L;
  }

  S.setLevel = function (stars, edges) {
    if (!S.ok) return;
    if (lanternGroup) { scene.remove(lanternGroup); lanternGroup.traverse((o) => { if (o.material && o.material !== S.padMat && o.material.dispose && !o.userData.keep) { /* vật liệu riêng của từng đèn */ o.material.dispose(); } }); }
    lanternGroup = new T.Group(); scene.add(lanternGroup);
    lanterns.length = 0;
    lampPool.forEach((p) => { p.id = -1; p.k = 0; p.l.intensity = 0; });
    if (!padGeo) {
      padGeo = new T.CircleGeometry(0.46, 22, 0.3, TAU - 0.6);
      S.padMat = new T.MeshStandardMaterial({ color: 0x215c40, roughness: 0.7, side: T.DoubleSide });
      ringGeo = new T.RingGeometry(S.ringR - 0.075, S.ringR + 0.075, 72, 1);
      S.gateRingGeo = new T.RingGeometry(0.9, 1.1, 96, 1);
      discGeo = new T.CircleGeometry(0.82, 40);
      streakGeo = new T.PlaneGeometry(0.85, 2.6);
      S.poolGeo = new T.PlaneGeometry(3.4, 3.4);
      coreGeo = new T.SphereGeometry(0.07, 10, 8);
    }
    for (const s of stars) lanterns.push(makeLantern(s));
    // dây đèn nối giữa các ngọn hoa đăng
    if (edgePts) { scene.remove(edgePts); edgePts.geometry.dispose(); edgePts = null; }
    edgeInfo = [];
    const pos = [], aT = [], aSt = [];
    edges.forEach((e) => {
      const a = stars[e.a], b = stars[e.b];
      const dx = b.wx - a.wx, dz = b.wz - a.wz, len = Math.hypot(dx, dz);
      const ra = (a.type === 'gate' ? 1.15 : S.ringR + 0.16), rb = (b.type === 'gate' ? 1.15 : S.ringR + 0.16);
      const usable = len - ra - rb;
      const n = Math.max(2, Math.round(usable / 0.3));
      const start = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const t = (ra + usable * (i / n)) / len;
        pos.push(a.wx + dx * t, 0.05, a.wz + dz * t); aT.push(i / n); aSt.push(0);
      }
      edgeInfo.push({ a: e.a, b: e.b, start, count: n + 1 });
    });
    if (pos.length) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('aT', new T.Float32BufferAttribute(aT, 1));
      g.setAttribute('aSt', new T.Float32BufferAttribute(aSt, 1));
      edgePts = new T.Points(g, new T.ShaderMaterial({
        uniforms: { uMap: { value: glowTex }, uPx: { value: 1 }, uT: { value: 0 }, uA: { value: 1 } },
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
        vertexShader: [
          'attribute float aT; attribute float aSt; uniform float uPx; uniform float uT; varying vec3 vC; varying float vA;',
          'void main(){',
          '  float st=aSt; vec3 c=vec3(.55,.7,1.); float a=.5; float sz=.14;',
          '  float tt=aT;',
          '  if(st>3.5){ c=vec3(.6,.4,1.); a=.2; sz=.09; }',
          '  else if(st>2.5){ tt=1.-aT; }',
          '  if(st>1.5 && st<3.5){ float w=fract(tt-uT*.55); float pulse=smoothstep(.7,1.,w)+smoothstep(.12,0.,w); c=mix(vec3(1.,.62,.22),vec3(.55,.7,1.),tt); a=.3+.3*(1.-tt)+pulse*.6; sz=.12+pulse*.08; }',
          '  else if(st>.5 && st<1.5){ float w=sin(aT*9.-uT*3.)*.5+.5; c=vec3(1.,.62,.22); a=.55+.35*w; sz=.13+.04*w; }',
          '  vC=c; vA=a;',
          '  vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=sz*uPx/max(.1,-mv.z); gl_Position=projectionMatrix*mv;',
          '}',
        ].join('\n'),
        fragmentShader: 'uniform sampler2D uMap; uniform float uA; varying vec3 vC; varying float vA; void main(){ vec4 t=texture2D(uMap,gl_PointCoord); gl_FragColor=vec4(vC*t.a*vA*uA,1.);\n#include <encodings_fragment>\n}',
      }));
      edgePts.frustumCulled = false; edgePts.renderOrder = 2;
      scene.add(edgePts);
    }
    scatterPads(stars);
  };
  S.clearLevel = function () {
    if (lanternGroup) { scene.remove(lanternGroup); lanternGroup = null; }
    if (edgePts) { scene.remove(edgePts); edgePts = null; }
    lanterns.length = 0; edgeInfo = [];
    lampPool.forEach((p) => { p.id = -1; p.k = 0; p.l.intensity = 0; });
  };

  function claimLamp(L) {
    let best = null;
    for (const p of lampPool) { if (p.id === L.s.id) return; }
    for (const p of lampPool) { if (p.id < 0) { best = p; break; } }
    if (!best) { best = lampPool[0]; for (const p of lampPool) if (p.stamp < best.stamp) best = p; }
    best.id = L.s.id; best.stamp = S.time; best.k = 0;
    best.l.color.set(L.def.glow); best.l.position.set(L.s.wx, 1.5, L.s.wz);
  }

  const tmpCol = new T.Color();
  function updateLanterns(dt, atime) {
    const t = S.time;
    for (const L of lanterns) {
      const s = L.s;
      const age = atime - s.born;
      if (age < 0) { L.g.visible = false; continue; }
      if (!L.g.visible) { L.g.visible = true; S.ripple(s.wx, s.wz, 0.6); }
      const pop = age < 0.5 ? easeOutBack(age / 0.5) : 1;
      const wa = S.worldA;
      // vành
      const u = L.ringU;
      u.uT.value = t; u.uP.value = clamp(s.p, 0, 1); u.uArc.value = s.arc; u.uRoll.value = s.rolling ? 1 : 0;
      u.uHid.value = s.hidden && !s.rolling ? 1 : 0; u.uRes.value = s.p < 1 ? Math.min(s.rescue || 0, 1 - s.p) : 0;
      u.uPulse.value = s.pulse + (S.hover === s.id ? 0.35 : 0) + (s.clover ? 0.25 + 0.2 * Math.sin(t * 6) : 0);
      oddsColor(s.p, u.uCol.value);
      const ringOn = s.state === 'dormant' ? 1 : 0;
      L.ringA = lerp(L.ringA == null ? 0 : L.ringA, ringOn, Math.min(1, dt * 7));
      u.uA.value = L.ringA * wa * Math.min(1, age / 0.4);
      L.ring.visible = u.uA.value > 0.01;
      L.ring.scale.setScalar(pop * (S.hover === s.id && s.state === 'dormant' ? 1.06 : 1));
      if (L.isGate) continue;

      const litT = s.state === 'lit' ? 1 : 0, voidT = s.state === 'void' ? 1 : 0;
      L.lit = lerp(L.lit, litT, Math.min(1, dt * 6));
      L.sink = lerp(L.sink, voidT, Math.min(1, dt * 2.6));
      const since = t - s.litT;
      const bloom = s.state === 'lit' ? (since < 0.7 ? easeOutBack(clamp(since / 0.7, 0, 1)) : 1) : 0;
      L.open = lerp(L.open, s.state === 'lit' ? 1 : (s.rolling ? 0.35 : 0.12), Math.min(1, dt * 5));
      const op = s.state === 'lit' ? Math.max(L.open, bloom) : L.open;
      const bob = Math.sin(t * 1.3 + L.flick) * 0.012;
      const sc = L.def.scale * pop * (1 - L.sink * 0.65);
      const xz = lerp(0.74, 1, op), yy = lerp(1.18, 1, op);
      L.flower.scale.set(sc * xz, sc * yy, sc * xz);
      L.flower.position.y = bob - L.sink * 0.55;
      L.flower.rotation.y = L.flick + t * 0.05 + (s.shake > 0 ? Math.sin(t * 60) * 0.1 * s.shake : 0) + L.sink * 2.5;
      L.flower.visible = L.sink < 0.97;
      L.mirror.visible = L.flower.visible;
      L.mirror.scale.set(sc * xz, -sc * yy, sc * xz); L.mirror.position.y = -0.02 - bob + L.sink * 0.55; L.mirror.rotation.y = L.flower.rotation.y;
      L.pad.visible = L.sink < 0.6; L.pad.scale.setScalar(pop);
      const fl = 0.86 + 0.14 * Math.sin(t * 9 + L.flick * 7) * Math.sin(t * 5.3 + L.flick);
      L.mat.emissiveIntensity = (0.14 + L.lit * 0.36 * fl + (s.rolling ? 0.12 : 0) + s.pulse * 0.16) * (1 - L.sink);
      { const dk = 1 - L.sink * 0.75; L.mat.color.setRGB(dk, dk * lerp(1, 0.86, L.lit), dk * lerp(1, 0.66, L.lit)); }
      L.core.visible = L.lit > 0.3;
      L.flame.material.opacity = L.lit * fl * 0.5 * wa;
      const fs = (0.62 + 0.1 * fl + (since < 0.5 ? (1 - since / 0.5) * 1.1 : 0));
      L.flame.scale.set(fs, fs, 1);
      L.flame.visible = L.lit > 0.02;
      L.streak.material.opacity = L.lit * 0.2 * fl * wa;
      L.streak.visible = L.lit > 0.02;
      L.pool.material.opacity = L.lit * 0.3 * fl * wa;
      L.pool.visible = L.lit > 0.02;
      if (L.sink > 0.02) {
        L.whirl.visible = true; L.whirlU.uT.value = t + L.flick; L.whirlU.uA.value = Math.min(1, L.sink * 1.4) * wa;
        L.whirl.scale.setScalar(0.4 + 0.6 * Math.min(1, L.sink * 1.5));
      } else L.whirl.visible = false;
      if (L.icon) {
        L.icon.visible = s.state !== 'void';
        L.icon.position.y = 0.9 + Math.sin(t * 1.6 + L.flick) * 0.04 + op * 0.1;
        L.icon.material.opacity = (s.state === 'lit' ? 0.55 : 1) * wa * Math.min(1, age / 0.5);
        const is = 0.4 * pop; L.icon.scale.set(is, is, 1);
      }
      if (s.omen && Math.random() < dt * 22) S.spray(s.wx, 0.5, s.wz, 'gold', 1, 2.2, { up: 0.8, life: 0.3, size: 0.16, g: 0 });
      if (s.state === 'lit' && since < 0.05 && !L.claimed) { L.claimed = true; claimLamp(L); }
      if (s.state === 'lit' && Math.random() < dt * 0.9) S.spray(s.wx, 0.35, s.wz, L.def === TYPES.normal ? 'gold' : 'white', 1, 0.5, { up: 1.2, life: 1.4, size: 0.1, g: -0.25, flat: 0.5 });
      if (s.state === 'void' && Math.random() < dt * 3) {
        const a = Math.random() * TAU; S.spray(s.wx + Math.cos(a) * 0.8, 0.06, s.wz + Math.sin(a) * 0.8, 'violet', 1, 0.2, { up: 0.1, life: 0.6, size: 0.11, g: 0 });
      }
    }
    // đèn điểm cho mấy ngọn mới thắp
    for (const p of lampPool) {
      if (p.id < 0) continue;
      p.k = Math.min(1, p.k + dt * 3);
      p.l.intensity = p.k * 0.7 * S.worldA;
    }
    // dây đèn
    if (edgePts) {
      const st = edgePts.geometry.attributes.aSt;
      for (const e of edgeInfo) {
        const a = lanterns[e.a].s, b = lanterns[e.b].s;
        let v = 0;
        if (a.state === 'void' || b.state === 'void') v = 4;
        else if (a.state === 'lit' && b.state === 'lit') v = 1;
        else if (a.state === 'lit') v = 2;
        else if (b.state === 'lit') v = 3;
        if (e.v !== v) { e.v = v; for (let i = 0; i < e.count; i++) st.array[e.start + i] = v; st.needsUpdate = true; }
        const vis = Math.min(clamp((atime - a.born) / 0.4, 0, 1), clamp((atime - b.born) / 0.4, 0, 1));
        if (vis <= 0 && e.v !== -1) { for (let i = 0; i < e.count; i++) st.array[e.start + i] = 5; st.needsUpdate = true; e.v = -1; }
      }
      edgePts.material.uniforms.uT.value = t;
      edgePts.material.uniforms.uA.value = S.worldA;
    }
    // viên ngọc chỉ kim lúc đang quay
    let rolling = null;
    for (const L of lanterns) if (L.s.rolling) { rolling = L; break; }
    if (rolling) {
      const s = rolling.s;
      marker.visible = true;
      marker.position.set(s.wx + Math.cos(s.mark) * rolling.R, 0.09, s.wz + Math.sin(s.mark) * rolling.R);
      const c = s.result === 1 ? COLS.gold : s.result === -1 ? COLS.rose : COLS.white;
      markerGlow.material.color.setRGB(c[0], c[1], c[2]);
      marker.material.color.setRGB(c[0], c[1], c[2]);
    } else marker.visible = false;
  }

  /* ---------- cá chép ---------- */
  const SKINS = {
    kohaku: { name: 'Kohaku', body: '#fff3e2', a: '#f0401e', b: '#ff8a3a', fin: '#ffd9c2', seed: 3 },
    sanke:  { name: 'Tam Sắc', body: '#fff6ea', a: '#e8341c', b: '#161616', fin: '#f6e3d6', seed: 9 },
    showa:  { name: 'Mặc Ngọc', body: '#1b1b1f', a: '#e8341c', b: '#f6efe6', fin: '#58585e', seed: 14 },
    ogon:   { name: 'Hoàng Kim', body: '#ffcf5a', a: '#ffe9a0', b: '#e09a16', fin: '#ffe6a8', seed: 21, metal: 0.75 },
    asagi:  { name: 'Thanh Y', body: '#7f9fc8', a: '#3b5d91', b: '#e85a2a', fin: '#f0a070', seed: 27 },
    tancho: { name: 'Đan Đỉnh', body: '#ffffff', a: '#e02418', b: '#ffffff', fin: '#f2f2f2', seed: 33, tancho: true },
    ngoc:   { name: 'Ngọc Bích', body: '#d9fff0', a: '#2fc487', b: '#0e7a5a', fin: '#b6f5dd', seed: 41 },
    hacam:  { name: 'Hắc Cẩm', body: '#101018', a: '#ffd070', b: '#7a4cf0', fin: '#3a3050', seed: 52, metal: 0.4 },
  };
  S.SKINS = SKINS;
  const STAGES = [
    { n: 15, seg: 0.165, w: 0.2, horn: 0, barb: 0.22, mane: 0 },
    { n: 19, seg: 0.172, w: 0.215, horn: 0.2, barb: 0.36, mane: 0 },
    { n: 25, seg: 0.18, w: 0.23, horn: 0.36, barb: 0.55, mane: 1 },
    { n: 48, seg: 0.21, w: 0.33, horn: 0.6, barb: 0.9, mane: 1 },
  ];
  const NR = 12;
  const koi = {
    stage: 0, skin: 'kohaku', pts: [], x: 0, y: -0.16, z: 0, a: -Math.PI / 2, v: 0, depth: -0.16,
    mode: 'wander', anchor: { x: 0, z: 0 }, phase: 0, alpha: 1, seed: Math.random() * 10, hurt: 0, big: 1, wr: 1, pearl: false,
    sx: 0, sy: 0, air: false,
  };
  S.koi = koi;
  let koiGroup, koiBody, koiFins, koiHead, koiMat, finMat, koiEyes = [], koiHorns = [], koiBarbs = [], koiPearl, koiLight, koiGlow;
  function buildKoi() {
    koiGroup = new T.Group(); koiGroup.renderOrder = 4; scene.add(koiGroup);
    koiMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05, emissive: 0x3a2a22, emissiveIntensity: 0.5, transparent: true });
    finMat = new T.MeshStandardMaterial({ color: 0xffd9c2, roughness: 0.5, side: T.DoubleSide, transparent: true, opacity: 0.72, emissive: 0x7a5a48, emissiveIntensity: 0.5, depthWrite: false });
    koiBody = new T.Mesh(new T.BufferGeometry(), koiMat); koiBody.frustumCulled = false; koiBody.renderOrder = 4;
    koiFins = new T.Mesh(new T.BufferGeometry(), finMat); koiFins.frustumCulled = false; koiFins.renderOrder = 4;
    koiGroup.add(koiBody); koiGroup.add(koiFins);
    koiHead = new T.Group(); koiGroup.add(koiHead);
    const eyeM = new T.MeshBasicMaterial({ color: 0x0a0606 });
    for (const sd of [-1, 1]) { const e = new T.Mesh(new T.SphereGeometry(0.034, 8, 6), eyeM); koiHead.add(e); koiEyes.push(e); e.userData.side = sd; }
    const hornM = new T.MeshStandardMaterial({ color: 0xffe9bd, roughness: 0.4, emissive: 0x6a5020, emissiveIntensity: 0.6 });
    for (const sd of [-1, 1]) { const h = new T.Mesh(new T.ConeGeometry(0.035, 1, 6), hornM); koiHead.add(h); koiHorns.push(h); h.userData.side = sd; }
    const barbM = new T.MeshBasicMaterial({ color: 0xfff0d2 });
    for (const sd of [-1, 1]) { const b = new T.Mesh(new T.CylinderGeometry(0.008, 0.004, 1, 5), barbM); koiHead.add(b); koiBarbs.push(b); b.userData.side = sd; }
    koiPearl = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xdff4ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    koiPearl.visible = false; koiGroup.add(koiPearl);
    koiGlow = new T.Sprite(new T.SpriteMaterial({ map: softTex, color: 0xffc890, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.22, fog: false }));
    koiGlow.renderOrder = 3; scene.add(koiGlow);
    koiLight = new T.PointLight(0xfff0dc, 1.6, 6, 2); scene.add(koiLight);
    koi.setStage(0);
  }
  function hash1(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
  function buildKoiGeo() {
    const st = STAGES[koi.stage], sk = SKINS[koi.skin] || SKINS.kohaku, n = st.n;
    const rings = n;
    const vcount = rings * NR + 2;
    const pos = new Float32Array(vcount * 3), col = new Float32Array(vcount * 3), idx = [];
    const cb = C(sk.body), ca = C(sk.a), c2 = C(sk.b), tmp = new T.Color();
    const gold = C('#ffd86a'), jade = C('#34d6ac');
    // hoa văn: vài mảng màu trên lưng, rút ngẫu nhiên theo giống cá
    const blobs = [];
    const nb = sk.tancho ? 0 : Math.round(5 + n * 0.28);
    for (let i = 0; i < nb; i++) blobs.push({ u: hash1(sk.seed + i * 3.1) * 0.92 + 0.02, v: (hash1(sk.seed + i * 7.7) - 0.5) * 1.3, r: 0.1 + hash1(sk.seed + i * 1.3) * 0.13, c: hash1(sk.seed + i * 5.9) < 0.68 ? ca : c2 });
    if (sk.tancho) blobs.push({ u: 0.05, v: 0, r: 0.075, c: ca });
    for (let i = 0; i < rings; i++) {
      const u = i / (rings - 1);
      for (let j = 0; j < NR; j++) {
        const ang = j / NR * TAU;                         // 0 = bên phải, PI/2 = lưng
        const top = Math.sin(ang);
        const side = Math.cos(ang);
        tmp.copy(cb);
        if (koi.stage >= 3) { tmp.copy(gold); if (top > 0.2 && (i % 3 === 0)) tmp.lerp(jade, 0.8); if (top < -0.3) tmp.lerp(C('#fff6c8'), 0.6); }
        else {
          for (const b of blobs) {
            const dv = (side * 0.75) - b.v * 0.5, du = (u - b.u) * (n / 15);
            const d = Math.sqrt(du * du * 3.2 + dv * dv * 0.55);
            if (top > -0.2 && d < b.r * 1.7) tmp.copy(b.c);
          }
          if (koi.stage >= 1 && top > 0.75 && i > 2) tmp.lerp(gold, 0.35 + 0.2 * koi.stage);
          if (top < -0.5) tmp.lerp(C('#ffffff'), 0.35);
        }
        col[(i * NR + j) * 3] = tmp.r; col[(i * NR + j) * 3 + 1] = tmp.g; col[(i * NR + j) * 3 + 2] = tmp.b;
      }
      if (i < rings - 1) for (let j = 0; j < NR; j++) {
        const a = i * NR + j, b = i * NR + (j + 1) % NR, c = a + NR, d = b + NR;
        idx.push(a, b, c, b, d, c);
      }
    }
    const nose = rings * NR, tail = nose + 1;
    for (let j = 0; j < NR; j++) { idx.push(nose, (j + 1) % NR, j); idx.push(tail, (rings - 1) * NR + j, (rings - 1) * NR + (j + 1) % NR); }
    tmp.copy(koi.stage >= 3 ? gold : cb);
    col[nose * 3] = tmp.r; col[nose * 3 + 1] = tmp.g; col[nose * 3 + 2] = tmp.b;
    col[tail * 3] = tmp.r; col[tail * 3 + 1] = tmp.g; col[tail * 3 + 2] = tmp.b;
    const g = koiBody.geometry;
    g.dispose();
    const ng = new T.BufferGeometry();
    ng.setAttribute('position', new T.BufferAttribute(pos, 3));
    ng.setAttribute('color', new T.BufferAttribute(col, 3));
    ng.setIndex(idx);
    koiBody.geometry = ng;
    koiMat.metalness = koi.stage >= 3 ? 0.6 : (sk.metal || 0.08);
    koiMat.emissive.set(koi.stage >= 3 ? 0xa87820 : 0x3a2a22);
    finMat.color.set(koi.stage >= 2 ? 0x8ff0d0 : sk.fin);
    finMat.emissive.set(koi.stage >= 2 ? 0x208a70 : 0x6a5448);
    // vây: mỗi vây là một dải tam giác, số đỉnh cố định
    const finTris = 2 * 5 * 2 + 6 + (st.mane ? (n - 6) * 2 : n) + 4 * 2;
    const fg = new T.BufferGeometry();
    fg.setAttribute('position', new T.BufferAttribute(new Float32Array(finTris * 9 + 90), 3));
    koiFins.geometry.dispose(); koiFins.geometry = fg;
  }
  koi.setStage = function (st) {
    koi.stage = st;
    const N = STAGES[st].n;
    while (koi.pts.length < N) { const l = koi.pts[koi.pts.length - 1] || { x: koi.x, y: koi.y, z: koi.z }; koi.pts.push({ x: l.x, y: l.y, z: l.z }); }
    koi.pts.length = N;
    buildKoiGeo();
  };
  koi.setSkin = function (id) { if (!SKINS[id]) id = 'kohaku'; koi.skin = id; buildKoiGeo(); };
  koi.tele = function (x, z, a, y) {
    koi.x = x; koi.z = z; if (a != null) koi.a = a; koi.y = y == null ? koi.depth : y;
    const L = STAGES[koi.stage].seg * koi.big;
    for (let i = 0; i < koi.pts.length; i++) { koi.pts[i].x = x - Math.cos(koi.a) * L * i; koi.pts[i].z = z - Math.sin(koi.a) * L * i; koi.pts[i].y = koi.y; }
  };
  koi.head = function (x, z, a, y) {
    const dx = x - koi.x, dz = z - koi.z;
    koi.v = lerp(koi.v, Math.hypot(dx, dz) * 60, 0.3);
    koi.x = x; koi.z = z; koi.y = y == null ? koi.depth : y;
    if (a != null) koi.a = a; else if (dx * dx + dz * dz > 1e-6) koi.a = Math.atan2(dz, dx);
  };
  function updateKoi(dt) {
    const st = STAGES[koi.stage], big = koi.big;
    if (koi.mode === 'wander') {
      const t = S.time, r = koi.wr;
      const tx = koi.anchor.x + Math.cos(t * 0.5 + koi.seed) * 1.5 * r + Math.cos(t * 0.23) * 0.45;
      const tz = koi.anchor.z + Math.sin(t * 0.83 + koi.seed) * 0.7 * r;
      const dx = tx - koi.x, dz = tz - koi.z, d = Math.hypot(dx, dz);
      let da = Math.atan2(dz, dx) - koi.a;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      koi.a += clamp(da, -3.2 * dt, 3.2 * dt);
      const sp = clamp(d * 1.5, 0.5, 6.5) * (1 - Math.min(0.6, Math.abs(da) * 0.25));
      koi.v = lerp(koi.v, sp, Math.min(1, dt * 4));
      koi.x += Math.cos(koi.a) * koi.v * dt; koi.z += Math.sin(koi.a) * koi.v * dt;
      koi.y = lerp(koi.y, koi.depth, Math.min(1, dt * 4));
    }
    koi.phase += dt * (5 + Math.min(13, koi.v * 2.6));
    koi.hurt = Math.max(0, koi.hurt - dt * 2.2);
    const p = koi.pts, L = st.seg * big;
    if (!p.length) return;
    p[0].x = koi.x; p[0].y = koi.y; p[0].z = koi.z;
    for (let i = 1; i < p.length; i++) {
      const dx = p[i].x - p[i - 1].x, dy = p[i].y - p[i - 1].y, dz = p[i].z - p[i - 1].z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      p[i].x = p[i - 1].x + dx / d * L; p[i].y = p[i - 1].y + dy / d * L; p[i].z = p[i - 1].z + dz / d * L;
      if (!koi.air && p[i].y < koi.depth) p[i].y = lerp(p[i].y, koi.depth, Math.min(1, dt * 6));
    }
    // gợn nước khi bơi nhanh sát mặt
    if (!koi.air && koi.alpha > 0.4 && koi.v > 2.2 && Math.random() < dt * 5) S.ripple(koi.x, koi.z, 0.35);
    meshKoi();
  }
  const kP = [];
  function meshKoi() {
    const st = STAGES[koi.stage], big = koi.big, p = koi.pts, n = p.length;
    const pos = koiBody.geometry.attributes.position.array;
    const amp = (0.035 + Math.min(0.08, koi.v * 0.014)) * big;
    const prof = (k) => (k < 0.16 ? lerp(0.74, 1, 1 - Math.pow(1 - k / 0.16, 3)) : lerp(1, 0.12, Math.pow((k - 0.16) / 0.84, 1.1)));
    const kk = st.n > 30 ? 0.36 : 0.6;
    kP.length = 0;
    for (let i = 0; i < n; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
      let tx = a.x - b.x, ty = a.y - b.y, tz = a.z - b.z;
      const l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1; tx /= l; ty /= l; tz /= l;
      // trục ngang (vuông góc hướng bơi, nằm trên mặt nước) và trục lưng
      let nx = -tz, nz = tx; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const ux = -ty * nz, uy = tx * nz - tz * nx, uz = ty * nx;      // u = n × t: hướng lên lưng
      const k = i / (n - 1);
      const wig = Math.sin(koi.phase - i * kk) * amp * (0.15 + k * 1.15);
      const cx = p[i].x + nx * wig, cy = p[i].y, cz = p[i].z + nz * wig;
      const w = st.w * big * prof(k) * (koi.stage >= 2 && i < 3 ? 1.25 - i * 0.08 : 1);
      const hgt = w * (1.08 - 0.25 * Math.abs(k - 0.3));
      kP.push({ x: cx, y: cy, z: cz, tx, ty, tz, nx, nz, ux, uy, uz, w });
      for (let j = 0; j < NR; j++) {
        const ang = j / NR * TAU, cs = Math.cos(ang), sn = Math.sin(ang);
        const o = (i * NR + j) * 3;
        const hh = sn > 0 ? hgt : hgt * 0.72;
        pos[o] = cx + nx * cs * w + ux * sn * hh; pos[o + 1] = cy + uy * sn * hh; pos[o + 2] = cz + nz * cs * w + uz * sn * hh;
      }
    }
    const h0 = kP[0], tl = kP[n - 1];
    let o = n * NR * 3;
    pos[o] = h0.x + h0.tx * h0.w * 0.85; pos[o + 1] = h0.y + h0.ty * h0.w * 0.85; pos[o + 2] = h0.z + h0.tz * h0.w * 0.85;
    o += 3; pos[o] = tl.x; pos[o + 1] = tl.y; pos[o + 2] = tl.z;
    koiBody.geometry.attributes.position.needsUpdate = true;
    koiBody.geometry.computeVertexNormals();

    // ---- vây ----
    const fp = koiFins.geometry.attributes.position.array;
    let fo = 0;
    const tri = (ax, ay, az, bx, by, bz, cx2, cy2, cz2) => { fp[fo++] = ax; fp[fo++] = ay; fp[fo++] = az; fp[fo++] = bx; fp[fo++] = by; fp[fo++] = bz; fp[fo++] = cx2; fp[fo++] = cy2; fp[fo++] = cz2; };
    const fan = (i, len, spread, flap, lift) => {
      if (i >= n) return;
      const q = kP[i];
      for (const sd of [-1, 1]) {
        const bx = q.x + q.nx * q.w * 0.85 * sd, by = q.y - q.w * 0.15, bz = q.z + q.nz * q.w * 0.85 * sd;
        const base = Math.atan2(-q.tz, -q.tx);                         // hướng về phía đuôi
        const sway = Math.sin(koi.phase * 0.9 + i) * flap;
        let px = bx, py = by, pz = bz;
        for (let s2 = 0; s2 <= 4; s2++) {
          const f = s2 / 4;
          const ang = base + sd * (spread * (0.35 + f * 0.9) + sway);
          const ll = len * big * Math.sin(Math.PI * (0.2 + f * 0.7));
          const ex = bx + Math.cos(ang) * ll, ez = bz + Math.sin(ang) * ll, ey = by + lift * ll;
          if (s2 > 0) tri(bx, by, bz, px, py, pz, ex, ey, ez);
          px = ex; py = ey; pz = ez;
        }
      }
    };
    fan(Math.round(n * 0.2), 0.5 + st.w * 0.7, 1.0, 0.3, -0.12);
    fan(Math.round(n * 0.55), 0.24, 0.8, 0.2, -0.15);
    // đuôi xoè
    {
      const q = tl, base = Math.atan2(-q.tz, -q.tx) + Math.sin(koi.phase - n * kk) * 0.4;
      const len = (0.5 + st.w * 1.2) * big;
      let px = 0, py = 0, pz = 0;
      for (let s2 = 0; s2 <= 6; s2++) {
        const f = s2 / 6 * 2 - 1;
        const ang = base + f * 0.62;
        const ll = len * (0.62 + 0.38 * Math.abs(f));
        const ex = q.x + Math.cos(ang) * ll, ez = q.z + Math.sin(ang) * ll, ey = q.y + q.ty * -ll * 0.6 + Math.abs(f) * 0.02;
        if (s2 > 0) tri(q.x, q.y, q.z, px, py, pz, ex, ey, ez);
        px = ex; py = ey; pz = ez;
      }
    }
    // vây lưng
    if (!st.mane) {
      const i0 = Math.round(n * 0.26), i1 = Math.round(n * 0.62);
      for (let i = i0; i < i1; i++) {
        const q = kP[i], r = kP[i + 1], f = (i - i0) / (i1 - i0);
        const hq = q.w * (1.05 - 0.25 * Math.abs(i / (n - 1) - 0.3)), hr = r.w * (1.05 - 0.25 * Math.abs((i + 1) / (n - 1) - 0.3));
        const fh = 0.16 * big * Math.sin(Math.PI * Math.min(1, f * 1.15 + 0.12));
        tri(q.x + q.ux * hq * 0.95, q.y + q.uy * hq * 0.95, q.z + q.uz * hq * 0.95,
          r.x + r.ux * hr * 0.95, r.y + r.uy * hr * 0.95, r.z + r.uz * hr * 0.95,
          q.x + q.ux * (hq + fh) - q.tx * 0.1 * big, q.y + q.uy * (hq + fh) - q.ty * 0.1 * big, q.z + q.uz * (hq + fh) - q.tz * 0.1 * big);
      }
    }
    // bờm rồng dọc sống lưng
    if (st.mane) {
      for (let i = 3; i < n - 3; i++) {
        const q = kP[i], r = kP[i + 1];
        const h1 = q.w * (1.0 + 0.8 + 0.25 * Math.sin(i * 1.7)), h2 = r.w * 0.95;
        tri(q.x + q.ux * q.w * 0.8, q.y + q.uy * q.w * 0.8, q.z + q.uz * q.w * 0.8,
          r.x + r.ux * h2, r.y + r.uy * h2, r.z + r.uz * h2,
          q.x + q.ux * h1 - q.tx * 0.08, q.y + q.uy * h1 - q.ty * 0.08, q.z + q.uz * h1 - q.tz * 0.08);
      }
    }
    for (let i = fo; i < fp.length; i++) fp[i] = 0;
    koiFins.geometry.attributes.position.needsUpdate = true;
    koiFins.geometry.computeVertexNormals();

    // ---- đầu: mắt, sừng, râu ----
    const w0 = h0.w;
    for (const e of koiEyes) {
      const sd = e.userData.side;
      e.position.set(h0.x + h0.tx * w0 * 0.5 + h0.nx * w0 * 0.72 * sd + h0.ux * w0 * 0.42, h0.y + h0.ty * w0 * 0.5 + h0.uy * w0 * 0.42, h0.z + h0.tz * w0 * 0.5 + h0.nz * w0 * 0.72 * sd + h0.uz * w0 * 0.42);
      e.scale.setScalar(big * (koi.stage >= 3 ? 1.6 : 1));
    }
    for (const h of koiHorns) {
      const sd = h.userData.side;
      h.visible = st.horn > 0;
      if (!h.visible) continue;
      const len = st.horn * big;
      const dx = -h0.tx * 0.75 + h0.nx * 0.45 * sd + h0.ux * 0.6, dy = -h0.ty * 0.75 + h0.uy * 0.6 + 0.25, dz = -h0.tz * 0.75 + h0.nz * 0.45 * sd + h0.uz * 0.6;
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
      h.scale.set(big * (1 + koi.stage * 0.5), len, big * (1 + koi.stage * 0.5));
      h.position.set(h0.x + h0.nx * w0 * 0.5 * sd + h0.ux * w0 * 0.6 + dx / dl * len * 0.5, h0.y + h0.uy * w0 * 0.6 + dy / dl * len * 0.5, h0.z + h0.nz * w0 * 0.5 * sd + h0.uz * w0 * 0.6 + dz / dl * len * 0.5);
      h.quaternion.setFromUnitVectors(v3.set(0, 1, 0), v3b.set(dx / dl, dy / dl, dz / dl));
    }
    for (const b of koiBarbs) {
      const sd = b.userData.side;
      const len = st.barb * big;
      const sw = Math.sin(koi.phase * 0.8 + sd) * 0.25;
      const dx = h0.tx * 0.25 + h0.nx * (0.9 * sd + sw), dy = h0.ty * 0.25 - 0.12, dz = h0.tz * 0.25 + h0.nz * (0.9 * sd + sw);
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
      b.scale.set(big * (1 + koi.stage), len, big * (1 + koi.stage));
      b.position.set(h0.x + h0.tx * w0 * 1.0 + h0.nx * w0 * 0.4 * sd + dx / dl * len * 0.5, h0.y + dy / dl * len * 0.5, h0.z + h0.tz * w0 * 1.0 + h0.nz * w0 * 0.4 * sd + dz / dl * len * 0.5);
      b.quaternion.setFromUnitVectors(v3.set(0, 1, 0), v3b.set(dx / dl, dy / dl, dz / dl));
    }
    // dưới nước thì ngả màu nước, lên khỏi mặt nước thì rực rỡ
    const sub = clamp((0.02 - koi.y) / 0.2, 0, 1) * (koi.air ? 0 : 1);
    const A = koi.alpha;
    koiMat.color.setRGB(lerp(1, 0.82, sub) + koi.hurt * 0.6, lerp(1, 0.93, sub) * (1 - koi.hurt * 0.5), lerp(1, 1, sub) * (1 - koi.hurt * 0.5));
    koiMat.opacity = A * lerp(1, 0.9, sub);
    koiMat.emissiveIntensity = (koi.stage >= 3 ? 0.9 : 0.5) * (S.fever ? 1.5 : 1);
    finMat.opacity = A * 0.7;
    koiGroup.visible = A > 0.01;
    koiGlow.visible = A > 0.01;
    const mid = kP[Math.min(n - 1, Math.round(n * 0.35))];
    koiGlow.position.set(mid.x, Math.max(0.03, mid.y + 0.05), mid.z);
    const gs = (1.7 + st.n * 0.06) * big; koiGlow.scale.set(gs, gs, 1);
    koiGlow.material.opacity = 0.1 * A * (S.fever ? 2.4 : 1) + koi.hurt * 0.3;
    koiGlow.material.color.setRGB(1, lerp(0.78, 0.3, koi.hurt), lerp(0.56, 0.4, koi.hurt));
    koiLight.position.set(mid.x, Math.max(0.9, mid.y + 1.0), mid.z);
    koiLight.intensity = 0.85 * A * (koi.stage >= 3 ? 1.5 : 1);
    if (koi.pearl) {
      koiPearl.visible = true;
      koiPearl.position.set(h0.x + h0.tx * 1.1 * big + Math.cos(S.time * 3) * 0.12, h0.y + h0.ty * 1.1 * big + 0.1 + Math.sin(S.time * 2.3) * 0.12, h0.z + h0.tz * 1.1 * big);
      const ps = 1.3 * big; koiPearl.scale.set(ps, ps, 1);
    } else koiPearl.visible = false;
  }

  /* ---------- thời tiết ---------- */
  let wxPts, wxData = [], wxMode = '', rain, mistSprites = [];
  const NW = 150;
  function buildWeather() {
    const g = new T.BufferGeometry();
    const pos = new Float32Array(NW * 3), sz = new Float32Array(NW);
    for (let i = 0; i < NW; i++) { wxData.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ph: Math.random() * TAU, s: 1 }); }
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new T.BufferAttribute(sz, 1));
    wxPts = new T.Points(g, new T.ShaderMaterial({
      uniforms: { uMap: { value: glowTex }, uPx: { value: 1 }, uCol: { value: C('#ffe9a0') }, uA: { value: 1 } },
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
      vertexShader: 'attribute float aSize; uniform float uPx; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=min(aSize*uPx/max(.1,-mv.z), uPx*.02); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D uMap; uniform vec3 uCol; uniform float uA; void main(){ vec4 t=texture2D(uMap,gl_PointCoord); gl_FragColor=vec4(uCol*t.a*uA,1.);\n#include <encodings_fragment>\n}',
    }));
    wxPts.frustumCulled = false; wxPts.renderOrder = 6; scene.add(wxPts);
    const rg = new T.BufferGeometry();
    rg.setAttribute('position', new T.BufferAttribute(new Float32Array(260 * 6), 3));
    rain = new T.LineSegments(rg, new T.LineBasicMaterial({ color: 0x9fb4e8, transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
    rain.frustumCulled = false; rain.visible = false; rain.userData.d = [];
    for (let i = 0; i < 260; i++) rain.userData.d.push({ x: rand(-12, 12), y: rand(0, 12), z: rand(-12, 10), v: rand(14, 22) });
    scene.add(rain);
    for (let i = 0; i < 10; i++) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: softTex, color: 0xdfeef2, transparent: true, depthWrite: false, opacity: 0, fog: false }));
      sp.userData = { x: rand(-9, 9), z: rand(-8, 8), v: rand(0.15, 0.4) * (i % 2 ? 1 : -1), s: rand(6, 11) };
      sp.visible = false; scene.add(sp); mistSprites.push(sp);
    }
  }
  function resetWx(mode) {
    wxMode = mode;
    for (const d of wxData) {
      d.x = rand(-S.Wd / 2 - 4, S.Wd / 2 + 4); d.z = rand(-S.D / 2 - 3, S.D / 2 + 4); d.y = rand(0.2, 4.5);
      if (mode === 'embers') { d.vy = rand(0.4, 1.3); d.vx = rand(-0.2, 0.2); d.vz = rand(-0.2, 0.2); d.s = rand(0.1, 0.22); }
      else if (mode === 'petals') { d.vy = rand(-0.55, -0.2); d.vx = rand(-0.5, 0.1); d.vz = rand(-0.1, 0.3); d.s = rand(0.12, 0.24); }
      else { d.vy = 0; d.vx = 0; d.vz = 0; d.s = rand(0.07, 0.16); }
    }
    rain.visible = mode === 'rain';
    mistSprites.forEach((m) => { m.visible = mode === 'mist'; });
  }
  function updateWeather(dt) {
    const t = S.time, pos = wxPts.geometry.attributes.position.array, sz = wxPts.geometry.attributes.aSize.array;
    const fl = wxMode === 'fireflies' || wxMode === 'rain' || wxMode === 'mist';
    const count = wxMode === 'rain' ? 40 : wxMode === 'mist' ? 50 : NW;
    for (let i = 0; i < NW; i++) {
      const d = wxData[i];
      if (i >= count) { sz[i] = 0; continue; }
      if (fl) {
        d.x += Math.sin(t * 0.4 + d.ph) * 0.25 * dt; d.z += Math.cos(t * 0.33 + d.ph * 1.7) * 0.25 * dt; d.y += Math.sin(t * 0.6 + d.ph * 2.3) * 0.12 * dt;
        sz[i] = d.s * (0.35 + 0.65 * Math.max(0, Math.sin(t * 1.4 + d.ph * 3)));
      } else {
        d.x += (d.vx + Math.sin(t * 0.8 + d.ph) * 0.3) * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        if (d.y > 6) d.y = 0.1; if (d.y < 0.02) { d.y = 5.5; d.x = rand(-S.Wd / 2 - 4, S.Wd / 2 + 4); }
        sz[i] = d.s * (0.6 + 0.4 * Math.sin(t * 3 + d.ph));
      }
      pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
    }
    wxPts.geometry.attributes.position.needsUpdate = true; wxPts.geometry.attributes.aSize.needsUpdate = true;
    if (rain.visible) {
      const rp = rain.geometry.attributes.position.array, rd = rain.userData.d;
      for (let i = 0; i < rd.length; i++) {
        const d = rd[i]; d.y -= d.v * dt;
        if (d.y < 0) { if (Math.random() < 0.12) S.ripple(d.x, d.z, 0.16); d.y = rand(9, 13); d.x = rand(-S.Wd / 2 - 5, S.Wd / 2 + 5); d.z = rand(-S.D / 2 - 3, S.D / 2 + 4); }
        rp[i * 6] = d.x; rp[i * 6 + 1] = d.y; rp[i * 6 + 2] = d.z; rp[i * 6 + 3] = d.x + 0.05; rp[i * 6 + 4] = d.y + 0.55; rp[i * 6 + 5] = d.z;
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
    if (wxMode === 'mist') for (const m of mistSprites) {
      const d = m.userData; d.x += d.v * dt; if (d.x > 11) d.x = -11; if (d.x < -11) d.x = 11;
      m.position.set(d.x, 0.7, d.z); m.scale.set(d.s, d.s * 0.45, 1); m.material.opacity = 0.12;
    }
  }

  /* ---------- không khí ---------- */
  function moodTo(m, k) {
    // trộn màu hiện tại về phía bảng màu m
    const u = skyU, w = waterU;
    const set = (col, hex) => { tmpCol.set(hex); col.lerp(tmpCol, k); };
    set(u.uZen.value, m.zen); set(u.uHor.value, m.hor); set(u.uBand.value, m.band); set(u.uMoonCol.value, m.moon);
    set(w.uDeep.value, m.deep); set(w.uShallow.value, m.shallow); set(w.uFogCol.value, m.fog);
    set(scene.fog.color, m.fog);
    scene.fog.density = lerp(scene.fog.density, m.fogD, k); w.uFogDen.value = scene.fog.density;
    u.uStar.value = lerp(u.uStar.value, m.star, k);
    u.uMoonSize.value = lerp(u.uMoonSize.value, m.moonBig || 1, k);
    hemi.intensity = lerp(hemi.intensity, m.amb * 1.7, k);
    set(hemi.color, m.hor); set(moonLight.color, m.moon);
    set(wxPts.material.uniforms.uCol.value, m.wc);
    set(fallU.uCol.value, m.moon);
    mounts.children.forEach((mm, i) => { tmpCol.set(m.fog).multiplyScalar(0.55 + i * 0.25); mm.material.color.lerp(tmpCol, k); });
    bed.material.color.lerp(tmpCol.set(m.deep).multiplyScalar(0.5), k);
    renderer.setClearColor(tmpCol.set(m.deep), 1);
  }
  function setMoodNow(i) { mood.tgt = MOODS[i]; moodTo(mood.tgt, 1); resetWx(mood.tgt.wx); S.moodI = i; }
  S.setMood = function (i, instant) {
    i = clamp(i, 0, MOODS.length - 1);
    if (instant) return setMoodNow(i);
    mood.tgt = MOODS[i]; S.moodI = i;
    if (wxMode !== mood.tgt.wx) resetWx(mood.tgt.wx);
  };

  /* ---------- hậu kỳ: toả sáng, tối góc, hạt phim ---------- */
  const FSQ = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
  function buildPost() {
    postScene = new T.Scene(); postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postQuad = new T.Mesh(new T.PlaneGeometry(2, 2), null); postQuad.frustumCulled = false; postScene.add(postQuad);
    matBright = new T.ShaderMaterial({
      uniforms: { tA: { value: null }, uTh: { value: 0.78 } }, depthTest: false, depthWrite: false,
      vertexShader: FSQ,
      fragmentShader: 'uniform sampler2D tA; uniform float uTh; varying vec2 vUv; void main(){ vec3 c=texture2D(tA,vUv).rgb; float l=max(c.r,max(c.g,c.b)); float k=smoothstep(uTh,uTh+.3,l); gl_FragColor=vec4(c*k,1.); }',
    });
    matDown = new T.ShaderMaterial({
      uniforms: { tA: { value: null }, uPx: { value: new T.Vector2() } }, depthTest: false, depthWrite: false,
      vertexShader: FSQ,
      fragmentShader: 'uniform sampler2D tA; uniform vec2 uPx; varying vec2 vUv; void main(){ vec3 c=texture2D(tA,vUv+uPx*vec2(-1.,-1.)).rgb+texture2D(tA,vUv+uPx*vec2(1.,-1.)).rgb+texture2D(tA,vUv+uPx*vec2(-1.,1.)).rgb+texture2D(tA,vUv+uPx*vec2(1.,1.)).rgb; c=c*.2+texture2D(tA,vUv).rgb*.2; gl_FragColor=vec4(c,1.); }',
    });
    matFinal = new T.ShaderMaterial({
      uniforms: { tA: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, uBloom: { value: 0.55 }, uFade: { value: 0 }, uFlash: { value: new T.Vector3() }, uT: { value: 0 }, uVig: { value: 0.9 }, uWarm: { value: 0 } },
      depthTest: false, depthWrite: false, vertexShader: FSQ,
      fragmentShader: [
        'uniform sampler2D tA; uniform sampler2D tB0; uniform sampler2D tB1; uniform sampler2D tB2; uniform sampler2D tB3; uniform float uBloom; uniform float uFade; uniform vec3 uFlash; uniform float uT; uniform float uVig; uniform float uWarm; varying vec2 vUv;',
        'float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }',
        'void main(){',
        '  vec3 c=texture2D(tA,vUv).rgb;',
        '  vec3 b=texture2D(tB0,vUv).rgb*.55+texture2D(tB1,vUv).rgb*.7+texture2D(tB2,vUv).rgb*.75+texture2D(tB3,vUv).rgb*.7;',
        '  c+=b*uBloom*.42;',
        '  vec2 v=vUv-.5; float vg=1.-dot(v,v)*uVig; c*=vg;',
        '  c=mix(c,c*vec3(1.12,1.02,.82)+vec3(.05,.03,0.),uWarm);',
        '  c+=uFlash;',
        '  c+=(h(vUv*vec2(1920.,1080.)+uT)-.5)*.022;',
        '  c*=1.-uFade;',
        '  gl_FragColor=vec4(c,1.);',
        '}',
      ].join('\n'),
    });
  }
  function makeTargets() {
    const pr = renderer.getPixelRatio(), w = Math.max(4, Math.round(S.W * pr)), h = Math.max(4, Math.round(S.H * pr));
    if (rtScene) rtScene.dispose();
    rtBloom.forEach((r) => r.dispose()); rtBloom = [];
    const opt = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, depthBuffer: true, stencilBuffer: false };
    if (renderer.capabilities.isWebGL2 && pr < 1.9 && S.quality >= 1) { rtScene = new T.WebGLMultisampleRenderTarget(w, h, opt); rtScene.samples = 4; }
    else rtScene = new T.WebGLRenderTarget(w, h, opt);
    rtScene.texture.encoding = T.sRGBEncoding;
    let bw = w >> 1, bh = h >> 1;
    for (let i = 0; i < 4; i++) {
      const r = new T.WebGLRenderTarget(Math.max(2, bw), Math.max(2, bh), { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, depthBuffer: false, stencilBuffer: false });
      rtBloom.push(r); bw >>= 1; bh >>= 1;
    }
  }

  /* ---------- máy quay ---------- */
  const cam = { pitch: 0.9, dist: 20, tz: 0, fov: 34, cine: null, pos: new T.Vector3(), look: new T.Vector3() };
  function poseCam(d, tz, pitch, yaw) {
    const cy = Math.cos(pitch), sy = Math.sin(pitch);
    camera.position.set(Math.sin(yaw || 0) * d * cy, d * sy, tz + Math.cos(yaw || 0) * d * cy);
    camera.lookAt(0, 0, tz);
    camera.updateMatrixWorld(true);
  }
  S.fit = function (rect) {
    if (!S.ok) return;
    S.rect = rect;
    const portrait = S.H > S.W * 1.05;
    cam.pitch = (portrait ? 54 : 44) * Math.PI / 180;
    cam.fov = portrait ? 33 : 27;
    camera.fov = cam.fov; camera.aspect = S.W / S.H; camera.updateProjectionMatrix();
    const hw = S.Wd / 2 + S.ringR + 0.25, zn = S.D / 2 + 1.5, zf = -S.D / 2 - 1.2;
    const pts = [[-hw, 0, zn], [hw, 0, zn], [-hw, 0, zf], [hw, 0, zf], [-2.7, 3.7, zf - 0.7], [2.7, 3.7, zf - 0.7], [0, 0.9, zn - 1.5]];
    const x0 = 2 * rect.x / S.W - 1, x1 = 2 * (rect.x + rect.w) / S.W - 1, y1 = 1 - 2 * rect.y / S.H, y0 = 1 - 2 * (rect.y + rect.h) / S.H;
    const bounds = () => {
      let a = 9, b = -9, c = 9, d = -9;
      for (const p of pts) { v3.set(p[0], p[1], p[2]).project(camera); a = Math.min(a, v3.x); b = Math.max(b, v3.x); c = Math.min(c, v3.y); d = Math.max(d, v3.y); }
      return { a, b, c, d };
    };
    let tz = -0.3, dist = 20;
    for (let it = 0; it < 9; it++) {
      let lo = 4, hi = 120;
      for (let k = 0; k < 20; k++) {
        const d = (lo + hi) / 2;
        poseCam(d, tz, cam.pitch, 0);
        const b = bounds();
        if (b.a >= x0 && b.b <= x1 && (b.d - b.c) <= (y1 - y0)) hi = d; else lo = d;
      }
      dist = hi; poseCam(dist, tz, cam.pitch, 0);
      const b = bounds();
      const err = (b.c + b.d) / 2 - (y0 + y1) / 2;
      if (Math.abs(err) < 0.006) break;
      tz -= err * dist * 0.3;
    }
    cam.dist = dist; cam.tz = tz;
  };
  S.cine = function (pose) { cam.cine = pose; };     // pose: {pos:[x,y,z], look:[x,y,z], fov} hoặc null để về góc chơi
  function updateCamera(dt) {
    const t = S.time;
    const yaw = S.orbit.yaw + Math.sin(t * 0.13) * 0.018, pitch = clamp(cam.pitch + S.orbit.pitch + Math.sin(t * 0.1) * 0.006, 0.25, 1.45);
    const d = cam.dist * (1 - S.punch);
    const cy = Math.cos(pitch), sy = Math.sin(pitch);
    v3.set(Math.sin(yaw) * d * cy, d * sy, cam.tz + Math.cos(yaw) * d * cy);
    v3b.set(0, 0, cam.tz);
    let fov = cam.fov;
    if (cam.cine) {
      const k = cam.cine.k == null ? 1 : cam.cine.k;
      v3.lerp(new T.Vector3(cam.cine.pos[0], cam.cine.pos[1], cam.cine.pos[2]), k);
      v3b.lerp(new T.Vector3(cam.cine.look[0], cam.cine.look[1], cam.cine.look[2]), k);
      fov = lerp(fov, cam.cine.fov || fov, k);
    }
    if (S.shake > 0) { v3.x += (Math.random() - 0.5) * S.shake; v3.y += (Math.random() - 0.5) * S.shake; }
    camera.position.copy(v3); camera.lookAt(v3b);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(true);
  }
  S.toScreen = function (x, y, z, out) {
    v3.set(x, y, z).project(camera);
    out = out || {};
    out.x = (v3.x + 1) / 2 * S.W; out.y = (1 - v3.y) / 2 * S.H; out.behind = v3.z > 1;
    return out;
  };
  const ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  S.fromScreen = function (sx, sy) {
    ndc.set(sx / S.W * 2 - 1, 1 - sy / S.H * 2);
    ray.setFromCamera(ndc, camera);
    const hit = ray.ray.intersectPlane(plane, v3);
    return hit ? { x: hit.x, z: hit.z } : null;
  };

  /* ---------- kích thước ---------- */
  S.resize = function (W, H, dpr) {
    if (!S.ok) return;
    S.W = W; S.H = H;
    const cap = S.quality >= 1 ? 2 : S.quality >= 0.5 ? 1.5 : 1;
    renderer.setPixelRatio(Math.min(cap, dpr || 1));
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    makeTargets();
    const px = renderer.getPixelRatio() * H / (2 * Math.tan(camera.fov * Math.PI / 360));
    S.px = px;
  };
  S.layout = function (stars, rect) {
    const aspect = rect.w / Math.max(1, rect.h);
    S.D = 11.5; S.Wd = clamp(S.D * aspect * 0.98, 6.0, 13.5);
    if (stars) for (const s of stars) { s.wx = (s.nx - 0.5) * S.Wd; s.wz = (0.5 - s.ny) * S.D; }
    if (S.ok) {
      const gz = -S.D / 2 - 0.9;
      gate.position.set(0, 0, gz); gateMirror.position.set(0, 0, gz);
      placeShore();
      S.fit(rect);
    }
  };

  /* ---------- mỗi khung hình ---------- */
  S.worldA = 1;
  S.update = function (dt, atime, stars) {
    if (!S.ok) return;
    S.time += dt;
    const t = S.time;
    skyU.uTime.value = t;
    if (mood.tgt) moodTo(mood.tgt, Math.min(1, dt * 1.3));
    fallU.uT.value = t; veilU.uT.value = t;
    updateCamera(dt);
    waterU.uCam.value.copy(camera.position);
    // Thời Vận nhuộm vàng mặt nước
    const warm = waterU.uWarm.value, wt = S.fever ? 0.07 : 0;
    warm.x = lerp(warm.x, wt * 1.6, dt * 3); warm.y = lerp(warm.y, wt, dt * 3); warm.z = lerp(warm.z, wt * 0.25, dt * 3);
    matFinal.uniforms.uWarm.value = lerp(matFinal.uniforms.uWarm.value, S.fever ? 0.55 : 0, Math.min(1, dt * 3));

    // cổng
    const gs = stars && stars.length ? stars[stars.length - 1] : null;
    if (gs && gs.type === 'gate') {
      veilU.uP.value = lerp(veilU.uP.value, gs.p, Math.min(1, dt * 4));
      veilU.uOpen.value = gs.open || 0;
      for (let i = 0; i < 3; i++) {
        const o = sealOrbs[i]; o.visible = gs.sealsNeed > 1;
        const on = i < gs.seals;
        o.material.emissiveIntensity = lerp(o.material.emissiveIntensity, on ? 2.2 : 0, Math.min(1, dt * 5));
        o.rotation.y = t * (on ? 2 : 0.6); o.position.y = 1.95 + Math.sin(t * 1.5 + i) * 0.04;
      }
    } else { veilU.uP.value = lerp(veilU.uP.value, 0.15, dt); veilU.uOpen.value = 0; sealOrbs.forEach((o) => { o.visible = false; }); }
    if (Math.random() < dt * 14) S.spray(rand(-1.3, 1.3), 0.1, -S.D / 2 - 2.6, 'water', 1, 1.2, { up: 1.3, life: 0.9, size: 0.3, g: 2.5 });
    if (Math.random() < dt * 1.6) S.ripple(rand(-1.2, 1.2), -S.D / 2 - 2.3, 0.5);

    updateLanterns(dt, atime);
    updateKoi(dt);
    updateWeather(dt);

    // hạt
    const pos = pGeo.attributes.position.array, col = pGeo.attributes.color.array, size = pGeo.attributes.aSize.array;
    for (let i = 0; i < NP; i++) {
      const d = pData[i];
      if (d.life >= d.max) { if (size[i] !== 0) size[i] = 0; continue; }
      d.life += dt; d.vy -= d.g * dt;
      pos[i * 3] += d.vx * dt; pos[i * 3 + 1] += d.vy * dt; pos[i * 3 + 2] += d.vz * dt;
      if (pos[i * 3 + 1] < 0 && d.g > 1) { d.life = d.max; }
      const k = d.life / d.max, a = k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9;
      col[i * 3] = d.r * a; col[i * 3 + 1] = d.gc * a; col[i * 3 + 2] = d.b * a;
      size[i] = d.s;
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true; pGeo.attributes.aSize.needsUpdate = true;
    for (const w of waves) {
      if (!w.on) continue;
      w.t += dt; const k = w.t / w.dur;
      if (k >= 1) { w.on = false; w.m.visible = false; continue; }
      const r = lerp(w.r0, w.r1, 1 - Math.pow(1 - k, 3));
      w.m.scale.setScalar(r); w.m.material.opacity = Math.pow(1 - k, 1.5) * 0.5;
    }
    for (const o of orbs) {
      if (!o.on) continue;
      o.t += dt; const k = o.t / o.dur;
      if (k >= 1) { o.on = false; o.sp.visible = false; continue; }
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const x = lerp(o.ax, o.bx, e), z = lerp(o.az, o.bz, e);
      o.sp.position.set(x, 0.14 + Math.sin(k * Math.PI) * 0.22, z);
      const s = 0.55 + Math.sin(k * Math.PI) * 0.35; o.sp.scale.set(s, s, 1);
      o.sp.material.opacity = Math.min(1, Math.sin(k * Math.PI) * 1.6);
      if (Math.random() < dt * 30) S.spray(x, 0.14, z, 'gold', 1, 0.3, { up: 0.3, life: 0.4, size: 0.09, g: 0 });
    }
    for (const l of lifts) {
      if (!l.on) continue;
      l.t += dt;
      if (l.t < 0) continue;
      l.g.visible = true;
      const p = l.g.position;
      p.x += (l.vx + Math.sin(t * 0.9 + l.ph) * 0.25) * dt; p.y += l.vy * dt; p.z += l.vz * dt;
      l.g.scale.setScalar(Math.min(1, l.t / 0.5) * 1.1);
      l.g.rotation.y = t * 0.4 + l.ph;
      const fade = clamp((16 - p.y) / 5, 0, 1);
      l.body.material.opacity = 0.95 * fade; l.gl.material.opacity = fade;
      if (p.y > 16 || l.t > 14) { l.on = false; l.g.visible = false; }
    }
    S.shake = Math.max(0, S.shake - dt * (0.5 + S.shake * 6));
    S.punch = Math.max(0, S.punch - dt * (0.1 + S.punch * 5));
    for (let i = 0; i < 3; i++) S.flash[i] = Math.max(0, S.flash[i] - dt * (0.6 + S.flash[i] * 3.5));

    // toạ độ màn hình cho lớp 2D phía trên
    if (stars) {
      const o = {};
      for (const s of stars) {
        S.toScreen(s.wx, 0.12, s.wz, o); s.x = o.x; s.y = o.y;
        const R = s.type === 'gate' ? 1.0 : S.ringR;
        S.toScreen(s.wx + R, 0.03, s.wz, o); s.sr = Math.abs(o.x - s.x);
        S.toScreen(s.wx, 0.03, s.wz + R + 0.34, o); s.lx = o.x; s.ly = o.y;
        S.toScreen(s.wx, 0.03, s.wz + R, o); s.sry = Math.abs(o.y - s.y);
      }
    }
    const ko = {}; S.toScreen(koi.x, Math.max(0.05, koi.y + 0.1), koi.z, ko); koi.sx = ko.x; koi.sy = ko.y;
  };

  S.render = function () {
    if (!S.ok) return;
    const pr = renderer.getPixelRatio();
    const px = pr * S.H / (2 * Math.tan(camera.fov * Math.PI / 360));
    pPts.material.uniforms.uPx.value = px; wxPts.material.uniforms.uPx.value = px;
    if (edgePts) edgePts.material.uniforms.uPx.value = px;
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);
    // lọc vùng sáng rồi thu nhỏ dần
    postQuad.material = matBright; matBright.uniforms.tA.value = rtScene.texture;
    renderer.setRenderTarget(rtBloom[0]); renderer.render(postScene, postCam);
    postQuad.material = matDown;
    for (let i = 1; i < rtBloom.length; i++) {
      matDown.uniforms.tA.value = rtBloom[i - 1].texture;
      matDown.uniforms.uPx.value.set(1 / rtBloom[i - 1].width, 1 / rtBloom[i - 1].height);
      renderer.setRenderTarget(rtBloom[i]); renderer.render(postScene, postCam);
    }
    postQuad.material = matFinal;
    const u = matFinal.uniforms;
    u.tA.value = rtScene.texture; u.tB0.value = rtBloom[0].texture; u.tB1.value = rtBloom[1].texture; u.tB2.value = rtBloom[2].texture; u.tB3.value = rtBloom[3].texture;
    u.uFade.value = S.fade; u.uFlash.value.set(S.flash[0], S.flash[1], S.flash[2]); u.uT.value = S.time % 10;
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  };

  S.setQuality = function (q) { if (q === S.quality) return; S.quality = q; S.resize(S.W, S.H, window.devicePixelRatio || 1); };
  S.cam = cam;
  S.camera = () => camera;
  S.dbg = () => ({ koiBody, koiMat, koiFins, scene, renderer });
  S.MOODS = MOODS;

  root.S3 = S;
})(window);
