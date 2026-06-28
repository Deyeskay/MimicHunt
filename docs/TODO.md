# TODO / Known Issues / Priorities

Ordered roughly by priority. Check RECENT_CHANGES.md for what just shipped.

## High — likely next, or user-flagged
1. **Tune the over-the-shoulder camera vs `expected.png`.** `CAM_BACK=5`,
   `CAM_RIGHT=1.7`, `CAM_EYE=2.6` in `Level.render`. Targets: player **22–28% from
   left**, character **28–35% of screen height**, slight downward tilt. Bigger
   `CAM_BACK` shrinks the character; bigger `CAM_RIGHT` pushes it left (flip sign if
   wrong side). Consider exposing these (or an FOV) in Settings.
2. **Responsive/landscape polish.** First responsive pass done
   (`@media (max-height:520px)` + portrait rotate overlay). Verify on real phones vs
   `expected.png`; the HUD pill row, joystick size, and button placement may need
   more tuning. Editor (`editor.html`) is **not** responsive.
3. **arena.js still bakes `"climbable": false`** on every prop → its rocks/bushes
   aren't climbable (forest.js was already stripped). Strip those lines (or
   re-export from the editor) so they inherit the prefab.

## Medium
4. **Editor cache + parity.** `editor.html` loads `prefabs.js`/`props.js` at a stale
   `?v=7`, so it lags the latest `props.js` (e.g. `raycastProps`, the climbable
   change). Bump its tags and re-verify the prefab editor + collider preview.
5. **Camera collision.** The OTS camera can clip into props/terrain (no camera
   collision/pull-in). Add a short raycast from player→camera to pull it in.
6. **Animation edge cases.** Verify masked layers on real `player.glb`: legs not
   moving during shoot, arms returning cleanly after the aim window, jump→land
   transitions, back-walk threshold (`vel·forward < -0.2`). Tune `LOWER_BODY_RE` if
   any bone mis-splits.
7. **Run clip unused.** `run` is loaded + split but never selected (movement speed is
   constant). Either drive it by speed or drop it.
8. **One-time match-start hitch** from skinned-shader compile / SkeletonUtils clones.
   Optional pre-warm during the loading screen.

## Low / nice-to-have
9. **Spectator mode** for eliminated hiders (currently frozen + can still look).
10. **In-game settings** (sensitivity, FOV, camera distance) without leaving a match.
11. **Per-instance collider overrides** in the editor (currently prefab-templated).
12. **Sound polish / volume control / mute**; spatial audio for remote shots.
13. **Resume-in-progress-match after migration** seam (dead code until non-host
    seekers are common — see NETWORK_PROTOCOL.md migration).
14. **PWA + true `screen.orientation.lock('landscape')`** if wrapping as an app.

## Housekeeping / repo
- **Do not git push unless asked** (standing instruction). Repo `Deyeskay/MimicHunt`;
  `main` == `version1` (full project + models). Local-only `master`, `version2`.
- `.claude/settings.json` has an intentional uncommitted local change — leave it out
  of commits unless asked.
- Keep `?v=` in sync between `index.html` and `js/levels/registry.js` on every change
  (currently **v=26**).
- These docs replaced the old `game/js/...`-path docs after the folder flatten; keep
  them current (especially RECENT_CHANGES.md) when resuming.
