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
        const usedSpawns = [];
        gameState.players = {};
        connections = [];

        // Create host player (Seeker)
        gameState.players[myId] = this.createPlayer('Seeker', usedSpawns);
        localPos = { ...gameState.players[myId] };

        UI.updateLobby();

        // Accept new connections
        peer.on('connection', conn => {
            if (gameState.phase !== 'LOBBY') {
                conn.on('open', () => conn.close());
                return;
            }
            connections.push(conn);
            gameState.players[conn.peer] = this.createPlayer('Hider', usedSpawns);
            UI.updateLobby();

            conn.on("open", () =>
            {
                conn.send({
                    type: "lobbySync",
                    players: gameState.players
                });

                this.broadcast({
                    type: "lobbySync",
                    players: gameState.players
                });
            });

            // Incoming data from client
            conn.on('data', data => {
                switch (data.type) {
                    case 'leave':
                        // Client voluntarily left
                        delete gameState.players[conn.peer];
                        connections = connections.filter(c => c !== conn);
                        UI.updateLobby();
                        this.broadcast({
                            type:"lobbySync",
                            players:gameState.players
                        });
                        break;

                    case 'lobbyReady':
                        if (gameState.players[conn.peer]) {
                            gameState.players[conn.peer].isReady = data.readyState;
                            UI.updateLobby();
                            // Immediately sync lobby to all clients
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
            });

                // Handle disconnects (unexpected)
                conn.on('close', () => {
                    delete gameState.players[conn.peer];
                    connections = connections.filter(c => c.peer !== conn.peer);
                    UI.updateLobby();
                    // Sync updated lobby
                    this.broadcast({ type: 'lobbySync', players: gameState.players });
                });
        });

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
            this.broadcast(this.buildSnapshot());
        }, 1000 / NETWORK_SEND_RATE);
    },

    /*=================================================================
      Client main loop
    =================================================================*/
    runClientLogic() {
        // Receive packets from host
        connToHost.on('data', data => {
            
        switch (data.type) {

            case 'lobbySync':
                gameState.players = data.players;
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

            case 'snapshot': {
                // Lightweight movement update. Surgically patch only remote
                // players' transforms — our own record is left untouched so our
                // 60 FPS prediction is never overwritten. Authoritative non-
                // transform state (disguise/caught/ready) arrives via events.

                // Timestamp guard: ignore stale / out-of-order snapshots.
                if (data.t !== undefined &&
                    this._lastSnapshotT !== undefined &&
                    data.t <= this._lastSnapshotT) break;
                this._lastSnapshotT = data.t;

                gameState.phase = data.phase;
                gameState.timer = data.timer;

                for (const id in data.players) {
                    if (id === myId) continue;            // never clobber our prediction
                    const local = gameState.players[id];
                    if (!local) continue;                  // roster is fixed at gameStart
                    const incoming = data.players[id];
                    local.x = incoming.x;
                    local.y = incoming.y;
                    local.z = incoming.z;
                    local.rotY = incoming.rotY;
                }

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

            case 'gameOver':
                UI.showModal(data.title,data.message,() => this.cleanup());
                break;

            case 'roomClosing':
                UI.showModal('Room Closed','Host ended the match.',() => this.cleanup());
                break;
            }
        });

        // Host disconnects unexpectedly
        connToHost.on('close', () => {
            if (isLeavingRoom) return;
            this.connectionLost();
            //UI.showModal('Disconnected', 'Host left the match.', () => this.cleanup());
        });

        // Physics / prediction loop — stays at 60 FPS for smooth local movement.
        // Writes the predicted transform into our own player record every frame
        // so rendering and the camera follow it smoothly between network updates.
        gameLoopInterval = setInterval(() => {
            if (gameState.phase === 'LOBBY' || gameState.phase === 'ENDED') return;
            Mechanics.handleLocalMovement();
            this.applyLocalTransform(gameState.players[myId]);
        }, 1000 / 60);

        // Network loop — send our movement to the host at NETWORK_SEND_RATE
        // (20 Hz). Transform + timestamp only; disguise changes are sent
        // separately as events (see Mechanics.handleDisguiseSwap).
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
        gameState.players[myId].isReady = true;
        gameState.phase = 'HIDING';
        gameState.timer = HIDING_DURATION();
        this.broadcast({ type: 'gameStart', gameState });
        UI.transitionToGame();
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

        // Reset packet-ordering state for the next match
        this._lastSnapshotT = undefined;

        // Remove meshes
        for (let id in playerMeshes) scene.remove(playerMeshes[id]);
        playerMeshes = {};

        // Reset networking globals
        connections = [];
        connToHost = null;
        if (peer) { peer.destroy(); peer = null; }
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