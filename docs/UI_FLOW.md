# UI Flow

Screens are absolutely-positioned overlays toggled by `UI.transitionTo*`
(`js/ui.js`). HUD/menus styled in `css/style.css`. Markup in `index.html`.

## Screens (DOM, in `index.html`)
- `#rotate-overlay` — portrait-only "rotate device" cover (landscape lock).
- `#menu-screen` — name input, Host / Join (code), Settings button.
- `#settings-screen` — inline rows (`.settings-list`/`.setting-row`): hide/hunt time,
  Mouse Sensitivity (slider), Camera FOV (slider, live), invert-Y, mobile-UI toggle.
  Sliders apply live (sensitivity via `GAME_SETTINGS`, FOV via `Level.setFov`); Save
  persists to `localStorage`.
- `#lobby-screen` — title/room code, level carousel (`#lobby-level`), player list,
  warning, Ready / Leave.
- `#ui-layer` — in-game HUD + crosshair + mobile controls (`pointer-events:none`
  except `.interactive` children).
- `#blind-overlay` — seekers' "YOU ARE BLINDED" during HIDING.
- `#custom-modal` — generic modal: `UI.showModal(title,msg,cb)` (single OK) for
  win/room events, or `UI.showConfirm(title,msg,onConfirm,label)` (Yes/Cancel via
  `#modal-cancel-btn` + `.modal-actions`) — used by the Exit Match confirm.
- `#gameCanvas` — the Three.js canvas (z-index 1, behind the UI layer).

## Flow
```
menu ──host/join──► lobby ──(all ready, ≥1 hider & ≥1 seeker)──► game(HIDING→HUNTING)
  ▲                                                                     │
  └──────────────── gameOver/roomClosing/host-alone ◄──────────────────┘
                    (migration may drop clients into a new host's lobby)
```
- `transitionToGame`: hide menu/lobby, show `#ui-layer` + canvas, `Level.resize()`.
- `transitionToLobby` / `transitionToMenu`: hide game view (so the crosshair/HUD
  hide with `#ui-layer`).

## In-game HUD (`UI.updateHUD`, runs ~every frame)
Top header (`.hud-header`, one nowrap row of `.hud-card` pills):
- **Role badge** (name + ROLE; hider shows `(ELIMINATED)` when caught).
- **Timer** (`PHASE: mm:ss`).
- **Combat HUD** (`#combat-hud`, Seeker+HUNTING+alive): `🔫 ammo/MAG · ⭐ score`
  (or `RELOAD`).
- **Player count** (`👥 N`, `#player-count-card`) — pushed to the right
  (`margin-left:auto`) so it sits beside Exit.
- **Exit Match** button (confirms via `UI.showConfirm` before leaving).

Bottom-center (`.bottom-center-hud`, absolutely positioned):
- **Health bar** (`#health-hud`/`#hp-fill`, Hider in-game): width = HP/MAX, green→
  orange→red (220px track).
- **RELOADING…** (`#reload-indicator`, Seeker reloading): blinks (`.blink`).

Plus: centered `#crosshair` (Seeker+HUNTING+alive; `UI.hitMarker()` flashes it red
on a landed hit); mobile **SHOOT** (seeker) / **PROP(F)** (hider) toggled by role.

## Lobby (`UI.updateLobby`)
Player rows (name + `(Host)` tag); the local row gets a Hider/Seeker **segmented
toggle** (`.role-toggle` → `Network.setLocalRole`); others show a read-only role
chip. Ready button reconciled from authoritative `me.isReady`. Inline warning +
Start gating: needs ≥1 Hider, ≥1 Seeker, all ready. Level carousel above.

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
- **Hierarchy search:** a `#hierarchy-search` box filters the list by name
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
