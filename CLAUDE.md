# CLAUDE.md — Start Here

**MimicHunt** — a browser, peer-to-peer 3D hide-and-seek shooter. Hiders disguise as
level props; seekers hunt them with energy-pulse shots. Three.js (r128) + PeerJS
(WebRTC), authoritative-host star topology, no backend.

## Before doing any work, read the docs

This repo has a full developer-docs set in [`docs/`](docs/). **On every new session /
after a context clear:**

1. Read **[docs/README.md](docs/README.md)** — the index of all docs.
2. Read **[docs/RECENT_CHANGES.md](docs/RECENT_CHANGES.md)** — newest-first changelog;
   tells you what just shipped.
3. Then open only the per-system docs relevant to the task (e.g.
   [CAMERA_AND_CONTROLS.md](docs/CAMERA_AND_CONTROLS.md),
   [NETWORK_PROTOCOL.md](docs/NETWORK_PROTOCOL.md),
   [ANIMATION_SYSTEM.md](docs/ANIMATION_SYSTEM.md), …) and the relevant code.

Check **[docs/TODO.md](docs/TODO.md)** for known issues / prioritized next work.

## Cardinal facts (don't re-derive these)

- **No build step.** Plain scripts loaded in order by `index.html`. After editing any
  `.js`/`.css`, the user **hard-refreshes** (Ctrl+Shift+R) to validate — do **not**
  bump the `?v=N` cache query per change (only bump to bust a deployed cache).
- **Edit text files only with the Edit/Write tools** — they preserve UTF-8 (no BOM).
  Never use PowerShell `Set-Content`/`Out-File` on source files; it mojibakes
  multi-byte characters (em-dashes, emoji).
- **Cross-file globals.** Everything shares globals declared in `js/globals.js`
  (`gameState`, `localPos`, `cameraYaw`, combat consts, etc.). No modules/bundler.
- **Verification is manual** — `node --check js/<file>.js` for syntax only; real
  testing = a static server + 2 browser windows (host + client). No automated tests.
- **Do NOT git push/commit unless the user explicitly asks** (standing instruction as
  of 2026-06-28). Repo: `https://github.com/Deyeskay/MimicHunt`.
- **Work on `main` directly from now on** (as of 2026-06-29). `main` and `version1`
  were synced and the user dropped the dual-branch workflow — commit/push to `main`.
  Keep `.claude/settings.json` out of commits (it has an intentional local-only change).
- **Keep the docs current** — when code changes, update
  [docs/RECENT_CHANGES.md](docs/RECENT_CHANGES.md) and the affected per-system doc.
- **Windows / PowerShell** dev environment (a Bash tool is also available).
