/* Mô phỏng nhanh để cân bằng độ khó: node tools/sim.js [số lượt] [kiếp] */
const Core = require('../js/core.js');

const N = +process.argv[2] || 4000;
const KIEP = +process.argv[3] || 0;

function playLevel(run, lv, greedy) {
  let guard = 0;
  while (!lv.done && !run.dead && guard++ < 400) {
    const gate = lv.stars[lv.gate];
    const dorm = lv.stars.filter((s) => s.state === 'dormant' && s.type !== 'gate');
    const pg = Core.oddsOf(run, lv, gate);
    let best = null, bp = -1;
    for (const s of dorm) {
      let p = Core.oddsOf(run, lv, s);
      if (s.type === 'cursed') p -= 0.25;        // người chơi dè dặt né hung tinh
      if (p > bp) { bp = p; best = s; }
    }
    const frontier = lv.stars[lv.gate].nb.some((id) => lv.stars[id].state === 'dormant');
    let target;
    if (!best) target = gate;
    else if (!greedy && pg >= 0.6 && (!frontier || bp < 0.7)) target = gate;
    else if (greedy && bp < 0.55 && pg >= bp) target = gate;
    else if (bp < 0.3 && pg >= bp - 0.05) target = gate;
    else if (!greedy && run.hp <= 1 && pg >= bp) target = gate;
    else target = best;
    if (target === gate && pg < 0.8 && run.clovers > 0) Core.toggleClover(run);
    // tung Thời Vận khi sắp thử cổng, hoặc khi mọi sao còn lại đều khó
    if (Core.feverReady(run) && (target === gate || Core.oddsOf(run, lv, target) < 0.72)) Core.activateFever(run);
    const ev = Core.roll(run, lv, target.id);
    // người chơi bắt được khoảng hai phần ba số sao băng
    if (!lv.done && !run.dead && lv.wishes < 2 && (lv.rolls === 3 || lv.rolls === 9) && simRng() < 0.66) Core.wish(run, lv);
    T.rolls[run.level]++;
    for (const e of ev) {
      if (e.t === 'roll' && !e.success) T.fails[run.level]++;
      if (e.t === 'lit' && e.via !== 'manual') T.casc[run.level]++;
      if (e.t === 'hp') T.dmg[run.level] -= e.d;
    }
  }
  T.left[run.level] += lv.stars.filter((s) => s.state === 'dormant' && s.type !== 'gate').length;
  T.n[run.level]++;
}
const simRng = Core.mulberry32(12345);
const T = { rolls: [], fails: [], casc: [], dmg: [], left: [], n: [] };
function resetT() { for (const k in T) T[k] = new Array(11).fill(0); }

function shopVisit(run) {
  const shop = Core.genShop(run);
  let bi = 0, br = -1;
  shop.offers.forEach((o, i) => { const r = Core.CHARM_BY_ID[o.id].r; if (r > br) { br = r; bi = i; } });
  Core.pickBoon(run, shop, bi);
  while (run.hp < run.maxHp - 1 && Core.buyHeal(run, shop)) { /* hồi máu trước */ }
  while (run.pearls >= shop.stick * 1.3 && Core.drawStick(run, shop)) { /* rút quẻ */ }
  while (run.hp < run.maxHp && Core.buyHeal(run, shop)) { /* dư ngọc thì hồi tiếp */ }
  while (run.clovers < 2 && Core.buyClover(run, shop)) { /* thủ sẵn cỏ */ }
}

function sim(greedy) {
  resetT();
  let bought = 0;
  const reach = new Array(11).fill(0);
  const income = new Array(10).fill(0), incomeN = new Array(10).fill(0);
  const hpAt = new Array(10).fill(0);
  let wins = 0, score = 0, chain = 0;
  for (let i = 0; i < N; i++) {
    const run = Core.newRun({ seed: 1000 + i * 7919, kiep: KIEP });
    let lv = Core.genLevel(run);
    for (;;) {
      hpAt[run.level] += run.hp;
      playLevel(run, lv, greedy);
      if (run.dead) { reach[run.level]++; break; }
      income[run.level] += lv.earned; incomeN[run.level]++;
      if (run.won) { wins++; reach[10]++; break; }
      bought -= run.charmOrder.reduce((a, id) => a + run.charms[id], 0);
      shopVisit(run);
      bought += run.charmOrder.reduce((a, id) => a + run.charms[id], 0);
      lv = Core.nextLevel(run);
    }
    score += run.score; chain += run.stats.bestChain;
  }
  console.log(`\n== ${greedy ? 'Tham (vét sạch rồi mới qua cổng)' : 'Thận trọng'} · kiếp ${KIEP} · ${N} lượt ==`);
  console.log(`Phá đảo: ${(100 * wins / N).toFixed(1)}%   điểm TB: ${Math.round(score / N)}   dây chuyền dài nhất TB: ${(chain / N).toFixed(1)}`);
  console.log(`bảo vật mua mỗi lượt: ${(bought / N).toFixed(1)}`);
  let alive = N;
  for (let l = 1; l <= 9; l++) {
    const died = reach[l];
    console.log(`  tầng ${l}: vào ${(100 * alive / N).toFixed(0).padStart(3)}%  chết ${(100 * died / N).toFixed(1).padStart(5)}%  ❤ lúc vào ${(hpAt[l] / Math.max(1, alive)).toFixed(1)}  ngọc ${String(incomeN[l] ? Math.round(income[l] / incomeN[l]) : '-').padStart(5)}  quay ${(T.rolls[l] / Math.max(1, T.n[l])).toFixed(1).padStart(4)}  trượt ${(T.fails[l] / Math.max(1, T.n[l])).toFixed(1)}  mất❤ ${(T.dmg[l] / Math.max(1, T.n[l])).toFixed(1)}  tự cháy ${(T.casc[l] / Math.max(1, T.n[l])).toFixed(1).padStart(4)}  bỏ lại ${(T.left[l] / Math.max(1, T.n[l])).toFixed(1)}`);
    alive -= died;
  }
}

sim(false);
sim(true);
