// ===== SIM START（纯逻辑，可在 node 里跑） =====
const SIM = (() => {
  const CFG = {
    R: 15,              // 饼干半径（米）
    SEED_GAP: 1.75,     // 碎块大小（泊松间距）
    TOP: 0.45,          // 饼干表面高度
    SPEED: 6,         // 基础跑速
    ACCEL: 14,
    KFRIC: 6,         // 被撞后滑行衰减
    BODY_R: 0.46,
    // 踩裂：每秒增加的裂纹（1 = 掉下去）
    CRACK_RUN: 0.045, CRACK_IDLE: 0.015,
    // 咬
    BITE_CD: 0.5, BITE_DMG: 0.26, BITE_REACH: 1.15, BITE_ROOT: 0.14,
    HIDDEN_CHIP: 0.28,  // 每块饼干里藏着巧克力豆的概率
    VISIBLE_CHIP: 0.32, // 表面能看到巧克力豆的概率
    // 冲撞
    DASH_T: 0.2, DASH_SPEED: 15, DASH_CD: 2.0, DASH_K: 7.5,
    // 体型（巧克力豆数量达到门槛升级）
    LVL_AT: [0, 2, 5, 9],
    SCALE: [1, 1.22, 1.45, 1.7],
    WEIGHT: [1, 1.45, 2.0, 2.7],   // 踩裂倍数（贪就会沉）
    POWER: [1, 1.3, 1.62, 1.95],   // 撞人力度
    MASS: [1, 1.25, 1.55, 1.9],    // 抗撞
    SLOW: [1, 0.96, 0.92, 0.88],
    SPREAD: 0.08,       // 一块掉下去，邻块裂纹 +
    FALL_T: 0.9,
    // 边缘自动塌
    ERODE_START: 30, ERODE_RATE: 0.13, ERODE_CRACK: 0.9,
    // 小鱼
    FISH_SPEED: 4.6, FISH_CD: 3.2, FISH_RANGE: 3.4, FISH_K: 8, FISH_JUMP_T: 0.5,
    COUNT_T: 3, MAX_T: 100,
    REVIVE_UNTIL: 60, FOOD_NEED: 3, FLOAT_MAX: 14, INV_T: 1.6,
  };

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ---- 饼干：圆内泊松点 + Voronoi 碎块 ----
  function makeCookie(seed) {
    const r = rng(seed), R = CFG.R, gap = CFG.SEED_GAP;
    const pts = [];
    // 外圈一圈，边缘碎块更整齐
    const nRim = Math.round(2 * Math.PI * (R - gap * 0.5) / gap);
    for (let i = 0; i < nRim; i++) { const a = (i + r() * 0.3) / nRim * Math.PI * 2; const d = R - gap * 0.5; pts.push([Math.cos(a) * d, Math.sin(a) * d]); }
    for (let tries = 0; tries < 6000; tries++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (R - gap * 1.1);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      let ok = true;
      for (const p of pts) { const dx = p[0] - x, dz = p[1] - z; if (dx * dx + dz * dz < gap * gap) { ok = false; break; } }
      if (ok) pts.push([x, z]);
    }
    const CIRC = 72, circle = [];
    for (let i = 0; i < CIRC; i++) { const a = i / CIRC * Math.PI * 2; circle.push([Math.cos(a) * R, Math.sin(a) * R]); }
    const cells = pts.map((p, i) => {
      let poly = circle.slice();
      const cand = [];
      for (let j = 0; j < pts.length; j++) { if (j === i) continue; const dx = pts[j][0] - p[0], dz = pts[j][1] - p[1]; if (dx * dx + dz * dz < 16) cand.push(j); }
      for (const j of cand) {
        const q = pts[j], mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, dx = q[0] - p[0], dz = q[1] - p[1];
        const side = v => (v[0] - mx) * dx + (v[1] - mz) * dz;
        const out = [];
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k], b = poly[(k + 1) % poly.length], sa = side(a), sb = side(b);
          if (sa <= 0) out.push(a);
          if ((sa <= 0) !== (sb <= 0)) { const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
        }
        poly = out;
      }
      // 面积重心
      let A = 0, cx = 0, cz = 0;
      for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length], c = a[0] * b[1] - b[0] * a[1]; A += c; cx += (a[0] + b[0]) * c; cz += (a[1] + b[1]) * c; }
      A /= 2; cx /= 6 * A; cz /= 6 * A;
      return { id: i, x: p[0], z: p[1], cx, cz, poly, area: Math.abs(A), cand, nbrs: [], crack: 0, hp: 1, state: 0, fallT: 0, chip: false, hidden: false, chipPos: null, dist: Math.hypot(p[0], p[1]) };
    });
    // 邻居：两块共用一条边（多边形上至少两个点落在中垂线上）
    for (const c of cells) {
      for (const j of c.cand) {
        const q = cells[j]; const mx = (c.x + q.x) / 2, mz = (c.z + q.z) / 2, dx = q.x - c.x, dz = q.z - c.z, L = Math.hypot(dx, dz);
        let on = 0; for (const v of c.poly) if (Math.abs(((v[0] - mx) * dx + (v[1] - mz) * dz) / L) < 1e-4) on++;
        if (on >= 2) c.nbrs.push(j);
      }
      delete c.cand;
      c.hp = r() < 0.2 ? 0.15 + r() * 0.2 : 0.6 + r() * r() * 1.3 + r() * 0.3;
      if (r() < CFG.VISIBLE_CHIP && c.dist < CFG.R - 0.8) { c.chip = true; const a = r() * 6.283, d = r() * 0.35; c.chipPos = [c.cx + Math.cos(a) * d, c.cz + Math.sin(a) * d]; }
      else c.hidden = r() < CFG.HIDDEN_CHIP;
    }
    // 查格子用的网格
    const G = 2, N = Math.ceil(2 * (R + 2) / G), grid = Array.from({ length: N * N }, () => []);
    for (const c of cells) {
      const gx = Math.floor((c.x + R + 2) / G), gz = Math.floor((c.z + R + 2) / G);
      for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) { const X = gx + ox, Z = gz + oz; if (X >= 0 && Z >= 0 && X < N && Z < N) grid[Z * N + X].push(c.id); }
    }
    return { cells, grid, G, N, R };
  }

  function cellAt(ck, x, z) {
    if (x * x + z * z > ck.R * ck.R) return null;
    const gx = Math.floor((x + ck.R + 2) / ck.G), gz = Math.floor((z + ck.R + 2) / ck.G);
    if (gx < 0 || gz < 0 || gx >= ck.N || gz >= ck.N) return null;
    let best = null, bd = 1e9;
    for (const id of ck.grid[gz * ck.N + gx]) { const c = ck.cells[id], dx = c.x - x, dz = c.z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = c; } }
    return best;
  }
  const solid = c => c && c.state === 0;
  const standable = c => c && (c.state === 0 || (c.state === 1 && c.fallT < 0.4));

  const SNACKS = ['macaron', 'donut', 'pudding', 'cupcake', 'macaron', 'donut', 'pudding', 'cupcake', 'macaron'];

  function create(opts = {}) {
    const seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    const n = opts.players ?? 9;
    const ck = makeCookie(seed);
    const R = rng(seed ^ 0x5bd1e995);
    const players = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + 0.3, d = CFG.R * 0.62;
      players.push({
        id: i, bot: true, name: '', snack: SNACKS[i % SNACKS.length], look: i, x: Math.cos(a) * d, z: Math.sin(a) * d, face: a + Math.PI,
        mvx: 0, mvz: 0, kvx: 0, kvz: 0, chips: 0, lvl: 0, alive: true, place: 0, fallT: -1,
        biteCd: 0, biteT: 0, inv: 0, rootT: 0, dashCd: 0.5, dashT: 0, dashX: 0, dashZ: 0, hitT: 0, lastHit: -1, lastHitT: 0,
        fish: null, moving: false, kills: 0, bites: 0, bumps: 0, gentle: 0,
        inp: { mx: 0, mz: 0, bite: false, dash: false }, ai: { t: 0, mx: 0, mz: 0, tgt: -1 },
      });
    }
    const S = { cfg: CFG, ck, players, floats: [], floatId: 0, revives: 0, t: 0, phase: 'count', phaseT: CFG.COUNT_T, events: [], alive: n, order: [], winner: -1, erodeR: CFG.R + 1, rnd: R, tutorial: !!opts.tutorial, seed };
    return S;
  }

  function lvlOf(chips) { let l = 0; for (let i = 0; i < CFG.LVL_AT.length; i++) if (chips >= CFG.LVL_AT[i]) l = i; return l; }
  function ev(S, e) { S.events.push(e); }

  function addCrack(S, c, v, by) {
    if (!c || c.state !== 0) return;
    c.crack += v;
    if (by != null) c.by = by;
  }

  function eliminate(S, p) {
    p.alive = false; p.fallT = 0; p.place = S.alive; S.alive--; S.order.push(p.id);
    p.fish = { x: p.x, z: p.z, cd: 1.2, jumpT: -1, jx: 0, jz: 0, tx: 0, tz: 0, ox: 0, oz: 0, hit: false, face: p.face, vx: 0, vz: 0 };
    const killer = (p.lastHit >= 0 && S.t - p.lastHitT < 3) ? p.lastHit : -1;
    if (killer >= 0) S.players[killer].kills++;
    ev(S, { k: 'fall', p: p.id, by: killer, x: p.x, z: p.z });
    if (killer >= 0 && !S.players[killer].alive && canRevive(S)) revive(S, S.players[killer], 'swap', p.x, p.z);
  }

  function nearestSolid(S, x, z) { let b = null, bd = 1e9; for (const c of S.ck.cells) { if (c.state) continue; const d = (c.cx - x) ** 2 + (c.cz - z) ** 2; if (d < bd) { bd = d; b = c; } } return b; }
  function canRevive(S) { return S.phase === 'play' && S.playT < CFG.REVIVE_UNTIL; }
  function revive(S, p, why, nx, nz) {
    const f = p.fish; if (!f) return;
    // 找离小鱼最近、比较结实的一块
    let best = null, bd = 1e9;
    for (const c of S.ck.cells) {
      if (c.state || c.crack / c.hp > 0.55 || c.dist > S.erodeR - 1.5) continue;
      const d = Math.hypot(c.cx - (nx ?? f.x), c.cz - (nz ?? f.z)); if (d < bd) { bd = d; best = c; }
    }
    if (!best) return;
    p.alive = true; p.place = 0; p.fallT = -1; S.alive++; S.revives++;
    S.order = S.order.filter(id => id !== p.id);
    const fx = f.x, fz = f.z;
    p.fish = null; p.x = best.cx; p.z = best.cz; p.mvx = p.mvz = p.kvx = p.kvz = 0; p.dashT = 0;
    p.chips = Math.floor(p.chips / 2); p.lvl = lvlOf(p.chips); p.inv = CFG.INV_T; p.lastHit = -1;
    ev(S, { k: 'revive', p: p.id, why, x: p.x, z: p.z, fx, fz });
  }
  function step(S, dt) {
    const C = CFG, ck = S.ck, P = S.players;
    S.events.length = 0;
    S.t += dt;
    if (S.phase === 'count') { S.phaseT -= dt; if (S.phaseT <= 0) { S.phase = 'play'; S.playT = 0; ev(S, { k: 'go' }); } }
    const playing = S.phase === 'play';
    if (playing) S.playT += dt;
    if (S.phase === 'end') S.phaseT += dt;

    // --- 玩家 ---
    for (const p of P) {
      p.inv -= dt; p.biteCd -= dt; p.dashCd -= dt; p.rootT -= dt; p.hitT -= dt; p.biteT -= dt;
      if (!p.alive) { stepFish(S, p, dt); continue; }
      const sc = C.SCALE[p.lvl];
      let mx = playing ? p.inp.mx : 0, mz = playing ? p.inp.mz : 0;
      const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
      if (p.rootT > 0) { mx *= 0.15; mz *= 0.15; }
      const sp = C.SPEED * C.SLOW[p.lvl];
      const a = 1 - Math.exp(-C.ACCEL * dt);
      p.mvx += (mx * sp - p.mvx) * a; p.mvz += (mz * sp - p.mvz) * a;
      if (ml > 0.15) { const tf = Math.atan2(mx, mz); let d = tf - p.face; d = Math.atan2(Math.sin(d), Math.cos(d)); p.face += d * Math.min(1, dt * 16); }
      p.moving = ml > 0.15;
      // 冲撞
      if (playing && p.inp.dash && p.dashCd <= 0) {
        p.dashCd = C.DASH_CD; p.dashT = C.DASH_T;
        let dx = mx, dz = mz; if (Math.hypot(dx, dz) < 0.2) { dx = Math.sin(p.face); dz = Math.cos(p.face); }
        const l = Math.hypot(dx, dz); p.dashX = dx / l; p.dashZ = dz / l; p.face = Math.atan2(p.dashX, p.dashZ);
        ev(S, { k: 'dash', p: p.id });
      }
      p.inp.dash = false;
      // 咬
      if (playing && p.inp.bite && p.biteCd <= 0) {
        p.biteCd = C.BITE_CD; p.rootT = C.BITE_ROOT; p.biteT = 0.25; p.bites++;
        const reach = C.BITE_REACH * sc;
        const bx = p.x + Math.sin(p.face) * reach, bz = p.z + Math.cos(p.face) * reach;
        let c = cellAt(ck, bx, bz); if (!solid(c)) c = cellAt(ck, p.x, p.z);
        if (solid(c)) {
          addCrack(S, c, C.BITE_DMG * (S.tutorial && !p.bot ? 0.6 : 1), p.id);
          let got = false;
          if (c.chip) { c.chip = false; got = true; }
          else if (c.hidden) { c.hidden = false; got = true; }
          ev(S, { k: 'bite', p: p.id, c: c.id, x: bx, z: bz, chip: got });
          if (got) {
            p.chips++; const nl = lvlOf(p.chips);
            if (nl > p.lvl) { p.lvl = nl; ev(S, { k: 'grow', p: p.id, lvl: nl }); }
          }
        }
      }
      p.inp.bite = false;
      let vx = p.mvx + p.kvx, vz = p.mvz + p.kvz;
      if (p.dashT > 0) { p.dashT -= dt; vx = p.dashX * C.DASH_SPEED + p.kvx * 0.3; vz = p.dashZ * C.DASH_SPEED + p.kvz * 0.3; }
      p.x += vx * dt; p.z += vz * dt;
      const kf = Math.exp(-C.KFRIC * dt); p.kvx *= kf; p.kvz *= kf;
      // 走过去就吃到看得见的巧克力豆
      if (playing) {
        const reach = 0.55 * sc + 0.35;
        const here = cellAt(ck, p.x, p.z);
        if (here) for (const id of [here.id, ...here.nbrs]) {
          const c = ck.cells[id];
          if (!c.chip || c.state) continue;
          if (Math.hypot(c.chipPos[0] - p.x, c.chipPos[1] - p.z) < reach) {
            c.chip = false; p.chips++;
            ev(S, { k: 'bite', p: p.id, c: c.id, x: c.chipPos[0], z: c.chipPos[1], chip: true, pick: true });
            const nl = lvlOf(p.chips); if (nl > p.lvl) { p.lvl = nl; ev(S, { k: 'grow', p: p.id, lvl: nl }); }
          }
        }
      }
      // 脚下踩裂
      const under = cellAt(ck, p.x, p.z);
      if (playing && solid(under)) {
        const sp2 = Math.hypot(vx, vz);
        const rate = (sp2 > 1 ? C.CRACK_RUN : C.CRACK_IDLE) * C.WEIGHT[p.lvl] * (S.tutorial && !p.bot && S.playT < 20 ? 0.4 : 1);
        addCrack(S, under, rate * dt, p.id);
      }
      // 掉下去（冲撞时腾空，能越过小缝，落地才算）
      if (p.dashT <= 0 && p.inv <= 0 && !standable(under) && S.phase !== 'count') eliminate(S, p);
      if (p.inv > 0 && !standable(under)) { const c2 = nearestSolid(S, p.x, p.z); if (c2) { p.x += (c2.cx - p.x) * 0.2; p.z += (c2.cz - p.z) * 0.2; } }
    }

    // --- 碰撞 ---
    for (let i = 0; i < P.length; i++) {
      const a = P[i]; if (!a.alive) continue;
      for (let j = i + 1; j < P.length; j++) {
        const b = P[j]; if (!b.alive) continue;
        const ra = C.BODY_R * C.SCALE[a.lvl], rb = C.BODY_R * C.SCALE[b.lvl];
        let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d >= ra + rb || d < 1e-6) continue;
        dx /= d; dz /= d;
        const ma = C.MASS[a.lvl], mb = C.MASS[b.lvl], ov = ra + rb - d;
        a.x -= dx * ov * mb / (ma + mb); a.z -= dz * ov * mb / (ma + mb);
        b.x += dx * ov * ma / (ma + mb); b.z += dz * ov * ma / (ma + mb);
        const ad = a.dashT > 0, bd = b.dashT > 0;
        if (ad || bd) {
          let fa = 0, fb = 0; // a 被推 / b 被推 力度
          if (ad && bd) { fa = C.DASH_K * 0.8 * C.POWER[b.lvl] / ma; fb = C.DASH_K * 0.8 * C.POWER[a.lvl] / mb; }
          else if (ad) { fb = C.DASH_K * C.POWER[a.lvl] / mb; fa = 2.5 / ma; }
          else { fa = C.DASH_K * C.POWER[b.lvl] / ma; fb = 2.5 / mb; }
          if (b.inv > 0) fb *= 0.15; if (a.inv > 0) fa *= 0.15;
          b.kvx += dx * fb; b.kvz += dz * fb; a.kvx -= dx * fa; a.kvz -= dz * fa;
          a.dashT = 0; b.dashT = 0; a.hitT = 0.3; b.hitT = 0.3;
          if (ad) { b.lastHit = a.id; b.lastHitT = S.t; a.bumps++; }
          if (bd) { a.lastHit = b.id; a.lastHitT = S.t; b.bumps++; }
          ev(S, { k: 'bonk', a: a.id, b: b.id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, f: Math.max(fa, fb) });
        } else {
          // 普通挤：轻微推开
          const push = 1.2 * dt * 60 * 0.05;
          b.kvx += dx * push * C.MASS[a.lvl] / mb; b.kvz += dz * push * C.MASS[a.lvl] / mb;
          a.kvx -= dx * push * C.MASS[b.lvl] / ma; a.kvz -= dz * push * C.MASS[b.lvl] / ma;
        }
      }
    }

    // --- 饼干 ---
    if (playing && S.playT > C.ERODE_START) S.erodeR = C.R - (S.playT - C.ERODE_START) * C.ERODE_RATE;
    for (const c of ck.cells) {
      if (c.state === 0) {
        if (playing && c.dist > S.erodeR) c.crack += C.ERODE_CRACK * dt;
        if (c.crack >= c.hp) {
          c.state = 1; c.fallT = 0;
          for (const j of c.nbrs) addCrack(S, ck.cells[j], C.SPREAD);
          ev(S, { k: 'break', c: c.id, x: c.cx, z: c.cz });
        }
      } else if (c.state === 1) {
        c.fallT += dt; if (c.fallT >= C.FALL_T) { c.state = 2; ev(S, { k: 'sink', c: c.id, x: c.cx, z: c.cz }); if (S.floats.length < C.FLOAT_MAX && S.rnd() < 0.75) S.floats.push({ id: S.floatId++, x: c.cx, z: c.cz, t: 0 }); }
      }
    }

    for (const fl of S.floats) { fl.t += dt; fl.x += Math.sin(fl.t * 0.7 + fl.id) * 0.15 * dt; fl.z += Math.cos(fl.t * 0.6 + fl.id * 2) * 0.15 * dt; }
    // --- 结束 ---
    if (playing && (S.alive <= 1 || S.playT > C.MAX_T)) {
      S.phase = 'end'; S.phaseT = 0;
      let w = P.find(p => p.alive);
      if (!w) { // 同时掉：最后掉下去的那个算赢
        w = P[S.order[S.order.length - 1]];
      }
      S.winner = w.id;
      // 名次
      const alive = P.filter(p => p.alive && p !== w).sort((a, b) => b.chips - a.chips);
      w.place = 1; let k = 2; for (const p of alive) p.place = k++;
      // 掉下去的人按掉的先后重排（有人复活过，掉下时记的名次会重复）；赢家如果也掉了，从里面拿掉
      const rest = S.order.filter(id => id !== w.id).reverse();
      for (const id of rest) P[id].place = k++;
      ev(S, { k: 'end', w: w.id });
    }
  }

  function stepFish(S, p, dt) {
    const C = CFG, f = p.fish; if (!f) return;
    if (p.fallT >= 0) { p.fallT += dt; if (p.fallT < 0.8) return; }
    f.cd -= dt;
    if (f.jumpT >= 0) {
      f.jumpT += dt;
      const t = Math.min(1, f.jumpT / C.FISH_JUMP_T);
      f.x = f.ox + (f.tx - f.ox) * t; f.z = f.oz + (f.tz - f.oz) * t;
      if (!f.hit && t > 0.75) {
        f.hit = true;
        for (const q of S.players) {
          if (!q.alive) continue;
          const dx = q.x - f.x, dz = q.z - f.z, d = Math.hypot(dx, dz);
          if (d < 1.0 * C.SCALE[q.lvl]) {
            let ux = f.jx, uz = f.jz; const l = Math.hypot(ux, uz) || 1;
            const k = C.FISH_K / C.MASS[q.lvl] * (q.inv > 0 ? 0.15 : 1);
            q.kvx += ux / l * k; q.kvz += uz / l * k; q.hitT = 0.3; q.lastHit = p.id; q.lastHitT = S.t;
            ev(S, { k: 'fishhit', p: p.id, q: q.id, x: q.x, z: q.z });
          }
        }
      }
      if (f.jumpT >= C.FISH_JUMP_T + 0.35) { f.jumpT = -1; f.x = f.ox; f.z = f.oz; }
      return;
    }
    let mx = p.inp.mx, mz = p.inp.mz; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const a = 1 - Math.exp(-8 * dt);
    f.vx += (mx * C.FISH_SPEED - f.vx) * a; f.vz += (mz * C.FISH_SPEED - f.vz) * a;
    let nx = f.x + f.vx * dt, nz = f.z + f.vz * dt;
    if (solid(cellAt(S.ck, nx, nz))) {
      // 贴着饼干边滑
      if (!solid(cellAt(S.ck, nx, f.z))) nz = f.z; else if (!solid(cellAt(S.ck, f.x, nz))) nx = f.x; else { nx = f.x; nz = f.z; }
    }
    const lim = C.R + 5, dd = Math.hypot(nx, nz); if (dd > lim) { nx *= lim / dd; nz *= lim / dd; }
    f.x = nx; f.z = nz;
    if (ml > 0.15) f.face = Math.atan2(mx, mz);
    for (let i = S.floats.length - 1; i >= 0; i--) {
      const fl = S.floats[i];
      if (Math.hypot(fl.x - f.x, fl.z - f.z) < 0.9) {
        S.floats.splice(i, 1); f.food = (f.food || 0) + 1;
        ev(S, { k: 'eat', p: p.id, x: fl.x, z: fl.z, id: fl.id, n: f.food });
        if (f.food >= C.FOOD_NEED && canRevive(S)) { revive(S, p, 'food'); return; }
      }
    }
    // 万一饼干掉了以后鱼在固体里（不会）——忽略
    if (p.inp.dash || p.inp.bite) {
      if (f.cd <= 0 && S.phase === 'play') {
        let best = null, bd = C.FISH_RANGE;
        for (const q of S.players) { if (!q.alive) continue; const d = Math.hypot(q.x - f.x, q.z - f.z); if (d < bd) { bd = d; best = q; } }
        f.cd = C.FISH_CD; f.jumpT = 0; f.hit = false; f.ox = f.x; f.oz = f.z;
        if (best) { f.tx = best.x; f.tz = best.z; f.jx = best.x - f.x; f.jz = best.z - f.z; }
        else { f.tx = f.x + Math.sin(f.face) * 1.5; f.tz = f.z + Math.cos(f.face) * 1.5; f.jx = Math.sin(f.face); f.jz = Math.cos(f.face); }
        f.face = Math.atan2(f.jx, f.jz);
        ev(S, { k: 'fishjump', p: p.id, x: f.x, z: f.z });
      }
    }
    p.inp.dash = false; p.inp.bite = false;
  }

  // ---- 机器人 ----
  function danger(S, x, z) {
    const c = cellAt(S.ck, x, z);
    if (!solid(c)) return 100;
    const k = c.crack / c.hp; return k * k * 14 + (c.dist > S.erodeR - 1.2 ? 4 : 0);
  }
  function botThink(S, p, dt) {
    const C = CFG, ai = p.ai, inp = p.inp;
    ai.t -= dt;
    if (!p.alive) { // 小鱼
      const f = p.fish; if (!f) return;
      if (ai.t > 0) return; ai.t = 0.2 + Math.random() * 0.15;
      if (canRevive(S) && S.floats.length) {
        let fb = null, fd = 1e9; for (const fl of S.floats) { const d = Math.hypot(fl.x - f.x, fl.z - f.z); if (d < fd) { fd = d; fb = fl; } }
        if (fb && fd < 9) { inp.mx = (fb.x - f.x) / (fd || 1); inp.mz = (fb.z - f.z) / (fd || 1); return; }
      }
      let best = null, bd = 1e9;
      for (const q of S.players) { if (!q.alive || (S.tutorial && !q.bot && S.playT < 25)) continue; const d = Math.hypot(q.x - f.x, q.z - f.z); if (d < bd) { bd = d; best = q; } }
      if (!best) { inp.mx = 0; inp.mz = 0; return; }
      const dx = best.x - f.x, dz = best.z - f.z, l = Math.hypot(dx, dz) || 1;
      inp.mx = dx / l; inp.mz = dz / l;
      if (bd < C.FISH_RANGE * 0.9 && f.cd <= 0 && Math.random() < 0.35) inp.dash = true;
      return;
    }
    if (ai.t > 0 && danger(S, p.x + ai.mx * 0.8, p.z + ai.mz * 0.8) < 6) return;
    ai.t = 0.12 + Math.random() * 0.12;
    const sc = C.SCALE[p.lvl];
    // 候选方向打分
    let bestA = 0, bestS = -1e9;
    let tgt = null, td = 1e9;
    for (const q of S.players) {
      if (q === p || !q.alive) continue;
      if (S.tutorial && !q.bot && S.playT < 22) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < td) { td = d; tgt = q; }
    }
    const aggressive = p.look % 3; // 性格：0 贪吃 1 爱撞 2 均衡
    const late = S.playT > 30;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
      let sc2 = 0;
      sc2 -= danger(S, p.x + sx * 0.9, p.z + sz * 0.9) * 2.2 + danger(S, p.x + sx * 1.9, p.z + sz * 1.9) + danger(S, p.x + sx * 3, p.z + sz * 3) * 0.5;
      // 往中心靠（后期更强）
      const nx = p.x + sx * 2, nz = p.z + sz * 2;
      sc2 -= Math.hypot(nx, nz) * (late ? 0.15 : 0.06) + Math.max(0, Math.hypot(nx, nz) - (C.R - 2.5)) * 3;
      // 吃豆
      if (p.lvl < 3 || aggressive === 0) {
        for (const c of S.ck.cells) {
          if (!c.chip || c.state) continue;
          const dx = c.chipPos[0] - p.x, dz = c.chipPos[1] - p.z, d = Math.hypot(dx, dz);
          if (d < 7 && d > 0.01) sc2 += ((dx * sx + dz * sz) / d) * (aggressive === 0 ? 2.2 : 1.3) / (1 + d * 0.4);
        }
      }
      // 追人
      if (tgt && td < 6) {
        const dx = tgt.x - p.x, dz = tgt.z - p.z, w = (aggressive === 1 ? 1.6 : 0.8) * (p.lvl >= tgt.lvl ? 1 : -0.6);
        sc2 += ((dx * sx + dz * sz) / td) * w;
      }
      for (const q of S.players) { if (q === p || !q.alive || q === tgt) continue; const d = Math.hypot(q.x - nx, q.z - nz); if (d < 3) sc2 -= (3 - d) * 1.1; }
      sc2 += Math.random() * 0.4;
      // 保持方向，别抖
      sc2 += (sx * ai.mx + sz * ai.mz) * 0.5;
      if (sc2 > bestS) { bestS = sc2; bestA = a; }
    }
    ai.mx = Math.sin(bestA); ai.mz = Math.cos(bestA);
    const here = danger(S, p.x, p.z);
    // 站着不动更省饼干：安全且没目标时偶尔停一下
    const idle = here < 0.5 && Math.random() < 0.08 && !late;
    inp.mx = idle ? 0 : ai.mx; inp.mz = idle ? 0 : ai.mz;
    // 冲撞：前方有人，而且把他往前推会掉
    if (tgt && td < 2.8 * sc && p.dashCd <= 0) {
      const dx = (tgt.x - p.x) / td, dz = (tgt.z - p.z) / td;
      const behind = danger(S, tgt.x + dx * 2.2, tgt.z + dz * 2.2);
      const myAhead = Math.max(danger(S, p.x + dx * 1.2, p.z + dz * 1.2), danger(S, p.x + dx * Math.min(td, 2.6), p.z + dz * Math.min(td, 2.6)));
      if (S.playT > 6 && (behind >= 4 ? Math.random() < 0.55 : Math.random() < (aggressive === 1 ? 0.2 : 0.08)) && myAhead < 4) {
        inp.dash = true; inp.mx = dx; inp.mz = dz;
      }
    }
    // 咬：前面有巧克力豆，或者咬敌人脚下
    if (p.biteCd <= 0 && here < 3) {
      const fx = p.x + Math.sin(p.face) * C.BITE_REACH * sc, fz = p.z + Math.cos(p.face) * C.BITE_REACH * sc;
      const c = cellAt(S.ck, fx, fz), mine = cellAt(S.ck, p.x, p.z);
      if (solid(c) && c !== mine) {
        if (tgt && td < 2.5 && cellAt(S.ck, tgt.x, tgt.z) === c && Math.random() < 0.6) inp.bite = true;
        else if (c.crack < 0.3 && Math.random() < 0.03 && p.lvl < 3) inp.bite = true;
      }
      if (inp.bite) { // 咬的时候朝那个方向
        inp.mx *= 0.2; inp.mz *= 0.2;
      }
    }
  }

  function thinkBots(S, dt) { for (const p of S.players) if (p.bot) botThink(S, p, dt); }

  return { CFG, canRevive, create, step, thinkBots, cellAt, solid, makeCookie, rng, lvlOf };
})();
if (typeof module !== 'undefined') module.exports = SIM;
// ===== SIM END =====
