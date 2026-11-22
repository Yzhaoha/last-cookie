// 无画面跑很多局，看平衡数据。用法：node tools/sim-test.js [局数] [round] [team]
// 0 号当“真人”（机器人 AI 操作，但享受机器人对真人的手下留情）
const SIM = require('../src/sim.js');
const N = +process.argv[2] || 40;
if (process.env.CHASERS) SIM.CFG.CHASERS = +process.env.CHASERS; // 模拟“全是真人、人人都在追”：CHASERS=7
let teamWin = 0, len = [], place = [], meEat = [], holds = 0, holdT = 0, falls = 0, meHolds = 0, meHoldT = 0, timeouts = 0;
for (let g = 0; g < N; g++) {
  const S = SIM.create({ seed: g * 7919 + 1, round: process.argv.includes('round'), team: process.argv.includes('team') }); const me = S.players[0]; me.human = true;
  let h0 = -1, hs = 0;
  while (S.phase !== 'end' && S.t < 200) {
    SIM.thinkBots(S, 1 / 60); SIM.step(S, 1 / 60);
    const h = S.cookie.holder;
    if (h !== h0) { if (h0 >= 0) { holds++; holdT += S.t - hs; if (h0 === 0) { meHolds++; meHoldT += S.t - hs; } } h0 = h; hs = S.t; }
    for (const e of S.events) if (e.k === 'fall') falls++;
  }
  if (S.playT >= SIM.CFG.MAX_T) timeouts++;
  if (S.team && S.winTeam === 0) teamWin++;
  len.push(S.playT); place.push(me.place); meEat.push(me.eaten);
}
const avg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log(`${N} 局 | 对局长度 ${avg(len)}s（${timeouts} 局打满） | 每次抱住 ${(holdT / holds).toFixed(1)}s，真人 ${(meHoldT / Math.max(1, meHolds)).toFixed(1)}s | 每局换手 ${(holds / N).toFixed(0)} 次 | 每局掉桌 ${(falls / N).toFixed(1)} 人次 | 真人平均名次 ${avg(place)}，第一名 ${(place.filter(x => x === 1).length / N * 100).toFixed(0)}%，平均吃到 ${avg(meEat)}s` + (process.argv.includes('team') ? ` | 0 号所在队赢 ${(teamWin / N * 100).toFixed(0)}%` : ''));
