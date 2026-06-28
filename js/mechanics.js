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

        // Desktop: left-click while pointer-locked = fire (fireShot self-gates to
        // Seeker + HUNTING). The first click on the canvas only locks the pointer.
        document.addEventListener('mousedown', (e) => {
            if (e.button === 0 && document.pointerLockElement === canvas) this.fireShot();
        });

        const joyZone = document.getElementById('joystick-zone');
        const joyNub = document.getElementById('joystick-nub');

        // Joystick is bound to its OWN touch identifier so a second finger (the
        // right-half camera look) can run at the same time without hijacking it.
        joyZone.addEventListener('touchstart', (e) => {
            if (joyTouchId !== null) return;
            const t = e.changedTouches[0];
            joyTouchId = t.identifier;
            joyActive = true;
            this.handleJoystickTouch(t, joyZone, joyNub);
            e.preventDefault();
        }, { passive: false });
        joyZone.addEventListener('touchmove', (e) => {
            if (joyTouchId === null) return;
            const t = this.findTouch(e.touches, joyTouchId);
            if (t) { this.handleJoystickTouch(t, joyZone, joyNub); e.preventDefault(); }
        }, { passive: false });
        const endJoy = (e) => {
            if (joyTouchId === null) return;
            if (this.findTouch(e.touches, joyTouchId)) return;   // our touch still down
            joyTouchId = null;
            joyActive = false;
            touchVector = { x: 0, y: 0 };
            joyNub.style.transform = `translate(0px, 0px)`;
        };
        joyZone.addEventListener('touchend', endJoy);
        joyZone.addEventListener('touchcancel', endJoy);

        document.getElementById('btn-action-disguise').addEventListener('touchstart', (e) => { e.preventDefault(); this.handleDisguiseSwap(); });
        document.getElementById('btn-action-jump').addEventListener('touchstart', (e) => { e.preventDefault(); if (isGrounded) this.jump(); });
        const shootBtn = document.getElementById('btn-action-shoot');
        if (shootBtn) shootBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.fireShot(); });

        // --- Mobile camera look (PUBG): drag anywhere on the RIGHT half of the
        // screen (except on UI buttons) to orbit the camera. Tracked by its own
        // touch id so it coexists with the left joystick. No visible UI. ---
        const lookSens = () => GAME_SETTINGS.mouseSensitivity * 1.5;
        document.addEventListener('touchstart', (e) => {
            if (gameState.phase === 'LOBBY') return;
            if (lookTouchId !== null) return;
            const ts = e.changedTouches;
            for (let i = 0; i < ts.length; i++) {
                const t = ts[i];
                if (t.clientX <= window.innerWidth * 0.5) continue;      // right half only
                const el = document.elementFromPoint(t.clientX, t.clientY);
                if (el && el.closest && el.closest('.interactive')) continue;  // skip buttons
                lookTouchId = t.identifier;
                lastLookX = t.clientX;
                lastLookY = t.clientY;
                e.preventDefault();
                break;
            }
        }, { passive: false });
        document.addEventListener('touchmove', (e) => {
            if (lookTouchId === null) return;
            const t = this.findTouch(e.touches, lookTouchId);
            if (!t) return;
            cameraYaw -= (t.clientX - lastLookX) * lookSens();
            cameraPitch += (GAME_SETTINGS.invertY ? -1 : 1) * (t.clientY - lastLookY) * lookSens();
            cameraPitch = Math.max(CAMERA_MAX_LOOK_DOWN, Math.min(CAMERA_MAX_LOOK_UP, cameraPitch));
            lastLookX = t.clientX;
            lastLookY = t.clientY;
            e.preventDefault();
        }, { passive: false });
        const endLook = (e) => {
            if (lookTouchId === null) return;
            if (this.findTouch(e.touches, lookTouchId)) return;   // still down
            lookTouchId = null;
        };
        document.addEventListener('touchend', endLook);
        document.addEventListener('touchcancel', endLook);
    },

    handleJoystickTouch: function(touch, zone, nub) {
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

    // Find a touch by identifier in a TouchList (multi-touch helper).
    findTouch: function(touchList, id) {
        for (let i = 0; i < touchList.length; i++) {
            if (touchList[i].identifier === id) return touchList[i];
        }
        return null;
    },

    jump: function() {
        velocityY = JUMP_STRENGTH;
        isGrounded = false;
        // Trigger the jump animation locally + on every peer.
        const me = gameState.players[myId];
        if (me) me.jumpAt = Network.now();
        Network.sendJump();
    },

    // Seeker fires an energy pulse toward the crosshair. Client-side ammo +
    // fire-rate + reload gating; the host validates the hit (Network.processShot).
    fireShot: function() {
        const me = gameState.players[myId];
        if (!me || me.role !== 'Seeker' || me.isCaught) return;
        if (gameState.phase !== 'HUNTING') return;

        this.tickReload();
        const now = Network.now();
        if (reloading) return;
        if (now - lastShotAt < FIRE_INTERVAL_MS) return;
        if (ammo <= 0) { this.startReload(); return; }

        ammo--;
        lastShotAt = now;
        if (ammo <= 0) this.startReload();

        const ray = Level.getAimRay();
        Sound.pew();
        // Stop our immediate local bolt at the nearest prop (host stays
        // authoritative for the actual hit).
        const blockT = PropLevel.raycastProps(ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz, SHOT_RANGE);
        Level.spawnPulse(ray, Math.min(blockT, SHOT_RANGE));
        Network.sendShot(ray);
        // Enter aim-stance locally (face target + back-walk + upper-body shoot).
        if (me) me.shootingUntil = now + SHOOT_ANIM_MS;
    },

    startReload: function() {
        if (reloading) return;
        reloading = true;
        reloadUntil = Network.now() + RELOAD_MS;
    },

    // Finish a reload once its timer elapses (called every frame on host + client).
    tickReload: function() {
        if (reloading && Network.now() >= reloadUntil) {
            reloading = false;
            ammo = MAG_SIZE;
        }
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

        const moveSpeed = 0.15;   // units per 60Hz tick (~9 u/s). Tune for feel.
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
            localRotY = Math.atan2(moveX, moveZ);   // MOVEMENT heading (PUBG default)
        }

        // Aim-stance: while a seeker is in the post-shot window, face the
        // crosshair/target instead of the movement direction (same convention as
        // the W-forward heading). Retreating then plays the back-walk.
        if (pData.role === 'Seeker' && Network.now() < (pData.shootingUntil || 0)) {
            localRotY = cameraYaw + Math.PI;
        }

        let targetX = localPos.x + moveX;
        let targetZ = localPos.z + moveZ;

        if (targetX < -100) targetX = -100;
        if (targetX > 100) targetX = 100;
        if (targetZ < -100) targetZ = -100;
        if (targetZ > 100) targetZ = 100;

        let myRadius = localDisguise.type === 'player' ? 1 : (localDisguise.size / 2);

        // Per-axis resolution gives wall-sliding: instead of cancelling the whole
        // move when the combined target is blocked, try each axis on its own so
        // the tangential component still applies and the player slides along the
        // surface rather than sticking. X is committed first, then Z is tested
        // against the updated X to avoid clipping around corners.
        if (!this.blockedAt(targetX, localPos.z, myRadius)) {
            localPos.x = targetX;
        }
        if (!this.blockedAt(localPos.x, targetZ, myRadius)) {
            localPos.z = targetZ;
        }

        let baseHeight = localDisguise.type === 'player' ? PropLevel.PLAYER_BASE_HEIGHT : localDisguise.size / 2;

        // Floor under the player = the highest climbable surface it's standing
        // over (and currently on/above), else the world ground. Gravity lands the
        // player on this floor — so you can jump onto rocks/bushes and stand —
        // and walking off the edge drops the floor so you fall again.
        let floorY = baseHeight;
        for (let prop of mapProps3D) {
            if (!PropLevel.isClimbable(prop)) continue;
            const center = PropLevel.getPropCenter(prop);
            const distXZ = Math.hypot(localPos.x - center.x, localPos.z - center.z);
            if (distXZ >= prop.radius + myRadius) continue;
            const surf = PropLevel.getPropTop(prop) + baseHeight;
            // Only a surface the player is on/above counts (small tolerance), so
            // you can't pop up through a prop walked into from the side — you must
            // jump onto it.
            if (localPos.y >= surf - 0.3 && surf > floorY) floorY = surf;
        }

        velocityY += GRAVITY;
        localPos.y += velocityY;
        if (localPos.y <= floorY) {
            localPos.y = floorY;
            velocityY = 0;
            isGrounded = true;
        } else {
            isGrounded = false;
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
            // Disguise is locked for a few seconds after being hit (so a revealed
            // hider can't instantly become another rock). Un-disguising is allowed.
            if (pData.disguiseLockUntil && Network.now() < pData.disguiseLockUntil) return;
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

    // True if a player-sized circle (myRadius) at (x,z) is blocked by any prop's
    // collider piece, at the player's CURRENT height. Props are compound: each
    // piece is a cylinder { x, z, radius, yMin, yMax }, so a slim trunk blocks
    // while a floating canopy (high yMin) lets a grounded player pass under, and
    // anything the player has climbed above no longer blocks. Single-cylinder
    // props (no template) behave exactly as before.
    blockedAt: function(x, z, myRadius) {
        const half = (localDisguise.type === 'player')
            ? PropLevel.PLAYER_BASE_HEIGHT
            : (localDisguise.size / 2);
        const pBottom = localPos.y - half;
        const pTop = localPos.y + half;

        for (let prop of mapProps3D) {
            if (!PropLevel.hasCollision(prop)) continue;
            const pieces = PropLevel.getColliders(prop);
            for (let i = 0; i < pieces.length; i++) {
                const c = pieces[i];
                if (Math.hypot(x - c.x, z - c.z) < (myRadius + c.radius)
                    && pBottom < c.yMax && pTop > c.yMin) {
                    return true;
                }
            }
        }
        return false;
    },

    // Move the local player out of any collider it currently overlaps to the
    // nearest free spot, scanning outward in rings. Because blockedAt() tests
    // EVERY prop's collider pieces, the chosen spot is clear of all of them, so
    // the player is never pushed from one collider into another. No-op if clear.
    resolveOverlap: function() {
        const myRadius = localDisguise.type === 'player' ? 1 : (localDisguise.size / 2);
        if (!this.blockedAt(localPos.x, localPos.z, myRadius)) return;

        const SAMPLES = 24;          // directions tested per ring
        const STEP = 0.25;           // ring spacing (world units)
        const MAX_RINGS = 60;        // up to 15 units away before giving up
        for (let ring = 1; ring <= MAX_RINGS; ring++) {
            const d = ring * STEP;
            for (let i = 0; i < SAMPLES; i++) {
                const a = (i / SAMPLES) * Math.PI * 2;
                const cx = Math.max(-100, Math.min(100, localPos.x + Math.cos(a) * d));
                const cz = Math.max(-100, Math.min(100, localPos.z + Math.sin(a) * d));
                if (!this.blockedAt(cx, cz, myRadius)) {
                    localPos.x = cx;
                    localPos.z = cz;
                    return;
                }
            }
        }
        // Fully boxed in (no clear spot within range) — leave the player put.
    },

    // Win check: all hiders eliminated (health 0 → isCaught). Reached from
    // Network.processShot after a lethal hit. (The old proximity catch is gone —
    // seekers now eliminate hiders by shooting; see Network.processShot.)
    checkWinConditions: function() {
        const players = Object.values(gameState.players);
        const hidersLeft = players.filter(p => p.role === 'Hider' && !p.isCaught).length;
        if (hidersLeft === 0 && players.filter(p => p.role === 'Hider').length > 0) {
            gameState.phase = 'ENDED';
            // finishMatch broadcasts gameOver to every client (so hiders also
            // see the end screen) and shows the host's modal.
            Network.finishMatch("Game Over", "Seeker Wins! All hiders eliminated.");
        }
    }
};
