# Design Decisions (and why)

The *why* behind settled trade-offs, so they aren't re-litigated. Update when a
decision changes. (Newest decisions are folded in; see RECENT_CHANGES.md for the
timeline.)

## Topology & netcode
- **Authoritative-host star.** One source of truth prevents divergence/cheating;
  clients send inputs, host broadcasts state. Deterministic host id
  `hnh3d-<code>`. Trade-off: host is a single point of failure → mitigated by host
  migration. The 4-digit code dies on host crash (successor mints a new one).
- **60 Hz sim / 20 Hz transmit, client prediction, 100 ms entity interpolation.**
  Bandwidth ~3× lower with no felt latency. Local player never overwritten by its
  own snapshot. Time-based interpolation → frame-rate independent.
- **Transform in snapshots; everything else as discrete events.** Keeps the hot
  path tiny. Per-peer time windows are sent as **durations**, each peer stamps its
  own `now()` → no clock sync needed.
- **Disconnect detection via heartbeat/watchdog, "migrate on any drop."**
  `conn.on('close')` is unreliable on abrupt tab close; refresh and close are
  indistinguishable, so we just detect silence and migrate. `sessionEnding`
  distinguishes voluntary shutdown from a crash.

## Gameplay
- **Shooting replaced proximity "catch."** Energy-pulse shooter (crosshair, ammo,
  HP, reveal, score) is the core loop. **Host-authoritative hits** (client supplies
  aim ray; host validates geometry + occlusion) — cheat-resistant enough for a
  casual game while letting the client keep responsive local visuals.
- **HP 5 / every hit −1 (first hit also reveals).** 5 hits to eliminate; clean and
  matches "health = 5". Reveal = 2 s red blink; disguise lock = 5 s so a revealed
  hider can't instantly re-hide. +100/hit.
- **Energy-pulse weapon feel** (blue bolt + synth "pew"/"hurt", red flash) over a
  military gun — fits the playful hide-and-seek theme. No audio assets (WebAudio).
- **Props occlude shots; disguised hiders are targets.** A rock/tree blocks the
  bolt (`raycastProps`), but a hider disguised as a prop is a player, so it's hit-
  able; a real prop between you and it still blocks.
- **`isCaught` reused as "eliminated."** Reuses existing freeze/grey/win-count
  plumbing instead of a parallel flag.

## Characters, animation, camera
- **Real animated player model** (`player.glb` via SkeletonUtils) with a procedural
  bob fallback and a fallback→character self-heal (handles the load race).
- **Masked-override animation (two layers), not additive.** The idle is an animated
  "searching" clip; additive shoot fought it. Splitting clips into lower/upper bone
  sets lets the upper body *override* to shoot while legs locomote. Jump is a
  full-body one-shot. Back-pedal = reversed walk.
- **PUBG-style decoupled facing + over-the-shoulder camera.** Mouse/touch orbits the
  camera; the character faces its movement heading (except aim-stance, where it
  faces the crosshair and back-walks). OTS rig: behind+above+right shoulder, player
  left-of-centre, crosshair-centred aim (so `getWorldDirection` = shot dir).
- **Mobile dual-stick.** Left joystick (own touch id) + right-half drag look
  (own touch id), buttons excluded via `.interactive`.

## Levels & props
- **Folder-sourced, self-registering levels.** Browsers can't list folders, so a
  `LEVEL_FILES` manifest + sequential loader; only the level **name** crosses the
  wire (props bundled identically on all peers).
- **Prefab system + compound colliders.** Type defaults + per-instance overrides;
  colliders are per-type templates (fractions of bounds) so a tree gets a slim trunk
  + floating canopy instead of one fat cylinder. `prop.radius` (disguise/climb/
  spawn/hit) stays untouched; only movement-block + shot-occlusion use the pieces.
- **`climbable` resolves instance-wins-else-prefab.** Older fat level files baked
  `climbable:false` everywhere; forest.js was stripped to inherit the prefab. (This
  reverted an earlier "prefab always wins" experiment that broke per-instance
  overrides.)
- **Floor-model climbing.** Highest climbable surface under the player = floor;
  gravity lands you on it. Replaced an exact-height check that made landing on rocks
  impossible.

## UI / platform
- **Landscape-only via a portrait rotate overlay.** True OS lock needs fullscreen/
  PWA; the overlay is the reliable web enforcement. Responsive rules target short
  (landscape-phone) viewports.
- **No build step, cross-file globals, `?v=` cache-busting.** Simplicity for a
  prototype; the recurring cost is remembering to bump `?v=` (and that stale CSS/JS
  reads as "my change didn't apply").

## Repo
- **Models committed** (removed `.gitignore` for `assets/models/*`) so a clone is
  runnable; `main` and `version1` kept identical; **pushing is opt-in** per the user.
