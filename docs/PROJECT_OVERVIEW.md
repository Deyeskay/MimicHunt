# Project Overview

## What it is
**MimicHunt** — a real-time multiplayer 3D hide-and-seek shooter that runs entirely
in the browser. Hiders **disguise as level props** (rock/tree/bush); seekers **hunt
and shoot** them with playful blue "energy pulses". Peer-to-peer over WebRTC
(PeerJS); one peer is the authoritative host. No server, no build step.

- Genre: third-person, over-the-shoulder, casual shooter / prop-hunt.
- Players: 2+ (≥1 Hider and ≥1 Seeker to start). Multiple seekers allowed.
- Target: **mobile landscape** (also fully playable on desktop).

## Tech stack
- **Three.js r128** (CDN) + `GLTFLoader` + `SkeletonUtils` (skinned-mesh cloning).
- **PeerJS 1.5.4** (CDN) — WebRTC data channels; public broker for signaling only.
- Plain JavaScript, **no bundler/modules** — scripts share cross-file globals
  (see `js/globals.js`).
- **WebAudio** (synthesized SFX, no audio files).
- Assets: low-poly `.glb` models in `assets/models/` (`player.glb` is rigged with
  idle/walk/run/jump/shoot Mixamo clips).

## How to run
Static files — serve over HTTP (not `file://`; WebRTC/relative paths need an origin):

```bash
# from repo root
python -m http.server 8000      # or:  npx serve .   |   npx http-server -p 8000
```

Open **two+ browser windows** at `http://localhost:8000/`:
1. Window 1 (host): enter a name → **Host New Session** → a 4-digit code appears.
2. Window 2+ (clients): enter name → enter code → **Join Room**.
3. Lobby: host picks a level (carousel); each player picks **Hider/Seeker** and
   **Ready**. Start unlocks at ≥1 Hider, ≥1 Seeker, all ready.
4. Play. Mobile must be **landscape** (portrait shows a rotate prompt).

Level editor: `http://localhost:8000/editor.html`.

> Multiplayer needs ≥2 windows/devices. A single window can't show netcode,
> disguise replication, shooting, or win conditions.

## Repo / deploy
- GitHub: **`https://github.com/Deyeskay/MimicHunt`**. Branches `main` and
  `version1` are identical and contain the full project **including** the `.glb`
  models. GitHub Pages serves `main` (`deyeskay.github.io/MimicHunt`).
- **Do not push unless the user explicitly asks** (standing instruction).
- Local-only branches `master` and `version2` exist but aren't pushed.
- `.gitignore` was removed (models are intentionally committed).

## Controls (summary — see CAMERA_AND_CONTROLS.md)
| Action | Desktop | Mobile |
|---|---|---|
| Move | WASD / arrows | left joystick |
| Look (camera) | mouse (click to pointer-lock) | drag right half of screen |
| Jump | Space | JUMP button |
| Disguise / swap prop (Hider) | F | PROP (F) button |
| Shoot (Seeker) | left-click (pointer-locked) | SHOOT button |
| Dev collider gizmos | G | — |
