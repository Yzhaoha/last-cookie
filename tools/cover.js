// 生成 CrazyGames 三张封面：node tools/cover.js（要先在仓库根目录开一个本地服务：python3 -m http.server 8765）
// 做法：打开游戏，摆一个“抱着饼干被一群人追”的场面，换个低机位，叠上标题，截图。
const { chromium } = require('playwright');
const OUT = process.argv[2] || 'submission';
const SIZES = [['cover-1920x1080', 1920, 1080], ['cover-800x1200', 800, 1200], ['cover-800x800', 800, 800]];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [name, w, h] of SIZES) {
    const p = await b.newPage({ viewport: { width: w, height: h }, locale: 'en-US' });
    await p.addInitScript(() => { localStorage.lc_lang = 'en'; localStorage.lc_look = '0'; });
    await p.goto('http://localhost:8765/index.html?debug'); await p.waitForTimeout(2500);
    await p.click('#bPlay', { force: true });
    await p.evaluate(({ w, h }) => {
      __manual();
      const S = __S(), P = S.players, me = P[0];
      S.obs.length = 0; S.puddles.length = 0; S.items.length = 0;               // 清场，只留人和豆
      const spots = [[-2.6, -1.2, 1, 12], [2.5, -0.9, 0, 4], [-0.9, -3.2, 2, 15], [4.6, -3.0, 0, 9], [-4.9, -3.4, 1, 17], [1.6, -4.6, 0, 6], [-2.4, -6.0, 0, 3]];
      me.x = 0.3; me.z = 1.6; me.face = 0.15; me.lvl = 1; me.eaten = 9; me.mvx = 1; me.mvz = 6; S.cookie.holder = 0; me.guard = 0;
      P.slice(1).forEach((q, i) => { const s = spots[i]; q.x = s[0]; q.z = s[1]; q.lvl = s[2]; q.look = s[3]; q.face = Math.atan2(me.x - q.x, me.z - q.z); q.mvx = Math.sin(q.face) * 6; q.mvz = Math.cos(q.face) * 6; });
      P[1].dashT = 0.12; P[3].jumpT = 0.3; P[2].boostT = 1;
      S.chips = S.chips.filter(c => Math.hypot(c.x - me.x, c.z - me.z) > 2.2 && c.z < 3);
      __newLooks && __newLooks();
      const tall = h > w, sq = h === w;
      window.__camO = tall ? { p: [0.3, 5.2, 13.5], l: [0.2, 2.6, 0] } : sq ? { p: [0.3, 4.4, 11.5], l: [0.2, 2.2, 0] } : { p: [0.3, 3.4, 10.2], l: [0.2, 1.75, 0] };
      const st = document.createElement('style');
      st.textContent = '#top,#board,#chipBox,#keys,#touch,#intro,#tip,#ptr,#feed,#banner,#gear,#tags,#floats,#vig{display:none!important}' +
        `#cv{position:fixed;left:0;right:0;top:${tall ? 6 : sq ? 4 : 3}%;text-align:center;font-size:${tall ? 150 : sq ? 132 : 190}px;line-height:.92;transform:rotate(-3deg);z-index:50;font-family:'LC Display',sans-serif;color:#fff;` +
        'text-shadow:0 6px 0 #4a2612,6px 0 0 #4a2612,-6px 0 0 #4a2612,0 -6px 0 #4a2612,5px 5px 0 #4a2612,-5px 5px 0 #4a2612,5px -5px 0 #4a2612,-5px -5px 0 #4a2612,0 14px 0 rgba(74,38,18,.45)}#cv b{color:#ffd76a;font-weight:normal}';
      document.head.appendChild(st);
      const t = document.createElement('div'); t.id = 'cv'; t.innerHTML = tall || sq ? 'LAST<br><b>COOKIE</b>' : 'LAST <b>COOKIE</b>'; document.body.appendChild(t);
      for (let i = 0; i < 40; i++) __step(0);     // 只重画，不推进游戏
    }, { w, h });
    await p.waitForTimeout(600);
    await p.evaluate(() => { for (let i = 0; i < 3; i++) __step(0); __cookie.position.y -= 0.8; __cookie.scale.setScalar(1.05); __cookie.rotation.set(0.9, 0.4, 0); __render(); });
    await p.screenshot({ path: `${OUT}/${name}.png` });
    console.log(name); await p.close();
  }
  await b.close();
})();
