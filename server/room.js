// 联机房间的全部规矩（不关心是哪家云、怎么收发）：等人 → 开局 → 每秒 30 次推进 → 每秒 15 次把局面发给所有人。
// 局面由服务器说了算；空位由机器人补；有人掉线就让机器人接手。
const GATHER_MS = 5000;      // 第一个人进来后最多等这么久就开
const KEEP_END_MS = 9000;    // 分出胜负后房间再留这么久
const SERVER_EVENTS = { go: 1, steal: 1, pick: 1, drop: 1, chip: 1, grow: 1, fall: 1, respawn: 1, item: 1, block: 1, frozen: 1, end: 1 };
const BOT_NAMES_ = ['Muffin', 'Biscotti', 'Toffee', 'Mochi', 'Scone', 'Churro', 'Waffle', 'Praline', 'Brownie', 'Eclair', 'Crumble', 'Fudge', 'Sprinkle', 'Nougat', 'Truffle', 'Pretzel'];
class RoomCore {
  constructor(SIM) { this.SIM = SIM; this.reset(); }
  reset() { this.clients = new Map(); this.state = 'idle'; this.S = null; this.gatherEnd = 0; this.seq = 0; this.newEv = []; this.tickN = 0; this.endAt = 0; this.last = 0; this.cv = -1; this.iv = -1; }
  all(obj) { const s = JSON.stringify(obj); for (const c of this.clients.values()) c.send(s); }
  // 返回 false = 这个房间已经开打或满了，进不来
  join(id, send, close) {
    if (this.state === 'idle') { this.state = 'gather'; this.gatherEnd = Date.now() + GATHER_MS; }
    if (this.state !== 'gather' || this.clients.size >= this.SIM.CFG.N) return false;
    this.clients.set(id, { send, close, slot: -1, name: 'Guest', look: 0, mx: 0, mz: 0, d: false, j: false });
    this.tellWait(); return true;
  }
  tellWait() { this.all({ k: 'wait', n: this.clients.size, max: this.SIM.CFG.N, ms: Math.max(0, this.gatherEnd - Date.now()) }); }
  leave(id) {
    const c = this.clients.get(id); if (!c) return;
    this.clients.delete(id);
    if (this.S && c.slot >= 0) { const p = this.S.players[c.slot]; p.bot = true; }   // 机器人接手
    if (this.state === 'gather') this.tellWait();
    if (!this.clients.size) this.reset();
  }
  msg(id, m) {
    const c = this.clients.get(id); if (!c || !m) return;
    if (m.k === 'hi') { c.name = String(m.name || 'Guest').replace(/[<>&"']/g, '').slice(0, 14) || 'Guest'; c.look = (m.look | 0) >>> 0; }
    else if (m.k === 'in') {
      const x = +m.mx || 0, z = +m.mz || 0, l = Math.hypot(x, z);
      c.mx = l > 1 ? x / l : x; c.mz = l > 1 ? z / l : z; if (m.d) c.d = true; if (m.j) c.j = true;
    }
  }
  start() {
    const SIM = this.SIM, S = this.S = SIM.create({ seed: (Math.random() * 1e9) | 0, round: Math.random() < 0.5 });
    const names = BOT_NAMES_.slice().sort(() => Math.random() - 0.5), used = new Set();
    let slot = 0;
    for (const c of this.clients.values()) { c.slot = slot; const p = S.players[slot++]; p.bot = false; p.name = c.name; p.look = c.look; used.add(c.look); }
    S.players.forEach((p, i) => { if (!p.bot) return; p.name = names[i]; let l = (Math.random() * 21) | 0; while (used.has(l)) l = (l + 1) % 21; p.look = l; used.add(l); });
    const base = { k: 'start', seed: S.seed, round: S.round, names: S.players.map(p => p.name), looks: S.players.map(p => p.look), humans: S.players.map(p => p.bot ? 0 : 1) };
    for (const c of this.clients.values()) c.send(JSON.stringify(Object.assign({ you: c.slot }, base)));
    this.state = 'play'; this.last = Date.now(); this.cv = this.iv = -1;
  }
  // 宿主每 33 毫秒左右调一次
  update() {
    const now = Date.now();
    if (this.state === 'gather') { if (now >= this.gatherEnd || this.clients.size >= this.SIM.CFG.N) this.start(); return; }
    if (this.state !== 'play') return;
    const SIM = this.SIM, S = this.S;
    let dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const n = Math.max(1, Math.ceil(dt * 30)), h = dt / n;
    for (let i = 0; i < n && h > 0; i++) {
      for (const c of this.clients.values()) { const p = S.players[c.slot]; p.inp.mx = c.mx; p.inp.mz = c.mz; if (c.d) p.inp.dash = true; if (c.j) p.inp.jump = true; c.d = c.j = false; }
      SIM.thinkBots(S, h); SIM.step(S, h);
      for (const e of S.events) if (SERVER_EVENTS[e.k]) this.newEv.push(Object.assign({ q: ++this.seq }, e));
    }
    if (++this.tickN % 2 === 0 || this.newEv.length) {
      const lists = (S.chipVer !== this.cv ? 1 : 0) | (S.itemVer !== this.iv ? 2 : 0); this.cv = S.chipVer; this.iv = S.itemVer;
      const m = SIM.snap(S, lists); m.k = 's'; if (this.newEv.length) { m.e = this.newEv; this.newEv = []; }
      this.all(m);
    }
    if (S.phase === 'end') { if (!this.endAt) this.endAt = now + KEEP_END_MS; else if (now >= this.endAt) { for (const c of this.clients.values()) c.close(); this.reset(); } }
  }
}
if (typeof module !== 'undefined') module.exports = { RoomCore, GATHER_MS };
