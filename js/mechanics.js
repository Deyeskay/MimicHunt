const Mechanics = {
    initInputs: function() {
        window.addEventListener('keydown', (e) => {
            keys[e.key.toLowerCase()] = true;
            if (e.key.toLowerCase() === 'f') this.handleDisguiseSwap();
            if (e.key.toLowerCase() === 'e') this.activatePower();   // use held airdrop power (hider)
            if (e.key.toLowerCase() === 'g') Level.setDeveloper(!developer);   // dev: toggle collider gizmos
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
                if (shootFireTimer === null) shootFireTimer = setInterval(() => this.fireShot(), 100);
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
        localDisguise.colliders = null;
        localDisguise.groundRadius = null;

        const player = gameState.players[myId];
        player.disguiseType = 'player';
        player.disguiseSize = 2;
        player.propScale = 1;
        player.propHeight = 2;
        player.propRadius = 1;
        player.propRotation = null;
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

        velocityY += GRAVITY;
        localPos.y += velocityY;
        if (localPos.y <= floorY) {
            localPos.y = floorY;
            // Touched down after being airborne (with real downward speed) → thud.
            if (!isGrounded && velocityY < -0.05) Sound.land();
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

        if (this.isDisguised()) {
            // Already disguised → Reset back to the default form.
            this.clearDisguise();
        } else {
            // Not disguised → disguise as the nearest prop (if any & not locked).
            const nearest = this.findNearestDisguiseProp();
            if (!nearest) return;   // not near a prop → button is disabled, no-op
            // Disguise is locked for a few seconds after being hit (so a revealed
            // hider can't instantly become another prop).
            if (pData.disguiseLockUntil && Network.now() < pData.disguiseLockUntil) return;
            this.applyDisguiseFromProp(nearest);
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
    blockedAt: function(x, z, myRadius) {
        const half = (localDisguise.type === 'player')
            ? PropLevel.PLAYER_BASE_HEIGHT
            : (localDisguise.size / 2);
        const pBottom = localPos.y - half;
        const pTop = localPos.y + half;

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
                    const r = myRadius, h = myRadius * 0.5, d = myRadius * 0.7071, e = h * 0.7071;
                    const offs = [[0, 0],
                        [r, 0], [-r, 0], [0, r], [0, -r], [d, d], [d, -d], [-d, d], [-d, -d],
                        [h, 0], [-h, 0], [0, h], [0, -h], [e, e], [e, -e], [-e, e], [-e, -e]];
                    let onSlope = false;
                    for (let k = 0; k < offs.length; k++) {
                        const td = PropLevel.rayBox(x + offs[k][0], sY, z + offs[k][1], 0, -1, 0, c);
                        if (isFinite(td) && pBottom >= (sY - td) - 0.3) { onSlope = true; break; }
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
    _climbFloor: function(prop, baseHeight, myRadius, best) {
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
                    if (PropLevel.pointBoxDist2(localPos.x, c.yMax, localPos.z, c) < myRadius * myRadius) {
                        if (localPos.y >= propTop - 0.3 && propTop > best) best = propTop;
                    }
                } else {
                    // TILTED box (ramp): stand on the ACTUAL slope under the player so you
                    // can walk UP it — cast straight down onto the slab and use that point.
                    // Paired with the ramp bypass in _propBlocks so you're not wedged in
                    // the AABB band while on the slope.
                    const sY = c.yMax + 10;
                    const t = PropLevel.rayBox(localPos.x, sY, localPos.z, 0, -1, 0, c);
                    if (isFinite(t)) {
                        const surf = (sY - t) + baseHeight;
                        if (localPos.y >= surf - 0.3 && surf > best) best = surf;
                    }
                }
            } else if (Math.hypot(localPos.x - c.x, localPos.z - c.z) < c.radius + myRadius) {
                if (localPos.y >= propTop - 0.3 && propTop > best) best = propTop;
            }
        }
        return best;
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
