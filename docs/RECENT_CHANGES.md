# Recent Updates (Newest First)

Append new entries at the TOP. Dates are absolute (project tz). Cache `?v=` after
each round of asset changes is in parentheses where relevant.

## 2026-06-30

- **Fix: can't stand/walk on box props — sink in & get stuck on rocks/trees.** File:
  `js/mechanics.js` (`_climbFloor`, box branch). Two regressions from the same-day OBB
  rework, both fixed by making the box branch behave like the (working) cylinder branch:
  1. **Corner dead zone.** The box *climb* test cast 5 downward rays in a cardinal "plus"
     (centre + `±myRadius` on X/Z), but the box *collision* test
     (`_propBlocks`→`pointBoxDist2`) blocks across the footprint expanded by `myRadius` in
     EVERY direction (corners included). A diagonal approach was *blocked* yet found *no
     floor* → you fell into the box. Replaced the 5-ray plus with the SAME footprint test
     collision uses: `pointBoxDist2(localPos.x, c.yMax, localPos.z, c) < myRadius²`.
  2. **Sink-in & stuck.** The climb stood the player on the box collider's own top, but a
     box's collision band ceiling is its CONSERVATIVE world-AABB top `c.yMax`, which sits
     a hair ABOVE the actual top for any micro-tilted box (rocks/trees all carry tiny
     tilts). So the player's feet landed *inside* the band (`pBottom < c.yMax`) → blocked
     in EVERY direction (stuck), while also sinking up to ~0.43 below the visual top. Now
     the box branch stands the player at the prop's MESH top (`getPropTop`), exactly like
     the cylinder branch — clearing `c.yMax` with margin (no stuck) and sitting flush on
     the visual surface (no sink). Cylinders (bush) never had either bug because they
     already use the footprint test + `getPropTop`.

  Verified in-browser against the live 128-prop level: the old box code left **23/36 rocks
  and 9/10 trees fully stuck** (blocked in all 4 directions on top) and up to 0.43 sink;
  the fix gives **0 stuck, 0 sink** across all rocks/trees/bushes, you can still jump on
  (only ~0.06 of free-coast needed) and walking off the edge still drops you. *Caveat:*
  tilted slabs now stand at their flat AABB top rather than the sloped surface — the same-
  day "stand on the tilted top" nicety is deferred until the collision band ceiling can be
  evaluated per-point. (An earlier mis-diagnosis targeting the cylinder branch, and an
  intermediate `rayBox`-height version, were both discarded — the bush was never broken.)

- **Fix: editor gizmo handles now actually re-orient in World space.** File:
  `editor.html` (`positionPivot`, `setGizmoSpace`). The 🌐 Gizmo Local/World toggle
  flipped the drag *math* to world axes but the **visual handles stayed object-aligned**
  — a real **three.js r128 bug**: `TransformControlsGizmo.updateMatrixWorld` hard-forces
  `space='local'` for translate/rotate (its ternary is inverted vs the drag-plane math),
  so the arrows/rings always render in the object's local frame. Worked around it in the
  editor's own code: the gizmo attaches to `transformPivot`, whose orientation is the
  gizmo's "local" frame, so `positionPivot()` now keeps the **pivot identity whenever
  space is World** (was: always the object's quaternion for single selection). That makes
  the buggy local-forced handles render world-aligned, matching the (already-correct)
  world-space drag. `setGizmoSpace()` also re-runs `positionPivot()` on toggle so the
  handles snap immediately (guarded against running mid-drag). Drag results are unchanged
  — world translate/rotate apply the same delta regardless of the pivot's start rotation.

- **Colliders now follow rotation on ALL three axes (full 3D oriented boxes).**
  Files: `js/props.js`, `js/mechanics.js`, `js/level.js`, `editor.html`. Previously the
  whole collision system was **2.5D** — every collider was a footprint extruded
  vertically and could only spin about the **Y axis**, so a wall/platform tilted on X/Z
  (in the editor) kept an upright, axis-aligned collider that didn't match the mesh. Box
  colliders are now true **oriented boxes (OBBs)**: a piece carries its centre
  `(x,y,z)`, half-extents `(hx,hy,hz)` and three unit world axes `ax/ay/az` (replacing
  the old `halfX/halfZ/rot`), rebuilt from the prop's un-rotated AABB + rotation
  quaternion. This flows everywhere:
  - **`computeBounds`** records the un-rotated AABB (`bounds.local`), rotation `pivot`,
    and `quat`; **`resolveColliders`** rebuilds each box in that frame via `_obbPiece`.
  - **Shots + camera collision** (`raycastProps` → new shared `rayBox` ray-vs-OBB test).
  - **Player movement**: `blockedAt`'s box branch samples the player's body column
    against the OBB (`pointBoxDist2`); `_climbFloor` ray-casts down through the box so you
    **stand on the actual tilted top** (a sloped surface), not the flat AABB ceiling.
  - **All debug/editor outlines** orient via `colliderCenter` / `colliderQuat`.
  - The editor passes the mesh's **full** rotation to the resolver.
  Upright props (the common case) are **unchanged** — the OBB math reduces exactly to the
  old axis-aligned tests when the axes are world axes. **Caveat:** cylinder/sphere pieces
  still stay vertical (tilting a tree keeps its trunk cylinder upright); only box pieces
  tilt. Needs in-browser validation (host + client) per the manual-test workflow.

- **Editor: gizmo Local/World space toggle button.** File: `editor.html`. Added a
  **🌐 Gizmo: Local/World** button (toolbar → Object) that toggles `TransformControls`
  space, with a live label. Routes through one `setGizmoSpace()` so it stays in sync with
  the existing **Q** shortcut.

- **Fix: shots pass through horizontal walls.** File: `js/props.js`
  (`PropLevel.raycastProps`). The box-collider branch only ran a 2D slab test in
  the **XZ** plane and then validated the wall's vertical extent at a *single
  point* — the spot where the ray entered the XZ footprint. That works for an
  **upright** wall (you enter through its thin side face inside its height band)
  but fails for a **horizontal** wall/platform (thin in Y, wide in X/Z): the ray
  truly pierces the top/bottom face, yet the XZ-entry height lands outside the
  thin `[yMin,yMax]` band and the hit was rejected — so bolts passed straight
  through. Added a proper **Y slab** to the test (world-aligned, since box
  colliders rotate only about the vertical axis), making it a full 3D box
  intersection; dropped the now-redundant single-point band check. Seekers can
  now hit horizontal surfaces at any pitch. *(Superseded the same day by the
  full-3D OBB rework above — the box branch is now the shared `rayBox` test, which
  subsumes this Y-slab fix.)*

- **Invisibility "ghost" look for hiders.** File: `js/level.js`. Previously an invisible
  hider was hidden from seekers but rendered **fully normal** to itself and other hiders —
  no visual cue you were invisible. Now an active invis window shows a **ghost** to
  self + other hiders: the real character/prop rendered **faintly translucent** (per-
  instance material clones at 0.4 alpha, `depthWrite:false`) wrapped in a glowing **white
  fresnel rim** (a BackSide, normal-pushed glow shell per body child, reusing the scan
  silhouette's `_silVert` + `_glowFrag`; skinned children bind to the **live skeleton** so
  the rim deforms with the animation). Seekers still see **nothing** (the mesh stays
  `visible=false`). New `Level.applyInvisGhost` (called per mesh each frame, replacing the
  old one-line visible gate) + helpers `_setInvisGhost` / `_buildGhostRim` / `_ghostMat`.
  - **Shared-material safety:** character/prop materials are shared across meshes, so the
    body translucency **clones** each material per-instance (never mutates the shared
    original) and restores + disposes the clone when invis ends. Rim shells reuse the
    **shared geometry buffers** (disposed never; only our ShaderMaterials are owned) and
    are parented as **siblings** of each source child so they inherit its exact transform.
  - The foot ring + name tag are excluded from the ghost (stay fully visible).
  - **Tunable:** the look is centralized in `Level._ghostTune` (body alpha, rim
    colour/base/pulse/speed/push/power); `Level.applyGhostTune()` pushes live edits into
    active ghosts. The dev **Shaders** dropdown (`testing/shader-tuner.js`, a generic
    registry that superseded the single-purpose silhouette tuner) exposes it alongside the
    Scan silhouette for slider tuning + a paste-ready snippet.

- **Dev harness: six "live game logic" ability scenarios** (dev-only, `testing/` is
  git-ignored — **no shipped game code changed**). The Dev Harness scenario dropdown
  gained an **"Abilities (live game logic)"** group that boots the game as a solo host
  mid-HUNT and runs the **real** host-authoritative paths (`startHostLoops`, `processShot`,
  `handleActivate`, `tickBeams`): **Scan** (≤20m silhouette vs. far none), **One-shot
  Kill** (playable; hit → 0 HP), **Jammer** (persistent DISGUISE LOCKED, disguise blocked),
  **Full-Health** (E heals 2→5, pill consumed), **Disguise Shield** (shot 1 absorbed, shot
  2 breaks disguise −1 HP, with Replay/Reset), and **Beam → invisible** (play the hider,
  walk into the gold beam → `grantPower` grants 5s `invisUntil` + a held power; verify via
  the 👻 countdown in the power pill, since a hider always sees its own mesh and invis only
  hides it from seekers). Each frames the camera on the relevant actor and shows a dev
  panel. **All six verified against the live
  logic — no core mechanics needed fixing.** Also added a re-injection **teardown**
  (`window.__devTeardown`) so re-staging no longer orphans the previous scenario's
  `requestAnimationFrame` loops. Details: `testing/README.md`.

- **Scan power: "listen-mode" see-through silhouette on hiders.** File: `js/level.js`.
  The Scan reveal was just a tiny red dot floating above each hider — easy to miss and it
  never highlighted the disguise itself. Replaced with a **Last-of-Us "listen mode"
  silhouette** (a *dark body cutout wrapped in a soft glowing rim*) painted on the
  hider's actual body/prop, drawn **through walls**, plus the head dot (recolored
  red→orange). New `Level.makeScanSilhouette(srcMesh)` builds a per-hider overlay into a
  dedicated `Level._silScene`; for each mesh in the model it adds **two shells** that
  reuse the source geometry buffers (so we dispose **materials only**, never the shared
  geometry):
  - **Glow** — `BackSide` shell pushed out along normals (`uPush`), fresnel-shaded
    (`1 − |N·V|` → bright rim, feathered falloff), `AdditiveBlending`, `depthWrite:false`.
    Drawn first.
  - **Fill** — `FrontSide` dark body at translucent alpha, `NormalBlending`, drawn on top
    so it darkens the interior and leaves the glow only at the edge.

  The look is centralized in a tunable `Level._silTune` config (fill/glow color + alpha,
  fresnel push/power, pulse amp/speed); `Level.applySilTune()` pushes edits into live
  overlays. **Shipped defaults (dev-tuned):** fill `0x4b3207` @ 0.71, glow `0xff8000` @
  0.35 base + 1.07 pulse (period 150), push 0.03, power 0.8 — a warm brown body with a
  soft broad orange halo. A dev-only runtime tuner (`testing/silhouette-tuner.js`, not
  shipped) edits `_silTune` live with sliders + a Save that emits the snippet; see
  `testing/README.md`.

  `Level.render()` draws `_silScene` in a **second pass after the main image with the
  depth buffer cleared** (`renderer.clearDepth()`, `autoClear=false`): the silhouette
  appears *through* walls/props yet still self-occludes internally. Each shell carries its
  source child's **world matrix** directly (the overlay group stays at identity);
  `render()` copies `o.matrixWorld` into each shell every frame — and **skinned** sources
  get a `SkinnedMesh` shell `.bind()`-ed to the **live skeleton/bindMatrix**, so an
  undisguised hider's silhouette follows the **real animated pose** (idle/walk/run), not a
  frozen T-pose. The two custom shaders (`_silVert`/`_glowFrag`/`_fillFrag`) use three's
  skinning chunks (`material.skinning=true` → `#define USE_SKINNING`).
  `updateScanMarkers` builds/pulses (rim-glow sonar shimmer)/cleans up the silhouettes via
  `_disposeSil`, rebuilding when a hider re-disguises (mesh swap). Range (20m) and 10s
  duration unchanged; trigger path (`grantPower`/`applyPowerGain` → `scanUntil`) was
  already working.
  - **Earlier solid-orange attempt (superseded):** first tried one flat-orange
    `MeshBasicMaterial` overlay (`depthTest:false`), then a light-fill + hard
    inverted-hull outline. Both were dropped in favor of the dark-body + soft-rim
    listen-mode look the user asked for (closer to the reference). Additive *orange*
    washed out to near-white against the level's bright candy walls — the **dark fill** is
    what makes the silhouette read cleanly on any background.
  - **Gotcha (NaN matrices):** the silhouette shells inherit transforms from the hider
    mesh; if the hider's transform is NaN (e.g. an `undefined` `rotY` →
    `rotation.set(0, undefined, 0)`, or a missing `propScale`) the whole subtree's
    `matrixWorld` is NaN and **nothing renders**. Surfaced while single-window
    screenshot-testing — the staging player records must set `rotY` + the prop fields.
  - **Gotcha (clone):** shells are built by walking `srcMesh`, NOT via `srcMesh.clone()`
    — `Object3D.copy()` deep-copies `userData` with `JSON.stringify`, which throws
    ("circular structure") on an animated character (its `userData.mixer` is circular) and
    would abort the seeker's render loop every frame.

- **Messaging overhaul + coin SFX + seeker-ability alerts + gated exit doors.** Files:
  `js/ui.js`, `index.html`, `css/style.css`, `js/globals.js`, `js/network.js`, `js/level.js`.
  - **Two message types.** `UI.toast(text, {duration})` now takes an optional duration
    (default 4.1s; the fade-out is re-keyed inline for longer toasts). New persistent
    **Objective pill** (`#objective-hud`, teal) anchored **top-left under the role card**
    (`#keys-hud` pushed to `top:88px` so they stack). `UI.objective(text)` /
    `UI.clearObjective()` drive a single replace-on-change slot; `UI.updateObjective()`
    (called each tick from `updateHUD`) computes it from local state by priority:
    exits-open → `🚪 EXITS OPEN`/`Deposit your key at an EXIT`; HUNTING pre-open →
    live `⏳ Exits unlock in M:SS` (carrier: `🔑 Key secured — …`); HUNTING w/o schedule →
    role goal; HIDING → `🫥 Hide…` / `⏳ Hunt begins…`.
  - **`notice` packets** gained optional `audience` (`all`/`hiders`/`seekers`) and `toastMs`;
    `Network.notify(text, opts)` honors them locally (host's own role) and on clients.
  - **Coin pickup SFX.** New `Sound.coin()` (WebAudio, Mario-like B5→E6 blip) plays for the
    local picker on key (`applyKeyGain`) and power (`applyPowerGain`) pickup.
  - **Seeker-ability alert to hiders.** When a seeker collects Scan/Jammer/Kill, the host
    broadcasts `⚠️ Seeker activated <X>!` to **hiders** (5s). The `keys dropped — grab them!`
    warning is now a 5s hider notice (shows on host too); a `👻 Invisible for 5s` pickup-grace
    toast was added for the local hider.
  - **Gated exit doors (#4).** Doors stay **hidden + non-depositable** until
    `EXIT_ACTIVATE_DELAY_MS` (60s) after the **last purple key beam that actually fires** in
    the hunt. Host computes `gameState.doorsActivateAt` at the HIDING→HUNTING transition and
    broadcasts a relative `doorsSchedule { activateInMs }`; clients convert to a local deadline
    (same convention as `shot`). `Level.buildDoors` builds doors `visible=false`; `updateDoors`
    reveals them at the deadline; `tickKeys` rejects deposits until then. **Caveat:** if the
    hunt is too short for any purple beam to drop (first at 180s; full set needs ≈12 min),
    doors never open and the key-win path is unavailable — set a long Hunting time.

- **Fix: elevated props (raised platforms / multi-level floors) vanished in-game.**
  `PropLevel.applyPropTransform` placed every static prop at `y = -prop.bottomY`
  (an old "drop the bottom onto the ground" convention), while the **editor** places
  props at their authored `prop.y`. Because the exported `bottomY` is the prop's
  *world-space* bottom (it already includes `y`), the two only agree for props
  resting on the ground — any elevated prop got sunk by `(y + bottomY)`, dropping the
  Forest center multi-level floor (`wall_114/122/124/125–130`, `rock_131–133`) 15–34
  units underground where it was invisible. Now positions props at `prop.y` to match
  the editor (WYSIWYG); `enrichProp` still recomputes `bottomY/topY`/colliders from
  the placed mesh, so collision stays consistent. File: `js/props.js`.

- **Keys & exit doors (Phase 2: PURPLE beam + hider key-win).** The second win path.
  Files: `globals.js`, `network.js`, `props.js`, `prefabs.js`, `level.js`, `ui.js`,
  `index.html`, `css/style.css`, `editor.html`, `js/levels/forest.js`.
  - **Purple key beams** reuse the whole beam infra (`kind:'purple'`): scheduled at
    `PURPLE_BEAM_TIMES = [180, 420, 660]` s into hunting (merged into the host
    `_beamSched`), audible `Sound.beam('purple')`, purple visual. **Hider-only** —
    `tickBeams` skips non-hiders for purple pickups (seekers gain nothing).
  - **Carry & deposit (team).** A purple pickup gives the hider a carried key
    (`grantKey` → `carriedKeys++`). `Network.tickKeys` (host) detects a carrier within
    `DOOR_RADIUS` of any **exit door** → deposits all carried into the team
    `gameState.submittedKeys`; reaching `KEYS_TO_WIN` (3) ends the match
    (`finishMatch` "Keys Secured! Hiders Win!").
  - **Dropped keys.** A carrier killed before depositing **drops** its keys
    (`dropCarriedKeys` in `processShot`) as a gold ground bundle any hider can recover
    (`tickKeys` pickup; `keyDrop`/`keyDropGone` events; `Level.spawnDroppedKey`).
  - **Exit doors** are a new non-colliding `door` marker (prefab + `PrefabLibrary`).
    The game reads door positions via `PropLevel.getDoorPositions` (props with
    `model:'door'` or an `exitDoor` flag) and renders a green goal **portal** with a
    through-wall "EXIT" label (`Level.buildDoors`/`updateDoors`). Placeable in the
    **editor** ("Exit Door" button → green ring marker; flag persists through
    place/duplicate/undo/save/load). 3 example doors seeded in `forest.js`.
  - **Net events** (host→client): `keyGain`, `keyDeposit`, `keyDrop`, `keyDropGone`.
    New player field `carriedKeys`; team `gameState.submittedKeys` (synced via
    `gameStart`). No new client→host input (host detects deposits/pickups from
    positions).
  - **HUD**: top-left team key pill (`#keys-hud`, `UI.updateKeysHUD`) shows
    `🔑 deposited/3` to everyone + the local hider's `🎒 carried`. The top-right
    **Next Drop** countdown now also counts purple beams (turns 🟣 when a key beam is next).

- **Airdrop beams & power-ups (Phase 1: GOLD beam).** A PUBG-style airdrop layer.
  Timed **gold beams of light** rise at random spawn points during HUNTING; walking
  through an *active* beam grants a power. Host-authoritative throughout (schedule,
  location, pickup detection, effects), mirroring the `shot` packet's "ms duration →
  local deadline" convention. Files: `globals.js`, `network.js`, `mechanics.js`,
  `ui.js`, `level.js`, `index.html`, `css/style.css`, `layout.js`.
  - **Schedule** (`Network.tickBeams`, host physics loop): anchored to HUNTING start
    (`gameState.huntStartT`). `GOLD_BEAM_TIMES = [120, 360, 600]` s into hunting; only
    times `< huntingTime` fire, so the host should raise Hunting time (≥10 min) to see
    them all. Each beam **arms 5s** (`BEAM_ARM_MS`, dimmer, no orb) → **activates**
    (walkable) → despawns if uncollected after `BEAM_LIFETIME_MS` (30s).
  - **Pickup** is detected host-side from synced positions (first player within
    `BEAM_RADIUS=3` wins). `grantPower` rolls a random power by role.
  - **Hider** pickup → auto-**invisible 5s** (`PICKUP_INVIS_MS`) + **holds one** random
    power to activate manually with **E / a new mobile power button**: ❤️ Full-health,
    👻 Invisible 10s, 🛡️ Disguise-shield (absorb 1 hit while disguised, no break/damage;
    consumed next hit).
  - **Seeker** pickup → power applied **instantly**: 📡 Scan (all hiders ≤20m shown
    through walls 10s, beats invis), 🚫 Jammer (undisguised hiders can't disguise 10s —
    reuses each hider's `disguiseLockUntil`, so the existing "DISGUISE LOCKED" pill
    shows it), 🎯 Kill (one-shot direct kill 10s).
  - **Combat** (`processShot`): invisible hiders are **untargetable**; a disguise-shield
    **fully negates** one hit (`shielded` flag on the `shot` packet); one-shot-kill sends
    HP straight to 0.
  - **Net events**: `beamSpawn` / `beamGone` / `powerGain` / `powerUse` (host→client) and
    `activatePower` (client→host). New player fields `heldPower`, `invisUntil`,
    `shieldArmed`, `scanUntil`, `killUntil` (jammer reuses `disguiseLockUntil`).
  - **Power HUD** (`UI.updatePowerHUD`): a compact **icon + small label** chip
    (`#power-pill`) sits **beside the bottom health bar** (hider) / **ammo pill** (seeker)
    — shows the held power (`[E]`) or an active effect's countdown. Plus the hider's
    circular mobile power button (`#btn-action-power`).
  - **Rendering** (`level.js`): gold/purple additive beam pillar + ground ring + bobbing
    orb (`spawnBeam`/`updateBeams`/`removeBeam`/`clearBeams`); per-viewer invisibility
    gate (hidden from seekers only; invisible hiders are also silent to seekers); seeker
    Scan blips (`updateScanMarkers`, through-wall sprites). New `Sound.beam(kind)` cue.
  - **Next-drop HUD pill** (`#next-drop`, top-right): a softly-blinking 🔔 + "Next Drop
    M:SS". Each peer derives the countdown locally as `elapsed = huntingTime − timer`
    against `GOLD_BEAM_TIMES` (`UI.updateNextDrop`). Uses the **host's** hunting length,
    now synced as `gameState.huntingTime` (set in `startGameBroadcast`, adopted by the
    `gameStart` `Object.assign`) — a client's own `GAME_SETTINGS.huntingTime` may differ,
    which otherwise made its countdown wrong. Goes brighter + blinks faster at ≤10s.
  - **Phase 2 (not yet built):** PURPLE key beam, keys, 3 doors, key-submission win.

- **In-game PLAYERS roster aligned into columns.** The 👥 roster modal
  (`#players-modal`) now lays each row out as tidy columns — name flexes, the role
  chip and ALIVE/ELIMINATED status get fixed widths so they line up vertically across
  rows; the card is a bit wider so long names ("p1 (You) (Host)") aren't truncated.
  CSS-only, scoped to `#players-modal` so the lobby's role toggle is untouched.

## 2026-06-29

- **Menu/lobby polish: Controls Reset, mandatory name, decongested lobby.**
  - **Controls panel** (☰ → 🎚) now has a **Reset** button beside **Done** (`index.html`
    `.btn-row`, handler in `js/app.js`) that restores look-sens / shoot-drag-sens / FOV /
    invert to their `GAME_SETTINGS` defaults (`0.002` / `0.003` / `60` / off), applies live,
    syncs the Settings screen inputs, and persists on close.
  - **Display name is now required** to Host or Join — `requireName()` (`js/app.js`) blocks
    both with an inline status message + red **shake** on the name field (`.input-error`
    in `css/style.css`); the error clears on the next keystroke.
  - **Lobby card decongested:** Leave Lobby + Start/Ready are now a single `.btn-row`
    (was stacked), player rows are tighter, and the list height was raised so **≥4 players
    show without scrolling** on both desktop (`max-height` 212px) and short landscape
    (152px, with compacted rows in the `@media (max-height:520px)` block).
  - **Lobby header row aligned:** "Map: X" and the "Waiting for all players…" subtitle now
    share one row (new `.lobby-meta` wrapper in `index.html`) — the map label is pinned to
    the left and the subtitle is centered in the card. `renderLevelSelector`
    (`js/ui.js`) writes the map name into `#lobby-map` (the carousel stays in `#lobby-level`).

- **Mobile fire button is now PUBG-style: hold-to-fire + slide-to-look, plus an
  in-game Controls panel.** The touch **shoot** button (`js/mechanics.js`) was a
  single tap = one shot; it now:
  - **Holds to fire** — `touchstart` starts a `setInterval` calling `fireShot()`
    (self-gated by `FIRE_INTERVAL_MS`, so it auto-paces to the fire rate); released
    on `touchend`/`touchcancel`.
  - **Slides to look** — dragging the *same* finger off the button orbits the camera
    using its own new `GAME_SETTINGS.shootDragSensitivity` (default `0.003`), tracked
    by `shootTouchId` so it coexists with the joystick + right-half look. Camera stays
    where dragged on release.
  - **Selected state** — the button gets a `.firing` glow (`css/style.css`) while held.
  - The right-half look handler now also skips touches starting on any `.action-btn`
    **or `.modal-overlay`** (not just `.interactive`), so it can't hijack the shoot drag
    — and so its `preventDefault()` no longer swallows a centered modal tap's synthesized
    `click` (this was why **GAME OVER "OK" sometimes didn't respond on mobile**).
  - **New ☰ → 🎚 Controls panel** (`#controls-panel` in `index.html`, wired in
    `js/app.js`): **Camera look sens.**, **Shoot drag sens.**, **Camera FOV**,
    **Invert camera**. Look-sens / FOV / invert mirror the same `GAME_SETTINGS` as the
    Settings screen (kept in sync both ways, applied live, persisted on close).

- **Player collider is now editable (prefab editor "Player" tab).** Added a `Player`
  pseudo-type to the Edit Prefabs type row that tunes the local player's own collider —
  **radius** and **height** (eye/center above feet; full body = 2×), in **absolute world
  units**. New `PlayerCollider = {radius, height}` config in `js/prefabs.js` (exported);
  `js/props.js` seeds `PLAYER_BASE_HEIGHT` + new `PLAYER_COLLIDER_RADIUS` from it (with
  literal fallbacks). `Mechanics.myColliderRadius` (`js/mechanics.js`) and the cyan
  player debug body (`js/level.js`) now read those constants instead of the old literals
  `1` / `3`. The editor persists player edits to its own `localStorage` key
  (`hnh_editor_player`), applies them live to `PropLevel`, includes `PlayerCollider` in
  the exported `prefabs.js`, and reverts it on **Reset**. The player preview shows the
  cyan player cylinder; the field labels support the same drag-to-scrub gesture.
  - **Note:** `height` also drives camera/eye level, spawn Y, and climbing (it *is*
    `PLAYER_BASE_HEIGHT`). A disguised hider still adopts its prop's collider, so this
    only affects the undisguised player (seekers / hider in player form).

- **Prefab colliders: per-piece shape + full transform (editor + format).** The
  "Edit Prefabs" → Colliders section replaced the lone **➕ Add piece** button with a
  **shape dropdown** (Cylinder / Square / Sphere) + Add, and each piece is now edited
  as a **transform** — `position {x,y,z}`, `rotation {y}`, `scale {x,y,z}` — instead of
  the old `radius / yMin / yMax / offX / offZ` fields. Values stay **fractions of the
  placed prop's bounds** (x/z·R, y·H), so colliders still auto-scale per instance.
  - **Unity-style label scrubbing.** Click+drag the axis labels (`x/y/z`) to push one
    value, or the group label (POSITION/ROTATION/SCALE) to drag all axes together;
    Shift = fine. Each move updates the data and the live preview (`attachScrub` in
    `editor.html`, rotation scrubs coarser since it's in degrees).
  - **Default values shown for auto-cylinder props.** Props with no explicit
    `colliders` (rock, bush, …) now display the implicit full-bounds cylinder as a
    dashed **"default" ghost card** (position 0/0.5/0, rotation 0, scale 1/1/1) instead
    of just a "no pieces" message, so the values are visible and editable. Editing the
    ghost materializes it into `def.colliders` (preserving the `empty = auto`
    convention until you actually change something); ✕ reverts to auto. Non-blocking
    props (spawn) and the wall's auto oriented box show an explanatory note instead.
  - **Data format** (`js/prefabs.js`): a `colliders` entry is now
    `{shape, position, rotation, scale}`; `tree` migrated to it. The legacy fraction
    form is still accepted by the resolver, and the editor auto-normalizes old/saved
    pieces to the new form on open (`normalizeColliderPiece`).
  - **Resolver** (`PropLevel.resolveColliders`, `js/props.js`) parses the transform
    (position.y = piece **center** from the bottom, scale.y = full height) and emits the
    same runtime pieces as before plus a new **`sphere`** shape. New shared helper
    `PropLevel.colliderGeometry(c)` builds the wireframe geometry for every debug/preview
    outline (used by `js/level.js` static + dynamic + player gizmos and `editor.html`).
  - **Sphere** collides as a circular footprint + band (the 2.5D solver, identical to a
    cylinder) but **renders round**. Per the design decision, only `rotation.y` is
    authored (the solver has no off-vertical tilt). Collision / climb / raycast were
    unchanged — round shapes already take the circle path.

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
