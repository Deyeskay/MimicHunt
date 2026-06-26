# Architecture & Design Decisions

A living record of the **major design decisions** behind the 3D P2P Hide & Hunt
game (`game/`). The goal is to preserve *why* things are the way they are so
future work doesn't re-litigate settled trade-offs. Update this file when a
decision changes.

- **Stack:** Three.js (r128) + GLTFLoader + PeerJS (WebRTC) 1.5.4, plain ES5/ES6
  browser scripts (no bundler). Static site — runs from any file server.
- **Topology:** Authoritative-host **star** network (no signaling server of our
  own beyond PeerJS's broker).
- **Status:** Prototype. All verification is **manual** (multi-window localhost);
  there are no automated tests. `node --check` is used for syntax validation only.

---

## 1. Network topology — authoritative-host star

**Decision:** One peer is the host/authority; all clients connect only to the
host. The host owns `gameState` (roster, phase, timer) and broadcasts it.

- Host peer id is **deterministic**: `hnh3d-<4-digit code>`. Clients use random
  PeerJS ids and reach the host via the shared code.
- Clients never talk to each other — all traffic funnels through the host.

**Why:** Simplest model that prevents cheating/divergence; one source of truth.
**Trade-off:** Host is a single point of failure → mitigated by host migration
(§5). The original 4-digit code **dies** when the host crashes and is not
reacquired; the new host mints a fresh code (see §5).

---

## 2. Netcode — send rate, prediction, interpolation

**Decision:** Decouple simulation from transmission.

- **Physics / render / camera / collision run at 60 FPS.** Only **network
  transmission is throttled to 20 Hz** (`NETWORK_SEND_RATE = 20`).
- **Client-side prediction:** the local player is simulated locally and is
  **never overwritten** by network snapshots. Snapshots only drive *remote*
  players.
- **Entity interpolation:** remote players are rendered from a **snapshot buffer**,
  **render-behind** by `INTERP_DELAY = 100ms` (`Network.sampleSnapshot(now - INTERP_DELAY)`).
  Interpolation is **frame-rate independent** (time-based, not per-frame alpha).
- **Lightweight snapshots:** transmit slim position snapshots, not the full
  `gameState`. Discrete state changes (disguise, caught, ready, role) are sent as
  **events**, not polled in every snapshot.
- **Packet timestamps** guard against reordering (stale packets are dropped).

**Why:** 20 Hz cuts bandwidth ~3× with no felt latency cost because prediction +
interpolation hide it. Render-behind trades 100ms of visual latency for smooth,
gap-free remote motion.

---

## 3. Disconnect detection — heartbeat + watchdog (NOT `conn.on('close')`)

**Decision:** Detect drops by **absence of traffic**, in both directions, because
WebRTC's `conn.on('close')` is **unreliable on abrupt tab close/crash** (it only
notices via a long ICE timeout). It fires reliably only on a clean refresh.

- **Host → clients:** host broadcasts `ping` every `HEARTBEAT_MS = 1000` in **all
  phases** (the 20 Hz snapshot loop early-returns in LOBBY, so the dedicated ping
  is what makes **lobby** host-loss detectable).
- **Client → host:** client watchdog ticks every `WATCHDOG_MS = 500`. If
  `now - lastHostMsg > HOST_TIMEOUT_MS (3000)` → treat host as lost (same entry
  point as the `close` handler).
- **Host per-client sweep:** every heartbeat, the host drops any conn whose
  `now - conn._lastSeen > CLIENT_TIMEOUT_MS (3000)`. In-game, 20 Hz `clientMove`
  proves client liveness; in **lobby**, clients send `clientPing` @2 Hz (from the
  watchdog tick) since there's no other periodic client→host traffic.

**Key decision (confirmed with user):** **refresh and tab-close are
indistinguishable** to other peers (same page-unload, no signal). Chosen policy:
**"Migrate on any drop."** No special refresh handling / host auto-reconnect.

**Why these numbers:** 3s timeout = ≥6 missed lobby pings before a drop → no false
positives during normal play; detection within ~1–3s. The old `conn.on('close')`
paths are **kept too** (refresh migrates ~instantly; close migrates within ~3s) —
both funnel through the same guarded entry points.

**Idempotency:** `conn._dropped` dedupe guard makes a sweep-initiated drop and a
later real `close` safe to both run.

---

## 4. Voluntary shutdown vs. crash

**Decision:** Distinguish a host's intentional "Exit Match" from a crash so a
clean shutdown does **not** trigger migration.

- `roomClosing` handler sets a flag **before** showing its modal so the following
  `close`/watchdog does not migrate.
- A dedicated **`sessionEnding`** flag is used (NOT `isLeavingRoom`) because
  setting `isLeavingRoom` would trip `cleanup()`'s reentrancy guard. `gameOver`
  and `roomClosing` set `sessionEnding = true` before their end-modal, so a
  watchdog firing during the modal hits the guard → no spurious migration.

---

## 5. Host migration (lobby + in-game)

**Decision:** On host loss, the session **continues** under the next player
instead of collapsing to the menu. Applies in **both lobby and in-game** (the
room code changes hands).

- **Deterministic successor election** (pure function): first roster id that
  isn't the departed host. Every survivor runs the same election → exactly one
  promotes itself; the rest reconnect. No voting protocol.
- **Reconnection:** survivors hold the full roster, so the successor **re-maps**
  reconnecting peers (`rejoin` → `rejoinAck`) — they keep role/disguise/caught/
  color rather than becoming fresh Hiders. A per-id `rejoinExpected` timeout
  prunes peers that never reconnect.
- **Code peer:** the successor mints a **second** PeerJS peer
  (`hnh3d-<new code>`) for brand-new joiners; existing survivors reconnect via the
  successor's random id from the roster.
- **Split-brain prevention:** `startHostLoops()` always clears existing intervals
  first.

**Confirmed product decisions (from user):**
- **Roles are preserved on migration** (successor keeps its role).
- After an in-game migration, **count remaining Seekers**: ≥1 → continue the
  match; 0 → everyone gets an instant **Hiders-win** popup → returns to the new
  host's **fresh lobby**.
- **All players left (host alone) → return to main menu.**

**Scope seam:** because the host is currently the only Seeker by default, an
in-game host crash always leaves 0 Seekers, so every reachable in-game migration
currently ends in a fresh lobby. The "resume an in-progress match after
migration" branch is implemented generally but is effectively **dead code until
the role-selection screen makes non-host Seekers common** — left as a marked seam.

---

## 6. Roles, names, and lobby readiness

**Decision:** Roles are **user-chosen in the lobby**, not hardcoded.

- Each player enters a **display name** (menu input, persisted in
  `hidehunt_settings`, capped 16 chars). Shown in the lobby list and the in-game
  HUD badge — **no in-world nametags** (confirmed). Name crosses the wire via
  **PeerJS connection metadata** on connect.
- Lobby **Hider/Seeker toggle** per local player (segmented control). **Multiple
  seekers and multiple hiders allowed.**
- **Host is implicitly ready.** Start is gated on: **≥1 Hider AND ≥1 Seeker AND
  all players ready**; otherwise an **inline `#lobby-warning`** says what's
  missing (no modal).
- Game logic is **role-agnostic / multi-seeker**: collision iterates *all* seekers
  against each uncaught hider.
- **Ready state is authoritative:** the client button is set unconditionally from
  the synced `me.isReady` (optimistic, then reconciled by `lobbySync`) and reset
  on return to menu — this fixed a recurring ready-state desync.

---

## 7. Win-condition resolution is host-broadcast

**Decision:** `checkWinConditions` calls `Network.finishMatch(...)` which
**broadcasts `gameOver`** to everyone, rather than showing the modal locally.

**Why:** A prior bug showed the seeker-win popup only on the host because the
modal + cleanup ran host-side only. Resolving via a broadcast event guarantees
every client sees the result.

---

## 8. Levels — self-registering registry + manifest loader

**Decision:** Levels live as files in `game/js/levels/` and **self-register**;
the lobby reads them from the folder bundle, **not** localStorage.

- **`registry.js`** owns `const LEVELS = []` and `registerLevel(name, props)`.
  Each level file calls `registerLevel('Name', [...])`.
- Browsers **can't enumerate a folder**, so a `LEVEL_FILES` manifest array lists
  the filenames and `loadLevelScripts()` injects each `<script>` **sequentially**
  (so `LEVELS[0]` is the deterministic default map). `app.js` awaits this before
  `Level.init()`.
- **Adding a level = create `js/levels/<file>.js` + add its name to
  `LEVEL_FILES`.** No `<script>` tag edit needed. (User explicitly rejected
  per-level `<script>` tags; a true zero-config folder scan is impossible from a
  static browser app, so the one-line manifest is the chosen minimum.)
- **Only the level NAME crosses the wire** — levels are bundled identically on
  all peers, so syncing the name is enough; prop data never transmits.
- **Lobby selection:** host picks from a **horizontal carousel** of level cards
  (status line above shows the selected map). Non-hosts see it read-only.
- **Dynamic scene swap:** `Level.loadLevel(props)` removes previously spawned
  meshes (tracked in `Level.levelMeshes`), deep-clones props (so `enrichProp`
  never mutates the registry source), and respawns.

---

## 9. Prefab system (Unity-style)

**Decision:** A `PrefabLibrary` holds per-type **defaults** (collision, climbable,
hideSpot, canDisguise, etc. for tree/rock/bush/wall/spawn); level **instances
store only overrides**.

- Gameplay flags resolve via `PropLevel.resolveGameplay(prop)` using `??` so an
  instance falls back to its prefab default — back-compatible with old levels.
- `exportProp` is **slim**: only overrides + spawn flags are written, keeping
  level files small.
- The **editor and the game share** `prefabs.js` + `props.js` so authoring and
  runtime agree.

---

## 10. Editor decisions

- **Local-space move gizmo:** `transformControls.setSpace('local')` so the move
  gizmo follows the object's rotation.
- **Wheel-over-panel** scrolls the panel, not the scene
  (`e.target.closest('#toolbar, #right-panel, .help-modal')` guard).
- **Export/Load modals** are backed by **localStorage** (`hnh_editor_levels`).
  Export modal = name input + data textarea + Save/Close; Load modal lists saved
  levels.
- **Export format** emits `registerLevel("name", [...])` so exported text drops
  straight into `js/levels/<name>.js` (then add to `LEVEL_FILES`).
- Editor loads `prefabs.js`/`props.js` but **not** the registry/level files (it
  authors levels rather than playing them).

---

## 11. Persistence & cache

- **localStorage keys:** `hidehunt_settings` (game settings incl. `playerName`),
  `hnh_editor_levels` (editor saved levels).
- **Cache-busting:** all local script/CSS links carry `?v=N` (currently `?v=3`).
  Bump on every release of changed assets. *Recurring gotcha:* stale CSS produced
  "still two huge red buttons" reports even though JS was fresh — always bump CSS
  too and hard-refresh to verify.

---

## Constants reference

| Constant | Value | Meaning |
|---|---|---|
| `NETWORK_SEND_RATE` | 20 | Hz, transmission rate (sim stays 60 FPS) |
| `INTERP_DELAY` | 100 ms | Remote-player render-behind |
| `HEARTBEAT_MS` | 1000 | Host ping cadence (all phases) |
| `HOST_TIMEOUT_MS` | 3000 | Client declares host lost |
| `WATCHDOG_MS` | 500 | Client watchdog tick |
| `CLIENT_TIMEOUT_MS` | 3000 | Host drops a silent client |

## Key files

| File | Responsibility |
|---|---|
| `game/js/network.js` | Authority, snapshots, migration, heartbeat/watchdog (largest) |
| `game/js/globals.js` | Shared state, migration globals, timing constants |
| `game/js/level.js` | Scene build, `loadLevel`, snapshot-buffer render |
| `game/js/levels/registry.js` | `LEVELS`, `registerLevel`, `LEVEL_FILES`, loader |
| `game/js/ui.js` | Lobby, HUD, level carousel, role toggle |
| `game/js/mechanics.js` | Inputs, multi-seeker collision, win conditions |
| `game/js/prefabs.js` + `props.js` | Prefab defaults + instance resolution |
| `game/editor.html` | Level editor (gizmo, modals, export) |
