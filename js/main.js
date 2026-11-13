/* ==========================================================================
   NGÂN HÀ VŨ MÔN — vòng chơi: nối luật (Core) với hoạt cảnh (Gfx), tiếng (Sfx), giao diện (UI)
   ========================================================================== */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const G = Gfx, TAU = Math.PI * 2;
  const clamp = Core.clamp, lerp = Core.lerp, ease = G.ease, fmt = UI.fmt;
  const rand = (a, b) => a + Math.random() * (b - a);

  const SAVE_KEY = 'ngan-ha-vu-mon.v1';
  const save = { best: 0, bestScore: 0, wins: 0, runs: 0, kiep: 0, muted: false, fast: false, seen: false };
  function loadSave() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s === 'object') Object.assign(save, s); } catch (e) { /* chơi không lưu cũng được */ }
  }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* bỏ qua */ } }

  let run = null, lv = null, shop = null;
  let state = 'title', busy = false, kiep = 0;
  let told = {};
  let koiFree = Promise.resolve();
  let lastLitN = 0;
  let stickBusy = false;

  /* ---------- bố cục ---------- */
  function relayout() {
    G.resize();
    const top = $('hud-top'), bot = $('hud-bottom');
    let t = 76, b = G.H - 84;
    if (!top.hidden) { t = top.getBoundingClientRect().bottom; b = bot.getBoundingClientRect().top; }
    G.relayout(t, b);
    if (state === 'title') G.koi.anchor = { x: G.W / 2, y: G.H * 0.78 };
  }

  const buzz = (ms) => { try { if (navigator.vibrate && !save.muted) navigator.vibrate(ms); } catch (e) { /* không rung cũng không sao */ } };
  const at = (s) => ({ x: s.x, y: s.y + G.world.oy });
  const litColor = (type) => (type === 'normal' || type === 'gate' ? 'gold' : G.TYPE_COL[type]);

  function syncHUD(instant) {
    UI.setHearts(run.hp, run.maxHp, lv ? lv.shield : 0, lv ? lv.rerolls : 0);
    UI.setPearls(run.pearls, instant);
    UI.setStreak(run.streak, Core.streakMult(run));
    UI.setLevel(run.level, Core.HEAVENS.length, lv.cfg.name);
    UI.setClovers(run.clovers, run.cloverArmed);
    UI.setCharms(run, 'charms');
  }
  function syncView() {
    if (!lv) return;
    const m = Core.mods(run);
    for (const s of G.stars) {
      const ms = lv.stars[s.id];
      if (!ms) continue;
      if (s.state !== ms.state) {
        s.state = ms.state; s.rolling = false;
        if (ms.state === 'lit') s.litT = G.time;
        if (ms.state === 'void') s.voidT = G.time;
      }
      if (ms.state === 'dormant') G.setOdds(s.id, Core.oddsOf(run, lv, ms));
      s.rescue = m.rescue;
      s.clover = ms.bonus > 0 && ms.state === 'dormant';
      s.omen = !!(lv.thunder && lv.thunder.target === s.id && ms.state === 'dormant');
      if (s.type === 'gate') s.seals = lv.seals;
    }
  }

  /* ---------- lời nhắc cho lượt đầu ---------- */
  function teach(key, text, ms) {
    if (save.seen || told[key]) return false;
    told[key] = true;
    UI.hint(text, ms || 6500);
    return true;
  }

  /* =======================================================================
     Diễn lại danh sách sự kiện do Core trả về
     ======================================================================= */
  async function play(events) {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      switch (ev.t) {
        case 'clover': await fxClover(ev); break;
        case 'roll': await fxRoll(ev); break;
        case 'second': await fxSecond(ev); break;
        case 'lit': await fxLit(ev); break;
        case 'spread': fxSpread(ev); break;
        case 'drain': fxDrain(ev); break;
        case 'void': await fxVoid(ev); break;
        case 'hp': await fxHp(ev); break;
        case 'shield': await fxShield(ev); break;
        case 'heal': fxHeal(ev); break;
        case 'gainClover': fxGainClover(ev); break;
        case 'mystery': await fxMystery(ev); break;
        case 'nova': fxNova(ev); break;
        case 'shoot': fxShoot(ev); break;
        case 'chain': await fxChain(ev); break;
        case 'omen': fxOmen(ev); break;
        case 'lightning': await fxLightning(ev); break;
        case 'fizzle': fxFizzle(ev); break;
        case 'seal': await fxSeal(ev); break;
        case 'gateFail': await fxGateFail(ev); break;
        case 'gateOpen': await fxGateOpen(ev); break;
        case 'sync': syncView(); break;
        default: break;
      }
    }
  }

  /* cá chép bơi vòng quanh ngôi sao rồi dừng lại: dừng trong cung sáng là thắng */
  async function fxRoll(ev) {
    const s = G.stars[ev.id], koi = G.koi, u = G.unit;
    const R = G.radius(s), orbit = R + 9 * u;
    const c = at(s);
    await koiFree;
    koi.mode = 'manual';
    s.rescue = ev.rescue || 0;
    s.p = s.pt = ev.p;
    s.result = 0;

    let a0;
    if (ev.again) a0 = s.mark;
    else {
      const sx = koi.x, sy = koi.y;
      a0 = Math.atan2(sy - c.y, sx - c.x);
      const ex = c.x + Math.cos(a0) * orbit, ey = c.y + Math.sin(a0) * orbit;
      const dist = Math.hypot(ex - sx, ey - sy);
      Sfx.dash();
      await G.tween(clamp(dist / (1000 * u), 0.1, 0.3), (k) => koi.head(lerp(sx, ex, k), lerp(sy, ey, k)), ease.inOut);
    }

    const final = s.arc + ev.u * TAU;
    const turns = ev.gate ? 3 : 2;
    const delta = (((final - a0) % TAU) + TAU) % TAU + TAU * turns;
    const T = ev.gate ? 2.5 : 1.2;
    const STEP = Math.PI / 6;
    let lastTick = Math.floor(a0 / STEP), lastBeat = -1;
    s.rolling = true; s.mark = a0;
    if (ev.gate) Sfx.gateRise(T / G.speed);
    await G.tween(T, (k, raw) => {
      const a = a0 + delta * k;
      s.mark = a;
      koi.head(c.x + Math.cos(a) * orbit, c.y + Math.sin(a) * orbit, a + Math.PI / 2);
      const tk = Math.floor(a / STEP);
      if (tk !== lastTick) { lastTick = tk; Sfx.tick(1 - raw); }
      if (ev.gate && raw > 0.55) { const b = Math.floor((raw - 0.55) / 0.15); if (b !== lastBeat) { lastBeat = b; Sfx.heartbeat(); } }
    }, ev.gate ? ease.outQuart : ease.outCubic);

    s.mark = final;
    s.result = ev.success ? 1 : -1;
    if (ev.rescued) {
      G.text(c.x, c.y - R - 16 * u, 'SÁT NÚT · VẪN TÍNH!', { color: 'jade', size: 12.5 });
      Sfx.shield();
    } else if (!ev.success) {
      const past = ev.u - ev.p - (ev.rescue || 0), before = 1 - ev.u;
      if (Math.min(past, before) < 0.04) { G.text(c.x, c.y - R - 16 * u, 'SÁT NÚT!', { color: 'rose', size: 12.5 }); Sfx.near(); }
    }
    await G.wait(ev.gate ? 0.26 : 0.12);
  }

  async function fxSecond(ev) {
    const s = G.stars[ev.id];
    UI.banner('Lật Vận', 'Trượt rồi, nhưng trời cho quay lại một lần', 'jade', 1.3);
    Sfx.second();
    UI.setHearts(run.hp, run.maxHp, lv.shield, ev.left);
    const c = at(s);
    G.ring(c.x, c.y, 'jade', G.radius(s) * 3, G.radius(s), 0.4, 2.5);
    await G.wait(0.75);
    s.result = 0;
  }

  const cascadeDelay = (n) => Math.max(0.065, 0.2 - n * 0.013);

  async function fxLit(ev) {
    const s = G.stars[ev.id], koi = G.koi, u = G.unit;
    const R = G.radius(s);
    const c = at(s);
    lastLitN = ev.n;
    if (ev.via === 'manual') {
      const a = s.mark, kx = koi.x, ky = koi.y;
      Sfx.dash();
      await G.tween(0.085, (k) => koi.head(lerp(kx, c.x, k), lerp(ky, c.y, k)), ease.inCubic);
      const ox = c.x - Math.cos(a) * R * 2.4, oy = c.y - Math.sin(a) * R * 2.4;
      koiFree = G.tween(0.22, (k) => koi.head(lerp(c.x, ox, k), lerp(c.y, oy, k)), ease.outCubic);
    } else if (ev.via === 'shoot') {
      const sx = c.x + rand(-140, 140) * u;
      G.streak(sx, -30, c.x, c.y, 0.26, 'sky');
      Sfx.shoot();
      await G.wait(0.24);
    } else if (ev.via === 'thunder') {
      await G.wait(0.05);
    } else {
      await G.wait(cascadeDelay(ev.n));
    }

    s.state = 'lit'; s.litT = G.time; s.rolling = false; s.omen = false; s.clover = false;
    const big = ev.crit || ev.type === 'nova' || ev.type === 'cursed' || ev.type === 'fortune';
    const col = litColor(ev.type);
    G.burst(c.x, c.y, col, big ? 34 : 16, (big ? 260 : 190) * u, { streak: true, life: 0.65 });
    G.burst(c.x, c.y, 'white', 6, 70 * u, { life: 0.4, size: 7 });
    G.ring(c.x, c.y, col, R * 0.6, R * (big ? 5.2 : 3.2), 0.5, 3);
    G.flashBG('gold', Math.min(0.3, 0.05 + ev.n * 0.018));
    G.shake(Math.min(10, 2 + ev.n * 0.55) + (big ? 3 : 0));
    G.punch(Math.min(0.022, 0.004 + ev.n * 0.0015));

    const sz = clamp(12 + Math.log2(ev.gain + 1) * 1.15, 12, 26);
    G.text(c.x, c.y - R - 8 * u, '+' + fmt(ev.gain), { color: 'gold', size: sz });
    if (ev.crit) {
      G.text(c.x, c.y - R - 30 * u, 'ĐẠI CÁT ×3', { color: 'white', size: 15, dur: 1.4 });
      G.ring(c.x, c.y, 'white', R, R * 7, 0.7, 4);
      G.flashBG('gold', 0.3);
    } else if (ev.bold && ev.via === 'manual') {
      G.text(c.x, c.y - R - 28 * u, 'LIỀU ĂN NHIỀU!', { color: 'amber', size: 12.5, dur: 1.2 });
    }
    if (ev.via === 'manual') { Sfx.lit(ev.streak, ev.crit); buzz(ev.crit ? [12, 30, 24] : 10); } else Sfx.cascade(ev.streak);

    const purse = UI.pursePos();
    const n = clamp(Math.round(Math.log2(ev.gain + 1)) - 2, 1, 7);
    for (let i = 0; i < n; i++) {
      G.fly(c.x, c.y, purse.x, purse.y, 'gold', i === 0 ? () => { UI.bumpPurse(); Sfx.coin(ev.n); } : null, i * 0.045);
    }
    UI.setPearls(ev.pearls);
    UI.setStreak(ev.streak, ev.mult);
    koi.anchor = { x: c.x, y: c.y + R + 22 * u };
  }

  function fxSpread(ev) {
    const t = G.stars[ev.to], u = G.unit;
    G.flow(ev.from, ev.to, ev.white ? 'white' : 'gold', 0.2);
    const pop = lastLitN <= 2;
    G.wait(0.17).then(() => {
      if (t.state !== 'dormant') return;
      G.setOdds(ev.to, Math.max(t.pt, ev.p));
      const R = G.radius(t), c = at(t);
      if (pop && !t.hidden) G.text(c.x + R * 1.05, c.y - R * 0.95, '+' + Math.round(ev.amt * 100) + '%', { color: 'jade', size: 10.5, dur: 0.85, vy: -20 });
    });
  }
  function fxDrain(ev) {
    const t = G.stars[ev.to], u = G.unit;
    G.flow(ev.to, ev.from, 'violet', 0.3);
    G.wait(0.1).then(() => {
      if (t.state !== 'dormant') return;
      G.setOdds(ev.to, ev.p);
      t.shake = 0.6;
      const R = G.radius(t), c = at(t);
      if (!t.hidden) G.text(c.x + R * 1.05, c.y - R * 0.95, '−' + Math.round(ev.amt * 100) + '%', { color: 'rose', size: 10.5, dur: 0.9, vy: 16 });
    });
  }

  async function fxVoid(ev) {
    const s = G.stars[ev.id], koi = G.koi, u = G.unit;
    const R = G.radius(s), c = at(s);
    if (ev.why === 'fail') {
      const a = s.mark, kx = koi.x, ky = koi.y;
      koiFree = G.tween(0.3, (k) => koi.head(kx + Math.cos(a) * 30 * u * k, ky + Math.sin(a) * 30 * u * k), ease.outCubic);
      s.shake = 1;
      await G.wait(0.1);
    } else if (ev.why === 'wrath') {
      const g = at(G.stars[lv.gate]);
      G.bolt(g.x, g.y, c.x, c.y);
      Sfx.thunder();
      G.flashBG('violet', 0.3);
      await G.wait(0.16);
    }
    s.state = 'void'; s.voidT = G.time; s.rolling = false; s.omen = false; s.clover = false;
    G.implode(c.x, c.y, 'violet', 30, R * 4.5);
    G.ring(c.x, c.y, 'violet', R * 4, R * 0.4, 0.45, 2.5);
    G.ring(c.x, c.y, 'rose', R, R * 4.5, 0.6, 2);
    G.shake(ev.why === 'fail' ? 10 : 7);
    G.flashBG('rose', 0.14);
    if (ev.why !== 'wrath') Sfx.fail();
    if (ev.why === 'fail') buzz(45);
    G.text(c.x, c.y - R - 8 * u, ev.why === 'fail' ? 'TRƯỢT' : 'SỤP ĐỔ', { color: 'rose', size: 14 });
    await G.wait(ev.why === 'fail' ? 0.34 : 0.28);
  }

  async function fxHp(ev) {
    const koi = G.koi, u = G.unit;
    UI.setHearts(ev.hp, run.maxHp, lv.shield, lv.rerolls);
    UI.hurt();
    koi.hurt = 1;
    Sfx.hurt();
    G.shake(7);
    G.text(koi.x, koi.y - 24 * u, '−' + (-ev.d) + ' ❤', { color: 'rose', size: 16, dur: 1.2 });
    G.burst(koi.x, koi.y, 'rose', 12, 140 * u, { life: 0.5 });
    await G.wait(0.3);
  }
  async function fxShield(ev) {
    const koi = G.koi, u = G.unit;
    UI.setHearts(run.hp, run.maxHp, ev.left, lv.rerolls);
    G.ring(koi.x, koi.y, 'jade', 10 * u, 70 * u, 0.5, 3);
    G.burst(koi.x, koi.y, 'jade', 16, 150 * u, { life: 0.5 });
    G.text(koi.x, koi.y - 24 * u, 'GIÁP VẢY ĐỠ ĐÒN', { color: 'jade', size: 13, dur: 1.2 });
    Sfx.shield();
    await G.wait(0.35);
  }
  function fxHeal(ev) {
    const u = G.unit;
    const p = ev.id != null ? at(G.stars[ev.id]) : { x: G.koi.x, y: G.koi.y };
    UI.setHearts(ev.hp, run.maxHp, lv.shield, lv.rerolls);
    if (ev.d > 0) {
      G.text(p.x, p.y - 44 * u, '+' + ev.d + ' ❤', { color: 'rose', size: 16, dur: 1.3, delay: 0.1 });
      G.burst(p.x, p.y, 'rose', 16, 130 * u, { life: 0.7, g: -60 });
      Sfx.heal();
    } else {
      G.text(p.x, p.y - 44 * u, '❤ đã đầy', { color: 'rose', size: 11.5, dur: 1.1, delay: 0.1 });
    }
  }
  function fxGainClover(ev) {
    const s = G.stars[ev.id], u = G.unit, c = at(s), t = UI.cloverPos();
    G.text(c.x, c.y - G.radius(s) - 30 * u, '+1 CỎ BỐN LÁ', { color: 'jade', size: 12.5, dur: 1.3 });
    G.fly(c.x, c.y, t.x, t.y, 'jade', () => UI.setClovers(run.clovers, run.cloverArmed));
    Sfx.clover();
  }
  async function fxClover(ev) {
    const s = G.stars[ev.id], u = G.unit, R = G.radius(s), c = at(s);
    s.clover = true;
    G.setOdds(ev.id, ev.p);
    G.ring(c.x, c.y, 'jade', R * 3.4, R, 0.36, 2.5);
    G.burst(c.x, c.y, 'jade', 16, 120 * u, { life: 0.6 });
    G.text(c.x, c.y - R - 12 * u, '+30%', { color: 'jade', size: 15 });
    Sfx.clover();
    UI.setClovers(ev.n, false);
    await G.wait(0.42);
  }

  async function fxMystery(ev) {
    const s = G.stars[ev.id], u = G.unit, R = G.radius(s), c = at(s), r = ev.res;
    await G.wait(0.12);
    G.ring(c.x, c.y, 'violet', R, R * 4.4, 0.6, 3);
    G.burst(c.x, c.y, 'violet', 24, 210 * u, { streak: true, life: 0.7 });
    let label, col = 'violet', tier = 0;
    if (r.k === 'pearls') {
      label = 'TRÚNG LỚN +' + fmt(r.gain); col = 'gold'; tier = 1;
      const p = UI.pursePos();
      for (let i = 0; i < 9; i++) G.fly(c.x, c.y, p.x, p.y, 'gold', i % 3 === 0 ? () => { UI.bumpPurse(); Sfx.coin(i); } : null, i * 0.04);
      UI.setPearls(r.pearls);
    } else if (r.k === 'life') {
      label = 'LINH ĐAN'; col = 'rose';
    } else if (r.k === 'clover') {
      label = '+2 CỎ BỐN LÁ'; col = 'jade';
      const t = UI.cloverPos();
      G.fly(c.x, c.y, t.x, t.y, 'jade', () => UI.setClovers(run.clovers, run.cloverArmed));
    } else if (r.k === 'charm') {
      const ch = Core.CHARM_BY_ID[r.id];
      label = 'BẢO VẬT!'; col = ch.r === 2 ? 'gold' : ch.r === 1 ? 'violet' : 'jade'; tier = 2;
      UI.setCharms(run, 'charms', r.id);
      UI.banner(ch.name, ch.desc, ch.r === 2 ? '' : 'jade', 2.3);
    } else {
      label = 'MƯA SAO BĂNG'; col = 'sky'; tier = 2;
    }
    G.text(c.x, c.y + R + 22 * u, label, { color: col, size: 14, dur: 1.5, vy: 16 });
    Sfx.mystery(tier);
    await G.wait(r.k === 'charm' ? 0.9 : 0.42);
  }

  function fxNova(ev) {
    const s = G.stars[ev.id], u = G.unit, R = G.radius(s), c = at(s);
    G.ring(c.x, c.y, 'sky', R, R * 8, 0.75, 5);
    G.ring(c.x, c.y, 'white', R, R * 5, 0.5, 3);
    G.burst(c.x, c.y, 'sky', 46, 380 * u, { streak: true, life: 0.8 });
    G.flashBG('sky', 0.32);
    G.shake(11); G.punch(0.02);
    G.text(c.x, c.y - R - 30 * u, 'SIÊU TÂN TINH', { color: 'sky', size: 14, dur: 1.4 });
    Sfx.nova();
  }
  function fxShoot(ev) {
    const s = G.stars[ev.from], u = G.unit, c = at(s);
    G.text(c.x, c.y + G.radius(s) + 24 * u, 'SAO ĐỔI NGÔI', { color: 'sky', size: 11.5, dur: 1.1 });
  }

  async function fxChain(ev) {
    const n = ev.n;
    if (n < 3) return;
    const word = n >= 14 ? 'Thần Thoại' : n >= 10 ? 'Thiên Vận' : n >= 7 ? 'Đại Cát' : n >= 5 ? 'Tuyệt Diệu' : 'Dây Chuyền';
    UI.banner(word, 'Dây chuyền ' + n + ' sao · +' + fmt(ev.pearls) + ' ngọc', '', n >= 7 ? 1.9 : 1.4);
    Sfx.chainEnd(n);
    G.shake(Math.min(18, 4 + n));
    G.flashBG('gold', Math.min(0.5, 0.08 + n * 0.03));
    G.punch(Math.min(0.05, 0.007 * n));
    if (n >= 5) {
      const u = G.unit;
      G.burst(G.W / 2, G.H * 0.45, 'gold', Math.min(110, n * 9), 520 * u, { streak: true, life: 1.1, drag: 1.6, g: 160 });
      G.burst(G.W / 2, G.H * 0.45, 'jade', Math.min(40, n * 3), 420 * u, { streak: true, life: 1.1, drag: 1.6, g: 160 });
    }
    teach('chain', 'Đó là dây chuyền: sao chạm 100% tự bùng cháy và nối dài chuỗi thắng.', 6000);
    await G.wait(n >= 7 ? 0.75 : 0.4);
  }

  function fxOmen(ev) {
    const s = G.stars[ev.id], u = G.unit, c = at(s);
    s.omen = true;
    G.text(c.x, c.y - G.radius(s) - 14 * u, 'SÉT SẮP ĐÁNH', { color: 'gold', size: 11.5, dur: 1.6 });
    Sfx.omen();
  }
  async function fxLightning(ev) {
    const s = G.stars[ev.id], u = G.unit, c = at(s);
    s.omen = false;
    G.bolt(c.x + rand(-70, 70) * u, -30, c.x, c.y);
    G.flashBG('white', 0.45);
    G.shake(15);
    Sfx.thunder();
    UI.banner(ev.bless ? 'Sét Lành' : 'Sét Dữ', ev.bless ? 'Thiên lôi thắp sáng ngôi sao' : 'Thiên lôi đánh sụp ngôi sao', ev.bless ? '' : 'bad', 1.3);
    await G.wait(0.28);
  }
  function fxFizzle(ev) {
    const s = G.stars[ev.id], u = G.unit, c = at(s);
    s.omen = false;
    G.text(c.x, c.y - G.radius(s) - 14 * u, 'TRÁNH ĐƯỢC SÉT', { color: 'jade', size: 11.5, dur: 1.2 });
  }

  async function fxSeal(ev) {
    const s = G.stars[ev.id], koi = G.koi, u = G.unit, R = G.radius(s), c = at(s);
    s.rolling = false; s.seals = ev.n; s.pulse = 1;
    Sfx.seal(ev.n);
    G.ring(c.x, c.y, 'gold', R, R * 6, 0.8, 4);
    G.ring(c.x, c.y, 'white', R, R * 3.5, 0.5, 3);
    G.burst(c.x, c.y, 'gold', 46, 320 * u, { streak: true, life: 0.8 });
    G.flashBG('gold', 0.36); G.shake(13); G.punch(0.03);
    UI.banner('Ấn thứ ' + ['nhất', 'hai', 'ba'][ev.n - 1] + ' đã vỡ', 'Còn ' + (ev.need - ev.n) + ' ấn · thiên phạt giáng xuống chòm sao', '', 1.8);
    G.text(c.x, c.y + R + 40 * u, '+' + fmt(ev.gain), { color: 'gold', size: 18 });
    UI.setPearls(ev.pearls); UI.setStreak(ev.streak, ev.mult);
    koi.anchor = { x: c.x, y: c.y + R + 46 * u };
    koi.mode = 'wander';
    await G.wait(1.0);
  }
  async function fxGateFail(ev) {
    const s = G.stars[ev.id], koi = G.koi, u = G.unit, R = G.radius(s), c = at(s);
    s.shake = 1;
    Sfx.gateFail(); buzz(60);
    G.shake(13); G.flashBG('rose', 0.2);
    G.ring(c.x, c.y, 'rose', R, R * 3.2, 0.55, 3);
    G.implode(c.x, c.y, 'rose', 20, R * 3);
    G.text(c.x, c.y + R + 34 * u, 'CỔNG CHƯA MỞ · lần sau +' + Math.round(Core.GATE_PITY * 100) + '%', { color: 'rose', size: 12.5, dur: 1.7, vy: 14 });
    const kx = koi.x, ky = koi.y;
    koiFree = G.tween(0.4, (k) => koi.head(lerp(kx, c.x, k * 0.3), lerp(ky, c.y + R + 60 * u, k)), ease.outCubic);
    koi.anchor = { x: c.x, y: c.y + R + 56 * u };
    await G.wait(0.3);
    s.rolling = false;
    G.setOdds(ev.id, ev.p);
    await G.wait(0.3);
  }
  async function fxGateOpen(ev) {
    const s = G.stars[ev.id], koi = G.koi, u = G.unit, R = G.radius(s), c = at(s);
    const final = run.won;
    await koiFree;
    s.rolling = false; s.state = 'lit'; s.litT = G.time; s.seals = ev.n;
    Sfx.gateOpen(); buzz([20, 40, 20, 40, 60]);
    G.tween(1.0, (k) => { s.open = k; }, ease.outCubic);
    G.ring(c.x, c.y, 'gold', R, R * 9, 1.0, 6);
    G.ring(c.x, c.y, 'white', R, R * 6, 0.7, 4);
    G.ring(c.x, c.y, 'sky', R, R * 4, 0.5, 3);
    G.burst(c.x, c.y, 'gold', 90, 480 * u, { streak: true, life: 1.1, drag: 1.8 });
    G.burst(c.x, c.y, 'white', 30, 300 * u, { life: 0.8 });
    G.flashBG('gold', 0.6); G.shake(18); G.punch(0.05);
    UI.banner(final ? 'Vũ Môn Mở' : 'Thiên Môn Mở', '+' + fmt(ev.gain + ev.bonus) + ' ngọc', '', 2.0);
    UI.setPearls(ev.pearls); UI.setStreak(ev.streak, ev.mult);
    const p = UI.pursePos();
    for (let i = 0; i < 12; i++) G.fly(c.x, c.y, p.x, p.y, 'gold', i % 3 === 0 ? () => { UI.bumpPurse(); Sfx.coin(i); } : null, 0.2 + i * 0.05);

    // cá chép vọt qua cổng
    koi.mode = 'manual';
    const kx = koi.x, ky = koi.y;
    await G.tween(0.34, (k) => koi.head(lerp(kx, c.x, k), lerp(ky, c.y + R * 0.4, k)), ease.inOut);
    G.burst(c.x, c.y, 'sky', 40, 360 * u, { streak: true, life: 0.8 });
    Sfx.dash();
    const y0 = c.y + R * 0.4;
    await G.tween(0.62, (k) => koi.head(c.x + Math.sin(k * 5) * 8 * u, lerp(y0, -160 * u, k), -Math.PI / 2), ease.inCubic);
    await G.wait(0.55);
  }

  /* =======================================================================
     Luồng trò chơi
     ======================================================================= */
  function showTitle() {
    state = 'title'; busy = false;
    run = null; lv = null;
    UI.hud(false);
    UI.hide('scr-end'); UI.hide('scr-shop'); UI.hide('scr-help');
    UI.hint('');
    G.stars = []; G.edges = [];
    G.world.alpha = 1; G.world.oy = 0;
    G.setPalette(Core.HEAVENS[0].pal);
    const koi = G.koi;
    koi.setStage(save.wins > 0 ? 2 : 0); koi.big = save.wins > 0 ? 1.8 : 2.3; koi.wr = 2; koi.alpha = 1; koi.mode = 'wander'; koi.pearl = false;
    relayout();
    if (koi.y < -20 || koi.y > G.H + 20) koi.tele(G.W / 2, G.H + 60, -Math.PI / 2);
    kiep = Math.min(kiep, save.kiep);
    UI.title(save, kiep, (k) => { kiep = k; Sfx.ui(); });
    UI.show('scr-title');
  }

  function startRun() {
    Sfx.init(); Sfx.resume();
    run = Core.newRun({ kiep });
    lv = Core.genLevel(run);
    told = {};
    UI.hide('scr-title'); UI.hide('scr-end');
    UI.hud(true);
    UI.resetHearts();
    enterLevel(true);
  }

  async function enterLevel(first) {
    state = 'play'; busy = true;
    const cfg = lv.cfg, koi = G.koi;
    G.setPalette(cfg.pal);
    Sfx.mood(run.level);
    koi.setStage(run.level >= 6 ? 2 : run.level >= 3 ? 1 : 0);
    koi.big = 1; koi.wr = 1; koi.alpha = 1; koi.pearl = false;
    syncHUD(true);
    G.setLevel(lv, run, (m) => Core.oddsOf(run, lv, m));
    relayout();
    syncView();
    G.world.alpha = 0; G.world.oy = -90;
    const sc0 = G.scroll;
    G.tween(0.9, (k) => { G.world.alpha = k; G.world.oy = -90 * (1 - k); G.scroll = sc0 + 0.22 * k; }, ease.outCubic);
    const ax = G.play.x + G.play.w / 2, ay = G.play.y + G.play.h - 24 * G.unit;
    koi.anchor = { x: ax, y: ay };
    koi.mode = 'wander';
    if (first || koi.y < -20 || koi.y > G.H + 20) koi.tele(ax, G.H + 80, -Math.PI / 2);
    UI.banner('Tầng ' + run.level + ' · ' + cfg.name, cfg.sub, cfg.boss ? 'boss' : '', 2.5);
    for (let r = 0; r <= lv.rowIds.length; r++) G.wait(0.35 + r * 0.085).then(() => Sfx.spawn(r * 2));
    await G.wait(1.2);
    busy = false;
    if (run.level === 1) teach('start', 'Chạm một ngôi sao ở hàng dưới để thử vận. Cung sáng càng dài, càng dễ thắp.', 8000);
    else if (run.level === 2) teach('clover', 'Gặp sao khó? Bấm cỏ bốn lá ở góc dưới rồi chạm sao để cộng 30%.', 7500);
  }

  async function tapStar(id) {
    if (state !== 'play' || busy || !lv) return;
    const ms = lv.stars[id];
    if (!ms || ms.state !== 'dormant') return;
    busy = true;
    UI.tip(null); UI.hint('');
    G.hover = -1;
    const events = Core.roll(run, lv, id);
    try { await play(events); } catch (err) { if (window.console) console.error(err); }
    await koiFree;
    syncView(); syncHUD();
    if (run.dead) return gameOver();
    if (lv.done) return levelClear();
    G.koi.mode = 'wander';
    busy = false;

    // lời nhắc theo tình huống
    const lit = events.some((e) => e.t === 'lit'), voided = events.some((e) => e.t === 'void' && e.why === 'fail');
    if (voided && teach('void', 'Trượt! Sao sụp thành hố đen, hút vận của sao kề bên và bạn mất 1 ❤.')) return;
    if (lit && teach('lit', 'Sao sáng vừa lan vận sang các sao kề bên. Cứ thắp tiếp để nuôi vận lên cao.')) return;
    const gate = lv.stars[lv.gate];
    if (Core.oddsOf(run, lv, gate) >= 0.5) teach('gate', 'Thiên Môn ở đỉnh đã đủ sáng. Thắp nó để lên tầng, hoặc ở lại vét thêm ngọc.', 8000);
  }

  async function levelClear() {
    state = 'clear';
    save.seen = save.seen || run.level >= 2;
    const sc0 = G.scroll;
    await G.tween(0.8, (k) => { G.world.alpha = 1 - k; G.world.oy = 130 * k; G.scroll = sc0 + 0.3 * k; }, ease.inOut);
    G.stars = []; G.edges = [];
    G.world.oy = 0;
    if (run.won) return victory();
    shop = Core.genShop(run);
    state = 'shop';
    UI.shop.clearStick();
    renderShop(true);
    UI.show('scr-shop');
    $('scr-shop').scrollTop = 0;
  }

  function renderShop(animate) {
    const next = Core.HEAVENS[run.level];
    UI.shop.render(run, shop, {
      n: run.level, name: lv.cfg.name, earned: lv.earned, chain: run.stats.bestChain,
      nextN: run.level + 1, nextName: next.name,
    }, animate);
    if (animate) shop.offers.forEach((o, i) => setTimeout(() => Sfx.card(i, Core.CHARM_BY_ID[o.id].r), 130 + i * 110));
    UI.setCharms(run, 'charms');
  }

  async function nextLevel() {
    if (state !== 'shop' || stickBusy) return;
    if (!shop.picked && shop.offers.length) {
      Sfx.deny();
      const note = $('shop-pick-note');
      note.textContent = 'hãy chọn một lễ vật trước';
      $('shop-cards').scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    Sfx.ui();
    UI.hide('scr-shop');
    lv = Core.nextLevel(run);
    persist();
    enterLevel(false);
  }

  function finishRun(won) {
    save.runs++;
    save.best = Math.max(save.best, won ? 9 : run.level);
    save.bestScore = Math.max(save.bestScore, run.score);
    save.seen = true;
    if (won) { save.wins++; save.kiep = Math.max(save.kiep, Math.min(9, run.kiep + 1)); }
    persist();
  }
  function runStats() {
    return [
      ['Ngọc', fmt(run.score)],
      ['Chuỗi thắng', String(run.stats.bestStreak)],
      ['Dây chuyền', String(run.stats.bestChain)],
      ['Sao đã thắp', String(run.stats.lit)],
      ['Hố đen', String(run.stats.voids)],
      ['Đại Cát', String(run.stats.crits)],
    ];
  }

  async function gameOver() {
    state = 'over';
    const koi = G.koi, u = G.unit;
    Sfx.over();
    for (const p of koi.pts) G.burst(p.x, p.y, 'rose', 4, 90 * u, { life: 1.2, drag: 1.2, g: -30 });
    G.burst(koi.x, koi.y, 'white', 20, 160 * u, { life: 0.9 });
    G.tween(0.9, (k) => { koi.alpha = 1 - k; G.world.alpha = 1 - 0.7 * k; });
    UI.banner('Vận Tận', '', 'bad', 1.9);
    await G.wait(1.7);
    finishRun(false);
    UI.end({
      win: false, run,
      eyebrow: 'Kiếp ' + (run.kiep + 1) + ' · dừng ở tầng ' + run.level + '/9',
      title: 'Vận Tận',
      sub: 'Cá chép kiệt sức ở ' + lv.cfg.name + '. Ngân Hà vẫn chảy, Vũ Môn vẫn chờ.',
      stats: runStats(),
      again: 'Thử vận lần nữa',
    });
  }

  async function victory() {
    state = 'win';
    const koi = G.koi, u = G.unit;
    UI.hud(false);
    G.setPalette(['#1a1204', '#c8901a', '#fff1b8']);
    koi.setStage(3); koi.big = clamp(G.W / 400, 1.1, 1.6); koi.alpha = 1; koi.mode = 'manual'; koi.pearl = true;
    koi.tele(G.W / 2, G.H + 120, -Math.PI / 2);
    Sfx.roar();
    await G.wait(0.5);
    Sfx.win();
    UI.banner('Hóa Rồng', 'Cá chép đã vượt Vũ Môn', '', 3.4);
    G.flashBG('gold', 0.6);
    const cx = G.W / 2, amp = Math.min(G.W * 0.34, 260);
    let lastBurst = 0;
    await G.tween(3.6, (k) => {
      const y = lerp(G.H + 120, G.H * 0.3, k);
      const x = cx + Math.sin(k * TAU * 1.6) * amp * (1 - k * 0.45);
      koi.head(x, y);
      if (k - lastBurst > 0.07) {
        lastBurst = k;
        G.burst(x, y, Math.random() < 0.5 ? 'gold' : 'jade', 14, 220 * u, { streak: true, life: 0.9 });
        G.ring(x, y, 'gold', 8 * u, 70 * u, 0.6, 2.5);
        G.shake(4);
      }
    }, ease.inOut);
    koi.anchor = { x: cx, y: G.H * 0.26 }; koi.wr = Math.min(2.6, G.W / 190); koi.mode = 'wander';
    for (let i = 0; i < 6; i++) {
      G.wait(i * 0.22).then(() => {
        const x = rand(0.15, 0.85) * G.W, y = rand(0.12, 0.5) * G.H;
        G.burst(x, y, ['gold', 'jade', 'sky', 'rose'][i % 4], 60, 340 * u, { streak: true, life: 1.3, drag: 1.9, g: 90 });
        G.ring(x, y, 'white', 4, 120 * u, 0.8, 3);
        G.flashBG('gold', 0.25);
        Sfx.lit(6 + i * 2, false);
      });
    }
    await G.wait(1.5);
    finishRun(true);
    UI.end({
      win: true, run,
      eyebrow: 'Kiếp ' + (run.kiep + 1) + ' · phá đảo chín tầng trời',
      title: 'Hóa Rồng',
      sub: 'Vận may đã đưa bạn qua Vũ Môn. Kiếp sau trời sẽ khắt khe hơn: mọi tỉ lệ thấp đi một bậc.',
      stats: runStats(),
      again: 'Luân hồi · Kiếp ' + (Math.min(9, run.kiep + 1) + 1),
    });
  }

  /* ---------- chú thích ngôi sao ---------- */
  function starTip(id) {
    if (busy || state !== 'play' || !lv) return;
    const ms = lv.stars[id], vs = G.stars[id];
    if (!ms || !vs) return;
    const T = Core.STAR_TYPES[ms.type];
    let h = '<b>' + T.name + '</b>';
    if (ms.state === 'lit') h += 'Đã thắp sáng. Đang lan vận cho các sao kề bên.';
    else if (ms.state === 'void') h += 'Hố đen. Đã hút bớt vận của các sao kề bên.';
    else {
      h += T.desc;
      if (vs.hidden) h += '<br><em>Sương che mất tỉ lệ.</em> Thắp một sao kề bên để soi rõ.';
      else {
        const pv = Core.preview(run, lv, id);
        h += '<br>Tỉ lệ <em>' + Math.round(pv.p * 100) + '%</em> · thắng được <em>+' + fmt(pv.gain) + '</em> ngọc';
      }
    }
    const c = at(vs);
    UI.tip(h, c.x, c.y - G.radius(vs) - 10);
  }

  /* ---------- nhập liệu ---------- */
  function bind() {
    const fx = $('fx');
    let press = null, holdTimer = 0, held = false;

    fx.addEventListener('pointerdown', (e) => {
      Sfx.init();
      if (state !== 'play') return;
      const id = G.starAt(e.clientX, e.clientY);
      press = { x: e.clientX, y: e.clientY, id };
      held = false;
      clearTimeout(holdTimer);
      if (id >= 0 && e.pointerType !== 'mouse') holdTimer = setTimeout(() => { held = true; starTip(id); }, 420);
    });
    fx.addEventListener('pointermove', (e) => {
      if (press) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 16) { clearTimeout(holdTimer); press.id = -1; if (held) UI.tip(null); }
        return;
      }
      if (e.pointerType !== 'mouse') return;
      const id = state === 'play' && !busy ? G.starAt(e.clientX, e.clientY) : -1;
      if (id !== G.hover) {
        G.hover = id;
        fx.style.cursor = id >= 0 && lv && lv.stars[id].state === 'dormant' ? 'pointer' : 'default';
        if (id >= 0) starTip(id); else UI.tip(null);
      }
    });
    fx.addEventListener('pointerup', () => {
      clearTimeout(holdTimer);
      const p = press; press = null;
      if (held) { held = false; UI.tip(null); return; }
      if (!p || p.id < 0) return;
      tapStar(p.id);
    });
    fx.addEventListener('pointercancel', () => { clearTimeout(holdTimer); press = null; UI.tip(null); });
    fx.addEventListener('pointerleave', () => { G.hover = -1; if (!press) UI.tip(null); });

    $('btn-start').addEventListener('click', startRun);
    $('btn-how').addEventListener('click', () => { Sfx.init(); Sfx.ui(); UI.show('scr-help'); });
    $('btn-help').addEventListener('click', () => { Sfx.ui(); UI.show('scr-help'); });
    $('btn-help-ok').addEventListener('click', () => { Sfx.ui(); UI.hide('scr-help'); });
    $('btn-again').addEventListener('click', () => { if (run && run.won) kiep = Math.min(9, run.kiep + 1); startRun(); });
    $('btn-home').addEventListener('click', () => { Sfx.ui(); showTitle(); });

    $('btn-clover').addEventListener('click', () => {
      if (state !== 'play' || busy || !run) return;
      if (run.clovers <= 0) { Sfx.deny(); UI.hint('Hết cỏ bốn lá. Tìm Sao Ước hoặc mua ở Chợ Trời.', 3200); return; }
      const on = Core.toggleClover(run);
      Sfx.ui();
      UI.setClovers(run.clovers, on);
      UI.hint(on ? 'Chạm một ngôi sao: cỏ bốn lá cộng thẳng 30% cho nó rồi thử vận luôn.' : '', 4200);
    });
    $('btn-sound').addEventListener('click', () => {
      Sfx.init();
      save.muted = !save.muted; Sfx.setMuted(save.muted); persist();
      $('btn-sound').setAttribute('aria-pressed', save.muted ? 'false' : 'true');
      $('btn-sound').textContent = save.muted ? '×' : '♪';
      if (!save.muted) Sfx.ui();
    });
    $('btn-speed').addEventListener('click', () => {
      save.fast = !save.fast; G.speed = save.fast ? 1.8 : 1; persist();
      $('btn-speed').setAttribute('aria-pressed', save.fast ? 'true' : 'false');
      Sfx.ui();
      UI.hint(save.fast ? 'Quay nhanh: bật' : 'Quay nhanh: tắt', 1600);
    });

    const charmTip = (e) => {
      const b = e.target.closest('.gem'); if (!b || !b.dataset.id) return;
      const c = Core.CHARM_BY_ID[b.dataset.id], r = b.getBoundingClientRect();
      const n = run ? run.charms[c.id] || 0 : 0;
      UI.tip('<b>' + c.icon + ' ' + c.name + (n > 1 ? ' ×' + n : '') + '</b>' + c.desc, r.left + r.width / 2, r.top - 4);
      clearTimeout(charmTip.t);
      charmTip.t = setTimeout(() => UI.tip(null), 3200);
    };
    $('charms').addEventListener('click', charmTip);
    $('end-charms').addEventListener('click', charmTip);

    // Chợ Trời
    $('shop-cards').addEventListener('click', (e) => {
      const b = e.target.closest('.card'); if (!b || state !== 'shop') return;
      const i = +b.dataset.i, o = shop.offers[i];
      if (Core.pickBoon(run, shop, i)) {
        Sfx.buy(); Sfx.card(i, Core.CHARM_BY_ID[o.id].r);
        renderShop(false);
        UI.setHearts(run.hp, run.maxHp, 0, 0);
      }
    });
    $('btn-reroll').addEventListener('click', () => {
      if (state !== 'shop') return;
      if (Core.rerollBoons(run, shop)) { Sfx.shake(); UI.setPearls(run.pearls); renderShop(true); } else Sfx.deny();
    });
    $('buy-heal').addEventListener('click', () => {
      if (state !== 'shop') return;
      if (Core.buyHeal(run, shop)) { Sfx.heal(); UI.setPearls(run.pearls); UI.setHearts(run.hp, run.maxHp, 0, 0); renderShop(false); } else Sfx.deny();
    });
    $('buy-clover').addEventListener('click', () => {
      if (state !== 'shop') return;
      if (Core.buyClover(run, shop)) { Sfx.clover(); UI.setPearls(run.pearls); UI.setClovers(run.clovers, false); renderShop(false); } else Sfx.deny();
    });
    $('buy-stick').addEventListener('click', () => {
      if (state !== 'shop' || stickBusy) return;
      if (run.pearls < shop.stick || shop.sticks >= 3) { Sfx.deny(); return; }
      stickBusy = true;
      const btn = $('buy-stick');
      btn.classList.add('shaking');
      Sfx.shake();
      UI.shop.stick('Ống xăm lắc lắc…', 0);
      setTimeout(() => {
        btn.classList.remove('shaking');
        const res = Core.drawStick(run, shop);
        stickBusy = false;
        if (!res) { renderShop(false); return; }
        let text;
        if (res.k === 'charm') { const c = Core.CHARM_BY_ID[res.id]; text = 'Nhận bảo vật ' + c.icon + ' ' + c.name + ': ' + c.desc; }
        else if (res.k === 'clover') text = 'Nhận 2 cỏ bốn lá.';
        else if (res.k === 'life') text = 'Hồi 1 ❤.';
        else text = 'Quẻ xấu. Hoàn lại ' + fmt(res.gain) + ' ngọc.';
        UI.shop.stick('<b>Quẻ ' + res.label + '</b>' + text, res.tier);
        if (res.tier === 0) Sfx.near(); else Sfx.mystery(res.tier);
        if (res.tier >= 2) Sfx.buy();
        UI.setPearls(run.pearls); UI.setHearts(run.hp, run.maxHp, 0, 0); UI.setClovers(run.clovers, false);
        renderShop(false);
      }, 780);
    });
    $('btn-next').addEventListener('click', nextLevel);

    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', () => setTimeout(relayout, 250));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) Sfx.resume(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') UI.hide('scr-help');
    });
  }

  /* ---------- khởi động ---------- */
  function boot() {
    loadSave();
    G.init($('bg'), $('fx'));
    G.speed = save.fast ? 1.8 : 1;
    Sfx.setMuted(!!save.muted);
    $('btn-sound').setAttribute('aria-pressed', save.muted ? 'false' : 'true');
    $('btn-sound').textContent = save.muted ? '×' : '♪';
    $('btn-speed').setAttribute('aria-pressed', save.fast ? 'true' : 'false');
    bind();
    kiep = 0;
    G.setPalette(Core.HEAVENS[0].pal, true);
    showTitle();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout).catch(() => {});
  }

  // cửa hậu cho kiểm thử tự động
  window.__game = {
    get run() { return run; }, get lv() { return lv; }, get shop() { return shop; },
    get state() { return state; }, get busy() { return busy; },
    tapStar, startRun, nextLevel, showTitle, save,
    skipTo(n) {                       // nhảy thẳng tới một tầng (chỉ để thử nghiệm)
      if (!run) startRun();
      run.level = clamp(n, 1, 9) - 1;
      lv = Core.nextLevel(run);
      UI.hide('scr-shop');
      return enterLevel(false);
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
