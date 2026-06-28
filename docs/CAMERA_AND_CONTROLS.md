# Camera & Controls

## Over-the-shoulder camera (`js/level.js` → `render`, bottom block)
PUBG/Free-Fire-style third-person rig. The camera sits **behind + above + to the
right shoulder** of the local player, so the player renders **left-of-centre** with
lots of space ahead; the **centred crosshair = the aim/shot direction**.

```js
const CAM_BACK = 5.0;   // distance behind (smaller → bigger character on screen)
const CAM_RIGHT = 1.7;  // right-shoulder offset (player sits left-of-centre)
const CAM_EYE = 2.6;    // camera height above the player's feet
// forward (into screen): fX=-sin(yaw), fZ=-cos(yaw); right: rX=-fZ, rZ=fX
// look dir incl. pitch: dX=fX*cos(pitch), dY=-sin(pitch), dZ=fZ*cos(pitch)
camera.position = (p.x - fX*CAM_BACK + rX*CAM_RIGHT, groundY+CAM_EYE, p.z - fZ*CAM_BACK + rZ*CAM_RIGHT)
camera.lookAt(camera.position + d)   // crosshair-centred aim
```
- Default downward tilt comes from `cameraPitch ≈ 0.2 rad ≈ 11°` (range
  `[-10°, +70°]`).
- **Tuning** (to match the user's `expected.png`): bigger `CAM_BACK` shrinks the
  character (target "fills 28–35% of height"); bigger `CAM_RIGHT` pushes the player
  further left (target "22–28% from left edge"); flip `CAM_RIGHT` sign if the player
  ends up on the wrong side. **This still needs a visual pass.**
- The shot **aim ray** (`getAimRay`) uses `camera.getWorldPosition` +
  `getWorldDirection`, so it always matches the crosshair regardless of the rig.
- The editor preview camera is a separate orbit rig (don't confuse them).

### Camera collision (Cinemachine-style decollision)
The boom no longer passes through walls. Each frame, before positioning the camera, a
ray is cast from the **head pivot** `(p.x, groundY+CAM_EYE, p.z)` outward along the
desired camera offset (the normalized `offX/offZ`, which includes the shoulder) using
the existing `PropLevel.raycastProps(...)` — the same ray-vs-collider test used for
shots, so it covers **all collidable props** (walls, trees, rocks). If the nearest hit
is closer than the full boom, the boom is clamped to `hit - CAM_CLEAR`, and the whole
offset is scaled by `effectiveLen / boomLen` (pulling straight toward the pivot, so the
camera **height stays fixed** and the shoulder offset shrinks proportionally — it slides
along the wall as you rotate).
```js
const CAM_CLEAR = 0.4;   // keep camera this far in front of a wall (camera "radius")
const CAM_MIN   = 1.0;   // never pull closer than this to the head pivot
const CAM_EXTEND = 0.12; // ease-out speed per frame when space reopens
```
- **Snap in, glide out:** when the clamped target is closer than the current distance it
  is applied **instantly** (no clipping on fast turns); when space reopens it **lerps**
  back out by `CAM_EXTEND`. The smoothed distance persists as `Level._camDist`.
- The ray is **horizontal** (`dy=0`) at eye height to match the fixed camera height, so
  tall walls block but low bushes the camera sits above are ignored.
- `raycastProps` reads only static `mapProps3D`, **not** disguised hiders — so the camera
  never pulls in toward a hider and reveals them.
- **Tuning:** raise `CAM_CLEAR` (0.3–0.6) if the near plane still grazes walls; lower
  `CAM_EXTEND` for a lazier extend, raise it for a snappier return.

## Camera vs character facing (PUBG decoupling)
- The mouse/touch **look** orbits the camera (`cameraYaw`, `cameraPitch`) — it does
  **not** rotate the character.
- The **character** faces its **movement heading**: `Mechanics.handleLocalMovement`
  computes a `targetRotY = atan2(moveX, moveZ)` (movement is relative to `cameraYaw`)
  and **smoothly lerps `localRotY` toward it** (`TURN_LERP = 0.2`/tick, shortest
  angular path) so the character pivots instead of snapping. Position movement still
  follows the instant input direction. `applyLocalTransform`/`clientMove` send
  `localRotY` (not `cameraYaw`) as `rotY`. Idle keeps the last facing.
- **Exception — aim-stance:** while a Seeker's `shootingUntil` is active, `targetRotY
  = cameraYaw + Math.PI` (face the crosshair/target, also smoothed); retreating then
  back-walks (see ANIMATION_SYSTEM.md).

## Desktop input (`Mechanics.initInputs`)
- **Move**: WASD / arrows → `moveX/moveZ` relative to `cameraYaw`.
- **Look**: click the canvas → `requestPointerLock`; `mousemove` (while locked)
  adjusts `cameraYaw/cameraPitch` by `movementX/Y * mouseSensitivity` (pitch
  clamped). `#mouse-hint` shows when unlocked.
- **Shoot**: `mousedown` (button 0) while pointer-locked → `fireShot` (self-gates to
  Seeker + HUNTING + alive). First click only locks the pointer.
- **Jump**: Space (if `isGrounded`). **Disguise**: F. **Dev gizmos**: G.

## Mobile input (multi-touch, `Mechanics.initInputs`)
- **Joystick** (`#joystick-zone`, bottom-left): identifier-based (`joyTouchId`) so a
  second finger can't hijack it; `handleJoystickTouch` sets `touchVector`, consumed
  in `handleLocalMovement`.
- **Camera look**: document-level touch handlers claim the first touch on the
  **right half** of the screen (`clientX > innerWidth/2`) that isn't on a `.interactive`
  button (`elementFromPoint(...).closest('.interactive')`), tracked by `lookTouchId`;
  drag adjusts `cameraYaw/cameraPitch` (`mouseSensitivity * 1.5`). Runs alongside the
  joystick.
- **Buttons** (`#action-pad`, bottom-right, all `.interactive`): JUMP always; PROP(F)
  for hiders, SHOOT for seekers (toggled by role in `UI.updateHUD`). `touchstart` →
  `jump`/`handleDisguiseSwap`/`fireShot`.

## Movement, collision, climbing (`handleLocalMovement`)
- Speed `moveSpeed = 0.15`/tick (~9 u/s; was 0.3). World clamp ±100.
- **Per-axis wall sliding**: X then Z tested independently via `blockedAt` (compound
  collider test) so you slide along surfaces instead of sticking.
- **Climbing (floor model)**: each frame finds the **highest climbable surface** the
  player is horizontally over (`isClimbable`, within `radius+myRadius`, and at/above
  it with a 0.3 tolerance) → `floorY`. Gravity then lands the player on `floorY` (or
  world ground). This lets you **jump onto and stand on rocks/bushes** and fall when
  walking off; the old code required being within 0.15u of the exact top (couldn't
  land). `velocityY/GRAVITY/JUMP_STRENGTH/isGrounded` drive the jump arc.

## Landscape-only + responsive (see UI_FLOW.md)
- Portrait shows a full-screen `#rotate-overlay` (CSS `@media (orientation: portrait)`)
  — the robust web way to enforce landscape (true `screen.orientation.lock` only
  works in fullscreen/PWA).
- `@media (max-height: 520px)` compacts the HUD + controls + menus for landscape
  phones.

## Settings that affect controls (`GAME_SETTINGS`)
`mouseSensitivity` (also scales touch look ×1.5), `cameraFov` (default 60; read in
`Level.init`, changeable live via `Level.setFov` + the Settings FOV slider — clamped
40–100), `invertY`, `showMobileControls` (toggles `.mobile-controls` via
`body.hide-mobile-controls`). The Settings screen sliders for sensitivity and FOV
apply live while dragging.
