# Level System

Levels are bundled JS files in `js/levels/` that **self-register**. Browsers can't
enumerate a folder, so a manifest + loader injects them.

## Registry — `js/levels/registry.js`
```js
const LEVELS = [];                         // [{ name, props, options }]
function registerLevel(name, props, options) { LEVELS.push({ name, props, options: options||{} }); }
const LEVEL_FILES = ['forest.js', 'arena.js'];   // <-- the ONE place to add a level
function loadLevelScripts() { /* inject each js/levels/<file>?v=N sequentially */ }
```
- Loaded **sequentially** so `LEVELS[0]` is the deterministic default map (Forest).
- `app.js` awaits `loadLevelScripts()` before `Level.init()` so `LEVELS` is populated.
- Cache `?v=` for level files lives in this loader (keep in sync with `index.html`).

## Level files — `js/levels/forest.js`, `arena.js`
Each calls `registerLevel('Name', [ ...prop objects... ], options?)`. A prop object:
```
{ id, model:'tree'|'rock'|'bush'|'wall'|'spawn', x, y, z, bottomY,
  scale:{x,y,z}, rotation:{x,y,z},            // degrees
  collision?, climbable?, hideSpot?,           // optional per-instance gameplay overrides
  spawnPoint?, seekerSpawn?, hiderSpawn? }      // spawn flags
```
- Gameplay flags are optional; omitted ones fall back to the prefab
  (see PROP_SYSTEM.md `resolveGameplay`). **forest.js** and the rebuilt **arena.js**
  omit the baked `"climbable": false` lines, so rocks/bushes inherit climbable from the
  prefab.
- Only the level **name** crosses the wire (levels are bundled identically on every
  peer); prop data never transmits.

### Level options (3rd arg) — custom ground
```
registerLevel('Name', [ ...props... ], { ground: { texture:'rock_wall.png', tileX:24, tileY:24 } });
```
- `options.ground` sets the ground surface (file in `assets/textures/`, plus tiling
  = repeats across the 200×200 plane). Omit it → the default grass.
- Applied by `Level.applyGroundTexture(cfg)` (from `loadLevel(props, options)`). A custom
  ground renders untinted — `setGraphicsQuality` skips the grass green tint for it.
- Authored in `editor.html` → **Ground** panel (texture + Tiling X/Y); exported into the
  `registerLevel(...)` string automatically. Like props, only the level NAME syncs.

## Loading a level into the scene — `Level.loadLevel(props, options)` (`js/level.js`)
0. `applyGroundTexture(options.ground)` — swap the ground surface (or reset to grass).
1. Remove the previous level's meshes (`Level.levelMeshes`).
2. `mapProps3D = JSON.parse(JSON.stringify(props))` — deep clone so `enrichProp`
   doesn't mutate the registry source (the same level can load repeatedly).
3. `spawnProp` each: spawn markers resolve gameplay only (no mesh); others build the
   mesh (`createPropMesh`), `enrichProp` (bounds + colliders + gameplay), add to
   scene + `levelMeshes`.
- `Level.init` loads `LEVELS[0]` as the default; the lobby lets the host pick another.

## Lobby selection (host picks the map)
- `gameState.levelName` (host defaults to `LEVELS[0].name`).
- `UI.renderLevelSelector` shows a status line + a horizontal **carousel** of
  `.level-card`s from `Network.getLevelList()`; the host clicks a card →
  `Network.selectLevel(name)` (sets `levelName`, broadcasts `lobbySync` with it).
- At game start (`startGameBroadcast`), the host `Level.loadLevel(getLevelProps(name))`
  **before** reassigning spawns (spawns read `mapProps3D`); clients load it on
  `gameStart`.

## Adding a new level
1. Create `js/levels/<file>.js` with `registerLevel('Name', [...]);`
2. Add `'<file>.js'` to `LEVEL_FILES` in `registry.js`.
3. Bump `?v=` (loader + `index.html`). It then appears in the lobby carousel.
   (Author it visually in `editor.html` → export the `registerLevel(...)` text.)
