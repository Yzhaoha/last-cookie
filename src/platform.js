// 平台包装（CrazyGames / Poki 版用；GitHub 测试版用 client.js 里的空实现）。build.py 会把它换进 client.js。
// 写法照搬 burnt-again 里验证过的那份：每个调用都包一层，SDK 没加载、被广告拦截器挡了也照样能玩。
const PF = (() => {
  const safe = fn => { try { return fn(); } catch (e) { return undefined; } };
  let cg = null, poki = null, playing = false, hostMuted = false, adMuted = false, loc = '';
  // CrazyGames 会忽略 1 秒内连发的开始/停止，所以只把最后的状态发出去
  let cgSent = false, cgLast = -1e9, cgTimer = 0;
  function cgSync() {
    cgTimer = 0;
    if (!cg || cgSent === playing) return;
    const wait = cgLast + 1100 - Date.now();
    if (wait > 0) { cgTimer = setTimeout(cgSync, wait); return; }
    cgSent = playing; cgLast = Date.now();
    safe(() => (playing ? cg.game.gameplayStart() : cg.game.gameplayStop()));
  }
  const api = {
    adBusy: false, noEsc: true,                 // Esc 被平台占用（退出全屏），暂停只用 P
    get muted() { return hostMuted || adMuted; },
    locale: () => loc,
    async init() {
      // 等页面加载完再初始化，否则 CrazyGames SDK 会卡住
      if (document.readyState === 'loading') await new Promise(r => addEventListener('DOMContentLoaded', r, { once: true }));
      if (window.PokiSDK) {
        poki = window.PokiSDK;
        try { await poki.init(); } catch (e) { }
        loc = String(safe(() => poki.getLanguage && poki.getLanguage()) || '').slice(0, 2).toLowerCase();
        return;
      }
      const s = window.CrazyGames && window.CrazyGames.SDK; if (!s) return;
      try { await s.init(); } catch (e) { return; }
      if (safe(() => s.environment) === 'disabled') return;
      cg = s; safe(() => s.game.loadingStart());
      const info = safe(() => s.user.systemInfo) || {};
      loc = String(info.locale || '').slice(0, 2).toLowerCase();
      const apply = st => { hostMuted = !!(st && st.muteAudio); };
      apply(safe(() => s.game.settings)); safe(() => s.game.addSettingsChangeListener(apply));
    },
    loadingDone() { if (poki) safe(() => poki.gameLoadingFinished()); if (cg) safe(() => cg.game.loadingStop()); if (playing) cgSync(); },
    // focusLost：切走窗口导致的暂停。CrazyGames 自己会管，要求游戏别为这个发“停止”
    setPlaying(b, focusLost) {
      b = !!b; if (b === playing) return;
      if (!b && cg && focusLost) return;
      playing = b;
      if (poki) safe(() => (b ? poki.gameplayStart() : poki.gameplayStop()));
      else if (cg && !cgTimer) cgSync();
    },
    happy() { if (cg) safe(() => cg.game.happytime()); },
    // 两局之间的广告。放不放由平台决定；不管怎样最后都会调 cb，不会把人卡住
    midgame(cb) {
      let finished = false, started = false;
      const block = document.getElementById('adblock');
      const done = () => { if (finished) return; finished = true; api.adBusy = false; adMuted = false; block.hidden = true; cb && cb(); };
      if (!poki && !cg) return done();
      api.adBusy = true; block.hidden = false;
      const onStart = () => { started = true; adMuted = true; };   // 只在广告真的开始时静音
      if (poki) { try { Promise.resolve(poki.commercialBreak(onStart)).then(done, done); } catch (e) { done(); } return; }
      setTimeout(() => { if (!started) done(); }, 6000);
      try {
        const p = cg.ad.requestAd('midgame', { adStarted: onStart, adFinished: done, adError: done });
        if (p && typeof p.catch === 'function') p.catch(done);
      } catch (e) { done(); }
    },
  };
  return api;
})();
