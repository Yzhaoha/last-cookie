// Run with node tools/regression.js. No browser, network or production data writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const SIM = require('../src/sim');
const CookieEconomy = require('../src/economy');
const { RoomCore } = require('../server/room');
const src = fs.readFileSync(require.resolve('../src/client.js'), 'utf8');
const LOOKS = vm.runInNewContext(src.slice(src.indexOf('const LOOKS ='), src.indexOf('const dotCol')) + ';LOOKS');
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, fail: false, getItem: k => data.get(k) ?? null, setItem(k, v) { if (this.fail) throw Error('quota'); data.set(k, v); } };
}
const st = storage({ lc_crumbs: '1000', lc_owned: '[18]', lc_look: '18' });
let wallet = CookieEconomy(st);
assert.deepEqual(wallet.load(), { crumbs: 1000, owned: [0, 1, 2, 3], look: 0 });
for (const [i, price] of [[4, 200], [14, 400], [18, 800]]) {
  const db = storage({ lc_crumbs: '1000' }), w = CookieEconomy(db);
  assert(w.buy(i, LOOKS)); assert.equal(w.load().crumbs, 1000 - price);
  assert.equal(CookieEconomy(db).load().look, i); assert(!w.buy(i, LOOKS));
}
const db = storage({ lc_crumbs: '2000' }); wallet = CookieEconomy(db);
const first = wallet.box(LOOKS, () => 0.5);
// A reload before any animation is played must find the awarded character AND payment.
assert(CookieEconomy(db).load().owned.includes(first)); assert.equal(CookieEconomy(db).load().crumbs, 1900);
for (let i = 0; i < 16; i++) assert(wallet.box(LOOKS) >= 0);
assert.equal(wallet.load().owned.length, 21); assert.equal(wallet.load().crumbs, 300);
assert.equal(wallet.box(LOOKS), -1); assert.equal(wallet.load().crumbs, 300);
const failDb = storage({ lc_crumbs: '1000' }), failW = CookieEconomy(failDb); failDb.fail = true;
assert.equal(failW.box(LOOKS), -1); assert(!failW.buy(4, LOOKS)); assert.equal(failW.load().crumbs, 1000); assert.equal(failW.load().owned.length, 4);
assert(!failW.use(20));
console.log('PASS economy: legacy migration, three prices, reload mid-animation, no duplicates, full collection, failed storage');

for (let seed = 0; seed < 30; seed++) for (const round of [false, true]) {
  const s = SIM.create({ seed, round }); const same = SIM.create({ seed, round });
  assert.deepEqual(s.obs, same.obs); assert(!SIM.blocked(s, 0, 0, 0.9));
  for (const p of s.players) assert(!SIM.blocked(s, p.x, p.z, 0.49, 0));
  assert(s.obs.some(o => o.low));
}
function crossToast(jump) {
  const s = SIM.create({ seed: 0, players: 1 }); const p = s.players[0];
  s.phase = 'play'; p.bot = false; p.x = 0; p.z = 2.8; p.face = 0; p.inp.mz = 1; p.inp.jump = jump;
  for (let i = 0; i < 32; i++) SIM.step(s, 1 / 60);
  return p.z;
}
assert(crossToast(false) < 3.7); assert(crossToast(true) > 5.1);
console.log('PASS arenas: deterministic layouts, open spawn/centre, walking blocked and jumping crosses toast');

let now = 100000; const realNow = Date.now; Date.now = () => now;
try {
  const room = new RoomCore(SIM); room.roomCode = 'COOKIE'; const packets = [[], []];
  for (let i = 0; i < 2; i++) { assert(room.join(i, raw => packets[i].push(JSON.parse(raw)), () => {})); room.msg(i, { k: 'hi', look: 19 + i, name: 'Test' + i }); }
  now += 5001; room.update();
  const starts = packets.map(a => a.find(m => m.k === 'start'));
  assert.equal(starts[0].room, 'COOKIE'); assert.equal(starts[0].seed, starts[1].seed); assert.equal(starts[0].arena, 1);
  const states = starts.map(m => SIM.create({ seed: m.seed, round: m.round, arena: m.arena === 1 }));
  assert.deepEqual(states[0].obs, room.S.obs); assert.deepEqual(states[1].obs, room.S.obs);
  // Release both human slots to the normal bot AI, while keeping both transports open.
  room.S.players[0].bot = room.S.players[1].bot = true;
  let matched = 0;
  while (room.S.phase !== 'end' && room.S.t < 190) {
    now += 34; room.update();
    const a = packets[0].at(-1), b = packets[1].at(-1);
    if (a.k !== 's') continue; assert.deepEqual(a, b); matched++;
    for (let i = 0; i < 2; i++) SIM.applySnap(states[i], a, starts[i].you);
  }
  assert.equal(room.S.phase, 'end'); assert.equal(states[0].winner, states[1].winner);
  assert.deepEqual(states[0].players.map(p => p.eaten), states[1].players.map(p => p.eaten));
  room.leave(0); assert.equal(packets[1].at(-1).k, 'roster'); assert(room.S.players[0].bot); room.leave(1); assert.equal(room.state, 'idle');
  console.log('PASS room: same map, ' + matched + ' matched snapshots, identical winner/scores, disconnect roster');
} finally { Date.now = realNow; }

// A pre-upgrade server sends fewer player fields; retain defaults and read inputs at the wire offset.
const legacy = SIM.create({ seed: 1, arena: false }), target = SIM.create({ seed: 1, arena: false });
const m = SIM.snap(legacy, 3); m.p = m.p.map(a => a.slice(0, -5).concat(a.slice(-2)));
SIM.applySnap(target, m, 0); assert.equal(target.players[1].bestHold, 0); assert(Number.isFinite(target.players[1].inp.mx));
console.log('PASS legacy snapshot compatibility');
