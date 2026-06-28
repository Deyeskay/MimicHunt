# MimicHunt — Developer Documentation Index

A browser, peer-to-peer 3D hide-and-seek shooter. Hiders disguise as level props;
seekers hunt them with energy-pulse shots. Three.js (r128) + PeerJS (WebRTC),
authoritative-host star topology, no backend.

**Read the docs you need for the task — they're deliberately split.**

| Doc | What it covers |
|-----|----------------|
| [RECENT_CHANGES.md](RECENT_CHANGES.md) | Newest-first changelog. **Read this first when resuming.** |
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | What the game is, stack, how to run, repo/deploy. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Runtime layers, load order, the two clocks, big picture. |
| [FILE_REFERENCE.md](FILE_REFERENCE.md) | Every file → responsibility → key functions/lines. |
| [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md) | All PeerJS messages, packet formats, ownership, migration. |
| [PLAYER_STATE.md](PLAYER_STATE.md) | The player record: every field, who writes it, how it syncs. |
| [GAMEPLAY.md](GAMEPLAY.md) | Rules, phases, combat (shooting/health/reveal), win conditions. |
| [ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md) | Clip loading, lower/upper masked layers, jump, shoot, back-walk. |
| [CAMERA_AND_CONTROLS.md](CAMERA_AND_CONTROLS.md) | Over-the-shoulder rig, desktop+mobile input, landscape. |
| [LEVEL_SYSTEM.md](LEVEL_SYSTEM.md) | Registry, level files, dynamic load, spawns. |
| [PROP_SYSTEM.md](PROP_SYSTEM.md) | Prefabs, compound colliders, disguise, ray occlusion, climbing. |
| [UI_FLOW.md](UI_FLOW.md) | Screen flow, HUD, responsive/landscape CSS, the editor. |
| [PERFORMANCE_NOTES.md](PERFORMANCE_NOTES.md) | Frame budget, interpolation, GC, known costs. |
| [DECISIONS.md](DECISIONS.md) | Major design decisions and the *why*. |
| [TODO.md](TODO.md) | Known bugs, limitations, prioritized next work. |

## Cardinal facts (so you don't re-derive them)
- **No build step.** Plain ES5/ES6 scripts loaded in order by `index.html`. Edit a
  `.js`/`.css` and **hard-refresh** (Ctrl+Shift+R) to validate — the `?v=N` cache
  query is **no longer bumped per change** (the user hard-reloads manually). Only bump
  it if you must bust a *deployed* cache. `index.html` currently sits at `v=24`.
- **Edit text files only with the Edit/Write tools** (they preserve UTF-8, no BOM).
  Never use PowerShell `Set-Content`/`Out-File` on source files — it re-encodes
  multi-byte chars (em-dashes, emoji) into mojibake.
- **Cross-file globals.** Everything shares globals declared in `js/globals.js`
  (`gameState`, `localPos`, `cameraYaw`, combat consts, etc.). No modules.
- **Verification is manual** — `node --check js/<file>.js` for syntax only; real
  testing = a static server + 2 browser windows (host + client). No automated tests.
- **Do NOT git push unless the user explicitly asks** (standing instruction as of
  2026-06-28). Repo: `https://github.com/Deyeskay/MimicHunt` (branches `main` and
  `version1` are identical and complete; GitHub Pages serves `main`).
- **Windows / PowerShell** dev environment; a Bash tool is also available.
