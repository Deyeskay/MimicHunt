# Level System

Levels are bundled JS files in `js/levels/` that **self-register**. Browsers can't
enumerate a folder, so a manifest + loader injects them.

## Registry — `js/levels/registry.js`
```js
const LEVELS = [];                         // [{ name, props }]
function registerLevel(name, props) { LEVELS.push({ name, props }); }
const LEVEL_FILES = ['forest.js', 'arena.js'];   // <-- the ONE place to add a level
function loadLevelScripts() { /* inject each js/levels/<file>?v=N sequentially */ }
```
- Loaded **sequentially** so `LEVELS[0]` is the deterministic default map (Forest).
- `app.js` awaits `loadLevelScripts()` before `Level.init()` so `LEVELS` is populated.
- Cache `?v=` for level files lives in this loader (keep in sync with `index.html`).

## Level files — `js/levels/forest.js`, `arena.js`
Each calls `registerLevel('Name', [ ...prop objects... ])`. A prop object:
```
{ id, model:'tree'|'rock'|'bush'|'wall'|'spawn', x, y, z, bottomY,
  scale:{x,y,z}, rotation:{x,y,z},            // degrees
  collision?, climbable?, hideSpot?,           // optional per-instance gameplay overrides
  spawnPoint?, seekerSpawn?, hiderSpawn? }      // spawn flags
```
- Gameplay flags are optional; omitted ones fall back to the prefab
  (see PROP_SYSTEM.md `resolveGameplay`). **forest.js** had its baked
  `"climbable": false` lines stripped (rocks/bushes now inherit climbable from the
  prefab). **arena.js still carries `climbable:false`** → its rocks/bushes aren't
  climbable yet (TODO).
- Only the level **name** crosses the wire (levels are bundled identically on every
  peer); prop data never transmits.

## Loading a level into the scene — `Level.loadLevel(props)` (`js/level.js`)
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
