const Mechanics = {
    initInputs: function() {
        window.addEventListener('keydown', (e) => {
            keys[e.key.toLowerCase()] = true;
            if (e.key.toLowerCase() === 'f') this.handleDisguiseSwap();
            if (e.key.toLowerCase() === 'e') this.activatePower();   // use held airdrop power (hider)
            if (e.key === ' ' && isGrounded) this.jump();
        });
        window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

        // UI click feedback: one delegated listener covers every menu/HUD button
        // (capture phase so it fires even if a handler stops propagation). The
        // in-game action pads (jump/shoot/disguise) are skipped — they drive on
        // touchstart and have their own gameplay audio.
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn || btn.classList.contains('action-btn')) return;
            Sound.click();
        }, true);

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
            if (isEditingLayout) return;   // dragging the joystick in Edit Layout
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

        document.getElementById('btn-action-disguise').addEventListener('touchstart', (e) => { if (isEditingLayout) return; e.preventDefault(); this.handleDisguiseSwap(); });
        document.getElementById('btn-action-jump').addEventListener('touchstart', (e) => { if (isEditingLayout) return; e.preventDefault(); if (isGrounded) this.jump(); });
        const powerBtn = document.getElementById('btn-action-power');
        if (powerBtn) powerBtn.addEventListener('touchstart', (e) => { if (isEditingLayout) return; e.preventDefault(); this.activatePower(); });
        // --- Shoot button (PUBG fire button): press-and-hold = fire continuously
        // (fireShot self-gates to the fire rate); slide the SAME finger off the
        // button to orbit the camera, using its own shootDragSensitivity. Bound to
        // its own touch id so it coexists with the joystick + right-half look. ---
        const shootBtn = document.getElementById('btn-action-shoot');
        const shootDragSens = () => GAME_SETTINGS.shootDragSensitivity || GAME_SETTINGS.mouseSensitivity * 1.5;
        if (shootBtn) {
            shootBtn.addEventListener('touchstart', (e) => {
                if (isEditingLayout) return;
                if (shootTouchId !== null) return;
                const t = e.changedTouches[0];
                shootTouchId = t.identifier;
                shootLastX = t.clientX;
                shootLastY = t.clientY;
                shootBtn.classList.add('firing');   // selected/active state while held
                this.fireShot();
                // Poll faster than the fire gate (FIRE_INTERVAL_MS) so held-fire can
                // actually reach the full 4 shots/sec; fireShot self-gates the rate.
                if (shootFireTimer === null) shootFireTimer = setInterval(() => this.fireShot(), 50);
                e.preventDefault();
            }, { passive: false });
            document.addEventListener('touchmove', (e) => {
                if (shootTouchId === null) return;
                const t = this.findTouch(e.touches, shootTouchId);
                if (!t) return;
                cameraYaw -= (t.clientX - shootLastX) * shootDragSens();
                cameraPitch += (GAME_SETTINGS.invertY ? -1 : 1) * (t.clientY - shootLastY) * shootDragSens();
                cameraPitch = Math.max(CAMERA_MAX_LOOK_DOWN, Math.min(CAMERA_MAX_LOOK_UP, cameraPitch));
                shootLastX = t.clientX;
                shootLastY = t.clientY;
                e.preventDefault();
            }, { passive: false });
            const endShoot = (e) => {
                if (shootTouchId === null) return;
                if (this.findTouch(e.touches, shootTouchId)) return;   // our touch still down
                shootTouchId = null;
                shootBtn.classList.remove('firing');
                if (shootFireTimer !== null) { clearInterval(shootFireTimer); shootFireTimer = null; }
            };
            document.addEventListener('touchend', endShoot);
            document.addEventListener('touchcancel', endShoot);
        }

        // --- Mobile camera look (PUBG): drag anywhere on the RIGHT half of the
        // screen (except on UI buttons) to orbit the camera. Tracked by its own
        // touch id so it coexists with the left joystick. No visible UI. ---
        const lookSens = () => GAME_SETTINGS.mouseSensitivity * 1.5;
        document.addEventListener('touchstart', (e) => {
            if (isEditingLayout) return;   // no camera-look while editing layout
            if (gameState.phase === 'LOBBY') return;
            if (lookTouchId !== null) return;
            const ts = e.changedTouches;
            for (let i = 0; i < ts.length; i++) {
                const t = ts[i];
                if (t.clientX <= window.innerWidth * 0.5) continue;      // right half only
                const el = document.elementFromPoint(t.clientX, t.clientY);
                // Skip UI: buttons (incl. shoot, which has its own drag-look) and any
                // open modal overlay — else preventDefault() here swallows the tap's
                // synthesized click, so e.g. the GAME OVER "OK" wouldn't fire on mobile.
                if (el && el.closest && el.closest('.interactive, .action-btn, .modal-overlay')) continue;
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

        // Gyro aim: attach at boot if a mode was saved. On iOS the permission
        // request only succeeds from a user gesture, so a boot attach truly wires
        // only on Android; iOS re-attaches on the first Settings interaction.
        if (GAME_SETTINGS.gyroMode !== 'off') this.enableGyro();
    },

    // --- GYRO AIM (PUBG-style) -----------------------------------------------
    // Attach the deviceorientation listener (once). iOS 13+ gates the sensor
    // behind DeviceOrientationEvent.requestPermission(), which MUST be called
    // from a user gesture — so this is invoked from the Settings select's change
    // handler (a tap) as well as at boot. Guarded by gyroAttached.
    enableGyro: function() {
        if (gyroAttached) return;
        if (typeof DeviceOrientationEvent === 'undefined') return;   // no sensor API (needs HTTPS)
        const attach = () => {
            gyroAttached = true;
            gyroPrev = null;
            window.addEventListener('deviceorientation', (e) => this.onGyro(e));
        };
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            // iOS 13+ — returns a promise; only attach on 'granted'.
            DeviceOrientationEvent.requestPermission().then((state) => {
                if (state === 'granted') attach();
                else {
                    // Denied: fall back to Off so the UI reflects reality.
                    GAME_SETTINGS.gyroMode = 'off';
                    const sel = document.getElementById('setting-gyro-mode');
                    if (sel) sel.value = 'off';
                    if (typeof UI !== 'undefined' && UI.showModal)
                        UI.showModal('Gyro unavailable', 'Motion access was denied. Enable it in your browser settings to use gyro aim.');
                }
            }).catch(() => {});
        } else {
            attach();   // Android / desktop — no permission gate
        }
    },

    // deviceorientation handler: diff against the previous reading and add the
    // delta to cameraYaw/cameraPitch (same globals the touch/mouse look feed).
    onGyro: function(e) {
        if (e.alpha === null && e.beta === null && e.gamma === null) return;   // no sensor data
        const mode = GAME_SETTINGS.gyroMode;
        // Gate: when inactive, drop the baseline so re-engaging doesn't apply a
        // giant accumulated delta (no camera jump).
        const active =
            mode !== 'off' &&
            gameState.phase !== 'LOBBY' &&
            !isEditingLayout &&
            (mode === 'always' || (mode === 'scope' && shootTouchId !== null));
        if (!active) { gyroPrev = null; return; }

        if (gyroPrev === null) { gyroPrev = { alpha: e.alpha, beta: e.beta, gamma: e.gamma }; return; }

        const dBeta = e.beta - gyroPrev.beta;
        const dGamma = e.gamma - gyroPrev.gamma;
        // Wrap/discontinuity guard (e.g. beta flips near vertical) — reset baseline.
        if (Math.abs(dBeta) > GYRO_WRAP || Math.abs(dGamma) > GYRO_WRAP) {
            gyroPrev = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
            return;
        }

        const k = GYRO_BASE * (GAME_SETTINGS.gyroSensitivity || 1);
        // Landscape-locked game: gamma->yaw, beta->pitch. Signs confirmed on-device
        // (physically pan left => view pans left); flip a sign here to re-tune.
        cameraYaw -= dGamma * k;
        cameraPitch += (GAME_SETTINGS.invertY ? -1 : 1) * dBeta * k;
        cameraPitch = Math.max(CAMERA_MAX_LOOK_DOWN, Math.min(CAMERA_MAX_LOOK_UP, cameraPitch));

        gyroPrev = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
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

        // dx/dy are screen pixels (rect is the SCALED size when the layout editor
        // has resized the joystick). The nub lives INSIDE the scaled zone, so its
        // own translate is multiplied by that scale — divide it back out so the nub
        // tracks the finger 1:1. offsetWidth is the un-scaled layout width.
        const scale = (zone.offsetWidth ? rect.width / zone.offsetWidth : 1) || 1;
        nub.style.transform = `translate(${dx / scale}px, ${dy / scale}px)`;
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
        Sound.jump();
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
        Sound.reload();
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
        localDisguise.propTexture = prop.texture || null;   // cube disguise keeps its texture

        // Adopt the disguised prop's COMPOUND collider shape (e.g. tree = slim
        // trunk + wide canopy), in local coords with feet at y=0. Used by the dev
        // gizmo and by ground-level movement collision (groundRadius), so a
        // disguised tree behaves/looks like a real tree, not one fat cylinder.
        const def = PropLevel.getPrefab(prop.model);
        const H = prop.height || 2, R = prop.radius || 1;
        const bounds = { radius: R, height: H, bottomY: 0, topY: H,
            centerX: 0, centerZ: 0, localX: R * 2, localZ: R * 2 };
        localDisguise.colliders = PropLevel.resolveColliders({ rotation: prop.rotation || { y: 0 } }, bounds, def);
        localDisguise.groundRadius = this._groundColliderRadius(localDisguise.colliders, R);

        const player = gameState.players[myId];
        player.disguiseType = localDisguise.type;
        player.disguiseSize = localDisguise.size;
        player.propScale = localDisguise.propScale;
        player.propHeight = localDisguise.propHeight;
        player.propRadius = localDisguise.propRadius;
        player.propRotation = localDisguise.propRotation;
        player.disguiseTexture = localDisguise.propTexture;
    },

    // Radius of the collider piece(s) that sit at ground level (yMin≈0) — the part
    // that actually blocks horizontal movement (a tree's trunk, a rock's body).
    _groundColliderRadius: function(pieces, fallback) {
        let r = 0;
        (pieces || []).forEach(c => {
            if (c.yMin <= 0.2) {
                const pr = c.shape === 'box' ? Math.max(c.hx, c.hz) : c.radius;
                if (pr > r) r = pr;
            }
        });
        return r || fallback;
    },

    clearDisguise: function() {
        localDisguise.type = 'player';
        localDisguise.size = 2;
        localDisguise.propScale = 1;
        localDisguise.propHeight = 2;
        localDisguise.propRadius = 1;
        localDisguise.propRotation = null;
        localDisguise.propTexture = null;
        localDisguise.colliders = null;
        localDisguise.groundRadius = null;

        const player = gameState.players[myId];
        player.disguiseType = 'player';
        player.disguiseSize = 2;
        player.propScale = 1;
        player.propHeight = 2;
        player.propRadius = 1;
        player.propRotation = null;
        player.disguiseTexture = null;
    },

    // Effective movement-collision radius: 1 as a player, else the disguised prop's
    // ground-level radius (slim trunk for a tree), not the full canopy.
    myColliderRadius: function() {
        if (localDisguise.type === 'player') return PropLevel.PLAYER_COLLIDER_RADIUS;
        return localDisguise.groundRadius || (localDisguise.size / 2);
    },

    handleLocalMovement: function() {
        if (!joyActive) {
            touchVector.x = 0;
            touchVector.y = 0;
        }

        let pData = gameState.players[myId];
        if (!pData || pData.isCaught) return;
        if (gameState.phase === 'HIDING' && pData.role === 'Seeker') return;

        // Disguised hiders act as solid props this tick (collide + stand on them).
        this._dynamicProps = this.getDynamicProps();

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

        // Target facing for this tick. Default: keep the current heading (so an
        // idle player doesn't rotate). Moving → face the movement direction.
        let targetRotY = localRotY;
        let length = Math.hypot(moveX, moveZ);
        if (length > 0) {
            moveX = (moveX / length) * moveSpeed;
            moveZ = (moveZ / length) * moveSpeed;
            targetRotY = Math.atan2(moveX, moveZ);   // MOVEMENT heading (PUBG default)
        }

        // Aim-stance: while a seeker is in the post-shot window, face the
        // crosshair/target instead of the movement direction (same convention as
        // the W-forward heading). Retreating then plays the back-walk.
        if (pData.role === 'Seeker' && Network.now() < (pData.shootingUntil || 0)) {
            targetRotY = cameraYaw + Math.PI;
        }

        // Smoothly turn toward the target heading (shortest angular path) instead
        // of snapping — gives the character a natural pivot. Position movement
        // above is unchanged (it follows the instant input direction).
        const TURN_LERP = 0.2;   // per 60Hz tick; higher = snappier
        let dRot = targetRotY - localRotY;
        dRot = Math.atan2(Math.sin(dRot), Math.cos(dRot));   // wrap to [-PI, PI]
        localRotY += dRot * TURN_LERP;
        localRotY = Math.atan2(Math.sin(localRotY), Math.cos(localRotY));   // normalize

        let targetX = localPos.x + moveX;
        let targetZ = localPos.z + moveZ;

        if (targetX < -100) targetX = -100;
        if (targetX > 100) targetX = 100;
        if (targetZ < -100) targetZ = -100;
        if (targetZ > 100) targetZ = 100;

        let myRadius = this.myColliderRadius();

        // Per-axis resolution gives wall-sliding: instead of cancelling the whole
        // move when the combined target is blocked, try each axis on its own so
        // the tangential component still applies and the player slides along the
        // surface rather than sticking. X is committed first, then Z is tested
        // against the updated X to avoid clipping around corners.
        let baseHeight = localDisguise.type === 'player' ? PropLevel.PLAYER_BASE_HEIGHT : localDisguise.size / 2;

        // Each axis: take the direct move if clear; else, while grounded, allow a STEP-UP
        // only when (a) the feet-lifted capsule is clear AND (b) there's actually a higher
        // climbable surface to land on at the target (_stepLandingAt). Both are required:
        // the lift check alone would clear a prop whose short COLLIDER sits below its taller
        // MESH (a rock), committing the move while the seat pass refused to lift you → you
        // walked THROUGH it. Gating on a real landing makes such props block instead. The
        // floorY pass below then seats you on the step (grace matches STEP_HEIGHT). Tall
        // walls (no reachable landing) still block; ramps use the onSlope bypass, not this.
        const canStep = (tx, tz) => isGrounded
            && !this.blockedAt(tx, tz, myRadius, STEP_HEIGHT)
            && this._stepLandingAt(tx, tz, myRadius, baseHeight) > localPos.y + 0.01;
        if (!this.blockedAt(targetX, localPos.z, myRadius) || canStep(targetX, localPos.z)) {
            localPos.x = targetX;
        }
        if (!this.blockedAt(localPos.x, targetZ, myRadius) || canStep(localPos.x, targetZ)) {
            localPos.z = targetZ;
        }

        // Floor under the player = the highest climbable surface it's standing
        // over (and currently on/above), else the world ground. Gravity lands the
        // player on this floor — so you can jump onto rocks/bushes and stand —
        // and walking off the edge drops the floor so you fall again.
        // Floor = highest climbable surface under the player (level props AND
        // disguised hiders, which act like the prop they mimic).
        let floorY = baseHeight;
        for (let i = 0; i < mapProps3D.length; i++) {
            floorY = this._climbFloor(mapProps3D[i], baseHeight, myRadius, floorY);
        }
        const dyn = this._dynamicProps;
        if (dyn) for (let i = 0; i < dyn.length; i++) {
            floorY = this._climbFloor(dyn[i], baseHeight, myRadius, floorY);
        }

        const wasGrounded = isGrounded;
        velocityY += GRAVITY;
        localPos.y += velocityY;
        if (localPos.y <= floorY) {
            localPos.y = floorY;
            // Touched down after being airborne (with real downward speed) → thud.
            if (!isGrounded && velocityY < -0.05) Sound.land();
            velocityY = 0;
            isGrounded = true;
        } else if (wasGrounded && velocityY <= 0 && (localPos.y - floorY) <= GROUND_SNAP) {
            // Walking DOWN a ramp/step: the floor drops faster per tick than gravity, so
            // the naive test would launch the player into a bouncy free-fall (airborne →
            // land → airborne = jerky descent, and it made the cosmetic mesh-lift flicker
            // on/off). If we were grounded, aren't rising (not a jump), and the drop is
            // small (≤ GROUND_SNAP — a ramp step, not a ledge), stick to the surface.
            // Bigger drops (real ledges) exceed GROUND_SNAP and still fall normally.
            localPos.y = floorY;
            velocityY = 0;
            isGrounded = true;
        } else {
            isGrounded = false;
        }

        // Footsteps: emit a scuff at a fixed cadence while actually walking on the
        // ground. Resetting the timer when idle makes the first step after you
        // start moving fire immediately rather than after the interval.
        if (length > 0 && isGrounded) {
            const tnow = Network.now();
            if (tnow - (this._lastStepAt || 0) > 330) {
                this._lastStepAt = tnow;
                this._stepFoot = !this._stepFoot;
                Sound.step(this._stepFoot);
            }
        } else {
            this._lastStepAt = 0;
        }

        // Cosmetic slope nudge (render-only; does NOT affect collision/camera which
        // use localPos). On a tilted ramp the upright character stands at the CENTRE
        // ground contact, so the higher uphill ground pokes up through its lower body.
        // Lift the render mesh by the uphill ground rise across the player's radius so
        // its base clears the slope. Zero on flat ground (all samples equal the feet).
        // Applied only to the local character mesh in updatePlayerMeshTransform.
        //
        // Compute a TARGET, then ease `localMeshLift` toward it — a hard per-tick value
        // popped the mesh when the target jumped (stepping on/off a ramp, or the old
        // grounded/airborne flicker during a bouncy descent, now also fixed by ground-
        // snap above). The lerp makes those transitions smooth.
        let targetLift = 0;
        if (isGrounded) {
            const feet = localPos.y - baseHeight;
            let hi = feet;
            const R = myRadius, pts = [[R,0],[-R,0],[0,R],[0,-R]];
            for (let a = 0; a < pts.length; a++) {
                const sx = localPos.x + pts[a][0], sz = localPos.z + pts[a][1];
                for (let i = 0; i < mapProps3D.length; i++) {
                    const prop = mapProps3D[i];
                    if (!PropLevel.isClimbable(prop)) continue;
                    const pieces = PropLevel.getColliders(prop);
                    for (let j = 0; j < pieces.length; j++) {
                        const c = pieces[j];
                        if (c.shape === 'box' && c.ay && Math.abs(c.ay[1]) <= 0.999) {
                            const sY = c.yMax + 10, t = PropLevel.rayBox(sx, sY, sz, 0, -1, 0, c);
                            // Only the ramp under us (within 1u of the feet), not a distant one.
                            if (isFinite(t)) { const s = sY - t; if (s > hi && s - feet < 1.0) hi = s; }
                        }
                    }
                }
            }
            targetLift = Math.min(hi - feet, 0.6);
        }
        localMeshLift += (targetLift - localMeshLift) * 0.2;
        if (Math.abs(localMeshLift) < 0.001) localMeshLift = 0;   // snap tiny residuals to flat
    },

    // The nearest disguisable prop within reach of the local player, or null.
    // Used both to perform the swap and to label the disguise button.
    findNearestDisguiseProp: function() {
        let nearest = null, nearestDist = Infinity;
        for (let prop of mapProps3D) {
            if (!PropLevel.canDisguiseAs(prop)) continue;
            const center = PropLevel.getPropCenter(prop);
            const dist = Math.hypot(localPos.x - center.x, localPos.z - center.z);
            // Must be standing next to the prop: its surface (radius) + the player's
            // own radius (1, undisguised here) + ~1 unit of grace. The old `radius*2+2`
            // let you disguise from far away (≈ radius+2 beyond the surface).
            const reach = prop.radius + 2;
            if (dist < reach && dist < nearestDist) { nearest = prop; nearestDist = dist; }
        }
        return nearest;
    },

    // True if the local hider is currently disguised as a prop (not its own form).
    isDisguised: function() {
        return localDisguise.type !== 'player';
    },

    // Use the held airdrop power (E key / mobile power button). Only hiders hold a
    // power to activate manually — seekers' powers apply instantly on pickup. The
    // host validates + applies authoritatively; clients ask the host.
    activatePower: function() {
        const pData = gameState.players[myId];
        if (!pData || pData.role !== 'Hider' || pData.isCaught || !pData.heldPower) return;
        if (isHost) Network.handleActivate(myId);
        else Network.sendToHost({ type: 'activatePower' });
    },

    handleDisguiseSwap: function() {
        let pData = gameState.players[myId];
        if (!pData || pData.role !== 'Hider' || pData.isCaught) return;

        // Disguise is locked for a few seconds after being hit (so a revealed
        // hider can't instantly become another prop) — but resetting is always OK.
        const locked = pData.disguiseLockUntil && Network.now() < pData.disguiseLockUntil;
        const nearest = this.findNearestDisguiseProp();
        if (nearest && !locked) {
            // Beside a disguisable prop → disguise as it, OR switch straight to it
            // from another disguise (e.g. rock → tree) without resetting first.
            this.applyDisguiseFromProp(nearest);
        } else if (this.isDisguised()) {
            // Not beside a switchable prop (or locked) → Reset to the default form.
            this.clearDisguise();
        } else {
            return;   // not disguised and no prop to become → no-op
        }

        // Disguising grows the player's collider to the prop's size, so if the
        // hider was touching that prop it now overlaps it (and maybe others).
        // Push the player to the nearest clear spot so it never spawns wedged
        // inside a collider — and never into a different one.
        this._dynamicProps = this.getDynamicProps();   // also avoid other disguised hiders
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
    // `yLift` (default 0) raises the tested capsule by that many units — used by the
    // step-up probe: if the move is blocked at the current feet height but CLEAR with
    // the feet lifted STEP_HEIGHT (the obstacle top is below the raised feet, and the
    // raised body clears any ceiling above the step), it's a mountable step, not a wall.
    blockedAt: function(x, z, myRadius, yLift) {
        yLift = yLift || 0;
        const half = (localDisguise.type === 'player')
            ? PropLevel.PLAYER_BASE_HEIGHT
            : (localDisguise.size / 2);
        const pBottom = localPos.y - half + yLift;
        const pTop = localPos.y + half + yLift;

        for (let i = 0; i < mapProps3D.length; i++) {
            if (this._propBlocks(mapProps3D[i], x, z, myRadius, pBottom, pTop)) return true;
        }
        const dyn = this._dynamicProps;
        if (dyn) for (let i = 0; i < dyn.length; i++) {
            if (this._propBlocks(dyn[i], x, z, myRadius, pBottom, pTop)) return true;
        }
        return false;
    },

    // True if a player circle (myRadius) at (x,z) overlaps any of `prop`'s collider
    // pieces within the player's vertical band. Shared by level props + disguised
    // hiders (dynamic pseudo-props).
    _propBlocks: function(prop, x, z, myRadius, pBottom, pTop) {
        if (!PropLevel.hasCollision(prop)) return false;
        const pieces = PropLevel.getColliders(prop);
        for (let i = 0; i < pieces.length; i++) {
            const c = pieces[i];
            if (!(pBottom < c.yMax && pTop > c.yMin)) continue;   // vertical band
            if (c.shape === 'box') {
                // RAMP support: a TILTED slab's top surface sits BELOW its conservative
                // world-AABB ceiling c.yMax, so a player standing on the slope is inside
                // the band and would be wedged solid. Cast straight down onto the slab —
                // if the player's feet are on/above the actual surface under them, it
                // doesn't block (they're walking on it). Gated to tilted boxes so upright
                // walls/rocks/trees keep the exact validated behaviour (and skip the ray).
                if (Math.abs(c.ay[1]) <= 0.999) {
                    const sY = c.yMax + 10;
                    // Sample the player's centre plus a ring at myRadius AND half-myRadius
                    // (8 compass dirs each): at the ramp's LOW leading edge the centre
                    // column is still just off the footprint (the centre ray misses) while
                    // the player's body already overlaps the wedge, so a coarse test would
                    // block you from ever stepping on. The half-radius samples catch the low
                    // edge before the slope has risen out of reach. If any sample finds
                    // slope surface at/below the feet, you're mounting/walking it.
                    //
                    // CREST tolerance = STEP_HEIGHT (not 0.3): near the top the surface
                    // rises faster per tick than a tight grace, and the leading samples
                    // have already walked off the slab's top edge (ray misses), so only
                    // the high trailing samples remain — a 0.3 grace lets them fall just
                    // out of reach and wedges you at the very top edge. STEP_HEIGHT widens
                    // the window so you crest smoothly (same const that governs step-up).
                    const r = myRadius, h = myRadius * 0.5, d = myRadius * 0.7071, e = h * 0.7071;
                    const offs = [[0, 0],
                        [r, 0], [-r, 0], [0, r], [0, -r], [d, d], [d, -d], [-d, d], [-d, -d],
                        [h, 0], [-h, 0], [0, h], [0, -h], [e, e], [e, -e], [-e, e], [-e, -e]];
                    let onSlope = false;
                    for (let k = 0; k < offs.length; k++) {
                        const td = PropLevel.rayBox(x + offs[k][0], sY, z + offs[k][1], 0, -1, 0, c);
                        if (isFinite(td) && pBottom >= (sY - td) - STEP_HEIGHT) { onSlope = true; break; }
                    }
                    if (onSlope) continue;
                }
                // The player is a vertical capsule (circle of myRadius over the band).
                // Sample its column where it overlaps the box's world-AABB band and
                // test each point against the ORIENTED box; blocked if any sample is
                // within myRadius. Upright boxes are band-constant, so one sample
                // already matches the old footprint test — extra samples only matter
                // for tilted slabs.
                const y0 = Math.max(pBottom, c.yMin), y1 = Math.min(pTop, c.yMax);
                const r2 = myRadius * myRadius;
                const N = 5;
                for (let k = 0; k <= N; k++) {
                    const sy = y0 + (y1 - y0) * (k / N);
                    if (PropLevel.pointBoxDist2(x, sy, z, c) < r2) return true;
                }
                continue;
            }
            if (Math.hypot(x - c.x, z - c.z) < (myRadius + c.radius)) return true;
        }
        return false;
    },

    // If the player is standing on/above `prop`'s top and over its footprint, return
    // that surface height (vs the current best). Shared by level props + disguised
    // hiders. Mirrors the climb test footprint logic.
    // (px,pz,py) default to the player's live position, but may be passed to query the
    // floor at a PROSPECTIVE spot (used by the step-up landing check) without moving.
    _climbFloor: function(prop, baseHeight, myRadius, best, px, pz, py) {
        if (px === undefined) { px = localPos.x; pz = localPos.z; py = localPos.y; }
        if (!PropLevel.isClimbable(prop)) return best;
        const pieces = PropLevel.getColliders(prop);
        const propTop = PropLevel.getPropTop(prop) + baseHeight;
        for (let i = 0; i < pieces.length; i++) {
            const c = pieces[i];
            if (c.shape === 'box') {
                if (Math.abs(c.ay[1]) > 0.999) {
                    // UPRIGHT box. Support wherever the box would BLOCK you — the SAME
                    // rounded footprint _propBlocks uses (pointBoxDist2, corners included)
                    // — and stand at the prop's MESH top (propTop = getPropTop), exactly
                    // like the cylinder branch, NOT the box collider's own top. A box's
                    // band ceiling is its CONSERVATIVE world-AABB top c.yMax, a hair ABOVE
                    // its ray-hit top for any micro-tilted box, so standing on the collider
                    // top left the feet inside the band (pBottom < c.yMax) → blocked every
                    // direction (the rock/tree "sink in and get stuck"). The mesh top clears
                    // c.yMax with margin → flush, free to move.
                    if (PropLevel.pointBoxDist2(px, c.yMax, pz, c) < myRadius * myRadius) {
                        if (py >= propTop - STEP_HEIGHT && propTop > best) best = propTop;
                    }
                } else {
                    // TILTED box (ramp): seat on the ACTUAL slope under the player so you
                    // can walk UP it. PREFER the centre ray (feet meet the slope right
                    // under you — no hover). But the instant the player's centre crosses
                    // the slab's TOP edge that single ray MISSES, and floorY collapses to
                    // the ground → you un-seat at the crest → fall → lose isGrounded (which
                    // also disables step-up) → re-enter the slab lower → repeat: the player
                    // oscillates and looks "stuck" at the ramp's top edge. So if the centre
                    // misses, fall back to the HIGHEST reachable slope point under the
                    // footprint (the same 17-pt ring the _propBlocks onSlope bypass uses) —
                    // a trailing sample stays on the slab through the crossover and holds
                    // you at the top edge, so you crest cleanly. Grace = STEP_HEIGHT, so
                    // blocking (_propBlocks) and seating agree tick-for-tick.
                    const sY = c.yMax + 10;
                    let surf = NaN;
                    const tc = PropLevel.rayBox(px, sY, pz, 0, -1, 0, c);
                    if (isFinite(tc)) {
                        surf = (sY - tc) + baseHeight;
                    } else {
                        const r = myRadius, h = myRadius * 0.5, d = myRadius * 0.7071, e = h * 0.7071;
                        const offs = [
                            [r, 0], [-r, 0], [0, r], [0, -r], [d, d], [d, -d], [-d, d], [-d, -d],
                            [h, 0], [-h, 0], [0, h], [0, -h], [e, e], [e, -e], [-e, e], [-e, -e]];
                        let hi = -Infinity;
                        for (let k = 0; k < offs.length; k++) {
                            const t = PropLevel.rayBox(px + offs[k][0], sY, pz + offs[k][1], 0, -1, 0, c);
                            if (isFinite(t)) { const s = (sY - t) + baseHeight; if (s > hi) hi = s; }
                        }
                        if (hi > -Infinity) surf = hi;
                    }
                    if (surf === surf && py >= surf - STEP_HEIGHT && surf > best) best = surf;
                }
            } else if (Math.hypot(px - c.x, pz - c.z) < c.radius + myRadius) {
                if (py >= propTop - STEP_HEIGHT && propTop > best) best = propTop;
            }
        }
        return best;
    },

    // Highest CLIMBABLE surface the player could stand on at a PROSPECTIVE (x,z),
    // evaluated from the player's current height (same reach gate as _climbFloor).
    // Used to gate step-up: you may only step onto something you can actually land on.
    // Without this, a prop whose solid COLLIDER is shorter than its visual MESH (e.g.
    // a rock — collider ~0.8u, mesh taller) let the lifted blockedAt clear the collider
    // so the move committed, but _climbFloor's seat gate (keyed to the taller mesh top)
    // then refused to lift you → you walked THROUGH the rock. Requiring a real landing
    // makes such props block instead of passing through.
    _stepLandingAt: function(x, z, myRadius, baseHeight) {
        let f = baseHeight;                      // world ground
        for (let i = 0; i < mapProps3D.length; i++) {
            f = this._climbFloor(mapProps3D[i], baseHeight, myRadius, f, x, z, localPos.y);
        }
        const dyn = this._dynamicProps;
        if (dyn) for (let i = 0; i < dyn.length; i++) {
            f = this._climbFloor(dyn[i], baseHeight, myRadius, f, x, z, localPos.y);
        }
        return f;
    },

    // Disguised hiders, as solid "pseudo-props" the local player can collide with and
    // stand on (they behave like the prop they're mimicking). Excludes self + caught.
    // Rebuilt each movement tick into this._dynamicProps.
    getDynamicProps: function() {
        const out = [];
        if (typeof gameState === 'undefined' || !gameState.players) return out;
        // Use the SAME interpolated render position the meshes use. On a CLIENT,
        // gameState.players[id].x/z for remote players is only their spawn point
        // (snapshots are buffered, never written back — Network 'snapshot' case),
        // so reading it would anchor a disguised hider's collider/gizmo at spawn,
        // far from where they actually appear. Sampling the snapshot buffer makes
        // collision + the dev gizmo track the rendered position. On the HOST the
        // buffer is empty → sampled is null → we fall back to the authoritative x/z.
        const sampled = (typeof Network !== 'undefined' && Network.sampleSnapshot)
            ? Network.sampleSnapshot(Network.now() - Network.INTERP_DELAY) : null;
        for (const id in gameState.players) {
            if (id === myId) continue;
            const p = gameState.players[id];
            if (!p || p.isCaught) continue;
            if (!p.disguiseType || p.disguiseType === 'player') continue;
            const def = PropLevel.getPrefab(p.disguiseType);
            const R = p.propRadius || (p.disguiseSize ? p.disguiseSize / 2 : 1);
            const H = p.propHeight || 2;
            const s = sampled && sampled[id];
            const px = s ? s.x : p.x;
            const pz = s ? s.z : p.z;
            const bounds = { radius: R, height: H, bottomY: 0, topY: H,
                centerX: px, centerZ: pz, localX: R * 2, localZ: R * 2 };
            const pieces = PropLevel.resolveColliders({ rotation: p.propRotation || { y: 0 } }, bounds, def);
            out.push({
                model: p.disguiseType, x: px, z: pz, centerX: px, centerZ: pz,
                radius: R, height: H, bottomY: 0, topY: H, colliders: pieces,
                collision: def.collision, climbable: def.climbable
            });
        }
        return out;
    },

    // Move the local player out of any collider it currently overlaps to the
    // nearest free spot, scanning outward in rings. Because blockedAt() tests
    // EVERY prop's collider pieces, the chosen spot is clear of all of them, so
    // the player is never pushed from one collider into another. No-op if clear.
    resolveOverlap: function() {
        const myRadius = this.myColliderRadius();
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
