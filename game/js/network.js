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

                    case 'clientMove':
                        const p = gameState.players[conn.peer];
                        if (p && !p.isCaught) {
                            Object.assign(p, {
                                x: data.x,
                                y: data.y,
                                z: data.z,
                                rotY: data.rotY,
                                disguiseType: data.disguiseType,
                                disguiseSize: data.disguiseSize,
                                propScale: data.propScale ?? 1,
                                propHeight: data.propHeight ?? 2,
                                propRadius: data.propRadius ?? 1,
                                propRotation: data.propRotation ?? null,
                                color: data.color
                            });
                        }
                        break;
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

        // Main 60 FPS loop
        gameLoopInterval = setInterval(() => {
            if (gameState.phase === 'LOBBY' || gameState.phase === 'ENDED') return;

            // Host movement (Seeker)
            Mechanics.handleLocalMovement();
            const host = gameState.players[myId];
            host.x = localPos.x;
            host.y = localPos.y;
            host.z = localPos.z;
            host.rotY = cameraYaw;
            host.disguiseType = localDisguise.type;
            host.disguiseSize = localDisguise.size;
            host.propScale = host.propScale || 1;
            host.propHeight = host.propHeight || 2;
            host.propRadius = host.propRadius || 1;

            // Collision detection (Seeker catches Hiders)
            if (gameState.phase === 'HUNTING') Mechanics.checkCollisions();

            // Broadcast authoritative state
            this.broadcast({ type: 'sync', gameState });
            UI.updateHUD();
        }, 1000 / 60);
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
                UI.transitionToGame();
                break;

            case 'sync':
                Object.assign(gameState, data.gameState);
                if (gameState.phase !== 'LOBBY')
                {
                    UI.updateHUD();
                }
                break;

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

        // Send movement at 60 FPS
        gameLoopInterval = setInterval(() => {
            if (gameState.phase === 'LOBBY' || gameState.phase === 'ENDED') return;
            Mechanics.handleLocalMovement();

            const player = gameState.players[myId];
            const packet = {
                type: 'clientMove',
                x: localPos.x,
                y: localPos.y,
                z: localPos.z,
                rotY: cameraYaw,
                disguiseType: localDisguise.type,
                disguiseSize: localDisguise.size,
                propScale: player?.propScale ?? 1,
                propHeight: player?.propHeight ?? 2,
                propRadius: player?.propRadius ?? 1,
                propRotation: player?.propRotation ?? null,
                color: localDisguise.color || 0x2ed573
            };
            this.sendToHost(packet);
        }, 1000 / 60);
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
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

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