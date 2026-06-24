const Network = {
    generateCode: function() { return Math.floor(1000 + Math.random() * 9000).toString(); },

    startGameBroadcast: function() {
        gameState.phase = 'HIDING';
        gameState.timer = HIDING_DURATION();
        connections.forEach(conn => {
            if(conn.open) conn.send({ type: 'gameStart', gameState });
        });
        UI.transitionToGame();
    },

    initHost: function() {
        UI.updateStatus("Starting engine...");
        isHost = true; 
        let shortCode = this.generateCode();
        
        peer = new Peer('hnh3d-' + shortCode);
        peer.on('open', (id) => {
            myId = id;
            document.getElementById('menu-screen').style.display = 'none';
            document.getElementById('lobby-screen').style.display = 'flex';
            document.getElementById('lobby-title').innerText = `ROOM CODE: ${shortCode}`;
            this.runHostLogic();
        });
        peer.on('error', (err) => {
            if(err.type === 'unavailable-id') document.getElementById('btn-host').click(); 
            else { 
                UI.showModal("Network Error", err.type, () => { Network.exitRoom(); });
            }
        });
    },

    initClient: function() {
        const inputCode = document.getElementById('input-room-id').value.trim();
        if (inputCode.length !== 4) {
            UI.showModal("Invalid Code", "Please enter exactly 4 digits.");
            return;
        }

        UI.updateStatus("Connecting...");
        isHost = false;
        
        peer = new Peer();
        peer.on('open', (id) => {
            myId = id;
            connToHost = peer.connect('hnh3d-' + inputCode);
            connToHost.on('open', () => {
                document.getElementById('menu-screen').style.display = 'none';
                document.getElementById('lobby-screen').style.display = 'flex';
                document.getElementById('lobby-title').innerText = `ROOM CODE: ${inputCode}`;
                this.runClientLogic();
            });
            setTimeout(() => { 
                if(!connToHost || !connToHost.open) { 
                    UI.showModal("Error", "Room not found.", () => { Network.exitRoom(); }); 
                } 
            }, 4000);
        });
    },

    runHostLogic: function() {
        gameState.phase = 'LOBBY';
        gameState.players[myId] = { 
            x: 0, y: 2, z: 0, rotY: 0, role: 'Seeker', isCaught: false, isReady: true,
            disguiseType: 'player', disguiseSize: 2, color: 0xff4757 
        };
        UI.updateLobby();

        peer.on('connection', (conn) => {
            if (gameState.phase !== 'LOBBY') { conn.on('open', () => conn.close()); return; }
            connections.push(conn);
            
            gameState.players[conn.peer] = { 
                x: Math.random() * 20 - 10, y: 2, z: Math.random() * 20 - 10, rotY: 0, 
                role: 'Hider', isCaught: false, isReady: false,
                disguiseType: 'player', disguiseSize: 2, color: 0x2ed573 
            };
            UI.updateLobby();

            conn.on('data', (data) => {
                if (data.type === 'lobbyReady') {
                    gameState.players[conn.peer].isReady = data.readyState; UI.updateLobby();
                }
                if (data.type === 'clientMove' && gameState.players[conn.peer]) {
                    let p = gameState.players[conn.peer];
                    if(!p.isCaught) {
                        p.x = data.x; p.y = data.y; p.z = data.z; p.rotY = data.rotY;
                        p.disguiseType = data.disguiseType; p.disguiseSize = data.disguiseSize; p.color = data.color;
                    }
                }
            });

            conn.on('close', () => {
                delete gameState.players[conn.peer];
                connections = connections.filter(c => c.peer !== conn.peer); UI.updateLobby();
            });
        });

        setInterval(() => {
            if(gameState.phase === 'LOBBY' || gameState.phase === 'ENDED') return;
            gameState.timer--;
            if (gameState.timer <= 0) {
                if (gameState.phase === 'HIDING') {
                    gameState.phase = 'HUNTING'; 
                    gameState.timer = ROUND_DURATION();
                } else if (gameState.phase === 'HUNTING') {
                    gameState.phase = 'ENDED'; 
                    UI.showModal("Time's Up!", "Hiders Win! Time expired.", () => { Network.exitRoom(); });
                }
            }
        }, 1000);

        gameLoopInterval = setInterval(() => {
            if(gameState.phase === 'LOBBY') {
                connections.forEach(conn => { if (conn.open) conn.send({ type: 'lobbySync', players: gameState.players }); });
                return;
            }

            Mechanics.handleLocalMovement();
            gameState.players[myId].x = localPos.x;
            gameState.players[myId].y = localPos.y;
            gameState.players[myId].z = localPos.z;
            gameState.players[myId].rotY = cameraYaw;

            if (gameState.phase === 'HUNTING') Mechanics.checkCollisions();

            connections.forEach(conn => { if (conn.open) conn.send({ type: 'sync', gameState }); });
            UI.updateHUD();
        }, 1000 / 60);
    },

    runClientLogic: function() {
        // BUG FIX: Added 'y: 2' so the physics engine doesn't return NaN!
        localPos = { x: Math.random() * 20 - 10, y: 2, z: Math.random() * 20 - 10 };
        
        connToHost.on('data', (data) => {
            if (data.type === 'lobbySync') { gameState.players = data.players; UI.updateLobby(); }
            if (data.type === 'gameStart') { gameState = data.gameState; UI.transitionToGame(); }
            if (data.type === 'sync') {
                gameState = data.gameState;
                if (gameState.phase !== 'LOBBY') { UI.updateHUD(); }
            }
        });

        connToHost.on('close', () => { 
            UI.showModal("Disconnected", "Host left the match.", () => { Network.exitRoom(); });
        });

        gameLoopInterval = setInterval(() => {
            if(gameState.phase === 'LOBBY' || gameState.phase === 'ENDED') return;
            Mechanics.handleLocalMovement();
            if(connToHost && connToHost.open) {
                connToHost.send({
                    type: 'clientMove', x: localPos.x, y: localPos.y, z: localPos.z, rotY: cameraYaw,
                    disguiseType: localDisguise.type, disguiseSize: localDisguise.size, color: localDisguise.color
                });
            }
        }, 1000 / 60);
    },

    exitRoom: function() {
        if (peer) peer.destroy();
        if (gameLoopInterval) clearInterval(gameLoopInterval);
        
        for(let id in playerMeshes) { scene.remove(playerMeshes[id]); }
        playerMeshes = {};
        
        connections = []; connToHost = null; isHost = false; amIReady = false;
        gameState.phase = 'LOBBY'; gameState.players = {};

        const actionBtn = document.getElementById('btn-lobby-action');
        actionBtn.innerText = "Mark Ready";
        actionBtn.className = "success";
        actionBtn.disabled = false;

        UI.transitionToMenu();
    }
};