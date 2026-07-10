# Gameplay & Rules

## Roles
- **Hider**: disguises as a level prop (rock/tree/bush/wall) to blend in; can move,
  jump, and re-disguise; has **12 HP**.
- **Seeker**: hunts hiders and shoots them; has a crosshair, ammo, and a score.
- Roles are chosen per player in the lobby. **Multiple seekers and hiders allowed.**
  Start requires **≥1 Hider AND ≥1 Seeker AND everyone Ready** (host implicitly
  ready); otherwise an inline `#lobby-warning` says what's missing.

## Phases (`gameState.phase`)
`LOBBY → HIDING → HUNTING → ENDED → (LOBBY)`
- **HIDING** (`GAME_SETTINGS.hidingTime`, default 20s): seekers are **blinded**
  (`#blind-overlay`) and can't move (`handleLocalMovement` early-returns for a
  Seeker during HIDING); hiders position + disguise.
- **HUNTING** (`huntingTime`, default 90s): seekers can move and shoot.
- **ENDED**: a win modal shows; on OK → `cleanup()` (back to menu) or the host
  starts a fresh round.

## Win conditions (`Mechanics.checkWinConditions`, host)
- **Seeker win**: all hiders eliminated (`isCaught`) → `finishMatch("Game Over",
  "Seeker Wins! All hiders eliminated.")` → broadcast `gameOver`.
- **Hider win**: HUNTING timer reaches 0 → `finishMatch("Time's Up!", "Hiders Win!
  Time expired.")`.
- Host-alone (everyone left in-game) → "All players left" → main menu.

## The new gameplay loop (combat — replaced proximity "catch")
```
Hide → blend into prop → seeker suspects a prop → aim crosshair → shoot
  → HIT? yes → Hider REVEALED (red blink 2s) + cannot disguise 5s + −SHOT_DAMAGE HP
  → chase → shoot again → −SHOT_DAMAGE HP each hit
  → 12 hits total (HIDER_MAX_HP/SHOT_DAMAGE) → ELIMINATED (💀)
Accuracy reward: +100 score per hit. Weapon = blue "energy pulse" (Pew!), red flash.
```

### Shooting mechanics (see NETWORK_PROTOCOL.md `shot`, CAMERA_AND_CONTROLS.md)
- **Fire**: desktop left-click (while pointer-locked), mobile SHOOT button. Only
  Seeker, only HUNTING, only alive.
- **Ammo**: magazine `MAG_SIZE=8`, **4 shots/sec (`FIRE_INTERVAL_MS=250ms`)**, auto
  **reload `RELOAD_MS=1500ms`** when empty. Client-side feel; host rate-limits too.
  Mag (8) < hits-to-kill (12) so one magazine can't solo-eliminate a hider.
- **Aim/hit (host-authoritative)**: the **camera ray** through the centred crosshair
  is the hit ray. `processShot` samples the hider's **body column** (feet→head) vs
  the ray within `hitRadius = max(1.3, disguiseSize/2)` and `SHOT_RANGE=60`.
  **Props occlude**: `PropLevel.raycastProps` finds the nearest rock/tree along the
  ray; a hider behind it is NOT hit and the bolt stops at the prop (`impactDist`,
  with a small impact flash). Disguised hiders are still valid targets (they're
  players, not level props).
- **On hit**: `health-=SHOT_DAMAGE`; shooter `score+=100`; set `revealedUntil=now+REVEAL_MS
  (2s)` (red ring blink) and `disguiseLockUntil=now+DISGUISE_LOCK_MS (5s)`; if the
  hider was disguised, **force them out** (`forcedOut` → back to player model);
  HP≤0 → `isCaught` (eliminated). Hit-marker flashes the shooter's crosshair;
  `Sound.hurt()` plays on the hit hider, `Sound.pew()` on the shot.

### Disguise (Hider)
- Press F / PROP button near a disguisable prop (`canDisguiseAs`): become that prop
  (mesh + collider take the prop's footprint/height). Press again away from props to
  revert to the player model.
- **Reach** (`findNearestDisguiseProp`): you must be standing next to the prop —
  center-distance `< prop.radius + 2` (its surface + the player's radius of 1 + ~1 grace).
  The button only enables / names a prop when in reach.
- **Disguise lock**: for 5s after being hit you cannot re-disguise (so a revealed
  hider can't instantly become another rock). Un-disguising is always allowed.
- After disguising, `resolveOverlap` pushes the (now larger) player out of any
  collider it overlaps to the nearest clear spot.

### Reveal / elimination visuals
- Reveal: the per-instance **foot ring blinks red** for 2s (`applyRevealBlink`).
- Eliminated: ring greys (`0x333333`), animation freezes, movement/disguise blocked.

## Airdrop beams & power-ups (Phase 1: GOLD)
PUBG-style sky drops during HUNTING. `Network.tickBeams` (host) spawns **gold beams**
at random spawn points on a schedule anchored to HUNTING start. The schedule is
**derived from the match length** by `computeBeamSchedule(huntLen)` (`js/globals.js`)
rather than a fixed list: gold count scales `≈huntLen/170` (1–8), spread across
`[head … huntLen−30s]` where `head=max(60, 0.12·huntLen)`. A beam **arms 5s** then
**activates**; the first player within `BEAM_RADIUS` collects it (host-authoritative).
- **Hider** pickup → auto-invisible 5s **and** holds one random power, used with **E /
  power button**: **Full-health**, **Invisible 10s**, **Disguise-shield** (absorb one hit
  while disguised — no break, no damage; consumed next hit).
- **Seeker** pickup → instant: **Scan** (hiders ≤20m show a *listen-mode* see-through
  silhouette — a dark body cutout + soft glowing rim — on their body/prop, plus an
  orange head dot, drawn through walls, 10s, beats invis; an undisguised hider's
  silhouette follows the **live animated pose**, not a frozen T-pose),
  **Jammer** (every live hider can't disguise 15s **and** anyone already disguised is
  popped out of their prop instantly; reuses `disguiseLockUntil`), **Kill**
  (one-shot direct kill 10s).
- Combat: invisible hiders are untargetable; shield negates one hit (`shot.shielded`);
  kill sends HP to 0. Tunables in `js/globals.js` (`BEAM_*`, `POWER_*`, `PICKUP_INVIS_MS`).
- **Invisibility look:** an invisible hider is **completely hidden from seekers**, but the
  hider **itself and other hiders** see a *ghost* — the real character/prop rendered
  faintly translucent inside a glowing **white fresnel rim** — so you keep track of
  yourself while invisible (`Level.applyInvisGhost`, `js/level.js`).

### Keys & exit doors (Phase 2: PURPLE beam)
A second hider win path. **Purple beams** drop a key only a **hider** can take (seekers
gain nothing). Their times also come from `computeBeamSchedule(huntLen)`: the count is
floored at `KEYS_TO_WIN` and scales up to 6 (`KEYS_TO_WIN + ⌊(huntLen−300)/300⌋`),
endpoint-spread across `[head … huntLen−100s]` (the 100s tail reserves door-open +
run-to-exit time). Because the count is floored at `KEYS_TO_WIN`, **every** match length
gets enough purple beams to win — even the 5-min minimum (3 keys). A hider **carries**
collected keys, then walks into any **exit door** (`DOOR_RADIUS`) to **deposit** them to
the team total; the team wins at `KEYS_TO_WIN = 3` ("Keys Secured! Hiders Win!").
- A carrier **killed** before depositing **drops** their keys on the ground; any hider
  can recover the bundle.
- **Exit doors** are `model:'door'` markers (or an `exitDoor` flag) placed during level
  design (editor "Exit Door" button) — green goal portals with a through-wall "EXIT"
  label. `PropLevel.getDoorPositions` lists them; `Network.tickKeys` is host-authoritative.
- **Doors stay HIDDEN + non-depositable until they OPEN**, which is `EXIT_ACTIVATE_DELAY_MS`
  (60s) after the **last purple key beam that actually fires** in the hunt. The host computes
  `gameState.doorsActivateAt` at HIDING→HUNTING and broadcasts a relative `doorsSchedule`
  (`{activateInMs}`); clients convert it to a local deadline. `Level.updateDoors` reveals the
  portals at the deadline; `tickKeys` rejects deposits until then. Because
  `computeBeamSchedule` always fits `≥KEYS_TO_WIN` purple beams inside the hunt and
  reserves a ~100s tail after the last one, the doors **always** open with time to
  deposit — the old "hunt too short → doors never open" dead path is gone.
- HUD: top-left `🔑 deposited/3` (everyone) + the local hider's `🎒 carried`, plus the
  persistent **Objective pill** (under the role card) showing the live `⏳ Exits unlock in M:SS`
  countdown → `🚪 EXITS OPEN — escape!` once active.
- Both hider wins co-exist: keys delivered **or** the hunting timer expiring.

## Scoring
- **In-game `score`** (combat HUD `⭐`): seeker **+100 per hit** (`HIT_SCORE`), per-match,
  reset at round start. Raw damage tally — NOT the end-of-match XP.
- **End-of-match XP** (`Network.buildResults(winner)`, results scoreboard): redesigned so
  **winning is the biggest driver for both roles** and ceilings are symmetric (~1150–1460),
  vs the old seeker-farm (a 12-hit kill used to bundle ~1400 XP). All constants in
  `js/globals.js` (`XP_*`). `winner` ('Hiders'|'Seekers') is threaded from `finishMatch`.
  - **Hider XP** = `winBonus` + `round(fracOfMatchSurvived × XP_SURVIVE_FULL=400)` +
    `keysDelivered × XP_KEY_DELIVER=200` + (win **by keys** only) `XP_KEYWIN_BONUS=150`
    team objective bonus. Survival scales by *fraction* of the hunt so 5–20 min matches
    stay balanced; the keys bonus rewards the risky active objective over passive hiding
    (timer win gives no such bonus). `keyWin` flag threaded from the keys-win `finishMatch`.
  - **Seeker XP** = `winBonus` + kill XP (`XP_KILL=180` each, diminishing to ×`0.5` past
    `XP_KILL_SOFTCAP=3`) + chip (`XP_CHIP_PER_HIT=3` per hit, capped `XP_CHIP_CAP=150`).
    The chip also credits softening a hider a teammate finishes.
  - **Win bonus** = `XP_WIN_BONUS=500`, flat, to every player on the winning side.
  - **Grade** (`XP_GRADES`, off final XP): S+ ≥1200, S ≥950, A ≥700, B ≥450, else C.
    Shown in the "Score" column — seekers see `<dmg> <grade>`, hiders just the grade.

## Tunables (all in `js/globals.js`)
`HIDER_MAX_HP`, `MAG_SIZE`, `FIRE_INTERVAL_MS`, `RELOAD_MS`, `SHOT_RANGE`,
`HIT_SCORE`, `REVEAL_MS`, `DISGUISE_LOCK_MS`, `SHOOT_ANIM_MS`, `XP_*` (scoreboard XP +
grades); hit radius floor is in
`Network.processShot`; hide/hunt durations in `GAME_SETTINGS`.
