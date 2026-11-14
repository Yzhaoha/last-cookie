// ===== I18N =====
const CODES = ['en', 'fr', 'it', 'de', 'es', 'tr', 'zh', 'ja', 'ko', 'pt', 'ru'];
const LANG_NAMES = { en: 'English', fr: 'Français', it: 'Italiano', de: 'Deutsch', es: 'Español', tr: 'Türkçe', zh: '中文', ja: '日本語', ko: '한국어', pt: 'Português', ru: 'Русский' };
// 每条：{ en, zh, ... }；缺的语言退回英语
const TL = {
  title: { en: 'Last Cookie', zh: '最后一块饼干' },
  goal: { en: 'Stay on the cookie. Last one dry wins!', zh: '站稳饼干，最后一个没掉进牛奶的赢！' },
  alive: { en: '{n} left', zh: '剩 {n} 人' },
  go: { en: 'GO!', zh: '开始！' },
  you: { en: 'YOU', zh: '你' },
  chips: { en: 'Chips', zh: '巧克力豆' },
  next: { en: 'next size: {n}', zh: '再吃 {n} 颗变大' },
  maxSize: { en: 'MAX SIZE', zh: '已经最大' },
  bite: { en: 'BITE', zh: '咬' },
  dash: { en: 'SHOVE', zh: '冲撞' },
  jump: { en: 'JUMP', zh: '跳' },
  keysBite: { en: 'J / Z  bite cookie', zh: 'J / Z  咬饼干' },
  keysDash: { en: 'Space / K  shove', zh: '空格 / K  冲撞' },
  tuMove: { en: 'Move with WASD / arrows', zh: '用 WASD / 方向键 移动' },
  tuMoveT: { en: 'Drag anywhere to move', zh: '在屏幕上拖动来移动' },
  tuBite: { en: 'Follow the yellow arrow and walk over chocolate chips to eat them! (J bites the cookie — hidden chips inside)', zh: '跟着黄色箭头，走到巧克力豆上就吃掉了！（按 J 咬饼干，里面也藏着豆）' },
  tuBiteT: { en: 'Follow the yellow arrow and walk over chocolate chips to eat them!', zh: '跟着黄色箭头，走到巧克力豆上就吃掉了！' },
  tuDash: { en: 'Red ring = in range. Press Space to shove them into the milk!', zh: '别人脚下出现红圈 = 撞得到，按空格把他撞进牛奶！' },
  tuDashT: { en: 'Red ring = in range. Tap SHOVE to push them in!', zh: '别人脚下出现红圈 = 撞得到，点「冲撞」！' },
  tuCrack: { en: 'Glowing red pieces are about to fall — get off!', zh: '发红的饼干块马上要掉，快离开！' },
  tuHeavy: { en: 'Bigger = stronger shoves, but the cookie breaks faster under you', zh: '越大推人越狠，但脚下的饼干也碎得越快' },
  splash: { en: 'SPLASH!', zh: '扑通！' },
  intro1: { en: 'Stay on the cookie', zh: '站稳饼干' },
  intro2: { en: 'Eat chips to grow', zh: '吃巧克力豆变大' },
  intro3: { en: 'Shove others into the milk', zh: '把别人撞进牛奶' },
  reviveT: { en: 'Comeback {t}', zh: '可复活 {t}' },
  final: { en: 'FINAL — no comebacks!', zh: '决战：掉下去就出局！' },
  finalPill: { en: 'FINAL', zh: '决战' },
  back: { en: 'You\'re back!', zh: '你爬回来了！' },
  swapBack: { en: 'Swapped places! You\'re back!', zh: '换你上台！' },
  food: { en: 'Crumbs {n}/{m}', zh: '饼干碎 {n}/{m}' },
  pow: { en: 'POW!', zh: '砰！' },
  dunked: { en: '{b} dunked you!', zh: '你被 {b} 撞下去了！' },
  fishTip2: { en: 'Eat 3 floating crumbs to climb back — or knock someone in to swap places!', zh: '吃 3 块漂着的饼干碎就能爬回去，或者把人撞下来换你上去！' },
  fishTipLate: { en: 'Final round — jump at players to knock them off!', zh: '决战了，不能复活：跳起来把人撞下去！' },
  fishTip: { en: 'You\'re a fish now! Swim near the cookie and JUMP to knock someone off', zh: '你变成小鱼了！游到饼干边，按冲撞跳起来撞人' },
  fishTipT: { en: 'You\'re a fish now! Swim close and tap JUMP to knock someone off', zh: '你变成小鱼了！游到饼干边，点「跳」撞人' },
  fell: { en: '{a} fell in the milk', zh: '{a} 掉进了牛奶' },
  pushed: { en: '{b} dunked {a}', zh: '{b} 把 {a} 推进了牛奶' },
  fishHit: { en: 'Fish {b} bumped {a}!', zh: '小鱼 {b} 撞了 {a}！' },
  edge: { en: 'The edge is crumbling!', zh: '饼干边缘开始塌了！' },
  win: { en: 'YOU WIN!', zh: '你赢了！' },
  winner: { en: '{a} wins!', zh: '{a} 赢了！' },
  place: { en: '#{n}', zh: '第 {n} 名' },
  again: { en: 'Play again', zh: '再来一局' },
  crumbs: { en: 'Crumbs +{n}', zh: '饼干屑 +{n}' },
  results: { en: 'Results', zh: '本局排名' },
  sound: { en: 'Sound', zh: '音效' },
  lang: { en: 'Language', zh: '语言' },
  paused: { en: 'Paused', zh: '暂停' },
  resume: { en: 'Resume', zh: '继续' },
  tapStart: { en: 'Tap to start', zh: '点一下开始' },
  bites: { en: 'bites', zh: '咬' },
  dunks: { en: 'dunks', zh: '推下' },
};
const BOT_NAMES = ['Muffin', 'Biscotti', 'Toffee', 'Mochi', 'Scone', 'Churro', 'Waffle', 'Praline', 'Brownie', 'Eclair', 'Crumble', 'Fudge', 'Sprinkle', 'Nougat', 'Truffle', 'Pretzel'];
let LANG = 'en';
function tl(key, vars) {
  const e = TL[key]; if (!e) return key;
  let s = e[LANG] ?? e.en;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function pickLang() {
  try { const s = localStorage.getItem('lc_lang'); if (s && CODES.includes(s)) return s; } catch (e) { }
  const nav = (navigator.language || 'en').toLowerCase().slice(0, 2);
  return CODES.includes(nav) ? nav : 'en';
}
function applyLang() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = tl(el.dataset.t); });
  document.title = tl('title');
}
// ===== I18N END =====
