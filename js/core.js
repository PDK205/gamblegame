/* ==========================================================================
   NGÂN HÀ VŨ MÔN — luật chơi thuần (không đụng DOM, chạy được cả trong Node)
   Mọi hành động trả về một danh sách "sự kiện"; phần hình ảnh chỉ việc diễn lại.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ---------- tiện ích ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);

  /* ---------- hằng số cân bằng ---------- */
  const FLOOR = 0.03;        // tỉ lệ thấp nhất của mọi ngôi sao
  const CLOVER = 0.30;       // cỏ bốn lá cộng thẳng vào một sao
  const GATE_SPREAD = 1.5;   // Thiên Môn hưởng vận lan mạnh hơn sao thường
  const GATE_PITY = 0.08;    // mỗi lần trượt cổng, cổng dễ hơn một chút
  const START_HP = 5;
  const FEVER_MAX = 12;      // số sao phải thắp để nạp đầy Thời Vận
  const FEVER_ROLLS = 3;     // Thời Vận kéo dài bấy nhiêu lượt thử
  const FEVER_ODDS = 0.15;   // trong Thời Vận: mọi tỉ lệ cộng thêm
  const FEVER_PEARL = 2;     // và ngọc nhân đôi

  /* ---------- chín tầng trời ---------- */
  const HEAVENS = [
    { name: 'Vân Tiêu',   sub: 'Nơi vận may chớm nở',                 rows: [3, 4, 3, 2],          hi: 0.92, lo: 0.60, gate: 0.15, pal: ['#081a3a', '#1c5fa8', '#59e0d0'] },
    { name: 'Nguyệt Cung', sub: 'Ánh trăng soi lối cá chép',           rows: [3, 4, 4, 3, 2],       hi: 0.87, lo: 0.51, gate: 0.12, pal: ['#0c1440', '#3a4fc0', '#b9c8ff'] },
    { name: 'Lôi Trì',    sub: 'Thiên kiếp · sét đánh may rủi khó lường', rows: [4, 4, 4, 3, 2],    hi: 0.82, lo: 0.43, gate: 0.10, pal: ['#0a0f33', '#5a3fd0', '#ffe27a'], boss: 'thunder' },
    { name: 'Tinh Hà',    sub: 'Dòng sông ngọc · lộc rơi đầy trời',    rows: [3, 4, 5, 4, 3, 2],    hi: 0.78, lo: 0.37, gate: 0.08, pal: ['#04202c', '#0f8a8a', '#ffd77a'], rich: true },
    { name: 'Ngọc Hư',    sub: 'Hung tinh lộ diện · liều thì ăn nhiều', rows: [4, 5, 4, 4, 3, 2],   hi: 0.73, lo: 0.31, gate: 0.06, pal: ['#12103a', '#7a3fc8', '#ff8ad0'], cursed: 2 },
    { name: 'Mê Vụ',      sub: 'Thiên kiếp · sương che mắt, vận khó dò', rows: [4, 4, 5, 4, 3, 2],  hi: 0.68, lo: 0.25, gate: 0.05, pal: ['#0a141f', '#35586c', '#8fb4c8'], boss: 'fog', cursed: 1 },
    { name: 'Hỏa Vân',    sub: 'Hố đen đói khát · hút vận gấp đôi',    rows: [4, 5, 5, 4, 4, 3, 2], hi: 0.64, lo: 0.20, gate: 0.04, pal: ['#2a0a18', '#c0392b', '#ffb347'], drain: 2, cursed: 2 },
    { name: 'Thái Hư',    sub: 'Cõi hư vô · hố đen chực sẵn',          rows: [4, 5, 5, 5, 4, 3, 2], hi: 0.60, lo: 0.16, gate: 0.03, pal: ['#07060f', '#3a2a7a', '#9d6bff'], preVoid: 3, cursed: 2 },
    { name: 'Vũ Môn',     sub: 'Thiên kiếp cuối · ba ấn phong long môn', rows: [4, 5, 5, 5, 4, 4, 3], hi: 0.55, lo: 0.11, gate: 0.00, pal: ['#171003', '#a87608', '#ffdf8a'], boss: 'dragon', seals: 3, cursed: 2 },
  ];

  /* ---------- các loại sao ---------- */
  const STAR_TYPES = {
    normal:  { name: 'Sao thường',   desc: 'Thắp sáng để nhận ngọc và lan vận.' },
    fortune: { name: 'Sao Tài Lộc',  desc: 'Ngọc ×4.' },
    life:    { name: 'Sao Sinh',     desc: 'Hồi 1 ❤ khi thắp sáng.' },
    wish:    { name: 'Sao Ước',      desc: 'Tặng 1 cỏ bốn lá.' },
    nova:    { name: 'Siêu Tân Tinh', desc: 'Bùng nổ: thắp luôn mọi sao kề bên.' },
    mystery: { name: 'Sao Bí Ẩn',    desc: 'Mở ra một phần thưởng ngẫu nhiên.' },
    cursed:  { name: 'Hung Tinh',    desc: 'Ngọc ×8, lan vận gấp đôi. Trượt mất 2 ❤.' },
    gate:    { name: 'Thiên Môn',    desc: 'Thắp sáng để vượt tầng. Trượt không sụp, nhưng mất 1 ❤.' },
  };

  /* ---------- bảo vật ---------- */
  // r: 0 = Thường, 1 = Hiếm, 2 = Thần
  const CHARMS = [
    { id: 'vayvang',   r: 0, max: 3, icon: 'Vảy', name: 'Vảy Vàng',        desc: 'Sao sáng lan thêm +3% vận cho sao kề.' },
    { id: 'co4la',     r: 0, max: 3, icon: 'Mầm', name: 'Mầm Bốn Lá',      desc: 'Mọi ngôi sao +3% tỉ lệ gốc.' },
    { id: 'loctroi',   r: 0, max: 3, icon: 'Lộc', name: 'Lộc Trời',        desc: '+30% ngọc từ mọi ngôi sao.' },
    { id: 'thienduyen', r: 0, max: 3, icon: 'Duyên', name: 'Thiên Duyên',     desc: 'Thiên Môn +12% tỉ lệ.' },
    { id: 'giapvay',   r: 0, max: 1, icon: 'Giáp', name: 'Giáp Vảy',        desc: 'Mỗi tầng, lần trượt đầu tiên không mất ❤.' },
    { id: 'ngocrong',  r: 0, max: 3, icon: 'Ngọc', name: 'Ngọc Rồng',       desc: '+1 ❤ tối đa và hồi ngay 1 ❤.' },
    { id: 'bicuc',     r: 1, max: 1, icon: 'Thái', name: 'Bĩ Cực Thái Lai', desc: 'Sau mỗi lần trượt, lượt kế tiếp +15% tỉ lệ.' },
    { id: 'thuathang', r: 1, max: 1, icon: 'Thắng', name: 'Thừa Thắng',      desc: 'Mỗi bậc chuỗi thắng +1,5% tỉ lệ (tối đa +15%).' },
    { id: 'chuoilua',  r: 1, max: 1, icon: 'Lửa', name: 'Chuỗi Lửa',       desc: 'Hệ số chuỗi tăng nhanh gấp đôi.' },
    { id: 'duchan',    r: 1, max: 2, icon: 'Chấn', name: 'Dư Chấn',         desc: 'Sao tự bùng cháy lan thêm +5% vận.' },
    { id: 'lieu',      r: 1, max: 2, icon: 'Liều', name: 'Liều Ăn Nhiều',   desc: 'Thắp được sao từ 30% trở xuống: ngọc ×3.' },
    { id: 'khoivan',   r: 1, max: 1, icon: 'Khởi', name: 'Khởi Vận',        desc: 'Mỗi tầng bắt đầu với 2 sao đã thắp sẵn.' },
    { id: 'matrong',   r: 1, max: 2, icon: 'Mắt', name: 'Mắt Rồng',        desc: 'Tỉ lệ Đại Cát +8% (ngọc ×3, lan vận gấp đôi).' },
    { id: 'satnut',    r: 1, max: 2, icon: 'Sát', name: 'Sát Nút',         desc: 'Trượt sát mép cung vàng trong 4% vẫn tính thắng.' },
    { id: 'hotrang',   r: 2, max: 1, icon: 'Trắng', name: 'Hố Trắng',        desc: 'Xoáy nước thôi hút vận, còn tặng +5% cho đèn kề.' },
    { id: 'saodoingoi', r: 2, max: 1, icon: 'Ngôi', name: 'Sao Đổi Ngôi',    desc: 'Mỗi lần thắp có 20% kéo theo một sao ngẫu nhiên.' },
    { id: 'latvan',    r: 2, max: 1, icon: 'Lật', name: 'Lật Vận',         desc: 'Mỗi tầng 1 lần: trượt thì được quay lại.' },
    { id: 'phuctinh',  r: 2, max: 1, icon: 'Phúc', name: 'Phúc Tinh',       desc: 'Dây chuyền từ 5 sao trở lên hồi 1 ❤.' },
  ];
  const CHARM_BY_ID = {};
  CHARMS.forEach((c) => { CHARM_BY_ID[c.id] = c; });
  const RARITY = [
    { key: 'thuong', name: 'Thường' },
    { key: 'hiem',   name: 'Hiếm' },
    { key: 'than',   name: 'Thần' },
  ];

  /* ---------- lượt chơi ---------- */
  function newRun(opts) {
    opts = opts || {};
    const seed = opts.seed != null ? opts.seed : (Math.random() * 0xffffffff) >>> 0;
    return {
      seed, rng: mulberry32(seed),
      kiep: opts.kiep || 0,
      level: 1,
      hp: START_HP, maxHp: START_HP,
      pearls: 0, score: 0,
      streak: 0, pity: 0,
      fever: 0, feverRolls: 0,
      daily: opts.daily || null,
      clovers: 1, cloverArmed: false,
      charms: {}, charmOrder: [],
      healsBought: 0,
      dead: false, won: false,
      stats: { rolls: 0, lit: 0, voids: 0, bestStreak: 0, bestChain: 0, crits: 0, bestGain: 0, wishes: 0, fevers: 0, lowest: 1, gateLow: 1, flawless: 0 },
    };
  }

  function mods(run) {
    const c = (id) => run.charms[id] || 0;
    const k = run.kiep || 0;
    return {
      spread: 0.15 + 0.03 * c('vayvang'),
      base: 0.03 * c('co4la') - 0.03 * k,
      pearl: 1 + 0.3 * c('loctroi'),
      gate: 0.12 * c('thienduyen') - 0.04 * k,
      shield: c('giapvay'),
      pity: 0.15 * c('bicuc'),
      momentum: 0.015 * c('thuathang'),
      streakStep: 0.15 * (1 + c('chuoilua')),
      aftershock: 0.05 * c('duchan'),
      bold: 1 + 2 * c('lieu'),
      startLit: 2 * c('khoivan'),
      crit: 0.06 + 0.08 * c('matrong'),
      rescue: 0.04 * c('satnut'),
      drain: c('hotrang') ? -0.05 * c('hotrang') : 0.10,
      shoot: 0.2 * c('saodoingoi'),
      reroll: c('latvan'),
      chainHeal: c('phuctinh'),
    };
  }

  function streakMult(run, streak) {
    const s = streak == null ? run.streak : streak;
    return 1 + mods(run).streakStep * Math.max(0, s - 1);
  }

  function addCharm(run, id) {
    const def = CHARM_BY_ID[id];
    if (!def) return false;
    if ((run.charms[id] || 0) >= def.max) return false;
    if (!run.charms[id]) run.charmOrder.push(id);
    run.charms[id] = (run.charms[id] || 0) + 1;
    if (id === 'ngocrong') { run.maxHp++; run.hp = Math.min(run.maxHp, run.hp + 1); }
    return true;
  }

  function availableCharms(run) {
    return CHARMS.filter((c) => (run.charms[c.id] || 0) < c.max);
  }

  /* ---------- sinh chòm sao ---------- */
  function genLevel(run) {
    const L = run.level, cfg = HEAVENS[L - 1], rng = run.rng;
    const rows = cfg.rows, R = rows.length;
    const stars = [], edges = [], rowIds = [];
    const W = { 1: 0, 2: 0.36, 3: 0.60, 4: 0.80, 5: 0.92 };
    const yTop = 0.80, yBot = 0.03;
    const gap = (yTop - yBot) / (R - 1);

    for (let r = 0; r < R; r++) {
      const n = rows[r], ids = [];
      const w = W[n] != null ? W[n] : 0.92;
      const slot = n > 1 ? w / (n - 1) : 0.3;
      const lean = (rng() - 0.5) * (0.94 - w) * 0.8;
      for (let k = 0; k < n; k++) {
        const t = r / (R - 1);
        const x = 0.5 + lean + (n > 1 ? -w / 2 + slot * k : 0) + (rng() - 0.5) * slot * 0.30;
        const yj = (rng() - 0.5) * gap * 0.34;
        const y = yBot + gap * r + (r === 0 ? Math.abs(yj) : yj);
        const base = clamp(lerp(cfg.hi, cfg.lo, t) + (rng() - 0.5) * 0.14, 0.08, 0.95);
        const id = stars.length;
        stars.push({
          id, row: r, x: clamp(x, 0.04, 0.96), y,
          base, heat: 0, bonus: 0,
          type: 'normal', state: 'dormant',
          val: 3 + r + Math.round(0.75 * (L - 1)),
          nb: [], arc: rng() * Math.PI * 2, queued: false,
        });
        ids.push(id);
      }
      rowIds.push(ids);
    }

    const link = (a, b) => {
      if (stars[a].nb.indexOf(b) >= 0) return;
      stars[a].nb.push(b); stars[b].nb.push(a); edges.push([a, b]);
    };
    const d2 = (a, b) => {
      const dx = stars[a].x - stars[b].x, dy = (stars[a].y - stars[b].y) * 1.4;
      return dx * dx + dy * dy;
    };

    // khâu "phéc-mơ-tuya" giữa hai hàng kề nhau: không bao giờ cắt chéo
    for (let r = 0; r < R - 1; r++) {
      const A = rowIds[r], B = rowIds[r + 1];
      const cand = [];
      let i = 0, j = 0;
      cand.push([A[0], B[0]]);
      while (i < A.length - 1 || j < B.length - 1) {
        if (i === A.length - 1) j++;
        else if (j === B.length - 1) i++;
        else if (d2(A[i + 1], B[j]) < d2(A[i], B[j + 1])) i++;
        else j++;
        cand.push([A[i], B[j]]);
      }
      // tỉa bớt cho thoáng, nhưng sao nào cũng còn đường lên và đường xuống
      const up = {}, down = {};
      cand.forEach(([a, b]) => { up[a] = (up[a] || 0) + 1; down[b] = (down[b] || 0) + 1; });
      cand.forEach(([a, b]) => {
        if (up[a] > 1 && down[b] > 1 && rng() < 0.28) { up[a]--; down[b]--; return; }
        link(a, b);
      });
    }
    // vài sợi ngang trong cùng một hàng
    for (let r = 0; r < R; r++) {
      const A = rowIds[r];
      for (let k = 0; k < A.length - 1; k++) if (rng() < 0.3) link(A[k], A[k + 1]);
    }

    // Thiên Môn nối với cả hàng trên cùng
    const gid = stars.length;
    stars.push({
      id: gid, row: R, x: 0.5, y: 0.965,
      base: cfg.gate, heat: 0, bonus: 0,
      type: 'gate', state: 'dormant',
      val: 14 + 5 * (L - 1),
      nb: [], arc: -Math.PI / 2, queued: false,
    });
    rowIds[R - 1].forEach((id) => link(id, gid));

    // rải sao đặc biệt (không nằm ở hàng đáy)
    const pool = stars.filter((s) => s.row >= 1 && s.type === 'normal');
    const upper = () => pool.filter((s) => s.type === 'normal' && s.row >= Math.floor(R / 2));
    const any = () => pool.filter((s) => s.type === 'normal');
    const take = (list, type) => {
      if (!list.length) return null;
      const s = list[Math.floor(rng() * list.length)];
      s.type = type; return s;
    };
    take(any(), 'fortune');
    if (L >= 3 || cfg.rich) take(any(), 'fortune');
    if (cfg.rich) { take(any(), 'fortune'); take(any(), 'fortune'); }
    if (L === 1 || rng() < 0.8) take(any(), 'life');
    if (L >= 7) take(any(), 'life');
    if (rng() < 0.55) take(any(), 'wish');
    if (L >= 2) take(any(), 'mystery');
    if (L >= 6 && rng() < 0.6) take(any(), 'mystery');
    if (L >= 2 && rng() < (L >= 4 ? 0.95 : 0.6)) take(upper(), 'nova');
    if (L >= 6 && rng() < 0.5) take(upper(), 'nova');
    for (let k = 0; k < (cfg.cursed || 0); k++) {
      const s = take(upper(), 'cursed');
      if (s) s.base = clamp(s.base - 0.16, 0.06, 0.9);
    }

    const lv = {
      n: L, cfg, stars, edges, gate: gid, rowIds,
      seals: 0, sealsNeed: cfg.seals || 1,
      gatePity: 0, rolls: 0, fails: 0, wishes: 0, queue: [],
      shield: 0, rerolls: 0,
      thunder: cfg.boss === 'thunder' ? { every: 4, count: 0, target: null } : null,
      fog: cfg.boss === 'fog',
      done: false, earned: 0, startPearls: run.pearls,
    };

    // hố đen chực sẵn (Thái Hư)
    const m = mods(run);
    for (let k = 0; k < (cfg.preVoid || 0); k++) {
      const list = stars.filter((s) => s.type === 'normal' && s.state === 'dormant' && s.row >= 1 && s.row <= R - 2);
      if (!list.length) break;
      const s = list[Math.floor(rng() * list.length)];
      s.state = 'void';
      drainAround(run, lv, s, m, null);
    }
    // sao thắp sẵn (Khởi Vận)
    const bottom = rowIds[0].slice();
    for (let k = 0; k < m.startLit && bottom.length; k++) {
      const s = stars[bottom.splice(Math.floor(rng() * bottom.length), 1)[0]];
      s.state = 'lit';
      s.nb.forEach((nid) => { const n = stars[nid]; if (n.state === 'dormant') n.heat += m.spread; });
    }
    lv.shield = m.shield;
    lv.rerolls = m.reroll;
    return lv;
  }

  /* ---------- tỉ lệ ---------- */
  function rawOdds(run, lv, s, m) {
    let p = s.base + m.base + s.heat + s.bonus;
    if (s.type === 'gate') p += m.gate + lv.gatePity;
    return p;
  }
  function oddsOf(run, lv, s, noTemp) {
    const m = mods(run);
    const p = rawOdds(run, lv, s, m);
    const solid = clamp(p, FLOOR, 1);
    if (noTemp) return solid;
    // phần cộng tạm thời (Thời Vận, bảo vật) không bao giờ đẩy lên đúng 100%:
    // con số 100% chỉ dành cho sao thật sự chắc thắng, tức là sao sẽ tự bùng cháy
    const temp = run.pity + Math.min(0.15, m.momentum * run.streak) + (run.feverRolls > 0 ? FEVER_ODDS : 0);
    return solid >= 1 ? 1 : Math.min(0.99, clamp(p + temp, FLOOR, 1));
  }

  function addHeat(run, lv, n, amt, depth) {
    n.heat += amt;
    if (n.type !== 'gate' && !n.queued && n.state === 'dormant' && oddsOf(run, lv, n, true) >= 0.9995) {
      n.queued = true;
      lv.queue.push({ id: n.id, via: 'cascade', depth: depth + 1 });
    }
  }

  function drainAround(run, lv, s, m, ev) {
    const d = m.drain * (m.drain > 0 ? (lv.cfg.drain || 1) : 1);
    for (const nid of s.nb) {
      const n = lv.stars[nid];
      if (n.state !== 'dormant') continue;
      if (d > 0) {
        const raw = rawOdds(run, lv, n, m);
        const cut = Math.max(0, Math.min(d, raw - FLOOR));
        if (cut <= 0) continue;
        n.heat -= cut;
        if (ev) ev.push({ t: 'drain', from: s.id, to: nid, amt: cut, p: oddsOf(run, lv, n, true) });
      } else if (d < 0) {
        addHeat(run, lv, n, -d, 0);
        if (ev) ev.push({ t: 'spread', from: s.id, to: nid, amt: -d, p: oddsOf(run, lv, n, true), white: true });
      }
    }
  }

  /* ---------- phần thưởng ---------- */
  function reward(run, s, ctx) {
    const m = mods(run);
    let v = s.val;
    if (ctx.manual) v *= clamp(0.95 / ctx.p, 1, 10);
    if (s.type === 'fortune') v *= 4;
    if (s.type === 'cursed') v *= 8;
    if (ctx.manual && ctx.p <= 0.30) v *= m.bold;
    if (ctx.crit) v *= 3;
    if (run.feverRolls > 0) v *= FEVER_PEARL;
    v *= streakMult(run);
    v *= m.pearl;
    return Math.max(1, Math.round(v));
  }

  function gain(run, lv, amount) {
    run.pearls += amount; run.score += amount; lv.earned += amount;
    if (amount > run.stats.bestGain) run.stats.bestGain = amount;
  }

  function heal(run, n, ev, id) {
    const before = run.hp;
    run.hp = Math.min(run.maxHp, run.hp + n);
    ev.push({ t: 'heal', d: run.hp - before, hp: run.hp, id });
  }

  function damage(run, lv, dmg, ev) {
    if (lv.shield > 0) { lv.shield--; ev.push({ t: 'shield', left: lv.shield }); return; }
    run.hp = Math.max(0, run.hp - dmg);
    ev.push({ t: 'hp', d: -dmg, hp: run.hp });
    if (run.hp <= 0) { run.dead = true; ev.push({ t: 'dead' }); }
  }

  /* ---------- thắp sáng & dây chuyền ---------- */
  function ignite(run, lv, s, ctx, ev, chain) {
    const m = mods(run);
    s.state = 'lit';
    run.streak++;
    run.stats.lit++;
    if (run.streak > run.stats.bestStreak) run.stats.bestStreak = run.streak;
    if (run.feverRolls <= 0) run.fever = Math.min(FEVER_MAX, run.fever + 1);
    if (ctx.manual && ctx.p < run.stats.lowest) run.stats.lowest = ctx.p;
    const crit = !!ctx.manual && run.rng() < m.crit;
    if (crit) run.stats.crits++;
    const g = reward(run, s, { p: ctx.p, manual: ctx.manual, crit });
    gain(run, lv, g);
    chain.n++; chain.pearls += g;
    ev.push({
      t: 'lit', id: s.id, gain: g, crit, streak: run.streak, mult: streakMult(run),
      depth: ctx.depth, via: ctx.via || (ctx.manual ? 'manual' : 'cascade'),
      type: s.type, pearls: run.pearls, n: chain.n, bold: !!ctx.manual && ctx.p <= 0.30,
      fever: run.fever, p: ctx.p,
    });

    if (s.type === 'life') heal(run, 1, ev, s.id);
    else if (s.type === 'wish') { run.clovers++; ev.push({ t: 'gainClover', id: s.id, n: run.clovers }); }
    else if (s.type === 'mystery') mystery(run, lv, s, ev);

    const amt = m.spread * (crit ? 2 : 1) * (s.type === 'cursed' ? 2 : 1) + (ctx.depth > 0 ? m.aftershock : 0);
    for (const nid of s.nb) {
      const n = lv.stars[nid];
      if (n.state !== 'dormant') continue;
      const a = n.type === 'gate' ? amt * GATE_SPREAD : amt;
      addHeat(run, lv, n, a, ctx.depth);
      ev.push({ t: 'spread', from: s.id, to: nid, amt: a, p: oddsOf(run, lv, n, true) });
    }
    if (s.type === 'nova') {
      const ids = [];
      for (const nid of s.nb) {
        const n = lv.stars[nid];
        if (n.state === 'dormant' && n.type !== 'gate' && !n.queued) {
          n.queued = true; ids.push(nid);
          lv.queue.push({ id: nid, via: 'nova', depth: ctx.depth + 1 });
        }
      }
      ev.push({ t: 'nova', id: s.id, ids });
    }
    if (m.shoot > 0 && ctx.via !== 'shoot' && run.rng() < m.shoot) {
      const list = lv.stars.filter((n) => n.state === 'dormant' && n.type !== 'gate' && !n.queued);
      if (list.length) {
        const n = list[Math.floor(run.rng() * list.length)];
        n.queued = true;
        lv.queue.push({ id: n.id, via: 'shoot', depth: ctx.depth + 1 });
        ev.push({ t: 'shoot', from: s.id, id: n.id });
      }
    }
  }

  function cascade(run, lv, ev, chain) {
    let guard = 0;
    while (lv.queue.length && guard++ < 999) {
      const q = lv.queue.shift();
      const s = lv.stars[q.id];
      if (s.state !== 'dormant') continue;
      ignite(run, lv, s, { manual: false, p: 1, depth: q.depth, via: q.via }, ev, chain);
    }
  }

  function closeChain(run, ev, chain) {
    if (chain.n > run.stats.bestChain) run.stats.bestChain = chain.n;
    if (chain.n >= 2) {
      const m = mods(run);
      ev.push({ t: 'chain', n: chain.n, pearls: chain.pearls });
      if (m.chainHeal && chain.n >= 5 && run.hp < run.maxHp) heal(run, 1, ev, null);
    }
  }

  function mystery(run, lv, s, ev) {
    const m = mods(run);
    const r = run.rng();
    let res;
    if (r < 0.34) {
      const g = Math.round(s.val * 10 * m.pearl);
      gain(run, lv, g);
      res = { k: 'pearls', gain: g, pearls: run.pearls };
    } else if (r < 0.54 && run.hp < run.maxHp) {
      res = { k: 'life' };
    } else if (r < 0.74) {
      run.clovers += 2;
      res = { k: 'clover', n: run.clovers };
    } else if (r < 0.90 && availableCharms(run).length) {
      const list = availableCharms(run);
      const c = list[Math.floor(run.rng() * list.length)];
      addCharm(run, c.id);
      res = { k: 'charm', id: c.id };
    } else {
      const list = lv.stars.filter((n) => n.state === 'dormant' && n.type !== 'gate' && !n.queued);
      const ids = [];
      for (let k = 0; k < 3 && list.length; k++) {
        const n = list.splice(Math.floor(run.rng() * list.length), 1)[0];
        n.queued = true; ids.push(n.id);
        lv.queue.push({ id: n.id, via: 'shoot', depth: 1 });
      }
      res = { k: 'meteor', ids };
    }
    ev.push({ t: 'mystery', id: s.id, res });
    if (res.k === 'life') heal(run, 1, ev, s.id);
  }

  function collapse(run, lv, s, ev, why) {
    s.state = 'void';
    run.stats.voids++;
    ev.push({ t: 'void', id: s.id, why });
    drainAround(run, lv, s, mods(run), ev);
  }

  /* ---------- hành động chính: thử vận một ngôi sao ---------- */
  function roll(run, lv, id) {
    const ev = [];
    const s = lv.stars[id];
    if (!s || lv.done || run.dead || s.state !== 'dormant') return ev;
    const m = mods(run);

    if (run.cloverArmed) {
      run.cloverArmed = false;
      if (run.clovers > 0) {
        run.clovers--; s.bonus += CLOVER;
        ev.push({ t: 'clover', id, n: run.clovers, p: oddsOf(run, lv, s) });
      }
    }
    lv.rolls++; run.stats.rolls++;
    const inFever = run.feverRolls > 0;

    let p, u, success, rescued, tries = 0;
    for (;;) {
      p = oddsOf(run, lv, s);
      u = run.rng();
      success = u < p; rescued = false;
      if (!success && m.rescue > 0 && u < p + m.rescue) { success = true; rescued = true; }
      ev.push({ t: 'roll', id, p, u, success, rescued, rescue: m.rescue, again: tries > 0, gate: s.type === 'gate', fever: inFever });
      if (success) break;
      if (lv.rerolls > 0) { lv.rerolls--; tries++; ev.push({ t: 'second', id, left: lv.rerolls }); continue; }
      break;
    }
    run.pity = 0;

    const chain = { n: 0, pearls: 0 };
    if (success) {
      if (s.type === 'gate') gateHit(run, lv, s, p, ev);
      else ignite(run, lv, s, { manual: true, p, depth: 0 }, ev, chain);
    } else {
      run.streak = 0;
      run.pity = m.pity;
      lv.fails++;
      if (!inFever) run.fever = Math.max(0, run.fever - 2);
      if (s.type === 'gate') {
        lv.gatePity += GATE_PITY;
        ev.push({ t: 'gateFail', id, p: oddsOf(run, lv, s, true) });
        damage(run, lv, 1, ev);
      } else {
        collapse(run, lv, s, ev, 'fail');
        damage(run, lv, s.type === 'cursed' ? 2 : 1, ev);
      }
    }
    cascade(run, lv, ev, chain);
    closeChain(run, ev, chain);

    // Lôi Kiếp
    if (lv.thunder && !lv.done && !run.dead) {
      const th = lv.thunder;
      th.count++;
      if (th.target != null && th.count >= th.every) {
        const st = lv.stars[th.target];
        const tid = th.target;
        th.target = null; th.count = 0;
        if (st.state === 'dormant') {
          const bless = run.rng() < 0.5;
          ev.push({ t: 'lightning', id: tid, bless });
          if (bless) {
            const c2 = { n: 0, pearls: 0 };
            st.queued = true;
            ignite(run, lv, st, { manual: false, p: 1, depth: 1, via: 'thunder' }, ev, c2);
            cascade(run, lv, ev, c2);
            closeChain(run, ev, c2);
          } else {
            collapse(run, lv, st, ev, 'thunder');
            cascade(run, lv, ev, { n: 0, pearls: 0 });
          }
        } else {
          ev.push({ t: 'fizzle', id: tid });
        }
      }
      if (th.target == null && th.count >= th.every - 2) {
        const list = lv.stars.filter((n) => n.state === 'dormant' && n.type !== 'gate');
        if (list.length) {
          th.target = list[Math.floor(run.rng() * list.length)].id;
          ev.push({ t: 'omen', id: th.target });
        }
      }
    }

    if (inFever) {
      run.feverRolls--;
      if (run.feverRolls <= 0) { run.feverRolls = 0; ev.push({ t: 'feverEnd' }); }
    }
    ev.push({ t: 'sync' });
    return ev;
  }

  function gateHit(run, lv, s, p, ev) {
    lv.seals++;
    run.streak++;
    if (run.streak > run.stats.bestStreak) run.stats.bestStreak = run.streak;
    if (run.feverRolls <= 0) run.fever = Math.min(FEVER_MAX, run.fever + 1);
    if (p < run.stats.gateLow) run.stats.gateLow = p;
    const g = reward(run, s, { p, manual: true, crit: false });
    gain(run, lv, g);
    if (lv.seals < lv.sealsNeed) {
      lv.gatePity = 0;
      ev.push({ t: 'seal', id: s.id, n: lv.seals, need: lv.sealsNeed, gain: g, pearls: run.pearls, streak: run.streak, mult: streakMult(run) });
      // Thiên phạt: hai sao còn ngủ sụp thành hố đen
      const list = lv.stars.filter((n) => n.state === 'dormant' && n.type !== 'gate' && !n.queued);
      for (let k = 0; k < 2 && list.length; k++) {
        const n = list.splice(Math.floor(run.rng() * list.length), 1)[0];
        collapse(run, lv, n, ev, 'wrath');
      }
    } else {
      s.state = 'lit';
      lv.done = true;
      if (lv.fails === 0) run.stats.flawless++;
      const bonus = 15 * run.level;
      gain(run, lv, bonus);
      ev.push({ t: 'gateOpen', id: s.id, gain: g, bonus, pearls: run.pearls, streak: run.streak, mult: streakMult(run), n: lv.seals, need: lv.sealsNeed });
      if (run.level >= HEAVENS.length) run.won = true;
    }
  }

  /* ---------- Thời Vận: nạp đầy bằng cách thắp sao, người chơi tự chọn lúc tung ---------- */
  function feverReady(run) { return run.fever >= FEVER_MAX && run.feverRolls <= 0 && !run.dead; }
  function activateFever(run) {
    if (!feverReady(run)) return false;
    run.fever = 0;
    run.feverRolls = FEVER_ROLLS;
    run.stats.fevers++;
    return true;
  }

  /* ---------- Sao băng ước nguyện: bắt được thì nhận một điều may ngẫu nhiên ---------- */
  function wish(run, lv) {
    const ev = [];
    if (!lv || lv.done || run.dead) return ev;
    const m = mods(run);
    run.stats.wishes++; lv.wishes++;
    const r = run.rng();
    if (r < 0.38) {
      const g = Math.round((12 + 7 * run.level) * (1 + run.rng()) * m.pearl);
      gain(run, lv, g);
      ev.push({ t: 'wish', k: 'pearls', gain: g, pearls: run.pearls });
    } else if (r < 0.62) {
      const amt = 0.06, ids = [];
      for (const n of lv.stars) if (n.state === 'dormant') { addHeat(run, lv, n, amt, 0); ids.push(n.id); }
      ev.push({ t: 'wish', k: 'rain', amt, ids });
      const chain = { n: 0, pearls: 0 };
      cascade(run, lv, ev, chain);
      closeChain(run, ev, chain);
    } else if (r < 0.78) {
      run.clovers++;
      ev.push({ t: 'wish', k: 'clover', n: run.clovers });
    } else if (r < 0.92 || run.hp >= run.maxHp) {
      if (run.feverRolls <= 0) run.fever = Math.min(FEVER_MAX, run.fever + 4);
      ev.push({ t: 'wish', k: 'fever', fever: run.fever });
    } else {
      ev.push({ t: 'wish', k: 'life' });
      heal(run, 1, ev, null);
    }
    ev.push({ t: 'sync' });
    return ev;
  }

  // hạt giống cố định theo ngày: hôm nay ai cũng gặp cùng những chòm sao
  function dailySeed(dateStr) {
    let h = 2166136261;
    const str = 'ngan-ha-vu-mon:' + dateStr;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function toggleClover(run) {
    if (run.clovers <= 0) { run.cloverArmed = false; return false; }
    run.cloverArmed = !run.cloverArmed;
    return run.cloverArmed;
  }

  function nextLevel(run) {
    run.level++;
    run.pity = 0;
    run.streak = 0;
    run.cloverArmed = false;
    return genLevel(run);
  }

  /* ---------- xem trước cho chú thích ---------- */
  function preview(run, lv, id) {
    const s = lv.stars[id];
    const p = oddsOf(run, lv, s);
    const saved = run.streak;
    run.streak = saved + 1;
    const g = reward(run, s, { p, manual: true, crit: false });
    run.streak = saved;
    return { p, gain: g, type: s.type };
  }

  /* ---------- Chợ Trời ---------- */
  function inflation(run) { return Math.pow(1.45, run.level - 1); }

  function rollOffers(run) {
    const list = availableCharms(run);
    const offers = [];
    const wLegend = 0.07 + 0.02 * run.level;
    for (let k = 0; k < 3 && list.length; k++) {
      const r = run.rng();
      const want = r < wLegend ? 2 : r < wLegend + 0.33 ? 1 : 0;
      let cands = list.filter((c) => c.r === want);
      if (!cands.length) cands = list;
      const c = cands[Math.floor(run.rng() * cands.length)];
      list.splice(list.indexOf(c), 1);
      offers.push({ id: c.id, picked: false });
    }
    return offers;
  }

  // Sau mỗi tầng: chọn MỘT trong ba bảo vật (miễn phí), rồi tiêu ngọc ở Chợ Trời.
  function genShop(run) {
    const infl = inflation(run);
    return {
      offers: rollOffers(run),
      picked: false,
      reroll: round5(20 * infl),
      heal: round5(40 * infl),
      clover: round5(30 * infl),
      stick: round5(70 * infl),
      sticks: 0,
    };
  }

  function pickBoon(run, shop, i) {
    const o = shop.offers[i];
    if (!o || shop.picked) return false;
    if (!addCharm(run, o.id)) return false;
    o.picked = true; shop.picked = true;
    return true;
  }
  function rerollBoons(run, shop) {
    if (shop.picked || run.pearls < shop.reroll) return false;
    run.pearls -= shop.reroll;
    shop.reroll = round5(shop.reroll * 1.6);
    shop.offers = rollOffers(run);
    return true;
  }
  function buyHeal(run, shop) {
    if (run.hp >= run.maxHp || run.pearls < shop.heal) return false;
    run.pearls -= shop.heal; run.hp++; run.healsBought++;
    shop.heal = round5(shop.heal * 1.5);
    return true;
  }
  function buyClover(run, shop) {
    if (run.pearls < shop.clover) return false;
    run.pearls -= shop.clover; run.clovers++;
    shop.clover = round5(shop.clover * 1.25);
    return true;
  }
  // Rút quẻ: trả ngọc, nhận một thứ ngẫu nhiên. Giá tăng dần trong cùng một phiên chợ.
  function drawStick(run, shop) {
    if (run.pearls < shop.stick || shop.sticks >= 3) return null;
    const paid = shop.stick;
    run.pearls -= paid;
    shop.sticks++;
    shop.stick = round5(paid * 1.6);
    const r = run.rng();
    const pick = (rar) => {
      let cands = availableCharms(run).filter((c) => c.r === rar);
      if (!cands.length) cands = availableCharms(run);
      if (!cands.length) return null;
      const c = cands[Math.floor(run.rng() * cands.length)];
      addCharm(run, c.id);
      return c.id;
    };
    let res;
    if (r < 0.05) res = { k: 'charm', id: pick(2), tier: 3, label: 'Thượng Thượng' };
    else if (r < 0.17) res = { k: 'charm', id: pick(1), tier: 2, label: 'Thượng Cát' };
    else if (r < 0.40) res = { k: 'charm', id: pick(0), tier: 1, label: 'Trung Cát' };
    else if (r < 0.56) { run.clovers += 2; res = { k: 'clover', tier: 1, label: 'Tiểu Cát' }; }
    else if (r < 0.72 && run.hp < run.maxHp) { run.hp++; res = { k: 'life', tier: 1, label: 'Tiểu Cát' }; }
    else if (r < 0.72) { run.clovers += 2; res = { k: 'clover', tier: 1, label: 'Tiểu Cát' }; }
    else {
      const back = round5(paid * 0.5);
      run.pearls += back;
      res = { k: 'refund', gain: back, tier: 0, label: 'Quẻ Hạ' };
    }
    if (res.k === 'charm' && !res.id) { run.clovers += 2; res = { k: 'clover', tier: 1, label: 'Tiểu Cát' }; }
    return res;
  }

  const Core = {
    FLOOR, CLOVER, GATE_SPREAD, GATE_PITY, START_HP, FEVER_MAX, FEVER_ROLLS, FEVER_ODDS, FEVER_PEARL,
    HEAVENS, STAR_TYPES, CHARMS, CHARM_BY_ID, RARITY,
    mulberry32, clamp, lerp,
    newRun, mods, streakMult, addCharm, availableCharms,
    genLevel, nextLevel, oddsOf, roll, preview, toggleClover,
    feverReady, activateFever, wish, dailySeed,
    genShop, pickBoon, rerollBoons, buyHeal, buyClover, drawStick, inflation,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
