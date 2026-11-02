# Mech Battlegrounds — Online Multiplayer

## Files

| Path | Role |
|------|------|
| `public/index.html` | Game client (also mirrored as `mech-battlegrounds.html`) |
| `server/server.js` | WebSocket + static HTTP server |
| `server/package.json` | Node dependencies (`ws`, `dotenv`) |
| `server/.env.example` | Config template |

## Run locally

```bash
cd server
cp .env.example .env   # optional
npm install
npm start
```

Open **two** browsers (or one normal + one private window):

- http://localhost:8080

Deploy → Engage on both. Status bar should show `ONLINE · 2 PILOTS`.

### WebSocket URL

By default the client connects to:

```
ws(s)://<same-host-as-page>/ws
```

Override before load:

```html
<script>window.MB_WS_URL = 'wss://your-domain.example/ws';</script>
```

## How two real players connect

1. Start the server on a machine reachable by both players.
2. Both open the HTTP URL served by that server (or any host that serves `public/index.html` and proxies `/ws` to the Node process).
3. Each deploys into the world — join happens automatically.
4. Fight anywhere on the map. Kills award server-confirmed credits.

## Deploy online

1. Push `server/` + `public/` to a host with Node 18+.
2. Set env vars (`PORT`, `HOST`, `KILL_REWARD`, etc.).
3. Run `node server.js` behind HTTPS (required for `wss` on most browsers).
4. Reverse-proxy example (nginx):

```nginx
location /ws {
  proxy_pass http://127.0.0.1:8080;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
location / {
  proxy_pass http://127.0.0.1:8080;
}
```

Platforms that work well: a VPS, Railway, Render, Fly.io. Use their `PORT` env automatically.

**Do not** put secrets in the HTML file. Server config stays in environment variables.

## What is server-authoritative

- Hit acceptance (range + rate limits)
- HP reduction
- Kill detection
- Kill rewards (cash)

Clients still simulate local movement, guns, and VFX. Positions are broadcast at ~20 Hz with client-side interpolation.

## Solo / offline

If the WebSocket server is unreachable, the game still runs fully offline. The status bar shows `DISCONNECTED` / `OFFLINE`. Dummy, quests, shop, and customisation keep working.
