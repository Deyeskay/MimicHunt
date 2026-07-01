# Prop & Collider System

Props are the level's static objects (and the things hiders disguise as). Defined
per **type** in `js/prefabs.js` (`PrefabLibrary`) and per **instance** in level
files; resolved + meshed by `js/props.js` (`PropLevel`).

## PrefabLibrary (type defaults) — `js/prefabs.js`
Each type has gameplay flags and an optional compound `colliders` template:
```js
tree:  { collision:true,  climbable:true,  hideSpot:false, canDisguise:true,
         colliders: [ // slim trunk (lower 55%)
                      {shape:'cylinder', position:{x:0,y:0.275,z:0}, rotation:{y:0}, scale:{x:0.18,y:0.55,z:0.18}},
                      // wide canopy floating in the upper half
                      {shape:'cylinder', position:{x:0,y:0.75, z:0}, rotation:{y:0}, scale:{x:0.95,y:0.50,z:0.95}} ]},
rock:  { collision:true,  climbable:true,  hideSpot:true,  canDisguise:true },
bush:  { collision:false, climbable:true,  hideSpot:true,  canDisguise:true },
wall:  { collision:true,  climbable:false, hideSpot:false, canDisguise:false },
cube:  { collision:true,  climbable:true,  hideSpot:false, canDisguise:true,  colliderShape:'box' },
spawn: { collision:false, climbable:false, hideSpot:false, canDisguise:false },
```
- **`cube`** is a procedural unit box (like `wall`) with a **per-instance texture** picked from
  `assets/textures/` — climbable and disguisable. See "Cube textures" below.
- **collision** blocks movement & occludes shots; **climbable** can be stood on;
  **hideSpot** counts as a hiding spot (also disguisable); **canDisguise** a hider
  can disguise as this type.
- `PREFAB_DEFAULT` is the fallback for unknown models.

## Collider model — compound transformed pieces
Each `colliders` entry has a **shape** (`'cylinder' | 'box' | 'sphere'`) and a
**transform in fractions of the placed instance's bounds**:
- `position {x,y,z}` — x/z × R (rotated by the instance's `rotation.y`); y × H, the
  piece **center** measured up from the prop's bottom.
- `rotation {y}` — extra Y spin in **degrees**, added to the instance's (box only;
  ignored by round shapes). Only `rotation.y` is authored — the 2.5D solver has no
  tilt, so x/z rotation are intentionally not exposed.
- `scale {x,y,z}` — x/z × R (cylinder/sphere radius, box half-extents); y × H (the
  piece's full height).

At load, `PropLevel.resolveColliders(prop, bounds, def)` turns the template into
**runtime pieces** stored on `prop.colliders`: cylinder/sphere `{shape,x,z,radius,yMin,yMax}`,
box `{shape:'box', x,y,z (center), hx,hy,hz (half-extents), ax,ay,az (unit world
axes), yMin,yMax}` — a full **oriented box (OBB)** that follows the prop's rotation on
**all three axes** (see "Box colliders" below). No template → one full-height
cylinder from the bounding box. `getColliders(prop)` is the safe accessor. The
**legacy** entry form (`{radius,yMin,yMax,offsetX,offsetZ}`, cylinder-only) is still
accepted by the resolver. `PropLevel.colliderGeometry(c)` builds the matching wireframe
geometry for every debug/preview outline.

This is why a tree has a **slim trunk you can walk up to** plus a **wide canopy
floating overhead you can pass under** — instead of one fat cylinder.

**Sphere** collides as a circular footprint + vertical band (identical to a cylinder
in the 2.5D solver) but **renders round** (an ellipsoid squashed to the band). Use it
for round rocks/bushes where the wireframe should read as a ball.

**Box colliders are full 3D oriented boxes (OBBs).** A prefab with
`colliderShape: 'box'` (e.g. `wall`), and any per-piece `shape:'box'` (e.g. the rock
body, tree canopy), resolves to an oriented box that **follows the prop's rotation on
all three axes** — so a wall/platform tilted or laid flat gets a collider that matches
the mesh, not just one spun about the vertical axis. A piece carries its **center**
`(x,y,z)`, **half-extents** `(hx,hy,hz)`, and three **unit world axes** `ax/ay/az`
(plus a conservative world-AABB `yMin/yMax` band for cheap broad-phase rejects).

How it's built: `computeBounds` measures the prop's **un-rotated** AABB (`bounds.local`)
and records the rotation `pivot` + `quat`; `resolveColliders` rebuilds each box in that
local frame and rotates it by the quaternion via `_obbPiece`. Cylinders/spheres stay
**vertical** (the 2.5D solver can't tilt a round footprint) — only their centre follows
the rotation. Shared OBB helpers: `PropLevel.rayBox` (ray-vs-OBB, used by `raycastProps`
+ camera collision + the "stand on a tilted top" probe), `pointBoxDist2` (used by
`blockedAt`'s box branch, which samples the player's body column against the OBB),
`colliderCenter` / `colliderQuat` (orient every debug/editor outline). All consumers
branch on `c.shape`; round shapes use the circle path. **Note:** cylinder/sphere pieces
still cannot tilt — tilting a tree trunk keeps the trunk cylinder upright.

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

## Per-instance textures (cube + wall)
`cube` and `wall` are procedural `BoxGeometry` props (not GLBs) that support a per-**instance**
`texture` filename resolved against `assets/textures/` (`PropLevel.TEXTURABLE_MODELS`):
- `PropLevel.createCubeMesh(prop)` / `createWallMesh(prop)` → per-object `MeshLambertMaterial({ map })`,
  `toneMapped:false`. The map comes from `getPropTexture(filename)` — a cache-by-filename
  `TextureLoader` (shared texture objects, `RepeatWrapping`, **never disposed** on swap).
- **Cube** always has a texture (default `PropLevel.DEFAULT_CUBE_TEXTURE` = `'crate.png'`).
  **Wall** defaults to the *shared* wall texture (procedural brick → `wall.png` via `_wallMats`
  global swap) and only takes a per-instance texture when overridden — in which case its material
  is kept OUT of `_wallMats` (so a late `wall.png` load can't clobber it). Defaults live in
  `props.js` (`DEFAULT_CUBE_TEXTURE`/`DEFAULT_WALL_TEXTURE`, `defaultTextureFor(model)`) because
  the editor regenerates `prefabs.js`.
- **Tiling:** each instance also carries `tileX`/`tileY` (texture `repeat`). `getPropTexture(file,
  repeat)` caches per **(file, tilingX, tilingY)** — same file + tiling share one texture, a
  different tiling gets its own copy (so per-instance tiling can't cross-talk). Defaults via
  `defaultTilingFor(model)` → wall `2,2` (matches the shipped wall look), else `1,1`. Tiling only
  works through the per-instance path, so a **tiled wall implies a `texture`** (default `wall.png`).
- `PropLevel.applyPropTexture(mesh, filename, repeat)` live-swaps the map + tiling (editor picker);
  for a wall it also removes the material from `_wallMats`.
- `exportProp` emits `texture:"<file>"` for every cube, and for a wall **only when overridden**
  (plain walls stay slim + keep the shared texture); `tileX`/`tileY` are emitted only when they
  differ from the model default.
- **Editor authoring:** the **Choose Texture** inspector panel (shown for a single cube/wall)
  lists files by scanning `assets/textures/` via the dev server's directory index (Python
  `http.server` etc.), with a **↻ Refresh** button (drop a new image in the folder → Refresh →
  it appears). Falls back to a hardcoded list if the server serves no index.
- **Disguise:** a hider disguised as a cube carries its texture via the `disguiseTexture` field
  (threaded through the disguise network messages like `propRotation`); `getDisguiseMeshKey`
  includes it and `createDisguiseMesh(type, lib, scale, texture)` rebuilds the box with it.
  (Walls aren't disguisable, so wall textures never travel through disguise.)

## Disguise
- `createDisguiseMesh(type, modelLibrary, scale, texture)` builds the prop mesh a hider wears
  (`texture` is only used by `cube`).
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
