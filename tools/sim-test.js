// 无画面跑很多局，看平衡数据。用法：node tools/sim-test.js [局数]
// 玩家 0 号用机器人 AI 操作（但享受玩家专属照顾），落水后直奔自己的救命饼干碎
const SIM = require('../src/sim.js');
const N = +process.argv[2] || 40;
let falls = 0, early = 0, back = 0, first = [], place = [], alive60 = 0, len = [];
for (let g = 0; g < N; g++) {
  const S = SIM.create({ seed: g * 7919 + 1 }); const me = S.players[0]; me.bot = false; let f1 = null, ft = null, a60 = false;
  while (S.phase !== 'end' && S.t < 130) {
    if (me.alive) { me.bot = true; SIM.thinkBots(S, 0); me.bot = false; }
    else if (me.fish) { let b = null, bd = 1e9; for (const fl of S.floats) { if (fl.mine !== 0) continue; const d = Math.hypot(fl.x - me.fish.x, fl.z - me.fish.z); if (d < bd) { bd = d; b = fl; } } if (b) { me.inp.mx = (b.x - me.fish.x) / bd; me.inp.mz = (b.z - me.fish.z) / bd; } }
    SIM.thinkBots(S, 1 / 60); SIM.step(S, 1 / 60);
    for (const e of S.events) {
      if (e.k === 'fall' && e.p === 0) { falls++; if (f1 == null) f1 = S.playT; if (S.playT < 70) { early++; ft = S.playT; } }
      if (e.k === 'revive' && e.p === 0 && ft != null) { back++; ft = null; }
    }
    if (!a60 && S.playT >= 60) { a60 = true; if (me.alive) alive60++; }
  }
  first.push(f1 ?? 999); place.push(me.place); len.push(S.playT);
}
const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1], avg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log(`${N} 局 | 落水/局 ${(falls / N).toFixed(2)} | 首次落水中位 ${med(first).toFixed(0)}s | 60秒仍在台上 ${(alive60 / N * 100).toFixed(0)}% | 70秒前落水 ${early} 次爬回 ${back} 次 | 平均名次 ${avg(place)} | 第一名 ${(place.filter(x => x === 1).length / N * 100).toFixed(0)}% | 对局长度 ${avg(len)}s`);
