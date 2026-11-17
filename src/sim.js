// ===== SIM START（纯逻辑，可在 node 里跑） =====
// 玩法 v3「抢饼干」：大桌面上只有一块饼干，抱着它跑，累计抱满 WIN_T 秒（吃完）就赢。
const SIM = (() => {
  const CFG = {
    HW: 26, HH: 18,       // 桌面半宽 / 半深（米）
    N: 8,                 // 人数（你 + 7 个机器人）
    SPEED: 6.2, ACCEL: 16, KFRIC: 5.5, BODY_R: 0.5,
    CARRY_SLOW: 0.92,     // 抱着饼干跑得稍慢
    WIN_T: 30,            // 累计抱满这么多秒就赢
    MAX_T: 120,           // 最长一局；到点谁吃得多谁赢
    COUNT_T: 3,
    // 冲撞
    DASH_T: 0.22, DASH_SPEED: 15, DASH_CD: 1.8, DASH_K: 9, STUN_T: 0.5,
    GUARD_T: 1.5,         // 刚抢到饼干的保护时间
    STEAL_CD: 0.25,       // 抢到后冲撞马上又能用（好甩开人）
    PICK_R: 1.0,
    RESPAWN_T: 2.0, INV_T: 1.2,
    // 巧克力豆：吃了变大
    CHIP_N: 28, CHIP_R: 0.8, CHIP_RESPAWN: 1.2,
    LVL_AT: [0, 3, 7, 12],
    SCALE: [1, 1.18, 1.36, 1.55],
    POWER: [1, 1.2, 1.4, 1.6],     // 撞人力度
    MASS: [1, 1.25, 1.55, 1.9],    // 抗撞
    SLOW: [1, 0.985, 0.97, 0.955],
    // 机器人
    CHASERS: 3,           // 同时追饼干的机器人数量
    ME_GENTLE: 0.5,       // 机器人对真人出手的频率倍数
    ME_AIM: 0.5,          // 机器人撞真人时的瞄准误差（弧度）
  };

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ---- 桌上的障碍：杯子、碗、果酱瓶（圆）；牛奶盒、书、麦片盒（方） ----
  const KINDS = { mug: { r: 1.5 }, bowl: { r: 2.5 }, jar: { r: 1.15 }, carton: { w: 2.2, d: 2.2 }, books: { w: 5, d: 3.4 }, cereal: { w: 6, d: 2.2 } };
  function makeObstacles(r) {
    const obs = [], want = ['bowl', 'bowl', 'books', 'books', 'cereal', 'cereal', 'mug', 'mug', 'mug', 'mug', 'carton', 'carton', 'carton', 'jar', 'jar', 'jar', 'jar'];
    for (const kind of want) {
      const K = KINDS[kind];
      for (let t = 0; t < 80; t++) {
        let w = K.w, d = K.d; if (w && r() < 0.5) { const s = w; w = d; d = s; }
        const br = K.r || Math.hypot(w, d) / 2, ex = K.r || w / 2, ez = K.r || d / 2;
        const x = (r() * 2 - 1) * (CFG.HW - 2.6 - ex), z = (r() * 2 - 1) * (CFG.HH - 2.6 - ez);
        if (Math.hypot(x, z) < br + 5.5) continue;
        if (obs.some(o => Math.hypot(o.x - x, o.z - z) < o.br + br + 2.6)) continue;
        obs.push({ id: obs.length, kind, x, z, r: K.r || 0, hw: w / 2 || 0, hd: d / 2 || 0, br, rot: r() * 6.283, tint: (r() * 6) | 0 });
        break;
      }
    }
    return obs;
  }
  // 把圆 (x,z,rad) 推出障碍；返回 [x, z, 碰到了吗]
  function pushOut(obs, x, z, rad) {
    let hit = false;
    for (const o of obs) {
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
    if (Math.abs(x) > CFG.HW - edge || Math.abs(z) > CFG.HH - edge) return true;
    for (const o of S.obs) {
      const dx = x - o.x, dz = z - o.z;
      if (o.r) { if (dx * dx + dz * dz < (o.r + rad) * (o.r + rad)) return true; }
      else if (Math.abs(dx) < o.hw + rad && Math.abs(dz) < o.hd + rad) return true;
    }
    return false;
  }
  function freeSpot(S, pred) {
    for (let t = 0; t < 200; t++) {
      const x = (S.rnd() * 2 - 1) * (CFG.HW - 2), z = (S.rnd() * 2 - 1) * (CFG.HH - 2);
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
    const S = { cfg: CFG, obs: makeObstacles(rng(seed)), players: [], chips: [], chipId: 0, chipT: 0, t: 0, playT: 0, phase: 'count', phaseT: CFG.COUNT_T, events: [], winner: -1, rnd: R, seed,
      cookie: { x: 0, z: 0, holder: -1, cd: 0, no: -1, noT: 0, munch: 0 } };
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + i / n * Math.PI * 2;
      let x = Math.cos(a) * 11, z = Math.sin(a) * 8.5;
      [x, z] = pushOut(S.obs, x, z, 0.9);
      S.players.push({
        id: i, bot: true, human: false, name: '', look: i, x, z, face: Math.atan2(-x, -z),
        mvx: 0, mvz: 0, kvx: 0, kvz: 0, chips: 0, lvl: 0, on: true, fallT: 0, fx: 0, fz: 0, fvx: 0, fvz: 0,
        inv: 0, guard: 0, dashCd: 0.4, dashT: 0, dashX: 0, dashZ: 0, dashHit: false, hitT: 0, lastHit: -1, lastHitT: 0,
        eaten: 0, steals: 0, shoves: 0, falls: 0, place: 0,
        inp: { mx: 0, mz: 0, dash: false }, ai: { t: 0, mx: 0, mz: 0, side: 1, sideT: 0, chip: null, react: 0 },
      });
    }
    for (let i = 0; i < CFG.CHIP_N; i++) addChip(S);
    return S;
  }
  function addChip(S) {
    const [x, z] = freeSpot(S, (x, z) => Math.hypot(x, z) > 3 && S.chips.every(c => Math.hypot(c.x - x, c.z - z) > 2.5));
    S.chips.push({ id: S.chipId++, x, z });
  }
  function lvlOf(chips) { let l = 0; for (let i = 0; i < CFG.LVL_AT.length; i++) if (chips >= CFG.LVL_AT[i]) l = i; return l; }
  function ev(S, e) { S.events.push(e); }

  function fall(S, p) {
    p.on = false; p.fallT = 0; p.falls++; p.fx = p.x; p.fz = p.z; p.fvx = p.kvx + p.mvx; p.fvz = p.kvz + p.mvz; p.dashT = 0;
    p.chips = Math.floor(p.chips / 2); p.lvl = lvlOf(p.chips);
    const by = (p.lastHit >= 0 && S.t - p.lastHitT < 3) ? p.lastHit : -1;
    if (by >= 0) S.players[by].shoves++;
    ev(S, { k: 'fall', p: p.id, by, x: p.x, z: p.z });
    const ck = S.cookie;
    if (ck.holder === p.id) { // 饼干留在桌边
      let x = Math.max(-CFG.HW + 3, Math.min(CFG.HW - 3, p.x)), z = Math.max(-CFG.HH + 3, Math.min(CFG.HH - 3, p.z));
      [x, z] = pushOut(S.obs, x, z, 0.8);
      ck.holder = -1; ck.x = x; ck.z = z; ck.cd = 0.4; ck.no = p.id; ck.noT = 3;
      ev(S, { k: 'drop', p: p.id, x, z });
    }
  }
  function respawn(S, p) {
    const ck = S.cookie;
    const [x, z] = freeSpot(S, (x, z) => { const d = Math.hypot(x - ck.x, z - ck.z); return d > 7 && d < 16 && S.players.every(q => q === p || !q.on || Math.hypot(q.x - x, q.z - z) > 2.5); });
    p.on = true; p.x = x; p.z = z; p.mvx = p.mvz = p.kvx = p.kvz = 0; p.inv = CFG.INV_T; p.hitT = 0; p.lastHit = -1; p.dashCd = 0.3;
    ev(S, { k: 'respawn', p: p.id, x, z });
  }
  function finish(S) {
    if (S.phase === 'end') return;
    S.phase = 'end'; S.phaseT = 0;
    const order = S.players.slice().sort((a, b) => b.eaten - a.eaten || b.steals - a.steals || a.id - b.id);
    order.forEach((p, i) => p.place = i + 1);
    S.winner = order[0].id;
    ev(S, { k: 'end' });
  }
  function bonk(S, a, b) {
    const C = CFG;
    a.dashHit = true; a.dashT = Math.min(a.dashT, 0.05);
    if (b.inv > 0) return;
    let dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz) || 1; dx = dx / d * 0.6 + a.dashX * 0.4; dz = dz / d * 0.6 + a.dashZ * 0.4;
    const l = Math.hypot(dx, dz) || 1, guarded = b.guard > 0;
    const f = C.DASH_K * C.POWER[a.lvl] / C.MASS[b.lvl] * (guarded ? 0.5 : 1);
    b.kvx = dx / l * f; b.kvz = dz / l * f; b.hitT = guarded ? 0.2 : C.STUN_T; b.dashT = 0; b.lastHit = a.id; b.lastHitT = S.t;
    ev(S, { k: 'bonk', a: a.id, b: b.id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, f });
    const ck = S.cookie;
    if (ck.holder === b.id && !guarded && S.phase === 'play') {
      ck.holder = a.id; a.guard = C.GUARD_T; a.steals++; a.dashCd = Math.min(a.dashCd, C.STEAL_CD);
      ev(S, { k: 'steal', a: a.id, b: b.id });
    }
  }

  function step(S, dt) {
    const C = CFG, P = S.players, ck = S.cookie;
    S.events.length = 0;
    S.t += dt;
    if (S.phase === 'count') { S.phaseT -= dt; if (S.phaseT <= 0) { S.phase = 'play'; S.playT = 0; ev(S, { k: 'go' }); } }
    const playing = S.phase === 'play';
    if (playing) S.playT += dt;
    if (S.phase === 'end') S.phaseT += dt;

    for (const p of P) {
      p.inv -= dt; p.guard -= dt; p.dashCd -= dt; p.hitT -= dt;
      if (!p.on) { p.fallT += dt; if (S.phase !== 'end' && p.fallT >= C.RESPAWN_T) respawn(S, p); p.inp.dash = false; continue; }
      const stunned = p.hitT > 0, carry = ck.holder === p.id;
      let mx = p.inp.mx, mz = p.inp.mz; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
      if (!playing || stunned) mx = mz = 0;
      if (playing && p.inp.dash && p.dashCd <= 0 && !stunned) {
        let dx = mx, dz = mz; if (Math.hypot(dx, dz) < 0.2) { dx = Math.sin(p.face); dz = Math.cos(p.face); }
        const l = Math.hypot(dx, dz); p.dashX = dx / l; p.dashZ = dz / l; p.dashT = C.DASH_T; p.dashCd = C.DASH_CD; p.dashHit = false;
        ev(S, { k: 'dash', p: p.id });
      }
      p.inp.dash = false;
      const sp = C.SPEED * C.SLOW[p.lvl] * (carry ? C.CARRY_SLOW : 1);
      if (p.dashT > 0) { p.dashT -= dt; p.mvx = p.dashX * C.DASH_SPEED; p.mvz = p.dashZ * C.DASH_SPEED; }
      else {
        const k = Math.min(1, C.ACCEL * dt / Math.max(0.001, Math.hypot(mx * sp - p.mvx, mz * sp - p.mvz)));
        p.mvx += (mx * sp - p.mvx) * k; p.mvz += (mz * sp - p.mvz) * k;
      }
      if (Math.hypot(p.mvx, p.mvz) > 0.6) {
        const want = Math.atan2(p.mvx, p.mvz); let d = want - p.face; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832;
        p.face += d * Math.min(1, 14 * dt);
      }
      // 自己走（冲）不会出桌；只有被撞飞才会掉下去
      p.x += p.mvx * dt; p.z += p.mvz * dt;
      const kv = Math.hypot(p.kvx, p.kvz);
      if (kv < 2) { const m = 0.35; p.x = Math.max(-C.HW + m, Math.min(C.HW - m, p.x)); p.z = Math.max(-C.HH + m, Math.min(C.HH - m, p.z)); }
      p.x += p.kvx * dt; p.z += p.kvz * dt;
      const fr = Math.exp(-C.KFRIC * dt); p.kvx *= fr; p.kvz *= fr;
      const res = pushOut(S.obs, p.x, p.z, C.BODY_R * C.SCALE[p.lvl]);
      if (res[2]) { p.x = res[0]; p.z = res[1]; p.kvx *= 0.8; p.kvz *= 0.8; }
      if (Math.abs(p.x) > C.HW || Math.abs(p.z) > C.HH) fall(S, p);
    }
    // 人撞人
    for (let i = 0; i < P.length; i++) {
      const a = P[i]; if (!a.on) continue;
      for (let j = i + 1; j < P.length; j++) {
        const b = P[j]; if (!b.on) continue;
        const dx = b.x - a.x, dz = b.z - a.z, m = C.BODY_R * (C.SCALE[a.lvl] + C.SCALE[b.lvl]), d2 = dx * dx + dz * dz;
        if (d2 >= m * m) continue;
        const d = Math.sqrt(d2) || 0.001, ov = (m - d) / 2, nx = dx / d, nz = dz / d;
        a.x -= nx * ov; a.z -= nz * ov; b.x += nx * ov; b.z += nz * ov;
        if (a.dashT > 0 && !a.dashHit) bonk(S, a, b);
        else if (b.dashT > 0 && !b.dashHit) bonk(S, b, a);
      }
    }
    // 饼干
    ck.cd -= dt; ck.noT -= dt;
    if (ck.holder >= 0) {
      const h = P[ck.holder]; ck.x = h.x; ck.z = h.z;
      if (playing) {
        h.eaten += dt; ck.munch -= dt;
        if (ck.munch <= 0) { ck.munch = 0.42; ev(S, { k: 'munch', p: h.id }); }
        if (h.eaten >= C.WIN_T) { h.eaten = C.WIN_T; finish(S); }
      }
    } else if (playing && ck.cd <= 0) {
      let best = null, bd = 1e9;
      for (const p of P) {
        if (!p.on || p.hitT > 0 || (ck.no === p.id && ck.noT > 0)) continue;
        const d = Math.hypot(p.x - ck.x, p.z - ck.z);
        if (d < C.PICK_R * C.SCALE[p.lvl] && d < bd) { bd = d; best = p; }
      }
      if (best) { ck.holder = best.id; best.guard = 0.8; ev(S, { k: 'pick', p: best.id }); }
    }
    // 巧克力豆
    for (let i = S.chips.length - 1; i >= 0; i--) {
      const c = S.chips[i];
      for (const p of P) {
        if (!p.on) continue;
        if (Math.hypot(p.x - c.x, p.z - c.z) < C.CHIP_R * C.SCALE[p.lvl]) {
          S.chips.splice(i, 1); p.chips++;
          const l = lvlOf(p.chips); ev(S, { k: 'chip', p: p.id, x: c.x, z: c.z });
          if (l > p.lvl) { p.lvl = l; ev(S, { k: 'grow', p: p.id }); }
          break;
        }
      }
    }
    if (S.chips.length < C.CHIP_N) { S.chipT += dt; if (S.chipT >= C.CHIP_RESPAWN) { S.chipT = 0; addChip(S); } }
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
          for (const o of P) { if (o === p || !o.on) continue; const d0 = Math.hypot(o.x - p.x, o.z - p.z); if (d0 > 13) continue; sc -= 3 / (Math.hypot(o.x - qx, o.z - qz) + 0.4); }
          if (blocked(S, p.x + dx * 1.2, p.z + dz * 1.2, 0.7) || blocked(S, p.x + dx * 2.4, p.z + dz * 2.4, 0.7)) sc -= 6;
          else if (blocked(S, qx, qz, 0.7, 1.6)) sc -= 2.5;
          sc -= 0.03 * Math.hypot(qx / C.HW, qz / C.HH) * 10;
          if (cur) sc += 0.5 * (dx * ai.mx + dz * ai.mz);
          if (sc > best) { best = sc; bx = dx; bz = dz; }
        }
        ai.mx = bx; ai.mz = bz;
      }
      inp.mx = ai.mx; inp.mz = ai.mz;
      if (p.dashCd <= 0) for (const o of P) { if (o === p || !o.on) continue; if (Math.hypot(o.x - p.x, o.z - p.z) < 2.3 && S.rnd() < dt * 5) { inp.dash = true; break; } }
      return;
    }
    // 没抱饼干：离饼干近的几个去追，其余去吃豆
    const dck = Math.hypot(ck.x - p.x, ck.z - p.z);
    let rank = 0; for (const o of P) if (o !== p && o.on && o !== holder && Math.hypot(ck.x - o.x, ck.z - o.z) < dck) rank++;
    const chase = rank < (holder ? C.CHASERS : C.CHASERS + 1) || dck < 4.5;
    let tx, tz;
    if (chase) {
      tx = ck.x; tz = ck.z;
      if (holder) { const lead = Math.min(0.45, dck / 14); tx += holder.mvx * lead; tz += holder.mvz * lead; }
    } else {
      if (ai.t <= 0 || !ai.chip || !S.chips.includes(ai.chip)) {
        ai.t = 0.6; let b = null, bd = 1e9;
        for (const c of S.chips) { const d = Math.hypot(c.x - p.x, c.z - p.z) + 0.25 * Math.hypot(c.x - ck.x, c.z - ck.z); if (d < bd) { bd = d; b = c; } }
        ai.chip = b;
      }
      if (ai.chip) { tx = ai.chip.x; tz = ai.chip.z; } else { tx = ck.x * 0.6; tz = ck.z * 0.6; }
    }
    let dx = tx - p.x, dz = tz - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    if (d > 2.5) [dx, dz] = steer(S, p, dx, dz);
    inp.mx = dx; inp.mz = dz;
    // 冲撞抱饼干的人
    if (holder && chase && p.dashCd <= 0 && holder.guard <= 0.15 && holder.inv <= 0) {
      const range = 2.9 + 0.5 * p.lvl;
      if (dck < range) {
        if (ai.react <= -0.5) ai.react = (holder.human ? 0.28 : 0.1) + S.rnd() * 0.2; // 反应时间
        if (ai.react <= 0 && ai.react > -0.5 && S.rnd() < dt * 9 * (holder.human ? C.ME_GENTLE : 1)) {
          const err = (S.rnd() - 0.5) * 2 * (holder.human ? C.ME_AIM : 0.25), a = Math.atan2(holder.z + holder.mvz * 0.12 - p.z, holder.x + holder.mvx * 0.12 - p.x) + err;
          inp.mx = Math.cos(a); inp.mz = Math.sin(a); inp.dash = true; ai.react = -1;
        }
      } else if (ai.react > -0.5 && dck > range + 1) ai.react = -1;
    }
  }
  function thinkBots(S, dt) { for (const p of S.players) if (p.bot) botThink(S, p, dt); }

  return { CFG, rng, create, step, thinkBots, blocked, lvlOf };
})();
if (typeof module !== 'undefined') module.exports = SIM;
// ===== SIM END =====
