# Recent Updates (Newest First)

Append new entries at the TOP. Dates are absolute (project tz). Cache `?v=` after
each round of asset changes is in parentheses where relevant.

## 2026-06-28 (later)

- **Ground + wall textures.** The ground uses the real image
  `assets/textures/grass.png` (loaded async via `Level.loadGroundImage`, repeat 24×24)
  with a generated grass `CanvasTexture` (`Level.makeGroundTexture`, repeat 40×40) as
  an instant fallback shown until the image loads / if it's missing. Walls use a
  real image `assets/textures/wall.png` (loaded async via `PropLevel._loadWallImage`,
  repeat 2×2) over a generated stone-brick `CanvasTexture` fallback
  (`PropLevel.getWallTexture`). Walls keep per-instance materials (so a
  disguised-as-wall hider's reveal blink doesn't tint every wall) sharing one map
  texture; the image is swapped onto all wall materials when it loads.
- **Walls are climbable.** `wall` prefab `climbable: true`, so you can jump onto and
  stand/walk/run on walls like rocks/bushes. The floor-model climb check in
  `Mechanics.handleLocalMovement` is now **footprint-aware** (per collider piece:
  oriented-box for walls, circle otherwise) so you stand on the wall's actual top, not
  a fat circle around it. (forest.js walls don't bake `climbable`; arena.js still bakes
  `climbable:false` everywhere — strip it for arena walls too. See TODO.)
- **Box colliders for walls.** Walls (`colliderShape:'box'` in prefabs.js) now use a
  single oriented **box** collider instead of a fat cylinder. New `bounds.localX/localZ`
  (rotation-removed extents) in `computeBounds`; box branch in `resolveColliders`
  (`{shape:'box',halfX,halfZ,rot,…}`); box handling in `Mechanics.blockedAt`
  (circle-vs-OBB), `PropLevel.raycastProps` (ray-vs-OBB slab), and the collider gizmos
  in level.js + editor (incl. prefab preview). Cylinder pieces now tagged
  `shape:'cylinder'`. See PROP_SYSTEM.md.
- **Editor: selected collider purple + hierarchy arrow-key nav + upload level + view
  gizmo.** (see earlier editor notes; editor.html only.)
- **Combat HUD/UX pass.** (1) Bolt muzzle moved from the chest (`localPos.y+1.0`) to
  the **right hand** (forward+right offset, lower `y`) in `Level.getAimRay`. (2) New
  `Sound.reload()` "cha-chunk" plays on `Mechanics.startReload`; a blinking
  **RELOADING…** pill shows bottom-center (`#reload-indicator` + `.blink`, toggled in
  `UI.updateHUD`). (3) Hider **health bar moved to bottom-center** (`#health-hud`
  +`.bottom-center-hud`, wider 220px track) instead of the top header. (4) **Player
  count** pill moved beside Exit (`margin-left:auto` on `#player-count-card`).
  (5) **Exit Match now confirms** via new `UI.showConfirm(title,msg,onConfirm,label)`
  (two-button modal; added `#modal-cancel-btn` + `.modal-actions`). Movement turn is
  also lerped now (`TURN_LERP`) and walk speed halved (`moveSpeed=0.15`).
- **Cache `?v=` bumping retired.** The user hard-reloads manually to validate, so we
  no longer bump the `?v=N` query on every change. `index.html` is left at its
  committed `v=24`; ignore version mismatches in older doc notes. (Still bump only if
  you specifically need to bust a *deployed* cache.)
- **Settings screen redesigned + FOV/sensitivity controls.** Settings now use inline
  rows (Android-game style: label left, control right) via `.settings-list`/
  `.setting-row` (css). **Mouse Sensitivity** is now a range slider and there's a new
  **Camera FOV** slider (45–90), both with a live value readout and **live apply**
  while dragging (sensitivity is read live from `GAME_SETTINGS`; FOV applies through
  `Level.setFov`). New setting `GAME_SETTINGS.cameraFov` (default 60); saved settings
  are merged over defaults so old localStorage blobs gain new keys.
  (`globals.js`, `index.html`, `css/style.css`, `js/app.js`, `Level.setFov`.)
- **Per-role character models.** Seekers now render as `hunter.glb`, Hiders as
  `player.glb` (previously both used `player.glb`). `Level.loadModels` loads both GLBs
  through a new `Level.buildRig(gltf, path)` helper into `Level.rigs.player` /
  `Level.rigs.hunter` (each = `{scene, animations, clips}`); `Level.rigForRole(role)`
  picks the rig (Seeker → hunter, else player, with cross-fallback). `makeCharacterMesh`,
  `createPlayerMesh`, and the render self-heal use the rig instead of the old
  `Level.playerGLB`/`Level.playerClips` (both removed). See ANIMATION_SYSTEM.md.
- **Player shadows.** Enabled `renderer.shadowMap` (PCFSoft); `dirLight` casts shadows
  (2048² map, ±60 ortho frustum, near 0.5 / far 120, bias −0.0005); ground
  `receiveShadow = true`; character clone meshes `castShadow = true` (set in `buildRig`
  on the source + on each clone in `makeCharacterMesh`).
- **Camera FOV default 75° → 60°.** Fixes the perspective stretch toward the screen
  edges while orbiting (Unity third-person default). Now sourced from
  `GAME_SETTINGS.cameraFov` in `Level.init` and adjustable in Settings (above).
  *Note: lower FOV slightly enlarges the on-screen character; revisit CAM_BACK if it
  reads too close.*
- **Fixed: encoding corruption.** A previous PowerShell `Set-Content -Encoding utf8`
  version-bump re-read UTF-8 as Windows-1252 and mojibaked `index.html`/`registry.js`
  (em-dashes, rotate-overlay emoji). Restored from git. **Never edit text files with
  PowerShell `Set-Content`/`Out-File` — use the Edit/Write tools (they preserve
  UTF-8, no BOM).**

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
