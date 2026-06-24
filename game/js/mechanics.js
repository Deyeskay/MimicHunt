const Mechanics = {
    initInputs: function() {
        window.addEventListener('keydown', (e) => { 
            keys[e.key.toLowerCase()] = true; 
            if(e.key === ' ') this.handleDisguiseSwap();
        });
        window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

        // Touch logic
        const joyZone = document.getElementById('joystick-zone');
        const joyNub = document.getElementById('joystick-nub');
        joyZone.addEventListener('touchstart', (e) => { joyActive = true; this.handleJoystick(e, joyZone, joyNub); });
        joyZone.addEventListener('touchmove', (e) => { if(joyActive) this.handleJoystick(e, joyZone, joyNub); });
        joyZone.addEventListener('touchend', () => { joyActive = false; touchVector = { x: 0, y: 0 }; joyNub.style.transform = `translate(0px, 0px)`; });

        document.getElementById('btn-action-disguise').addEventListener('touchstart', (e) => {
            e.preventDefault(); this.handleDisguiseSwap();
        });
    },

    handleJoystick: function(e, zone, nub) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = zone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        let dx = touch.clientX - centerX; let dy = touch.clientY - centerY;
        const dist = Math.hypot(dx, dy); const maxDist = rect.width / 2;
        if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }

        nub.style.transform = `translate(${dx}px, ${dy}px)`;
        touchVector = { x: dx / maxDist, y: dy / maxDist };
    },

    handleLocalMovement: function() {
        let pData = gameState.players[myId];
        if (!pData || pData.isCaught) return;
        if (gameState.phase === 'HIDING' && pData.role === 'Seeker') return;

        const moveSpeed = 0.3; const rotSpeed = 0.05;

        // Note: Change this logic here when integrating mouse look later
        if (keys['a'] || keys['arrowleft']) localRotY += rotSpeed;
        if (keys['d'] || keys['arrowright']) localRotY -= rotSpeed;
        if (keys['w'] || keys['arrowup']) { localPos.x -= Math.sin(localRotY) * moveSpeed; localPos.z -= Math.cos(localRotY) * moveSpeed; }
        if (keys['s'] || keys['arrowdown']) { localPos.x += Math.sin(localRotY) * moveSpeed; localPos.z += Math.cos(localRotY) * moveSpeed; }

        if (joyActive) {
            localPos.x -= Math.sin(localRotY) * touchVector.y * moveSpeed;
            localPos.z -= Math.cos(localRotY) * touchVector.y * moveSpeed;
            localRotY -= touchVector.x * rotSpeed;
        }

        // Map Bounds Clamp
        if (localPos.x < -100) localPos.x = -100; if (localPos.x > 100) localPos.x = 100;
        if (localPos.z < -100) localPos.z = -100; if (localPos.z > 100) localPos.z = 100;
    },

    handleDisguiseSwap: function() {
        let pData = gameState.players[myId];
        if (!pData || pData.role !== 'Hider' || pData.isCaught) return;

        for (let prop of mapProps3D) {
            let dist = Math.hypot(localPos.x - prop.x, localPos.z - prop.z);
            if (dist < prop.size * 2 + 2) {
                localDisguise.type = prop.type; localDisguise.size = prop.size; localDisguise.color = prop.color; return;
            }
        }
        localDisguise.type = 'player'; localDisguise.size = 2; localDisguise.color = 0x2ed573;
    },

    checkCollisions: function() {
        const players = Object.values(gameState.players);
        const seeker = players.find(p => p.role === 'Seeker');
        if (!seeker) return;

        for (let id in gameState.players) {
            let target = gameState.players[id];
            if (target.role === 'Hider' && !target.isCaught) {
                let dist = Math.hypot(seeker.x - target.x, seeker.z - target.z);
                if (dist < (target.disguiseSize + 2)) {
                    gameState.players[id].isCaught = true; 
                    this.checkWinConditions();
                }
            }
        }
    },

    checkWinConditions: function() {
        const players = Object.values(gameState.players);
        const hidersLeft = players.filter(p => p.role === 'Hider' && !p.isCaught).length;
        if (hidersLeft === 0 && players.filter(p => p.role === 'Hider').length > 0) {
            gameState.phase = 'ENDED'; 
            UI.showModal("Game Over", "Seeker Wins! All props found.", () => {
                Network.exitRoom();
            });
        }
    }
};