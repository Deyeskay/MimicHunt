# Tutorial / Training System

An interactive, PUBG/Fortnite-style onboarding flow that teaches every mechanic by
making the player **perform** it — guided by a dim/spotlight overlay, a bouncing arrow,
and a coach dialogue box. All of it lives in **`js/tutorial.js`** (the global `Tutorial`
object); the overlay chrome is `#tutorial-layer` in `index.html`, styled in
`css/style.css`.

## Why it's cheap: solo, host-only

On boot the player is **already the auto-hosted host of a live lobby**
(`Network.autoHostLobby` → `runHostLogic`, host loops running). So training is just a
**solo match with no peers** — `broadcast()` to zero connections is a no-op.

`Tutorial.start()`:
1. Guards: must be `isHost`, have `gameState.players[myId]`, and be in `LOBBY`.
2. `gameState.training = true`, `gameState.levelName = 'Rainbow Woods'`, host role = Seeker.
3. Calls `Network.startGameBroadcast()` (loads the level, spawns the player, resets combat,
   `UI.transitionToGame()`), then promotes `gameState.phase = 'HUNTING'` so controls are
   live immediately (no seeker HIDING blind).
4. Shows `#tutorial-layer` and enters step 0.

## `gameState.training` — the gate

A new flag on `gameState` (default `false`, [globals.js](../js/globals.js)). While true it
suppresses the host auto-pacing so the tutorial fully owns the flow:

| Gated site | Effect when `training` |
|---|---|
| Timer loop ([network.js](../js/network.js) `startHostLoops`) | early-return — no HIDING→HUNTING flip, no airdrop schedule, no time-up win |
| `Mechanics.checkWinConditions` ([mechanics.js](../js/mechanics.js)) | early-return — eliminating a practice dummy can't fire "Seeker Wins" |
| `UI.updateObjective` ([ui.js](../js/ui.js)) | early-return — the tutorial owns the objective pill (`UI.objective`) |

**Not gated:** `tickBeams`/`tickKeys`. `tickBeams`'s walk-in **pickup** detection is reused
for the invisibility objective; automatic airdrops never fire because the tutorial leaves
`_beamSched` null (it's only built at the real HIDING→HUNTING flip, which training skips).

Normal multiplayer is unaffected — every gate is a no-op when `training` is false, and the
flag is only ever set true by `Tutorial` (and reset to false in `_teardown` before
`returnToLobby`).

## The step machine

`Tutorial.steps` is an ordered list. Each step:

```
{ objective,                      // text for the top-left objective pill
  advance: 'button' | 'auto',     // Next click, or poll check() every frame
  onEnter(),                      // set up the scene: spawn bots / force effects / dialogue
  check() -> bool,                // (auto) objective-complete test, polled each frame
  onExit(),                       // cleanup (usually despawn the step's bot)
  spot() -> cssSelector,          // (optional) live spotlight target, re-evaluated each frame
  soft: bool }                    // spotlight WITHOUT the full-screen dim (in-world steps)
```

`Tutorial.update(dt)` is pumped from the main `animate()` loop ([app.js](../js/app.js)) while
`Tutorial.active`: it re-evaluates `spot()`, repositions the ring/arrow, and for `auto`
steps calls `check()` → `nextStep()` when true. `nextStep()` runs `onExit`, then either
`enterStep(i+1)` or `finish()`.

### The 19 steps

0. Intro (button)
1. **Sensitivity** — `spot()` walks ☰ (`#btn-leave`) → Controls (`#btn-controls`) →
   `#ctl-sensitivity`; `check` = camera/shoot sensitivity changed from the captured baseline.
2. **Edit Layout** — `spot()` walks ☰ → `#btn-edit-layout` → `#btn-layout-save`; `check` =
   the layout editor was opened then closed (`isEditingLayout` edge). Uses the existing
   `LayoutEditor` ([layout.js](../js/layout.js)).
3. Beams explainer (button) — gold = power, purple = key (hider-only).
4. Hunter intro (button).
5. **Shoot a hider** — dummy ahead; `check` = its `health < HIDER_MAX_HP`.
6. **Shoot a disguised hider** — disguised dummy; the native `processShot` `forcedOut`
   branch breaks the disguise; `check` = its `disguiseType === 'player'`.
7–9. **Hunter powers** — `Network.grantPower(myId,'gold', 'scan'|'jammer'|'kill')`. Kill is
   interactive (`check` = dummy `isCaught`); scan/jammer are observe-then-Next.
10. **Role switch → Hider** — `switchToHider()` (set role/color, reset combat + disguise,
    delete the local mesh so the render loop rebuilds it with the hider rig).
11. **Disguise** — placed next to a prop; `check` = `Mechanics.isDisguised()`.
12. **Reset** — `check` = `!Mechanics.isDisguised()`.
13. **Invisibility from a gold beam** — `dropBeamAt('gold', …)` under the player; the real
    `tickBeams` pickup grants 5s auto-invis (`PICKUP_INVIS_MS`); `check` = `invisUntil` active.
14. **Disguise-lock on a hit** — disguises the player, then after a short beat forces the hit
    (`revealedUntil` + `disguiseLockUntil` + break); `check` = the lock window has elapsed.
15–17. **Hider powers** — set `heldPower` and let the player press E/`Network.handleActivate`:
    Heal (full HP), Invis (10s), Shield (armed).
18. Finish (button) → `Tutorial.finish()`.

## Coachmark rendering

`#tutorial-layer` (z-index 150 — above the HUD/menu/layout-editor, below the results screen)
is `pointer-events:none`; only `#tut-dialogue` is interactive. Pieces:

- `#tut-dim` — plain full-screen darkener for dialogue-only steps.
- `#tut-ring` — transparent box positioned over the spotlight target; a huge `box-shadow`
  cuts the spotlight hole (dims everything else). `.soft` variant drops the dim (just a glow)
  for in-world steps where the player needs a clear view.
- `#tut-arrow` — bouncing pointer, left of the target (flips to the right on left-edge targets).
- `#tut-dialogue` — the coach box (avatar, title, `N / total`, body HTML, Next / Skip).

`_reposition()` (called each frame) reads the target's `getBoundingClientRect()` and moves
the ring + arrow. Visibility is tested with **computed** display (`_shown(id)`), not inline
`.style.display`, because panels hidden by a CSS class have an empty inline value.

## Static dummy targets

`spawnDummy(key, opts)` injects a full, non-AI **hider record** into `gameState.players`
under a `TUTORIAL_BOT_PREFIX` id (built via `Network.createPlayer('Hider', …)` then
position-overridden). The in-match render loop ([level.js](../js/level.js)
`Level.render`) auto-builds a mesh for any player record and prunes it when the record is
gone, and combat/scan iterate `gameState.players` — so a dummy is a real target with **zero
extra wiring**. Its position round-trips through the snapshot buffer (feet↔centre), so
setting `x/y/z` on the record is enough; `spawnDummyAhead()` places it along the player's
forward so the crosshair already frames it.

Effects that must land **on the player** are forced with the same host calls the real game
uses: `Network.grantPower`, `Network.handleActivate`, `Mechanics.applyDisguiseFromProp`, and
`Tutorial.dropBeamAt` (a thin clone of `Network.spawnBeam` that places the beam at a chosen
XZ instead of a random spawn). All dummies are removed in `_teardown` **before**
`Network.returnToLobby()` (so a leftover dummy can't become a lobby character model).

## Entry points

- **START TRAINING** button (`#btn-lobby-train`, [app.js](../js/app.js)) → `Tutorial.start()`.
- **First-run auto-prompt** — after `autoHostLobby`, `Tutorial.maybeAutoPrompt()` offers the
  run via `UI.showConfirm`, unless the `hnh_tutorial_done` localStorage flag is set (written
  on finish **or** skip).

## Testing

Solo / single browser window (it's host-only): serve the folder, open in Chrome,
Training tab → START TRAINING (or accept the first-run prompt). Walk each objective and
confirm the spotlight tracks the ☰→Controls→slider path, dummies spawn/despawn, powers
demonstrate, the role switches to Hider (rig rebuilds), and Skip/Finish returns to the lobby
with the done-flag set. `node --check js/tutorial.js` for syntax.
