# Prop & Collider System

Props are the level's static objects (and the things hiders disguise as). Defined
per **type** in `js/prefabs.js` (`PrefabLibrary`) and per **instance** in level
files; resolved + meshed by `js/props.js` (`PropLevel`).

## PrefabLibrary (type defaults) — `js/prefabs.js`
Each type has gameplay flags and an optional compound `colliders` template:
```js
tree:  { collision:true,  climbable:true,  hideSpot:false, canDisguise:true,
         colliders: [ {radius:0.18, yMin:0.00, yMax:0.55},   // slim trunk
                      {radius:0.95, yMin:0.50, yMax:1.00} ]}, // floating canopy
rock:  { collision:true,  climbable:true,  hideSpot:true,  canDisguise:true },
bush:  { collision:false, climbable:true,  hideSpot:true,  canDisguise:true },
wall:  { collision:true,  climbable:false, hideSpot:false, canDisguise:false },
spawn: { collision:false, climbable:false, hideSpot:false, canDisguise:false },
```
- **collision** blocks movement & occludes shots; **climbable** can be stood on;
  **hideSpot** counts as a hiding spot (also disguisable); **canDisguise** a hider
  can disguise as this type.
- `PREFAB_DEFAULT` is the fallback for unknown models.

## Collider model — compound vertical cylinders
A `colliders` entry is in **fractions of the placed instance's bounds**:
`radius` × R, `yMin/yMax` × H (from the prop's bottom), `offsetX/Z` × R (rotated by
`rotation.y`). At load, `PropLevel.resolveColliders(prop, bounds, def)` turns the
template into **world cylinders** `{x,z,radius,yMin,yMax}` stored on `prop.colliders`.
No template → one full-height cylinder from the bounding box. `getColliders(prop)` is
the safe accessor.

This is why a tree has a **slim trunk you can walk up to** plus a **wide canopy
floating overhead you can pass under** — instead of one fat cylinder.

`prop.radius`/`centerX/centerZ/topY/bottomY/height` (from `computeBounds`/`enrichProp`)
are still used by disguise sizing, climbing, spawns, and the hit radius — only
**movement blocking** and **shot occlusion** use the compound pieces.

## Gameplay-flag resolution — `resolveGameplay(prop)`
- `collision`, `hideSpot`: **instance value wins** when defined, else prefab default.
- `climbable`: same rule (instance-wins-else-prefab). NOTE: older level files baked
  `"climbable": false` on every prop; `forest.js` has had those stripped (so rocks/
  bushes inherit `climbable:true` from the prefab). **`arena.js` still has baked
  `climbable:false`** → its rocks/bushes are currently non-climbable (TODO: strip or
  re-export).
- `canDisguise` is prefab-only (read via `canDisguiseAs`, which also returns true for
  any `hideSpot`).

## Meshes
- `createPropMesh(prop, modelLibrary)`: clones the GLB (`tree/rock/bush`) or builds a
  box for `wall`; `applyPropTransform` grounds it via `bottomY` + applies scale/
  rotation. `spawn` markers have no mesh (placement metadata only).
- GLB props keep their own materials (why the scene needed brighter lights).

## Disguise
- `createDisguiseMesh(type, modelLibrary, scale)` builds the prop mesh a hider wears.
- `canDisguiseAs(prop)` gates which props a hider can become.
- See GAMEPLAY.md / PLAYER_STATE.md for disguise fields, lock, and forced-out.

## Movement blocking — `Mechanics.blockedAt(x,z,myRadius)`
Tests the player circle vs every collidable prop's cylinder **pieces**, with a
vertical-overlap check (player span vs `[yMin,yMax]`) so you can walk **under** a
floating canopy while the trunk blocks. Used by per-axis wall sliding.

## Shot occlusion — `PropLevel.raycastProps(ox,oy,oz,dx,dy,dz,maxRange)`
Ray vs each collidable prop's vertical cylinders (XZ circle quadratic + y-band
check) → nearest blocking distance. `Network.processShot` rejects hider hits beyond
it and stops the bolt at the prop (`impactDist`). `mapProps3D` exists on every peer,
so the shooter's local bolt also stops at props.

## Spawns
Props flagged `spawnPoint` / `seekerSpawn` / `hiderSpawn` are spawn markers.
`getSpawnPositions(props)` buckets them; `getSpawnForRole`/`pickSpawn` choose
positions (role-specific spawns, else generic, else random), spacing players ≥3u
apart, placing them at `propTop + PLAYER_BASE_HEIGHT`.

## Dev visualization
`developer` flag (globals) + **G** key → `Level.buildColliderGizmos` draws yellow
edge-cylinders for every collider piece; the local player's own collision cylinder
is drawn cyan (follows `p.y` incl. jumping). The editor has a "Show Colliders"
toggle that draws the same.

## Editor authoring (see editor.html / UI_FLOW.md)
The editor places instances, edits flags/spawns, and can edit the **prefab
templates** (incl. `colliders`) with a live 3D preview; it exports `registerLevel(...)`
text and a regenerated `prefabs.js`. `exportProp` writes slim instances (only
overrides + spawn flags). NOTE: editor loads `prefabs.js`/`props.js` at a stale
`?v=7`, so it may lag the latest props.js (TODO).
