# Architecture

How the 3D P2P Hide & Hunt game is structured and how data flows through it.
Pair this with **[DECISIONS.md](DECISIONS.md)** (the *why*) and **[README.md](README.md)**
(quick start). This doc is the *what* and *how*.

> All paths are relative to the repo root (`game/` holds the app, `docs/` holds
> these files).

---

## 1. Big picture

```
                       PeerJS broker (signaling, public)
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                         │
   ┌──────────────┐         ┌──────────────┐          ┌──────────────┐
   │  HOST (peer  │◄───────►│  CLIENT A    │          │  CLIENT B    │
   │ hnh3d-1234)  │  WebRTC │ (random id)  │          │ (random id)  │
   │  AUTHORITY   │◄────────┼──────────────┼─────────►│              │
   └──────────────┘         └──────────────┘          └──────────────┘
        owns gameState        connToHost only           connToHost only
   broadcasts to everyone   sends input to host       sends input to host
```

- **Star topology, authoritative host.** The host owns the single `gameState`
  (`{ phase, timer, players{} }`) and is the only writer. Clients send **inputs**
  (move/disguise/ready/role) and receive **state** (snapshots + events).
- Clients never connect to each other. Everything goes through the host.
- There is **no custom server** — PeerJS's public broker only does WebRTC
  signaling; gameplay traffic is peer-to-peer data channels.

---

## 2. Runtime layers (files)

The browser loads plain scripts in dependency order (see `index.html`). No
bundler; globals are shared across files (`globals.js`).

| Layer | File | Responsibility | Key entry points |
|---|---|---|---|
| **State** | `js/globals.js` | All shared mutable state + tuning constants | `gameState`, `localPos`, `localDisguise`, timing consts |
| **Prefabs** | `js/prefabs.js` | Per-type defaults (tree/rock/bush/wall/spawn) | `PrefabLibrary`, `PREFAB_DEFAULT` |
| **Props** | `js/props.js` | Resolve instance vs prefab; export | `getPrefab`, `resolveGameplay`, `enrichProp`, `exportProp`, `canDisguiseAs` |
| **UI** | `js/ui.js` | DOM screens, HUD, lobby, modals | `transitionTo{Menu,Lobby,Game}`, `updateLobby`, `updateHUD`, `renderLevelSelector`, `showModal` |
| **Levels** | `js/levels/registry.js` | Level registry + manifest loader | `LEVELS`, `registerLevel`, `LEVEL_FILES`, `loadLevelScripts` |
| | `js/levels/*.js` | One level each, self-registering | `registerLevel('Name', [...])` |
| **Scene** | `js/level.js` | Three.js scene, models, render loop, interpolation | `init`, `loadModels`, `loadLevel`, `spawnProp`, `render`, `resize` |
| **Gameplay** | `js/mechanics.js` | Input, movement, collisions, win check | `initInputs`, `handleDisguiseSwap`, `checkCollisions`, `checkWinConditions` |
| **Network** | `js/network.js` | Authority, snapshots, events, migration, heartbeat | `Network.*` (see §4–§7) — **largest file** |
| **Boot** | `js/app.js` | Button wiring, settings load, startup sequence | `commitPlayerName`, `animate`, startup `loadLevelScripts().then(...)` |
| **Editor** | `editor.html` | Standalone level editor (separate page) | gizmo, export/load modals |

### Startup sequence (`app.js`)
```
loadLevelScripts()        // inject every js/levels/<file>.js from LEVEL_FILES, in order
  .then(Level.loadModels) // async-load GLTF models into modelLibrary
    .then(() => {
       Level.init();          // build scene from LEVELS[0] (default map)
       Mechanics.initInputs(); // keyboard/mouse/touch listeners
       animate();             // requestAnimationFrame render loop
    });
// settings + saved player name are loaded from localStorage separately
```

---

## 3. Two clocks: 60 FPS simulation, 20 Hz transmission

These are deliberately decoupled (see DECISIONS §2).

| Loop | Rate | Who | What |
|---|---|---|---|
| `animate()` / `Level.render()` | ~60 FPS (rAF) | everyone | render, camera, sample interpolation buffer |
| physics (`gameLoopInterval`) | 60 FPS | host & client | movement, gravity, collisions |
| network (`networkInterval`) | 20 Hz | host broadcasts snapshot / client sends `clientMove` | transmission only |
| timer (`timerInterval`) | 1 Hz | host | phase countdown |
| heartbeat (`heartbeatInterval`) | 1 Hz | host | `ping` + `sweepStaleClients()` |
| watchdog (`watchdogInterval`) | 2 Hz (500ms) | client | host-silence check + lobby `clientPing` |

- **Local player** is simulated by prediction and is **never** overwritten by
  network data. Only **remote** players are driven by the network.
- **Remote players** render from a **snapshot buffer**, sampled at
  `now - INTERP_DELAY (100ms)` via `Network.sampleSnapshot()` →
  `_lerpPlayers` / `_lerpAngle`. This is time-based, so it's frame-rate
  independent.

---

## 4. Wire protocol (message types)

All messages are `{ type, ... }` JSON over the PeerJS data channel.

### Client → Host (inputs)
| type | when | payload |
|---|---|---|
| `clientMove` | 20 Hz in-game | predicted transform |
| `clientDisguise` | on prop swap | disguise descriptor |
| `lobbyReady` | ready toggle | `{ readyState }` |
| `roleChange` | Hider/Seeker toggle | `{ role }` |
| `clientPing` | 2 Hz in lobby | liveness only |
| `leave` | graceful exit | — |
| `rejoin` | after host migration | `{ id }` — "I'm an existing member" |

### Host → Client(s) (state + events)
| type | when | payload |
|---|---|---|
| `snapshot` | 20 Hz in-game | slim positions of all players (+ timestamp) |
| `lobbySync` | roster/role/ready/level change | `{ players, levelName, roomCode }` |
| `gameStart` | match begins | full `gameState` incl. `levelName` |
| `disguise` | a player swapped | that player's disguise |
| `caught` | a hider is caught | which hider |
| `ping` | 1 Hz all phases | heartbeat (keeps watchdog alive) |
| `gameOver` | win condition | `{ title, message }` |
| `hidersWin` | 0-seeker migration result | `{ title, message }` |
| `rejoinAck` | reply to `rejoin` | `{ players, phase, timer, hostId, roomCode }` |
| `roomClosing` | host voluntary exit | — (sets `sessionEnding`, suppresses migration) |

**Design note:** state changes that are *discrete* (disguise/caught/ready/role)
are **events**, not polled in every snapshot. The level is synced **by name only**
(`levelName`) because level prop data is bundled identically on every peer.

---

## 5. Game lifecycle (phases)

`gameState.phase`: `LOBBY → HIDING → HUNTING → ENDED` (then back to `LOBBY`).

```
MENU ──host/join──► LOBBY ──(all ready, ≥1 hider & ≥1 seeker)──► HIDING
                      ▲                                             │
                      │                                       (hide timer)
                      │                                             ▼
                  (gameOver/                                    HUNTING
                   migration)                                       │
                      │                              (all hiders caught → Seeker win)
                      │                              (timer expires    → Hider win)
                      └─────────────── ENDED ◄────────────────────────┘
```

- **Lobby gate** (`app.js` start handler + `ui.updateLobby`): start requires
  `seekers ≥ 1 && hiders ≥ 1 && allReady`; otherwise `#lobby-warning` explains
  what's missing. Host is implicitly ready.
- **HIDING:** seekers are blinded; hiders position/disguise.
- **HUNTING:** `mechanics.checkCollisions` iterates **all** seekers vs each
  uncaught hider; a catch broadcasts `caught`.
- **Win:** `checkWinConditions` → `Network.finishMatch` → broadcast `gameOver`
  (so every client shows the popup, not just the host — see DECISIONS §7).

---

## 6. Disconnect detection & host migration

This is the most subtle subsystem. See DECISIONS §3–§5 for rationale.

### Detection (because `conn.on('close')` is unreliable on tab close)
- **Host loss (client side):** `startClientLoops` runs a watchdog every 500ms;
  if `now - lastHostMsg > 3000ms` → `onHostConnectionClose()` (same entry as the
  real `close`). Any host message (incl. `ping`) refreshes the timer.
- **Client loss (host side):** every heartbeat the host runs
  `sweepStaleClients()`, closing any conn silent for >3000ms
  (`conn._lastSeen`). In-game `clientMove` and in-lobby `clientPing` keep this
  fresh. `handleConnClose` is idempotent via a `conn._dropped` guard.

### Migration flow (`network.js`)
```
onHostConnectionClose()         // guarded by isLeavingRoom / migrating / sessionEnding
   ├─ electSuccessor()          // pure: first roster id ≠ departedHostId
   ├─ if successor === myId → becomeSuccessor()
   │     ├─ isHost = true; startHostLoops(); accept connections
   │     ├─ build rejoinExpected{} with per-id timeouts
   │     ├─ seekers === 0 → broadcast hidersWin → returnToFreshLobby()
   │     │  (else: resume match — currently dead code, see seam below)
   │     └─ mintCodePeer()      // second Peer hnh3d-<newcode> for new joiners
   └─ else → reconnectToSuccessor(successorId)
         ├─ peer.connect(successorId); send {rejoin, id}
         ├─ on rejoinAck → adopt authoritative state
         └─ timeout → _failReconnect → re-elect (exclude failed) or connectionLost()
```

- **Roles are preserved** across migration (successor keeps its role).
- **Seam:** in-game "resume the match" is implemented but unreachable today
  because the host is the only Seeker by default → every in-game crash leaves 0
  seekers → fresh lobby. Becomes live once non-host seekers are common.
- **Trade-off:** the original 4-digit code dies; the successor mints a new one.

---

## 7. Levels & prefabs

### Adding a level (the only steps)
1. Create `game/js/levels/<file>.js` containing `registerLevel('Name', [ ...props ]);`
2. Add `'<file>.js'` to the `LEVEL_FILES` array in `js/levels/registry.js`.

`loadLevelScripts()` injects them sequentially (so `LEVELS[0]` is the default
map). The lobby carousel (`ui.renderLevelSelector`) lists `LEVELS`; the host
picks one, and only its **name** syncs. At match start the scene swaps via
`Level.loadLevel(props)` (clears `Level.levelMeshes`, deep-clones props,
respawns).

### Prefab resolution
A prop instance stores **only overrides**. Gameplay flags resolve through
`PropLevel.resolveGameplay(prop)` using `??` fallback to the prefab default, so
old/short level files still work. `exportProp` writes only the overrides + spawn
flags to keep level files small.

---

## 8. Persistence, caching, and the editor

- **localStorage:** `hidehunt_settings` (settings + `playerName`),
  `hnh_editor_levels` (editor's saved levels).
- **Cache-busting:** every local `<script>`/`<link>` carries `?v=N` (currently
  `?v=3`). Bump on every changed-asset release; hard-refresh to verify. Stale CSS
  has bitten us before (looked like the JS change "didn't apply").
- **Editor** (`editor.html`) is a separate page that shares `prefabs.js` +
  `props.js`. It exports `registerLevel("name", [...])` text that drops straight
  into a level file. It loads neither the registry nor level files (it authors,
  doesn't play).

---

## 9. How to extend safely (cheat sheet)

| You want to… | Touch | Watch out for |
|---|---|---|
| Add a level | new `levels/*.js` + `LEVEL_FILES` | keep `LEVELS[0]` as the default map |
| Add a synced state field | host writer + `lobbySync`/`gameStart` payload + client handler | snapshots are slim — discrete state goes in events |
| Add a player input | `clientX` (C→H) + `handleClientData` case + host apply | local player is predicted; don't overwrite it from net |
| Change a tuning value | `globals.js` constants | keep timeouts ≫ heartbeat to avoid false drops |
| New prop type | `prefabs.js` default + editor | resolve via `??` for back-compat |
| Anything visible | bump `?v=` in `index.html`/`editor.html` | hard-refresh; verify in 2+ windows |

**Verification is always manual:** run a static server and open 2+ browser
windows (host + clients). `node --check js/<file>.js` only catches syntax.
