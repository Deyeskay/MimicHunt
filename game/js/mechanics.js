const Mechanics = {
    initInputs: function() {
        window.addEventListener('keydown', (e) => { 
            keys[e.key.toLowerCase()] = true; 
            if(e.key.toLowerCase() === 'f') this.handleDisguiseSwap();
            if(e.key === ' ' && isGrounded) this.jump();
        });
        window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

        const canvas = document.getElementById('gameCanvas');
        canvas.addEventListener('click', () => {
            if (gameState.phase !== 'LOBBY') canvas.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === canvas) {
                document.getElementById('mouse-hint').style.display = 'none';
            } else {
                if(gameState.phase !== 'LOBBY') document.getElementById('mouse-hint').style.display = 'block';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === canvas) {

                cameraYaw -=
                    e.movementX *
                    GAME_SETTINGS.mouseSensitivity;

                cameraPitch +=
                    (GAME_SETTINGS.invertY ? -1 : 1) *
                    e.movementY *
                    GAME_SETTINGS.mouseSensitivity;

                cameraPitch = Math.max(
                    CAMERA_MAX_LOOK_DOWN,
                    Math.min(CAMERA_MAX_LOOK_UP, cameraPitch)
                );
            }
        });

        const joyZone = document.getElementById('joystick-zone');
        const joyNub = document.getElementById('joystick-nub');
        joyZone.addEventListener('touchstart', (e) => { joyActive = true; this.handleJoystick(e, joyZone, joyNub); });
        joyZone.addEventListener('touchmove', (e) => { if(joyActive) this.handleJoystick(e, joyZone, joyNub); });
        joyZone.addEventListener('touchend', () => { joyActive = false; touchVector = { x: 0, y: 0 }; joyNub.style.transform = `translate(0px, 0px)`; });

        document.getElementById('btn-action-disguise').addEventListener('touchstart', (e) => { e.preventDefault(); this.handleDisguiseSwap(); });
        document.getElementById('btn-action-jump').addEventListener('touchstart', (e) => { e.preventDefault(); if(isGrounded) this.jump(); });
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

    jump: function() {
        velocityY = JUMP_STRENGTH;
        isGrounded = false;
    },

    handleLocalMovement: function() {
        let pData = gameState.players[myId];
        if (!pData || pData.isCaught) return;
        if (gameState.phase === 'HIDING' && pData.role === 'Seeker') return;

        const moveSpeed = 0.3;
        let moveX = 0; let moveZ = 0;
        
        // BUG FIX: Corrected Camera-Relative Math. 
        // Camera looks at (-sin, -cos). Left is (-cos, +sin). Right is (+cos, -sin).
        if (keys['w'] || keys['arrowup']) { moveX -= Math.sin(cameraYaw); moveZ -= Math.cos(cameraYaw); }
        if (keys['s'] || keys['arrowdown']) { moveX += Math.sin(cameraYaw); moveZ += Math.cos(cameraYaw); }
        if (keys['a'] || keys['arrowleft']) { moveX -= Math.cos(cameraYaw); moveZ += Math.sin(cameraYaw); }
        if (keys['d'] || keys['arrowright']) { moveX += Math.cos(cameraYaw); moveZ -= Math.sin(cameraYaw); }

        if (joyActive) {
            let fwd = -touchVector.y;
            let rgt = touchVector.x;
            moveX = fwd * (-Math.sin(cameraYaw)) + rgt * Math.cos(cameraYaw);
            moveZ = fwd * (-Math.cos(cameraYaw)) + rgt * (-Math.sin(cameraYaw));
        }

        let length = Math.hypot(moveX, moveZ);
        if (length > 0) {
            moveX = (moveX / length) * moveSpeed;
            moveZ = (moveZ / length) * moveSpeed;
            
            // BONUS FIX: Make the 3D model physically turn to face the direction you are walking
            localRotY = Math.atan2(moveX, moveZ);
        }

        let targetX = localPos.x + moveX;
        let targetZ = localPos.z + moveZ;

        // Map Bounds Clamp
        if (targetX < -100) targetX = -100; if (targetX > 100) targetX = 100;
        if (targetZ < -100) targetZ = -100; if (targetZ > 100) targetZ = 100;

        // Prop Collision Check
        let isColliding = false;
        let myRadius = localDisguise.type === 'player' ? 1 : localDisguise.size / 2;

        for (let prop of mapProps3D) {
            let propRadius = prop.size / 2;
            let dist = Math.hypot(targetX - prop.x, targetZ - prop.z);
            
            // If overlapping on X/Z axis, and we aren't jumping OVER it
            if (dist < (myRadius + propRadius) && localPos.y < (prop.size)) {
                isColliding = true; break;
            }
        }

        // Apply horizontal movement if path is clear
        if (!isColliding) {
            localPos.x = targetX;
            localPos.z = targetZ;
        }

        
        let baseHeight = localDisguise.type === 'player' ? 1.5 : localDisguise.size / 2;
        let standingOnSurface = false;
        let surfaceHeight = 0;
        //Scan all props to see if we are standing on top of one. If so, set the surfaceHeight to that prop's top.
        for(let prop of mapProps3D)
        {
            let propRadius = prop.size / 2;

            let distXZ = Math.hypot(
                localPos.x - prop.x,
                localPos.z - prop.z
            );

            let propTop = prop.size;

            if(
                distXZ < propRadius + myRadius &&
                Math.abs(
                    localPos.y -
                    (propTop + baseHeight)
                ) < 0.15
            )
            {
                standingOnSurface = true;
                surfaceHeight = propTop + baseHeight;
                break;
            }
        }
        // Apply Vertical Movement (Gravity)
        if(!standingOnSurface)
        {
            velocityY += GRAVITY;
            localPos.y += velocityY;

            isGrounded = false;
        }
        else
        {
            localPos.y = surfaceHeight;
            velocityY = 0;

            isGrounded = true;
        }
 

        if(localPos.y <= baseHeight)
        {
            localPos.y = baseHeight;

            velocityY = 0;

            isGrounded = true;
        }

        
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