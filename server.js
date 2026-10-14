const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000, N = 31, CELL = 4, MAXP = 8, PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  if (p === '/') p = '/index.html';
  const f = path.join(PUB, path.normalize(p));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
    res.end(d);
  });
});

function genMaze() {
  const g = Array.from({ length: N }, () => Array(N).fill(1));
  const st = [[1, 1]]; g[1][1] = 0;
  while (st.length) {
    const [x, y] = st[st.length - 1];
    const d = D.map(([a, b]) => [a * 2, b * 2]).sort(() => Math.random() - .5)
      .filter(([a, b]) => { const nx = x + a, ny = y + b; return nx > 0 && ny > 0 && nx < N - 1 && ny < N - 1 && g[ny][nx]; });
    if (!d.length) { st.pop(); continue; }
    const [a, b] = d[0]; g[y + b / 2][x + a / 2] = 0; g[y + b][x + a] = 0; st.push([x + a, y + b]);
  }
  for (let i = 0; i < 70; i++) g[1 + Math.random() * (N - 2) | 0][1 + Math.random() * (N - 2) | 0] = 0;
  for (let r = 0; r < 5; r++) {
    const x = 3 + Math.random() * (N - 8) | 0, y = 3 + Math.random() * (N - 8) | 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) g[y + b][x + a] = 0;
  }
  return g;
}

const bag = 'FBBBBBBWWWWWWLLLLLL';
let rid = 0, nid = 0;
const rooms = new Map();

function makeRoom(name, solo) {
  const g = genMaze(), opens = [];
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) if (!g[y][x]) opens.push([x, y]);
  const r = { id: ++rid, name, solo, g, opens, players: new Map(), items: new Map(), iid: 0, itemT: 0,
    mon: { x: 0, y: 0, h: 0, chase: 0, goal: null, lure: null, stun: 0 } };
  let far = opens[0]; for (let i = 0; i < 30; i++) { const c = r.opens[Math.random() * opens.length | 0]; if (c[0] + c[1] > far[0] + far[1]) far = c; }
  r.mon.x = far[0]; r.mon.y = far[1];
  for (let i = 0; i < 34; i++) spawnItem(r);
  r.mimics = [];
  for (let i = 0; i < (solo ? 1 : 2); i++) { let c = pick(r); for (let k = 0; k < 25 && c[0] + c[1] < 24; k++) c = pick(r); r.mimics.push({ id: i + 1, x: c[0], y: c[1], h: 0, copy: 0, rev: 0, stun: 0, goal: null, fgoal: null }); }
  rooms.set(r.id, r); return r;
}
const pick = r => r.opens[Math.random() * r.opens.length | 0];
const open = (r, x, y) => r.g[y] && r.g[y][x] === 0;
function spawnItem(r) {
  const [cx, cy] = pick(r); if (cx < 4 && cy < 4) return null;
  const it = { id: ++r.iid, type: bag[Math.random() * bag.length | 0], cx, cy };
  r.items.set(it.id, it); return it;
}
const bc = (r, o) => { const s = JSON.stringify(o); for (const p of r.players.values()) if (p.ws.readyState === 1) p.ws.send(s); };
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const list = () => ({ t: 'rooms', rooms: [...rooms.values()].filter(r => !r.solo && r.players.size < MAXP).map(r => ({ id: r.id, name: r.name, n: r.players.size, max: MAXP })) });

function bfs(r, sx, sy, tx, ty) {
  const S = sy * N + sx, T = ty * N + tx; if (S === T) return [tx, ty];
  const prev = new Int16Array(N * N).fill(-1); prev[S] = S; const q = [S];
  for (let i = 0; i < q.length; i++) {
    const c = q[i]; if (c === T) break; const x = c % N, y = c / N | 0;
    for (const [a, b] of D) { const nx = x + a, ny = y + b; if (open(r, nx, ny) && prev[ny * N + nx] < 0) { prev[ny * N + nx] = c; q.push(ny * N + nx); } }
  }
  if (prev[T] < 0) return null; let c = T; while (prev[c] !== S) c = prev[c]; return [c % N, c / N | 0];
}

function los(r, x1, z1, x2, z2) {
  const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 1.5);
  for (let i = 1; i < n; i++) { const t = i / n; if (!open(r, Math.round((x1 + (x2 - x1) * t) / CELL), Math.round((z1 + (z2 - z1) * t) / CELL))) return false; }
  return true;
}
function stepMimic(r, q, goal, sp, dt) {
  const nx = open(r, goal[0], goal[1]) ? bfs(r, Math.round(q.x), Math.round(q.y), goal[0], goal[1]) : null;
  if (!nx) return;
  const dx = nx[0] - q.x, dy = nx[1] - q.y, d = Math.hypot(dx, dy);
  if (d > 1e-3) { const s = Math.min(sp * dt, d) / d; q.x += dx * s; q.y += dy * s; q.h = Math.atan2(dx, dy); }
}
// Shapeshifters: look like a copy of a player, stalk and strike. A raised badge forces them to reveal, stunning them.
function tickMimics(r, now, dt) {
  const ps = [...r.players.values()];
  for (const q of r.mimics) {
    const wx = q.x * CELL, wz = q.y * CELL;
    for (const p of ps) {
      if (!p.badge) continue;
      const dx = wx - p.x, dz = wz - p.z, d = Math.hypot(dx, dz);
      if (d < 10 && d > .1 && (-Math.sin(p.ry) * dx - Math.cos(p.ry) * dz) / d > .5 && los(r, p.x, p.z, wx, wz)) {
        if (q.rev <= 0) { q.stun = 3.5; q.rev = 6; q.fgoal = null; } else { q.stun = Math.max(q.stun, .6); q.rev = Math.max(q.rev, 3); }
      }
    }
    if (q.rev > 0) q.rev -= dt;
    if (q.stun > 0) { q.stun -= dt; continue; }
    let tgt = null, best = 1e9;
    for (const p of ps) { const d = Math.hypot(p.x - wx, p.z - wz) / CELL; if (d < best) { best = d; tgt = p; } }
    if (q.rev > 0) {
      if (!q.fgoal || (Math.round(q.x) === q.fgoal[0] && Math.round(q.y) === q.fgoal[1])) {
        let b = null, bd = -1;
        for (let i = 0; i < 8; i++) { const c = pick(r), d = tgt ? Math.hypot(c[0] - tgt.x / CELL, c[1] - tgt.z / CELL) : 0; if (d > bd) { bd = d; b = c; } }
        q.fgoal = b;
      }
      stepMimic(r, q, q.fgoal, 1.5, dt);
    } else if (tgt && best < 22) {
      q.copy = tgt.id;
      stepMimic(r, q, [Math.round(tgt.x / CELL), Math.round(tgt.z / CELL)], .95, dt);
      if (best * CELL < 1.7 && now > tgt.safe) { tgt.safe = now + 5000; q.stun = 3; q.copy = 0; send(tgt.ws, { t: 'caught' }); }
    } else {
      if (!q.goal || (Math.round(q.x) === q.goal[0] && Math.round(q.y) === q.goal[1])) q.goal = pick(r);
      stepMimic(r, q, q.goal, .5, dt);
    }
  }
}
function leave(ws) {
  const r = ws.room; if (!r) return;
  r.players.delete(ws.pid); ws.room = null;
  if (!r.players.size) rooms.delete(r.id);
}
function join(ws, r) {
  if (r.players.size >= MAXP) return send(ws, { t: 'err', msg: 'Lobby full' });
  leave(ws);
  ws.pid = ++nid; ws.room = r;
  r.players.set(ws.pid, { id: ws.pid, x: 4, z: 4, ry: 0, fl: 0, safe: Date.now() + 5000, ws });
  send(ws, { t: 'w', id: ws.pid, N, CELL, grid: r.g, items: [...r.items.values()] });
}

const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  send(ws, list());
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const r = ws.room, pl = r && r.players.get(ws.pid);
    if (m.t === 'list') send(ws, list());
    else if (m.t === 'create') join(ws, makeRoom(String(m.name || 'Lobby ' + (rid + 1)).replace(/[<>&"']/g, '').slice(0, 24), !!m.solo));
    else if (m.t === 'join') { const t = rooms.get(+m.id); if (t && !t.solo) join(ws, t); else send(ws, { t: 'err', msg: 'Lobby not found' }); }
    else if (m.t === 'leave') leave(ws);
    else if (!pl) return;
    else if (m.t === 'pos' && isFinite(m.x) && isFinite(m.z)) { pl.x = m.x; pl.z = m.z; pl.ry = +m.ry || 0; pl.fl = m.fl ? 1 : 0; pl.badge = m.b ? 1 : 0; }
    else if (m.t === 'pickup') {
      const it = r.items.get(m.id);
      if (it && Math.hypot(it.cx * CELL - pl.x, it.cy * CELL - pl.z) < 4.5) {
        r.items.delete(it.id); send(ws, { t: 'got', type: it.type }); bc(r, { t: 'rm', id: it.id });
      }
    } else if (m.t === 'flare') {
      const x = Math.round(m.x / CELL), y = Math.round(m.z / CELL);
      if (open(r, x, y)) r.mon.lure = { x, y, until: Date.now() + 9000 };
    }
  });
  ws.on('close', () => leave(ws));
});

setInterval(() => {
  const dt = .05, now = Date.now();
  for (const r of rooms.values()) {
    const mon = r.mon;
    if (r.items.size < 28 && now > r.itemT) { r.itemT = now + 20000; const it = spawnItem(r); if (it) bc(r, { t: 'item', it }); }
    if (mon.stun > 0) mon.stun -= dt;
    else {
      let tgt = null, best = 1e9, chasing = 0;
      for (const p of r.players.values()) { const d = Math.hypot(p.x / CELL - mon.x, p.z / CELL - mon.y); if (d < best) { best = d; tgt = p; } }
      let goal;
      if (tgt && best < 13 && now > tgt.safe) { goal = [Math.round(tgt.x / CELL), Math.round(tgt.z / CELL)]; chasing = 1; }
      else if (mon.lure && now < mon.lure.until) goal = [mon.lure.x, mon.lure.y];
      else {
        if (!mon.goal || (Math.round(mon.x) === mon.goal[0] && Math.round(mon.y) === mon.goal[1])) mon.goal = pick(r);
        goal = mon.goal;
      }
      const nx = open(r, goal[0], goal[1]) ? bfs(r, Math.round(mon.x), Math.round(mon.y), goal[0], goal[1]) : null;
      if (nx) {
        const dx = nx[0] - mon.x, dy = nx[1] - mon.y, d = Math.hypot(dx, dy);
        if (d > 1e-3) { const s = Math.min((chasing ? 1.12 : .55) * dt, d) / d; mon.x += dx * s; mon.y += dy * s; mon.h = Math.atan2(dx, dy); }
      }
      mon.chase = chasing;
    }
    for (const p of r.players.values()) {
      if (now > p.safe && Math.hypot(p.x - mon.x * CELL, p.z - mon.y * CELL) < 1.7) {
        p.safe = now + 5000; mon.stun = 2.5; mon.chase = 0; send(p.ws, { t: 'caught' });
      }
    }
    tickMimics(r, now, dt);
    bc(r, { t: 's', x: r.mimics.map(q => [q.id, q.x * CELL, q.y * CELL, q.h, q.copy, q.rev > 0 ? 1 : 0]), m: [mon.x * CELL, mon.y * CELL, mon.h, mon.chase], p: [...r.players.values()].map(p => [p.id, p.x, p.z, p.ry, p.fl]) });
  }
}, 50);

server.listen(PORT, () => console.log('Backrooms on :' + PORT));
