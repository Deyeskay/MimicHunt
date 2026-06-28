# UI Flow

Screens are absolutely-positioned overlays toggled by `UI.transitionTo*`
(`js/ui.js`). HUD/menus styled in `css/style.css`. Markup in `index.html`.

## Screens (DOM, in `index.html`)
- `#rotate-overlay` — portrait-only "rotate device" cover (landscape lock).
- `#menu-screen` — name input, Host / Join (code), Settings button.
- `#settings-screen` — hide/hunt time, sensitivity, invert-Y, mobile-UI toggle.
- `#lobby-screen` — title/room code, level carousel (`#lobby-level`), player list,
  warning, Ready / Leave.
- `#ui-layer` — in-game HUD + crosshair + mobile controls (`pointer-events:none`
  except `.interactive` children).
- `#blind-overlay` — seekers' "YOU ARE BLINDED" during HIDING.
- `#custom-modal` — generic modal (`UI.showModal(title,msg,cb)`), used for win/room
  events.
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
- **Player count** (`👥 N`).
- **Combat HUD** (`#combat-hud`, Seeker+HUNTING+alive): `🔫 ammo/MAG · ⭐ score`
  (or `RELOAD`).
- **Health bar** (`#health-hud`/`#hp-fill`, Hider in-game): width = HP/MAX, green→
  orange→red.
- **Exit Match** button.
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
- **Show Colliders** toggle (yellow gizmos), selection BoxHelper + AxesHelper
  (detached during bounds reads so it doesn't inflate them).
- **Edit Prefabs** modal: edit `PrefabLibrary` per type (flags + colliders) with a
  **live 3D preview** (separate mini renderer); export the regenerated `prefabs.js`
  text; remembers edits in localStorage (`hnh_editor_prefabs`).
- **Save/Export Level** + **Load Level** modals → localStorage (`hnh_editor_levels`);
  export emits `registerLevel("name", [...])` to paste into `js/levels/`.
- Has its own CSS (dark pro UI); **not** covered by the game's responsive rules and
  loads `prefabs.js`/`props.js` at a stale `?v=7` (TODO).
