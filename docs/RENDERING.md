# Rendering, Lighting & Graphics Quality

All rendering lives in `js/level.js` (`Level.init`, `Level.render`, and the quality
helpers). Three.js r128, no post-processing by default (bloom is opt-in via High).

## Lights (`Level.init`)
Three lights, kept as refs (`this._ambient`, `this._hemi`, `this._dir`) so quality can
re-tune them live:
- **AmbientLight** — flat fill. High on Low (0.9), low on Medium/High (0.30) so the scene
  isn't washed out.
- **HemisphereLight** — sky (`0xbfd8ff`) over ground bounce. The main soft fill on
  Medium/High (~0.85–0.9, greener ground tint `0x6a8a4a`); this is what keeps the **player
  lit** even though ambient is low — so the scene gets contrast without the character going
  dark.
- **DirectionalLight** — the sun (key light + shadows). Warm (`0xfff2e0`-ish) and stronger
  on Medium/High; `castShadow`, 2048² map, ortho frustum ±60 around origin.

## Colour management (the "washed out" fix)
Default r128 has **no** colour management → highlights clip and textures look dull. On
Medium/High `Level.setGraphicsQuality` enables:
- `renderer.outputEncoding = THREE.sRGBEncoding`
- `renderer.toneMapping = THREE.ACESFilmicToneMapping`, `toneMappingExposure = 1.0`
- colour maps tagged `texture.encoding = sRGBEncoding` + max anisotropy (sharper grass)

Tone mapping compresses highlights, so a **stronger** sun no longer blows out the grass —
that's what lets Medium/High look richer *and* darker-balanced at once. Low restores
`NoToneMapping` + `LinearEncoding` (the original flat look).

## Grass / ground
Ground plane (200×200) with `MeshLambertMaterial`. A procedural CanvasTexture shows
instantly (`makeGroundTexture`), swapped to `assets/textures/grass.png` when it loads
(`loadGroundImage`, repeat 24×24). The texture's encoding + anisotropy are set by the
active quality via `refreshTextures`.

## Sky
- **Low**: flat `scene.background = 0x87ceeb`.
- **Medium/High**: a **cloud skydome** (`buildSkydome`) — an inverted `SphereGeometry(400)`
  with `assets/textures/background.png`, `fog:false`, recentred on the camera each frame in
  `render` so it never visibly slides. Falls back to a plain blue dome if the image is
  missing. `scene.fog` (near 20 / far 100) still applies to world geometry.

## Graphics quality tiers (`Level.QUALITY` + `setGraphicsQuality`)
Setting: `GAME_SETTINGS.graphicsQuality` (`'low' | 'medium' | 'high'`, default **medium**),
edited via the **Graphics** dropdown on the Settings screen (`#setting-graphics`), applied
**live** (`js/app.js` `change` handler) and at the end of `Level.init`.

| Tier | pixelRatio | colour mgmt | grass aniso | sky | IBL (env) | fog far | shadow soft | bloom | lights |
|------|-----------|-------------|-------------|-----|-----------|---------|-------------|-------|--------|
| Low | 1 | off | off | flat | off | 100 | hard | off | ambient .9 / hemi .6 / sun 1.2 |
| Medium | ≤2 | sRGB + ACES | on | cloud dome | off | 100 | hard | off | ambient .30 / hemi .85 / sun 1.7 warm |
| High | ≤2 | sRGB + ACES | on | cloud dome | **on** | **180** | **radius 4** | **on** | ambient .30 / hemi .90 / sun 1.8 warm |

### High-only: image-based lighting + contact shadows
- **IBL** (`buildEnvironment`): `assets/textures/sky.png` is PMREM-processed into
  `scene.environment`, so every `MeshStandardMaterial` (GLB props + characters) gets soft
  sky-coloured ambient + subtle specular instead of looking flat. `refreshTextures(srgb,
  aniso, env)` sets `material.envMapIntensity` (1 on High, 0 otherwise). Built once, lazily;
  applied in the loader callback if High is active before it's ready. Ground/walls are Lambert
  and ignore it by design (keeps Low/Medium identical).
- **Contact shadows:** props (`spawnProp`) and characters (`buildRig`/`makeCharacterMesh`)
  now `castShadow` **and** `receiveShadow`, so they're grounded on the grass and each other
  (this part applies on every tier — shadows are always enabled). High also softens edges via
  `dirLight.shadow.radius = 4`.
- **Crisper distance:** fog far is per-tier (`scene.fog.far`), pushed to 180 on High so the
  scene doesn't grey out; 100 on Low/Medium.
- **Honest ceiling:** the low-poly faceted prop models + flat plank walls are the remaining
  gap vs a concept-art reference — lighting can't add geometry. Matching it further needs
  higher-detail GLB assets (separate art effort).

`setGraphicsQuality(q)`: sets pixelRatio, tone mapping, output encoding, light
intensities/colours, runs `refreshTextures(srgb, aniso)` (traverses `scene` +
`modelLibrary` + `this.rigs`, sets `map.encoding`/`anisotropy` and `material.needsUpdate`
so changes take effect live — GLB clones share texture refs), toggles the skydome vs flat
background, builds/enables the bloom composer, then `resize()`.

## Bloom (High only)
`buildComposer()` → `EffectComposer` + `RenderPass` + `UnrealBloomPass(strength .5, radius
.4, threshold .85)`. The high threshold = highlights-only bloom (tasteful, hides any minor
tone-map double-apply). Requires the example scripts in `index.html` (load order: CopyShader
→ LuminosityHighPassShader → EffectComposer → RenderPass → ShaderPass → UnrealBloomPass).
`render` branches: `this._useComposer && this._composer ? composer.render() :
renderer.render(...)`. `resize` keeps the composer size/pixelRatio in sync.

## Grass colour (per-tier `grassTint`)
Low isn't colour-managed, so the grass texture reads dull/olive while the sRGB+ACES tiers
get a lush grass for free. `Level.QUALITY[*].grassTint` is an `[r,g,b]` multiplier applied
**only** to `this._groundMat` in `setGraphicsQuality` — Low uses `[1.25,1.45,1.0]` to match
the lush look without touching walls/props/anything else; Medium/High use `[1,1,1]`. Nudge
the Low values if the green is too strong/weak.

## Tuning knobs
Light intensities/colours and per-tier flags live in `Level.QUALITY`. Bloom params in
`buildComposer`. Grass `repeat` in `loadGroundImage`; grass colour via per-tier `grassTint`.
