/*=====================================================================
  prefabs.js – Prefab library (Unity-style prop type defaults)
  ---------------------------------------------------------------
  Each prop TYPE defines its default gameplay metadata once. Level
  instances then only need position/rotation/scale (+ a model key and
  any per-instance overrides), instead of repeating these flags on
  every object. PropLevel.getPrefab() reads this; PropLevel.enrichProp
  / resolveGameplay fill missing instance fields from here at load, and
  the editor's exportProp omits fields that match the prefab default.

  Fields:
    collision   – blocks movement
    climbable   – player can stand on top
    hideSpot    – counts as a hiding spot (also disguisable)
    canDisguise – a Hider can disguise as this prop type
    colliderShape – 'box' for a single oriented box collider (walls); omit for
                  the default cylinder shape (used with/without `colliders`)
    colliders   – OPTIONAL compound collider shape used for movement blocking
                  (PropLevel.resolveColliders). Omit for a single auto cylinder
                  (the model's full bounding box). Each piece has a `shape`
                  ('cylinder' | 'box' | 'sphere') and a TRANSFORM in FRACTIONS of
                  the placed instance's computed bounds, so it scales with any
                  instance:
                    position {x,y,z}  x/z fraction of bounds radius R (rotated by
                                      the instance's rotation.y); y fraction of
                                      height H — the piece CENTER from the bottom
                    rotation {y}      extra Y spin in degrees (box only)
                    scale {x,y,z}     x/z fraction of R (radius / box half-extent);
                                      y fraction of H (the piece's full height)
                  Sphere collides as a circular footprint+band (the 2.5D solver)
                  but renders round. The legacy fraction format
                  ({radius, yMin, yMax, offsetX, offsetZ}, cylinder-only) is still
                  accepted by resolveColliders. Only movement blocking uses these;
                  prop.radius (disguise, climb, catch, spawn) is unaffected.

  Per-instance flags that are NOT prefab-level (they describe a single
  placed object, not the type): spawnPoint, seekerSpawn, hiderSpawn.
=====================================================================*/

const PrefabLibrary = {
    // Tree gets a compound collider: a slim trunk you can walk right up to plus
    // a wide canopy floating overhead (so you can pass underneath it), instead
    // of one fat cylinder covering the whole canopy footprint.
    tree:  { collision: true,  climbable: true,  hideSpot: false, canDisguise: true,
             colliders: [
                 // trunk: slim cylinder, lower 55% of the tree
                 { shape: 'cylinder', position: { x: 0, y: 0.275, z: 0 },
                   rotation: { y: 0 }, scale: { x: 0.18, y: 0.55, z: 0.18 } },
                 // canopy: wide cylinder floating in the upper half
                 { shape: 'cylinder', position: { x: 0, y: 0.75, z: 0 },
                   rotation: { y: 0 }, scale: { x: 0.95, y: 0.50, z: 0.95 } }
             ] },
    rock:  { collision: true,  climbable: true, hideSpot: true,  canDisguise: true  },
    bush:  { collision: true, climbable: true, hideSpot: true,  canDisguise: true  },
    // Wall uses a BOX collider (oriented by rotation.y) instead of a cylinder —
    // a long thin wall should block as a rectangle, not a fat round column.
    wall:  { collision: true,  climbable: true,  hideSpot: false, canDisguise: false,
             colliderShape: 'box' },
    spawn: { collision: false, climbable: false, hideSpot: false, canDisguise: false }
};

// Fallback for any model not listed above.
const PREFAB_DEFAULT = { collision: true, climbable: false, hideSpot: false, canDisguise: false };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PrefabLibrary, PREFAB_DEFAULT };
}
