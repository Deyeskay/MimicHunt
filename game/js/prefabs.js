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

  Per-instance flags that are NOT prefab-level (they describe a single
  placed object, not the type): spawnPoint, seekerSpawn, hiderSpawn.
=====================================================================*/

const PrefabLibrary = {
    tree:  { collision: true,  climbable: true,  hideSpot: false, canDisguise: true  },
    rock:  { collision: true,  climbable: false, hideSpot: true,  canDisguise: true  },
    bush:  { collision: false, climbable: false, hideSpot: true,  canDisguise: true  },
    wall:  { collision: true,  climbable: false, hideSpot: false, canDisguise: false },
    spawn: { collision: false, climbable: false, hideSpot: false, canDisguise: false }
};

// Fallback for any model not listed above.
const PREFAB_DEFAULT = { collision: true, climbable: false, hideSpot: false, canDisguise: false };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PrefabLibrary, PREFAB_DEFAULT };
}
