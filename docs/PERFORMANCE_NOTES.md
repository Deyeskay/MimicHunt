# Performance Notes

Small scenes, few players — the game is comfortably real-time on phones, but a few
costs and choices are worth knowing.

## Frame & network budget
- Render: `requestAnimationFrame` (~60 fps). Physics + reload tick: 60 Hz
  `setInterval` (separate from rAF — see the stale-frame note below). Network: **20
  Hz** (`NETWORK_SEND_RATE`) snapshots/clientMove. Timer 1 Hz; heartbeat 1 Hz;
  watchdog 2 Hz.
- 20 Hz transmit cuts bandwidth ~3× vs per-frame with no felt latency, because of
  client prediction + 100 ms render-behind interpolation.

## Snapshots & interpolation
- `snapshot` carries only `{x,y,z,rotY}` per player (transform-only). Everything else
  is discrete events → tiny packets.
- Remote players render from a short snapshot **buffer** sampled `INTERP_DELAY=100ms`
  behind real time (`sampleSnapshot` + `_lerpPlayers`/`_lerpAngle`); the buffer holds
  ~1 s and is trimmed. Starved buffer **holds** the last frame (no extrapolation
  jitter).
- Local player is predicted (never sampled), so the owner feels zero input latency.

## Animation
- Per player: one `AnimationMixer` + 2 layers (lower/upper) + jump action. Mixers
  update once/frame with a shared `THREE.Clock` delta.
- Speed/direction are derived from the mesh's own position delta and **EMA-smoothed**
  because physics (60 Hz interval) and rAF aren't phase-locked — raw per-frame deltas
  see occasional zero-movement frames that would otherwise flip walk/idle.
- `SkeletonUtils.clone` per character is the main per-spawn cost (skinned hierarchy +
  shader compile on first draw). Expect a brief one-time hitch at match start (the
  `[Violation] requestAnimationFrame handler took …ms` warning) — it's the first-frame
  skinned-shader compile, not a per-frame cost. (A pre-warm could move it to the
  loading screen — not implemented.)

## Known per-frame/GC costs
- `Level.render` allocates a few `THREE.Vector3`s in `getAimRay`/camera math and
  recreates projectile/impact geometries; projectiles are short-lived and disposed
  on cull. Fine at this scale; if it ever matters, pool projectiles and reuse vectors.
- Character mesh clones share GLB geometry/material by reference (SkeletonUtils),
  so memory per player is modest. Old meshes are removed from the scene on
  recreation but their cloned materials aren't explicitly disposed (acceptable;
  recreation is rare — disguise swap / fallback→character upgrade).
- Dev collider gizmos (`developer`/G) rebuild geometry on toggle; off by default.

## Assets
- `player.glb` (Hider) and `hunter.glb` (Seeker) are each loaded once into a rig
  (`Level.rigs.player` / `Level.rigs.hunter`); all characters of a role clone their
  rig's scene via SkeletonUtils. Props are tiny. The only textures are two small
  **procedural canvas textures** (256² grass for the ground via
  `Level.makeGroundTexture`, 256² stone-brick for walls via `PropLevel.getWallTexture`,
  cached/shared) — generated in code, no image files; models stay flat-shaded.

## Lighting & shadows
- `AmbientLight(0xffffff,0.9)` + `HemisphereLight(...,0.6)` + `DirectionalLight(...,1.2)`.
  Fog `20..100`.
- Shadows ON: `renderer.shadowMap` (PCFSoft); the directional light casts a single
  2048² shadow map over a ±60 ortho frustum; the ground receives and character
  meshes cast. One shadow pass — modest cost; the map size / frustum are the knobs
  if it ever matters. Props don't cast/receive (only the ground shows player shadows).

## Things that are intentionally simple (could optimize later)
- Hit detection: O(hiders × 5 samples) ray math per shot, plus `raycastProps` over
  all collidable props — trivial for these counts.
- No spatial partitioning for collisions/spawns (linear scans of `mapProps3D`) —
  fine for tens of props.
- Single-threaded dev server (`python -m http.server`) can stall concurrent asset
  loads across two windows; the loader retries/“self-heals” the character.
