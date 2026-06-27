const Mechanics = {
    initInputs: function() {
        window.addEventListener('keydown', (e) => {
            keys[e.key.toLowerCase()] = true;
            if (e.key.toLowerCase() === 'f') this.handleDisguiseSwap();
            if (e.key.toLowerCase() === 'g') Level.setDeveloper(!developer);   // dev: toggle collider gizmos
            if (e.key === ' ' && isGrounded) this.jump();
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
                if (gameState.phase !== 'LOBBY') document.getElementById('mouse-hint').style.display = 'block';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === canvas) {
                cameraYaw -= e.movementX * GAME_SETTINGS.mouseSensitivity;
                cameraPitch += (GAME_SETTINGS.invertY ? -1 : 1) * e.movementY * GAME_SETTINGS.mouseSensitivity;
                cameraPitch = Math.max(CAMERA_MAX_LOOK_DOWN, Math.min(CAMERA_MAX_LOOK_UP, cameraPitch));
            }
        });

        const joyZone = document.getElementById('joystick-zone');
        const joyNub = document.getElementById('joystick-nub');
        joyZone.addEventListener('touchstart', (e) => { joyActive = true; this.handleJoystick(e, joyZone, joyNub); });
        joyZone.addEventListener('touchmove', (e) => { if (joyActive) this.handleJoystick(e, joyZone, joyNub); });
        joyZone.addEventListener('touchend', () => { joyActive = false; touchVector = { x: 0, y: 0 }; joyNub.style.transform = `translate(0px, 0px)`; });

        document.getElementById('btn-action-disguise').addEventListener('touchstart', (e) => { e.preventDefault(); this.handleDisguiseSwap(); });
        document.getElementById('btn-action-jump').addEventListener('touchstart', (e) => { e.preventDefault(); if (isGrounded) this.jump(); });
    },

    handleJoystick: function(e, zone, nub) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = zone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const dist = Math.hypot(dx, dy);
        const maxDist = rect.width / 2;
        if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }

        nub.style.transform = `translate(${dx}px, ${dy}px)`;
        touchVector = { x: dx / maxDist, y: dy / maxDist };
    },

    jump: function() {
        velocityY = JUMP_STRENGTH;
        isGrounded = false;
    },

    applyDisguiseFromProp: function(prop) {
        localDisguise.type = prop.model;
        localDisguise.size = prop.radius * 2;
        localDisguise.propScale = prop.scale ?? 1;
        localDisguise.propHeight = prop.height;
        localDisguise.propRadius = prop.radius;
        localDisguise.propRotation = prop.rotation || null;

        const player = gameState.players[myId];
        player.disguiseType = localDisguise.type;
        player.disguiseSize = localDisguise.size;
        player.propScale = localDisguise.propScale;
        player.propHeight = localDisguise.propHeight;
        player.propRadius = localDisguise.propRadius;
        player.propRotation = localDisguise.propRotation;
    },

    clearDisguise: function() {
        localDisguise.type = 'player';
        localDisguise.size = 2;
        localDisguise.propScale = 1;
        localDisguise.propHeight = 2;
        localDisguise.propRadius = 1;
        localDisguise.propRotation = null;

        const player = gameState.players[myId];
        player.disguiseType = 'player';
        player.disguiseSize = 2;
        player.propScale = 1;
        player.propHeight = 2;
        player.propRadius = 1;
        player.propRotation = null;
    },

    handleLocalMovement: function() {
        if (!joyActive) {
            touchVector.x = 0;
            touchVector.y = 0;
        }

        let pData = gameState.players[myId];
        if (!pData || pData.isCaught) return;
        if (gameState.phase === 'HIDING' && pData.role === 'Seeker') return;

        const moveSpeed = 0.3;
        let moveX = 0;
        let moveZ = 0;

        if (keys['w'] || keys['arrowup']) { moveX -= Math.sin(cameraYaw); moveZ -= Math.cos(cameraYaw); }
        if (keys['s'] || keys['arrowdown']) { moveX += Math.sin(cameraYaw); moveZ += Math.cos(cameraYaw); }
        if (keys['a'] || keys['arrowleft']) { moveX -= Math.cos(cameraYaw); moveZ += Math.sin(cameraYaw); }
        if (keys['d'] || keys['arrowright']) { moveX += Math.cos(cameraYaw); moveZ -= Math.sin(cameraYaw); }

        if (joyActive && (Math.abs(touchVector.x) > 0.05 || Math.abs(touchVector.y) > 0.05)) {
            let fwd = -touchVector.y;
            let rgt = touchVector.x;
            moveX = fwd * (-Math.sin(cameraYaw)) + rgt * Math.cos(cameraYaw);
            moveZ = fwd * (-Math.cos(cameraYaw)) + rgt * (-Math.sin(cameraYaw));
        }

        let length = Math.hypot(moveX, moveZ);
        if (length > 0) {
            moveX = (moveX / length) * moveSpeed;
            moveZ = (moveZ / length) * moveSpeed;
            localRotY = Math.atan2(moveX, moveZ);
        }

        let targetX = localPos.x + moveX;
        let targetZ = localPos.z + moveZ;

        if (targetX < -100) targetX = -100;
        if (targetX > 100) targetX = 100;
        if (targetZ < -100) targetZ = -100;
        if (targetZ > 100) targetZ = 100;

        let isColliding = false;
        let myRadius = localDisguise.type === 'player' ? 1 : (localDisguise.size / 2);

        for (let prop of mapProps3D) {
            if (!PropLevel.hasCollision(prop)) continue;

            const center = PropLevel.getPropCenter(prop);
            let dist = Math.hypot(targetX - center.x, targetZ - center.z);
            const propTop = PropLevel.getPropTop(prop);

            if (dist < (myRadius + prop.radius) && localPos.y < propTop) {
                isColliding = true;
                break;
            }
        }

        if (!isColliding) {
            localPos.x = targetX;
            localPos.z = targetZ;
        }

        let baseHeight = localDisguise.type === 'player' ? PropLevel.PLAYER_BASE_HEIGHT : localDisguise.size / 2;
        let standingOnSurface = false;
        let surfaceHeight = 0;

        for (let prop of mapProps3D) {
            if (!PropLevel.isClimbable(prop)) continue;

            const center = PropLevel.getPropCenter(prop);
            let distXZ = Math.hypot(localPos.x - center.x, localPos.z - center.z);
            let propTop = PropLevel.getPropTop(prop);

            if (
                distXZ < prop.radius + myRadius &&
                Math.abs(localPos.y - (propTop + baseHeight)) < 0.15
            ) {
                standingOnSurface = true;
                surfaceHeight = propTop + baseHeight;
                break;
            }
        }

        if (!standingOnSurface) {
            velocityY += GRAVITY;
            localPos.y += velocityY;
            isGrounded = false;
        } else {
            localPos.y = surfaceHeight;
            velocityY = 0;
            isGrounded = true;
        }

        if (localPos.y <= baseHeight) {
            localPos.y = baseHeight;
            velocityY = 0;
            isGrounded = true;
        }
    },

    handleDisguiseSwap: function() {
        let pData = gameState.players[myId];
        if (!pData || pData.role !== 'Hider' || pData.isCaught) return;

        let nearest = null;
        let nearestDist = Infinity;

        for (let prop of mapProps3D) {
            if (!PropLevel.canDisguiseAs(prop)) continue;

            const center = PropLevel.getPropCenter(prop);
            let dist = Math.hypot(localPos.x - center.x, localPos.z - center.z);
            let reach = prop.radius * 2 + 2;

            if (dist < reach && dist < nearestDist) {
                nearest = prop;
                nearestDist = dist;
            }
        }

        if (nearest) {
            this.applyDisguiseFromProp(nearest);
        } else {
            this.clearDisguise();
        }

        // Disguising grows the player's collider to the prop's size, so if the
        // hider was touching that prop it now overlaps it (and maybe others).
        // Push the player to the nearest clear spot so it never spawns wedged
        // inside a collider — and never into a different one.
        this.resolveOverlap();

        // Disguise changes rarely, so replicate it as a discrete event rather
        // than in every movement packet. No-ops on the host (it's the Seeker
        // and never reaches here, and has no connToHost anyway).
        Network.sendDisguiseUpdate();
    },

    // True if a player-sized circle (myRadius) at (x,z) overlaps any collidable
    // prop's circle. Used by the disguise push-out below.
    overlapsAt: function(x, z, myRadius) {
        for (let prop of mapProps3D) {
            if (!PropLevel.hasCollision(prop)) continue;
            const c = PropLevel.getPropCenter(prop);
            if (Math.hypot(x - c.x, z - c.z) < (myRadius + prop.radius) - 0.001) return true;
        }
        return false;
    },

    // Move the local player out of any collider it currently overlaps to the
    // nearest free spot, scanning outward in rings. Because overlapsAt() tests
    // EVERY collider, the chosen spot is clear of all of them, so the player is
    // never pushed from one collider into another. No-op if already clear.
    resolveOverlap: function() {
        const myRadius = localDisguise.type === 'player' ? 1 : (localDisguise.size / 2);
        if (!this.overlapsAt(localPos.x, localPos.z, myRadius)) return;

        const SAMPLES = 24;          // directions tested per ring
        const STEP = 0.25;           // ring spacing (world units)
        const MAX_RINGS = 60;        // up to 15 units away before giving up
        for (let ring = 1; ring <= MAX_RINGS; ring++) {
            const d = ring * STEP;
            for (let i = 0; i < SAMPLES; i++) {
                const a = (i / SAMPLES) * Math.PI * 2;
                const cx = Math.max(-100, Math.min(100, localPos.x + Math.cos(a) * d));
                const cz = Math.max(-100, Math.min(100, localPos.z + Math.sin(a) * d));
                if (!this.overlapsAt(cx, cz, myRadius)) {
                    localPos.x = cx;
                    localPos.z = cz;
                    return;
                }
            }
        }
        // Fully boxed in (no clear spot within range) — leave the player put.
    },

    checkCollisions: function() {
        // Multiple seekers are allowed — any seeker within range catches a hider.
        const seekers = Object.values(gameState.players).filter(p => p.role === 'Seeker');
        if (!seekers.length) return;

        for (let id in gameState.players) {
            let target = gameState.players[id];
            if (target.role !== 'Hider' || target.isCaught) continue;

            for (const seeker of seekers) {
                let dist = Math.hypot(seeker.x - target.x, seeker.z - target.z);
                if (dist < (target.disguiseSize + 2)) {
                    target.isCaught = true;
                    // Caught state no longer rides in the snapshot — tell
                    // everyone with a discrete event (host-only code path).
                    Network.broadcast({ type: 'caught', id });
                    this.checkWinConditions();
                    break;   // already caught; no need to test other seekers
                }
            }
        }
    },

    checkWinConditions: function() {
        const players = Object.values(gameState.players);
        const hidersLeft = players.filter(p => p.role === 'Hider' && !p.isCaught).length;
        if (hidersLeft === 0 && players.filter(p => p.role === 'Hider').length > 0) {
            gameState.phase = 'ENDED';
            // finishMatch broadcasts gameOver to every client (so hiders also
            // see the end screen) and shows the host's modal — previously this
            // path only opened the modal on the host.
            Network.finishMatch("Game Over", "Seeker Wins! All props found.");
        }
    }
};
