# Recent Updates (Newest First)

Append new entries at the TOP. Dates are absolute (project tz). Cache `?v=` after
each round of asset changes is in parentheses where relevant.

## 2026-06-28 (later)

- **Per-role character models (v=26).** Seekers now render as `hunter.glb`, Hiders
  as `player.glb` (previously both used `player.glb`). `Level.loadModels` loads both
  GLBs through a new `Level.buildRig(gltf, path)` helper into `Level.rigs.player` /
  `Level.rigs.hunter` (each = `{scene, animations, clips}`); `Level.rigForRole(role)`
  picks the rig (Seeker → hunter, else player, with cross-fallback). `makeCharacterMesh`,
  `createPlayerMesh`, and the render self-heal use the rig instead of the old
  `Level.playerGLB`/`Level.playerClips` (both removed). See ANIMATION_SYSTEM.md.
- **Player shadows (v=26).** Enabled `renderer.shadowMap` (PCFSoft); `dirLight`
  casts shadows (2048² map, ±60 ortho frustum, near 0.5 / far 120, bias −0.0005);
  ground `receiveShadow = true`; character clone meshes `castShadow = true` (set in
  `buildRig` on the source + on each clone in `makeCharacterMesh`).
- **Camera FOV 75° → 60° (v=26).** Fixes the perspective stretch toward the screen
  edges while orbiting (Unity third-person default). `Level.init` PerspectiveCamera.
  *Note: lower FOV slightly enlarges the on-screen character; revisit CAM_BACK if it
  reads too close.*

## 2026-06-28

- **Masked-override shoot animation (v=25).** Replaced the additive upper-body
  shoot overlay (which fought the animated "searching" idle and looked wrong) with
  a **two-layer masked system**: each clip is split by bone name into a LOWER
  (hips/legs) layer and an UPPER (spine/arms/head) layer. Lower crossfades
  idle↔walk; upper crossfades idle/walk **↔ shoot** as a true override. Jump is a
  full-body one-shot over both layers. See ANIMATION_SYSTEM.md. (`Level.splitClip`,
  `makeCharacterMesh` lower/upper actions, rewritten `updateCharacterAnim`,
  `_crossfade`/`_fadeOutLayer`/`_playLayer`).
- **Over-the-shoulder camera (v=24/25).** `Level.render` camera block rebuilt as a
  PUBG/Free-Fire OTS rig: camera behind+above+right-shoulder, player rendered
  left-of-centre, crosshair-centred = aim direction. Tunables `CAM_BACK=5`,
  `CAM_RIGHT=1.7`, `CAM_EYE=2.6`. Default downward tilt from `cameraPitch≈0.2`.
  *Still needs visual tuning vs the user's `expected.png`.*
- **Landscape-only + responsive UI (v=24).** Added `#rotate-overlay` (portrait →
  "rotate device", covers screen). Added `@media (max-height:520px)` rules
  compacting the HUD pills (nowrap), mobile control buttons, and the menu/lobby/
  settings cards (top-align + scroll). CSS link finally bumped off the stale `v=3`.
- **Fix: host's own disguise now replicates.** `Network.sendDisguiseUpdate` used
  `sendToHost` only — a no-op for the host — so a **host playing Hider** never
  broadcast its disguise. Now: client → `clientDisguise` to host (relayed);
  host → broadcasts `disguise` directly.
- **Climbing fixes.** (1) `Mechanics.handleLocalMovement` now uses a **floor
  model** (highest climbable surface under the player) so you can jump onto and
  stand on rocks/bushes (old code required being within 0.15u of the exact top).
  (2) `prefabs.js`: `rock`/`bush` set `climbable:true`. (3) `resolveGameplay`
  restored to "instance value wins if defined, else prefab"; `forest.js` had its
  baked `"climbable": false` lines stripped so rocks/bushes inherit the prefab.
  **arena.js still has baked `climbable:false`** (TODO).
- **Shots collide with props + brighter scene (v=20–22).** `PropLevel.raycastProps`
  (ray vs vertical-cylinder colliders); `processShot` rejects hider hits behind a
  prop and stops the bolt at the impact (`impactDist` in the `shot` packet) with an
  impact flash. `Level.init` lighting boosted (ambient white 0.9 + hemisphere +
  directional 1.2).
- **Jump/shoot/aim-stance animation pass (v=18–19).** Jump clip on jump (networked
  `jump`/`clientJump` event + `p.jumpAt` edge-detect); aim-stance: while
  `shootingUntil` active a seeker faces the crosshair (`cameraYaw+π`) and back-walks
  (reversed walk) when retreating.
- **Combat polish (v=16–17).** Hider damage sound (`Sound.hurt`), HUD health bar
  (`#health-hud`/`#hp-fill`), crosshair hit-marker (`UI.hitMarker`), aim accuracy
  fix (camera-origin ray + body-column hider sampling), wider hit radius.
- **Shooting combat replaced touch-to-catch (v=15).** Energy-pulse shooting:
  crosshair, left-click/SHOOT button, host-authoritative `shoot`/`shot` events,
  hider HP=5, reveal (2s red blink) + disguise lock (5s), score +100/hit,
  elimination → `isCaught`. Removed `Mechanics.checkCollisions` (proximity catch).
- **Folder reorg.** Flattened `game/*` → repo root (`index.html`, `css/`, `js/`,
  `assets/`, `docs/`). All earlier docs referencing `game/js/...` are stale.
- **Repo pushed to GitHub** `Deyeskay/MimicHunt`; `main` force-set to the full
  project and models committed (removed `assets/models/*` ignore). *Pushing is now
  opt-in per the user.*

## 2026-06-27

- **PUBG camera/facing + mobile look.** Decoupled character facing from camera:
  `applyLocalTransform`/`clientMove` send `localRotY` (movement heading) not
  `cameraYaw`; `PLAYER_YAW_OFFSET=0`. Identifier-based joystick + document-level
  right-half touch look (`lookTouchId`).
- **Animated player model.** Load `player.glb` with animations + `SkeletonUtils`;
  per-player `AnimationMixer`; role-coloured foot ring; procedural bob fallback for
  clip-less models; self-heal upgrade from fallback primitives once the GLB loads.
- **Prefab editor + live 3D preview** in `editor.html` (edit `PrefabLibrary`
  visually, additive→ now split clips, export `prefabs.js` text, localStorage).
- **Compound colliders per prop type** (`prefabs.js colliders` template, fractions
  of bounds → world cylinders in `props.js`); per-axis wall-sliding; dev collider
  gizmos (`developer` flag, **G** key).
- **Folder-sourced level registry** + lobby level carousel.
- **Player names + lobby role selection** (multi-seeker); host migration on any
  drop (heartbeat/watchdog); player-count pill + host-alone popup; symmetric
  client-loss cleanup.

---
*For anything older, see git history (`git log --oneline`).*
