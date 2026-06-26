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
    createPlayer(role, used) {
        const spawn = this.getSpawnForRole(role, used);
        used.push(spawn);
        return {
            x: spawn.x,
            y: spawn.y,
            z: spawn.z,
            rotY: 0,
            role,
            isCaught: false,
            isReady: role === 'Seeker',
            disguiseType: 'player',
            disguiseSize: 2,
            propScale: 1,
            propHeight: 2,
            propRadius: 1,
            propRotation: null,
            color: role === 'Seeker' ? 0xff4757 : 0x2ed573
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
        p.rotY = cameraYaw;
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
      Send the local player's disguise to the host as a discrete event
      (only when it actually changes — see Mechanics.handleDisguiseSwap).
      No-ops on the host, which has no connToHost.
    =================================================================*/
    sendDisguiseUpdate() {
        this.sendToHost({
            type: 'clientDisguise',
            disguiseType: localDisguise.type,
            disguiseSize: localDisguise.size,
            propScale: localDisguise.propScale,
            propHeight: localDisguise.propHeight,
            propRadius: localDisguise.propRadius,
            propRotation: localDisguise.propRotation,
            color: localDisguise.color
        });
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
            document.getElementById('lobby-title').innerText = `ROOM CODE: ${code}`;
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
            connToHost = peer.connect('hnh3d-' + input);
            connToHost.on('open', () => {
                // Show lobby UI for client
                document.getElementById('menu-screen').style.display = 'none';
                document.getElementById('lobby-screen').style.display = 'flex';
                document.getElementById('lobby-title').innerText = `ROOM CODE: ${input}`;
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

        // Create host player (Seeker)
        gameState.players[myId] = this.createPlayer('Seeker', this._usedSpawns);
        localPos = { ...gameState.players[myId] };

        UI.updateLobby();

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
                    roomCode: pendingRoomCode
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
            gameState.players[conn.peer] = this.createPlayer('Hider', this._usedSpawns || []);
            UI.updateLobby();
            conn.send({ type: 'lobbySync', players: gameState.players });
            this.broadcast({ type: 'lobbySync', players: gameState.players });
        });

        conn.on('data', data => this.handleClientData(conn, data));
        conn.on('close', () => this.handleConnClose(conn));
    },

    /*=================================================================
      Host-side: handle a packet from a connected client.
    =================================================================*/
    handleClientData(conn, data) {
        switch (data.type) {
            case 'leave':
                // Client voluntarily left
                delete gameState.players[conn.peer];
                connections = connections.filter(c => c !== conn);
                UI.updateLobby();
                this.broadcast({ type: 'lobbySync', players: gameState.players });
                this.checkHostAlone();
                break;

            case 'lobbyReady':
                if (gameState.players[conn.peer]) {
                    gameState.players[conn.peer].isReady = data.readyState;
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

            case 'clientDisguise': {
                // Rare event packet — disguise change. Apply, then relay
                // to every OTHER client so they render this player right.
                const p = gameState.players[conn.peer];
                if (p) {
                    p.disguiseType = data.disguiseType;
                    p.disguiseSize = data.disguiseSize;
                    p.propScale = data.propScale ?? 1;
                    p.propHeight = data.propHeight ?? 2;
                    p.propRadius = data.propRadius ?? 1;
                    p.propRotation = data.propRotation ?? null;
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
                        color: p.color
                    }, conn.peer);
                }
                break;
            }
        }
    },

    /*=================================================================
      Host-side: a client connection closed (left or crashed).
    =================================================================*/
    handleConnClose(conn) {
        delete gameState.players[conn.peer];
        connections = connections.filter(c => c.peer !== conn.peer);
        // Stop awaiting a survivor that will never reconnect.
        if (rejoinExpected[conn.peer]) {
            clearTimeout(rejoinExpected[conn.peer]);
            delete rejoinExpected[conn.peer];
        }
        UI.updateLobby();
        this.broadcast({ type: 'lobbySync', players: gameState.players });
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
      Start (or restart) the three host loops: 1s timer, 60 FPS physics,
      20 Hz snapshot broadcast. Clears any existing intervals first so a
      migrated successor can never end up running two sets of loops.
    =================================================================*/
    startHostLoops() {
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (gameLoopInterval) { clearInterval(gameLoopInterval); gameLoopInterval = null; }
        if (networkInterval) { clearInterval(networkInterval); networkInterval = null; }

        // Timer loop (seconds)
        timerInterval = setInterval(() => {
            if (gameState.phase === 'LOBBY' || gameState.phase === 'ENDED') return;
            gameState.timer--;
            if (gameState.timer <= 0) {
                if (gameState.phase === 'HIDING') {
                    gameState.phase = 'HUNTING';
                    gameState.timer = ROUND_DURATION();
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

            // Collision detection (Seeker catches Hiders)
            if (gameState.phase === 'HUNTING') Mechanics.checkCollisions();

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
        switch (data.type) {

            case 'lobbySync':
                gameState.players = data.players;
                if (data.roomCode) {
                    pendingRoomCode = data.roomCode;
                    const t = document.getElementById('lobby-title');
                    if (t) t.innerText = `ROOM CODE: ${data.roomCode}`;
                }
                // A lobbySync can arrive after a migration while we were still
                // in-game; make sure we're actually showing the lobby.
                if (gameState.phase === 'LOBBY') UI.transitionToLobby();
                UI.updateLobby();
                break;

            case 'gameStart':
                Object.assign(gameState, data.gameState);
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
                if (data.roomCode) {
                    pendingRoomCode = data.roomCode;
                    const t = document.getElementById('lobby-title');
                    if (t) t.innerText = `ROOM CODE: ${data.roomCode}`;
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

        // Physics / prediction loop — 60 FPS smooth local movement.
        gameLoopInterval = setInterval(() => {
            if (gameState.phase === 'LOBBY' || gameState.phase === 'ENDED') return;
            Mechanics.handleLocalMovement();
            this.applyLocalTransform(gameState.players[myId]);
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
                rotY: cameraYaw
            });
        }, 1000 / NETWORK_SEND_RATE);
    },

    /*=================================================================
      Game start broadcast (host only)
    =================================================================*/
    startGameBroadcast() {
        // A fresh round clears any leftover migration bookkeeping.
        this._pendingHidersWin = false;
        this._excluded = null;

        gameState.players[myId].isReady = true;
        gameState.phase = 'HIDING';
        gameState.timer = HIDING_DURATION();
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
            // Ensure the lobby has a hunter to start: promote self to Seeker
            // (the host is conventionally the Seeker; roles otherwise preserved).
            const me = gameState.players[myId];
            if (me && seekers === 0) {
                me.role = 'Seeker';
                me.isReady = true;
                me.color = 0xff4757;
                me.disguiseType = 'player';
                me.disguiseSize = 2;
            }
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
            p.isReady = (role === 'Seeker');
            p.disguiseType = 'player';
            p.disguiseSize = 2;
            p.propScale = 1; p.propHeight = 2; p.propRadius = 1; p.propRotation = null;
            p.color = role === 'Seeker' ? 0xff4757 : 0x2ed573;
            delete p._lastMoveT;
        });

        const me = gameState.players[myId];
        if (me) { localPos = { x: me.x, y: me.y, z: me.z }; cameraYaw = 0; }
        localDisguise = {
            type: 'player', size: 2, color: 0x2ed573,
            propScale: 1, propHeight: 2, propRadius: 1, propRotation: null
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
            const t = document.getElementById('lobby-title');
            if (t) t.innerText = `ROOM CODE: ${code}`;
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