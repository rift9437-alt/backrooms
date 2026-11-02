# Deploy Mech Battlegrounds on Render

## One-time setup

1. Push this project to **GitHub** (include the whole `server/` folder with `public/index.html` inside it).
2. Go to [https://dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**.
3. Connect the repo.
4. Settings:

| Field | Value |
|--------|--------|
| **Root Directory** | `server` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance** | Free (or Starter) |

5. Environment variables (optional — defaults work):

```
PUBLIC_DIR=./public
TICK_HZ=20
MAX_PLAYERS=32
KILL_REWARD=100
```

Render sets `PORT` automatically — do not hardcode it.

6. Click **Create Web Service** and wait for the deploy.

## Play

- Open: `https://YOUR-SERVICE.onrender.com`
- Two players: two browsers / one normal + one private window
- Both click **Deploy → Engage**
- Status bar should show `ONLINE · 2 PILOTS`

WebSocket URL is automatic:

```
wss://YOUR-SERVICE.onrender.com/ws
```

## Blueprint (optional)

If the repo root contains `render.yaml`, use **New +** → **Blueprint** and apply it.

## Free tier notes

- Cold start after ~15 minutes idle (first load can take 30–60s).
- Fine for testing; use a paid instance for always-on multiplayer.
