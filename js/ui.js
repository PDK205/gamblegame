/* ==========================================================================
   NGÂN HÀ VŨ MÔN — lớp giao diện DOM: HUD, biển chữ, Chợ Trời, màn kết
   ========================================================================== */
(function (root) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const HEART = '<svg class="heart %c" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.6C5 15.6 2 12 2 8.4 2 5.6 4.1 3.6 6.7 3.6c1.9 0 3.7 1 5.3 3.1 1.6-2.1 3.4-3.1 5.3-3.1C19.9 3.6 22 5.6 22 8.4c0 3.6-3 7.2-10 12.2z"/></svg>';

  const UI = { fmt };
  let pearlShown = 0, pearlTarget = 0, pearlRaf = 0;
  let hintTimer = 0, lastHp = -1;

  const retrigger = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  UI.show = (id) => $(id).classList.add('show');
  UI.hide = (id) => $(id).classList.remove('show');
  UI.hud = (on) => { $('hud-top').hidden = !on; $('hud-bottom').hidden = !on; };

  /* ---------- HUD ---------- */
  UI.resetHearts = () => { lastHp = -1; };
  UI.setHearts = function (hp, max, shield, rerolls) {
    let h = '';
    if (max > 9) h = HEART.replace('%c', hp > 0 ? 'on' : '') + '<b class="hp-num">' + hp + '/' + max + '</b>';
    else for (let i = 0; i < max; i++) h += HEART.replace('%c', i < hp ? 'on' : '');
    if (shield > 0) h += '<span class="ward shield">Giáp ×' + shield + '</span>';
    if (rerolls > 0) h += '<span class="ward again">Lật vận ×' + rerolls + '</span>';
    const el = $('hearts');
    el.innerHTML = h;
    if (lastHp >= 0 && hp !== lastHp) {
      const node = el.querySelectorAll('.heart')[max > 9 ? 0 : hp < lastHp ? hp : hp - 1];
      if (node) node.classList.add(hp < lastHp ? 'break' : 'pop');
    }
    lastHp = hp;
    el.setAttribute('aria-label', 'Sinh mệnh ' + hp + ' trên ' + max);
  };

  function stepPearls() {
    const d = pearlTarget - pearlShown;
    if (Math.abs(d) < 1) { pearlShown = pearlTarget; pearlRaf = 0; }
    else { pearlShown += d * 0.18 + Math.sign(d) * 0.6; pearlRaf = requestAnimationFrame(stepPearls); }
    $('pearls').textContent = fmt(pearlShown);
  }
  UI.setPearls = function (n, instant) {
    pearlTarget = n;
    if (instant) { pearlShown = n; $('pearls').textContent = fmt(n); return; }
    if (!pearlRaf) pearlRaf = requestAnimationFrame(stepPearls);
  };
  UI.bumpPurse = () => retrigger($('purse'), 'bump');
  UI.pursePos = () => { const r = $('purse').getBoundingClientRect(); return { x: r.left + 9, y: r.top + r.height / 2 }; };
  UI.cloverPos = () => { const r = $('btn-clover').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  UI.setStreak = function (streak, mult) {
    const el = $('streak');
    const txt = '×' + (Math.round(mult * 100) / 100).toLocaleString('vi-VN');
    const changed = $('streak-mult').textContent !== txt;
    $('streak-n').textContent = streak;
    $('streak-mult').textContent = txt;
    el.classList.toggle('cold', streak <= 1);
    el.style.setProperty('--heat', Math.min(1, streak / 14).toFixed(2));
    if (changed && streak > 1) retrigger(el, 'tick');
  };
  UI.setLevel = function (n, total, name) {
    $('lv-n').textContent = 'Tầng ' + n + '/' + total;
    $('lv-name').textContent = name;
  };
  UI.setClovers = function (n, armed) {
    const b = $('btn-clover');
    $('clovers').textContent = n;
    b.classList.toggle('empty', n <= 0);
    b.setAttribute('aria-pressed', armed ? 'true' : 'false');
  };
  let lastFever = -1;
  UI.setFever = function (fever, max, rolls) {
    const b = $('btn-fever');
    const ready = rolls <= 0 && fever >= max;
    b.style.setProperty('--fill', (rolls > 0 ? 1 : Math.min(1, fever / max)).toFixed(3));
    b.classList.toggle('ready', ready);
    b.classList.toggle('on', rolls > 0);
    $('fever-n').textContent = rolls > 0 ? rolls : '';
    b.setAttribute('aria-label', rolls > 0 ? 'Thời Vận đang chạy, còn ' + rolls + ' lượt'
      : ready ? 'Thời Vận đã đầy: bấm để tung' : 'Thời Vận: đã nạp ' + fever + ' trên ' + max);
    if (lastFever >= 0 && fever > lastFever && rolls <= 0) retrigger(b, 'bump');
    lastFever = fever;
    $('vignette').classList.toggle('fever', rolls > 0);
  };

  UI.setCharms = function (run, id, fresh) {
    const el = $(id);
    el.innerHTML = run.charmOrder.map((cid) => {
      const c = Core.CHARM_BY_ID[cid], n = run.charms[cid];
      return '<button type="button" class="gem r' + c.r + (cid === fresh ? ' new' : '') + '" data-id="' + cid + '" aria-label="' + esc(c.name) + '">' +
        c.icon + (n > 1 ? '<i>' + n + '</i>' : '') + '</button>';
    }).join('');
  };

  UI.banner = function (main, sub, cls, dur) {
    const el = document.querySelector('.banner-in');
    $('banner-main').textContent = main;
    $('banner-sub').textContent = sub || '';
    el.className = 'banner-in ' + (cls || '');
    el.style.setProperty('--dur', (dur || 1.6) + 's');
    void el.offsetWidth;
    el.classList.add('show');
  };
  UI.hint = function (text, ms) {
    const el = $('hint');
    clearTimeout(hintTimer);
    if (!text) { el.classList.remove('show'); return; }
    el.classList.remove('gold');
    el.textContent = text;
    el.classList.add('show');
    hintTimer = setTimeout(() => el.classList.remove('show'), ms || 5200);
  };
  // thông báo nổi bật (thành tựu, lột xác): cùng chỗ với lời nhắc nhưng viền vàng
  UI.toast = function (html, ms) {
    const el = $('hint');
    clearTimeout(hintTimer);
    el.classList.add('gold');
    el.innerHTML = html;
    el.classList.add('show');
    hintTimer = setTimeout(() => el.classList.remove('show'), ms || 3600);
  };
  UI.menu = function (open) {
    $('menu').hidden = !open;
    $('btn-menu').setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  UI.achievements = function (defs, got) {
    let n = 0;
    $('ach-list').innerHTML = defs.map((a) => {
      const ok = !!got[a.id]; if (ok) n++;
      return '<li class="' + (ok ? 'got' : '') + '"><i class="a-ic">' + a.icon + '</i><div><b>' + esc(a.name) + '</b><span>' + esc(a.desc) + '</span></div></li>';
    }).join('');
    $('ach-count').textContent = 'Sổ vận · ' + n + '/' + defs.length;
  };
  UI.tip = function (html, x, y) {
    const el = $('tip');
    if (!html) { el.hidden = true; return; }
    el.innerHTML = html;
    el.hidden = false;
    const w = el.offsetWidth, h = el.offsetHeight;
    const W = window.innerWidth, H = window.innerHeight;
    let left = x - w / 2, top = y - h - 8;
    if (top < 8) top = Math.min(H - h - 8, y + 44);
    left = Math.max(8, Math.min(W - w - 8, left));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  };
  UI.hurt = () => retrigger($('vignette'), 'hurt');

  /* ---------- màn đầu ---------- */
  UI.title = function (save, kiep, onKiep, extra) {
    $('btn-daily').innerHTML = 'Quẻ hôm nay <b>' + esc(extra.daily) + '</b>';
    $('btn-ach').innerHTML = 'Thành tựu <b>' + extra.achGot + '/' + extra.achTotal + '</b>';
    const rec = $('record');
    if (save.runs > 0) {
      rec.innerHTML = 'Kỷ lục: tầng <b>' + Math.max(1, save.best) + '</b>/9 · <b>' + fmt(save.bestScore) + '</b> ngọc' +
        (save.wins ? ' · hóa rồng <b>' + save.wins + '</b> lần' : '');
    } else rec.textContent = 'Chín tầng trời, một chú cá chép, còn lại là vận may của bạn.';
    const row = $('kiep-row');
    if (save.kiep > 0) {
      row.hidden = false;
      let h = '';
      for (let k = 0; k <= Math.min(save.kiep, 9); k++) {
        h += '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (k === kiep) + '">Kiếp ' + (k + 1) + (k ? ' · khó +' + k : '') + '</button>';
      }
      row.innerHTML = h;
      row.onclick = (e) => {
        const b = e.target.closest('.chip'); if (!b) return;
        onKiep(+b.dataset.k);
        row.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c === b ? 'true' : 'false'));
      };
    } else row.hidden = true;
  };

  /* ---------- Chợ Trời ---------- */
  UI.shop = {
    render(run, shop, info, animate) {
      $('shop-eyebrow').textContent = 'Đã vượt tầng ' + info.n + ' · ' + info.name;
      $('shop-tally').innerHTML = 'Ngọc kiếm được <b>+' + fmt(info.earned) + '</b><span>Dây chuyền dài nhất <b>' + info.chain + '</b> sao</span>';
      $('shop-pick-note').textContent = shop.picked ? 'đã chọn' : 'chọn một, miễn phí';
      const cards = $('shop-cards');
      cards.innerHTML = shop.offers.map((o, i) => {
        const c = Core.CHARM_BY_ID[o.id], own = run.charms[o.id] || 0;
        const cls = 'card r' + c.r + (o.picked ? ' picked' : shop.picked ? ' passed' : '');
        return '<button type="button" class="' + cls + '" data-i="' + i + '" style="--i:' + i + (animate ? '' : ';animation:none') + '"' + (shop.picked ? ' disabled' : '') + '>' +
          '<span class="gem r' + c.r + '">' + c.icon + '</span>' +
          '<span class="c-body"><span class="c-name">' + esc(c.name) + '<span class="c-rar">' + Core.RARITY[c.r].name + '</span></span>' +
          '<span class="c-desc">' + esc(c.desc) + '</span>' +
          (own ? '<span class="c-own">' + (o.picked ? 'Đã nhận · đang có ×' + own : 'Đang có ×' + own + ', cộng dồn được') + '</span>' : (o.picked ? '<span class="c-own">Đã nhận</span>' : '')) +
          '</span></button>';
      }).join('');
      const rr = $('btn-reroll');
      rr.hidden = shop.picked || !shop.offers.length;
      rr.innerHTML = 'Đổi ba lễ vật khác <i class="pearl"></i><b>' + fmt(shop.reroll) + '</b>';
      rr.disabled = run.pearls < shop.reroll;

      $('shop-wallet').innerHTML = '<i class="pearl"></i>' + fmt(run.pearls) + ' · ❤ ' + run.hp + '/' + run.maxHp + ' · cỏ ' + run.clovers;
      const set = (id, price, off, name) => {
        const b = $(id);
        b.querySelector('.st-price b').textContent = fmt(price);
        if (name) b.querySelector('.st-name').textContent = name;
        b.disabled = off;
      };
      set('buy-heal', shop.heal, run.pearls < shop.heal || run.hp >= run.maxHp, run.hp >= run.maxHp ? '❤ đã đầy' : 'Hồi 1 ❤');
      set('buy-clover', shop.clover, run.pearls < shop.clover);
      set('buy-stick', shop.stick, run.pearls < shop.stick || shop.sticks >= 3, shop.sticks >= 3 ? 'Hết quẻ' : 'Rút quẻ (' + (3 - shop.sticks) + ')');
      const nb = $('btn-next');
      nb.textContent = 'Lên tầng ' + info.nextN + ' · ' + info.nextName;
    },
    stick(html, tier) {
      const el = $('stick-result');
      el.className = 'stick-result t' + tier;
      el.innerHTML = html;
      retrigger(el, 'pop');
    },
    clearStick() { const el = $('stick-result'); el.className = 'stick-result'; el.textContent = 'Rút quẻ: may thì được bảo vật, rủi thì hoàn nửa tiền. Mỗi phiên chợ ba quẻ.'; },
  };

  /* ---------- màn kết ---------- */
  UI.end = function (o) {
    const scr = $('scr-end');
    scr.classList.toggle('win', !!o.win);
    scr.querySelector('.panel').className = 'panel end ' + (o.win ? 'won' : 'lose');
    $('end-eyebrow').textContent = o.eyebrow;
    $('end-title').textContent = o.title;
    $('end-sub').textContent = o.sub;
    $('end-stats').innerHTML = o.stats.map((s) => '<div><dt>' + esc(s[0]) + '</dt><dd>' + esc(s[1]) + '</dd></div>').join('');
    UI.setCharms(o.run, 'end-charms');
    const f = $('end-fortune');
    f.hidden = !o.fortune;
    if (o.fortune) f.innerHTML = o.fortune;
    $('btn-share').hidden = !o.share;
    $('btn-share').textContent = 'Sao chép kết quả';
    $('btn-again').textContent = o.again;
    UI.show('scr-end');
  };

  root.UI = UI;
})(window);
