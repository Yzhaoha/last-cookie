// ===== SIM START（纯逻辑，可在 node 里跑） =====
// 玩法 v3「抢饼干」：大桌面上只有一块饼干，抱着它跑，累计抱满 WIN_T 秒（吃完）就赢。
const SIM = (() => {
  const CFG = {
    HW: 26, HH: 18,       // 长方桌：半宽 / 半深（米）
    ROUND_R: 20,          // 圆桌半径（小一些，边更近，更容易被撞下去）
    N: 8,                 // 人数（你 + 7 个机器人）
    SPEED: 6.2, ACCEL: 60, KFRIC: 5.5, BODY_R: 0.5,
    // ——以下规则对所有人一视同仁（以后全是真人联机也成立），不再给“真人”开小灶——
    CARRY_SLOW: 0.93,      // 抱着饼干跑得慢一些：追的人迟早追得上
    GRAB_BOOST: 1.35, GRAB_T: 2.0, // 刚抢到：加速冲出人堆
    ROBBED_CD: 2.0,       // 刚被抢：这么久不能冲撞（不能立刻抢回来，避免来回倒手）
    CHASE_DASH: 1.2,      // 追抱饼干的人时冲得更远
    PAD: 0.25,            // 冲向抱饼干的人时判定放宽
    HOME_TURN: 5,         // 冲撞途中跟着目标拐弯的速度（弧度/秒）；急转或跳起来仍然躲得开
    WIN_T: 24,            // 累计抱满这么多秒就赢
    MAX_T: 180,           // 只是保险：正常都是有人先吃完；真拖到这时谁吃得多谁赢（界面最后 20 秒才显示倒计时）
    COUNT_T: 3,
    // 冲撞
    DASH_T: 0.22, DASH_SPEED: 15, DASH_CD: 1.2, DASH_K: 9, STUN_T: 0.35,
    JUMP_T: 0.55, JUMP_CD: 2.2, // 跳：空中撞不到你；2 级起落地震开一圈人
    DASH_BUF: 0.3,        // 冷却快好时提前按也算数
    AIM_R: 5, AIM_ANG: 1.6,   // 冲撞自动对准抱饼干的人（距离、夹角）——所有人都一样
    GUARD_T: 2.5,         // 刚抢到饼干的保护时间
    STEAL_CD: 0.25,       // 抢到后冲撞马上又能用（好甩开人）
    PICK_R: 1.0,
    RESPAWN_T: 2.0, INV_T: 1.2,
    // 巧克力豆：吃了变大
    CHIP_N: 64, CHIP_R: 0.8, CHIP_RESPAWN: 0.25,
    LVL_AT: [0, 4, 10, 18],
    // 升级解锁的招：1 级冲得更远，2 级冲撞落地震开一圈人，3 级抱饼干时护盾挡一次
    DASH_LONG: 1.4, WAVE_R: 2.8, WAVE_K: 7.5, SHIELD_CD: 12,
    // 桌上的道具：辣椒（加速）、冰块（冻住附近的人）、泡泡（挡一次撞）
    ITEM_N: 4, ITEM_T: 4, BOOST_T: 4, BOOST: 1.38, FREEZE_R: 8, FREEZE_T: 1.6, BUBBLE_T: 12,
    // 果酱：踩上去变慢
    PUDDLE_N: 5, PUDDLE_R: 2.1, PUDDLE_SLOW: 0.55,
    SCALE: [1, 1.18, 1.36, 1.55],
    POWER: [1, 1.2, 1.4, 1.6],     // 撞人力度
    MASS: [1, 1.25, 1.55, 1.9],    // 抗撞
    SLOW: [1, 0.985, 0.97, 0.955],
    // 机器人
    CHASERS: 4,           // 同时追饼干的机器人数量
    BOT_RATE: 4,          // 机器人够得着时每秒出手的概率（越小越不爱撞）
    BOT_REACT: 0.35,      // 机器人出手前的反应时间
    // 组队模式：红蓝两队各 4 人，队友抱着也算本队在吃；队友之间撞不动、抢不走、冻不住、震不开
    TEAM_WIN: 45,         // 一队累计抱满这么多秒就赢
    TEAM_CHASE: 3,        // 敌人抱着时，本队同时去追的机器人数
    TEAM_GUARD: 2,        // 队友抱着时，本队去护驾的机器人数
    // 三队（每队 3 人、一局 9 人）：每队分到的时间少，门槛低一些、追/护的人少一些
    TEAM3_WIN: 34, TEAM3_CHASE: 2, TEAM3_GUARD: 1,
  };
  // 同一队吗（单挑模式永远不是）
  const ally = (S, a, b) => S.team && a.team === b.team;

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ---- 桌上的障碍：杯子、碗、果酱瓶（圆）；牛奶盒、书、麦片盒（方） ----
  const KINDS = { mug: { r: 1.5 }, bowl: { r: 2.5 }, jar: { r: 1.15 }, carton: { w: 2.2, d: 2.2 }, books: { w: 5, d: 3.4 }, cereal: { w: 6, d: 2.2 } };
  // 离桌边还有多远（负数 = 已经出桌）
  function edgeGap(S, x, z) { return S.round ? CFG.ROUND_R - Math.hypot(x, z) : Math.min(CFG.HW - Math.abs(x), CFG.HH - Math.abs(z)); }
  function pullIn(S, x, z, m) {
    if (S.round) { const d = Math.hypot(x, z), R = CFG.ROUND_R - m; return d > R ? [x / d * R, z / d * R] : [x, z]; }
    return [Math.max(-CFG.HW + m, Math.min(CFG.HW - m, x)), Math.max(-CFG.HH + m, Math.min(CFG.HH - m, z))];
  }
  function makeObstacles(r, round) {
    const obs = [], want = round ? ['bowl', 'books', 'cereal', 'mug', 'mug', 'mug', 'carton', 'carton', 'jar', 'jar', 'jar'] : ['bowl', 'bowl', 'books', 'books', 'cereal', 'cereal', 'mug', 'mug', 'mug', 'mug', 'carton', 'carton', 'carton', 'jar', 'jar', 'jar', 'jar'];
    for (const kind of want) {
      const K = KINDS[kind];
      for (let t = 0; t < 80; t++) {
        let w = K.w, d = K.d; if (w && r() < 0.5) { const s = w; w = d; d = s; }
        const br = K.r || Math.hypot(w, d) / 2, ex = K.r || w / 2, ez = K.r || d / 2;
        const x = (r() * 2 - 1) * ((round ? CFG.ROUND_R : CFG.HW) - 2.6 - ex), z = (r() * 2 - 1) * ((round ? CFG.ROUND_R : CFG.HH) - 2.6 - ez);
        if (round && Math.hypot(x, z) + br > CFG.ROUND_R - 2.6) continue;
        if (Math.hypot(x, z) < br + 5.5) continue;
        if (obs.some(o => Math.hypot(o.x - x, o.z - z) < o.br + br + 2.6)) continue;
        obs.push({ id: obs.length, kind, x, z, r: K.r || 0, hw: w / 2 || 0, hd: d / 2 || 0, br, rot: r() * 6.283, tint: (r() * 6) | 0 });
        break;
      }
    }
    return obs;
  }
  // Versioned breakfast arenas: a clear centre, two loop routes and jumpable shortcuts.
  function makeArena(seed, round) {
    const variant = Math.abs(seed) % 3, out = [];
    const layouts = [
      [['bowl',-5,-3],['bowl',5,-3],['books',-10,4],['books',10,4],['toast',0,4.5],['mug',-15,-8],['mug',15,-8],['jar',-16,8],['jar',16,8]],
      [['books',-5,-4],['books',5,4],['mug',-10,6],['mug',10,-6],['toast',0,-5],['toast',0,5],['jar',-15,-7],['jar',15,7]],
      [['bowl',0,-6],['bowl',0,6],['carton',-8,-3],['carton',8,3],['toast',-7,3],['toast',7,-3],['mug',-13,7],['mug',13,-7]],
    ];
    for (const [kind,x,z] of layouts[variant]) {
      const K = kind === 'toast' ? { w: 5.4, d: 0.9 } : KINDS[kind];
      const w = K.w || 0, d = K.d || 0, br = K.r || Math.hypot(w,d)/2;
      if (round && Math.hypot(x,z)+br > CFG.ROUND_R-1.8) continue;
      out.push({ id: out.length, kind, x, z, r: K.r || 0, hw: w/2, hd: d/2, br, rot: 0, tint: out.length % 3, low: kind === 'toast' });
    }
    return out;
  }
  // 把圆 (x,z,rad) 推出障碍；返回 [x, z, 碰到了吗]
  function pushOut(obs, x, z, rad, airborne = false) {
    let hit = false;
    for (const o of obs) {
      if (airborne && o.low) continue;
      const dx = x - o.x, dz = z - o.z;
      if (o.r) {
        const d = Math.hypot(dx, dz), m = o.r + rad;
        if (d < m) { const k = d > 1e-4 ? m / d : 1; x = o.x + (d > 1e-4 ? dx * k : m); z = o.z + dz * k; hit = true; }
      } else {
        if (Math.abs(dx) > o.hw + rad || Math.abs(dz) > o.hd + rad) continue;
        const cx = Math.max(-o.hw, Math.min(o.hw, dx)), cz = Math.max(-o.hd, Math.min(o.hd, dz));
        const ex = dx - cx, ez = dz - cz, d = Math.hypot(ex, ez);
        if (d > 1e-4) { if (d < rad) { x = o.x + cx + ex / d * rad; z = o.z + cz + ez / d * rad; hit = true; } }
        else { // 圆心在盒子里：从最近的一边出去
          const px = o.hw - Math.abs(dx), pz = o.hd - Math.abs(dz);
          if (px < pz) x = o.x + Math.sign(dx || 1) * (o.hw + rad); else z = o.z + Math.sign(dz || 1) * (o.hd + rad);
          hit = true;
        }
      }
    }
    return [x, z, hit];
  }
  function blocked(S, x, z, rad, edge = 0.6) {
    if (edgeGap(S, x, z) < edge) return true;
    for (const o of S.obs) {
      const dx = x - o.x, dz = z - o.z;
      if (o.r) { if (dx * dx + dz * dz < (o.r + rad) * (o.r + rad)) return true; }
      else if (Math.abs(dx) < o.hw + rad && Math.abs(dz) < o.hd + rad) return true;
    }
    return false;
  }
  function freeSpot(S, pred) {
    for (let t = 0; t < 200; t++) {
      const x = (S.rnd() * 2 - 1) * ((S.round ? CFG.ROUND_R : CFG.HW) - 2), z = (S.rnd() * 2 - 1) * ((S.round ? CFG.ROUND_R : CFG.HH) - 2);
      if (blocked(S, x, z, 0.9)) continue;
      if (pred && t < 150 && !pred(x, z)) continue;
      return [x, z];
    }
    return [0, 0];
  }

  function create(opts = {}) {
    const seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    const n = opts.players ?? CFG.N;
    const R = rng(seed ^ 0x5bd1e995);
    const S = { cfg: CFG, round: !!opts.round, team: opts.team ? (opts.team === true ? 2 : opts.team) : 0, teamEat: [], winTeam: -1, arena: opts.arena !== false, variant: Math.abs(seed) % 3, obs: opts.arena === false ? makeObstacles(rng(seed), !!opts.round) : makeArena(seed, !!opts.round), players: [], net: false, lt: 0, chipVer: 0, itemVer: 0, chips: [], chipId: 0, chipT: 0, items: [], itemId: 0, itemT: 2, puddles: [], t: 0, playT: 0, phase: 'count', phaseT: CFG.COUNT_T, events: [], winner: -1, rnd: R, seed,
      cookie: { x: 0, z: 0, holder: -1, cd: 0, no: -1, noT: 0, munch: 0 } };
    for (let t = 0; t < S.team; t++) S.teamEat.push(0);
    const t3 = S.team === 3; S.tWin = t3 ? CFG.TEAM3_WIN : CFG.TEAM_WIN; S.tChase = t3 ? CFG.TEAM3_CHASE : CFG.TEAM_CHASE; S.tGuard = t3 ? CFG.TEAM3_GUARD : CFG.TEAM_GUARD;
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + i / n * Math.PI * 2;
      let x = Math.cos(a) * 11, z = Math.sin(a) * 8.5;
      [x, z] = pushOut(S.obs, x, z, 0.9);
      S.players.push({
        id: i, team: S.team ? i % S.team : 0, bot: true, human: false, name: '', look: i, x, z, face: Math.atan2(-x, -z),
        mvx: 0, mvz: 0, kvx: 0, kvz: 0, chips: 0, lvl: 0, on: true, fallT: 0, fx: 0, fz: 0, fvx: 0, fvz: 0,
        inv: 0, guard: 0, dashCd: 0.4, dashT: 0, dashX: 0, dashZ: 0, dashHit: false, hitT: 0, lastHit: -1, lastHitT: 0,
        shieldCd: 0, boostT: 0, frozenT: 0, bubbleT: 0, wave: false, eaten: 0, steals: 0, shoves: 0, falls: 0, place: 0,
        bestHold: 0, holdRun: 0, lastSteal: -1, home: -1, grabT: 0, actT: -9, jumpT: 0, jumpCd: 0, jumpBuf: 0, inp: { mx: 0, mz: 0, dash: false, jump: false }, ai: { t: 0, mx: 0, mz: 0, side: 1, sideT: 0, chip: null, react: 0 },
      });
    }
    for (let i = 0; i < CFG.PUDDLE_N; i++) { const [x, z] = freeSpot(S, (x, z) => Math.hypot(x, z) > 7 && edgeGap(S, x, z) > 4 && S.puddles.every(c => Math.hypot(c.x - x, c.z - z) > 9)); S.puddles.push({ id: i, x, z, r: CFG.PUDDLE_R * (0.8 + S.rnd() * 0.4) }); }
    for (let i = 0; i < CFG.CHIP_N; i++) addChip(S);
    return S;
  }
  function addChip(S) {
    const [x, z] = freeSpot(S, (x, z) => Math.hypot(x, z) > 3 && S.chips.every(c => Math.hypot(c.x - x, c.z - z) > 1.8));
    S.chips.push({ id: S.chipId++, x, z }); S.chipVer++;
  }
  function lvlOf(chips) { let l = 0; for (let i = 0; i < CFG.LVL_AT.length; i++) if (chips >= CFG.LVL_AT[i]) l = i; return l; }
  function ev(S, e) { S.events.push(e); }

  function fall(S, p) {
    if (S.net) return;
    p.on = false; p.fallT = 0; p.falls++; p.fx = p.x; p.fz = p.z; p.fvx = p.kvx + p.mvx; p.fvz = p.kvz + p.mvz; p.dashT = 0;
    p.chips = Math.floor(p.chips / 2); p.lvl = lvlOf(p.chips);
    const by = (p.lastHit >= 0 && S.t - p.lastHitT < 3) ? p.lastHit : -1;
    if (by >= 0) S.players[by].shoves++;
    ev(S, { k: 'fall', p: p.id, by, x: p.x, z: p.z });
    const ck = S.cookie;
    if (ck.holder === p.id) { // 饼干留在桌边
      let [x, z] = pullIn(S, p.x, p.z, 3);
      [x, z] = pushOut(S.obs, x, z, 0.8);
      ck.holder = -1; ck.x = x; ck.z = z; ck.cd = 0.4; ck.no = p.id; ck.noT = 3;
      ev(S, { k: 'drop', p: p.id, x, z });
    }
  }
  function respawn(S, p) {
    const ck = S.cookie;
    const [x, z] = freeSpot(S, (x, z) => { const d = Math.hypot(x - ck.x, z - ck.z); return d > 7 && d < 16 && S.players.every(q => q === p || !q.on || Math.hypot(q.x - x, q.z - z) > 2.5); });
    p.on = true; p.x = x; p.z = z; p.mvx = p.mvz = p.kvx = p.kvz = 0; p.inv = CFG.INV_T; p.hitT = 0; p.frozenT = 0; p.boostT = 0; p.lastHit = -1; p.dashCd = 0.3;
    ev(S, { k: 'respawn', p: p.id, x, z });
  }
  function finish(S) {
    if (S.phase === 'end' || S.net) return;
    S.phase = 'end'; S.phaseT = 0;
    if (S.team) S.winTeam = S.teamEat.indexOf(Math.max(...S.teamEat));
    const tw = p => S.team && p.team === S.winTeam ? 1 : 0;
    const order = S.players.slice().sort((a, b) => tw(b) - tw(a) || b.eaten - a.eaten || b.steals - a.steals || a.id - b.id);
    order.forEach((p, i) => p.place = i + 1);
    S.winner = order[0].id;
    ev(S, { k: 'end' });
  }
  function bonk(S, a, b) {
    const C = CFG;
    if (ally(S, a, b)) return;   // 撞到队友：直接穿过去，冲撞继续
    a.dashHit = true; a.dashT = Math.min(a.dashT, 0.05);
    if (b.inv > 0) return;
    let dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz) || 1; dx = dx / d * 0.6 + a.dashX * 0.4; dz = dz / d * 0.6 + a.dashZ * 0.4;
    const l = Math.hypot(dx, dz) || 1, guarded = b.guard > 0;
    if (shielded(S, b)) { b.kvx = dx / l * 3; b.kvz = dz / l * 3; a.kvx = -dx / l * 5; a.kvz = -dz / l * 5; a.hitT = 0.2; return; }
    const f = C.DASH_K * C.POWER[a.lvl] / C.MASS[b.lvl] * (guarded ? 0.5 : 1);
    b.kvx = dx / l * f; b.kvz = dz / l * f; b.hitT = guarded ? 0.2 : C.STUN_T; b.dashT = 0; b.lastHit = a.id; b.lastHitT = S.t;
    ev(S, { k: 'bonk', a: a.id, b: b.id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, f });
    if (!guarded) trySteal(S, a, b);
  }
  // 泡泡 / 3 级护盾：挡一次。返回 true = 被挡住了
  function shielded(S, b) {
    if (b.bubbleT > 0) { b.bubbleT = 0; ev(S, { k: 'block', p: b.id, why: 'bubble' }); return true; }
    if (b.lvl >= 3 && b.shieldCd <= 0 && S.cookie.holder === b.id) { b.shieldCd = CFG.SHIELD_CD; ev(S, { k: 'block', p: b.id, why: 'shield' }); return true; }
    return false;
  }
  function trySteal(S, a, b) {
    const ck = S.cookie;
    if (ck.holder !== b.id || S.phase !== 'play' || S.net || ally(S, a, b)) return;
    ck.holder = a.id; a.guard = CFG.GUARD_T; a.grabT = CFG.GRAB_T; a.steals++; a.lastSteal = S.playT; a.dashCd = Math.min(a.dashCd, CFG.STEAL_CD); b.dashCd = Math.max(b.dashCd, CFG.ROBBED_CD);
    ev(S, { k: 'steal', a: a.id, b: b.id });
  }
  // 2 级：冲撞落地震开一圈人（抱饼干的人被震到也会丢饼干）
  function shock(S, a) {
    const C = CFG, R = C.WAVE_R * C.SCALE[a.lvl];
    ev(S, { k: 'wave', p: a.id, x: a.x, z: a.z, r: R });
    for (const b of S.players) {
      if (b === a || !b.on || b.inv > 0 || b.jumpT > 0 || ally(S, a, b)) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.01;
      if (d > R || (S.t - b.lastHitT < 0.3 && b.lastHit === a.id)) continue;
      if (shielded(S, b)) continue;
      const g = b.guard > 0, f = C.WAVE_K * C.POWER[a.lvl] / C.MASS[b.lvl] * (g ? 0.5 : 1);
      b.kvx += dx / d * f; b.kvz += dz / d * f; b.hitT = Math.max(b.hitT, 0.25); b.dashT = 0; b.lastHit = a.id; b.lastHitT = S.t;
      if (!g) trySteal(S, a, b);
    }
  }
  function addItem(S) {
    const kinds = ['chili', 'ice', 'bubble'], kind = kinds[(S.rnd() * 3) | 0];
    const [x, z] = freeSpot(S, (x, z) => S.items.every(c => Math.hypot(c.x - x, c.z - z) > 10) && S.players.every(q => Math.hypot(q.x - x, q.z - z) > 4));
    S.items.push({ id: S.itemId++, kind, x, z }); S.itemVer++; ev(S, { k: 'itemSpawn', x, z });
  }
  function useItem(S, p, it) {
    const C = CFG;
    ev(S, { k: 'item', p: p.id, kind: it.kind, x: it.x, z: it.z });
    if (it.kind === 'chili') p.boostT = C.BOOST_T;
    else if (it.kind === 'bubble') p.bubbleT = C.BUBBLE_T;
    else for (const o of S.players) { if (o === p || !o.on || o.inv > 0 || ally(S, o, p) || Math.hypot(o.x - p.x, o.z - p.z) > C.FREEZE_R) continue; if (o.bubbleT > 0) { o.bubbleT = 0; ev(S, { k: 'block', p: o.id, why: 'bubble' }); continue; } o.frozenT = C.FREEZE_T; o.dashT = 0; ev(S, { k: 'frozen', p: o.id, by: p.id }); }
  }

  function step(S, dt) {
    const C = CFG, P = S.players, ck = S.cookie;
    S.events.length = 0;
    S.t += dt; S.lt += dt;
    if (S.phase === 'count') { S.phaseT -= dt; if (S.phaseT <= 0) { S.phase = 'play'; S.playT = 0; ev(S, { k: 'go' }); } }
    const playing = S.phase === 'play';
    if (playing) S.playT += dt;
    if (S.phase === 'end') S.phaseT += dt;

    for (const p of P) {
      p.grabT -= dt; p.inv -= dt; p.guard -= dt; p.dashCd -= dt; p.hitT -= dt; p.shieldCd -= dt; p.boostT -= dt; p.frozenT -= dt; p.bubbleT -= dt;
      if (!p.on) { p.fallT += dt; if (S.phase !== 'end' && p.fallT >= C.RESPAWN_T && !S.net) respawn(S, p); p.inp.dash = p.inp.jump = false; continue; }
      const stunned = p.hitT > 0 || p.frozenT > 0, carry = ck.holder === p.id;
      let mx = p.inp.mx, mz = p.inp.mz; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
      if (!playing || stunned) mx = mz = 0;
      if (p.inp.dash) p.dashBuf = C.DASH_BUF; else p.dashBuf = (p.dashBuf || 0) - dt;
      p.jumpCd -= dt;
      if (p.inp.jump) p.jumpBuf = C.DASH_BUF; else p.jumpBuf -= dt;
      p.inp.jump = false;
      if (p.jumpT > 0) { p.jumpT -= dt; if (p.jumpT <= 0) { ev(S, { k: 'land', p: p.id, x: p.x, z: p.z }); if (p.lvl >= 2 && p.frozenT <= 0) shock(S, p); } }
      else if (playing && p.jumpBuf > 0 && p.jumpCd <= 0 && !stunned && p.dashT <= 0) { p.jumpBuf = 0; p.jumpT = C.JUMP_T; p.jumpCd = C.JUMP_CD; p.actT = S.lt; ev(S, { k: 'jump', p: p.id }); }
      if (playing && p.dashBuf > 0 && p.dashCd <= 0 && !stunned && p.jumpT <= 0) {
        p.dashBuf = 0;
        const noDir = Math.hypot(mx, mz) < 0.2;
        let dx = mx, dz = mz; if (noDir) { dx = Math.sin(p.face); dz = Math.cos(p.face); }
        let aimAt = ck.holder >= 0 && !carry && !ally(S, p, P[ck.holder]) ? P[ck.holder] : null;
        if (S.team && ck.holder >= 0 && !carry && !aimAt) { // 组队：队友抱着时，自动对准离他最近、想抢他的敌人（护驾）
          const h = P[ck.holder]; let bd = 1e9;
          for (const o of P) { if (!o.on || o.team === p.team) continue; const d = Math.hypot(o.x - h.x, o.z - h.z) + Math.hypot(o.x - p.x, o.z - p.z) * 0.5; if (d < bd) { bd = d; aimAt = o; } }
        }
        p.home = -1;
        if (aimAt) { // 自动对准
          const h = aimAt, hx = h.x + h.mvx * 0.1 - p.x, hz = h.z + h.mvz * 0.1 - p.z, hd = Math.hypot(hx, hz) || 1, l0 = Math.hypot(dx, dz) || 1;
          if (hd < C.AIM_R * C.SCALE[p.lvl] && (noDir || (dx * hx + dz * hz) / (l0 * hd) > Math.cos(C.AIM_ANG))) { dx = hx; dz = hz; p.home = h.id; }
        }
        const l = Math.hypot(dx, dz); p.dashX = dx / l; p.dashZ = dz / l; p.dashT = C.DASH_T * (p.lvl >= 1 ? C.DASH_LONG : 1) * (!carry && ck.holder >= 0 && !ally(S, p, P[ck.holder]) ? C.CHASE_DASH : 1); p.dashCd = C.DASH_CD; p.dashHit = false; p.actT = S.lt;
        ev(S, { k: 'dash', p: p.id });
      }
      p.inp.dash = false;
      const sp = C.SPEED * C.SLOW[p.lvl] * (carry ? C.CARRY_SLOW : 1) * (p.grabT > 0 ? C.GRAB_BOOST : 1) * (p.boostT > 0 ? C.BOOST : 1) * (p.jumpT <= 0 && S.puddles.some(c => (c.x - p.x) ** 2 + (c.z - p.z) ** 2 < c.r * c.r) ? C.PUDDLE_SLOW : 1);
      if (p.frozenT > 0) { p.mvx = p.mvz = 0; p.dashT = 0; }
      if (p.dashT > 0 && p.home >= 0 && (ck.holder === p.home || (S.team && ck.holder >= 0 && ally(S, p, P[ck.holder]))) && P[p.home].on && !p.dashHit) { // 冲的过程中跟着目标拐（有转弯上限）
        const h = P[p.home], want = Math.atan2(h.z - p.z, h.x - p.x), cur = Math.atan2(p.dashZ, p.dashX);
        let d = want - cur; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832;
        const na = cur + Math.max(-C.HOME_TURN * dt, Math.min(C.HOME_TURN * dt, d)); p.dashX = Math.cos(na); p.dashZ = Math.sin(na);
      }
      if (p.dashT > 0) { p.dashT -= dt; p.mvx = p.dashX * C.DASH_SPEED; p.mvz = p.dashZ * C.DASH_SPEED; }
      else {
        const k = Math.min(1, C.ACCEL * dt / Math.max(0.001, Math.hypot(mx * sp - p.mvx, mz * sp - p.mvz)));
        p.mvx += (mx * sp - p.mvx) * k; p.mvz += (mz * sp - p.mvz) * k;
      }
      if (Math.hypot(p.mvx, p.mvz) > 0.6) {
        const want = Math.atan2(p.mvx, p.mvz); let d = want - p.face; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832;
        p.face += d * Math.min(1, 22 * dt);
      }
      // 自己走（冲）不会出桌；只有被撞飞才会掉下去
      p.x += p.mvx * dt; p.z += p.mvz * dt;
      const kv = Math.hypot(p.kvx, p.kvz);
      if (kv < 2) [p.x, p.z] = pullIn(S, p.x, p.z, 0.35);
      p.x += p.kvx * dt; p.z += p.kvz * dt;
      const fr = Math.exp(-C.KFRIC * dt); p.kvx *= fr; p.kvz *= fr;
      const res = pushOut(S.obs, p.x, p.z, C.BODY_R * C.SCALE[p.lvl], p.jumpT > 0);
      if (res[2]) { p.x = res[0]; p.z = res[1]; p.kvx *= 0.8; p.kvz *= 0.8; }
      if (edgeGap(S, p.x, p.z) < 0) fall(S, p);
    }
    // 人撞人
    for (let i = 0; i < P.length; i++) {
      const a = P[i]; if (!a.on) continue;
      for (let j = i + 1; j < P.length; j++) {
        const b = P[j]; if (!b.on) continue;
        const pad = !ally(S, a, b) && ((a.dashT > 0 && !a.dashHit && ck.holder === b.id) || (b.dashT > 0 && !b.dashHit && ck.holder === a.id)) ? C.PAD : 0;
        const dx = b.x - a.x, dz = b.z - a.z, m = C.BODY_R * (C.SCALE[a.lvl] + C.SCALE[b.lvl]) + pad, d2 = dx * dx + dz * dz;
        if (d2 >= m * m) continue;
        if (a.jumpT > 0 || b.jumpT > 0) continue; // 空中：互相穿过，撞不到
        const d = Math.sqrt(d2) || 0.001, ov = (m - d) / 2, nx = dx / d, nz = dz / d;
        a.x -= nx * ov; a.z -= nz * ov; b.x += nx * ov; b.z += nz * ov;
        if (a.dashT > 0 && !a.dashHit) bonk(S, a, b);
        else if (b.dashT > 0 && !b.dashHit) bonk(S, b, a);
      }
    }
    for (const p of P) if (p.id !== ck.holder) p.holdRun = 0;
    // 饼干
    ck.cd -= dt; ck.noT -= dt;
    if (ck.holder >= 0) {
      const h = P[ck.holder]; ck.x = h.x; ck.z = h.z;
      if (playing) {
        h.eaten += dt; h.holdRun += dt; h.bestHold = Math.max(h.bestHold, h.holdRun); ck.munch -= dt;
        if (ck.munch <= 0) { ck.munch = 0.42; ev(S, { k: 'munch', p: h.id }); }
        if (S.team) { S.teamEat[h.team] += dt; if (S.teamEat[h.team] >= S.tWin) { S.teamEat[h.team] = S.tWin; finish(S); } }
        else if (h.eaten >= C.WIN_T) { h.eaten = C.WIN_T; finish(S); }
      }
    } else if (playing && ck.cd <= 0) {
      let best = null, bd = 1e9;
      for (const p of P) {
        if (!p.on || p.hitT > 0 || p.frozenT > 0 || p.jumpT > 0 || (ck.no === p.id && ck.noT > 0)) continue;
        const d = Math.hypot(p.x - ck.x, p.z - ck.z);
        if (d < C.PICK_R * C.SCALE[p.lvl] && d < bd) { bd = d; best = p; }
      }
      if (best && !S.net) { ck.holder = best.id; best.guard = 1.5; best.grabT = 1.0; ev(S, { k: 'pick', p: best.id }); }
    }
    // 巧克力豆
    for (let i = S.net ? -1 : S.chips.length - 1; i >= 0; i--) {
      const c = S.chips[i];
      for (const p of P) {
        if (!p.on) continue;
        if (Math.hypot(p.x - c.x, p.z - c.z) < C.CHIP_R * C.SCALE[p.lvl]) {
          S.chips.splice(i, 1); p.chips++; S.chipVer++;
          const l = lvlOf(p.chips); ev(S, { k: 'chip', p: p.id, x: c.x, z: c.z });
          if (l > p.lvl) { p.lvl = l; ev(S, { k: 'grow', p: p.id }); }
          break;
        }
      }
    }
    for (let i = S.net ? -1 : S.items.length - 1; i >= 0; i--) {
      const it = S.items[i];
      for (const p of P) if (p.on && p.frozenT <= 0 && Math.hypot(p.x - it.x, p.z - it.z) < 0.95 * C.SCALE[p.lvl]) { S.items.splice(i, 1); S.itemVer++; useItem(S, p, it); break; }
    }
    if (playing && !S.net && S.items.length < C.ITEM_N) { S.itemT -= dt; if (S.itemT <= 0) { S.itemT = C.ITEM_T; addItem(S); } }
    if (!S.net && S.chips.length < C.CHIP_N) { S.chipT += dt; if (S.chipT >= C.CHIP_RESPAWN) { S.chipT = 0; addChip(S); } }
    if (playing && S.playT >= C.MAX_T) finish(S);
  }

  // ---------------- 机器人 ----------------
  function steer(S, p, dx, dz) {
    const rad = CFG.BODY_R * CFG.SCALE[p.lvl] + 0.15, ai = p.ai;
    const clear = (x, z) => !blocked(S, p.x + x * 1.1, p.z + z * 1.1, rad) && !blocked(S, p.x + x * 2.3, p.z + z * 2.3, rad);
    if (clear(dx, dz)) return [dx, dz];
    const base = Math.atan2(dz, dx);
    for (const k of [0.55, 1.1, 1.6, 2.2]) for (const s of [ai.side, -ai.side]) {
      const a = base + s * k, x = Math.cos(a), z = Math.sin(a);
      if (clear(x, z)) { if (ai.sideT <= 0 || s === ai.side) { ai.side = s; ai.sideT = 0.9; } return [x, z]; }
    }
    return [-dx, -dz];
  }
  function botThink(S, p, dt) {
    const C = CFG, P = S.players, ai = p.ai, inp = p.inp, ck = S.cookie;
    ai.t -= dt; ai.sideT -= dt; ai.react -= dt;
    if (!p.on || S.phase !== 'play') { inp.mx = inp.mz = 0; return; }
    const holder = ck.holder >= 0 ? P[ck.holder] : null;
    if (holder === p) { // 抱着饼干：往人少的地方跑
      if (ai.t <= 0) {
        ai.t = 0.12;
        let best = -1e9, bx = 0, bz = 0;
        const cur = Math.hypot(ai.mx, ai.mz) > 0.1;
        for (let i = 0; i < 16; i++) {
          const a = i / 16 * 6.2832, dx = Math.cos(a), dz = Math.sin(a);
          const qx = p.x + dx * 3.5, qz = p.z + dz * 3.5;
          let sc = 0;
          for (const o of P) { if (o === p || !o.on || ally(S, o, p)) continue; const d0 = Math.hypot(o.x - p.x, o.z - p.z); if (d0 > 13) continue; sc -= 3 / (Math.hypot(o.x - qx, o.z - qz) + 0.4); }
          if (blocked(S, p.x + dx * 1.2, p.z + dz * 1.2, 0.7) || blocked(S, p.x + dx * 2.4, p.z + dz * 2.4, 0.7)) sc -= 6;
          else if (blocked(S, qx, qz, 0.7, 1.6)) sc -= 2.5;
          sc -= 0.03 * Math.hypot(qx / C.HW, qz / C.HH) * 10;
          if (cur) sc += 0.5 * (dx * ai.mx + dz * ai.mz);
          if (sc > best) { best = sc; bx = dx; bz = dz; }
        }
        ai.mx = bx; ai.mz = bz;
      }
      inp.mx = ai.mx; inp.mz = ai.mz;
      if (p.jumpCd <= 0) for (const o of P) { if (o === p || !o.on || o.dashT <= 0 || ally(S, o, p)) continue; if (Math.hypot(o.x - p.x, o.z - p.z) < 3 && S.rnd() < dt * 2.5) { inp.jump = true; break; } }
      if (p.dashCd <= 0) for (const o of P) { if (o === p || !o.on || ally(S, o, p)) continue; if (Math.hypot(o.x - p.x, o.z - p.z) < 2.0 && S.rnd() < dt * 3) { inp.dash = true; break; } }
      return;
    }
    // 没抱饼干：离饼干近的几个去追，其余去吃豆
    const dck = Math.hypot(ck.x - p.x, ck.z - p.z);
    let rank = 0; for (const o of P) if (o !== p && o.on && o !== holder && (!S.team || o.team === p.team) && Math.hypot(ck.x - o.x, ck.z - o.z) < dck) rank++;
    const mates = holder && ally(S, p, holder);
    if (mates && rank < S.tGuard) { // 组队：队友抱着饼干 → 去挡住离他最近的敌人
      let foe = null, bd = 1e9;
      for (const o of P) { if (!o.on || o.team === p.team) continue; const d = Math.hypot(o.x - holder.x, o.z - holder.z); if (d < bd) { bd = d; foe = o; } }
      if (foe) {
        const k = bd > 6 ? 0.3 : 0.65, gx = holder.x + (foe.x - holder.x) * k, gz = holder.z + (foe.z - holder.z) * k;
        let dx = gx - p.x, dz = gz - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
        if (d > 2.5) [dx, dz] = steer(S, p, dx, dz);
        inp.mx = d > 0.6 ? dx : 0; inp.mz = d > 0.6 ? dz : 0;
        const df = Math.hypot(foe.x - p.x, foe.z - p.z);
        if (p.dashCd <= 0 && bd < 6 && df < 2.9 + 0.5 * p.lvl && foe.inv <= 0) {
          if (ai.react <= -0.5) ai.react = C.BOT_REACT + S.rnd() * 0.3;
          if (ai.react <= 0 && ai.react > -0.5 && S.rnd() < dt * C.BOT_RATE) { const a = Math.atan2(foe.z - p.z, foe.x - p.x) + (S.rnd() - 0.5) * 0.6; inp.mx = Math.cos(a); inp.mz = Math.sin(a); inp.dash = true; ai.react = -1; }
        } else if (ai.react > -0.5 && df > 4.5) ai.react = -1;
        return;
      }
    }
    const chase = !mates && (rank < (S.team ? (holder ? S.tChase : 2) : holder ? C.CHASERS : C.CHASERS + 1) || dck < 3);
    let tx, tz;
    if (chase) {
      tx = ck.x; tz = ck.z;
      if (holder) { const lead = Math.min(0.45, dck / 14); tx += holder.mvx * lead; tz += holder.mvz * lead; }
    } else {
      if (ai.t <= 0 || !ai.chip || !(S.chips.includes(ai.chip) || S.items.includes(ai.chip))) {
        ai.t = 0.6; let b = null, bd = 1e9;
        for (const c of S.chips) { const d = Math.hypot(c.x - p.x, c.z - p.z) + 0.25 * Math.hypot(c.x - ck.x, c.z - ck.z); if (d < bd) { bd = d; b = c; } }
        for (const c of S.items) { const d = (Math.hypot(c.x - p.x, c.z - p.z) + 0.25 * Math.hypot(c.x - ck.x, c.z - ck.z)) * 0.5; if (d < bd) { bd = d; b = c; } }
        ai.chip = b;
      }
      if (ai.chip) { tx = ai.chip.x; tz = ai.chip.z; } else { tx = ck.x * 0.6; tz = ck.z * 0.6; }
    }
    let dx = tx - p.x, dz = tz - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    if (d > 2.5) [dx, dz] = steer(S, p, dx, dz);
    inp.mx = dx; inp.mz = dz;
    if (p.jumpCd <= 0 && S.obs.some(o => o.low && Math.abs(p.x + dx * 1.8 - o.x) < o.hw + 0.3 && Math.abs(p.z + dz * 1.8 - o.z) < o.hd + 0.3)) { inp.jump = true; inp.mx = (tx-p.x)/d; inp.mz = (tz-p.z)/d; }
    if (holder && chase && p.lvl >= 2 && p.jumpCd <= 0 && holder.guard <= 0.4 && dck < 2.2 * C.SCALE[p.lvl] && S.rnd() < dt * 1.5) inp.jump = true;
    // 冲撞抱饼干的人
    if (holder && chase && p.dashCd <= 0 && holder.guard <= 0.15 && holder.inv <= 0) {
      const range = 2.9 + 0.5 * p.lvl;
      if (dck < range) {
        if (ai.react <= -0.5) ai.react = C.BOT_REACT + S.rnd() * 0.3; // 反应时间
        if (ai.react <= 0 && ai.react > -0.5 && S.rnd() < dt * C.BOT_RATE) {
          const err = (S.rnd() - 0.5) * 2 * 0.3, a = Math.atan2(holder.z + holder.mvz * 0.12 - p.z, holder.x + holder.mvx * 0.12 - p.x) + err;
          inp.mx = Math.cos(a); inp.mz = Math.sin(a); inp.dash = true; ai.react = -1;
        }
      } else if (ai.react > -0.5 && dck > range + 1) ai.react = -1;
    }
  }
  function thinkBots(S, dt) { for (const p of S.players) if (p.bot) botThink(S, p, dt); }

  // ---------------- 联机快照：服务器 snap() 打包，客户端 applySnap() 套到自己的 S 上 ----------------
  const PF_ = ['x', 'z', 'face', 'mvx', 'mvz', 'kvx', 'kvz', 'chips', 'lvl', 'on', 'fallT', 'fx', 'fz', 'fvx', 'fvz', 'inv', 'guard', 'dashCd', 'dashT', 'dashX', 'dashZ', 'dashHit', 'hitT', 'eaten', 'steals', 'shieldCd', 'boostT', 'frozenT', 'bubbleT', 'jumpT', 'jumpCd', 'grabT', 'home', 'place', 'lastHit', 'lastHitT', 'bestHold', 'holdRun', 'lastSteal'];
  const BOOL_ = { on: 1, dashHit: 1 }, MINE_ = { face: 1, mvx: 1, mvz: 1 }, ACT_ = { dashCd: 1, dashT: 1, dashX: 1, dashZ: 1, dashHit: 1, jumpT: 1, jumpCd: 1, home: 1 };
  const r3 = v => typeof v === 'number' ? Math.round(v * 1000) / 1000 : (v ? 1 : 0);
  function snap(S, withLists) {
    const ck = S.cookie, m = { t: r3(S.t), pt: r3(S.playT), ph: S.phase, pT: r3(S.phaseT), w: S.winner, c: [r3(ck.x), r3(ck.z), ck.holder, r3(ck.cd), ck.no, r3(ck.noT)],
      p: S.players.map(p => PF_.map(f => r3(p[f])).concat(r3(p.inp.mx), r3(p.inp.mz))), cv: S.chipVer, iv: S.itemVer };
    if (S.team) { m.te = S.teamEat.map(r3); m.wt = S.winTeam; }
    if (withLists & 1) m.ch = S.chips.map(c => [c.id, r3(c.x), r3(c.z)]);
    if (withLists & 2) m.it = S.items.map(c => [c.id, c.kind, r3(c.x), r3(c.z)]);
    return m;
  }
  function applySnap(S, m, me) {
    S.t = m.t; S.playT = m.pt; S.phase = m.ph; S.phaseT = m.pT; S.winner = m.w;
    const ck = S.cookie; [ck.x, ck.z, ck.holder, ck.cd, ck.no, ck.noT] = m.c;
    if (m.te) { S.teamEat = m.te.slice(); S.winTeam = m.wt; }
    m.p.forEach((a, i) => {
      const p = S.players[i], mine = i === me, n = Math.min(PF_.length, a.length - 2), wireN = a.length - 2;
      const sx = a[0], sz = a[1], err = Math.hypot(sx - p.x, sz - p.z), wasOn = p.on;
      const acting = mine && S.lt - p.actT < 0.4;       // 我刚按了冲撞/跳，服务器还没收到：先信自己的
      for (let k = 2; k < n; k++) {
        const f = PF_[k];
        if (mine && (MINE_[f] || (acting && ACT_[f]))) continue;
        p[f] = BOOL_[f] ? !!a[k] : a[k];
      }
      if (mine) {
        // 自己的位置以自己为准（不然会有延迟感）；只有被撞飞、刚回到桌上、或偏差太大时才听服务器的
        const forced = !p.on || !wasOn || p.hitT > 0 || p.frozenT > 0 || Math.hypot(p.kvx, p.kvz) > 1.5;
        if (forced || err > 3) { p.x = sx; p.z = sz; } else if (err > 1.3) { p.x += (sx - p.x) * 0.25; p.z += (sz - p.z) * 0.25; }
      } else {
        if (err > 2.5 || !p.on) { p.x = sx; p.z = sz; } else { p.x += (sx - p.x) * 0.35; p.z += (sz - p.z) * 0.35; }
        p.inp.mx = a[wireN]; p.inp.mz = a[wireN + 1];
      }
    });
    if (m.ch) S.chips = m.ch.map(c => ({ id: c[0], x: c[1], z: c[2] }));
    if (m.it) S.items = m.it.map(c => ({ id: c[0], kind: c[1], x: c[2], z: c[3] }));
  }

  return { CFG, rng, create, step, thinkBots, blocked, lvlOf, edgeGap, snap, applySnap };
})();
if (typeof module !== 'undefined') module.exports = SIM;
// ===== SIM END =====
