/*=====================================================================
  network.js – Multiplayer networking for Hide & Seek
  Authoritative Host model using PeerJS
  ---------------------------------------------------------------
  Globals (provided by the project):
    peer, connections, connToHost, isHost, isLeavingRoom,
    myId, amIReady, gameLoopInterval, timerInterval,
    gameState, playerMeshes, mapProps3D, scene,
    localPos, localDisguise, cameraYaw,
    GAME_SETTINGS, HIDING_DURATION, ROUND_DURATION,
    UI, Mechanics, Level, PropLevel
=====================================================================*/

const Network = {
    /*=================================================================
      Helper: generate a 4‑digit room code
    =================================================================*/
    generateCode() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    },

    /*=================================================================
      Helper: pick a spawn position for a role
    =================================================================*/
    getSpawnForRole(role, used) {
        const spawns = PropLevel.getSpawnPositions(mapProps3D);
        const candidates = role === 'Seeker' ? spawns.seeker : spawns.hider;
        return PropLevel.pickSpawn(candidates, used);
    },

    /*=================================================================
      Helper: create a player object with initial data
    =================================================================*/
    createPlayer(role, used, name) {
        const spawn = this.getSpawnForRole(role, used);
        used.push(spawn);
        return {
            x: spawn.x,
            y: spawn.y,
            z: spawn.z,
            rotY: 0,
            role,
            name: name || '',
            isCaught: false,        // reused as "eliminated" (health hit 0)
            health: HIDER_MAX_HP,   // hider hit points (seeker unused)
            score: 0,               // seeker score (+HIT_SCORE per hit)
            revealedUntil: 0,       // local-clock deadline for the red reveal blink
            disguiseLockUntil: 0,   // local-clock deadline: can't re-disguise until then
            shootingUntil: 0,       // local-clock deadline for aim-stance + upper-body shoot anim
            jumpAt: 0,              // local-clock timestamp of the last jump (edge-detected for the anim)
            // Readiness is independent of role now (roles are user-chosen). The
            // host is marked ready explicitly by its callers; clients toggle it.
            isReady: false,
            disguiseType: 'player',
            disguiseSize: 2,
            propScale: 1,
            propHeight: 2,
            propRadius: 1,
            propRotation: null,
            disguiseTexture: null,
            color: role === 'Seeker' ? 0xff4757 : 0x2ed573,
            // --- AIRDROP POWER-UPS (see Network.grantPower / processShot) ---
            heldPower: null,        // hider: 'heal'|'invis'|'shield' awaiting manual activation (E)
            invisUntil: 0,          // hider: invisible-to-seeker deadline (local clock)
            invisTotalMs: 0,        // hider: the invis window's total ms (5s pickup vs 10s power) — for the HUD bar
            shieldArmed: false,     // hider: absorb-1-hit-while-disguised armed
            scanUntil: 0,           // seeker: see-hiders-through-walls deadline (local clock)
            killUntil: 0,           // seeker: one-shot-kill deadline (local clock)
            jamUntil: 0,            // seeker: own jammer-active deadline (hiders' locks reuse disguiseLockUntil)
            carriedKeys: 0          // hider: purple-beam keys held but not yet deposited
        };
    },

    /*=================================================================
      Broadcast helpers
    =================================================================*/
    broadcast(packet) {
        connections.forEach(c => {
            if (c.open) c.send(packet);
        });
    },

    broadcastExcept(packet, exceptId) {
        connections.forEach(c => {
            if (c.open && c.peer !== exceptId) c.send(packet);
        });
    },

    // Host-only: show an event toast locally AND on every client (e.g. a player
    // left / was eliminated / disconnected). Clients render it via case 'notice'.
    // `opts.audience` ('all'|'hiders'|'seekers') restricts who sees it — honored both
    // locally (the host's own role) and on clients. `opts.toastMs` lengthens display.
    notify(text, opts) {
        if (!text) return;
        opts = opts || {};
        const pkt = { type: 'notice', text: text };
        if (opts.audience) pkt.audience = opts.audience;
        if (opts.toastMs) pkt.toastMs = opts.toastMs;
        // Local (host) display, honoring audience against the host's own role.
        let show = true;
        if (opts.audience && opts.audience !== 'all') {
            const me = gameState.players[myId];
            const r = me && me.role;
            if (opts.audience === 'hiders' && r !== 'Hider') show = false;
            if (opts.audience === 'seekers' && r !== 'Seeker') show = false;
        }
        if (show && typeof UI !== 'undefined' && UI.toast)
            UI.toast(text, opts.toastMs ? { duration: opts.toastMs } : undefined);
        this.broadcast(pkt);
    },

    sendToHost(packet) {
        if (connToHost && connToHost.open) connToHost.send(packet);
    },

    /*=================================================================
      Monotonic clock for packet timestamps. Compared only within a
      single sender's stream (a client's moves, or the host's snapshots),
      so the per-peer clock origin never matters — only that it increases.
    =================================================================*/
    now() {
        return (typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : Date.now();
    },

    /*=================================================================
      Local-player prediction helper
      ---------------------------------------------------------------
      The local player is simulated at 60 FPS from localPos/cameraYaw.
      This copies that prediction onto our own player record every frame
      so rendering and the camera follow it smoothly. Snapshots from the
      host deliberately skip our own id, so this prediction is never
      overwritten; the host stays authoritative for the rest (caught,
      role, ready, and remote disguises) via discrete events.
    =================================================================*/
    applyLocalTransform(p) {
        if (!p) return;
        p.x = localPos.x;
        p.y = localPos.y;
        p.z = localPos.z;
        p.rotY = localRotY;   // face MOVEMENT direction (PUBG), not the camera
    },

    /*=================================================================
      Build a lightweight movement snapshot (host → clients, 20 Hz).
      Carries only the volatile fields — per-player transform plus the
      phase/timer header. Everything else (role, color, disguise, caught,
      ready) changes rarely and is replicated through discrete events, so
      it is intentionally absent here.
    =================================================================*/
    buildSnapshot() {
        const players = {};
        for (const id in gameState.players) {
            const p = gameState.players[id];
            players[id] = { x: p.x, y: p.y, z: p.z, rotY: p.rotY };
        }
        return {
            type: 'snapshot',
            t: this.now(),
            phase: gameState.phase,
            timer: gameState.timer,
            players
        };
    },

    /*=================================================================
      Snapshot buffer (entity interpolation)
      ---------------------------------------------------------------
      Rather than chasing the single latest snapshot, we keep a short
      time-stamped history and render REMOTE players slightly behind real
      time (INTERP_DELAY). Each frame we sample the transform at
      (now - INTERP_DELAY) by linearly interpolating between the two
      snapshots that bracket that instant. This absorbs packet-timing
      jitter and dropped packets far better than easing toward "latest".

      Snapshots are stamped with LOCAL arrival time (this.now()), so the
      math never depends on the host/client clocks agreeing. The host
      buffers its own outgoing snapshots too, so both ends render through
      the identical pipeline. Local player is always predicted, never
      sampled from here.
    =================================================================*/
    INTERP_DELAY: 100,        // ms behind real time (~2 snapshots @ 20 Hz)
    _snapshotBuffer: [],

    pushSnapshot(players) {
        const t = this.now();
        this._snapshotBuffer.push({ t, players });

        // Drop history older than ~1s, but always keep at least two frames
        // so interpolation has something to work with.
        const cutoff = t - 1000;
        while (this._snapshotBuffer.length > 2 &&
               this._snapshotBuffer[0].t < cutoff) {
            this._snapshotBuffer.shift();
        }
    },

    // Returns an { id: {x,y,z,rotY} } map interpolated at renderTime, or null
    // if nothing is buffered yet. Holds at the oldest/newest frame outside the
    // buffered range (no extrapolation — a starved buffer pauses, not jitters).
    sampleSnapshot(renderTime) {
        const buf = this._snapshotBuffer;
        if (buf.length === 0) return null;
        if (buf.length === 1) return buf[0].players;
        if (renderTime <= buf[0].t) return buf[0].players;

        const last = buf[buf.length - 1];
        if (renderTime >= last.t) return last.players;

        for (let i = 0; i < buf.length - 1; i++) {
            const a = buf[i];
            const b = buf[i + 1];
            if (renderTime >= a.t && renderTime <= b.t) {
                const span = b.t - a.t;
                const alpha = span > 0 ? (renderTime - a.t) / span : 0;
                return this._lerpPlayers(a.players, b.players, alpha);
            }
        }
        return last.players;
    },

    _lerpPlayers(a, b, alpha) {
        const out = {};
        for (const id in b) {
            const pb = b[id];
            const pa = a[id];
            if (!pa) { out[id] = { x: pb.x, y: pb.y, z: pb.z, rotY: pb.rotY }; continue; }
            out[id] = {
                x: pa.x + (pb.x - pa.x) * alpha,
                y: pa.y + (pb.y - pa.y) * alpha,
                z: pa.z + (pb.z - pa.z) * alpha,
                rotY: this._lerpAngle(pa.rotY, pb.rotY, alpha)
            };
        }
        return out;
    },

    // Shortest-path angular interpolation (handles the -PI/+PI wrap).
    _lerpAngle(from, to, t) {
        let diff = to - from;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return from + diff * t;
    },

    /*=================================================================
      Replicate the local player's disguise as a discrete event (only when it
      actually changes — see Mechanics.handleDisguiseSwap). A client sends it to
      the host (which relays to the others); the HOST broadcasts it straight to
      all clients — the host can be a Hider now, and sendToHost is a no-op for it.
    =================================================================*/
    sendDisguiseUpdate() {
        const payload = {
            disguiseType: localDisguise.type,
            disguiseSize: localDisguise.size,
            propScale: localDisguise.propScale,
            propHeight: localDisguise.propHeight,
            propRadius: localDisguise.propRadius,
            propRotation: localDisguise.propRotation,
            disguiseTexture: localDisguise.propTexture,
            color: localDisguise.color
        };
        if (isHost) {
            // Our roster entry is already updated by the caller; tell every client.
            this.broadcast(Object.assign({ type: 'disguise', id: myId }, payload));
        } else {
            this.sendToHost(Object.assign({ type: 'clientDisguise' }, payload));
        }
    },

    // Seeker fired an energy pulse. Host applies it directly; a client routes the
    // aim ray to the host (host is authoritative for hit/damage/score).
    sendShot(ray) {
        if (isHost) {
            this.processShot(myId, ray);
        } else {
            this.sendToHost({
                type: 'shoot', t: this.now(),
                ox: ray.ox, oy: ray.oy, oz: ray.oz,
                dx: ray.dx, dy: ray.dy, dz: ray.dz,
                mx: ray.mx, my: ray.my, mz: ray.mz
            });
        }
    },

    // Replicate a jump so every peer plays the jump animation for this player.
    sendJump() {
        if (isHost) this.broadcast({ type: 'jump', id: myId });
        else this.sendToHost({ type: 'clientJump' });
    },

    // HOST ONLY — validate a shot's geometry against hider positions (pure math,
    // no Three meshes), apply damage/reveal/disguise-lock/score, and broadcast the
    // result + projectile to everyone.
    processShot(shooterId, ray) {
        const shooter = gameState.players[shooterId];
        if (!shooter || shooter.role !== 'Seeker' || shooter.isCaught) return;
        if (gameState.phase !== 'HUNTING') return;

        const now = this.now();
        if (shooter._lastShotT && now - shooter._lastShotT < FIRE_INTERVAL_MS - 100) return; // anti-spam
        shooter._lastShotT = now;
        shooter.shootingUntil = now + SHOOT_ANIM_MS;   // aim-stance window (host clock)

        const O = { x: ray.ox, y: ray.oy, z: ray.oz };
        const dl = Math.hypot(ray.dx, ray.dy, ray.dz) || 1;
        const D = { x: ray.dx / dl, y: ray.dy / dl, z: ray.dz / dl };

        // A rock/tree between the seeker and a hider blocks the shot — the bolt
        // stops at the prop and the hider behind takes no damage.
        const blockT = PropLevel.raycastProps(O.x, O.y, O.z, D.x, D.y, D.z, SHOT_RANGE);

        // Nearest hider whose BODY COLUMN comes within hitRadius of the aim ray.
        // Sampling several heights (feet→head) means aiming anywhere on the body
        // counts, instead of only a single chest point.
        const COLUMN = [-1.4, -0.7, 0, 0.7, 1.4];
        let best = null, bestT = Infinity;
        for (const id in gameState.players) {
            const h = gameState.players[id];
            if (h.role !== 'Hider' || h.isCaught) continue;
            // Invisible hiders can't be seen — and so can't be hit — by seekers.
            if (h.invisUntil && now < h.invisUntil) continue;
            const hitRadius = Math.max(1.0, (h.disguiseSize || 2) / 2);  // forgiving aim assist; big props easier
            let hitDist = Infinity, hitT = Infinity;
            for (let k = 0; k < COLUMN.length; k++) {
                const sy = h.y + COLUMN[k];
                const cx = h.x - O.x, cy = sy - O.y, cz = h.z - O.z;
                const t = cx * D.x + cy * D.y + cz * D.z;   // projection along ray
                if (t < 0 || t > SHOT_RANGE) continue;
                const px = O.x + D.x * t, py = O.y + D.y * t, pz = O.z + D.z * t;
                const dist = Math.hypot(h.x - px, sy - py, h.z - pz);
                if (dist < hitDist) { hitDist = dist; hitT = t; }
            }
            // Only count the hit if the hider is IN FRONT of the nearest prop.
            if (hitDist < hitRadius && hitT < bestT && hitT < blockT) { best = id; bestT = hitT; }
        }

        let hit = false, targetId = null, health, eliminated = false, forcedOut = false, shielded = false;
        if (best) {
            hit = true;
            targetId = best;
            const tgt = gameState.players[best];
            if (tgt.shieldArmed) {
                // Disguise-shield power: absorb this one hit entirely — no damage, no
                // reveal, no forced-out. Consumed; the next hit is the usual behaviour.
                tgt.shieldArmed = false;
                shielded = true;
                health = tgt.health;   // unchanged; no score for a deflected shot
            } else {
                // One-shot-kill power: a hit goes straight to 0 HP for its window.
                const oneShot = shooter.killUntil && now < shooter.killUntil;
                tgt.health = oneShot ? 0 : Math.max(0, (tgt.health != null ? tgt.health : HIDER_MAX_HP) - SHOT_DAMAGE);
                shooter.score = (shooter.score || 0) + HIT_SCORE;
                tgt.revealedUntil = now + REVEAL_MS;
                tgt.disguiseLockUntil = now + DISGUISE_LOCK_MS;
                if (tgt.disguiseType !== 'player') {
                    forcedOut = true;
                    // Lift y so the revealed character's feet stay on the same ground:
                    // while disguised y sits at propRadius; as a player it must sit at
                    // PLAYER_BASE_HEIGHT. Without this a short prop (bush/rock, radius <
                    // base height) leaves y too low and the character renders sunk into
                    // the floor until the next position packet corrects it.
                    const oldBase = tgt.propRadius || (tgt.disguiseSize / 2);
                    tgt.y = (tgt.y || 0) - oldBase + PropLevel.PLAYER_BASE_HEIGHT;
                    tgt.disguiseType = 'player'; tgt.disguiseSize = 2;
                    tgt.propScale = 1; tgt.propHeight = 2; tgt.propRadius = 1; tgt.propRotation = null; tgt.disguiseTexture = null;
                    tgt.color = 0x2ed573;
                }
                health = tgt.health;
                if (tgt.health <= 0) { tgt.isCaught = true; eliminated = true; }
            }
        }

        // Where the bolt ends: at the hider if hit, else at the blocking prop,
        // else full range.
        const impactDist = best ? bestT : Math.min(blockT, SHOT_RANGE);

        const packet = {
            type: 'shot', shooterId,
            ox: O.x, oy: O.y, oz: O.z, dx: D.x, dy: D.y, dz: D.z,
            mx: ray.mx, my: ray.my, mz: ray.mz,
            hit, targetId, health, score: shooter.score, impactDist,
            revealMs: REVEAL_MS, lockMs: DISGUISE_LOCK_MS, shootMs: SHOOT_ANIM_MS,
            eliminated, forcedOut, shielded
        };
        this.broadcast(packet);

        // Host's own pulse/sound for shots fired by OTHERS (the host shooter
        // already drew its pulse in fireShot).
        if (shooterId !== myId) {
            Sound.pew();
            Level.spawnPulse(packet, packet.impactDist);
        }
        // If the host itself is the hider that got hit, play the damage sound
        // (or a shield-deflect toast when the hit was absorbed).
        if (hit && targetId === myId) {
            if (shielded) UI.toast('🛡️ Shield absorbed the hit!');
            else Sound.hurt();
        }
        // Hit-marker on our own crosshair when we (the host seeker) land a shot.
        if (hit && shooterId === myId) UI.hitMarker();

        if (eliminated) {
            const tn = (gameState.players[targetId] && gameState.players[targetId].name) || 'A hider';
            const sn = (shooter && shooter.name) || 'Seeker';
            this.notify('💀 ' + tn + ' was eliminated by ' + sn);
            // A killed carrier drops its un-deposited keys for any hider to recover.
            this.dropCarriedKeys(gameState.players[targetId]);
            Mechanics.checkWinConditions();
        }
    },

    /*=================================================================
      AIRDROP BEAMS & POWER-UPS (host-authoritative)

      tickBeams() runs in the host physics loop. It (1) fires scheduled beam
      spawns once HUNTING elapsed time reaches each scheduled time (2)
      detects walk-through pickups for EVERY player from their synced positions
      (first within BEAM_RADIUS wins — no double-claims), and (3) despawns beams
      nobody collected. All visuals/effects travel as discrete events that each
      peer converts to local deadlines (same pattern as the `shot` packet).
    =================================================================*/
    tickBeams() {
        if (gameState.phase !== 'HUNTING' || !gameState.huntStartT) return;
        const now = this.now();
        // Light throttle — pickup proximity at ~10 Hz is plenty for a 3-unit radius.
        if (this._lastBeamTick && now - this._lastBeamTick < 100) return;
        this._lastBeamTick = now;

        if (!this._beams) this._beams = [];
        const elapsed = (now - gameState.huntStartT) / 1000;
        const huntLen = ROUND_DURATION();

        // (1) Fire any scheduled beam (gold = powers, purple = keys) whose time has
        // arrived (and still fits inside the match — the last ~2 min get no beams).
        if (this._beamSched) {
            for (let i = this._beamSched.length - 1; i >= 0; i--) {
                const ev = this._beamSched[i];
                if (elapsed >= ev.at && ev.at < huntLen) {
                    this._beamSched.splice(i, 1);
                    this.spawnBeam(ev.kind);
                }
            }
        }

        // (2) + (3) walk-through pickups and lifetime despawns.
        for (let i = this._beams.length - 1; i >= 0; i--) {
            const b = this._beams[i];
            const active = now >= b.spawnAt + b.armMs;
            if (!active) continue;
            // Despawn if uncollected for too long.
            if (now >= b.spawnAt + b.armMs + BEAM_LIFETIME_MS) {
                this._beams.splice(i, 1);
                this.broadcast({ type: 'beamGone', beamId: b.id });
                Level.removeBeam(b.id);
                continue;
            }
            // First eligible living player standing in the beam collects it. Purple
            // key beams are HIDER-ONLY (seekers gain nothing from them).
            let taker = null;
            for (const id in gameState.players) {
                const p = gameState.players[id];
                if (p.isCaught) continue;
                if (b.kind === 'purple' && p.role !== 'Hider') continue;
                if (Math.hypot(p.x - b.x, p.z - b.z) <= BEAM_RADIUS) { taker = id; break; }
            }
            if (taker) {
                this._beams.splice(i, 1);
                this.collectBeam(b, taker);
            }
        }
    },

    /*=================================================================
      KEYS & EXIT DOORS (Phase 2, host-authoritative)
      tickKeys() detects (a) a key-carrying hider walking into an exit door
      (deposit → team count → win at KEYS_TO_WIN) and (b) a hider walking over
      a dropped-key bundle (recover). Doors come from the level (props flagged
      `door`); dropped bundles are created when a carrier is eliminated.
    =================================================================*/
    tickKeys() {
        if (gameState.phase !== 'HUNTING') return;
        const now = this.now();
        if (this._lastKeyTick && now - this._lastKeyTick < 100) return;
        this._lastKeyTick = now;

        // (a) Deposits at exit doors — only once the doors have OPENED (last key drop
        // + EXIT_ACTIVATE_DELAY_MS). Closed doors are hidden and reject deposits.
        const doorsOpen = gameState.doorsActivateAt && now >= gameState.doorsActivateAt;
        const doors = (doorsOpen && typeof PropLevel !== 'undefined' && PropLevel.getDoorPositions)
            ? PropLevel.getDoorPositions(mapProps3D) : [];
        if (doors.length) {
            for (const id in gameState.players) {
                const p = gameState.players[id];
                if (p.role !== 'Hider' || p.isCaught || !(p.carriedKeys > 0)) continue;
                const atDoor = doors.some(d => Math.hypot(p.x - d.x, p.z - d.z) <= DOOR_RADIUS);
                if (atDoor) this.depositKeys(id);
            }
        }

        // (b) Recover dropped-key bundles.
        if (this._droppedKeys && this._droppedKeys.length) {
            for (let i = this._droppedKeys.length - 1; i >= 0; i--) {
                const k = this._droppedKeys[i];
                let taker = null;
                for (const id in gameState.players) {
                    const p = gameState.players[id];
                    if (p.role !== 'Hider' || p.isCaught) continue;
                    if (Math.hypot(p.x - k.x, p.z - k.z) <= DROP_KEY_RADIUS) { taker = id; break; }
                }
                if (taker) {
                    this._droppedKeys.splice(i, 1);
                    const p = gameState.players[taker];
                    p.carriedKeys = (p.carriedKeys || 0) + k.count;
                    this.broadcast({ type: 'keyDropGone', keyId: k.id });
                    Level.removeDroppedKey(k.id);
                    this.broadcast({ type: 'keyGain', playerId: taker, carried: p.carriedKeys });
                    this.applyKeyGain(taker, p.carriedKeys, true);
                }
            }
        }
    },

    // Purple-beam pickup: a hider gains one carried key.
    grantKey(playerId) {
        const p = gameState.players[playerId];
        if (!p || p.role !== 'Hider') return;
        p.carriedKeys = (p.carriedKeys || 0) + 1;
        this.broadcast({ type: 'keyGain', playerId, carried: p.carriedKeys });
        this.applyKeyGain(playerId, p.carriedKeys, true);
    },

    // Deposit a carrier's keys at a door → team count; win at KEYS_TO_WIN.
    depositKeys(playerId) {
        const p = gameState.players[playerId];
        if (!p || !(p.carriedKeys > 0)) return;
        const n = p.carriedKeys;
        p.carriedKeys = 0;
        gameState.submittedKeys = (gameState.submittedKeys || 0) + n;
        this.broadcast({ type: 'keyDeposit', playerId, carried: 0, submitted: gameState.submittedKeys });
        this.applyKeyDeposit(playerId, 0, gameState.submittedKeys, true);
        const nm = p.name || 'A hider';
        this.notify('🔑 ' + nm + ' delivered ' + n + ' key' + (n > 1 ? 's' : '') +
                    ' (' + gameState.submittedKeys + '/' + KEYS_TO_WIN + ')');
        if (gameState.submittedKeys >= KEYS_TO_WIN && gameState.phase === 'HUNTING') {
            gameState.phase = 'ENDED';
            this.finishMatch("Keys Secured!", "Hiders Win! " + KEYS_TO_WIN + " keys delivered.");
        }
    },

    // A killed carrier drops its keys on the ground as a recoverable bundle.
    dropCarriedKeys(player) {
        if (!player || !(player.carriedKeys > 0)) return;
        const k = { id: ++this._dropKeySeq, x: player.x, z: player.z, count: player.carriedKeys };
        player.carriedKeys = 0;
        (this._droppedKeys = this._droppedKeys || []).push(k);
        this.broadcast({ type: 'keyDrop', keyId: k.id, x: k.x, z: k.z, count: k.count });
        Level.spawnDroppedKey(k.id, k.x, k.z, k.count);
        // Warn hiders the keys are recoverable (5s, host + all hider clients).
        this.notify('🔑 Keys dropped — grab them!', { audience: 'hiders', toastMs: 5000 });
    },

    // Apply a key-count change to the LOCAL view (host echo + clients).
    applyKeyGain(playerId, carried, isHostEcho) {
        const p = gameState.players[playerId];
        if (!p) return;
        if (!isHostEcho) p.carriedKeys = carried;
        if (playerId === myId) {
            Sound.coin();
            UI.announce('🔑 Key', 'Collected');
        }
    },
    applyKeyDeposit(playerId, carried, submitted, isHostEcho) {
        const p = gameState.players[playerId];
        if (p && !isHostEcho) p.carriedKeys = carried;
        if (!isHostEcho) gameState.submittedKeys = submitted;
    },

    // Pick a random spawn point for the beam and announce it to everyone.
    spawnBeam(kind) {
        if (!this._beams) this._beams = [];
        const pos = this.pickBeamPos();
        const b = { id: ++this._beamSeq, kind, x: pos.x, z: pos.z,
                    spawnAt: this.now(), armMs: BEAM_ARM_MS };
        this._beams.push(b);
        const pkt = { type: 'beamSpawn', beamId: b.id, kind, x: b.x, z: b.z, armMs: b.armMs };
        this.broadcast(pkt);
        Level.spawnBeam(b.id, kind, b.x, b.z, b.armMs);   // host renders it too
        Sound.beam(kind);
        this.notify(kind === 'purple' ? '🟣 A key beam has dropped!' : '🟡 An airdrop beam has dropped!');
    },

    // A candidate ground position for a beam: reuse the level's spawn points
    // (seeker/hider/generic) when present, else a random open spot near origin.
    pickBeamPos() {
        let pts = [];
        if (typeof PropLevel !== 'undefined' && PropLevel.getSpawnPositions && mapProps3D) {
            const s = PropLevel.getSpawnPositions(mapProps3D);
            pts = (s.seeker || []).concat(s.hider || []);
        }
        if (pts.length) {
            const p = pts[Math.floor(Math.random() * pts.length)];
            return { x: p.x, z: p.z };
        }
        const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 14;
        return { x: Math.cos(a) * r, z: Math.sin(a) * r };
    },

    // A player walked into an active beam — clear the visual everywhere and grant
    // the reward: a power (gold) or a key (purple, hider-only).
    collectBeam(beam, playerId) {
        this.broadcast({ type: 'beamGone', beamId: beam.id, collectorId: playerId });
        Level.removeBeam(beam.id, playerId);
        if (beam.kind === 'purple') this.grantKey(playerId);
        else this.grantPower(playerId, beam.kind);
    },

    // Roll + apply the random power for the collector's role. Hiders also get an
    // automatic 5s invisibility and HOLD one power to activate later (E / button);
    // seekers get their power applied instantly.
    grantPower(playerId, kind) {
        const p = gameState.players[playerId];
        if (!p) return;
        const now = this.now();
        if (p.role === 'Hider') {
            const power = HIDER_POWERS[Math.floor(Math.random() * HIDER_POWERS.length)];
            p.invisUntil = now + PICKUP_INVIS_MS;
            p.invisTotalMs = PICKUP_INVIS_MS;
            p.heldPower = power;
            this.broadcast({ type: 'powerGain', playerId, role: 'Hider',
                             heldPower: power, invisMs: PICKUP_INVIS_MS });
            this.applyPowerGain(playerId, 'Hider', { heldPower: power, invisMs: PICKUP_INVIS_MS }, true);
        } else {
            const power = SEEKER_POWERS[Math.floor(Math.random() * SEEKER_POWERS.length)];
            const pkt = { type: 'powerGain', playerId, role: 'Seeker', power };
            if (power === 'scan') {
                p.scanUntil = now + POWER_SCAN_MS;
                pkt.scanMs = POWER_SCAN_MS;
            } else if (power === 'kill') {
                p.killUntil = now + POWER_KILL_MS;
                pkt.killMs = POWER_KILL_MS;
            } else { // jammer
                p.jamUntil = now + POWER_JAM_MS;   // the seeker's own "jammer active" timer (HUD)
                const ids = [];
                for (const id in gameState.players) {
                    const h = gameState.players[id];
                    if (h.role === 'Hider' && !h.isCaught && h.disguiseType === 'player') {
                        h.disguiseLockUntil = now + POWER_JAM_MS;
                        ids.push(id);
                    }
                }
                pkt.jamIds = ids; pkt.jamMs = POWER_JAM_MS;
            }
            this.broadcast(pkt);
            this.applyPowerGain(playerId, 'Seeker', pkt, true);
            // Warn the hiders that a seeker ability is now active (5s so it's readable).
            const alertNames = { scan: 'Scan', jammer: 'Jammer', kill: 'One-Shot Kill' };
            this.notify('⚠️ Seeker activated ' + (alertNames[power] || power) + '!',
                        { audience: 'hiders', toastMs: 5000 });
        }
    },

    // Apply a powerGain to the LOCAL view (deadlines from ms). Shared by the host
    // (local echo) and clients (handleHostData). `isHostEcho` skips re-stamping the
    // authoritative fields the host already set in real time.
    applyPowerGain(playerId, role, data, isHostEcho) {
        const p = gameState.players[playerId];
        if (!p) return;
        const now = this.now();
        if (role === 'Hider') {
            if (!isHostEcho && data.invisMs) { p.invisUntil = now + data.invisMs; p.invisTotalMs = data.invisMs; }
            if (!isHostEcho) p.heldPower = data.heldPower || null;
            if (playerId === myId) {
                Sound.coin();
                const names = { heal: '❤️ Full Heal', invis: '👻 Ghost', shield: '🛡️ Disguise Shield' };
                // Pickup → AAA centre banner. The pickup-invis countdown now shows on the
                // #active-effect bar, so no separate "Invisible for Ns" toast.
                UI.announce(names[data.heldPower] || data.heldPower, 'Picked Up');
            }
        } else {
            if (!isHostEcho) {
                if (data.scanMs) p.scanUntil = now + data.scanMs;
                if (data.killMs) p.killUntil = now + data.killMs;
                if (data.jamIds) {
                    p.jamUntil = now + (data.jamMs || POWER_JAM_MS);   // seeker's own jammer timer
                    data.jamIds.forEach(id => {
                        const h = gameState.players[id];
                        if (h) h.disguiseLockUntil = now + (data.jamMs || POWER_JAM_MS);
                    });
                }
            }
            if (playerId === myId) {
                Sound.coin();
                const names = { scan: '📡 Scan', jammer: '🚫 Jammer', kill: '🎯 One-Shot Kill' };
                UI.announce(names[data.power] || data.power, 'Picked Up');
            }
        }
    },

    // Hider activates the held power (E / power button). Validated host-side.
    handleActivate(playerId) {
        const p = gameState.players[playerId];
        if (!p || p.role !== 'Hider' || p.isCaught || !p.heldPower) return;
        const now = this.now();
        const power = p.heldPower;
        const pkt = { type: 'powerUse', playerId, power };
        if (power === 'heal') {
            p.health = HIDER_MAX_HP;
            pkt.healTo = HIDER_MAX_HP;
        } else if (power === 'invis') {
            p.invisUntil = Math.max(p.invisUntil || 0, now + POWER_INVIS_MS);
            p.invisTotalMs = POWER_INVIS_MS;
            pkt.invisMs = POWER_INVIS_MS;
        } else if (power === 'shield') {
            p.shieldArmed = true;
            pkt.shield = true;
        }
        p.heldPower = null;
        this.broadcast(pkt);
        this.applyPowerUse(pkt, true);
    },

    // Apply a powerUse to the LOCAL view. Shared by host echo + clients.
    applyPowerUse(data, isHostEcho) {
        const p = gameState.players[data.playerId];
        if (!p) return;
        const now = this.now();
        if (!isHostEcho) {
            if (data.healTo != null) p.health = data.healTo;
            if (data.invisMs) { p.invisUntil = Math.max(p.invisUntil || 0, now + data.invisMs); p.invisTotalMs = data.invisMs; }
            if (data.shield) p.shieldArmed = true;
            if (data.playerId === myId) p.heldPower = null;
        }
        if (data.playerId === myId) {
            // Instant powers (heal) have no duration — flash a brief "HEALTH RESTORED" in the
            // active-effect indicator (countdown/toggle powers render from their state instead).
            if (data.power === 'heal' && UI.flashEffect) UI.flashEffect('❤️', 'HEALTH RESTORED', 1500);
        }
    },

    /*=================================================================
      Set the local player's lobby role (Hider/Seeker). Optimistic locally,
      then host broadcasts the new roster / a client tells the host, which
      re-broadcasts — mirrors the isReady reconciliation pattern.
    =================================================================*/
    setLocalRole(role) {
        if (role !== 'Hider' && role !== 'Seeker') return;
        const me = gameState.players[myId];
        if (!me || me.role === role) return;
        me.role = role;
        me.color = role === 'Seeker' ? 0xff4757 : 0x2ed573;
        UI.updateLobby();
        if (isHost) {
            this.broadcast({ type: 'lobbySync', players: gameState.players });
        } else {
            this.sendToHost({ type: 'roleChange', role });
        }
    },

    /*=================================================================
      Level selection (lobby). Levels come from the bundled registry
      (LEVELS, populated by js/levels/*.js), so they are identical on
      every peer — only the chosen NAME is synced, never the prop data.
    =================================================================*/
    getLevelList() {
        return (typeof LEVELS !== 'undefined' ? LEVELS : []).map(l => l.name);
    },

    getLevelProps(name) {
        const list = (typeof LEVELS !== 'undefined' ? LEVELS : []);
        const found = list.find(l => l.name === name);
        return (found || list[0] || { props: [] }).props;
    },

    // Per-level scene options (ground texture etc.). Bundled in the registry, so
    // identical on every peer — only the level NAME is synced.
    getLevelOptions(name) {
        const list = (typeof LEVELS !== 'undefined' ? LEVELS : []);
        const found = list.find(l => l.name === name);
        return (found && found.options) || {};
    },

    // Host picks a map → record it + tell everyone (just the name).
    selectLevel(name) {
        if (!isHost) return;
        gameState.levelName = name;
        this.broadcast({
            type: 'lobbySync',
            players: gameState.players,
            levelName: name,
            roomCode: pendingRoomCode
        });
        UI.renderLevelSelector();
    },

    /*=================================================================
      Host initialization
    =================================================================*/
    initHost() {
        UI.updateStatus('Starting engine...');
        isHost = true;
        const code = this.generateCode();

        peer = new Peer('hnh3d-' + code);
        peer.on('open', id => {
            myId = id;
            // Show lobby UI (replicating previous manual DOM handling)
            document.getElementById('menu-screen').style.display = 'none';
            document.getElementById('lobby-screen').style.display = 'flex';
            UI.setLobbyCode(code);
            this.runHostLogic();
        });

        peer.on('error', err => {
            if (err.type === 'unavailable-id') {
                document.getElementById('btn-host').click();
            } else {
                UI.showModal('Network Error', err.type, () => this.cleanup());
            }
        });
    },

    /*=================================================================
      Client initialization
    =================================================================*/
    initClient() {
        const input = document.getElementById('input-room-id').value.trim();
        if (input.length !== 4) {
            UI.showModal('Invalid Code', 'Please enter exactly 4 digits.');
            return;
        }

        UI.updateStatus('Connecting...');
        isHost = false;

        peer = new Peer();
        peer.on('open', id => {
            myId = id;
            // Carry our display name in the connection metadata so the host can
            // label us without a separate handshake message.
            connToHost = peer.connect('hnh3d-' + input, { metadata: { name: myName } });
            connToHost.on('open', () => {
                // Show lobby UI for client
                document.getElementById('menu-screen').style.display = 'none';
                document.getElementById('lobby-screen').style.display = 'flex';
                UI.setLobbyCode(input);
                this.runClientLogic();
            });

            // Timeout if host never answers
            setTimeout(() => {
                if (!connToHost || !connToHost.open) {
                    UI.showModal('Error', 'Room not found.', () => this.cleanup());
                }
            }, 4000);
        });

        peer.on('error', err => {
            UI.showModal('Network Error', err.type, () => this.cleanup());
        });
    },

    /*=================================================================
      Host main loop
    =================================================================*/
    runHostLogic() {
        // Phase: LOBBY
        gameState.phase = 'LOBBY';
        this._usedSpawns = [];
        gameState.players = {};
        connections = [];

        // Default the selected map to the first registered level.
        const levelNames = this.getLevelList();
        gameState.levelName = levelNames[0] || '';

        // Create host player — defaults to Seeker but can be changed in the
        // lobby. The host is implicitly ready (it drives "Start Game").
        gameState.players[myId] = this.createPlayer('Seeker', this._usedSpawns, myName);
        gameState.players[myId].isReady = true;
        localPos = { ...gameState.players[myId] };

        UI.updateLobby();
        UI.renderLevelSelector();

        // Accept new connections (and, after a migration, reconnecting survivors)
        peer.on('connection', conn => this.acceptConnection(conn));

        this.startHostLoops();
    },

    /*=================================================================
      Accept an incoming connection as a host. Shared by the original
      host, a migrated successor, and the successor's code-peer.
      ---------------------------------------------------------------
      We key on conn.peer: if that id already exists in our roster it's a
      RECONNECTING survivor (host migration) — keep their record (role,
      disguise, caught) and resync them. Otherwise it's a brand-new joiner,
      allowed only in the lobby.
    =================================================================*/
    acceptConnection(conn) {
        conn.on('open', () => {
            conn._lastSeen = this.now();   // seed liveness for the host-side watchdog
            const existing = gameState.players[conn.peer];

            if (existing) {
                // Reconnecting survivor — re-map, don't recreate.
                if (!connections.includes(conn)) connections.push(conn);

                const wasExpected = !!rejoinExpected[conn.peer];
                if (wasExpected) {
                    clearTimeout(rejoinExpected[conn.peer]);
                    delete rejoinExpected[conn.peer];
                }

                conn.send({
                    type: 'rejoinAck',
                    players: gameState.players,
                    phase: gameState.phase,
                    timer: gameState.timer,
                    hostId: myId,
                    roomCode: pendingRoomCode,
                    levelName: gameState.levelName
                });

                // If the hunter left and the round is being dissolved, tell the
                // reconnecting survivor so they see the Hiders-win popup too.
                if (wasExpected && this._pendingHidersWin) {
                    conn.send({
                        type: 'hidersWin',
                        title: 'Hiders Win!',
                        message: 'The hunter disconnected. Starting a new lobby.'
                    });
                }

                if (gameState.phase === 'LOBBY') {
                    UI.updateLobby();
                    this.broadcast({ type: 'lobbySync', players: gameState.players });
                }
                return;
            }

            // Brand-new joiner — only allowed in the lobby.
            if (gameState.phase !== 'LOBBY') {
                conn.close();
                return;
            }
            connections.push(conn);
            const joinName = (conn.metadata && conn.metadata.name) || '';
            gameState.players[conn.peer] = this.createPlayer('Hider', this._usedSpawns || [], joinName);
            UI.updateLobby();
            conn.send({ type: 'lobbySync', players: gameState.players, levelName: gameState.levelName });
            this.broadcast({ type: 'lobbySync', players: gameState.players, levelName: gameState.levelName });
        });

        conn.on('data', data => this.handleClientData(conn, data));
        conn.on('close', () => this.handleConnClose(conn));
    },

    /*=================================================================
      Host-side: handle a packet from a connected client.
    =================================================================*/
    handleClientData(conn, data) {
        // Any packet from this client proves it's alive — reset its watchdog.
        conn._lastSeen = this.now();

        switch (data.type) {
            case 'clientPing':
                // Lobby liveness heartbeat only — timestamp already refreshed.
                break;

            case 'leave': {
                // Client voluntarily left.
                const lname = (gameState.players[conn.peer] && gameState.players[conn.peer].name) || 'A player';
                conn._dropped = true;   // suppress the follow-up close → no duplicate toast
                delete gameState.players[conn.peer];
                connections = connections.filter(c => c !== conn);
                UI.updateLobby();
                this.broadcast({ type: 'lobbySync', players: gameState.players });
                this.notify('👋 ' + lname + ' left the game');
                this.checkHostAlone();
                break;
            }

            case 'lobbyReady':
                if (gameState.players[conn.peer]) {
                    gameState.players[conn.peer].isReady = data.readyState;
                    UI.updateLobby();
                    this.broadcast({ type: 'lobbySync', players: gameState.players });
                }
                break;

            case 'roleChange':
                if (gameState.players[conn.peer] &&
                    (data.role === 'Hider' || data.role === 'Seeker')) {
                    const rp = gameState.players[conn.peer];
                    rp.role = data.role;
                    rp.color = data.role === 'Seeker' ? 0xff4757 : 0x2ed573;
                    UI.updateLobby();
                    this.broadcast({ type: 'lobbySync', players: gameState.players });
                }
                break;

            case 'clientMove': {
                // Frequent movement packet — transform only.
                const p = gameState.players[conn.peer];
                if (p && !p.isCaught) {
                    // Drop stale / out-of-order packets (timestamp guard).
                    if (data.t !== undefined &&
                        p._lastMoveT !== undefined &&
                        data.t <= p._lastMoveT) break;
                    p._lastMoveT = data.t;
                    p.x = data.x;
                    p.y = data.y;
                    p.z = data.z;
                    p.rotY = data.rotY;
                }
                break;
            }

            case 'shoot':
                // A client seeker fired — host validates geometry + applies.
                this.processShot(conn.peer, data);
                break;

            case 'clientJump': {
                // A client jumped — stamp it for the host's render + relay to all.
                const jp = gameState.players[conn.peer];
                if (jp) jp.jumpAt = this.now();
                this.broadcast({ type: 'jump', id: conn.peer });
                break;
            }

            case 'clientDisguise': {
                // Rare event packet — disguise change. Apply, then relay
                // to every OTHER client so they render this player right.
                const p = gameState.players[conn.peer];
                if (p) {
                    // Disguise is locked for a few seconds after being hit — reject
                    // re-disguising into a prop (clearing to 'player' is allowed).
                    if (data.disguiseType !== 'player' && this.now() < (p.disguiseLockUntil || 0)) break;
                    p.disguiseType = data.disguiseType;
                    p.disguiseSize = data.disguiseSize;
                    p.propScale = data.propScale ?? 1;
                    p.propHeight = data.propHeight ?? 2;
                    p.propRadius = data.propRadius ?? 1;
                    p.propRotation = data.propRotation ?? null;
                    p.disguiseTexture = data.disguiseTexture ?? null;
                    p.color = data.color;
                    this.broadcastExcept({
                        type: 'disguise',
                        id: conn.peer,
                        disguiseType: p.disguiseType,
                        disguiseSize: p.disguiseSize,
                        propScale: p.propScale,
                        propHeight: p.propHeight,
                        propRadius: p.propRadius,
                        propRotation: p.propRotation,
                        disguiseTexture: p.disguiseTexture,
                        color: p.color
                    }, conn.peer);
                }
                break;
            }

            case 'activatePower':
                // A client hider pressed E / the power button — validate + apply.
                this.handleActivate(conn.peer);
                break;
        }
    },

    /*=================================================================
      Host-side: a client connection closed (left or crashed).
    =================================================================*/
    handleConnClose(conn) {
        // Dedupe: a watchdog-initiated drop and a later real 'close' must not
        // both process the same connection.
        if (conn._dropped) return;
        conn._dropped = true;

        const dname = (gameState.players[conn.peer] && gameState.players[conn.peer].name) || 'A player';
        delete gameState.players[conn.peer];
        connections = connections.filter(c => c.peer !== conn.peer);
        // Stop awaiting a survivor that will never reconnect.
        if (rejoinExpected[conn.peer]) {
            clearTimeout(rejoinExpected[conn.peer]);
            delete rejoinExpected[conn.peer];
        }
        UI.updateLobby();
        this.broadcast({ type: 'lobbySync', players: gameState.players });
        this.notify('⚠️ ' + dname + ' disconnected');
        this.checkHostAlone();
    },

    /*=================================================================
      Feature 1B: if every joiner has left during an active match and only
      the host remains, tell the host and return them to the main menu.
    =================================================================*/
    checkHostAlone() {
        const active = gameState.phase !== 'LOBBY' && gameState.phase !== 'ENDED';
        if (active && connections.length === 0 && !isLeavingRoom) {
            gameState.phase = 'ENDED';   // host loops early-return on ENDED
            UI.showModal('All players left', 'Everyone has left the match.',
                         () => this.cleanup());
        }
    },

    /*=================================================================
      Host-side watchdog: drop clients that have gone silent past
      CLIENT_TIMEOUT_MS. Catches abrupt client tab-close/crash where
      conn.on('close') never fires, so ghost players don't linger in the
      roster (wrong player count, ghost mesh, stuck host-alone).
    =================================================================*/
    sweepStaleClients() {
        // Don't reap during the game-over window: clients have stopped sending
        // and are about to leave anyway.
        if (gameState.phase === 'ENDED') return;
        const now = this.now();
        connections.slice().forEach(conn => {
            if (now - (conn._lastSeen || 0) > CLIENT_TIMEOUT_MS) {
                try { conn.close(); } catch (e) {}
                this.handleConnClose(conn);
            }
        });
    },

    /*=================================================================
      Start (or restart) the three host loops: 1s timer, 60 FPS physics,
      20 Hz snapshot broadcast. Clears any existing intervals first so a
      migrated successor can never end up running two sets of loops.
    =================================================================*/
    startHostLoops() {
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (gameLoopInterval) { clearInterval(gameLoopInterval); gameLoopInterval = null; }
        if (networkInterval) { clearInterval(networkInterval); networkInterval = null; }
        // We are the host now — stop watching for a host (a successor that was
        // a client must drop its watchdog) and start emitting heartbeats.
        if (watchdogInterval) { clearInterval(watchdogInterval); watchdogInterval = null; }
        if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }

        // Heartbeat — a lightweight ping to all clients in EVERY phase. In-game
        // the 20 Hz snapshot already proves liveness, but the lobby has no other
        // periodic host traffic, so this is what makes a lobby host-drop
        // detectable by clients' watchdogs.
        heartbeatInterval = setInterval(() => {
            this.broadcast({ type: 'ping' });
            // Same heartbeat tick also reaps clients that went silent (abrupt
            // tab close where conn.on('close') never fired).
            this.sweepStaleClients();
        }, HEARTBEAT_MS);

        // Timer loop (seconds)
        timerInterval = setInterval(() => {
            if (gameState.phase === 'LOBBY' || gameState.phase === 'ENDED') return;
            gameState.timer--;
            if (gameState.timer <= 0) {
                if (gameState.phase === 'HIDING') {
                    gameState.phase = 'HUNTING';
                    gameState.timer = ROUND_DURATION();
                    // Hunting just began — anchor the airdrop-beam schedule to now.
                    gameState.huntStartT = this.now();
                    // Combined schedule: gold (powers) + purple (keys), derived from
                    // the match length so pacing scales and >=KEYS_TO_WIN purple beams
                    // always fit (see computeBeamSchedule). Each fires once.
                    const huntLen = ROUND_DURATION();
                    const sched = computeBeamSchedule(huntLen);
                    this._beamSched = sched.gold.map(t => ({ at: t, kind: 'gold' }))
                        .concat(sched.purple.map(t => ({ at: t, kind: 'purple' })));
                    // Exit doors open EXIT_ACTIVATE_DELAY_MS after the LAST purple key
                    // beam that actually fits inside this hunt. computeBeamSchedule keeps
                    // every purple beam inside the window, so all of them fire.
                    const firing = sched.purple.filter(t => t < huntLen);
                    if (firing.length) {
                        const lastPurple = Math.max.apply(null, firing);
                        gameState.doorsActivateAt =
                            gameState.huntStartT + lastPurple * 1000 + EXIT_ACTIVATE_DELAY_MS;
                        this.broadcast({ type: 'doorsSchedule',
                            activateInMs: gameState.doorsActivateAt - this.now() });
                    } else {
                        gameState.doorsActivateAt = null;
                        this.broadcast({ type: 'doorsSchedule', activateInMs: null });
                    }
                } else if (gameState.phase === 'HUNTING') {
                    gameState.phase = 'ENDED';
                    this.finishMatch('Time\'s Up!', 'Hiders Win! Time expired.');
                }
            }
        }, 1000);

        // Physics / simulation loop — stays at 60 FPS
        gameLoopInterval = setInterval(() => {
            if (gameState.phase === 'LOBBY' || gameState.phase === 'ENDED') return;

            // Host movement (Seeker) — predicted locally every frame
            Mechanics.handleLocalMovement();
            this.applyLocalTransform(gameState.players[myId]);

            // Seekers shoot to catch hiders now (replaces proximity collisions).
            Mechanics.tickReload();

            // Airdrop beams: schedule spawns + detect walk-through pickups (host-only).
            this.tickBeams();
            // Keys: door deposits + dropped-key recovery (host-only).
            this.tickKeys();

            UI.updateHUD();
        }, 1000 / 60);

        // Network loop — broadcast a lightweight movement snapshot at
        // NETWORK_SEND_RATE (20 Hz). Disguise/caught/ready/roster changes
        // travel separately as discrete events, not in this hot path.
        networkInterval = setInterval(() => {
            if (gameState.phase === 'LOBBY' || gameState.phase === 'ENDED') return;
            const snap = this.buildSnapshot();
            this.broadcast(snap);
            // Buffer locally too, so the host renders remote players through the
            // same interpolated, render-behind pipeline the clients use.
            this.pushSnapshot(snap.players);
        }, 1000 / NETWORK_SEND_RATE);
    },

    /*=================================================================
      Client main loop
    =================================================================*/
    runClientLogic() {
        this.wireClientHandlers(connToHost);
        this.startClientLoops();
    },

    /*=================================================================
      Wire the data/close handlers for our connection to the host. Shared
      by the initial join and by reconnection during host migration.
    =================================================================*/
    wireClientHandlers(conn) {
        conn.on('data', data => this.handleHostData(data));
        conn.on('close', () => this.onHostConnectionClose());
    },

    /*=================================================================
      Client-side: handle a packet from the host.
    =================================================================*/
    handleHostData(data) {
        // Any message from the host proves it's alive — reset the watchdog.
        this._lastHostMsgTime = this.now();

        switch (data.type) {

            case 'ping':
                // Heartbeat only — liveness already recorded above.
                break;

            case 'lobbySync':
                gameState.players = data.players;
                if (data.levelName) gameState.levelName = data.levelName;
                if (data.roomCode) {
                    pendingRoomCode = data.roomCode;
                    UI.setLobbyCode(data.roomCode);
                }
                // A lobbySync can arrive after a migration while we were still
                // in-game; make sure we're actually showing the lobby.
                if (gameState.phase === 'LOBBY') UI.transitionToLobby();
                UI.updateLobby();
                UI.renderLevelSelector();
                break;

            case 'gameStart':
                Object.assign(gameState, data.gameState);
                // Load the host's chosen level into our scene before entering it.
                Level.loadLevel(this.getLevelProps(gameState.levelName), this.getLevelOptions(gameState.levelName));
                // Seed local prediction state from our authoritative spawn so
                // the client starts at the right place instead of the origin.
                {
                    const me = gameState.players[myId];
                    if (me) {
                        localPos = { x: me.x, y: me.y, z: me.z };
                        cameraYaw = me.rotY || 0;
                        localDisguise.color = me.color;
                    }
                }
                ammo = MAG_SIZE; reloading = false; reloadUntil = 0; lastShotAt = 0;
                UI.transitionToGame();
                break;

            case 'rejoinAck': {
                // Authoritative resync after reconnecting to a new host.
                gameState.players = data.players;
                gameState.phase = data.phase;
                gameState.timer = data.timer;
                this._snapshotBuffer = [];
                this._lastSnapshotT = undefined;
                migrating = false;
                departedHostId = null;
                if (data.levelName) gameState.levelName = data.levelName;
                if (data.roomCode) {
                    pendingRoomCode = data.roomCode;
                    UI.setLobbyCode(data.roomCode);
                }
                // Re-seed local prediction from our (preserved) record.
                const me = gameState.players[myId];
                if (me) {
                    localPos = { x: me.x, y: me.y, z: me.z };
                    cameraYaw = me.rotY || 0;
                }
                if (gameState.phase === 'LOBBY') {
                    UI.transitionToLobby();
                    UI.updateLobby();
                    UI.renderLevelSelector();
                } else {
                    UI.transitionToGame();
                    UI.updateHUD();
                }
                break;
            }

            case 'snapshot': {
                // Lightweight movement update. We don't write transforms into
                // gameState directly — we buffer them and let the render loop
                // sample an interpolated, render-behind transform per remote
                // player. Our own player is predicted at 60 FPS, never sampled.
                // Authoritative non-transform state (disguise/caught/ready)
                // arrives via discrete events.

                // Timestamp guard: ignore stale / out-of-order snapshots.
                if (data.t !== undefined &&
                    this._lastSnapshotT !== undefined &&
                    data.t <= this._lastSnapshotT) break;
                this._lastSnapshotT = data.t;

                gameState.phase = data.phase;
                gameState.timer = data.timer;

                this.pushSnapshot(data.players);

                if (gameState.phase !== 'LOBBY') UI.updateHUD();
                break;
            }

            case 'disguise': {
                // Remote player changed disguise (relayed by host).
                const p = gameState.players[data.id];
                if (p) {
                    p.disguiseType = data.disguiseType;
                    p.disguiseSize = data.disguiseSize;
                    p.propScale = data.propScale;
                    p.propHeight = data.propHeight;
                    p.propRadius = data.propRadius;
                    p.propRotation = data.propRotation;
                    p.disguiseTexture = data.disguiseTexture ?? null;
                    p.color = data.color;
                }
                break;
            }

            case 'caught': {
                // Host marked a player (possibly us) as caught.
                const p = gameState.players[data.id];
                if (p) p.isCaught = true;
                break;
            }

            case 'notice': {
                // Host-broadcast event toast. Optional `audience` ('all'|'hiders'|
                // 'seekers') restricts who shows it (e.g. seeker-ability alerts go to
                // hiders only); optional `toastMs` lengthens the display for readability.
                if (!data.text) break;
                const aud = data.audience || 'all';
                if (aud !== 'all') {
                    const me = gameState.players[myId];
                    const myRole = me && me.role;
                    if (aud === 'hiders' && myRole !== 'Hider') break;
                    if (aud === 'seekers' && myRole !== 'Seeker') break;
                }
                UI.toast(data.text, data.toastMs ? { duration: data.toastMs } : undefined);
                break;
            }

            case 'shot': {
                // Authoritative result of a seeker's energy-pulse shot.
                const shooter = gameState.players[data.shooterId];
                if (shooter && data.score !== undefined) shooter.score = data.score;
                // Aim-stance window so remotes show the upper-body shoot pose + facing.
                if (shooter) shooter.shootingUntil = this.now() + (data.shootMs || SHOOT_ANIM_MS);

                if (data.hit && data.targetId && !data.shielded) {
                    const tgt = gameState.players[data.targetId];
                    if (tgt) {
                        if (data.health !== undefined) tgt.health = data.health;
                        // Per-peer deadlines from durations (no cross-peer clock sync).
                        tgt.revealedUntil = this.now() + (data.revealMs || REVEAL_MS);
                        tgt.disguiseLockUntil = this.now() + (data.lockMs || DISGUISE_LOCK_MS);
                        if (data.eliminated) tgt.isCaught = true;
                        if (data.forcedOut) {
                            // Lift y by the standing-height difference so the revealed
                            // character's feet stay on the ground (see host handler) —
                            // otherwise short props (bush/rock) render sunk underground.
                            const oldBase = tgt.propRadius || (tgt.disguiseSize / 2);
                            tgt.y = (tgt.y || 0) - oldBase + PropLevel.PLAYER_BASE_HEIGHT;
                            tgt.disguiseType = 'player';
                            tgt.disguiseSize = 2; tgt.propScale = 1;
                            tgt.propHeight = 2; tgt.propRadius = 1; tgt.propRotation = null; tgt.disguiseTexture = null;
                            tgt.color = 0x2ed573;
                            if (data.targetId === myId) {
                                // Raise our own position too so the next broadcast carries
                                // the corrected height (gravity/floor-snap would fix it a
                                // frame later, but this avoids sending one sunk frame).
                                localPos.y = tgt.y;
                                localDisguise = { type: 'player', size: 2, color: 0x2ed573,
                                    propScale: 1, propHeight: 2, propRadius: 1, propRotation: null, propTexture: null };
                            }
                        }
                    }
                }

                // Visual + audio for shots fired by OTHERS (our own was drawn in fireShot).
                if (data.shooterId !== myId) {
                    Sound.pew();
                    Level.spawnPulse(data, data.impactDist);
                }
                // A shielded hit consumes the target's disguise shield everywhere.
                if (data.hit && data.shielded) {
                    const st = gameState.players[data.targetId];
                    if (st) st.shieldArmed = false;
                    if (data.targetId === myId) UI.toast('🛡️ Shield absorbed the hit!');
                }
                // Damage sound when WE are the hider that got hit (not when shielded).
                if (data.hit && !data.shielded && data.targetId === myId) Sound.hurt();
                // Hit-marker on our own crosshair when our shot landed.
                if (data.hit && data.shooterId === myId) UI.hitMarker();
                break;
            }

            case 'jump': {
                // Another player jumped — stamp jumpAt (our clock) so the render
                // loop edge-detects it and plays the jump animation. Our own jump
                // was already triggered locally in Mechanics.jump().
                const jp = gameState.players[data.id];
                if (jp && data.id !== myId) jp.jumpAt = this.now();
                break;
            }

            case 'beamSpawn':
                // Host announced an airdrop beam — render it (arming, then active).
                Level.spawnBeam(data.beamId, data.kind, data.x, data.z, data.armMs);
                Sound.beam(data.kind);
                break;

            case 'beamGone':
                // Beam collected or expired — clear the visual (flash if collected).
                Level.removeBeam(data.beamId, data.collectorId);
                break;

            case 'powerGain':
                // Someone collected a power. Convert ms durations → local deadlines.
                this.applyPowerGain(data.playerId, data.role, data, false);
                break;

            case 'powerUse':
                // A hider activated a held power.
                this.applyPowerUse(data, false);
                break;

            case 'keyGain':
                // A hider collected/recovered a key (purple beam or dropped bundle).
                this.applyKeyGain(data.playerId, data.carried, false);
                break;

            case 'keyDeposit':
                // A hider deposited keys at an exit door (team count up).
                this.applyKeyDeposit(data.playerId, data.carried, data.submitted, false);
                break;

            case 'keyDrop':
                // A killed carrier's keys hit the ground — render the recoverable bundle.
                // The "grab them" toast is delivered separately via a host `notice`
                // (audience: hiders, 5s) so it shows on the host too and stays readable.
                Level.spawnDroppedKey(data.keyId, data.x, data.z, data.count);
                break;

            case 'keyDropGone':
                Level.removeDroppedKey(data.keyId);
                break;

            case 'doorsSchedule':
                // Host told us when exit doors open. Convert the relative ms delay to a
                // local deadline (per-peer clocks, same convention as the 'shot' packet).
                gameState.doorsActivateAt = (data.activateInMs != null)
                    ? this.now() + data.activateInMs : null;
                break;

            case 'hidersWin':
                // The hunter disconnected during migration. We're already (or
                // about to be) dropped into the new host's lobby via lobbySync /
                // rejoinAck, so this popup is purely informational.
                UI.showModal(data.title, data.message, () => {});
                break;

            case 'gameOver':
                // Terminal: the host will tear down; flag so the imminent
                // connToHost 'close' does NOT kick off a host migration.
                sessionEnding = true;
                UI.showModal(data.title, data.message, () => this.cleanup());
                break;

            case 'roomClosing':
                // Voluntary host shutdown — flag so the imminent connToHost
                // 'close' does NOT trigger migration (this is not a crash).
                sessionEnding = true;
                UI.showModal('Room Closed', 'Host ended the match.', () => this.cleanup());
                break;
        }
    },

    /*=================================================================
      Start (or restart) the two client loops: 60 FPS prediction and the
      20 Hz movement send. Clears existing intervals first (used on both
      initial join and reconnection).
    =================================================================*/
    startClientLoops() {
        if (gameLoopInterval) { clearInterval(gameLoopInterval); gameLoopInterval = null; }
        if (networkInterval) { clearInterval(networkInterval); networkInterval = null; }
        // We are a client — stop any host heartbeat and (re)arm the watchdog.
        if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
        if (watchdogInterval) { clearInterval(watchdogInterval); watchdogInterval = null; }

        // Physics / prediction loop — 60 FPS smooth local movement.
        gameLoopInterval = setInterval(() => {
            if (gameState.phase === 'LOBBY' || gameState.phase === 'ENDED') return;
            Mechanics.handleLocalMovement();
            this.applyLocalTransform(gameState.players[myId]);
            Mechanics.tickReload();   // finish weapon reloads (client seeker)
            // Refresh the HUD at 60 FPS too (not just on the 20 Hz snapshot), so the
            // disguise button's proximity state and the cooldown countdown track our
            // locally-predicted movement immediately instead of lagging behind.
            UI.updateHUD();
        }, 1000 / 60);

        // Network loop — send our movement to the host at NETWORK_SEND_RATE.
        networkInterval = setInterval(() => {
            if (gameState.phase === 'LOBBY' || gameState.phase === 'ENDED') return;
            this.sendToHost({
                type: 'clientMove',
                t: this.now(),
                x: localPos.x,
                y: localPos.y,
                z: localPos.z,
                rotY: localRotY
            });
        }, 1000 / NETWORK_SEND_RATE);

        // Watchdog — if the host goes silent (no snapshot/ping/event) for longer
        // than HOST_TIMEOUT_MS, treat it as a host loss. This catches abrupt tab
        // closes/crashes where conn.on('close') never fires. Runs in all phases.
        this._lastHostMsgTime = this.now();
        watchdogInterval = setInterval(() => {
            // Prove our own liveness to the host while in the lobby (in-game the
            // 20 Hz clientMove already does this; the lobby has no other traffic).
            if (gameState.phase === 'LOBBY') this.sendToHost({ type: 'clientPing' });

            if (isLeavingRoom || migrating || sessionEnding) return;
            if (this.now() - this._lastHostMsgTime > HOST_TIMEOUT_MS) {
                this.onHostConnectionClose();
            }
        }, WATCHDOG_MS);
    },

    /*=================================================================
      Game start broadcast (host only)
    =================================================================*/
    startGameBroadcast() {
        // A fresh round clears any leftover migration bookkeeping.
        this._pendingHidersWin = false;
        this._excluded = null;

        // Load the host-selected level into the scene FIRST, so the spawn points
        // below (getSpawnForRole reads mapProps3D) come from the chosen map.
        Level.loadLevel(this.getLevelProps(gameState.levelName), this.getLevelOptions(gameState.levelName));

        // Roles may have changed in the lobby, so the spawn/color baked in at
        // createPlayer is stale. Reassign spawn + color per each player's FINAL
        // role, and reset combat/disguise state for the new round.
        this._usedSpawns = [];
        Object.keys(gameState.players).forEach(id => {
            const p = gameState.players[id];
            const spawn = this.getSpawnForRole(p.role, this._usedSpawns);
            this._usedSpawns.push(spawn);
            p.x = spawn.x; p.y = spawn.y; p.z = spawn.z; p.rotY = 0;
            p.isCaught = false;
            p.health = HIDER_MAX_HP;
            p.score = 0;
            p.revealedUntil = 0;
            p.disguiseLockUntil = 0;
            p.shootingUntil = 0;
            p.jumpAt = 0;
            p.color = p.role === 'Seeker' ? 0xff4757 : 0x2ed573;
            p.disguiseType = 'player';
            p.disguiseSize = 2;
            p.propScale = 1; p.propHeight = 2; p.propRadius = 1; p.propRotation = null; p.disguiseTexture = null;
            // Airdrop power-up state — fresh each round.
            p.heldPower = null;
            p.invisUntil = 0;
            p.invisTotalMs = 0;
            p.shieldArmed = false;
            p.scanUntil = 0;
            p.killUntil = 0;
            p.jamUntil = 0;
            p.carriedKeys = 0;
            delete p._lastMoveT;
            delete p._lastShotT;
        });

        // Reset the airdrop-beam schedule for the new round (re-armed when HUNTING
        // begins — see the timer loop).
        this._beams = [];
        this._beamSeq = 0;
        this._beamSched = null;
        gameState.huntStartT = 0;
        // Keys & exit doors (Phase 2): team deposit counter + dropped-key bundles.
        gameState.submittedKeys = 0;
        gameState.doorsActivateAt = null;   // set when HUNTING begins (timer loop)
        this._droppedKeys = [];
        this._dropKeySeq = 0;

        // Re-seed the host's local prediction from its (re-spawned) record.
        const host = gameState.players[myId];
        host.isReady = true;
        localPos = { x: host.x, y: host.y, z: host.z };
        cameraYaw = 0;
        ammo = MAG_SIZE; reloading = false; reloadUntil = 0; lastShotAt = 0;
        localDisguise = {
            type: 'player', size: 2, color: host.color,
            propScale: 1, propHeight: 2, propRadius: 1, propRotation: null, propTexture: null
        };

        gameState.phase = 'HIDING';
        gameState.timer = HIDING_DURATION();
        // Stamp the authoritative hunting length onto gameState so clients (whose
        // local GAME_SETTINGS.huntingTime may differ) can derive the airdrop
        // countdown from it instead of their own setting.
        gameState.huntingTime = ROUND_DURATION();
        gameState.submittedKeys = 0;   // team key-deposit count (synced via gameStart)
        gameState.doorsActivateAt = null;   // exit-door open time (set at HUNTING start)
        this.broadcast({ type: 'gameStart', gameState });
        UI.transitionToGame();
    },

    /*=================================================================
      HOST MIGRATION
      ---------------------------------------------------------------
      When the host drops, every survivor independently runs the same
      deterministic election over its roster, so exactly one promotes
      itself and the rest reconnect to it. No voting messages needed.
    =================================================================*/

    // Called from a client's connToHost 'close'. Decides migrate vs. give up.
    onHostConnectionClose() {
        if (isLeavingRoom || migrating || sessionEnding) return;
        migrating = true;
        this._excluded = null;   // each migration starts with a clean exclusion set
        departedHostId = (connToHost && connToHost.peer) || departedHostId;
        // The watchdog path reaches here with the (dead) connection still open;
        // close it best-effort before dropping the reference.
        if (connToHost) { try { connToHost.close(); } catch (e) {} }
        connToHost = null;

        if (departedHostId) delete gameState.players[departedHostId];

        const successor = this.electSuccessor();
        if (!successor) { migrating = false; this.connectionLost(); return; }

        if (successor === myId) this.becomeSuccessor();
        else this.reconnectToSuccessor(successor);
    },

    // Deterministic: first roster id (join order) that isn't the departed host
    // and hasn't been excluded by a failed reconnect.
    electSuccessor() {
        const excluded = this._excluded || new Set();
        const ids = Object.keys(gameState.players)
            .filter(id => id !== departedHostId && !excluded.has(id));
        return ids[0] || null;
    },

    // This client is the elected successor: take over hosting authority.
    becomeSuccessor() {
        isHost = true;
        connections = [];
        this._snapshotBuffer = [];
        this._lastSnapshotT = undefined;

        // Accept survivors reconnecting (and, in lobby, brand-new joiners).
        peer.on('connection', conn => this.acceptConnection(conn));

        // Await each remaining survivor; prune any that never return.
        this._clearRejoinTimers();
        rejoinExpected = {};
        Object.keys(gameState.players).forEach(id => {
            if (id === myId) return;
            rejoinExpected[id] = setTimeout(() => this.dropMissingSurvivor(id), 8000);
        });

        const wasLobby = gameState.phase === 'LOBBY';
        const seekers = Object.values(gameState.players)
            .filter(p => p.role === 'Seeker').length;

        if (!wasLobby && seekers === 0) {
            // No hunter remains → dissolve the round, everyone to a fresh lobby.
            this._pendingHidersWin = true;
            this.returnToFreshLobby();
            UI.showModal('Hiders Win!', 'The hunter disconnected. Starting a new lobby.', () => {});
            migrating = false;
            return;
        }

        // Lobby migration, or (future) in-game with a surviving seeker.
        this._pendingHidersWin = false;
        this.mintCodePeer();
        this.startHostLoops();   // idle while LOBBY; resumes the match otherwise

        if (wasLobby) {
            // Roles are user-chosen and preserved across migration. The new host
            // is implicitly ready; if no seeker remains the lobby validation/
            // warning prompts players to pick one (we don't force a role).
            const me = gameState.players[myId];
            if (me) me.isReady = true;
            UI.transitionToLobby();
            UI.updateLobby();
            this.broadcast({ type: 'lobbySync', players: gameState.players, roomCode: pendingRoomCode });
        }

        migrating = false;
    },

    // A non-successor survivor: connect to the elected successor's peer id.
    reconnectToSuccessor(successorId) {
        let opened = false;
        let conn;
        try { conn = peer.connect(successorId); }
        catch (e) { this._failReconnect(successorId); return; }
        if (!conn) { this._failReconnect(successorId); return; }

        conn.on('open', () => {
            opened = true;
            connToHost = conn;
            migrating = false;
            this.wireClientHandlers(conn);
            this.startClientLoops();
            // The successor finds our id in its roster and sends rejoinAck.
        });

        setTimeout(() => {
            if (!opened) {
                try { conn.close(); } catch (e) {}
                this._failReconnect(successorId);
            }
        }, 5000);
    },

    // The chosen successor was unreachable: exclude it and re-elect.
    _failReconnect(successorId) {
        this._excluded = this._excluded || new Set();
        this._excluded.add(successorId);
        if (gameState.players[successorId]) delete gameState.players[successorId];

        const next = this.electSuccessor();
        if (!next) { migrating = false; this.connectionLost(); return; }
        if (next === myId) this.becomeSuccessor();
        else this.reconnectToSuccessor(next);
    },

    // Successor: a survivor we expected never reconnected — drop them.
    dropMissingSurvivor(id) {
        if (rejoinExpected[id]) { clearTimeout(rejoinExpected[id]); delete rejoinExpected[id]; }
        if (gameState.players[id]) {
            delete gameState.players[id];
            UI.updateLobby();
            this.broadcast({ type: 'lobbySync', players: gameState.players });
        }
        this.checkHostAlone();
    },

    // Reset the (now host) successor to a clean lobby and broadcast it.
    returnToFreshLobby() {
        isHost = true;
        gameState.phase = 'LOBBY';
        gameState.timer = 0;
        this._usedSpawns = [];
        this._snapshotBuffer = [];
        this._lastSnapshotT = undefined;

        Object.keys(gameState.players).forEach(id => {
            const p = gameState.players[id];
            const role = (id === myId) ? 'Seeker' : 'Hider';
            const spawn = this.getSpawnForRole(role, this._usedSpawns);
            this._usedSpawns.push(spawn);
            p.role = role;
            p.x = spawn.x; p.y = spawn.y; p.z = spawn.z; p.rotY = 0;
            p.isCaught = false;
            // Host implicitly ready; clients re-ready in the fresh lobby. (Names
            // are preserved — we only reset role/spawn/ready/disguise here.)
            p.isReady = (id === myId);
            p.disguiseType = 'player';
            p.disguiseSize = 2;
            p.propScale = 1; p.propHeight = 2; p.propRadius = 1; p.propRotation = null; p.disguiseTexture = null;
            p.color = role === 'Seeker' ? 0xff4757 : 0x2ed573;
            delete p._lastMoveT;
        });

        const me = gameState.players[myId];
        if (me) { localPos = { x: me.x, y: me.y, z: me.z }; cameraYaw = 0; }
        localDisguise = {
            type: 'player', size: 2, color: 0x2ed573,
            propScale: 1, propHeight: 2, propRadius: 1, propRotation: null, propTexture: null
        };

        this.mintCodePeer();
        this.startHostLoops();   // idle while LOBBY

        UI.transitionToLobby();
        UI.updateLobby();
        this.broadcast({ type: 'lobbySync', players: gameState.players, roomCode: pendingRoomCode });

        departedHostId = null;
        this._excluded = null;
    },

    // Create a fresh 4-digit code endpoint so brand-new players can still join
    // after a migration (existing survivors reconnect via the successor's
    // random id known from the roster). The original code dies with the host.
    mintCodePeer() {
        if (codePeer) { try { codePeer.destroy(); } catch (e) {} codePeer = null; }
        const code = this.generateCode();
        const cp = new Peer('hnh3d-' + code);
        codePeer = cp;
        cp.on('open', () => {
            pendingRoomCode = code;
            UI.setLobbyCode(code);
            // Tell connected clients the new joinable code.
            this.broadcast({ type: 'lobbySync', players: gameState.players, roomCode: code });
        });
        cp.on('connection', conn => this.acceptConnection(conn));
        cp.on('error', err => {
            if (err && err.type === 'unavailable-id') this.mintCodePeer();
        });
    },

    _clearRejoinTimers() {
        for (const id in rejoinExpected) {
            clearTimeout(rejoinExpected[id]);
        }
        rejoinExpected = {};
    },

    /*=================================================================
      Cleanup – returns to menu, clears globals, destroys PeerJS
    =================================================================*/
    cleanup() {

        if (isLeavingRoom)
            return;

        isLeavingRoom = true;

        // Stop loops
        if (gameLoopInterval) { clearInterval(gameLoopInterval); gameLoopInterval = null; }
        if (networkInterval) { clearInterval(networkInterval); networkInterval = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
        if (watchdogInterval) { clearInterval(watchdogInterval); watchdogInterval = null; }

        // Reset packet-ordering / interpolation state for the next match
        this._lastSnapshotT = undefined;
        this._snapshotBuffer = [];

        // Reset host-migration state
        this._clearRejoinTimers();
        migrating = false;
        sessionEnding = false;
        departedHostId = null;
        pendingRoomCode = null;
        this._excluded = null;
        this._pendingHidersWin = false;

        // Remove meshes
        for (let id in playerMeshes) scene.remove(playerMeshes[id]);
        playerMeshes = {};

        // Reset networking globals
        connections = [];
        connToHost = null;
        if (peer) { peer.destroy(); peer = null; }
        if (codePeer) { try { codePeer.destroy(); } catch (e) {} codePeer = null; }
        isHost = false;
        amIReady = false;

        // Reset game globals
        gameState.phase = 'LOBBY';
        gameState.players = {};
        localPos = { x: 0, y: PropLevel.PLAYER_BASE_HEIGHT, z: 0 };
        localDisguise = { type: 'player', size: 2 };
        cameraYaw = 0;

        // UI reset
        UI.transitionToMenu();

        isLeavingRoom = false;
    },

    /*=================================================================
      Leave match – client side
    =================================================================*/
    leaveMatch() {
        if (!isHost) {
            // Notify host
            this.sendToHost({ type: 'leave' });
            // Give host a moment to process
            setTimeout(()=>{    this.cleanup();},100);
            //setTimeout(() => {if (peer) { peer.destroy(); peer = null; }this.cleanup();}, 100);
        } else {
            // Host leaves via shutdownHost()
            this.shutdownHost();
        }
    },

    /*=================================================================
      Shutdown host – host side
    =================================================================*/
    shutdownHost() {
        // Inform all clients
        this.broadcast({ type: 'roomClosing' });
        //setTimeout(() => {if (peer) { peer.destroy(); peer = null; }this.cleanup();}, 200);
        setTimeout(()=>{ this.cleanup(); },200);
    },

    /*=================================================================
      Finish match – host side
    =================================================================*/
    finishMatch(title, message) {
        this.broadcast({ type: 'gameOver', title, message });
        // Clients will clean up after they press OK; host cleans up now
        //setTimeout(() => this.cleanup(), 0);
        UI.showModal(title, message, () => {this.cleanup();});
    },

    /*=================================================================
      Connection lost – any side
    =================================================================*/
    connectionLost() {
        UI.showModal('Disconnected', 'Connection lost.', () => this.cleanup());
    }
};

/*=====================================================================
  Export (if using modules – otherwise global)
=====================================================================*/
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Network;
}