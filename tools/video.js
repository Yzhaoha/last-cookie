// 生成 CrazyGames 预览视频（静音，约 17 秒）：node tools/video.js <输出目录> <帧目录> <宽> <高> <名字>
// 先在仓库根目录开本地服务：python3 -m http.server 8765。做法：游戏逐帧推进（每帧 1/30 秒），每帧截图，最后用 ffmpeg 合成。
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const [OUT, FR, W, H, NAME] = [process.argv[2], process.argv[3], +process.argv[4], +process.argv[5], process.argv[6]];
const SEC = 17, FPS = 30;
(async () => {
  fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W / 2, height: H / 2 }, deviceScaleFactor: 2, locale: 'en-US' });   // 界面按一半尺寸排版再放大一倍，字才够大
  await p.addInitScript(() => { localStorage.lc_lang = 'en'; localStorage.lc_look = '0'; localStorage.lc_played = '4'; });
  await p.goto('http://localhost:8765/index.html?debug'); await p.waitForTimeout(2500);
  await p.click('#bPlay', { force: true });
  await p.evaluate(() => {
    const st = document.createElement('style'); st.textContent = '#floats,#feed,#keys,#gear{display:none!important}'; document.head.appendChild(st);
    __manual(); __auto();
    for (let i = 0; i < 95; i++) __step(1000 / 30);   // 跳过倒数
  });
  for (let f = 0; f < SEC * FPS; f++) {
    await p.evaluate(() => __step(1000 / 30));
    await p.screenshot({ path: `${FR}/f${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (f % 90 === 0) console.log(NAME, 'frame', f);
  }
  await b.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${FR}/f%04d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-an', '-movflags', '+faststart', `${OUT}/${NAME}.mp4`]);
  console.log('done', NAME, fs.statSync(`${OUT}/${NAME}.mp4`).size >> 10, 'KB');
})();
