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
  skill2: { en: 'Slam (jump)', zh: '跳起震地' },
  skill3: { en: 'Auto shield', zh: '自动护盾' },
  newSkill: { en: 'Bigger! New move — {s}', zh: '变大了！新招：{s}' },
  how1: { en: 'Long dash: your bump goes further (automatic)', zh: '冲得更远——冲撞距离变长（自动生效，不用按）' },
  how2: { en: 'Slam: press J to jump — landing knocks everyone away', zh: '震地——按 J 跳起来，落地震开周围的人' },
  how2T: { en: 'Slam: tap JUMP — landing knocks everyone away', zh: '震地——点「跳」，落地震开周围的人' },
  how3: { en: 'Shield: while holding the cookie it blocks one hit (automatic, recharges in 12s)', zh: '护盾——抱着饼干时自动挡一次撞（不用按，12 秒后恢复）' },
  it_chili: { en: 'Chili — speed up!', zh: '辣椒！跑得飞快' },
  it_ice: { en: 'Ice — everyone nearby is frozen!', zh: '冰块！附近的人都冻住了' },
  it_bubble: { en: 'Bubble — blocks one hit', zh: '泡泡！能挡一次撞' },
  frozen: { en: '{b} froze you!', zh: '你被 {b} 冻住了！' },
  blocked: { en: 'BLOCKED!', zh: '挡住了！' },
  maxSize: { en: 'MAX: long dash · slam · auto shield', zh: '远冲 · 跳起震地 · 自动护盾' },
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
  gotIt: { en: 'Got it! Speed burst — RUN!', zh: '饼干到手！趁加速快跑！' },
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
  daily: { en: 'Daily gift +{n} (day {d})', zh: '每日奖励 +{n}（连续第 {d} 天）' },
  qSteal: { en: 'Steal the cookie {n} times', zh: '抢 {n} 次饼干' },
  qChips: { en: 'Eat {n} chocolate chips', zh: '吃 {n} 颗巧克力豆' },
  qWin: { en: 'Win {n} match', zh: '赢 {n} 局' },
  questDone: { en: 'Quest done +{n}', zh: '任务完成 +{n}' },
  skip: { en: 'Play now (vs bots)', zh: '不等了，直接开始' },
  finding: { en: 'Finding players… {n}/{m}', zh: '正在找对手… {n}/{m}' },
  play: { en: 'PLAY', zh: '开始' },
  skins: { en: 'Skins', zh: '皮肤' },
  use: { en: 'Use', zh: '用这个' },
  using: { en: 'Using', zh: '正在用' },
  locked: { en: 'Locked — open boxes', zh: '还没开到' },
  openBox: { en: 'Open mystery box  🍪{n}', zh: '开盲盒  🍪{n}' },
  needMore: { en: 'Need {n} more crumbs', zh: '还差 {n} 饼干屑' },
  allOwned: { en: 'All collected!', zh: '全部集齐了！' },
  close: { en: 'Close', zh: '关闭' },
  paused: { en: 'Paused', zh: '暂停' },
  resume: { en: 'Resume', zh: '继续' },
  modeSolo: { en: "Solo", zh: "单挑" },
  modeSoloD: { en: "Every snack for itself", zh: "各抢各的" },
  modeTeam: { en: "Teams", zh: "组队" },
  modeTeamD: { en: "4 vs 4 — eat together", zh: "4 对 4，一起吃" },
  blue: { en: "Blue", zh: "蓝队" },
  red: { en: "Red", zh: "红队" },
  usTeam: { en: "Your team", zh: "我们队" },
  intro2T: { en: "Teammate holding = your team eating. First team to 100% wins", zh: "队友抱着也算你们队在吃，先吃到 100% 的队赢" },
  intro3T: { en: "Bump enemies: guard your carrier, steal theirs", zh: "撞敌人：护住自家的，抢走他们的" },
  tipGuard: { en: "Your teammate has it — bump enemies near them (Space)!", zh: "队友拿着饼干——按空格撞靠近他的敌人，护住他！" },
  tipGuardT: { en: "Your teammate has it — tap BUMP on enemies near them!", zh: "队友拿着饼干——点「冲撞」撞靠近他的敌人，护住他！" },
  teamWin: { en: "YOUR TEAM WINS!", zh: "你们队赢了！" },
  teamLose: { en: "{t} wins!", zh: "{t}赢了！" },
  almostUs: { en: "Your team is almost done — hold on!", zh: "你们队快吃完了，撑住！" },
  almostThem: { en: "{t} has almost finished — stop them!", zh: "{t}快吃完了，快去抢！" },
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
  // 手机按钮上的字：长的语言自动缩小，免得撑出圆按钮
  document.querySelectorAll('.tb span').forEach(s => { const n = s.textContent.length; s.style.fontSize = n > 6 ? '11px' : n > 4 ? '14px' : ''; });
}
// ===== I18N END =====
