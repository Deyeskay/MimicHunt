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

### The 20 steps

0. **Choose control mode** (`mode:true`) — 🖥 PC / 📱 Mobile buttons set
   `GAME_SETTINGS.showMobileControls` (persisted, mirrors the Settings toggle) then advance.
   Next is hidden here; the choice buttons drive the step.
1. Intro (button)
2. **Sensitivity** — `spot()` walks ☰ (`#btn-leave`) → Controls (`#btn-controls`) →
   `#ctl-sensitivity`, and once a slider moves it jumps to the Controls panel's own **DONE**
   button (`#btn-controls-close`) while tucking the coach box (it overlaps the panel's
   bottom). `check` = camera/shoot sensitivity changed from the captured baseline **and** the
   Controls panel is closed — i.e. the player changed a slider and tapped the panel's DONE.
3. **Edit Layout** — `spot()` walks ☰ → `#btn-edit-layout` → `#btn-layout-save`; `check` =
   the layout editor was opened then closed (`isEditingLayout` edge). Uses the existing
   `LayoutEditor` ([layout.js](../js/layout.js)).
4. Beams explainer (button) — gold = power, purple = key (hider-only).
5. Hunter intro (button).
6. **Shoot a hider** — dummy ahead; `check` = its `health < HIDER_MAX_HP`.
7. **Shoot a disguised hider** — disguised dummy; the native `processShot` `forcedOut`
   branch breaks the disguise; `check` = its `disguiseType === 'player'`.
8–10. **Hunter powers** — `Network.grantPower(myId,'gold', 'scan'|'jammer'|'kill')`. Kill is
   interactive (`check` = dummy `isCaught`); scan/jammer are observe-then-Next.
11. **Role switch → Hider** — `switchToHider()` (set role/color, reset combat + disguise,
    delete the local mesh so the render loop rebuilds it with the hider rig).
12. **Disguise** — placed next to a prop; `check` = `Mechanics.isDisguised()`.
13. **Reset** — `check` = `!Mechanics.isDisguised()`.
14. **Invisibility from a gold beam** — `dropBeamAt('gold', …)` under the player; the real
    `tickBeams` pickup grants 5s auto-invis (`PICKUP_INVIS_MS`); `check` = `invisUntil` active.
15. **Disguise-lock on a hit** — disguises the player, then after a short beat forces the hit
    (`revealedUntil` + `disguiseLockUntil` + break); `check` = the lock window has elapsed.
16–18. **Hider powers** — set `heldPower` and let the player press E/`Network.handleActivate`:
    Heal (full HP), Invis (10s), Shield (armed).
19. Finish (button) → `Tutorial.finish()`.

**Dialogue chrome:** Skip is pinned far-left; the action button (and the mode-choice
buttons) group on the right. `button` steps show **Next**; DO-IT (`auto`) steps show **OK**
(on PC **"OK (F)"**), which just hides the dialogue so the player can act with a clear view
(the step stays active and its `check()` keeps polling — completing it re-opens the panel and
advances). On **PC** the Next button reads **"Next (F)"** and the **F** key advances `button`
steps (and tucks the panel on `auto` steps) — skipped on the mode step and on mobile, and it never clashes with the F
disguise key (disguise steps are `auto` with Next hidden, and no `button` step leaves the
player standing beside a disguisable prop).

## Coachmark rendering

`#tutorial-layer` (z-index 150 — above the HUD/menu/layout-editor, below the results screen)
is `pointer-events:none`; only `#tut-dialogue` is interactive. Pieces:

- `#tut-dim` — plain full-screen darkener for dialogue-only steps.
- `#tut-ring` — transparent box positioned over the spotlight target; a huge `box-shadow`
  cuts the spotlight hole (dims everything else). `.soft` variant drops the dim (just a glow)
  for in-world steps where the player needs a clear view. **This ring box-shadow is the only
  dark overlay in the tutorial** — it appears solely on the two hard-spotlight steps
  (sensitivity + layout). `#tut-dim` is kept for structure but held at opacity 0.
- `#tut-arrow` — bouncing pointer, left of the target (flips to the right on left-edge targets).
- `#tut-dialogue` — the coach box (avatar, title, `N / total`, body HTML, Next / Skip). Pinned
  at `bottom:112px` so it clears the bottom-center HUD (health/ammo pill + active-effect).

`_reposition()` (called each frame) reads the target's `getBoundingClientRect()` and moves
the ring + arrow. Visibility is tested with **computed** display (`_shown(id)`), not inline
`.style.display`, because panels hidden by a CSS class have an empty inline value.

### Magical-flash transition

Steps that teleport the player or switch role would make the camera snap. Those steps are
flagged `transition: true`; `enterStep` then runs the whole step body (objective + `onEnter`
+ button chrome) through `playTransition(run)`: a full-screen `#tut-transition` overlay
blooms to a white→blue radial flash (380ms), `run()` executes **at the opaque peak** (so the
relocation is hidden), then it dissolves out (520ms). A `_stepReady` flag holds `update()`'s
`check()`/`spot()` until `run()` has finished, so an `auto` step can't complete on a
half-built scene. Used by step 11 (Hunter→Hider switch — mesh rebuild), step 12 (the disguise
step, which teleports the player beside a prop; the placement lives here rather than on step
11 so the role-switch step stays a plain PC button step showing "Next (F)"), and step 15
(disguise-lock reposition).

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

**Teardown:** `finish()`/`skip()` remove the bots + overlay, set the done-flag, clear
`gameState.training`, and `returnToLobby()`. If the match is torn down from elsewhere mid-run
(☰ → Exit Game → `leaveMatch` → `cleanup`), `Network.cleanup()` calls `Tutorial.abort()`
first — same cleanup minus the `returnToLobby` (cleanup handles that transition itself).

## Testing

Solo / single browser window (it's host-only): serve the folder, open in Chrome,
Training tab → START TRAINING (or accept the first-run prompt). Walk each objective and
confirm the spotlight tracks the ☰→Controls→slider path, dummies spawn/despawn, powers
demonstrate, the role switches to Hider (rig rebuilds), and Skip/Finish returns to the lobby
with the done-flag set. `node --check js/tutorial.js` for syntax.
