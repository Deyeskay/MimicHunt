# Animation System

All in `js/level.js`. The character is `assets/models/player.glb` (Mixamo rig)
with clips **idle, walk, run, jump, shoot**. Each player mesh is a
`SkeletonUtils.clone` (plain `.clone()` breaks skinning) with its own
`THREE.AnimationMixer`. A single shared `THREE.Clock` provides `dt` in `render`.

## Design: two masked layers + full-body jump
The idle clip animates the **whole** body (the character turns its torso/head as if
searching). An **additive** shoot overlay (the previous approach) *added* to that
live idle → arms searched and shot at once (looked wrong). Additive can't override.

**Current approach — masked override on disjoint bone sets:**
- `Level.splitClip(clip, keepLower)` splits a clip by bone name using
  `LOWER_BODY_RE = /(hip|pelvis|thigh|leg|knee|shin|calf|foot|toe|root|ik)/i`:
  - **lower** = tracks whose bone matches (hips + legs/feet/toes),
  - **upper** = the rest (spine, neck, head, shoulders, arms, hands).
- At load (`loadModels`) it builds `idleLower/idleUpper`, `walkLower/walkUpper`,
  `runLower/runUpper`, and `shootUpper` (upper-only). It also logs all clip + bone
  names to the console for verification.
- Per mesh (`makeCharacterMesh`):
  - `ud.lower = { idle, walk, run }` (lower-body actions)
  - `ud.upper = { idle, walk, run, shoot }` (upper-body actions)
  - `ud.jumpAction` (full clip, `LoopOnce` + `clampWhenFinished`)
  - starts with `lower.idle` + `upper.idle` playing at weight 1.
- Because the two layers touch **different bones**, they compose without blending
  conflicts; within a layer, crossfading is a clean override.

## Per-frame driver (`updateCharacterAnim(mesh, p, dt)`)
1. **Speed + direction** from the mesh's own rendered position delta (works for
   local AND interpolated remotes — no networked anim state). EMA-smoothed
   (`ud.speed`, `ud.velX/velZ`) so a stale frame (physics 60 Hz vs rAF) can't flip
   state. Hysteresis: enter walk >1.5, idle <0.5.
2. **Jump** (edge-detected via `p.jumpAt > ud.lastJumpAt`): play `jumpAction`,
   `_fadeOutLayer(lower)` + `_fadeOutLayer(upper)`; while active, skip layer updates
   and just `mixer.update`. On finish (time≥dur or not running), fade jump out and
   `_playLayer` the current lower/upper actions.
3. **Lower layer**: `idle` when still, `walk` when moving. **Back-pedal** = walk
   action with `setEffectiveTimeScale(-1)` when the velocity opposes facing
   (`vel·forward < -0.2`).
4. **Upper layer**: `shoot` while `Network.now() < p.shootingUntil` (the aim-stance
   window) → a true override of the searching idle; otherwise mirror locomotion
   (idle/walk). Walk reversed for back-pedal too.
5. `mixer.update(dt)` drives both layers + jump.

Helpers: `_crossfade(layer, from, to, dur)` (reset+fadeIn next, fadeOut prev),
`_fadeOutLayer(layer, dur)`, `_playLayer(layer, name, dur)`.

## Aim-stance (couples to camera/movement)
While a Seeker is shooting (`shootingUntil` active), `Mechanics.handleLocalMovement`
sets `localRotY = cameraYaw + Math.PI` (face the crosshair/target) instead of the
movement heading. Combined with the back-pedal logic above, retreating from the
target plays the reversed walk while still facing it. `shootingUntil` is networked
via the `shot` event so remotes show the same upper-body shoot + facing.

## Facing & transform
`updatePlayerMeshTransform`: character meshes are positioned feet-on-ground
(`p.y - PLAYER_BASE_HEIGHT`) and rotated `p.rotY + PLAYER_YAW_OFFSET` (`=0`; model
faces +Z). Disguised players use the prop mesh path (prop rotation in degrees).

## Foot ring / reveal / eliminated
Each character has a per-instance colored **foot ring** (`ud.ring`, Seeker red /
Hider green). `applyRevealBlink` blinks it red while `revealedUntil` is active;
eliminated (`isCaught`) greys it and freezes movement (in `updateCharacterAnim`).

## Fallback (no clips)
If `player.glb` has no usable clips (`hasClips` false), `updateCharacterAnim` runs a
procedural bob/sway on `ud.model`. If the model/SkeletonUtils isn't loaded yet,
`createPlayerMesh` returns a box (Seeker) / cylinder (Hider) primitive; `render`
self-heals — once the role's rig (`Level.rigForRole(role)`) is available it recreates
the mesh as the character. Seekers use the `hunter.glb` rig, Hiders the `player.glb`
rig (`Level.rigs.hunter` / `Level.rigs.player`, built by `Level.buildRig`).

## Tuning / gotchas
- If legs animate during a shot or arms don't, adjust `LOWER_BODY_RE` (the Mixamo
  rig splits correctly today: `mixamorigHips`+`*Leg/Foot/Toe` → lower; spine/neck/
  head/`*Arm/Hand`/fingers → upper).
- Clip name matching is keyword-based (`byName` in `loadModels`); the console logs
  the resolved idle/walk/run/jump/shoot. If a clip is named oddly, extend the
  keyword lists.
- Jump airtime ≈ `2*JUMP_STRENGTH/|GRAVITY|/60 ≈ 0.78s`; the jump clip plays once
  and clamps until it finishes.
