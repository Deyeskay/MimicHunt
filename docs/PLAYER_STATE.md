# Player State

The per-player record lives in `gameState.players[id]`, created by
`Network.createPlayer(role, used, name)` (`js/network.js`). `id` is the PeerJS peer
id; the host's own id is `myId`.

## Fields
| Field | Type | Meaning | Written by | Synced via |
|---|---|---|---|---|
| `x,y,z` | number | world position (`y`≈1.5 grounded; feet at y−1.5) | owner predicts; host stores | `snapshot` / `clientMove` |
| `rotY` | number | facing yaw = **movement heading** (`localRotY`), or aim yaw while in aim-stance | owner | `snapshot` / `clientMove` |
| `role` | 'Seeker' \| 'Hider' | chosen in lobby | lobby `setLocalRole`/`roleChange` | `lobbySync`/`gameStart` |
| `name` | string | display name (≤16) | menu input via PeerJS metadata | roster |
| `color` | hex | role tint (Seeker `0xff4757`, Hider `0x2ed573`) | role/disguise | roster/`disguise` |
| `isReady` | bool | lobby ready (host implicitly ready) | `lobbyReady` | `lobbySync` |
| `isCaught` | bool | **eliminated** (HP hit 0). Freezes movement/disguise, greys mesh, drops from win count | host `processShot` | `shot.eliminated` / roster |
| `health` | int | hider HP, starts `HIDER_MAX_HP=12` | host `processShot` (−`SHOT_DAMAGE`/hit) | `shot.health` / roster |
| `score` | int | seeker score (+`HIT_SCORE=100`/hit) | host `processShot` | `shot.score` / roster |
| `revealedUntil` | ms (local clock) | red reveal blink deadline after a hit | each peer from `shot.revealMs` | event→local deadline |
| `disguiseLockUntil` | ms (local clock) | can't re-disguise until this | each peer from `shot.lockMs` | event→local deadline |
| `shootingUntil` | ms (local clock) | aim-stance window (upper-body shoot + face target + back-walk) | `fireShot` (self) / `shot.shootMs` | event→local deadline |
| `jumpAt` | ms (local clock) | timestamp of last jump (edge-detected to play jump anim) | `jump`/`clientJump` | discrete event |
| `disguiseType` | string | `'player'` or a prop model key (`tree`/`rock`/`bush`/`wall`) | `handleDisguiseSwap` | `disguise` |
| `disguiseSize` | number | `prop.radius*2` (collision radius source = size/2) | disguise | `disguise` |
| `propScale` | number | mesh scale of the disguise prop | disguise | `disguise` |
| `propHeight` | number | bounds height of disguise (collider height) | disguise | `disguise` |
| `propRadius` | number | bounds radius of disguise | disguise | `disguise` |
| `propRotation` | {x,y,z}\|null | disguise prop rotation (degrees) | disguise | `disguise` |
| `heldPower` | str\|null | hider's unused airdrop power (`heal`/`invis`/`shield`) awaiting **E** | host `grantPower` / cleared by `handleActivate` | `powerGain`/`powerUse` |
| `invisUntil` | ms (local clock) | hider invisible-to-seekers deadline (5s pickup or 10s power) | each peer from `*Ms` | `powerGain`/`powerUse` |
| `shieldArmed` | bool | hider disguise-shield armed (absorbs 1 hit) | host; cleared in `processShot` | `powerUse` / `shot.shielded` |
| `scanUntil` | ms (local clock) | seeker see-hiders-through-walls deadline | each peer from `scanMs` | `powerGain` |
| `killUntil` | ms (local clock) | seeker one-shot-kill deadline | each peer from `killMs` | `powerGain` |
| `carriedKeys` | int | hider's purple-beam keys held but not yet deposited at a door | host `grantKey`/`depositKeys`/`dropCarriedKeys` | `keyGain`/`keyDeposit` |

> **Team field (on `gameState`, not per-player):** `submittedKeys` — keys deposited at
> exit doors toward the hider key-win (`KEYS_TO_WIN`). Host-owned; synced via `gameStart`
> and the `keyDeposit` event.

### Runtime-only (not part of design state)
`_lastMoveT`, `_lastShotT` (host timestamp guards), `_lastSeen` (host ghost sweep),
`_dropped` (host close dedupe). On the mesh's `userData`: animation layers, mixer,
ring, lastPos, etc. (see ANIMATION_SYSTEM.md).

## Local prediction vs networked
- The **local player** is simulated from globals `localPos`, `localRotY`,
  `cameraYaw/Pitch`, `velocityY`, `localDisguise`, `ammo`/`reloading`. Each physics
  tick `Network.applyLocalTransform(gameState.players[myId])` copies
  `localPos`+`localRotY` onto the record so render/camera follow it.
- The host's snapshot deliberately is ignored for the owner's own id (prediction is
  authoritative locally; host is authoritative for everyone else's view of you).
- `localDisguise` (globals) mirrors the local player's disguise fields and is the
  source for `sendDisguiseUpdate`.

## Lifecycle
- **Create**: lobby join (`acceptConnection` → `createPlayer`). Defaults: HP 5,
  score 0, all *Until=0, isCaught false, disguiseType 'player'.
- **Round start** (`startGameBroadcast`, host): reassign spawn + color by final
  role; reset `health/score/revealedUntil/disguiseLockUntil/shootingUntil/jumpAt/
  isCaught/disguise`; clear `_lastMoveT/_lastShotT`. Host re-seeds `localPos`,
  `cameraYaw`, `ammo`.
- **Hit**: host `processShot` → `health-=SHOT_DAMAGE`, set reveal/lock windows, `forcedOut`
  (clear disguise) if disguised, `score+=100` on shooter; HP≤0 → `isCaught=true` →
  `checkWinConditions`.
- **Eliminated** (`isCaught`): `handleLocalMovement` early-returns (frozen);
  `handleDisguiseSwap` blocked; mesh greys (ring + animation freeze); excluded from
  hiders-left count.
- **Leave / drop**: removed from roster (graceful `leave`, or host `sweepStaleClients`
  / `handleConnClose` on timeout). Migration keeps records via `rejoin`/`rejoinAck`.

## Gotchas
- `disguiseSize` drives both the disguise mesh scale-ish and the hider hit radius in
  `processShot` (`max(1.3, disguiseSize/2)`) — bigger props are easier to hit.
- New fields you add to `createPlayer` auto-replicate through `lobbySync`/`gameStart`
  /`rejoinAck` (full roster), but **frequent** updates need a discrete event (don't
  add to the 20 Hz `snapshot`, which is transform-only by design).
