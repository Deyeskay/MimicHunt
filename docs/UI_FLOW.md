# UI Flow

Screens are absolutely-positioned overlays toggled by `UI.transitionTo*`
(`js/ui.js`). HUD/menus styled in `css/style.css`. Markup in `index.html`.

## Screens (DOM, in `index.html`)
- `#rotate-overlay` — portrait-only "rotate device" cover (landscape lock).
- `#menu-screen` — **legacy/unused DOM** since the PUBG-lobby redesign (2026-07-08). The
  app now auto-hosts on load and lands directly in `#lobby-screen`; the old name +
  Host/Join card is no longer shown (its `#btn-host`/`#btn-join`/name-input handlers stay
  bound but dead). `UI.transitionToMenu` is likewise dead code.
- `#settings-screen` (`.settings-pubg`) — **dark PUBG-style panel matching the lobby**,
  split into **BASIC / ADVANCED** tabs (`.settings-tab[data-tab]` → shows/hides the
  matching `.settings-group`; wired by `wireSettingsTabs` in `js/app.js`). Header = back
  arrow (`#btn-back-menu`, ← returns to the **lobby** when opened from it via the
  `settingsFromLobby` flag, else the legacy menu) · title · tab switch. Footer = full-width
  **SAVE** (`#btn-save-settings`). **BASIC** → *Match* (hiding time sec, hunting time min)
  + *Display* (Graphics, show-mobile-controls toggle). **ADVANCED** → *Camera* (camera
  sensitivity, camera FOV, invert-Y toggle) + *Combat & Aim* (shoot sensitivity, gyro aim,
  gyro sens). Rows keep the shared `.setting-row`/`.set-icon`/`.setting-value`/
  `.setting-select`/range/checkbox structure re-skinned dark (all input ids unchanged, so
  the `js/app.js` bindings are untouched). The hunt-time slider edits minutes but
  `GAME_SETTINGS.huntingTime` is stored in **seconds** (×60 on Save; ÷60 + clamp on load,
  which also normalises legacy seconds-based saves). Sliders apply live (sensitivity via
  `GAME_SETTINGS`, FOV via `Level.setFov`); Save persists to `localStorage`.
- `#lobby-screen` (`.lobby-pubg`) — **full-screen PUBG-style lobby overlaid on a live 3D
  backdrop** (`#gameCanvas` renders `Level.lobbyScene`, a row of idle character models —
  one per `gameState.players`, with name/role sprite labels + a gold ✓ when ready). The
  container is `pointer-events:none`; only `.interactive` corner controls catch input:
  top-left contextual **START GAME**/**READY** (`#btn-lobby-action`) + map/role `<select>`
  (`#lobby-map-select`/`#lobby-role-select`); top-right gear (`#btn-lobby-settings`) +
  name pill (`#lobby-name-pill`); bottom-left is a two-row stack (`.lobby-bl`) — top row
  **JOIN** (`#btn-lobby-join` → `#lobby-join-pop` popover) + **invite** (`#btn-share-room`
  🔗), bottom row **refresh** (`#btn-lobby-refresh` ⟳ → confirm → new room code) + room
  code (`#lobby-title`); bottom-right leave (`#btn-lobby-leave`,
  now behind a "Leave lobby?" confirm); bottom-centre status/warning
  (`#lobby-subtitle`/`#lobby-warning`). The refresh/JOIN/leave trio is reconciled per role
  & occupancy by `UI.updateLobby` (see below).
- `#ui-layer` — in-game HUD + crosshair + mobile controls (`pointer-events:none`
  except `.interactive` children).
- `#blind-overlay` — seekers' "YOU ARE BLINDED" during HIDING.
- `#custom-modal` — generic modal: `UI.showModal(title,msg,cb)` (single OK) for
  win/room events, or `UI.showConfirm(title,msg,onConfirm,label)` (Yes/Cancel via
  `#modal-cancel-btn` + `.modal-actions`) — used by the Exit Match confirm.
- `#results-screen` — **End-Game results scoreboard** (fixed, z-300, above everything).
  `UI.showResults(title,message,rows)` fills `#results-body` (per-player table: Player ·
  Role · Result · Kills · Score · Keys · Survived · XP, sorted by XP; the local row is
  highlighted). **Back to Lobby** (`#results-lobby-btn` → `Network.returnToLobby()`)
  rematches into the SAME room; **Leave** (`#results-leave-btn` → `Network.leaveMatch()`)
  tears down. `UI.hideResults()` clears it (also called from every `transitionTo*`).
- `#spectate-bar` (inside `#ui-layer`, `.interactive`) — shown to ELIMINATED players
  during HIDING/HUNTING by `UI.updateSpectate()` (from `updateHUD`); ‹ / › cycle the
  live player being watched (`Network.cycleSpectate(±1)`), name in `#spectate-name`.
- `#gameCanvas` — the Three.js canvas (z-index 1, behind the UI layer).
- `#tutorial-layer` — the interactive **training/tutorial** overlay (z-index 150, above the
  HUD/menu/layout-editor, below the results screen). `pointer-events:none` except the coach
  dialogue box. Holds `#tut-dim` (screen darkener), `#tut-ring` (spotlight cutout via a huge
  `box-shadow`; `.soft` = glow only, no dim), `#tut-arrow`, and `#tut-dialogue` (title / step
  counter / body / Next / Skip). Driven by the `Tutorial` engine — see
  [TUTORIAL_SYSTEM.md](TUTORIAL_SYSTEM.md). Launched from the lobby **START TRAINING** button
  or the first-run auto-prompt.

## Flow
```
boot ──auto-host (or ?room= auto-join)──► lobby ──(all ready, ≥1 hider & ≥1 seeker)──► game(HIDING→HUNTING)
                          ▲   ▲                                              │
   JOIN code (switchToClient) │        gameOver ──► results screen ──────────┤
                          │   └──── Back to Lobby (returnLobby, peer kept) ◄──┤
                          └── Leave / roomClosing / host-alone ──► cleanup ──► FRESH auto-hosted lobby
                              (migration may drop clients into a new host's lobby)
```
- **No menu screen.** The app auto-hosts on load (`Network.autoHostLobby`); a `?room=`
  deep link auto-joins instead. `cleanup()` re-auto-hosts (never a dead menu) unless
  called with `rehost=false` (e.g. `switchToClient` about to `initClient`).
- **`gameOver` no longer tears down.** The match-end path shows `#results-screen`; the
  peer stays alive so **Back to Lobby** (`returnToLobby`) resets the round in place and
  bounces everyone to the SAME lobby for a rematch — no re-host/re-join. Only **Leave**
  (or `roomClosing`/host-alone) runs `cleanup()` back to the menu.
- `transitionToGame`: hide menu/lobby, show `#ui-layer` + canvas, `Level.resize()`.
- `transitionToLobby` / `transitionToMenu`: hide game view (so the crosshair/HUD
  hide with `#ui-layer`).

## In-game HUD (`UI.updateHUD`, runs ~every frame)
Top header (`.hud-header`, one nowrap row). Left = `.hud-card` pills; right =
`.hud-right` icon cluster (`margin-left:auto`, transparent, thin `.hud-div` dividers):
- **Role badge** (`#role-card`/`#role-badge`, `YOU — ROLE`; hider shows `(ELIMINATED)`
  when caught). Pill border tinted by role (green hider / red seeker).
- **Timer** (`#timer-card`, `PHASE: mm:ss`): absolutely centred along the top of the
  header (role badge stays left, icon cluster right).
- Right cluster (icon-only, premium): **player count** (`👥 N`, `.hud-stat.interactive`
  `#player-count-card` → click opens `#players-modal` roster via `UI.showPlayerList()`)
  │ **fullscreen** (`#btn-fullscreen .hud-icon-btn .fs-toggle`)
  │ **menu** (`#btn-leave .hud-icon-btn`, hamburger ☰ → toggles the `#game-menu`
  dropdown: **Edit Layout** opens `LayoutEditor` / **Exit Game** → `UI.showConfirm` exit).
  Note: fullscreen toggle now targets `.fs-toggle` (not `.fs-btn`) so other
  `.fs-btn`-styled icons (e.g. the menu settings gear) aren't hijacked.

Bottom-center (`.bottom-center-hud`, absolutely positioned):
- **Health bar** (`#health-hud`/`#hp-fill`, Hider in-game): width = HP/MAX, green→
  orange→red (220px track).
- **Combat HUD** (`#combat-hud`, Seeker+HUNTING+alive): `🔫 ammo/MAG · ⭐ score`
  (or `RELOAD`), blue border. Sits in the same bottom-centre slot as the hider health
  bar (mutually exclusive by role).
- **Active-effect** (`#active-effect`, above the bottom pill, `bottom: 72px`): the current
  active power effect, rendered by type by `UI.updateActiveEffect` — **countdown**
  (`.ae-count`: invis/scan/kill/jammer → `#ae-bar` depletes over the effect duration),
  **toggle** (`.ae-toggle`: shield → "SHIELD ACTIVE", persists until lost), **instant**
  (`.ae-instant`: heal → brief "HEALTH RESTORED" flash via `UI.flashEffect`).

Plus: centered `#crosshair` (Seeker+HUNTING+alive; `UI.hitMarker()` flashes it red
on a landed hit). While a seeker **reloads**, the crosshair hides and a center **reload
ring** (`#reload-ring`, conic-gradient sweep driven by a `--p` var from `reloadUntil`)
fills over `RELOAD_MS`. Mobile **SHOOT** (seeker) / circular **disguise/switch** button
(hider) toggled by role.

**Power pills:** `#power-pill` (bottom-center-RIGHT) shows a hider's *held* un-activated
power `… [E]` (PC only; on mobile the `#btn-action-power` button shows it and the pill is
suppressed). Seekers have no held state (powers auto-activate on pickup) — their effect
shows only in `#active-effect`. Driven by `UI.updatePowerHUD`.

**Disguise/switch button** (`#btn-action-disguise .disguise-btn`): a circular button
with a glowing ring and stacked spans — `#db-swap` (🔄) / `#db-icon` (prop emoji via
`UI.propIcon`) / `#db-label` / key hint `[F]`. State precedence in `updateHUD` (driven
by `Mechanics.findNearestDisguiseProp`): **near a disguisable prop & not locked** →
green ring, label = prop name, enabled — pressing disguises OR switches straight to it
(so a disguised hider standing beside a prop shows that prop, not RESET, and can go
rock→tree without resetting); else **disguised** → `.db-reset` blue, label RESET; else
**post-hit cooldown** → `.db-locked` red, label `N.Ns`, disabled, ring stays vivid; else
disabled `PROP` placeholder (not near any prop). `handleDisguiseSwap` mirrors the same
precedence (RESET still works while locked; only re-disguising is blocked).

Top-center (`#disguise-cd`, Hider only): **disguise-cooldown alert** shown for the
`DISGUISE_LOCK_MS` (5s) window after a hit, when `disguiseLockUntil > Network.now()`.
Red-bordered pill "🥸 DISGUISE LOCKED · `N.Ns`" with a depleting bar (`#disguise-cd-bar`,
width = `remain/DISGUISE_LOCK_MS`), refreshed each `updateHUD` tick (60fps). The mobile
**PROP** button mirrors this: while locked it shows "🔒 N.Ns" and is `disabled`.

## Lobby (`UI.updateLobby` + `Level` lobby scene)
No DOM player-list any more — **players are the 3D character row** rendered by
`Level.lobbyScene`. `UI.updateLobby` reconciles the corner controls from the
authoritative roster: role `<select>` = local `me.role` (→ `Network.setLocalRole`), map
`<select>` = `gameState.levelName` (host-editable → `Network.selectLevel`; populated by
`UI.renderLevelSelector`), name pill = `me.name`, and the contextual CTA
(`#btn-lobby-action`: host **START GAME** gated on ≥1 Hider + ≥1 Seeker + all ready;
client **READY/UNREADY** from `me.isReady`). Warning/subtitle carry the same gating
strings. It also reconciles the **refresh / JOIN / leave** trio from `isHost` + player
`total` (`hostAlone = isHost && total <= 1`): host-alone → refresh shown+enabled, JOIN
shown, door hidden; host+players → refresh shown but **disabled**, JOIN hidden, door
shown; client → refresh hidden, JOIN hidden, door shown. Then it calls
`Level.syncLobbyModels()` (guarded by `Level.lobbyActive`) to diff the roster into
character meshes + labels.

**Lobby 3D scene** (`js/level.js`, isolated from the in-game `scene`/`playerMeshes`):
`initLobbyScene` (own camera/lights/ground) · `makeCharacterMesh` reused per player ·
`makeLobbyLabel` (name + role sprite, gold ✓ when ready) · `_layoutLobby` (row spacing +
camera framing) · `renderLobby(dt)` (idle mixer tick + draw, from `animate()` while
`lobbyActive`) · `showLobby`/`hideLobby` (toggled by the screen transitions) ·
`disposeLobbyModels` (from `cleanup`).

## Responsive / landscape (`css/style.css`)
- `@media (orientation: portrait)` → show `#rotate-overlay` (z 9999) over everything.
- `@media (max-height: 520px)` (landscape phones): compact `.hud-card` (smaller
  padding/font, `white-space:nowrap`), slimmer health bar, smaller Exit button,
  smaller joystick + action buttons; menu/lobby/settings cards top-align + scroll
  (`overflow-y:auto`) with reduced padding/inputs and a shorter player list / level
  cards. `.mobile-controls` show on `@media (pointer: coarse)`.
- True OS orientation lock isn't reliable on mobile web; the overlay is the
  enforcement.

## The editor (`editor.html`, separate page)
- Place props (model buttons), transform gizmo (W/E/R, Q local/world), inspector
  (position/rotation/scale + gameplay/spawn checkboxes), hierarchy list.
- **Selection & gizmo via a pivot.** The gizmo never attaches to the mesh directly —
  it attaches to a `transformPivot` group. Single selection: pivot takes the object's
  rotation, so Move/Scale follow the object's own axes even when it's rotated AND
  non-uniformly scaled (attaching the gizmo straight to a scaled mesh shears its
  axes). On drag, selected objects are parented under the pivot (`pivot.attach`) and
  baked back on release (`scene.attach`). `positionPivot()` re-centres it each idle
  frame. State: `selectedObjects[]` (all) + `selectedObject` (primary/inspector).
- **Multi-select:** Ctrl/Cmd-click toggles, Shift-click range-selects (hierarchy and
  viewport). The pivot sits at the centroid (world axes) so Move/Rotate/Scale apply to
  all selected at once (`setSelection`/`selectObject(obj, additive)`). One yellow
  BoxHelper per selected object; arrow-nudge moves all selected.
- **Undo / redo:** full-scene snapshots (`snapshotScene`/`applySnapshot`).
  **Ctrl+Z** undo; **Ctrl+Y**, **Ctrl+R** (page-reload suppressed), or **Ctrl+Shift+Z**
  redo. `pushUndo()` is called before every mutation (place, duplicate, delete, gizmo
  drag, inspector edit, level load).
- **Show Colliders** toggle (yellow gizmos; **selected** objects' colliders draw
  **purple** — `rebuildEditorColliders` colors `selectedObjects.includes(obj)`),
  per-object BoxHelpers + the primary's AxesHelper (detached during bounds reads so it
  doesn't inflate them).
- **Inspector multi-edit (Unity-style):** with several objects selected the inspector
  shows the **common** value per field; fields that differ go blank with a `—`
  placeholder (numbers) or the indeterminate dash (checkboxes). Editing a field applies
  to **all** selected objects in one undo step (`updateInspectorFields` +
  `_commonNum`/`_commonBool`/`_setNumField`/`_setChkField`; `numChange`/`chkChange`).
- **Delete** is via the **Delete key** only (the toolbar "Delete Selected" button was
  removed); `deleteSelected()` still backs the shortcut.
- **Inspector → Materials (Unity-style):** for a single selected object,
  `refreshMaterialsSection` lists its materials (`#matSelect` if >1) and edits Albedo
  color / Opacity / Emission(+intensity) / Metallic / Roughness / texture map (upload +
  clear) live; controls a material lacks are hidden. Edits set `materialDirty` and reveal
  a 💾 **save icon** plus a ↺ **reset icon** (right of the "Materials" heading); reset
  (`resetMaterials`) restores every material to the pristine as-loaded snapshot captured by
  `_snapshotMaterial` (color/opacity/emission/metallic/roughness/map) and clears the dirty
  state. 💾 → `#matSaveModal` → `exportSelectedGlb()` exports the model (edited
  materials/textures baked in) as a new `.glb` via `THREE.GLTFExporter` (binary download).
  Material edits aren't in the undo stack and aren't stored in the level — persistence is
  the exported GLB. Hidden for multi-select / spawn / no material.
- **Inspector → Choose Texture:** for a single selected **cube or wall**
  (`PropLevel.TEXTURABLE_MODELS`), `refreshTextureSection` shows a `#cubeTexSelect` dropdown
  of files scanned from `assets/textures/` (dir-index `fetch` in `listTextureFiles`, fallback
  list if unserved) plus a **↻ Refresh** button to re-scan after copying in a new image.
  Picking a texture calls `PropLevel.applyPropTexture` live and stores the filename on the
  instance; **unlike Materials, this IS persisted** — `exportProp` writes `texture:"<file>"`
  and the game loads it. Cubes default to `crate.png`; walls show `wall.png` and only export a
  `texture` once overridden. Hidden for other prop types. A **Tiling X/Y** row
  (`#texTileX`/`#texTileY`, Unity-style) sets the texture `repeat` per instance (`_dataTiling`
  helper), with **drag-to-scrub** labels via `attachLabelScrub` (Tiling label = both axes, X/Y =
  each; Shift = fine); editing tiling on a plain wall assigns its texture so the tiling takes effect.
  `tileX/tileY` export only when they differ from the model default (wall `2,2`, else `1,1`).
- **Prefab editor lock:** in the Edit Prefabs modal, when a type's `canDisguise` is on the
  `collision` flag is greyed/disabled with a red ⚠ "not recommended" note (disguised
  hiders rely on the collider); unchecking `canDisguise` re-enables it (`renderPrefabEditor`).
- **Hierarchy search:** a `#hierarchy-search` box (with a clear **✕** that shows when
  non-empty) filters the list by name
  (case-insensitive substring). `refreshHierarchy` renders only matches into
  `visibleHierarchy`; **Ctrl/Cmd-click toggle and Shift-click range-select operate over
  the filtered list**, and arrow nav walks it too. Keydown handlers ignore W/E/R/Q/F/
  Delete/nudge while a text field is focused (so you can type in the search).
- **Hierarchy keyboard nav:** the `#hierarchy` panel is focusable (`tabindex`); while
  focused, **Up/Down arrows switch the selected object** (`navigateHierarchy`) instead
  of scrolling. In the viewport (panel not focused) arrows still nudge the object(s).
- **Edit Prefabs** modal: edit `PrefabLibrary` per type (flags + colliders) with a
  **live 3D preview** (separate mini renderer); export the regenerated `prefabs.js`
  text; remembers edits in localStorage (`hnh_editor_prefabs`).
- **Save/Export Level** + **Load Level** modals → localStorage (`hnh_editor_levels`);
  export emits `registerLevel("name", [...])` to paste into `js/levels/`. The Load
  modal also has **⬆ Upload .js File** (`uploadLevelFile`) to load a level file from
  disk (e.g. `js/levels/forest.js`) via `applyLevelData` (slices the `[...]` array).
- **View gizmo** (`#viewGizmo`, top-right of the viewport, Unity-style): click the
  colored axis balls (X/Y/Z + hollow negatives) to snap to that orthographic-style
  view via `snapView` (sets `orbitYaw`/`orbitPitch`; the orbit loop rebuilds the
  camera). The hub returns to the default iso angle. The **Persp/Iso** label
  (`#vgPersp` → `toggleProjection`) swaps the active camera between a Perspective and
  an Orthographic camera (`setProjection` reassigns the global `camera` +
  `transformControls.camera`; `animate` keeps the ortho frustum framed to
  `orbitDistance`).
- Has its own CSS (dark pro UI); **not** covered by the game's responsive rules and
  loads `prefabs.js`/`props.js` at a stale `?v=7` (TODO).
