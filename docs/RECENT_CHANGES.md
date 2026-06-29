# Recent Updates (Newest First)

Append new entries at the TOP. Dates are absolute (project tz). Cache `?v=` after
each round of asset changes is in parentheses where relevant.

## 2026-06-29

- **Remote players' footsteps — heard client-side, no new packets.** Previously
  `Sound.step()` only played for the local player. Now each client emits footsteps for
  the OTHER players too, derived entirely from their already-synced rendered motion —
  **zero added network traffic**. New `Level.tickRemoteFootstep(mesh, p, dt)`
  (`js/level.js`) is called for every remote player in the render loop (right after the
  interpolated transform is applied): it computes horizontal speed from the mesh's own
  position delta (its own EMA-smoothed `userData._foot*` state, independent of the
  animation mixer — so a **moving prop-disguised hider is heard** too), steps on the same
  ~330 ms cadence with start/stop hysteresis, and skips eliminated players.
  - **Distance + stereo direction.** Footstep volume falls off with distance from the
    local player (full within `FOOTSTEP_MIN_DIST`, silent past `FOOTSTEP_MAX_DIST`,
    squared falloff) and pans left/right toward the source via a `StereoPannerNode`
    (pan = source's offset along the listener's right vector, matching the movement
    convention). New tunables in `js/globals.js`: `FOOTSTEP_MAX_DIST` (40),
    `FOOTSTEP_MIN_DIST` (4), `FOOTSTEP_SPEED_ON/OFF` (1.5/0.5 u/s), `FOOTSTEP_INTERVAL_MS`
    (330).
  - **`Sound` made spatial-capable (backward compatible).** `Sound.step(right, {volume,
    pan})` now scales gain by `volume` and routes through a new `Sound._spatialOut(pan)`
    panner; `Sound._noiseBurst` gained an `out` option. Calling `Sound.step(right)` with
    no opts (the local player) is unchanged — full-volume mono.

- **Footstep / jump / landing / UI-click audio.** Extended the synthesized `Sound`
  object (`js/globals.js`) with four new theme-matched effects — no audio assets, all
  WebAudio (same approach as the existing `pew`/`hurt`/`reload`):
  - `Sound.step(right)` — a soft footstep scuff built from a band-limited white-noise
    burst (new `Sound._noiseBurst` helper); `right` alternates the filter cutoff for a
    walking gait. Emitted on a ~330 ms cadence while the local player is moving on the
    ground, driven from `Mechanics.handleLocalMovement` (`js/mechanics.js`) via
    `_lastStepAt` / `_stepFoot`. Timer resets when idle so the first step is instant.
  - `Sound.jump()` — a quick upward sine "whoomp", played in `Mechanics.jump`.
  - `Sound.land()` — a low tonal thud + noise transient, played in
    `handleLocalMovement` on the airborne→grounded transition (guarded by downward
    speed so standing still never triggers it).
  - `Sound.click()` — a crisp sci-fi UI blip. Wired via a single capture-phase
    delegated `click` listener on `document` (`Mechanics.initInputs`) that fires for
    any `<button>` except the in-game `.action-btn` pads (those keep their own audio).
    The first menu click also unlocks the AudioContext.

- **PUBG-style "Edit Layout" for the touch controls.** The HUD hamburger (☰ `btn-leave`)
  no longer exits directly — it opens a dropdown (`#game-menu`, `index.html`) with **Edit
  Layout** and **Exit Game**. Edit Layout (new `js/layout.js` → `LayoutEditor`) dims the
  scene, force-shows the joystick + jump/prop/shoot buttons, and lets the player drag each
  one anywhere via pointer events; a top toolbar (`#layout-editor`) offers Save / Cancel /
  Reset. Positions are stored in `GAME_SETTINGS.controlLayout` as per-control `{x,y}`
  viewport percentages (persisted with the rest of the settings) and restored at startup
  via `LayoutEditor.apply()` (`js/app.js`). A new `isEditingLayout` global (`js/globals.js`)
  makes the joystick / jump / shoot / disguise / camera-look touch handlers (`js/mechanics.js`)
  bail out while editing. New CSS for the dropdown, toolbar, and `body.layout-editing`
  drag affordances (`css/style.css`). Script `js/layout.js` loads after `js/ui.js`.
  - **Default positions baked in.** New `DEFAULT_CONTROL_LAYOUT` (`js/globals.js`) places
    joystick lower-left, JUMP upper-right, and PROP/SHOOT stacked lower-right (matching the
    mockup). `LayoutEditor.effective()` uses it whenever `controlLayout` is empty, so these
    are the positions shown in-game before any custom save, and the target **Reset** reverts to.

- **Role badge reads "YOU — HIDER/SEEKER".** Dropped the player-name prefix on the HUD role
  badge (`UI.updateHUD`, `js/ui.js`) — always shows `YOU — <ROLE>` (+ `(ELIMINATED)` when
  caught).

- **Clickable player roster.** The 👥 player-count pill (`#player-count-card`, now
  `.interactive`) opens a `#players-modal` listing each player's name (+ You/Host), role
  chip, and ALIVE/ELIMINATED status, with a close-X (and backdrop-click to dismiss). New
  `UI.showPlayerList()` / `UI.hidePlayerList()` (`js/ui.js`), modal markup (`index.html`,
  reusing `.player-list`/`.player-item`/`.role-tag`), handlers in `js/app.js`.

- **Disguise button polish.** Removed the `[F]` key hint (`.db-key` span) under the prop
  icon (`index.html`). The Reset state now shows `assets/icons/face.png` instead of the 🧍
  emoji (`UI.updateActionButtons` setBtn call, `js/ui.js`).

- **Timer pill centred along the top.** The hiding/hunting timer (`#timer-card`, new id)
  is now absolutely centred in the `.hud-header` (`position:relative` + `left:50%` translate)
  instead of sitting just right of the role badge. The role badge stays top-left and the
  icon cluster stays top-right. `index.html` + `css/style.css`.

- **Seeker ammo/score pill moved to bottom-center.** The combat HUD (`#combat-hud`,
  🔫 ammo · ⭐ score) left the top header and now renders as a `.bottom-center-hud` pill in
  the same spot the hider's health bar uses — consistent per-role bottom HUD. The
  `RELOADING…` pill (`#reload-indicator`) stacks just above it (`bottom: 74px` desktop /
  `56px` mobile) so the two don't overlap. `index.html` + `css/style.css`; no JS change
  (`UI.updateHUD` still toggles/fills it).

- **Shoot button sized to match the disguise/prop button** (128px desktop / 100px mobile,
  was the smaller 70px/60px `.action-btn`) so the two role-slot buttons line up — they share
  the same default layout spot. Bullet icon scaled up to suit (`#btn-action-shoot`,
  `css/style.css`).

- **Mobile action buttons now use PNG artwork instead of emoji.** The disguise/switch button
  shows `assets/icons/refresh.png` (swap) over the prop icon (`tree.png` / `bush.png` /
  `rock.png`) with the prop name + `[F]`; JUMP uses `jump.png` and SHOOT uses `bullet.png`
  (`index.html`). `UI.propIcon()` (`js/ui.js`) now returns icon paths, and a new `setIcon()`
  helper in `updateActionButtons` renders a `.png` value as an `<img class="db-img">` while
  falling back to emoji for states with no artwork (locked 🔒/⏳, reset 🧍, no-prop ❓). New
  CSS sizes `.db-img` and `.action-btn.icon-btn .btn-icon-img` for desktop and mobile
  (`css/style.css`).

- **Lobby title + status restyled.** Lobby `ROOM CODE:` label is now yellow with the code in
  larger bold white, via a new `UI.setLobbyCode(code)` helper (`js/ui.js`) used by all five
  call sites in `js/network.js` (was duplicated `lobby-title.innerText`). The connect
  `status-msg` (`index.html`) changed from blue to white.

- **Foot rings stay vivid on Medium/High.** Same ACES-desaturation issue as the walls: the
  red Seeker / green Hider foot rings (`MeshBasicMaterial` in `spawnPlayer`, `js/level.js`)
  washed toward white on the colour-managed tiers. Added `toneMapped: false` to the ring
  material so the role colours read bright on every tier. No-op on Low.

- **Walls stay vivid on Medium/High (opt out of tone mapping).** The rainbow wall stripes
  (`wall.png` on a Lambert material) looked washed-out on the colour-managed tiers because
  ACES Filmic tone mapping rolls bright saturated primaries toward white. Set
  `mat.toneMapped = false` in `createWallMesh` (`js/props.js`) so wall materials bypass ACES
  and render raw/vivid like Low on every tier. Per-material — grass/props/characters still
  tone-map normally. No-op on Low. See [RENDERING.md](RENDERING.md).

- **Low-tier grass darkened to match foliage.** Low's `grassTint` was `[1.05,1.25,0.85]`,
  a green boost that made the ground read bright/lurid lime vs the bushes' natural green.
  Lowered to `[0.75,0.85,0.6]` in `js/level.js` (`Level.QUALITY.low`) so the ground reads as
  a darker forest green closer to the GLB bush/tree foliage. Ground-only change (walls, props,
  Medium/High untouched). Tune the multiplier if it needs to go lighter/darker.

- **High-tier visual polish (IBL + contact shadows + crisper fog + tuned bloom).** Follow-up to
  the graphics overhaul — High looked flat. In `js/level.js`:
  - *Image-based lighting* (`buildEnvironment`): `sky.png` → PMREM → `scene.environment` on
    **High only**, so GLB props/characters (MeshStandard) get soft sky-lit shading instead of
    flat. `refreshTextures(..., env)` drives `envMapIntensity` (1 High / 0 otherwise).
  - *Contact shadows* (all tiers): props (`spawnProp`) + characters now **receive** shadows,
    not just cast — they no longer look like they float. High softens edges (`shadow.radius 4`).
  - *Per-tier fog* (`scene.fog.far`): 180 on High (crisper) vs 100 on Low/Medium.
  - *Bloom* retuned for High (strength 0.6 / threshold 0.7, was 0.5 / 0.85) so highlights glow.
  - Medium/Low are unchanged. Honest note: low-poly models remain the ceiling vs the reference.
    See [RENDERING.md](RENDERING.md).
- **Graphics quality setting + lighting/grass/sky overhaul.** New `GAME_SETTINGS.graphicsQuality`
  (`low`/`medium`/`high`, default **medium**) via a Graphics dropdown on the Settings screen,
  applied live and at `Level.init`. Fixes the washed-out look:
  - *Colour management* (Medium/High): `sRGBEncoding` output + **ACES** tone mapping, colour-map
    sRGB encoding + max anisotropy. Highlights stop clipping so grass keeps detail.
  - *Lights rebalanced* (Medium/High): low flat ambient (0.30) + strong sky/ground **hemisphere
    fill** + warmer/stronger sun → contrast while the player stays lit (the old fix of just
    dimming made the player dark). Light refs kept on `Level` for live re-tuning.
  - *Grass*: sRGB + anisotropy (sharper, less muddy); high-DPI via `pixelRatio ≤ 2`.
  - *Sky*: **cloud skydome** (`buildSkydome`, reuses `assets/textures/background.png`) on
    Medium/High, recentred on the camera each frame; flat blue on Low.
  - *High* adds **bloom** (`EffectComposer`/`UnrealBloomPass`; example scripts in `index.html`).
    Render branches to the composer when active; `resize` syncs it.
  - Core: `Level.QUALITY` + `Level.setGraphicsQuality`/`refreshTextures` (`js/level.js`); wiring in
    `js/app.js`/`js/globals.js`; `.setting-select` CSS. Low = the original look. See
    [RENDERING.md](RENDERING.md).
- **HUD/menu visual pass (premium look).** Four UI changes (markup `index.html`, styles
  `css/style.css`, logic `js/ui.js`/`js/app.js`):
  - *In-game top bar* — the right side is now an icon cluster (`.hud-right`): `👥 N`,
    thin divider, fullscreen icon, divider, **hamburger ☰** that replaces the old
    "Exit Match" text button (same `UI.showConfirm` exit action; `#btn-leave` id kept).
    No pills on the right; role pill border is tinted by role.
  - *Disguise/switch button* — redesigned as a circular `.disguise-btn` with a glowing
    ring + stacked 🔄 / prop-emoji / label / `[F]`. Ring colour = state (green ready,
    blue RESET when disguised, red locked during cooldown, grey when not near a prop).
    Prop emoji via new `UI.propIcon`.
  - *Menu settings* — a chunky gear **corner button on the menu card** (`#btn-settings
    .gear-corner`), mirroring the settings card's corner button; fullscreen stays a
    floating top-right icon. Fullscreen toggle keys off `.fs-toggle` (not `.fs-btn`) so the
    gear isn't turned into a fullscreen button. In the settings screen the corner ✕ is now
    a **← back** button (`#btn-back-menu`) and the redundant bottom BACK button is removed
    (action row = SAVE only).
  - *Settings hunting time* — slider is now **minutes (5–20)**; `huntingTime` still stored
    in seconds (×60 save / ÷60 load + clamp, normalising legacy saves). Default 300s.
- **Client HUD now refreshes at 60 FPS (bug fix).** On a client the HUD was only updated
  when a snapshot arrived (20 Hz), so the disguise button's near/away state — and the new
  cooldown countdown — lagged behind the client's 60 FPS predicted movement. Added
  `UI.updateHUD()` to the client prediction loop (`js/network.js`), matching the host loop.
- **Disguise reach tightened (bug fix).** You could disguise from far away — the reach in
  `findNearestDisguiseProp` (`js/mechanics.js`) was `prop.radius * 2 + 2` (≈ radius+2
  *beyond* the surface, several units for wide props). Now `prop.radius + 2` (surface +
  player radius 1 + ~1 grace), so you must stand next to the prop. See [GAMEPLAY.md](GAMEPLAY.md).
- **Disguise-cooldown indicator (hider).** After a hider is hit, disguising is locked for
  `DISGUISE_LOCK_MS` (5s) — previously invisible to the player. Added a **top-center alert**
  `#disguise-cd` (red pill "🥸 DISGUISE LOCKED · N.Ns" + depleting bar) shown only for a
  living hider in-game while `disguiseLockUntil > Network.now()`, driven each `updateHUD`
  tick. The mobile **PROP** button also mirrors the lock (shows "🔒 N.Ns", disabled).
  Markup in `index.html`, styles in `css/style.css`, logic in `UI.updateHUD` (`js/ui.js`).
  See [UI_FLOW.md](UI_FLOW.md).
- **Camera: vertical orbit + Cinemachine-style collision.** Two related fixes to the
  third-person rig in `Level.render` (`js/level.js`):
  - *Vertical orbit (framing fix).* The camera used to sit at a **fixed height** and only
    rotate its look with pitch, so looking down made the camera stare at the ground and
    the player slid off the top of the screen. The boom now points *opposite the look
    direction* `(dX,dY,dZ)`, so it **orbits up/down with pitch** — looking down lifts the
    camera above-behind and keeps the player framed; looking up lowers it. At `pitch = 0`
    it's identical to the old over-the-shoulder view.
  - *Collision (no clipping through walls).* Before positioning the camera, a **3D** ray
    is cast from the head pivot along the boom via the existing `PropLevel.raycastProps`
    (covers all collidable props — walls, trees, rocks). If a collider is closer than the
    boom, it's clamped to `hit - CAM_CLEAR` and the whole offset scaled toward the pivot,
    so the camera "slides" along walls/props as you rotate. Feel = **snap in, glide out**:
    pull-in is instant (no clipping on fast turns), extend eases by `CAM_EXTEND`; smoothed
    distance persists as `Level._camDist`. Tunables `CAM_CLEAR=0.4`, `CAM_MIN=1.0`,
    `CAM_EXTEND=0.12`. Reads only static `mapProps3D`, so it won't pull toward — and
    reveal — disguised hiders. Pitch range is in `js/globals.js` (`CAMERA_MAX_LOOK_UP`
    `+70°` = look down; lower it to cap a steep top-down). See
    [CAMERA_AND_CONTROLS.md](CAMERA_AND_CONTROLS.md).
- **Google Analytics (GA4) added.** Standard `gtag.js` snippet in `index.html` `<head>`
  for the GA4 property **huntnhide** (Measurement ID `G-BNV1CHY5CV`, web data stream
  → `https://deyeskay.github.io/MimicHunt/`). Enhanced measurement is on (page views,
  scrolls, outbound clicks, etc.). Note: data only flows from a secure context (the
  live GitHub Pages URL or `localhost`), and GA can take up to 48h to show first data.
- **PWA + Screen Wake Lock.** The game is now an installable, offline-capable PWA and
  keeps the phone awake during a match.
  - *Wake Lock* (`WakeLock` in `js/app.js`): `navigator.wakeLock.request('screen')`
    acquired on `UI.transitionToGame` and released on `transitionToLobby`/`transitionToMenu`;
    re-acquired on `visibilitychange` (the OS drops the lock when the tab backgrounds).
    Fixes phones dimming/auto-locking mid-game — fullscreen alone does NOT hold the screen
    on. Needs a secure context (https/localhost); LAN testing over plain http won't get it.
  - *PWA*: `manifest.json` (fullscreen, landscape, theme `#15131c`, SVG icon at
    `assets/icons/icon.svg` + optional PNG 192/512 slots), `<link rel=manifest>` + Apple
    meta tags in `index.html`, and `sw.js` registered from `js/app.js` (secure context only).
  - *Service worker is NETWORK-FIRST on purpose* — the no-build hard-refresh workflow would
    break under a cache-first SW. It only falls back to cache offline; hard-refresh
    (Ctrl+Shift+R) bypasses the SW entirely. To wipe it during dev: DevTools → Application →
    Service Workers → Unregister.
  - *Icons*: the SVG covers Chrome/Android install; for crisp iOS home-screen icons drop
    `icon-192.png` / `icon-512.png` into `assets/icons/` (already listed in the manifest).
- **Dev mode: disguised-hider colliders now drawn (orange).** `buildColliderGizmos`
  only outlines static `mapProps3D` props (built once), so disguised hiders — which are
  dynamic pseudo-props rebuilt every tick by `Mechanics.getDynamicProps()` — had no
  collider gizmo even though everyone collides with them. Added
  `Level.updateDynamicColliderGizmos()`, called each render frame, drawing an **orange**
  outline per dynamic-prop piece using the exact `PropLevel.getColliders(prop)` collision
  geometry (yellow = static props, cyan = your own collider, orange = disguised hiders).
  level.js.
- **Client fix: disguised-hider colliders tracked the spawn point, not the player.**
  `Mechanics.getDynamicProps()` built each disguised hider's pseudo-prop collider from
  `gameState.players[id].x/z`. On a **client** those fields are only the remote player's
  **spawn point** — the `snapshot` handler buffers transforms and never writes them back
  to `gameState` (meshes render from the interpolated buffer instead). So on a client both
  the collision *and* the dev gizmo for a disguised hider sat at spawn, far from where the
  hider actually appeared (the host, with authoritative positions, looked correct). Fixed
  by sampling the same interpolated snapshot (`Network.sampleSnapshot(now − INTERP_DELAY)`)
  the renderer uses; falls back to `gameState` x/z on the host (empty buffer). This is the
  real cause of the earlier "client hider collides with disguised hiders at an offset"
  (not the player radius). mechanics.js.
- **Editor: Materials reset icon.** A ↺ icon (right of the inspector's "Materials"
  heading, next to 💾) restores every material of the selected object to its pristine
  as-loaded values (`_snapshotMaterial` snapshot: color/opacity/emission/metallic/
  roughness/map). Texture disposal now spares the original map (`_disposeIfNotOrig`) so
  reset can put it back. Both icons show only when the materials are dirty. editor.html only.
- **Editor: hierarchy search/filter.** A `#hierarchy-search` box filters the list by
  name (case-insensitive); `refreshHierarchy` renders matches into `visibleHierarchy`,
  and **Ctrl/Cmd-toggle, Shift-range, and arrow nav operate over the filtered list**.
  Two fixes made shift-range reliable: the window placement `mousedown` now ignores
  clicks inside `#right-panel` (it was raycasting the scene and corrupting the range
  anchor), and `.hierarchy-item` is `user-select:none` (shift-click selected text
  before). Keydown shortcuts (W/E/R/Q/F/Delete/nudge) are suppressed while a text
  field is focused. editor.html only.
- **Disguised hiders are solid (collide + standable).** Players never collided with
  each other, so seekers walked through disguised hiders. Now a disguised hider acts as
  a **dynamic pseudo-prop** that mimics the prop it's disguised as: `Mechanics.getDynamicProps()`
  builds prop-like colliders (via `PropLevel.resolveColliders`) from each disguised
  player's `disguiseType`/`propRadius`/`propHeight`/`propRotation` (excluding self +
  caught), refreshed once per movement tick into `this._dynamicProps`. Movement
  (`blockedAt` → new `_propBlocks` helper) and the climb floor model (new `_climbFloor`
  helper) now test level props **and** these dynamic props — so seekers are blocked by a
  disguised hider and can jump on / stand on it exactly like the real prop. Client-side
  movement only (positions already replicate); no netcode change.
- **Floating name tags (through walls, role-colored).** A name label hovers above each
  player's head, drawn through walls (`depthTest:false`, `renderOrder 1000`) at a
  constant on-screen size (`sizeAttenuation:false`). Visibility (never your own tag,
  in-game only): **Seeker tags are RED and seen by everyone** (hiders + other seekers);
  **Hider tags are GREEN and seen only by other hiders** (teammate awareness — the seeker
  still has to find hiders). `THREE.Sprite` + `CanvasTexture` (`Level.makeNameSprite(text,
  color)`), managed per-frame by `Level.applyNameLabel(mesh,p,id)` (called after
  `applyRevealBlink` in the render loop) which creates/recolors/renames/removes it.
  Client-render only — no netcode.
- **Disguised players use the prop's compound collider.** When a hider disguises as a
  prop, it now adopts that prop's compound colliders (e.g. tree = slim trunk + wide
  canopy) instead of one fat cylinder: `Mechanics.applyDisguiseFromProp` computes
  `localDisguise.colliders` (via `PropLevel.resolveColliders`) + a `groundRadius`
  (the ground-level piece — trunk for a tree), `myColliderRadius()` drives movement
  collision off it, and the dev player gizmo (`Level.render`) draws the full compound
  shape. Rock/bush (single cylinder) are unchanged.
- **Seeker hiding countdown.** The seeker's "YOU ARE BLINDED" overlay now shows a big
  live countdown ("Hunt begins in {timer}s") from `gameState.timer`, updated in
  `UI.updateHUD` (`#blind-countdown`).
- **Smarter disguise button.** The hider's PROP button is now context-aware
  (`UI.updateHUD` + `Mechanics.findNearestDisguiseProp`/`isDisguised`): `🔄` disabled
  when not near a prop, `🔄 {PROPNAME}` (enabled) when near a disguisable prop, and
  `🔄 Reset` when already disguised. `handleDisguiseSwap` now **resets to default if
  disguised**, else disguises as the nearest prop (no-op if none). Reset returns the
  hider to its own form (button goes back to disabled `🔄` unless still near a prop).

## 2026-06-28 (later)

- **Event toasts.** A new bottom-center toast (above the health/reload row,
  `#toast-container` + `UI.toast`) announces when a player **left** (`👋`), was
  **eliminated** (`💀`, with killer name), or **disconnected/crashed** (`⚠️`). Host
  detects the event and calls `Network.notify(text)` → shows locally + broadcasts a
  new `notice` message; clients render it via `case 'notice'`. Toasts auto-dismiss
  (~4s), cap at 4, and a graceful `leave` sets `conn._dropped` to avoid a duplicate
  disconnect toast. (Shown in-game only — the lobby already lists players.)
- **Fullscreen button (CrazyGames-style).** Explicit ⛶ toggle (`toggleFullscreen` in
  `app.js`, `.fs-btn`) — a floating button on the main menu (`#btn-fullscreen-menu`)
  and an icon in the in-game HUD header (`#btn-fullscreen`); icon flips to 🗗 when
  fullscreen. Collapses the mobile browser address bar. Body uses `100dvh`, viewport
  meta gains `viewport-fit=cover`, and the canvas refits on `fullscreenchange` /
  `visualViewport` resize / `orientationchange`.
- **Menu/settings visual redesign (casual "wooden sign" theme).** Restyled the
  menu, settings, lobby and modals to match the `thumbnail.png` art style: a full
  scene background image (`assets/textures/background.png`, with a sky→grass gradient
  fallback), chunky beveled **wood-plank panels** with corner bolts,
  **candy-gradient buttons** with a 3D press (green primary / blue secondary / red
  close+exit), bold **cream outlined rounded type** (Google "Fredoka" font), a 3D
  **HIDE & HUNT** title (white/green/orange), recessed wood inputs, and settings rows
  as recessed slots with **colored icon badges** + themed sliders + value chips.
  Settings now uses sliders for Hiding/Hunting time too (with value chips, synced in
  `app.js`), a red ✕ close, and side-by-side SAVE/BACK. Candy button styling is
  **scoped to `.menu-card`/`.modal-card`** (excluding `.role-btn`) so the in-game HUD,
  mobile controls and lobby role-toggle keep their existing look. All in `index.html`
  + `css/style.css` (+ small `app.js` chip sync); no gameplay/JS-logic changes.
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
