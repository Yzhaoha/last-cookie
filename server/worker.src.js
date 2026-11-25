// Cloudflare 这一层：只管收发。真正的规矩在 room.js，游戏逻辑就是 src/sim.js（和单机同一份）。
// 这个文件由 tools/build.py 和 sim.js、room.js 拼成 server/worker.js，部署的是拼好的那份。
export class Matchmaker {   // 配对：把 5 秒内进来的人塞进同一个房间
  constructor() { this.cur = null; }
  async fetch() {
    const now = Date.now();
    if (!this.cur || now > this.cur.until || this.cur.n >= SIM.CFG.N) this.cur = { name: 'r' + now.toString(36) + Math.random().toString(36).slice(2, 7), until: now + GATHER_MS - 1200, n: 0 };
    this.cur.n++;
    return new Response(this.cur.name);
  }
}
export class Room {
  constructor() { this.core = new RoomCore(SIM); this.timer = null; this.n = 0; }
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
    this.core.roomCode = new URL(req.url).searchParams.get('room') || '';
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    server.accept();
    const id = ++this.n, send = s => { try { server.send(s); } catch (e) { } }, close = () => { try { server.close(1000, 'done'); } catch (e) { } };
    if (!this.core.join(id, send, close)) { send('{"k":"full"}'); close(); return new Response(null, { status: 101, webSocket: client }); }
    server.addEventListener('message', e => { try { this.core.msg(id, JSON.parse(e.data)); } catch (err) { } });
    const bye = () => { this.core.leave(id); close(); };   // 回一个关闭，对方才算真正断开
    server.addEventListener('close', bye); server.addEventListener('error', bye);
    if (!this.timer) this.timer = setInterval(() => { this.core.update(); if (this.core.state === 'idle') { clearInterval(this.timer); this.timer = null; } }, 33);
    return new Response(null, { status: 101, webSocket: client });
  }
}
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === '/info') return Response.json({ protocol: 2, friendRooms: true }, { headers: { 'Access-Control-Allow-Origin': '*' } });
    if (u.pathname === '/join') {
      if (u.searchParams.get('v') !== '2') return new Response('client update required', { status: 426 });
      const code = u.searchParams.get('room');
      if (code !== null) {
        if (!/^[A-Z0-9]{4,8}$/.test(code)) return new Response('invalid room code', { status: 400 });
        return env.ROOM.get(env.ROOM.idFromName('friend-v2-' + code)).fetch(req);
      }
      const name = await (await env.MM.get(env.MM.idFromName('mm')).fetch('https://mm/')).text();
      return env.ROOM.get(env.ROOM.idFromName('v2-' + name)).fetch(req);
    }
    return new Response('last-cookie server ok');
  },
};
