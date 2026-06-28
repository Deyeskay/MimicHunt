# Architecture

Pair with [FILE_REFERENCE.md](FILE_REFERENCE.md) (what each file does),
[NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md) (the wire), and [DECISIONS.md](DECISIONS.md)
(the why). Paths are relative to the **repo root** (the project was flattened from
`game/*` to root).

## 1. Big picture — authoritative-host star
```
                 PeerJS public broker (WebRTC signaling only)
                                  │
        ┌─────────────────────────┼─────────────────────────┐
   ┌──────────┐             ┌──────────┐               ┌──────────┐
   │  HOST    │◄── WebRTC ──│ CLIENT A │               │ CLIENT B │
   │ hnh3d-1234 │◄───────────┼──────────┼──────────────►│          │
   │ AUTHORITY │             │connToHost│               │connToHost│
   └──────────┘             └──────────┘               └──────────┘
   owns gameState           send inputs                send inputs
   broadcasts state         to host only               to host only
```
- One peer is the **host/authority**; it owns the single `gameState`
  (`{phase, timer, players{}}`) and is the only writer of authoritative state.
- Host PeerJS id is deterministic: **`hnh3d-<4-digit code>`**. Clients use random
  ids and connect only to the host. Clients never talk to each other.
- The host can be **any role** (Hider or Seeker) — roles are chosen in the lobby.
  (This is why the host-disguise replication bug existed; see NETWORK_PROTOCOL.md.)

## 2. Runtime layers (load order in `index.html`)
Loaded as plain scripts; globals are shared. Order matters.

1. CDN: `three.min.js` → `GLTFLoader.js` → `SkeletonUtils.js` → `peerjs.min.js`
2. `js/globals.js` — all shared mutable state + tuning constants + `Sound`.
3. `js/prefabs.js` — `PrefabLibrary` (prop type defaults + collider templates).
4. `js/props.js` — `PropLevel` (prop meshes, bounds, colliders, raycast, spawns).
5. `js/ui.js` — `UI` (screens, HUD, lobby, modals, crosshair/combat HUD).
6. `js/levels/registry.js` — `LEVELS`, `registerLevel`, `LEVEL_FILES`, loader.
7. `js/level.js` — `Level` (Three scene, models, animation, camera, render loop,
   projectiles).
8. `js/mechanics.js` — `Mechanics` (input, movement/physics, shooting, disguise,
   win check).
9. `js/network.js` — `Network` (PeerJS, snapshots, events, host migration).
10. `js/app.js` — boot: button wiring, settings load, startup sequence.

Level files (`js/levels/forest.js`, `arena.js`) are **not** in `index.html`; the
registry injects them dynamically from `LEVEL_FILES`.

### Startup (`js/app.js`)
```
loadLevelScripts()            // inject each js/levels/<file>.js (registers LEVELS[])
  .then(Level.loadModels)     // async GLTF load: props + player.glb (+ split clips)
    .then(() => { Level.init(); Mechanics.initInputs(); animate(); });
// settings + saved player name loaded from localStorage separately
```

## 3. Two clocks: 60 Hz sim, 20 Hz transmit (decoupled)
| Loop | Rate | Where | Does |
|---|---|---|---|
| `animate()` / `Level.render()` | ~60 (rAF) | everyone | render, camera, animation mixers, projectiles, interpolation sampling |
| physics (`gameLoopInterval`) | 60 (setInterval) | host & client | `Mechanics.handleLocalMovement` (predict local), `applyLocalTransform`, reload tick; host also runs shooting/timer side-effects |
| network (`networkInterval`) | 20 | host broadcasts `snapshot`; client sends `clientMove` | transmission only |
| timer (`timerInterval`) | 1 | host | phase countdown |
| heartbeat (`heartbeatInterval`) | 1 | host | `ping` + `sweepStaleClients()` |
| watchdog (`watchdogInterval`) | 2 | client | host-silence check + lobby `clientPing` |

- **Local player** is client-predicted from `localPos`/`localRotY` every physics
  tick and is **never** overwritten by snapshots (`buildSnapshot` includes it, but
  `applyLocalTransform` re-asserts the prediction each frame; the snapshot of self
  is ignored on the owner).
- **Remote players** render from a **snapshot buffer**, sampled `INTERP_DELAY=100ms`
  behind real time (`Network.sampleSnapshot` → lerp). Frame-rate independent.

## 4. State ownership & sync (summary)
- **Volatile transform** (`x,y,z,rotY`): host→clients via 20 Hz `snapshot`;
  client→host via 20 Hz `clientMove`.
- **Discrete events** (rare, reliable): `disguise`, `shot`, `jump`, `caught`,
  `lobbySync`, `gameStart`, `gameOver`, etc. — see NETWORK_PROTOCOL.md.
- **Per-peer deadlines** (`revealedUntil`, `disguiseLockUntil`, `shootingUntil`,
  `jumpAt`): replicated as **durations** in events; each peer stamps its own
  `Network.now()` so no clock sync is needed.
- **Full roster** rides `lobbySync`/`gameStart`/`rejoinAck` (whole `players` object),
  so new fields added to the player record auto-sync at those points.

## 5. Coordinate / scale conventions
- `PropLevel.PLAYER_BASE_HEIGHT = 1.5`. A grounded player's `localPos.y ≈ 1.5`
  (body centre); feet at `p.y - 1.5`; the character model spans ~0..3 units tall.
- Character model forward = +Z; `rotation.y = p.rotY + PLAYER_YAW_OFFSET(0)`.
- Movement heading `localRotY = atan2(moveX, moveZ)`; "W" (forward) ≈ `cameraYaw+π`.
- World bounds clamp: ±100 on X/Z.

## 6. Caching
Every local `<script>`/`<link>` in `index.html` carries `?v=N` (now **25**); the
registry loader has its own copy. Bump on every changed-asset release and
hard-refresh. Stale CSS/JS is the #1 "my change didn't apply" cause. `editor.html`
loads `prefabs.js`/`props.js` at a **separate, currently stale `?v=7`** (see TODO).
