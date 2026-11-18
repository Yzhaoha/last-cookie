// ===== I18N =====
const CODES = ['en', 'fr', 'it', 'de', 'es', 'tr', 'zh', 'ja', 'ko', 'pt', 'ru'];
const LANG_NAMES = { en: 'English', fr: 'Français', it: 'Italiano', de: 'Deutsch', es: 'Español', tr: 'Türkçe', zh: '中文', ja: '日本語', ko: '한국어', pt: 'Português', ru: 'Русский' };
// 每条：{ en, zh, ... }；缺的语言退回英语
const TL = {
  title: { en: 'Last Cookie', zh: '最后一块饼干' },
  go: { en: 'GO!', zh: '开抢！' },
  you: { en: 'YOU', zh: '你' },
  next: { en: '{n} more: {s}', zh: '再吃 {n} 颗：{s}' },
  skill1: { en: 'Long dash', zh: '冲得更远' },
  skill2: { en: 'Slam (jump & land)', zh: '震地（跳起落地震开人）' },
  skill3: { en: 'Cookie shield', zh: '护盾' },
  newSkill: { en: 'New move: {s}!', zh: '变大了！新招：{s}' },
  it_chili: { en: 'Chili — speed up!', zh: '辣椒！跑得飞快' },
  it_ice: { en: 'Ice — everyone nearby is frozen!', zh: '冰块！附近的人都冻住了' },
  it_bubble: { en: 'Bubble — blocks one hit', zh: '泡泡！能挡一次撞' },
  frozen: { en: '{b} froze you!', zh: '你被 {b} 冻住了！' },
  blocked: { en: 'BLOCKED!', zh: '挡住了！' },
  maxSize: { en: 'MAX — all moves', zh: '最大了，三招全有' },
  dash: { en: 'BUMP', zh: '冲撞' },
  jump: { en: 'JUMP', zh: '跳' },
  keysJump: { en: 'J / Shift  jump (dodge)', zh: 'J / Shift  跳（躲撞）' },
  keysDash: { en: 'Space / K  bump', zh: '空格 / K  冲撞' },
  intro1: { en: 'Grab the cookie', zh: '抢到饼干' },
  intro2: { en: 'Holding = eating. First to 100% wins', zh: '抱着就在吃，先吃到 100% 的赢' },
  intro3: { en: 'Bump the holder to steal it', zh: '撞抱饼干的人，抢过来' },
  tipLoose: { en: 'Follow the yellow arrow — grab the cookie!', zh: '跟着黄色箭头，去捡饼干！' },
  tipChase: { en: 'Chase the cookie holder. Red ring = in range: press Space to bump and steal!', zh: '追抱饼干的人，按空格撞他，把饼干抢过来！他脚下的圈变红 = 现在按一定撞得到' },
  tipChaseT: { en: 'Chase the cookie holder. Red ring = in range: tap BUMP to steal!', zh: '追抱饼干的人，点「冲撞」撞他，把饼干抢过来！他脚下的圈变红 = 现在点一定撞得到' },
  tipCarry: { en: 'You have it — RUN! 100% wins. Press J to jump over bumps, Space to burst away', zh: '饼干在你手里，快跑！涨到 100% 立刻赢。有人冲过来时按 J 跳起来躲开，空格冲一下甩开人' },
  tipCarryT: { en: 'You have it — RUN! 100% wins. Tap JUMP to dodge bumps, BUMP to burst away', zh: '饼干在你手里，快跑！涨到 100% 立刻赢。有人冲过来时点「跳」躲开，点「冲撞」甩开人' },
  tipFell: { en: 'Knocked off the table! Back in a moment…', zh: '被撞下桌子了，马上回来…' },
  gotIt: { en: 'You got the cookie!', zh: '饼干到手！快跑！' },
  lostIt: { en: '{b} stole your cookie!', zh: '{b} 抢走了你的饼干！' },
  stole: { en: '{b} stole it from {a}', zh: '{b} 抢了 {a} 的饼干' },
  fell: { en: '{a} fell off the table', zh: '{a} 掉下桌子了' },
  shoved: { en: '{b} knocked you off!', zh: '你被 {b} 撞下桌子了！' },
  fellSelf: { en: 'You fell off!', zh: '你掉下桌子了！' },
  almost: { en: '{a} has almost finished it — stop them!', zh: '{a} 快吃完了，快去抢！' },
  almostMe: { en: 'Almost done — hold on!', zh: '你快吃完了，撑住！' },
  last10: { en: 'Last 20 seconds — most eaten wins!', zh: '最后 20 秒！到点谁吃得多谁赢' },
  pow: { en: 'POW!', zh: '砰！' },
  win: { en: 'YOU WIN!', zh: '你赢了！' },
  winner: { en: '{a} wins!', zh: '{a} 赢了！' },
  place: { en: '#{n}', zh: '第 {n} 名' },
  again: { en: 'Play again', zh: '再来一局' },
  crumbs: { en: 'Crumbs +{n}', zh: '饼干屑 +{n}' },
  sound: { en: 'Sound', zh: '声音' },
  music: { en: 'Music', zh: '音乐' },
  lang: { en: 'Language', zh: '语言' },
  paused: { en: 'Paused', zh: '暂停' },
  resume: { en: 'Resume', zh: '继续' },
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
