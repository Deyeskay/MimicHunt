# 3D P2P Hide & Hunt

A browser multiplayer hide-and-seek game. Players join a room, pick **Hider** or
**Seeker**, and hiders disguise as props in a 3D level while seekers hunt them
down before the timer runs out. Fully **peer-to-peer** (WebRTC via PeerJS) — no
game server to run.

This is the **start-here** doc. For depth:
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — how it's built (layers, data flow, protocol, lifecycle).
- **[DECISIONS.md](DECISIONS.md)** — *why* the major trade-offs were made.

---

## Quick start (hands-on in ~2 minutes)

The app is **static files** — it just needs a web server (not `file://`, because
ES modules / WebRTC need an http origin).

```bash
cd game
python -m http.server 8000      # or:  npx serve .   |   npx http-server -p 8000
```

Then open **two or more browser windows** at `http://localhost:8000/`:

1. **Window 1 (host):** type a name → **Host New Session**. A 4-digit room code
   appears.
2. **Window 2+ (clients):** type a name → enter the code → **Join Room**.
3. In the **lobby**: the host picks a level from the carousel; each player picks
   **Hider/Seeker** and clicks **Ready**. Start unlocks when there's **≥1 Hider,
   ≥1 Seeker, and everyone's ready**.
4. **Play:** Seekers are blinded during HIDING; Hiders move and press the disguise
   key to become a prop. In HUNTING, seekers catch hiders on contact.

> **Multiplayer needs ≥2 windows/devices.** A single window can't demonstrate
> netcode, migration, or win conditions.

### Level editor
Open `http://localhost:8000/editor.html`. Place/transform props, set gameplay
flags and spawns, then **Export** — it produces a `registerLevel("Name", [...])`
snippet. Save it as `game/js/levels/<name>.js` and add `'<name>.js'` to
`LEVEL_FILES` in `js/levels/registry.js` → it appears in the lobby carousel.

---

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD | left joystick |
| Look | mouse (click to lock, ESC to unlock) | drag |
| Jump | Space | JUMP button |
| Disguise / swap prop | F | PROP (F) button |

Settings (mouse sensitivity, invert-Y, hide/hunt times, mobile UI) are on the
menu's **⚙ Settings** screen and persist in `localStorage`.

---

## Project layout

```
HIdeNHunt/
├─ game/
│  ├─ index.html            # the game page (loads all js/ in order)
│  ├─ editor.html           # standalone level editor
│  ├─ css/style.css
│  └─ js/
│     ├─ globals.js         # shared state + tuning constants
│     ├─ prefabs.js         # prop-type defaults
│     ├─ props.js           # prefab/instance resolution + export
│     ├─ ui.js              # screens, HUD, lobby, modals
│     ├─ levels/
│     │  ├─ registry.js     # LEVELS, registerLevel, LEVEL_FILES, loader
│     │  ├─ forest.js       # default level (LEVELS[0])
│     │  └─ arena.js        # additional level
│     ├─ level.js           # Three.js scene + render/interpolation
│     ├─ mechanics.js       # input, movement, collisions, win check
│     ├─ network.js         # authority, snapshots, migration (largest)
│     └─ app.js             # boot: wiring, settings, startup sequence
└─ docs/                    # README / ARCHITECTURE / DECISIONS (this folder)
```

---

## What makes this non-trivial (the interesting parts)

- **Authoritative-host star netcode** with **client-side prediction** (local
  player never overwritten) and **entity interpolation** (remote players rendered
  100ms behind, smoothly). Simulation runs 60 FPS; transmission only 20 Hz.
- **Robust disconnect handling:** a heartbeat/watchdog scheme detects drops even
  on abrupt tab close (where WebRTC's `close` event doesn't fire), in both
  directions.
- **Automatic host migration:** if the host crashes, survivors deterministically
  elect a successor and reconnect — the session continues instead of dying.
- **Folder-driven levels** + a **Unity-style prefab system** (type defaults +
  per-instance overrides) + an in-browser **level editor**.

See [ARCHITECTURE.md](ARCHITECTURE.md) §3–§7 for how each works.

---

## Tech & conventions

- **Stack:** Three.js r128, GLTFLoader, PeerJS 1.5.4. Plain browser scripts, no
  bundler; cross-file globals defined in `globals.js`.
- **Editing:** bump the `?v=N` query on changed `<script>`/`<link>` tags in
  `index.html` / `editor.html` and **hard-refresh** — stale cache is the #1
  "my change didn't apply" cause.
- **Verification is manual.** There are no automated tests; `node --check
  js/<file>.js` validates syntax only. Real testing = a static server + 2+ windows
  (see the verification checklists in the planning notes / DECISIONS).
- **Platform:** developed on Windows / PowerShell.
