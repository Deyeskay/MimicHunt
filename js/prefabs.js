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
                  (the model's full bounding box). Each piece is in FRACTIONS of
                  the placed instance's computed bounds, so it scales with any
                  instance:
                    radius        fraction of bounds radius R   (default 1)
                    yMin / yMax   fraction of bounds height H,   (default 0 / 1)
                                  measured up from the prop's bottom
                    offsetX/Z     fraction of R, rotated by the instance's
                                  rotation.y                     (default 0)
                  Only movement blocking uses these; prop.radius (disguise,
                  climb, catch, spawn) is unaffected.

  Per-instance flags that are NOT prefab-level (they describe a single
  placed object, not the type): spawnPoint, seekerSpawn, hiderSpawn.
=====================================================================*/

const PrefabLibrary = {
    // Tree gets a compound collider: a slim trunk you can walk right up to plus
    // a wide canopy floating overhead (so you can pass underneath it), instead
    // of one fat cylinder covering the whole canopy footprint.
    tree:  { collision: true,  climbable: true,  hideSpot: false, canDisguise: true,
             colliders: [
                 { radius: 0.18, yMin: 0.00, yMax: 0.55 },   // trunk
                 { radius: 0.95, yMin: 0.50, yMax: 1.00 }    // canopy (floating)
             ] },
    rock:  { collision: true,  climbable: true, hideSpot: true,  canDisguise: true  },
    bush:  { collision: false, climbable: true, hideSpot: true,  canDisguise: true  },
    // Wall uses a BOX collider (oriented by rotation.y) instead of a cylinder —
    // a long thin wall should block as a rectangle, not a fat round column.
    wall:  { collision: true,  climbable: false, hideSpot: false, canDisguise: false,
             colliderShape: 'box' },
    spawn: { collision: false, climbable: false, hideSpot: false, canDisguise: false }
};

// Fallback for any model not listed above.
const PREFAB_DEFAULT = { collision: true, climbable: false, hideSpot: false, canDisguise: false };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PrefabLibrary, PREFAB_DEFAULT };
}
