# Recent Updates (Newest First)

Append new entries at the TOP. Dates are absolute (project tz). Cache `?v=` after
each round of asset changes is in parentheses where relevant.

## 2026-07-08

- **Lobby garden backdrop (JPG behind character).** Files: `index.html`, `css/style.css`,
  `js/level.js`. Replaced the solid navy lobby scene fill (`s.background = 0x141c2b`) with
  an image backdrop: the WebGL renderer is now built with `alpha: true`, `initLobbyScene`
  sets `lobbyScene.background = null`, so the lobby canvas clears **transparent** and a new
  full-screen `#lobby-backdrop` div (z-index 0, behind `#gameCanvas` z-1) shows a cover-fit
  garden image (`assets/textures/background.png`) behind the idle character. Toggled by
  `Level.showLobby` (display block) / `hideLobby` (none). Game maps set their own opaque
  `scene.background`, so `alpha:true` never leaks transparency in-game. Swap the CSS `url()`
  on `#lobby-backdrop` for a custom JPG. `background.png` already has a grass foreground, so
  the old ground disc was **removed** (the lobby ground mesh is now an invisible anchor for
  the pink selection ring) and the character stands directly on the backdrop's grass — no
  seam. The lobby camera was dropped to **near eye-level with a gentle downward tilt**
  (`_layoutLobby`: `pos (0,2.45,dist≥8.4)` / `lookAt (0,1.75,0)`, was `(0,3.0,dist≥7)` /
  `(0,1.4,0)`) so the character reads as standing ON the ground (the ring flattens to match
  the backdrop's ground plane) instead of being viewed top-down. Camera + lookAt share the
  same vertical offset so the pitch is fixed while the character sits screen-centre. Tuned
  live in-browser against the reference image. The floating lobby label (`makeLobbyLabel`,
  a canvas sprite) was shrunk to roughly match the DOM chrome on screen: **name 54→30px**,
  **role 40→26px** canvas font (name ≈ the role-select text, role ≈ the subtitle), with the
  two lines pulled closer (`nameY 56→74`, `roleY 122→110`) and lighter strokes.

- **Lobby refresh icon + role-aware refresh/JOIN/leave chrome.** Files: `index.html`,
  `css/style.css`, `js/app.js`, `js/ui.js`. Added a small **refresh** icon
  (`#btn-lobby-refresh` ⟳, `.lobby-refresh`) beside the room code in `.lobby-bl`. The
  bottom refresh/JOIN/leave controls now reconcile per role & occupancy in
  `UI.updateLobby` (`hostAlone = isHost && total <= 1`): **host alone** → refresh
  shown+enabled + JOIN shown, door (`#btn-lobby-leave`) hidden; **host with players**
  (total > 1) → refresh shown but **disabled**, JOIN hidden, door shown; **client** →
  refresh hidden, JOIN hidden, door shown. Refresh runs the same rehost path as leaving
  (`Network.leaveMatch()` → for a host `shutdownHost()` → `cleanup(rehost)` →
  `autoHostLobby()` → fresh code) behind a **"Refresh room?"** confirm; the door now
  also prompts a **"Leave lobby?"** confirm (both via the existing `UI.showConfirm`).
  The leave button ships `display:none` in markup (fresh boot = host-alone) to avoid a
  one-frame flash before the first `updateLobby`. **Layout:** the bottom-left block
  (`.lobby-bl`) is a 2-col grid (`1fr 44px`) with explicit cell placement — row 1 JOIN
  pill + share 🔗 icon, row 2 room-code + refresh ⟳ icon — so JOIN and the code label are
  equal-width (col 1) and the two icons align (col 2) on every screen size, and hiding
  JOIN/share never reflows the columns. The code label reads **"ROOM ID: NNNN"** (renamed
  from "ROOM CODE", smaller font) so 4 digits stay fully visible in the narrow cell. The
  share/invite button also moved here from the top-right cluster.

- **Custom themed dropdowns (`.csel`) replace native `<select>` popups.** Files:
  `js/app.js`, `js/ui.js`, `css/style.css`. Native option lists render in OS chrome (a
  white box on desktop, a picker on mobile) and can't be themed, so the lobby map/role +
  settings Graphics/Gyro dropdowns looked inconsistent. `enhanceSelect(select)` (js/app.js)
  now keeps the `<select>` as a hidden source of truth (`.csel-native`) and builds a dark
  in-page trigger (with a ▾ caret that flips on open) + option panel matching the lobby/
  settings theme; picking an option sets `select.value` + dispatches `change` so all
  existing handlers fire unchanged. `refreshAllCSelects()` / `el._csel.refresh()|.rebuild()`
  re-sync the trigger after code changes value/options/disabled — called from
  `UI.updateLobby` + `UI.renderLevelSelector` (lobby) and the settings-open handlers. Panels
  open upward when they'd be clipped by their scroll container (e.g. a select low in the
  settings body). Enhanced: `lobby-map-select`, `lobby-role-select`, `setting-graphics`,
  `setting-gyro-mode`.

- **Settings screen redesigned dark + BASIC/ADVANCED tabs** (matches the new lobby).
  Files: `index.html`, `css/style.css`, `js/app.js`. `#settings-screen` is now a dark
  PUBG-style panel (`.settings-pubg`) — header (back · title · tab switch), scrollable
  body, full-width SAVE footer — instead of the wooden `.menu-card`. Two tabs:
  **BASIC** = *Match* (hiding/hunting time) + *Display* (Graphics, show-mobile-controls);
  **ADVANCED** = *Camera* (camera sensitivity, FOV, invert-Y) + *Combat & Aim* (shoot
  sensitivity, gyro aim, gyro sens). `wireSettingsTabs` (`js/app.js`) toggles
  `.settings-group[hidden]` per `.settings-tab[data-tab]`. **All input ids/val chips are
  unchanged**, so the existing live-apply + Save handlers keep working verbatim; only the
  markup grouping + a dark re-skin of the shared `.setting-row`/`.setting-value`/
  `.setting-select`/range/checkbox rules changed. Back arrow still returns to the lobby
  via the `settingsFromLobby` flag.

- **PUBG-style lobby redesign + auto-host-on-load flow.** Files: `index.html`,
  `css/style.css`, `js/app.js`, `js/network.js`, `js/level.js`, `js/ui.js`. The old
  two-screen menu (name + Host/Join card) → lobby (wooden card, map carousel, text
  player-list) is replaced by a single **full-screen PUBG-style lobby** you land in
  directly:
  - **Auto-host on load.** Boot no longer reveals `#menu-screen`; `js/app.js`'s
    `LoadingScreen.markReady` calls **`Network.autoHostLobby()`** (a `?room=CODE` deep
    link auto-**joins** instead). `autoHostLobby` seeds a default name if none saved and
    calls `initHost`, which now retries on `unavailable-id` via `_openHostPeer` (silent
    hosting makes code collisions likelier). `initHost`/`initClient(codeArg)` show the
    lobby immediately via `UI.transitionToLobby()` (with a "Creating…/Connecting…"
    subtitle) instead of manual `display` toggles. **`#menu-screen` is now unused DOM.**
  - **Never a dead menu.** `Network.cleanup(rehost=true)` drops back into a fresh
    auto-hosted lobby after any leave/teardown; pass `rehost=false` when the caller
    hosts/joins next (e.g. `switchToClient`) or a fatal modal is up. `transitionToMenu`
    is now dead code.
  - **In-lobby controls (corner overlays over a live 3D backdrop).** Top-left: contextual
    **START GAME** (host, gated on ≥1 Hunter + ≥1 Seeker + all ready) / **READY–UNREADY**
    (client) `#btn-lobby-action` + **map** `<select>` (`#lobby-map-select`, host-editable)
    + **role** `<select>` (`#lobby-role-select`). Top-right: **settings gear**
    (`#btn-lobby-settings`, back arrow returns to the lobby via a `settingsFromLobby`
    flag) + **name pill** (`#lobby-name-pill`, click-to-edit → `Network.setLocalName`, a
    new `nameChange` message mirroring `roleChange`) + **invite** (`#btn-share-room`).
    Bottom-left: **room code** (`#lobby-title`) + **JOIN** (`#btn-lobby-join` → 4-digit
    popover → `Network.switchToClient`). Bottom-right: **leave** (`#btn-lobby-leave`).
    Bottom-centre: waiting/composition messages (`#lobby-subtitle`/`#lobby-warning`).
  - **3D player models in the lobby.** A dedicated, isolated `Level.lobbyScene` (its own
    camera + lights + ground) renders one idle-animated character per `gameState.players`
    entry via the reused `Level.makeCharacterMesh`; `Level.syncLobbyModels` diffs the
    roster (rebuild on join/role-change, relabel on name/ready/grace change) and
    `_layoutLobby` spaces them in a row + frames the camera. Labels are canvas sprites
    (`Level.makeLobbyLabel`: name + role, gold **✓** when ready). `animate()` computes a
    `dt` and branches to **`Level.renderLobby(dt)`** while `Level.lobbyActive` (set by
    `Level.showLobby`/`hideLobby` from the screen transitions); the in-game
    `Level.render()` runs only in-match — never both. `UI.updateLobby` no longer builds
    DOM rows (players ARE the 3D row); `UI.renderLevelSelector` now populates the map
    `<select>` (was a `.level-card` carousel).

- **PUBG-style 60s reconnect grace for a dropped non-host player.** Files: `js/globals.js`,
  `js/network.js`, `js/ui.js`, `index.html`, `css/style.css`. Previously a client's network
  blip was instant + terminal on both sides — the host reaped the roster slot in 3s and
  toasted `⚠️ disconnected`, while the client's own watchdog dumped it to the menu. Now:
  - **Host holds the slot for `GRACE_MS` (60s).** `handleConnClose` splits into `enterGrace`
    (keep the record + mesh frozen in place, pull the dead conn out of `connections`, toast
    `🔌 <name> reconnecting…`, arm a `graceTimers[peer]` finalize timer) vs. `finalizeDrop`
    (the old delete + `⚠️ <name> left` + `checkHostAlone`, fired only when the 60s expire).
    A voluntary `leave` still finalizes instantly (it pre-deletes + sets `conn._dropped`).
    `checkHostAlone` now waits while any grace timer is pending; `_clearRejoinTimers` also
    clears grace timers.
  - **Reconnect reuses the existing rejoin branch.** Since the blip is in-page, `myId`
    survives in memory, so the client reconnects with the **same peer id** → the host's
    `acceptConnection` existing-record branch matches, clears grace, toasts `✅ reconnected`,
    and resyncs via the existing `rejoinAck` (role/disguise/position intact).
  - **Migration-escalation hardening (end-to-end audit).** `handleHostLoss` no longer waits
    solely for a `peer-unavailable` to tell blip from host-death (which can be slow/never on a
    host *network* drop vs. a tab close). Now: while our peer is detached from the signaling
    server → OUR net is down → keep retrying the original host; while our peer is still attached
    but the host is unreachable after **two** consecutive 4s dials → the host is gone → escalate
    to migration. Two probes (not one) prevent a single transient dial failure to a healthy host
    from splitting the room. Terminal states verified: `gameOver`/`roomClosing` set
    `sessionEnding` (regrace + migration both suppressed during results / host shutdown),
    `returnLobby` clears it, `cleanup` resets all reconnect state incl. `joinedRoom`. Also set
    `pendingRoomCode` at original-host init so `lobbySync`/`rejoinAck` carry the real code (was
    null until a migration minted one; clients ignored null, so cosmetic-only, but now correct).
  - **Duplicate-connection race fix.** A reconnect could briefly open two host connections
    sharing the client's peer id; the client closes the extra, and the host's
    `connections.filter(c => c.peer !== …)` removed BOTH — emptying `connections` and firing a
    bogus "All players left" a few seconds after the player reconnected. Now `attemptRegrace`
    keeps only one dial in flight (`_regraceDialing` + a 4s dial timeout), and `handleConnClose`
    ignores a superseded duplicate (removes it by object identity, not peer id).
  - **Peer-error router.** The client `peer.on('error')` no longer pops a terminal "Network
    Error" modal for an in-session blip. `handleClientPeerError` routes it: before joining →
    modal (fatal); once `joinedRoom` and a transient type (`network`/`disconnected`/`socket-*`/
    `server-error`) → `handleHostLoss` (regrace); `peer-unavailable` mid-regrace → escalate to
    migration. (This was the bug where the dropped player got stuck on a "Network Error" popup
    while others already saw them reconnect.)
  - **Client retries the same host before giving up.** New `handleHostLoss` → `attemptRegrace`
    loop (2s cadence, up to 60s) shows a non-blocking **"Reconnecting… (Ns)"** overlay
    (`#reconnect-overlay`, `UI.showReconnecting`/`hideReconnecting`) while the frozen scene
    keeps rendering. It recreates/`reconnect()`s the peer as needed and redials `currentHostId`.
    Host-migration is preserved: a `peer-unavailable` error (host id truly gone) escalates to
    the unchanged `onHostConnectionClose` migration path; net-down errors just keep retrying.
    Scope: **non-host player drops + in-page blips only** (a full page reload is not
    auto-rejoined). The lobby roster dims + tags a `_grace` player as reconnecting.

- **Sensitivity sliders reworked to a 0–13 "strength" scale + shoot sens added to the
  Settings screen.** Files: `index.html`, `js/app.js`, `js/globals.js`. Camera and shoot
  sensitivity are still **stored raw** in `GAME_SETTINGS` (`mouseSensitivity` /
  `shootDragSensitivity`) but the UI now shows an **integer 0–13** instead of the raw
  `0.00xx` value: point 0 = `0.003`, point 13 = `0.015`, linear
  (`ptsToSens`/`sensToPts` in `js/app.js`, consts `SENS_MIN`/`SENS_MAX`/`SENS_PTS`). Both
  controls now live in **both** places — the menu **Settings screen** and the in-game
  **Controls panel** — kept in sync both ways. Labels renamed for consistency: "MOUSE
  SENSITIVITY"/"CAMERA LOOK SENS." → **CAMERA SENSITIVITY**; "SHOOT DRAG SENS." → **SHOOT
  SENSITIVITY**. Defaults moved to `0.0067` (~point 4) since the old `0.002` default sits
  below the new `0.003` floor (older saves below the floor clamp to point 0 on display).

- **PUBG-style gyroscope aiming (mobile).** Files: `js/globals.js`, `js/mechanics.js`,
  `index.html`, `js/app.js`, `css/style.css`. A new **GYRO AIM** option in the Settings
  screen and the in-game Controls panel lets players tilt the phone to orbit the camera.
  Three modes via a `<select>`: **Off** / **While Firing** (gyro active only while the
  SHOOT button is held — PUBG "Scope On") / **Always**. A separate **GYRO SENS.** slider
  (0.2–3.0 multiplier) tunes the feel independently of look sensitivity. Both persist in
  `GAME_SETTINGS` (`gyroMode`, `gyroSensitivity`) via the usual `hidehunt_settings`
  localStorage blob. Implementation: `Mechanics.onGyro` (a `deviceorientation` listener)
  is **delta-based** — it diffs each reading against the previous one and adds the delta
  to `cameraYaw`/`cameraPitch` (the same globals mouse/touch look feed), so it mixes with
  touch drag and never drifts. When gated off (wrong mode / LOBBY / editing layout /
  not-firing in scope mode) it drops the baseline (`gyroPrev = null`) so re-engaging
  causes no camera jump. `Mechanics.enableGyro` handles the **iOS 13+
  `DeviceOrientationEvent.requestPermission()`** gate — called from the Settings select's
  `change` handler (a user gesture, required by iOS) and at boot (Android attaches
  directly). A `GYRO_WRAP` (45°) guard skips sensor-wrap discontinuities; tuning consts
  `GYRO_BASE`/`GYRO_WRAP` live in `globals.js`. **Landscape mapping** (`gamma`→yaw,
  `beta`→pitch) and its signs are isolated in the single `onGyro` block and need a quick
  on-device confirmation pass. No camera-rig or network changes (aim is local). See
  [CAMERA_AND_CONTROLS.md](CAMERA_AND_CONTROLS.md) → "Gyroscope aim".

## 2026-07-07

- **Removed the in-game "G" collider-gizmo toggle.** File: `js/mechanics.js`. The
  `keydown` handler no longer maps `g` → `Level.setDeveloper(!developer)`, so pressing G
  during a match no longer flips the debug collider outlines. `developer` still defaults
  `false` and `Level.setDeveloper(true)` is still callable from the console; the editor's
  own "Show Colliders" button (`editor.html`) is unaffected.

- **New event sounds: game-over chime, hider death cue, seeker kill-confirm.** Files:
  `js/globals.js`, `js/network.js`, `js/ui.js`. Three hooks added:
  1. **Game over** — `UI.showResults()` plays `Sound.playAlarm('chime')` once, guarded so
     it only fires on the hidden→shown transition (not on re-renders while the results
     screen is already up).
  2. **Local hider death** — when the eliminating shot targets the local player, the deep
     war-horn cue (`Sound.playAlarm('horn')`) plays instead of the normal `Sound.hurt()`
     ow-zap (the zap is now suppressed on the fatal hit via a `!eliminated` guard).
  3. **Seeker kill-confirm** — new `Sound.kill()` (low impact thud + bright rising C6→G6
     ding) plays to the seeker whose shot eliminates a hider.
  Wired in both shot paths so it works host- and client-side: host `processShotAuthoritative`
  (its own perspective) and the client `shot` packet handler both check
  `eliminated` + `targetId`/`shooterId` against `myId`.

- **Multiple hunt-alarm sound profiles (dev-harness preview only).** Files:
  `js/globals.js`, `testing/index.html`, `testing/dev-harness.js`. The single hard-coded
  klaxon is now one of **nine** WebAudio profiles in `Sound._alarmProfiles`: `klaxon`
  (original two-tone), `siren` (air-raid sweep + warble LFO), `stinger` (dissonant
  minor-2nd stab over a descending sub drone), `horn` (deep two-note brass swell),
  `digital` (three rising bleeps), `pulse` (three sonar sine pings), `chime` (ascending
  C-E-G-C bell arpeggio), `growl` (sub sawtooth rising through an opening lowpass), and
  `whistle` (piercing sine sweep + trill LFO). The `horn` profile was reworked — it
  previously stacked a raw sawtooth+square at low frequency and buzzed; it now uses one
  sawtooth per note through a 650 Hz lowpass with a 0.25s gap between the two notes, so
  they read as two clean, distinct brass calls. **The live in-game hunt-start cue is now
  `stinger`** — `Sound.alarm()` (fired at the HIDING→HUNTING flip) plays
  `Sound.ALARM_PROFILE` (= `'stinger'`); swap that one constant to change it. The old
  `GAME_SETTINGS.alarmProfile` indirection was dropped (no in-game UI set it, and a stale
  localStorage blob could have pinned the wrong cue). The full nine-profile set stays
  auditionable via the dev harness. `Sound.alarm()` dispatches to
  `GAME_SETTINGS.alarmProfile` (default `klaxon`); `Sound.playAlarm(name)` plays any by
  name (unknown → klaxon). Auditioned via the **Dev Harness** (`testing/`) — a new
  **Alarm** dropdown + ▶ replay button, bridged to the game realm through
  `__dev.playAlarm(name)` (needed because `Sound` is a top-level const, so
  `iframe.contentWindow.Sound` is undefined). No in-game UI: the profile picker is a dev
  tool only. Verified in-browser: all five schedule oscillators with no errors, unknown
  name falls back to klaxon.

- **Fix: hunt-start alarm never played.** Files: `js/ui.js`, `js/app.js`. The klaxon
  on the HIDING→HUNTING flip was guarded by `if (window.Sound && Sound.alarm)`, but
  `Sound` is a top-level `const` and **top-level `const`/`let` do not become properties
  of `window`** — so `window.Sound` was always `undefined` and the guard was never true;
  `Sound.alarm()` was simply never called (every other sound is invoked as a bare
  `Sound.xxx()`, which is why only the alarm was silent). Guard changed to
  `typeof Sound !== 'undefined' && Sound.alarm`. Verified in-browser: `window.Sound`
  is `undefined`, and driving `UI.updateHUD()` across a `_lastPhase` HIDING→HUNTING
  edge now fires the alarm exactly once (and not on subsequent frames). Also added a
  one-shot `pointerdown`/`keydown` audio-context unlock in `js/app.js` (belt-and-braces
  for browser autoplay policy) using the same `typeof` guard.

- **Hider "HUNTERS ARRIVING IN" countdown overlay.** Files: `index.html`,
  `css/style.css`, `js/globals.js`, `js/ui.js`. During the HIDING grace phase live
  hiders now see a big center-screen countdown (`#hider-countdown` → `#hider-countdown-num`
  = `gameState.timer`) with the label "HUNTERS ARRIVING IN". The overlay is deliberately
  **backdrop-less** (only a faint 0.18-alpha radial vignette) and `pointer-events:none`,
  so hiders keep a clear view of the environment and clicks aren't blocked. Final 5s
  (`timer <= 5`) the number pulses heavily via the new `.urgent` class / `@keyframes
  hider-urgent` (scale 1→1.35 + red color/glow). On the HIDING→HUNTING flip the overlay
  hides and a new `Sound.alarm()` klaxon (alternating 740/560 Hz square beeps, ~1s) plays
  **once for everyone** — seeker + hider — via a role-independent `UI._lastPhase`
  transition guard (so the host/seeker hears the hunt start too). Seekers keep their
  existing all-black
  `#blind-overlay`; caught hiders don't see the new overlay. Driven from `UI.updateHUD`
  alongside the seeker blind block — no new network work (`timer` already synced via
  `snapshot`/`gameStart`).

## 2026-07-04

- **Loading-screen bottom tint + pagination dots removed.** File: `css/style.css`. The
  `.ls-dots` container spanned the full width at the bottom with `pointer-events:auto`,
  overlapping the CONTINUE button and swallowing its clicks; the `.ls-scrim` bottom black
  gradient was also unwanted. Both now `display:none`. Carousel navigation still works via the
  side arrows, swipe, and ←→ keys.

- **Returning-player deep link skips the JOIN screen flash.** File: `js/app.js`. On the
  loading-screen "continue" dismiss, the menu (Host/Join) was revealed *before*
  `handleRoomDeepLink()` fired `initClient()`, so a returning player (saved name) opening a
  `?room=` link saw the JOIN screen for the ~1–3s connect window. Now `markReady` skips
  showing `#menu-screen` when `getRoomDeepLink()` + a saved `myName` mean the player joins
  straight through — loading screen → lobby, no menu flash. First-timers / no-deep-link still
  get the menu revealed as before.

- **Apartment stairs: invisible ramp collider (smooth climb).** Files:
  `js/levels/apartment.js`, `js/materiallibrary.js`. The stepped cube treads made climbing
  jittery (12 discrete step-ups per flight). Now the visible step cubes are **decorative only**
  (`collision:false, climbable:false` on all 192), and each of the 16 flights carries **one
  invisible tilted ramp** — a thin `cube` rotated to the flight's slope (~25.46°, `atan2(8,16.8)`),
  spanning the flight exactly (radius 10→26.8, y0→y1, width 5). The ramp does the collision so
  the player walks up a continuous smooth surface while it still *looks* like stairs. Uses the
  tilted-box ramp mechanism already validated on the Forest ramp (`_climbFloor` tilted branch).
  New **"Invisible Collider"** material preset (`opacity:0`) in `materiallibrary.js` hides the
  ramp; ramps are `canDisguise:false`. Props 593 → 609.

- **Eliminated players: hidden bodies + spectate; End-Game results screen + Back-to-Lobby
  rematch.** Files: `js/globals.js`, `js/network.js`, `js/level.js`, `js/ui.js`,
  `js/app.js`, `index.html`, `css/style.css`.
  - **(1) Dead bodies removed from the world for EVERYONE.** The per-frame render loop
    (`Level.render`) now sets `mesh.visible=false` and `continue`s for any `isCaught`
    player (was: greyed/frozen body left in place). The Seeker-scan overlay already
    skipped caught hiders, so nothing shows a dead player anywhere.
  - **(2) Spectate (eliminated players follow a live player's view).** New global
    `spectateId` + `Network.spectatablePlayers()/ensureSpectateTarget()/cycleSpectate(dir)`
    (alive = not `isCaught`, not self, has a mesh). While the local player is `isCaught`
    during HIDING/HUNTING, the camera rig in `Level.render` retargets to the spectated
    player's **mesh** (position + facing — clients hold live remote position only in the
    mesh/snapshot buffer, not the record) with a fixed downward pitch. HUD **spectate bar**
    (`#spectate-bar`, prev/‹ ›/next) via `UI.updateSpectate()` (called from `updateHUD`),
    wired in `app.js` to `Network.cycleSpectate(±1)`.
  - **(3) End-Game results scoreboard.** New `#results-screen` (fixed, z-300) with a
    per-player table: Player · Role · Result (Survived/Eliminated) · Kills · Score · Keys ·
    Survived (mm:ss) · **XP**. `Network.finishMatch` now calls `buildResults()` (host-
    authoritative: survival time from `gameState.huntStartT`, hider XP = `secs·10 +
    survived?300 + keys·150`, seeker XP = `kills·200 + score`) and ships the rows in the
    `gameOver` packet; `UI.showResults(title,message,rows)` renders it for everyone. New
    per-player stat fields in `createPlayer` (reset each round): `kills`, `caughtAtT`,
    `keysDelivered` — incremented in `processShot` (lethal hit) and `depositKeys`.
  - **(4) Back-to-Lobby rematch — NO re-host/re-join.** `gameOver` no longer calls
    `cleanup()` (which destroyed the peer); the peer/connections stay alive and the host
    game loops idle in `ENDED`. Results screen **Back to Lobby** → host
    `Network.returnToLobby()` resets the round in place (preserving roles + names, host
    implicitly ready, others un-readied) and broadcasts the new `returnLobby` packet
    ({players, levelName}); clients apply it and `UI.transitionToLobby()`. A client's own
    button calls `clientBackToLobby()` (local transition; the host's authoritative
    `returnLobby` re-syncs the roster). **Leave** button → `leaveMatch()` (old teardown).
    Client `gameOver` handler now also sets `phase='ENDED'` to freeze the local sim behind
    the results screen. **NEEDS 2-window in-browser test** (P2P; headless can't verify).

- **Apartment: named materials in the library + structural cubes non-disguisable.** Files:
  `js/materiallibrary.js`, `js/props.js`, `js/levels/apartment.js`, `docs/PROP_SYSTEM.md`.
  (1) The inline tinted presets are now two **named `MaterialLibrary` entries** — **"Apartment
  Marble Wall"** (walls, 188) and **"Apartment Concrete Floor"** (floor slabs / stair treads /
  columns / tanks, 274) — applied to the props **by name** (was inline objects). The editor's
  Material Library modal/dropdown enumerates `MaterialLibrary` (`getMaterialLibraryNames`), so
  both auto-appear there — no editor code change. (2) **Hiders could disguise as a floor slab /
  stair.** Those are `cube` instances (not their own prefab), and `canDisguiseAs` only read the
  prefab. Added a **per-instance override** (`prop.canDisguise === false/true` wins over the
  prefab; explicit `false` even beats a `hideSpot`), and set `canDisguise:false` on all 274
  structural cubes. Verified: 0/274 cubes + 0/188 walls disguisable, 118/118 furniture still
  disguisable. (Kept them as `cube` rather than inventing `slab`/`step` prefab types — the
  per-instance flag is general and needs no new mesh/editor wiring.)

- **Apartment: fixed white-out (marble too bright).** File: `js/levels/apartment.js`. The
  building is a fully-enclosed interior (player is INSIDE it, no sky in view), so the light
  `marble-wall-texture.jpg` (avg brightness **82%**) blew out to near-white on every lit face
  under the tone-map-off Lambert materials — the whole scene read white. Fix: re-applied the
  textures through a material preset that also multiplies a **darker albedo tint** (walls
  `#909498` × marble, floors/stairs/columns `#c2c2c2` × concrete), so lit surfaces sit ~0.45
  mid-gray with the texture detail intact instead of washing out. (Was NOT a crash — geometry
  loaded fine; confirmed via texture-brightness sampling.)

- **Apartment: real textures on the structure.** File: `js/levels/apartment.js`. Dropped the
  flat "Concrete Gray" material and applied image textures: **walls → `marble-wall-texture.jpg`**
  (188), **floor slabs / stair treads / cellar columns / terrace tanks → `concrete-texture.jpg`**
  (274 cubes), and the 2 GLB `pillar` props get concrete via a material preset (`texture` field).
  Both files already in `assets/textures/`. Furniture GLBs unchanged. (Had to remove `material`
  from the wall/cube props — a textureless preset clears the map, which would hide the new
  texture.)

- **Apartment baked to a static prop list.** File: `js/levels/apartment.js`. The generator
  (IIFE + helpers/loops) was run once and its output serialized to a plain
  `registerLevel("Apartment", [...596 props...], { ground })` literal — same as
  `arena.js`/`bazaar.js`, so it loads identically with no runtime build. Byte-for-byte the same
  scene as the generator (596 props: 274 cube / 188 wall / furniture / 9 spawns / 4 exit doors,
  462 gray-material). Edit further in `editor.html`; the generator lives in git history if the
  geometry needs regenerating.

- **Apartment: opened the central lift lobby (playtest 5).** File: `js/levels/apartment.js`.
  Stairs began at radius 5 — right against the radius-3 lift shaft, so the space around the
  lift was cramped. Pushed stair inner start `STAIR_R0` **5 → 10**, so the whole central lobby
  (`|x|,|z| < IN 9`) stays OPEN floor — ~7u ring around the shaft on all four sides, with
  6u-wide walkways flanking each flight in the arms. Stair holes now start at 9.5 (lobby fully
  floored); outer reach 26.8 (< flat edge 31). Flights unchanged (12 treads, rise 0.667).

- **Apartment: floor height raised for free jumping (playtest 4).** File:
  `js/levels/apartment.js`. `FLOOR_H` **6.6 → 8.0** so a full jump clears the ceiling. Jump
  apex feet-rise = `JUMP_STRENGTH²/(2|GRAVITY|)` = 0.35²/0.03 = **4.08u** → apex head 7.08 vs
  ceiling bottom `FLOOR_H-SLAB_T` = **7.6** (0.52u clear; was −0.88, head hit roof). Level tops
  F1 8 / F2 16 / F3 24 / TERRACE 32; `WALL_H` 6.0→7.0. Stairs bumped **11→12 treads** to keep
  the riser < `STEP_HEIGHT` (8.0/12 = 0.667 < 0.7); flight run 16.8u, outer reach 21.8 (< flat
  edge 31). Props ~596.

- **Apartment: cellar entrances + concrete-gray reskin (playtest 3).** Files:
  `js/levels/apartment.js`, `js/materiallibrary.js`. (1) **Cellar was sealed** — the
  full-height basement perimeter had no way in. Replaced the 4 solid perimeter walls with
  `wallDoor`s carrying a **16u-wide opening on each of the 4 sides** (cellar floor = world
  ground, so you walk straight in). (2) **Rainbow walls → whitish gray.** New
  `MaterialLibrary` preset **"Concrete Gray"** (`albedo #cdd0d2`, roughness 0.95, no texture —
  `applyMaterialPreset` clears the map when a preset carries no `texture`, so the striped
  `wall.png`/`rock_wall.png` is replaced by flat gray). Applied via `prop.material` to ALL
  structure — walls, floor slabs, stair treads, cellar columns, terrace tanks (446 props).
  Furniture GLBs keep their own look. Note: material-painted props are excluded from
  InstancedMesh batching (`level.js` `_canInstance`), but these are procedural wall/cube which
  weren't instanced anyway → no perf change.

- **Loading progress bar + % moved to bottom-left** (was bottom-centre). `.ls-content`
  now anchors `left:4.5% bottom:4.5%`, `align-items:flex-start`. Stacked hint→bar→%:
  `#ls-loading` `width:min(320px,46vw)`, bar `100%`×14px, hint top-left, `.loading-pct`
  bottom-right (`align-self:flex-end`). Shrunk for mobile. Fits the empty left region
  under the power-intro cards. Baselines lowered so bar / dots / Continue share a bottom
  band: `.ls-dots` `bottom:6%`, `.ls-continue` `bottom:4.5%`. CSS-only (`css/style.css`);
  JS unchanged. (Continue only appears at 100% via `markReady` — hidden during load.)
  **Markup fix:** `#ls-continue` moved OUT of `.ls-content` (now a sibling under
  `#loading-screen`) — the narrow left-anchored `.ls-content` was its positioning
  context, so `right:24px` was landing bottom-LEFT; now anchors to full screen (bottom-right).

- **Apartment enlargement pass (playtest 2).** File: `js/levels/apartment.js`. Footprint
  **48×48 → 68×68** (`HALF` 24→34). Flat interior 15×15 → **22×22** (rooms ~7.5² → ~11²,
  **2.16× area**) via new layout consts `IN 9 / MID 20 / OUT 31`. Central corridor cross
  **12 → 18 wide** (6u walkway each side of the 6-wide stairwell). Entrances widened ~1.5×
  again: front door 4.0→**6.0**, partition/balcony 3.4→**5.1**, lift door 3.0→**4.5**, stair
  width 4→5 (holes ±2.5→±3). Columns/furniture/spawns/exit-doors respread to the bigger
  shell; +2 furniture/flat (pot, barrel). Props ~544 → ~576.

- **Apartment tuning pass (playtest fixes).** File: `js/levels/apartment.js`. (1) **Floor
  height 4 → 6.6** (`FLOOR_H` = 2.2 × full player height 3.0); ceilings were cramped. Level
  tops are now CELLAR 0 / F1 6.6 / F2 13.2 / F3 19.8 / TERRACE 26.4, walls `WALL_H` 6.0, ~3.2u
  head clearance under each slab. (2) **Doorways/corridors widened** — front door 2.4 → 4.0
  (+ a 2nd 4.0 side entry), balcony/partition/lift gaps → 3.2–3.4 (player capsule is 1.4
  across; the old 2.0–2.4 gaps read as slots). (3) **Stairs unblocked** — steps were SOLID
  wedges from the floor up, so the flight stacked directly above filled the headroom of the
  flight below (you couldn't climb). Steps are now **thin overlapping treads** (`TREAD_TH`
  ≈1.3) occupying only their own band → **2.3u** clear above the head between stacked flights.
  11 treads/flight (rise 0.6 < `STEP_HEIGHT` 0.7), 20.4u run (< 21 flat edge). Prop count
  ~452 → ~544 (250 cube + 184 wall = ~434 procedural draw calls — watch mobile FPS).

- **New "Apartment" level — first MULTI-STOREY map (vertical tower).** Files:
  `js/levels/apartment.js` (new, ~452 props, generator-style), `js/levels/registry.js`
  (`LEVEL_FILES`), `js/level.js` (`loadModels` +5 indoor models), `js/prefabs.js`
  (+5 prefabs), `assets/models/` (5 GLBs promoted from `env_modals/`). Five stacked
  levels share one 48×48 footprint: **CELLAR** (open basement, world ground y=0) → **F1/F2/F3**
  (top y = 4/8/12, four 2BHK flats each) → **TERRACE** (y=16, open roof). Vertical travel:
  a central **6×6 lift shaft** is an open void cellar→terrace (no elevator scripting exists —
  it's a drop-shaft + hide nook), and **four stairwells** in the N/E/S/W corridor arms carry a
  flight for **every** floor transition, so there are always 4 ways up — including the required
  **4 ways from Floor 3 to the terrace**.
  - **How multi-floor works with the existing engine (no new mechanics):** floor slabs are
    climbable `cube` boxes (walkable tops); walls are `wall` boxes whose collider band
    (`yMin..yMax`) only blocks a player overlapping that height, so cellar walls and F2 walls
    coexist without interfering. Stairs are solid cube steps rising 0.667 each (< `STEP_HEIGHT`
    0.7) so the auto step-up walks you up. `applyPropTransform` places props at the authored
    **center `y`**, so elevated slabs/walls render at height. Each upper slab carries 4 stair
    openings + a lift opening (built via a rectangle-minus-holes subtractor) so flights pass
    through; the same footprint on every floor keeps the stacked flights aligned.
  - **2BHK flats:** hall + kitchen + 2 bedrooms split by two partition walls, **each partition
    has a doorway** so rooms INTERCONNECT; every flat has a front door to the corridor + two
    balcony doors. A continuous outer **balcony ring** (low 1.3 parapet) wraps each floor, so
    ADJACENT FLATS' BALCONIES INTERCONNECT around the building.
  - **5 new indoor models** promoted from `assets/models/env_modals/` → `assets/models/`:
    `cupboard` (tall wardrobe, hide/disguise), `chair`, `bucket`, `books`, `pillar`. Wired in
    `loadModels` + `prefabs.js`. **Scales are best-guess** (raw GLB dims unverified) — the
    `pillar` decor and the furniture sizes **need an editor.html size check**; tune if any read
    off. Cellar structural columns use `cube` (guaranteed to reach the F1 ceiling).
  - **NEEDS in-browser test** (headless can't verify climb/render): confirm you can stair up
    cellar→terrace in all 4 arms, stand on every slab, walk between interconnected rooms and
    balconies, and that no furniture is grotesquely over/undersized.

## 2026-07-03

- **Bullets now leave the hand, not the head.** File: `js/level.js` (`getAimRay`
  muzzle offsets). The visual bolt spawned from `my = localPos.y + HAND_UP` with
  `HAND_UP = +0.35`. `localPos.y` is the capsule CENTRE (feet + `PLAYER_BASE_HEIGHT`
  1.5), so the muzzle sat at feet+1.85 — above the neck/head — and shots read as fired
  from the face. Measured the rig live (chrome-devtools): during the upper-body **shoot**
  clip the right-hand bone holds steady at **~1.15 above the feet**. Set `HAND_UP = -0.35`
  (1.15 − 1.5) so the muzzle Y now equals the shoot-pose hand exactly (verified `dy=0`),
  and widened `HAND_FWD 0.45→0.6`, `HAND_RIGHT 0.35→0.4` to match the hand's forward/side
  reach in that pose. Bolt origin is broadcast in the shot packet, so every viewer sees it
  leave the hand.

- **Beam drops now use a centre announcement, not a bottom toast.** File:
  `js/network.js` (new `beamDropAnnounce`, called from `spawnBeam` + `beamSpawn`
  handler; old `notify` toast removed). Both beam kinds now fire a big centre
  `UI.announce` instead of the bottom-of-screen toast. GOLD (powers) →
  `🟡 Airdrop! / A power beam has dropped` for everyone. PURPLE (keys) →
  `🔑 Collect the Key! / A purple beam has dropped` for **Hiders only** (a seeker
  can't collect it). No new packet — each peer (host in `spawnBeam`, every client in
  `beamSpawn`) already renders the beam, so it decides locally against its own role.

- **Seeker power tuning + deterministic 2nd gold beam.** Files: `js/globals.js`
  (power consts), `js/network.js` (`spawnBeam`, `collectBeam`, `grantPower`, hunt-start
  reset). (1) All seeker power durations `10s→15s` (`POWER_SCAN_MS`, `POWER_JAM_MS`,
  `POWER_KILL_MS`). (2) Scan range `POWER_SCAN_RANGE 20→40` units. (3) The **2nd gold
  beam** of each hunt now always grants **Scan** to a seeker who takes it (a hider still
  rolls a random hider power). `spawnBeam` counts golds and tags the 2nd with
  `forceSeekerPower:'scan'`; `collectBeam` threads it into `grantPower`, which uses the
  forced power instead of the random roll. Counter (`_goldSpawnCount`) resets at each
  HUNTING transition so it's per-match. Scan range is a shared const (every client derives
  markers identically — no packet).

- **Louder footsteps (remote hiders were near-inaudible).** Files: `js/globals.js`
  (`Sound.step` base gains, `FOOTSTEP_MIN_DIST`), `js/level.js` (`tickRemoteFootstep`
  falloff). Complaint: hider footsteps very low. Two quiet-makers stacked: base step
  gains were low (sine `0.22`, noise `0.13`) and the remote volume used a **squared**
  falloff (`vol *= vol`) that crushed the mid-range (~22u away → 0.25×). Fix: bumped base
  gains (sine `0.22→0.32`, noise `0.13→0.20`), widened the full-volume radius
  (`FOOTSTEP_MIN_DIST 4→8`), and softened the curve to `sqrt(vol)` so mid-range stays
  audible. Local player steps (vol=1) are a touch louder too — expected.

- **Forced-out hider no longer spawns underground (feet-over-wire `y`).** Files:
  `js/network.js` (clientMove send + handler, `buildSnapshot`), `js/level.js`
  (`updatePlayerMeshTransform` snapshot merge), `docs/NETWORK_PROTOCOL.md`. Bug: a hider
  shot out of a **short prop** (bush/rock) sometimes rendered sunk below the floor for a
  moment. Cause: the wire carried the **disguise-dependent capsule centre `y`** (base =
  `propRadius` while disguised, `PLAYER_BASE_HEIGHT` as a player). The reveal flip
  (`disguiseType→'player'`) and the position stream travel on separate paths, so for one
  round-trip a low disguised `y` was paired with the tall player base → feet `= y − 1.5 <
  0`. Fix: `clientMove` + `snapshot` now ship **feet** (`y − getDisguiseBaseHeight(self)`),
  a disguise-invariant ground value; the receiver rebuilds centre with *its own* known
  disguise for that player (`feet + getDisguiseBaseHeight(p)`), so a disguise change can
  never desync `y`. The one-shot reveal lift in the `shot` handler stays (bridges the flip
  instant on the host's own snapshot build; non-additive, so no drift). Full snapshots
  (`lobbySync`/`gameStart`/`rejoinAck`) still carry centre `y` — they're self-consistent
  bundles. `PropLevel.getDisguiseBaseHeight` is the single offset source.

- **Host-migration: symmetric round-dissolve when no live hider remains.** File:
  `js/network.js` (`becomeSuccessor`, `acceptConnection`, `startGameBroadcast`,
  `cleanup`). Bug: 2-player match (host = Hider, client = Seeker), host closes browser →
  migration elects the lone seeker as successor. `becomeSuccessor` only dissolved the
  round when `seekers === 0`, so with `seekers === 1 / hiders === 0` the match **resumed
  and the sole hunter kept playing alone** with nothing to hunt. Added the symmetric
  guard: after migration, if no live Hider remains (`role === 'Hider' && !isCaught`),
  seekers win and everyone returns to a fresh lobby. New `_pendingSeekersWin` flag mirrors
  `_pendingHidersWin` so reconnecting survivors also get the "Seekers Win!" popup (reuses
  the generic client `hidersWin` case, which just renders `title`/`message`). Flag reset
  alongside `_pendingHidersWin` in `startGameBroadcast` and `cleanup`.

- **Draw-call batching via InstancedMesh (perf, all tiers).** Files: `js/level.js`
  (`USE_INSTANCING`, `spawnProp`, new `_canInstance`/`_batchMesh`/`finalizeInstances`,
  `loadLevel`), `docs/RENDERING.md`. Identical GLB props (scatter bushes/rocks, market
  crate/barrel stacks, ruined columns) share one geometry+material object across all
  `.clone(true)` copies, so `spawnProp` now collects each such prop's per-submesh **world
  matrix** into `this._instanceBatches` (keyed by `geometry.uuid|material.uuid`) and
  discards the individual mesh; `finalizeInstances` (end of `loadLevel`) draws each batch
  as **one `THREE.InstancedMesh`** (>=2 members) or a plain baked-matrix `Mesh` (lone
  member). Collapses hundreds of per-prop draw calls to a handful — the biggest remaining
  mobile GPU/CPU lever. Safe because collision + dev gizmos read prop DATA (`enrichProp`),
  never these meshes, and disguises are separate clones in `playerMeshes`. **Excluded**
  (kept on the individual path): procedural `wall`/`cube` (per-instance materials won't
  share a batch) and material-preset props (unique cloned material); multi-material leaf
  meshes fall back individually too. **Foliage tint still works** — instanced tree/bush use
  the *same shared template material* `applyFoliageTint` mutates via `modelLibrary`.
  InstancedMesh `frustumCulled=false` (its origin-centred template bounds would wrongly cull
  the whole level-spanning batch). Toggle `Level.USE_INSTANCING=false` to A/B. Dev console
  logs `[instancing] N submeshes → M draw objects`. **NEEDS in-browser test** (headless can't
  verify GPU output): confirm props render/shadow correctly and foliage stays tinted.

- **Mobile framerate cap (60 fps).** File: `js/app.js` (`animate`). Uncapped `rAF` on 90/120
  Hz phones renders at panel rate → heats the SoC → thermal throttle → *lower*, jittery
  sustained fps. The `mobile` tier now gates `animate` to 60 fps (`_FRAME_CAP_MOBILE`, −1 ms
  slack so a 60 Hz panel doesn't collapse to 30). Low/Medium/High stay uncapped (native rate).

- **Mobile render perf pass (big FPS wins).** File: `js/level.js` (`init`, `QUALITY.mobile`,
  `setGraphicsQuality`), `docs/RENDERING.md`. Three changes on the `mobile` tier:
  (1) **Shadow pass disabled** — new `shadows:false` QUALITY flag drives
  `renderer.shadowMap.enabled` + `dirLight.castShadow` in `setGraphicsQuality` (default ON
  when the flag is absent, so Low/Medium/High unchanged). The shadow map is a full second
  scene render every frame — the single biggest mobile cost. (2) **MSAA off** — renderer is
  now created with `antialias: initQ !== 'mobile'` (AA is fixed at renderer creation, so it
  reads the saved `graphicsQuality` there; switching *to* mobile live needs a reload to drop
  AA). (3) **`powerPreference:'high-performance'`** added to the WebGLRenderer opts.
  Also: Low/Mobile now use the cheaper `BasicShadowMap` filter (vs Medium/High
  `PCFSoftShadowMap`). Breaks the old "shadows always enabled" invariant on phones by design.
  (4) **Static geometry frozen** — every spawned prop (`spawnProp`) and the ground now bake
  their world matrix once and set `matrixAutoUpdate=false` on the whole subtree, so the
  per-frame `updateMatrixWorld` skips them (scales with prop count; all tiers). Safe because
  level geometry never moves after placement — disguised hiders/characters live in
  `playerMeshes`, and the skydome (repositioned each frame) is separate.

- **Network: idle-move dedupe + eliminated-player omission.** File: `js/network.js`,
  `js/globals.js` (`MOVE_KEEPALIVE_MS`). (1) The client movement loop no longer sends 20
  identical `clientMove` packets/sec while standing still — it skips the send unless the
  transform changed (cm / ~5-milliradian guard), forcing a keepalive at least every
  `MOVE_KEEPALIVE_MS` (1000 ms, well under the 3 s ghost-sweep) so a stationary player is
  never pruned. (2) `buildSnapshot` omits `isCaught` (eliminated) players — both consumers
  (level avatar render, mechanics collider sampler) already fall back to the authoritative
  last-known record when a player is absent, so this is byte-only with no visible change.
  Note: PeerJS here uses the default **BinaryPack** serialization (fixed-width float64), so
  float rounding and pre-serializing a broadcast give no benefit — only packet/field-count
  cuts help this transport.

- **New "Mobile" graphics tier (auto-detected).** Files: `js/level.js` (`QUALITY`,
  `setGraphicsQuality`), `js/app.js` (`isMobileDevice` + fresh-install auto-pick),
  `index.html` (Settings dropdown option). Most aggressive preset: Low's flat look plus
  `pixelRatio` hard-capped to 1, directional shadow map halved to **1024²** (was 2048²),
  and fog pulled in to `fogFar: 70`. Each `QUALITY` tier now carries a `shadowMapSize`
  knob; `setGraphicsQuality` resizes the shadow map live (disposes the old depth map so
  Three rebuilds it). On a FRESH install (no saved settings) `isMobileDevice()` —
  `pointer: coarse` / `hover: none` / mobile UA — defaults the tier to `mobile`.
  Returning users keep their saved choice; still overridable in Settings.

- **Reworked objective-pill text per role.** File: `js/ui.js` (`updateObjective`).
  (1) **Seekers** no longer see the "Exits unlock in m:ss" countdown at all — they show
  `🎯 Hunt the hiders` throughout HUNTING, switching to
  `🚪 Exits are open: Kill the hiders before they escape` once the doors open (was the
  hider-flavoured "EXITS OPEN — escape!"). (2) **Hiders'** unlock countdown now appears only
  *after the last key beam has dropped* — computed as `now >= doorsActivateAt −
  EXIT_ACTIVATE_DELAY_MS` (doors open 60 s after the final purple key beam). Before that they
  show `🏃 Survive!` (or `🔑 Key secured — hold it!` when carrying a key). (3) HIDING-phase
  hider text changed `🫥 Hide — disguise as a prop` → `🫥 Camouflage before hunters arrive`.

- **Unified top-row HUD pill styling into one shared system.** Files: `css/style.css`,
  `index.html`. The upper pills (role/timer `.hud-card`, `#next-drop`, `#objective-hud`,
  `#keys-hud`, `#fps-meter`) shared the `--hud-*` colour/blur/shadow vars but each hardcoded
  its own geometry — different `border-radius` (30 / 16 / 14px), padding and font-size — and
  the `@media (max-height:520px)` block re-shrank each pill with *different* values (only
  `.hud-card` got a radius override), so they diverged further on short viewports. Added
  shared geometry vars (`--hud-radius: 999px`, `--hud-pad`, `--hud-font`, `--hud-gap`) and a
  single grouped base rule so every pill reads identical geometry; only the accent
  border-colour / text colour / extra glow stay per-pill. The media query now overrides the
  vars **once** (`:root { --hud-pad; --hud-font; --hud-gap }`), rescaling all pills together
  so they stay consistent at every viewport. Border **opacity** is also shared via a new
  `--hud-border-alpha` (default `0.5`) — every pill's border reads it (neutral white + the
  gold next-drop / teal objective / purple keys accents + the timer's inline orange in
  `index.html`), so one value moves them all while each keeps its own hue. (Prior per-pill
  alphas were 0.10 neutral / 0.55–0.7 accents / opaque timer — now unified.)

- **Settings/Controls card fits the viewport + scrolls.** File: `css/style.css`. `.settings-card`
  is now a flex column capped at `calc(100dvh - 32px)`; the `.settings-list` grows and scrolls
  internally (`overflow-y:auto`, thin wooden scrollbar) while the title and Save row stay pinned.
  Fixes the bottom rows (Graphics / toggles) being clipped off-screen on shorter windows. Applies
  to both the Settings screen and the in-game Controls panel (both use `.settings-card`).

- **Room-code input opens the numeric keypad on mobile.** File: `index.html`. `#input-room-id`
  gained `inputmode="numeric" pattern="[0-9]*"` (codes are always 4 digits) so phones show the
  number pad instead of the full QWERTY keyboard.

- **Shareable room link + deep-link auto-join.** Files: `index.html`, `css/style.css`,
  `js/globals.js`, `js/ui.js`, `js/app.js`. A 🔗 button beside the lobby room code (revealed by
  `UI.setLobbyCode`, which now stores `currentRoomCode`) builds `…?room=CODE` and opens the OS
  share sheet (`navigator.share` → WhatsApp etc.), falling back to clipboard-copy + a modal on
  desktop. Opening a `?room=CODE` link prefills the code and, if a name is already saved, joins
  straight into the lobby (`handleRoomDeepLink` on menu reveal); first-timers get a
  **stripped-down menu** — only the name field + JOIN (Host button, OR divider and code
  field hidden via `body.join-via-link`), since everything else is irrelevant when you
  arrived through a link. The class is cleared in `UI.transitionToMenu` so leaving the room
  restores the full menu. The query string is stripped after use so refreshes don't re-fire it.

- **Keys pill hidden for seekers.** File: `js/ui.js`. `updateKeysHUD` now shows the
  top-left `🔑 x/y` pill only for Hiders (keys are a hider collect/deposit objective);
  seekers no longer see it. Was previously shown to everyone during HUNTING.

- **Exit doors added to Bazaar / Ruins / Arena.** Files: `js/levels/bazaar.js`,
  `js/levels/ruins.js`, `js/levels/arena.js`. Only `rainbowWoods` had `door` markers, so on
  every other level `Level.buildDoors()` built zero portals — the green EXIT ring never
  rendered when the gate opened, even though the "Exits unlock in…" countdown still showed
  (the schedule is set from purple-beam timing regardless of whether doors exist). Added 3
  `exitDoor` markers per level at spread-out **spawn-adjacent** coords (guaranteed-open,
  reachable): Bazaar (-25,12)/(25,-12)/(0,30), Ruins (38,12)/(-38,-12)/(-4,20), Arena
  (17,8)/(-17,-8)/(0,18). Positions estimated from each level's spawn layout — worth a quick
  in-game check that none sit awkwardly against a wall.

- **Fixed top-left HUD pills overlapping across resolutions.** Files: `index.html`,
  `css/style.css`. `#objective-hud` and `#keys-hud` were each absolutely positioned with
  hardcoded `top` offsets (52px / 88px); the `@media (max-height:520px)` block moved only
  `#keys-hud` to `top:40px`, so on short/landscape screens the keys pill jumped above the
  objective pill and the two collided (and neither tracked the header's real height). Wrapped
  both in a new `#hud-left-stack` — a flex column anchored to the **bottom of the header**
  (`top:100%`, the same trick `#fps-meter` uses) — so they always clear the header at any
  resolution and stack with a gap that can't overlap. The pills lost their individual
  `position/top/left`; the media query now just shrinks padding/font on the wrapper.

- **HUD polish pass — Division-2-style frosted glass.** File: `css/style.css`. Added five
  shared `:root` tokens (`--hud-bg` near-black translucent, `--hud-border` thin neutral edge,
  `--hud-blur` = `blur(12px) saturate(120%)`, `--hud-shadow` soft floating drop shadow,
  `--hud-text-shadow` for legibility) and applied them across the existing HUD pills — header
  cards, right-cluster stats/icon buttons, FPS meter, next-drop, bottom-center health/combat
  row, active-effect, disguise-cd, power-pill, objective + keys pills, and toasts. Each now
  gets `backdrop-filter` blur, a consistent dark translucent fill, white text with shadow, and
  the same floating shadow so they read as one system. Semantic accent border colors (gold,
  green, red, purple, teal) were kept but softened to translucent. No elements added or removed;
  layout/positions unchanged.

- **FPS counter in the HUD.** Files: `index.html`, `css/style.css`, `js/globals.js`,
  `js/app.js`. New `#fps-meter` pinned top-right, directly below the ☰ menu icon (absolute,
  `top:100%` of `.hud-header`, so it doesn't reflow the header row). Gated by a `const
  SHOW_FPS = true` in `globals.js` — flip to `false` to hide; later this hooks into the
  Settings screen. `js/app.js` gained `updateFps()`, called each `animate()` frame; it
  averages frame count over ~0.5 s windows and writes `#fps-value`. `initFps()` reveals/
  hides `#fps-meter` once at load based on the flag. (Meter lives inside `#ui-layer`, so it
  only shows while the in-game HUD is up.)

## 2026-07-02

- **Boot loading screen — swipeable wallpaper carousel + press-enter gate.** Files:
  `index.html`, `css/style.css`, `js/level.js`, `js/app.js`. As the prop-model set grew
  (`Level.loadModels` now pulls ~22 GLBs + 2 character rigs, ~14 MB), the menu was
  appearing over a half-loaded model library. Added a full-screen `#loading-screen`
  (z 200, above the menu and everything): a horizontal **carousel** of the wallpapers in
  `assets/images/` (`loading_screen*.jpg`) that the user can navigate manually — **swipe/
  drag** (pointer events), the **‹ ›** arrows, the **dots**, or **←/→** keys — with a
  gentle 6 s auto-advance that pauses/reschedules around any manual interaction. A live
  candy-green progress bar sits over it. `Level.loadModels(callback, onProgress)` gained
  an optional `onProgress(loaded, total)` hook called after each asset resolves (success
  **or** failure, so it always reaches 100%). `#menu-screen` now starts `display:none`.
  When loading finishes the bar is replaced by a blinking **PRESS ENTER TO CONTINUE**
  button; the menu is revealed only when the player presses **Enter** or **taps that
  button** (tap-anywhere is intentionally NOT used, since swipes own taps). Carousel +
  gate live in `app.js` (`LoadingScreen` module); add files to its `SLIDES` array to
  extend. Boot-only, no protocol change.

- **Prefab preview: clickable ViewGizmo + in-preview collider transform gizmo (W/E/R).**
  File: `editor.html`. Added (1) the same **Unity-style ViewGizmo** the scene editor has
  (the `.view-gizmo` CSS was generalized from `#viewGizmo` so both the scene and the preview
  can host one; `#pfViewGizmo` sits in the preview's top-right). Click an axis ball to snap
  the view (`pfSnapView`), the hub for iso, and the **Persp/Iso** label to toggle projection;
  the pitch clamp widened to ±1.5 rad so the ±Y snaps are drag-reachable too. (Replaced the
  earlier passive AxesHelper triad.) And (2) a **TransformControls collider gizmo** like the
  scene editor: click a
  yellow collider wireframe to select it (highlights cyan), then **W/E/R** = move/rotate/
  scale. `objectChange` writes the piece's live world transform back to its fraction-of-
  bounds `position`/`scale`/`rotation` (`writeSelectedPieceFromMesh`, using the unrotated
  preview prop's frame = center + radius/height); box pieces get x/y/z rotation, round pieces
  y-only. Orbit is suppressed while a handle is dragged; on release it persists + rebuilds
  the wireframes and re-attaches. Clicking a prop that only has its implicit auto collider
  first materializes that piece so it's editable. NEEDS in-browser testing (TransformControls
  integration + viewport math can't be verified headless).

- **Prefab preview: iso/perspective toggle + zoom no longer resets on edit.** File:
  `editor.html`. Added a 🎥 Persp / 📐 Iso toggle button on the Edit-Prefabs preview
  (`togglePfProjection` swaps the camera between `PerspectiveCamera` and an
  `OrthographicCamera` whose frustum tracks `pfDist`, so wheel-zoom works in both). Fixed
  the preview snapping back to the default view whenever a collider value was edited:
  `buildPrefabPreviewContent` now only auto-frames the camera (`pfTarget`/`pfDist`) when the
  selected prefab actually **changes** (tracked via `pfFramedFor`), so editing values keeps
  your current zoom/rotation. Reframes on modal open and on picking a different prop.

- **Collider box pieces can now TILT on X/Z (not just Y).** Files: `js/props.js`
  (`resolveColliders`), `editor.html` (collider panel), `docs/PROP_SYSTEM.md`. A template
  box piece's `rotation` now composes `x`/`y`/`z` (via `_propQuat`) into its axes, so a
  Square collider can be angled into an oriented box / walkable ramp — the OBB math
  (`_obbPiece` axes + world-AABB band) already supported it; only `rotation.y` was being
  read. The Edit-Prefabs collider editor shows **x/y/z rotation for Square pieces**,
  **y-only** for Cylinder/Sphere (the 2.5D solver keeps round footprints upright). No
  change for existing prefabs (x/z default 0); walls' auto-box path is unaffected.

- **Renamed the default "Forest" level to "Rainbow Woods".** Files: `js/levels/forest.js`
  → `js/levels/rainbowWoods.js` (git rename), `js/levels/registry.js` (`LEVEL_FILES`),
  `docs/LEVEL_SYSTEM.md`, `docs/FILE_REFERENCE.md`. The `registerLevel("Forest", …)` call
  is now `registerLevel("Rainbow Woods", …)`; since the lobby carousel shows the registered
  name directly (`LEVELS[].name`) and the default map is `LEVELS[0]`, the level still loads
  first/by-default and simply displays as **Rainbow Woods**. No protocol change (levelName
  is just a string). Older changelog entries below still say "Forest" — that was its name
  at the time.

- **Bazaar v2 — variety pass (+10 more prop types).** Files: `js/levels/bazaar.js`
  (regenerated, 132 props), `js/level.js` (10 more `loadModels` entries), `js/prefabs.js`
  (10 more prefab defs), `testing/tools/gen_bazaar.js` (expanded `SCALE`/`PALETTE` + new
  sections). Moved 12 light GLBs out of `env_modals/` into `assets/models/` and wired the
  usable ones: `amphora fruitcrate hay sack sackpile table` (disguise-crowd variety —
  hideSpot/canDisguise), `tent` (see-under canopy), `lamppost` (thin vertical accent),
  `hut`/`house` (edge-only solid buildings). Result: **disguise variety 4 → 13 types**,
  market tables in every stall, lamp posts down the street, huts + tents at the edges.
  The generator's **R3 `PALETTE`** now spans the new goods, so piles AND gap-fills mix them
  automatically. NOTE: `rug1.glb` (modeled as a vertical tapestry) and `rug2.glb` (a giant
  132×76 plane) were left in `env_modals/` — unusable as floor rugs; `MarketStand_2.fbx` is
  FBX (loader is GLTF-only) → convert to `.glb` to use. Several new models are modeled very
  small/large so their `SCALE` values are big/tiny compensations flagged `~` in the
  generator — **verify hay/sack/tent/lamppost/house sizes in `editor.html`**.

- **New "Bazaar" level + 10 new env prop types.** Files: `js/levels/bazaar.js` (new,
  116 props), `js/level.js` (`loadModels` + new `groundModel`), `js/prefabs.js` (10 new
  prefab defs), `js/levels/registry.js` (added `bazaar.js`), generator
  `testing/tools/gen_bazaar.js` (new). A walled desert marketplace on
  `sandy_ground_texture.jpg`: two rows of **open see-through stalls** (low counter + slim
  posts + a non-colliding awning) heaped with an irregular **disguise crowd** of ~55
  barrels / crates / pots (many identical props = real prop-hunt ambiguity), a central
  **fountain plaza**, a **caravan corner** (carts + goods), a **steps-up corner rooftop**,
  corner boulders/bushes, and walk-through **entrance** arches. New disguisable prefab
  types: `barrel crate pot cart rock2 bush2 bush3` (hideSpot/canDisguise), plus structure
  `fence steps entrance` — all loaded from `assets/models/` (light GLBs moved out of
  `env_modals/`).
  - **Generator now encodes 3 design rules** (portable to the other generators): **R1
    see-through** (only the perimeter + outer-corner landmarks may be tall solids; a build-
    time guard throws on any mid-arena opaque partition), **R2 no-empty-areas** (`fillGaps`
    grids the interior and drops a disguise cluster into every empty non-reserved cell, then
    asserts none remain — filled 3 gaps → 28/36 cells occupied), **R3 variety** (piles/fills
    draw from a weighted `PALETTE` — grow it as new market models arrive to lift variety
    everywhere without touching the layout).
  - **`Level.groundModel`** normalizes every loaded GLB so its bbox bottom sits at y=0,
    wrapped in a Group (the offset survives per-instance cloning, where `applyPropTransform`
    overwrites the root position). No-op for base-origin tree/rock/bush; it's what lets
    center-origin props (barrel/crate/pot) sit on the floor AND disguise without sinking.
  - Model display scales in the generator were derived from each GLB's measured bounding
    box — eyeball-tune in `editor.html` if a prop reads too big/small, and check `steps`
    ascent orientation (its facing was a best guess, not visually verified).

- **Step-up passthrough fix — no more walking THROUGH small rocks.** File:
  `js/mechanics.js`. With `STEP_HEIGHT=0.7`, a small rock (box collider top ≈0.59 but
  visual **mesh** top ≈0.70) let the feet-lifted `blockedAt` clear the short *collider*,
  so the step-up committed the horizontal move — but `_climbFloor`'s seat gate keys off
  the taller *mesh* top (`getPropTop`), so it refused to lift the player: you slid THROUGH
  the rock at ground level. Root issue: step-up cleared on collider height but seating
  gated on mesh height. Fix: step-up now also requires a real landing — added
  `_stepLandingAt(x,z,…)` (which reuses `_climbFloor`, now position-queryable via optional
  `px,pz,py` args) and the per-axis step only commits when there's a climbable surface at
  the target higher than the player (`> localPos.y`). Props whose seat gate fails (small
  rocks) now **block** instead of passing through; genuine steps (curbs, the ramp-top
  platform) still climb. Verified: small rock blocks (`crossed:false`), ramp→platform
  still reaches the top (y 8.63, 0 drop-outs), descent still smooth (0 airborne ticks).
  (If small rocks should instead be *stepped onto* rather than block, that's a one-line
  choice — gate seating on collider top instead of mesh top — say the word.)

- **Movement-smoothness fix — ramp descent no longer bounces; mesh lift no longer pops.**
  Files: `js/globals.js`, `js/mechanics.js`. Two causes of the jerkiness introduced by
  the ramp work: (1) **Descent bounce** (pre-existing, exposed by testing) — walking DOWN
  a ramp the floor drops faster per tick than gravity, so the player launched airborne →
  landed → airborne = a bouncy, uneven descent. Added **ground-snap** (`GROUND_SNAP =
  0.35`): if the player was grounded, isn't rising (not a jump), and the floor dropped by
  ≤ `GROUND_SNAP` this tick, stick to it instead of free-falling. Bigger drops (real
  ledges) still fall; jumps are unaffected (`velocityY > 0` skips the snap). Descent is
  now fully grounded and constant-rate. (2) **Mesh-lift flicker** — `localMeshLift` was
  computed only while grounded, so during the bouncy descent it snapped 0↔0.545 every
  few ticks (visible mesh pop); it also popped in one tick when stepping on/off a ramp.
  Now it eases toward its target (`+= (target−cur)·0.2`), so transitions are smooth; with
  ground-snap keeping you grounded on descents it also no longer flickers. Verified
  in-browser: descent `airborneTicks` 0 (was ~all), lift holds steady then eases out,
  jump still rises+lands, flat ground stays lift 0.

- **Auto step-up — seamless walking over low ledges/stairs (Unity `stepOffset`).**
  Files: `js/globals.js`, `js/mechanics.js`, `docs/CAMERA_AND_CONTROLS.md`. Added
  `STEP_HEIGHT` (**0.7**). `blockedAt` gained an optional `yLift` param that raises the
  tested capsule (`pBottom`/`pTop`) by that much. In `handleLocalMovement`, each axis
  now retries the block test lifted by `STEP_HEIGHT` when grounded — if the lifted
  capsule is clear, the obstacle is a mountable step (not a wall) and the move commits;
  lifting `pTop` too means a step under a low ceiling still blocks (headroom check).
  The `_climbFloor` grace for **upright** surfaces (box + cylinder tops) widened from
  `0.3` → `STEP_HEIGHT` so the floor pass seats the player on the step. Net: curbs/single
  stairs are walked over without jumping, anything taller still blocks. Local-only move
  resolution → no protocol change.
  - **Value = 0.7, not 0.6:** verified in-game (Forest ramp) that a player walking UP a
    ramp onto a flush platform at its top wedged at the seam. Cause: the collider radius
    (≈0.7) stops the player's centre ~0.7 short of the platform's front face while the
    feet are still on lower ramp, so a near-flush junction reads as a **~0.63 step** on
    the steepest (~38°) ramp — 0.6 missed it by 0.03. 0.7 clears with margin. Side effect:
    a few ~0.69–0.7 rock props (1 Forest, 4 Arena) now step-over instead of hard-stopping
    (knee-height — acceptable); everything taller is unaffected.

- **Ramp-crest fix — no more stick/oscillation at the top edge of a ramp.** File:
  `js/mechanics.js`. Root cause was an **asymmetry** between the two ramp functions:
  `_propBlocks` (blocking) samples a **17-point ring** so you're never blocked while any
  part of you is over the slope, but `_climbFloor` (seating) cast a **single centre
  ray**. The instant the player's *centre* crossed the slab's top edge that lone ray
  missed → `_climbFloor` returned the ground → `floorY` collapsed → the player un-seated
  and fell → `isGrounded` went false (which also disabled step-up) → they re-entered the
  slab lower and re-seated → repeat: a visible oscillation that read as "stuck at the top
  edge." Fix: `_climbFloor`'s tilted-box branch now **prefers the centre ray** (so mid-
  ramp seating is unchanged — no hover) and **falls back to the highest reachable ring
  sample only when the centre misses**, so a trailing sample holds you at the top edge
  through the crossover and you crest cleanly. Also the `onSlope` bypass grace and the
  ramp seating grace were unified to `STEP_HEIGHT` (0.7, was 0.3). Verified in-browser
  first against a synthetic tilted slab (crest: old seating → ground 1.5, new → top ~7.2)
  and then **live in-game on the real Forest ramp**: driving the actual `handleLocalMovement`
  up the ramp climbs monotonically, crests, AND steps onto the platform at the top (x 8.5
  → 22, y → 8.63), grounded throughout, zero drop-outs.

- **Cosmetic: local character no longer sinks into a ramp's uphill ground.** Files:
  `js/globals.js`, `js/mechanics.js`, `js/level.js`. An upright character stands at the
  CENTRE ground contact, so a ramp's higher uphill ground pokes up through its lower
  body. Added `localMeshLift` (render-only global): each tick `handleLocalMovement`
  samples the ramp surface at ±radius (x,z) and sets the lift = the uphill rise across
  the footprint (clamped 0–0.6, 0 on flat ground). `updatePlayerMeshTransform` adds it
  to the **local** character mesh only (`mesh === playerMeshes[myId]`) so its base clears
  the slope. Chose the simple "nudge up" over slope-aligning the character (per user).
  Verified: lift 0 on flat/platform, ~0.545 across the Forest ramp (≈ slope×radius). Does
  NOT touch localPos → collision, camera, and networking are unaffected; remote players
  (interpolated, far) are left as-is. Note: with no lean, the downhill side floats a bit
  — the accepted trade of the nudge approach.

- **New "Ruins" level — large 88×88 compound (~4× Arena's area).** Files:
  `js/levels/ruins.js` (new, 130 props), `js/levels/registry.js` (added `ruins.js` to
  `LEVEL_FILES`), generator `testing/tools/gen_ruins.js` (new). A jump-proof perimeter
  (height-10 `rock_wall.png`) encloses a **central "broken rotunda"** — a climbable stone
  dais (two skewed steps → a vantage) topped by a tall spire, ringed by ruined columns of
  uneven heights with scattered rubble rocks (a distinct stone landmark, deliberately NOT a
  crate pyramid like Arena's). Around it: an **inner keep** (square wall ring with a gate on
  each side + rock/bush rubble bastions) whose courtyard rings the centre with identical
  bushes/rocks for disguise, and **four themed outer districts** — grove (trees+bushes),
  boulder field (rocks), an irregular **crate yard**, thicket (dense mix) — one per quadrant,
  so the corners read distinctly while the layout stays 4-fold symmetric. **Crates are the
  exception to the symmetry**: none are placed by rotation — the depot is a hand-scattered
  heap and a few strays sit off it, so crates never read as a mirrored set. Seeker spawns at
  the south gate; 8 hider `spawnPoint`s ring the road/districts. Ground = `grass1.jpg`.
  Verified: only the 4 perimeter walls touch the edge, 0 crates have a rotated twin, and no
  climbable crate near the wall tops above ~5 (so the height-10 wall stays un-hoppable given
  the ~4-unit jump).

- **"Seeker" renamed to "Hunter" in the UI (display-only).** Files: `js/ui.js`, `js/level.js`.
  New `UI.roleLabel(role)` maps `Seeker → Hunter`; used by the lobby role toggle + chip,
  the in-game role badge, the players list, and the lobby warning. Nameplate fallback shows
  `HUNTER`. The internal role id stays `'Seeker'` everywhere (logic/protocol unchanged).

- **Heal power now plays a proper restore chime.** Files: `js/globals.js`, `js/network.js`.
  Added `Sound.heal()` — a warm rising major arpeggio (C5-E5-G5-C6, sine, bell decay) —
  played to the local player when the heal power restores health (with the existing
  "HEALTH RESTORED" flash). Previously the only power-use audio was the pickup coin blip.

- **Material Library — named material presets (editor → export → game).** Files:
  `js/materiallibrary.js` (new), `index.html`, `editor.html`, `js/props.js`, `js/level.js`.
  - New `js/materiallibrary.js` defines `MaterialLibrary` = named presets
    `{ albedo, opacity, emission, emissionIntensity, metalness, roughness, texture,
    tileX, tileY }`. Loaded before `props.js` in both `index.html` and `editor.html`.
  - `PropLevel.applyMaterialPreset(mesh, name)` clones the mesh's materials (so GLB
    instances don't leak the look) and paints them; marks `_customPreset` so foliage-tint
    leaves them alone. `exportProp` emits `prop.material`; `spawnProp` applies it on load.
  - **Editor:** Materials panel gained a **Library** dropdown + **Apply**, and a 📚 button
    opening a **Material Library** modal (click a preset to paint the selection · *Save
    current material as <name>* · **Export** the drop-in `materiallibrary.js` text to paste
    back into the file — same flow as Export Level / prefabs.js). Import restores
    `prop.material`.
  - **Ad-hoc edits export too:** `prop.material` may be a preset NAME (string) OR an inline
    values OBJECT. Live slider/colour tweaks (not saved to the library) are captured into an
    inline `data.material` (`_afterMaterialEdit` → `_presetFromMaterial`) so they travel with
    the level export; `applyMaterialPreset` accepts either form; **Reset** clears it.
    (Uploaded image maps still need Save-to-`.glb` / a library texture — a data-URL can't be
    inlined.)

- **Airdrop-beam schedule now derived from match length.** Files: `js/globals.js`,
  `js/network.js`, `js/ui.js`. Replaced the fixed `GOLD_BEAM_TIMES=[120,360,600]` /
  `PURPLE_BEAM_TIMES=[180,420,660]` lists with `computeBeamSchedule(huntLen)`, which
  builds both schedules from the configured hunting time. Gold count `≈huntLen/170`
  (1–8) spread across `[head … huntLen−30s]`; purple count `KEYS_TO_WIN + ⌊(huntLen−300)/300⌋`
  clamped 3–6, endpoint-spread across `[head … huntLen−100s]` (100s tail reserves
  door-open + run-to-exit). `head = max(60, 0.12·huntLen)`. Gold uses midpoint spacing so
  it interleaves with the endpoint-spread purple. **Fixes a live bug:** the old fixed list
  gave 5–11 min matches too few purple beams to ever reach `KEYS_TO_WIN`, so the key-win
  path (and the exit doors) silently never opened; now every match length — down to the
  5-min minimum — fits ≥3 purple beams with time to deposit. Deterministic (no jitter) so
  the "Next Drop" HUD (`UI.updateNextDrop`) recomputes the host's exact schedule locally
  with no new packets.

- **Combat rebalance: faster seeker weapon, tankier hiders.** File: `js/globals.js`
  (`js/mechanics.js`, `js/network.js`). Fire rate **2→4 shots/s** (`FIRE_INTERVAL_MS
  500→250`), magazine **4→8** (`MAG_SIZE`). To compensate: hider HP **5→12**
  (`HIDER_MAX_HP`) and per-hit damage is now a named `SHOT_DAMAGE=1` const
  (`processShot` uses it instead of a literal −1). Mag (8) < hits-to-kill (12) so a single
  magazine can't solo-eliminate a hider — at least one reload is always forced. Mobile
  hold-to-fire poll tightened `100→50ms` so held fire can actually reach 4/s against the
  250ms gate.

- **Editor: material + texture editing now works on multi-selection.** File: `editor.html`.
  - **Choose Texture** picker (cube/wall) shows whenever ≥1 texturable prop is selected and
    applies the texture + Tiling X/Y to ALL selected texturable props (header shows the
    count). New `_texturableSelection()` / `_texturableLead()` helpers.
  - **Materials** editor (albedo / opacity / emission / metallic / roughness / map
    upload+clear + Reset) now targets every material of every selected object via
    `_matEditTargets()`; the panel seeds from the primary (`_matLead`/`_displayMat`).
    The per-material dropdown stays single-object-only; Save-to-`.glb` alerts if >1 selected.
    Previously both sections were single-selection only ("Select one object to edit materials").

- **Per-level custom ground texture (editor → export → game).** Files:
  `js/levels/registry.js`, `js/level.js`, `js/network.js`, `editor.html`.
  - `registerLevel(name, props, options)` gained an optional 3rd arg;
    `options.ground = { texture, tileX, tileY }` picks the ground surface. Older 2-arg
    level files are unaffected (`options` defaults to `{}`).
  - `Level.applyGroundTexture(cfg)` swaps the ground plane's map + tiling (falls back to
    grass when a level has none). `loadLevel(props, options)` applies it; `setGraphicsQuality`
    now **skips the grass tint** for a custom ground (so a non-grass surface isn't
    green-shifted). `Net.getLevelOptions(name)` feeds both `loadLevel` call sites + init.
    Only the level NAME is synced (options are bundled, identical on every peer).
  - **Editor:** new **Ground** panel (texture dropdown + Tiling X/Y + ↻ rescan + ↺ reset)
    live-previews on the editor ground plane. Export appends `options.ground` to the
    `registerLevel(...)` string only when a custom ground is chosen; import parses the
    trailing options object and restores it. So `forest.js` etc. now carry ground details.

- **Power HUD feedback: heartbeat active-effect + pickup pop.** Files: `css/style.css`,
  `js/ui.js`.
  - **`#active-effect`** now *continuously* beats like a **heartbeat** (one quick size +
    glow thump, then a rest) while an effect is live, via an `ae-heartbeat` animation on the
    `#id` (survives `updateActiveEffect` re-setting `className` each frame). Glow colour is
    variant-aware through a `--ae-glow` CSS var (amber = countdown, green = toggle, red =
    instant); the scale keyframes keep the `translateX(-50%)` centering.
  - **Power pickup pop:** the moment a hider acquires a power, the held pill (PC) / power
    button (mobile) flashes a one-shot grow + gold flare. Driven in JS by the new
    `UI.pulsePickup(el)` via the **Web Animations API with `composite:'add'`** so the pop
    scale composes with the layout editor's inline `transform: translate(-50%,-50%) scale()`
    on the mobile button — a plain CSS `transform` animation dropped that translate and made
    the button jump then snap back. `UI.updatePowerHUD` triggers it on the none→held
    transition (`_heldPowerShown`).

- **New Arena level — symmetric vertical "Colosseum".** File: `js/levels/arena.js`
  (fully replaced the old one-sided cramped layout; still registered via `arena.js` in
  `registry.js`, no wiring change). 79 props, 4-fold rotationally symmetric inside a 44×44
  perimeter-walled ring: a **central 3-tier climbable crate ziggurat** (disguisable cubes)
  as the high-ground landmark, **four corner bastions** (crate steps up onto the wall + tree
  + rocks + bushes), **four mid-edge cover walls** with flanking rocks/crates, a **scatter
  ring of 8 identical bushes + 8 rocks** so hiders have a crowd of matching props to disguise
  into, and **four pinwheel interior walls** for sightline breaks. Seeker spawns at the south
  gate; five hider `spawnPoint`s ring the arena. Gameplay flags are omitted so props inherit
  the prefab defaults (everything climbable — fixes the old baked `climbable:false` TODO for
  this map). Walls/cubes sit on the ground via `y = scale.y/2`; crates use `crate.png`.

- **Fixed: revealed hider sank into the ground after being hit.** File: `js/network.js`
  (host `shot` resolution + client `shot` handler, both `forcedOut` branches). A disguised
  hider's body center `y` sits at `propRadius`; the revealed character mesh renders feet at
  `y − PLAYER_BASE_HEIGHT` (≈1.5). For short props (bush/rock, radius < base height) the
  forced-out reset left `y` too low, so the character rendered sunk underground until the
  next position packet. Now the forced-out reset lifts `y` by
  `PLAYER_BASE_HEIGHT − propRadius` (keeping the feet on the same ground) on the host, on
  remotes, and for the local hider (`localPos.y`) so its next broadcast is already correct.

- **Announcement banner redesigned + two-line API.** Files: `css/style.css`
  (`#center-announce`, `.ca-item` + `.ca-sub`/`.ca-title`/`.ca-emoji`/`.ca-txt`, `ca-rise`),
  `js/ui.js` (`UI.announce`), `js/network.js`. `UI.announce(title, subtitle, opts)` now
  renders a beveled **hexagon** panel with a translucent dark fill (scene stays visible
  through it via `backdrop-filter`), a glowing cyan edge, a small subtitle on top, and a
  big cyan→magenta **gradient title** below. A leading emoji is split off the title so it
  keeps full colour (a gradient text-clip would render it invisible in Chrome). Back-compat:
  `announce(text)` / `announce(text, opts)` still work. New pickup texts:
  🔑 Key / Collected · ❤️ Full Heal / Picked Up · 👻 Ghost / Picked Up ·
  🛡️ Disguise Shield / Picked Up · 📡 Scan / Picked Up · 🚫 Jammer / Picked Up ·
  🎯 One-Shot Kill / Picked Up. (The old "— Press E" / "hiders revealed" hints were dropped.)

- **Removed the power-*use* toasts.** File: `js/network.js` (`applyPowerUse`). Dropped the
  "❤️ Full health restored", "👻 Invisible for 10s", and "🛡️ Disguise shield armed" corner
  toasts shown when a hider activates their held power. Heal still flashes "HEALTH RESTORED"
  in the `#active-effect` indicator; invis/shield render from their own state.

- **Pickups now show as AAA-style centre-screen banners (not corner toasts).** Files: `index.html`
  (`#center-announce`), `css/style.css` (`.ca-item` + `ca-rise` keyframes), `js/ui.js`
  (`UI.announce`), `js/network.js`. Power/key **pickups** call `UI.announce(text)` → a big bold
  uppercase white banner with a black shade, held ~50% opacity, rising up and fading (like a
  level-up) at screen centre. Rerouted: hider power pickup (`applyPowerGain`), seeker power pickup,
  and key pickup (`applyKeyGain`). The redundant "Invisible for Ns" pickup toast was dropped (the
  `#active-effect` bar shows it). Other events (hits, deposits, seeker-alert-to-hiders) stay toasts.

- **HUD rework: center reload ring + power HUD split into held-pill vs active-effect.** Files:
  `index.html`, `css/style.css`, `js/ui.js`, `js/network.js`.
  - **Reload → screen centre (PUBG-style):** removed the bottom `#reload-indicator`; added
    `#reload-ring` at the crosshair — a conic-gradient ring (masked to a ring) that fills over
    `RELOAD_MS`. While reloading the crosshair hides and the ring shows; `updateHUD` sets the sweep
    via a `--p` CSS var from `reloadUntil`. The combat pill still flips ammo to `RELOAD`.
  - **Power HUD split:** `#power-pill` (bottom-center-RIGHT) now shows ONLY a hider's *held*
    (un-activated) power `… [E]` (PC; suppressed on mobile where the button shows it). A NEW
    `#active-effect` indicator (bottom-center, above the health/combat pill) shows the *active*
    effect by type — **countdown** (invis/scan/kill/jammer → depleting bar), **toggle** (shield →
    "SHIELD ACTIVE", persists), **instant** (heal → brief "HEALTH RESTORED" flash via
    `UI.flashEffect`). `UI.updateActiveEffect` picks one by priority; `#toast-container` bumped up
    to clear it.
  - **State (`js/network.js`):** added `invisTotalMs` (so the invis bar knows 5s-pickup vs
    10s-power) and a seeker-side `jamUntil` (jammer now has its OWN countdown — previously only
    hiders' `disguiseLockUntil` was set). Set in `grantPower`/`handleActivate`/`applyPowerGain`/
    `applyPowerUse` and cleared on round reset. `scan`/`kill`/`jam` bars use the fixed
    `POWER_*_MS` constants.

- **HUD: timer moved to top-left, disguise-lock alert moved to the top-centre slot it vacated.**
  File: `css/style.css` only. `#timer-card` was absolutely centred (`left:50%`); it now flows in the
  `.hud-header` row right after `#role-card` (top-left, `.hud-header` already has `gap:8px`).
  `#disguise-cd` moved up from `top:70px`→`top:12px` (compact `48px`→`8px`) so the "DISGUISE LOCKED"
  alert occupies the freed top-centre spot. No HTML/JS changes.

- **Power ability HUD: no longer duplicated on mobile + button sized to match the disguise button.**
  Files: `js/ui.js` (`updatePowerHUD`), `css/style.css`.
  - **De-dupe on mobile:** the held power showed BOTH in the bottom-center `#power-pill` and on the
    mobile `#btn-action-power`. Now the pill is suppressed for the held-power state when mobile
    controls are visible (`GAME_SETTINGS.showMobileControls`) — only PC players (no mobile controls)
    see the pill for it. Active-effect countdowns (hider invis, seeker scan/kill) have no mobile
    button, so they keep the pill regardless.
  - **Consistent button:** `.action-btn.power-btn` was 70px (compact 60px) vs the disguise/shoot
    button's 128px (compact 100px), so its `DISGUISE SHIELD` label looked cramped/smaller. The power
    button now matches that size, and `.pb-label` matches `.db-label` typography (`0.82rem`/compact
    `0.68rem`, uppercase, `letter-spacing:1px`), with a larger `.pb-icon`. Default control-layout
    positions don't overlap at the new size (verified geometry); still Edit-Layout adjustable.

## 2026-07-01

- **Per-instance texture tiling (Unity-style Tiling X/Y) for cube + wall.** Files: `js/props.js`,
  `editor.html`. Fixes the stretching compromise — a single texture copy was stretched across each
  face (`repeat 1,1`).
  - **`js/props.js`:** `getPropTexture(filename, repeat)` now caches per **(file, tilingX, tilingY)**
    (key `name@RxXR`), so each unique tiling gets its own `THREE.Texture` while identical configs
    still share one (50 crates @2×2 = one texture). `createCubeMesh`/`createWallMesh` pass the
    instance's `tileX/tileY` (defaults via new `defaultTilingFor(model)` → wall `2,2`, else `1,1`);
    `applyPropTexture(mesh, file, repeat)` takes the repeat. `exportProp` emits `tileX/tileY` only
    when they differ from the model default, and — because tiling only works through the
    per-instance path — a tiled wall also emits a `texture` (default `wall.png`). Plain walls stay slim.
  - **`editor.html`:** the **Choose Texture** panel gained a **Tiling  X [ ]  Y [ ]** row
    (`#texTileX`/`#texTileY`) with **drag-to-scrub** labels (reuses `attachLabelScrub`: the *Tiling*
    label scrubs both axes, *X*/*Y* scrub each; Shift = fine). Editing it updates the prop live
    (`_dataTiling` helper); on a plain wall, changing tiling assigns the current texture so it leaves
    the shared `wall.png` and honors the tiling. `refreshTextureSection` syncs the inputs;
    import/duplicate carry `tileX/tileY`. `onTile` listens on both `input` (typing/spinner) and
    `change` (fired by the scrub gesture).
  - **Scoped out:** cube *disguises* use default tiling (1,1) — tiling isn't threaded through the
    disguise/network fields (niche; easy follow-up).

- **Editor: W/E/R gizmo shortcuts no longer swallowed by a focused checkbox/button.**
  File: `editor.html` (keydown handler). The guard that suppresses shortcuts while
  typing was blocking on *any* focused `<input>`. Clicking the **Uniform Scale**
  checkbox (or any checkbox/button) left it as `document.activeElement`, and since
  hovering the scene doesn't move focus, W/E/R (Move/Rotate/Scale) stopped working.
  The guard now only blocks for `TEXTAREA` and text-entry `INPUT`s (text/number/
  search/etc.), letting `checkbox|radio|button|submit|reset|range|color|file`
  through.

- **New `cube` prop + per-instance selectable textures for cube AND wall (editor + runtime).**
  Files: `js/prefabs.js` (cube prefab), `js/props.js` (mesh + texture + export), `editor.html`
  (palette, picker, `?v=8`), disguise plumbing across `js/mechanics.js` / `js/network.js` /
  `js/globals.js` / `js/level.js`.
  - **Prefab:** `cube` = `collision:true, climbable:true, hideSpot:false, canDisguise:true,
    colliderShape:'box'` — a climbable, disguisable box that reuses the wall OBB collider path.
  - **Mesh/texture (`js/props.js`):** `createCubeMesh(prop)` / `createWallMesh(prop)` build a unit
    `BoxGeometry` with a per-object `MeshLambertMaterial` (`toneMapped:false`) whose map comes from
    `getPropTexture(filename)` — a cache-by-filename loader for `assets/textures/<file>` (shared
    texture objects, never disposed on swap). `applyPropTexture(mesh, file)` live-swaps (renamed
    from the cube-only `applyCubeTexture`). **Cubes** always carry a texture (default `crate.png`);
    **walls** keep the shared `wall.png` (`_wallMats` global swap) unless overridden — an overridden
    wall's material is kept OUT of `_wallMats` so a late `wall.png` load can't clobber it.
    `createPropMesh` gained a `cube` branch + passes `prop` to `createWallMesh`; `exportProp` emits
    `texture:"<file>"` for every cube and for walls **only when overridden** (plain walls stay slim).
    Defaults + `TEXTURABLE_MODELS`/`defaultTextureFor()` live on `PropLevel`.
  - **Editor:** new **Cube** palette button; a generic **Choose Texture** inspector panel (shown
    for a single cube OR wall) with a `<select>` populated by scanning `assets/textures/` via the
    dev server's directory index + a **↻ Refresh** button (copy a new image in, Refresh, it
    appears). Falls back to a hardcoded list if no index is served. Picking a texture updates the
    prop live and is stored on the instance for export. `cube` added to `PREFAB_TYPES` (editable in
    Edit Prefabs); editor script loads bumped `?v=7`→`?v=8` so it sees the new `props.js`/`prefabs.js`.
  - **Disguise:** a new `propTexture`/`disguiseTexture` field is threaded exactly like
    `propRotation` (init, `sendDisguiseUpdate`, host + client apply, every forced-out/round reset)
    so a hider disguised as a cube shows the correct texture on all peers;
    `getDisguiseMeshKey` includes it and `createDisguiseMesh` takes a texture arg. (Walls aren't
    disguisable.)

- **Edit Layout: power button is now editable + per-control Size & Opacity (PUBG-style).**
  Files: `js/layout.js` (`LayoutEditor` rework), `index.html` (sliders in `#layout-editor`),
  `css/style.css` (force `#btn-action-power` visible/draggable while editing; `.le-sliders`
  / `.le-selected` styles), `js/globals.js` (model comment), `js/mechanics.js`
  (`handleJoystickTouch` scale fix).
  - **Power button was undraggable** because the `.layout-editing` CSS only force-showed
    shoot/prop/joystick/jump — `#btn-action-power` (hider-only, normally shown only while
    holding a power) stayed hidden/unoutlined. It's now in both the force-visible and the
    draggable-outline rules, so it can always be placed.
  - **Size + Opacity sliders**: the layout model grew from `{x,y}` to `{x,y,scale,opacity}`
    (scale/opacity default to 1, so older saves still load). **Tap a control** to bind it to
    the Size (0.6–1.6) and Opacity (0.2–1) sliders — the bound control gets a green outline;
    dragging still moves it. Size applies as a CSS `transform … scale()` about the element
    centre (anchor stays put); opacity is inline. `applyStyle` restores both at startup;
    Save persists them; Reset returns everything to `DEFAULT_CONTROL_LAYOUT` at scale/opacity 1.
  - **Joystick nub scale fix**: the nub lives inside the (now scalable) zone, so its translate
    was multiplied by the zone's scale — `handleJoystickTouch` divides `dx/dy` by
    `rect.width / zone.offsetWidth` so a resized joystick tracks the finger 1:1 (movement
    input `touchVector` was already correct — screen-space).

- **Fix: disguise button now reflects the prop you're standing beside, not an instant
  RESET.** Files: `js/ui.js` (`updateHUD` disguise-button branch) + `js/mechanics.js`
  (`handleDisguiseSwap`). Previously, the moment you disguised, the mobile action button
  flipped to RESET regardless of where you were. Now the button's target is driven by the
  nearest disguisable prop (`Mechanics.findNearestDisguiseProp`):
  - Disguise as a prop and **stay next to it** → the button keeps showing that prop (icon +
    name), not RESET. Only when you **walk away** from every disguisable prop does it fall
    back to RESET.
  - Disguised as a rock and **move next to a tree** → the button now shows TREE and pressing
    it switches you **straight from rock → tree** (no reset step). `applyDisguiseFromProp`
    already overwrites `localDisguise` wholesale, so switching from one disguise to another
    is clean.
  Both the label (ui.js) and the action (mechanics.js) share the same precedence:
  *near a prop & not locked* → (re)disguise/switch → else *disguised* → RESET → else *locked*
  → countdown → else disabled `PROP`. RESET still works while the post-hit disguise lock is
  active (only re-disguising is blocked).

## 2026-06-30

- **Feature: ramps / tilted slabs are now walkable.** File: `js/mechanics.js`
  (`_climbFloor` + `_propBlocks`, both gated to tilted boxes via `|c.ay[1]| <= 0.999`).
  A wall rotated on X/Z (e.g. `wall_135`, `z:37.9°`) gets a correctly tilted OBB collider
  from the OBB rework, but the movement code only knew flat tops, so you couldn't walk up
  it. Now:
  - **Climb**: for a TILTED box, `_climbFloor` casts straight down onto the slab and stands
    you on the ACTUAL surface under you (rises as you ascend) instead of the flat AABB top.
    Upright boxes keep the validated mesh-top behaviour (no regression).
  - **Collision**: `_propBlocks` adds a ramp bypass — a tilted slab's surface sits below its
    conservative AABB ceiling `c.yMax`, so a slope-stander would be wedged in the band.
    A down-ray ring (centre + 8 dirs at `myRadius` + 8 at half-`myRadius`) checks if the
    player's feet are on/above the slope; if so it doesn't block. The dense ring is what
    lets you MOUNT the low leading edge (where the centre column is still just off the
    footprint) without a coarse-ring dead gap.
  Gated to tilted boxes, so upright walls/rocks/trees are byte-identical (and skip the
  extra rays). Verified in-browser on the real `wall_135` collider: the player mounts from
  flat ground and walks the full 37.9° slope bottom→top (y 1.5→~8) and back down; upright
  walls still block from the side; rocks/trees/bushes unchanged. *Caveats:* (1) props
  physically placed ON a ramp (e.g. `bush_15`/`bush_87` sit on `wall_135`) correctly block
  the path — move them for a clear run; (2) very steep ramps at high run speed could
  out-pace the 0.3 climb tolerance per frame — fine at 37.9°; (3) the ramp bypass costs
  ~17 short ray casts per tilted box per move check (negligible for a few ramps).

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
