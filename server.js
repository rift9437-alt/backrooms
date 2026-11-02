/**
 * Mech Battlegrounds — multiplayer WebSocket server
 * Server-authoritative for damage, kills, and cash rewards.
 */
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const TICK_HZ = Number(process.env.TICK_HZ || 20);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 32);
const KILL_REWARD = Number(process.env.KILL_REWARD || 100);
// Prefer ./public (Render / self-contained). Fall back to ../public for monorepo local runs.
const PUBLIC_DIR = path.resolve(__dirname, process.env.PUBLIC_DIR || (fs.existsSync(path.join(__dirname, 'public')) ? './public' : '../public'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ---- static HTTP (serves the game client) ----
const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });

// ---- world state ----
let nextId = 1;
const players = new Map(); // id -> player

function now() { return Date.now(); }

function createPlayer(ws, name) {
  const id = String(nextId++);
  const p = {
    id,
    ws,
    name: sanitizeName(name),
    x: 0, y: 0, z: 0,
    face: 0, pitch: 0,
    vx: 0, vz: 0, vy: 0,
    hp: 100, maxHP: 100,
    dead: false,
    bladeOn: false,
    firing: false,
    spin: 0,
    slashT: 0,
    walkPh: 0,
    air: 0,
    thrust: false,
    slam: false,
    build: { rightArm: 'gatling', leftArm: 'blade', legs: 'biped', armor: 'lightA', module: 'jets' },
    paint: { armor: 0x4a90c4, accent: 0x3be8ff },
    lastHitAt: 0,
    lastStateAt: 0,
    kills: 0,
    joinedAt: now()
  };
  players.set(id, p);
  return p;
}

function sanitizeName(n) {
  const s = String(n || 'Pilot').replace(/[^\w\s\-_.]/g, '').trim().slice(0, 16);
  return s || 'Pilot';
}

function publicState(p) {
  return {
    id: p.id,
    name: p.name,
    x: p.x, y: p.y, z: p.z,
    face: p.face, pitch: p.pitch,
    vx: p.vx, vz: p.vz, vy: p.vy,
    hp: p.hp, maxHP: p.maxHP,
    dead: p.dead,
    bladeOn: p.bladeOn,
    firing: p.firing,
    spin: p.spin,
    slashT: p.slashT,
    walkPh: p.walkPh,
    air: p.air,
    thrust: p.thrust,
    slam: p.slam,
    build: p.build,
    paint: p.paint,
    kills: p.kills
  };
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(msg, exceptId) {
  const data = JSON.stringify(msg);
  for (const p of players.values()) {
    if (p.id === exceptId) continue;
    if (p.ws.readyState === 1) p.ws.send(data);
  }
}

function snapshot() {
  return [...players.values()].map(publicState);
}

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { t: 'err', m: 'SERVER FULL' });
    ws.close();
    return;
  }

  let me = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'join') {
      if (me) return;
      me = createPlayer(ws, msg.name);
      // random spawn away from origin a bit
      const a = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 80;
      me.x = Math.cos(a) * d;
      me.z = Math.sin(a) * d;
      me.y = 0;
      send(ws, {
        t: 'welcome',
        id: me.id,
        name: me.name,
        players: snapshot(),
        killReward: KILL_REWARD
      });
      broadcast({ t: 'join', player: publicState(me) }, me.id);
      console.log(`[+] ${me.name} (${me.id}) joined · ${players.size} online`);
      return;
    }

    if (!me) return;

    if (msg.t === 'state') {
      // client position / animation snapshot (not trusted for combat outcomes)
      const t = now();
      if (t - me.lastStateAt < 20) return; // ~50Hz max
      me.lastStateAt = t;
      if (typeof msg.x === 'number') me.x = clamp(msg.x, -260, 260);
      if (typeof msg.y === 'number') me.y = clamp(msg.y, -20, 80);
      if (typeof msg.z === 'number') me.z = clamp(msg.z, -260, 260);
      if (typeof msg.face === 'number') me.face = msg.face;
      if (typeof msg.pitch === 'number') me.pitch = msg.pitch;
      if (typeof msg.vx === 'number') me.vx = msg.vx;
      if (typeof msg.vz === 'number') me.vz = msg.vz;
      if (typeof msg.vy === 'number') me.vy = msg.vy;
      if (typeof msg.bladeOn === 'boolean') me.bladeOn = msg.bladeOn;
      if (typeof msg.firing === 'boolean') me.firing = msg.firing;
      if (typeof msg.spin === 'number') me.spin = msg.spin;
      if (typeof msg.slashT === 'number') me.slashT = msg.slashT;
      if (typeof msg.walkPh === 'number') me.walkPh = msg.walkPh;
      if (typeof msg.air === 'number') me.air = msg.air;
      if (typeof msg.thrust === 'boolean') me.thrust = msg.thrust;
      if (typeof msg.slam === 'boolean') me.slam = msg.slam;
      if (msg.build && typeof msg.build === 'object') me.build = sanitizeBuild(msg.build);
      if (msg.paint && typeof msg.paint === 'object') me.paint = msg.paint;
      if (typeof msg.maxHP === 'number') me.maxHP = clamp(msg.maxHP, 50, 300);
      // hp only reduced by server combat; clients may report heal/respawn max
      if (msg.dead === false && me.dead) { /* wait for respawn msg */ }
      return;
    }

    if (msg.t === 'hit') {
      // attacker claims a hit on target — server validates and applies
      if (me.dead) return;
      const tid = String(msg.target || '');
      const target = players.get(tid);
      if (!target || target.dead || target.id === me.id) return;
      const dmg = clamp(Number(msg.dmg) || 0, 1, 150);
      const src = msg.src === 'blade' ? 'blade' : 'gun';
      // distance check
      const dist = Math.hypot(target.x - me.x, target.z - me.z, (target.y || 0) - (me.y || 0));
      const maxRange = src === 'blade' ? 12 : 90;
      if (dist > maxRange) return;
      // rate limit
      const t = now();
      if (t - me.lastHitAt < (src === 'blade' ? 120 : 40)) return;
      me.lastHitAt = t;

      target.hp = Math.max(0, target.hp - dmg);
      broadcast({
        t: 'dmg',
        id: target.id,
        hp: target.hp,
        maxHP: target.maxHP,
        dmg,
        src,
        from: me.id
      });

      if (target.hp <= 0 && !target.dead) {
        target.dead = true;
        target.hp = 0;
        me.kills += 1;
        broadcast({
          t: 'kill',
          killer: me.id,
          killerName: me.name,
          victim: target.id,
          victimName: target.name,
          reward: KILL_REWARD,
          killerKills: me.kills
        });
        // notify killer for cash (server-confirmed)
        send(me.ws, { t: 'reward', amount: KILL_REWARD, reason: 'pvp_kill', kills: me.kills });
        console.log(`[kill] ${me.name} eliminated ${target.name}`);
      }
      return;
    }

    if (msg.t === 'respawn') {
      if (!me.dead) return;
      me.dead = false;
      me.hp = me.maxHP;
      const a = Math.random() * Math.PI * 2;
      const d = 40 + Math.random() * 100;
      me.x = Math.cos(a) * d;
      me.z = Math.sin(a) * d;
      me.y = 0;
      send(ws, { t: 'respawned', x: me.x, y: me.y, z: me.z, hp: me.hp });
      broadcast({ t: 'player', player: publicState(me) }, me.id);
      return;
    }

    if (msg.t === 'ping') {
      send(ws, { t: 'pong', ts: msg.ts || now() });
    }
  });

  ws.on('close', () => {
    if (!me) return;
    players.delete(me.id);
    broadcast({ t: 'leave', id: me.id, name: me.name });
    console.log(`[-] ${me.name} (${me.id}) left · ${players.size} online`);
  });

  ws.on('error', () => {});
});

// periodic state broadcast for smooth remote movement
setInterval(() => {
  if (players.size === 0) return;
  const list = snapshot();
  const data = JSON.stringify({ t: 'snapshot', players: list, online: players.size });
  for (const p of players.values()) {
    if (p.ws.readyState === 1) p.ws.send(data);
  }
}, 1000 / TICK_HZ);

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function sanitizeBuild(b) {
  return {
    rightArm: String(b.rightArm || 'gatling').slice(0, 24),
    leftArm: String(b.leftArm || 'blade').slice(0, 24),
    legs: String(b.legs || 'biped').slice(0, 24),
    armor: String(b.armor || 'lightA').slice(0, 24),
    module: String(b.module || 'jets').slice(0, 24)
  };
}

server.listen(PORT, HOST, () => {
  console.log(`Mech Battlegrounds multiplayer`);
  console.log(`  HTTP  http://${HOST}:${PORT}`);
  console.log(`  WS    ws://${HOST}:${PORT}/ws`);
  console.log(`  Public dir: ${PUBLIC_DIR}`);
  console.log(`  Max players: ${MAX_PLAYERS} · tick ${TICK_HZ}Hz · kill reward ${KILL_REWARD}`);
});
