# Network Protocol

PeerJS WebRTC data channels, JSON messages `{ type, ... }`. **Authoritative-host
star**: clients send inputs to the host; the host owns `gameState` and broadcasts
state + events. All in `js/network.js`.

## Connection
- Host: `new Peer('hnh3d-' + code)` (4-digit code). A migrated host mints a second
  "code peer" (`mintCodePeer`) for brand-new joiners while keeping its random id for
  reconnecting survivors.
- Client: `peer.connect('hnh3d-'+code, { metadata: { name: myName } })`. Host reads
  `conn.metadata.name` in `acceptConnection`.
- Helpers: `broadcast(pkt)` (all clients), `broadcastExcept(pkt, exceptId)`,
  `sendToHost(pkt)` (**no-op on the host** — important, see Disguise).
- `Network.now()` = `performance.now()` — monotonic, compared only within one
  sender's stream; per-peer origin doesn't matter.

## Client → Host (inputs)
| type | when | payload | host handler effect |
|---|---|---|---|
| `clientMove` | 20 Hz in-game | `{t,x,y,z,rotY}` | set that player's transform (timestamp-guarded) |
| `clientDisguise` | on disguise change | `{disguiseType,disguiseSize,propScale,propHeight,propRadius,propRotation,color}` | apply to roster; **reject if disguising while `disguiseLockUntil` active**; relay as `disguise` to others |
| `clientJump` | on jump | `{}` | stamp `p.jumpAt=now`; broadcast `jump` |
| `shoot` | on fire | `{t,ox,oy,oz,dx,dy,dz,mx,my,mz}` (camera ray + muzzle) | `processShot(conn.peer, data)` |
| `lobbyReady` | ready toggle | `{readyState}` | set isReady; `lobbySync` |
| `roleChange` | Hider/Seeker toggle | `{role}` | set role+color; `lobbySync` |
| `clientPing` | 2 Hz in lobby | `{}` | liveness only (resets `_lastSeen`) |
| `leave` | graceful exit | `{}` | remove player; `lobbySync`; `checkHostAlone` |
| `activatePower` | hider presses E / power button | `{}` | `handleActivate(conn.peer)` — apply held power, broadcast `powerUse` |
| `rejoin` | after host migration | `{id}` | re-map existing record; send `rejoinAck` |

> Any client packet refreshes `conn._lastSeen` (host watchdog / ghost sweep).

## Host → Client(s) (state + events)
| type | when | payload | client effect |
|---|---|---|---|
| `snapshot` | 20 Hz in-game | `{t,phase,timer,players:{id:{x,y,z,rotY}}}` | `pushSnapshot` (interpolation buffer); update phase/timer/HUD |
| `lobbySync` | roster/role/ready/level change | `{players, levelName?, roomCode?}` | replace roster; update lobby + level carousel |
| `gameStart` | match begins | `{gameState}` | adopt full gameState; `Level.loadLevel`; seed local prediction; transition to game |
| `disguise` | a player (incl. host) disguised | `{id,disguiseType,disguiseSize,propScale,propHeight,propRadius,propRotation,color}` | update that player's disguise fields |
| `shot` | a seeker fired (hit or miss) | see below | update health/score/reveal/lock/elim; spawn bolt+impact; sounds; hit-marker |
| `jump` | a player jumped | `{id}` | stamp `players[id].jumpAt=now` (skip self) |
| `caught` | (legacy) | `{id}` | set `isCaught` (superseded by `shot.eliminated`) |
| `notice` | event toast | `{text,audience?,toastMs?}` | `UI.toast(text,{duration})`; `audience` (`all`/`hiders`/`seekers`) restricts who shows it, `toastMs` lengthens it. Host shows locally honoring its own role via `Network.notify(text,opts)` |
| `beamSpawn` | host airdrop beam appears | `{beamId,kind,x,z,armMs}` | `Level.spawnBeam` (arms `armMs`, then active) + `Sound.beam` |
| `beamGone` | beam collected/expired | `{beamId,collectorId?}` | `Level.removeBeam` (flash if collected) |
| `powerGain` | a player picked up a power | `{playerId,role,heldPower?,invisMs?,power?,scanMs?,killMs?,jamIds?,jamMs?}` | `applyPowerGain` → ms→local deadlines; hider holds `heldPower`, seeker power applied instantly |
| `powerUse` | hider activated held power | `{playerId,power,healTo?,invisMs?,shield?}` | `applyPowerUse` |
| `keyGain` | hider collected/recovered a key | `{playerId,carried}` | `applyKeyGain` (set carriedKeys) |
| `keyDeposit` | hider deposited keys at a door | `{playerId,carried,submitted}` | `applyKeyDeposit` (team count) |
| `keyDrop` | killed carrier's keys hit the ground | `{keyId,x,z,count}` | `Level.spawnDroppedKey` |
| `keyDropGone` | dropped-key bundle recovered | `{keyId}` | `Level.removeDroppedKey` |
| `doorsSchedule` | when exit doors open (sent at HUNTING start) | `{activateInMs}` | client sets `gameState.doorsActivateAt = now()+activateInMs` (null ⇒ doors never open). Gates door render (`Level.updateDoors`) + deposits (`tickKeys`) |
| `ping` | 1 Hz all phases | `{}` | resets client watchdog (`_lastHostMsgTime`) |
| `gameOver` | win/timeout | `{title,message}` | `sessionEnding=true`; modal → cleanup |
| `hidersWin` | 0-seeker migration result | `{title,message}` | informational modal |
| `rejoinAck` | reply to `rejoin` | `{players,phase,timer,hostId,roomCode}` | authoritative resync after migration |
| `roomClosing` | host voluntary exit | `{}` | `sessionEnding=true`; modal → cleanup |
| `player` | (internal id echo) | — | (see code) |

### `shot` packet (the combat event)
```
{ type:'shot', shooterId,
  ox,oy,oz, dx,dy,dz,            // camera ray (origin + unit dir) used for the hit
  mx,my,mz,                      // muzzle (player chest) — bolt visual start
  hit, targetId, health, score, // result: was a hider hit; their new HP; shooter score
  impactDist,                   // distance along the ray where the bolt stops (hider/prop/range)
  revealMs, lockMs, shootMs,    // DURATIONS — each peer stamps its own deadline
  eliminated, forcedOut,         // HP→0; hit knocked the hider out of disguise
  shielded }                     // disguise-shield absorbed the hit (no damage/reveal/lock)
```
- The **shooter** drew its own bolt locally in `fireShot`; on the echo it skips the
  visual (`shooterId === myId`) but still applies target state. Other peers spawn
  the bolt to `impactDist` and (if `forcedOut`) reset the target's disguise.
- Reveal/lock/shoot windows are sent as **ms durations**; each peer does
  `Network.now() + ms` → no cross-peer clock sync.

## Authority model
- **Movement**: client-predicted locally; host stores client transforms verbatim
  (light timestamp guard). The owner never overwrites its own prediction with the
  host snapshot of itself.
- **Shooting**: client supplies the aim ray; **host validates geometry**
  (`processShot`): ray-vs-hider body-column sampling, **prop occlusion** via
  `PropLevel.raycastProps` (a rock/tree between you and the hider blocks the shot),
  rate-limit (`FIRE_INTERVAL_MS-100`), applies damage/reveal/lock/score, broadcasts
  `shot`. Ammo/reload are client-side feel only.
- **Disguise**: a CLIENT sends `clientDisguise` (host relays `disguise`); the **HOST
  broadcasts `disguise` directly** (because `sendToHost` is a no-op for the host —
  this was a fixed bug where a host-Hider's disguise never reached clients).
- **Win check**: `Mechanics.checkWinConditions` runs host-side (reached from
  `processShot` on a lethal hit, or the timer) → `finishMatch` broadcasts
  `gameOver`.

## Host migration (heartbeat/watchdog)
- Drops are detected by **absence of traffic**, not `conn.on('close')` (unreliable
  on abrupt tab close). Host pings 1 Hz + sweeps stale clients (`_lastSeen` >3s).
  Client watchdog: if no host message >3s → `onHostConnectionClose`.
- On host loss survivors run a **deterministic election** (`electSuccessor` = first
  roster id ≠ departed host). The winner `becomeSuccessor` (deletes host, starts
  host loops, accepts `rejoin`s, mints a code peer); others `reconnectToSuccessor`.
- Per-peer deadlines (`rejoinExpected`) prune survivors that never reconnect.
- `roomClosing`/`gameOver` set `sessionEnding` so the imminent `close` does NOT
  migrate (distinguishes voluntary shutdown from a crash). Original 4-digit code
  dies on host crash; successor mints a new one.
- **Seam:** the in-game "resume the match after migration" path is implemented but
  effectively dead — the host is usually the only Seeker, so a host crash leaves 0
  seekers → everyone gets `hidersWin` → fresh lobby. Becomes live once non-host
  seekers are common.
