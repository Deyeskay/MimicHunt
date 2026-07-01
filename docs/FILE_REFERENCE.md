# File Reference

Repo root layout (tracked files; `assets/models/*.glb` also tracked but omitted):

```
index.html            game page (loads all js/ in order; ?v= no longer bumped, hard-refresh)
editor.html           standalone level + prefab editor (separate page)
css/style.css         all game styles (HUD, menus, responsive, rotate overlay)
js/
  globals.js          shared state + tuning constants + Sound (WebAudio)
  prefabs.js          PrefabLibrary: per-type gameplay defaults + collider templates
  props.js            PropLevel: prop meshes, bounds, colliders, raycast, spawns, disguise meshes
  ui.js               UI: screens, HUD, lobby, modals, crosshair/combat HUD, hit-marker
  level.js            Level: Three scene, models+clips, animation, camera, render, projectiles
  mechanics.js        Mechanics: input, movement/physics, shooting, disguise, win check
  network.js          Network: PeerJS host/client, snapshots, events, host migration
  app.js              boot: DOM wiring, settings, startup sequence, animate()
  levels/
    registry.js       LEVELS[], registerLevel(), LEVEL_FILES[], loadLevelScripts()
    forest.js         registerLevel('Forest', [...props])  (default map = LEVELS[0])
    arena.js          registerLevel('Arena', [...props])
docs/                 this documentation
assets/models/        tree1/rock1/bush1/player.glb
```

## js/globals.js
All cross-file globals. Key items:
- `GAME_SETTINGS` (localStorage `hidehunt_settings`): hidingTime, huntingTime,
  mouseSensitivity, invertY, showMobileControls, playerName.
- `gameState = { phase, timer, players{} }`; `myId`, `isHost`, `connToHost`,
  `connections[]`, `peer`.
- Movement/camera: `localPos`, `localRotY`, `cameraYaw`, `cameraPitch`, `velocityY`,
  `isGrounded`, `GRAVITY=-0.015`, `JUMP_STRENGTH=0.35`, `CAMERA_MAX_LOOK_UP/DOWN`.
- Input: `keys`, `joyActive`, `touchVector`, `joyTouchId`, `lookTouchId`,
  `lastLookX/Y`.
- Combat: `MAG_SIZE=8`, `FIRE_INTERVAL_MS=250`, `RELOAD_MS=1500`, `HIDER_MAX_HP=12`,
  `SHOT_DAMAGE=1`, `SHOT_RANGE=60`, `HIT_SCORE=100`, `REVEAL_MS=2000`, `DISGUISE_LOCK_MS=5000`,
  `SHOOT_ANIM_MS=1200`; `ammo`, `reloading`, `lastShotAt`, `reloadUntil`.
- Net/migration: `NETWORK_SEND_RATE=20`, `HEARTBEAT_MS=1000`, `HOST_TIMEOUT_MS=3000`,
  `WATCHDOG_MS=500`, `CLIENT_TIMEOUT_MS=3000`, `migrating`, `sessionEnding`,
  `departedHostId`, `pendingRoomCode`, `rejoinExpected{}`, `codePeer`, intervals.
- `developer` (false) — dev collider gizmos (G key).
- `Sound` — all WebAudio-synthesized (no assets), lazy AudioContext: `pew()` (shot),
  `hurt()` (hider damage), `reload()`, `step(right, {volume, pan})` (footstep, via
  `_noiseBurst`; `volume`/`pan` used for distance-attenuated remote footsteps),
  `jump()`, `land()`, `click()` (UI button). Helpers: `_noiseBurst(dur, {…, out})`,
  `_spatialOut(pan)` (StereoPannerNode for positional sounds).
  Remote footsteps are emitted by `Level.tickRemoteFootstep` (`js/level.js`), tuned by
  `FOOTSTEP_*` consts (`js/globals.js`).
- Three refs: `scene`, `camera`, `renderer`, `playerMeshes{}`, `mapProps3D[]`,
  `modelLibrary{}`.

## js/prefabs.js — `PrefabLibrary` + `PREFAB_DEFAULT` + `PlayerCollider`
Per prop TYPE: `collision`, `climbable`, `hideSpot`, `canDisguise`, optional
`colliders` (compound template). `tree` has trunk+canopy colliders; rock/bush
climbable. `PlayerCollider = {radius, height}` is the local player's own collider
(absolute units; `height` = eye/center, full body = 2×) — read by `props.js` into
`PLAYER_COLLIDER_RADIUS` / `PLAYER_BASE_HEIGHT`. See PROP_SYSTEM.md.

## js/props.js — `PropLevel`
- `PLAYER_BASE_HEIGHT` (eye/center height) & `PLAYER_COLLIDER_RADIUS` — seeded from
  `PlayerCollider` in `prefabs.js` (editable via the prefab editor's **Player** tab).
  `WALL_COLOR`.
- `createPropMesh`, `createWallMesh`, `createDisguiseMesh`, `applyPropTransform`,
  `computeBounds`, `syncBoundsToData`.
- `getPrefab`, `resolveGameplay` (instance-wins-else-prefab), `enrichProp`,
  `resolveColliders` (shape + position/rotation/scale fractions → runtime pieces),
  `colliderGeometry` (piece → wireframe geometry, shared by all debug/preview outlines),
  `getColliders`, `hasCollision`, `isClimbable`, `canDisguiseAs`,
  `getPropCenter`, `getPropTop`.
- `raycastProps(ox,oy,oz,dx,dy,dz,maxRange)` — ray vs vertical-cylinder colliders →
  nearest block distance (shot occlusion).
- `getSpawnPositions`, `pickSpawn`, `exportProp` (slim, editor).

## js/ui.js — `UI`
- `showModal`, `updateStatus`, `transitionToGame/Lobby/Menu`, `renderLevelSelector`,
  `updateLobby` (names, role toggle, ready, warning, validation), `updateHUD`
  (role badge, timer, player-count, combat HUD ammo/score, health bar, crosshair +
  shoot/prop button toggles by role/phase), `hitMarker` (crosshair flash).

## js/level.js — `Level`
- `init` (renderer/scene/lights/fog/ground), `loadLevel`, `spawnProp`,
  `buildColliderGizmos`/`setDeveloper`.
- `loadModels` (props + `player.glb`; picks idle/walk/run/jump/shoot; `splitClip`
  into lower/upper layers), `splitClip`.
- `createPlayerMesh`, `makeCharacterMesh` (SkeletonUtils clone, foot ring, two
  animation layers), `updatePlayerMeshTransform`, `updateCharacterAnim`,
  `_crossfade`/`_fadeOutLayer`/`_playLayer`, `applyRevealBlink`.
- Shooting visuals: `getAimRay`, `spawnPulse`, `spawnProjectile`, `spawnImpact`,
  `updateProjectiles`.
- `render` — per-player mesh upkeep + animation + reveal blink + projectiles + dev
  gizmo + **over-the-shoulder camera** (`CAM_BACK/CAM_RIGHT/CAM_EYE`).

## js/mechanics.js — `Mechanics`
- `initInputs` (keydown/up, pointer-lock, mouse look, **mousedown=fire**, joystick
  by touch id, **right-half touch look**, mobile JUMP/PROP/SHOOT buttons).
- `handleJoystickTouch`, `findTouch`.
- `jump` (sets `velocityY`, `p.jumpAt`, `Network.sendJump()`).
- `fireShot`, `startReload`, `tickReload`.
- `applyDisguiseFromProp`, `clearDisguise`, `handleDisguiseSwap` (disguise lock),
  `resolveOverlap` (de-penetrate after disguise), `blockedAt` (compound-collider
  movement test).
- `handleLocalMovement` (WASD/joystick relative to camera, per-axis wall slide,
  **floor-model climbing**, aim-stance facing), `checkWinConditions`.

## js/network.js — `Network`
- Helpers: `generateCode`, `getSpawnForRole`, `createPlayer`, `broadcast`,
  `broadcastExcept`, `sendToHost`, `now`, `applyLocalTransform`.
- Snapshots: `buildSnapshot`, `pushSnapshot`, `sampleSnapshot`, `_lerpPlayers`,
  `_lerpAngle`, `INTERP_DELAY=100`.
- Disguise/combat: `sendDisguiseUpdate`, `sendShot`, `processShot` (host hit auth),
  `sendJump`.
- Level: `getLevelList`, `getLevelProps`, `selectLevel`.
- Lifecycle: `initHost`, `initClient`, `runHostLogic`, `acceptConnection`,
  `handleClientData`, `runClientLogic`, `wireClientHandlers`, `handleHostData`,
  `startHostLoops`, `startClientLoops`, `startGameBroadcast`, `finishMatch`,
  `setLocalRole`.
- Migration: `handleConnClose`, `checkHostAlone`, `sweepStaleClients`,
  `onHostConnectionClose`, `electSuccessor`, `becomeSuccessor`,
  `reconnectToSuccessor`, `returnToFreshLobby`, `mintCodePeer`, `cleanup`.

## js/app.js
Button handlers (host/join/leave/settings/lobby), `commitPlayerName`, `animate()`
render loop, settings load/persist, `refreshMobileControls`, startup chain.

## editor.html
Standalone tool (shares `prefabs.js`/`props.js`): place/transform props, gameplay
flags, spawns; collider gizmos; **prefab editor with live 3D preview**; export
levels (`registerLevel(...)` text) + prefabs.js text to localStorage. Loads
`prefabs.js`/`props.js` at a stale `?v=7` (TODO).
