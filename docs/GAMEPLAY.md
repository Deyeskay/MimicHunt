# Gameplay & Rules

## Roles
- **Hider**: disguises as a level prop (rock/tree/bush/wall) to blend in; can move,
  jump, and re-disguise; has **5 HP**.
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
  → HIT? yes → Hider REVEALED (red blink 2s) + cannot disguise 5s + −1 HP
  → chase → shoot again → −1 HP each hit
  → 5 hits total → ELIMINATED (💀)
Accuracy reward: +100 score per hit. Weapon = blue "energy pulse" (Pew!), red flash.
```

### Shooting mechanics (see NETWORK_PROTOCOL.md `shot`, CAMERA_AND_CONTROLS.md)
- **Fire**: desktop left-click (while pointer-locked), mobile SHOOT button. Only
  Seeker, only HUNTING, only alive.
- **Ammo**: magazine `MAG_SIZE=4`, **1 shot / `FIRE_INTERVAL_MS=500ms`**, auto
  **reload `RELOAD_MS=1500ms`** when empty. Client-side feel; host rate-limits too.
- **Aim/hit (host-authoritative)**: the **camera ray** through the centred crosshair
  is the hit ray. `processShot` samples the hider's **body column** (feet→head) vs
  the ray within `hitRadius = max(1.3, disguiseSize/2)` and `SHOT_RANGE=60`.
  **Props occlude**: `PropLevel.raycastProps` finds the nearest rock/tree along the
  ray; a hider behind it is NOT hit and the bolt stops at the prop (`impactDist`,
  with a small impact flash). Disguised hiders are still valid targets (they're
  players, not level props).
- **On hit**: `health-=1`; shooter `score+=100`; set `revealedUntil=now+REVEAL_MS
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

## Scoring
- Seeker: **+100 per hit** (`score`), shown in the combat HUD (`⭐`). Hiders have no
  score (survival is the goal). Per-match; reset at round start.

## Tunables (all in `js/globals.js`)
`HIDER_MAX_HP`, `MAG_SIZE`, `FIRE_INTERVAL_MS`, `RELOAD_MS`, `SHOT_RANGE`,
`HIT_SCORE`, `REVEAL_MS`, `DISGUISE_LOCK_MS`, `SHOOT_ANIM_MS`; hit radius floor is in
`Network.processShot`; hide/hunt durations in `GAME_SETTINGS`.
