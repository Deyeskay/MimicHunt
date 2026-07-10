/*=====================================================================
  TUTORIAL / TRAINING MODE  (js/tutorial.js)
  ---------------------------------------------------------------------
  An interactive, PUBG/Fortnite-style onboarding flow. It runs as a SOLO,
  host-only match (the player is already the auto-hosted host in the lobby),
  drops them into "Rainbow Woods", and teaches every mechanic by making them
  PERFORM the action — guided by a dim/spotlight overlay, a bouncing arrow,
  and a coach dialogue box (see #tutorial-layer in index.html).

  How it works
    - Tutorial.start() flips gameState.training=true (host loops stop their
      auto-pacing — see js/network.js timer loop + Mechanics.checkWinConditions),
      forces the level + phase HUNTING, and walks an ordered `steps` list.
    - Each step = { objective, advance, onEnter, check, onExit, spot }.
        advance 'button' → the player reads, then clicks Next.
        advance 'auto'   → poll check() every frame; true → next step.
        spot()           → returns a live CSS selector to spotlight (re-evaluated
                           each frame so guidance follows the player through
                           ☰ → Controls → slider, etc.).
    - Practice targets are non-AI "dummy" hider records injected into
      gameState.players (the render loop auto-builds their meshes; combat/scan
      treat them as real hiders). Effects that must land ON the player
      (disguise-lock, shield, invis) are forced on cue.
    - Tutorial.update(dt) is pumped from the main animate() loop (js/app.js).

  Nothing here is networked — broadcast() to zero peers is a no-op.
=====================================================================*/
const Tutorial = {
    active: false,
    stepIndex: 0,
    steps: [],
    bots: {},           // id -> true, for injected dummy records
    _spotSel: null,     // current spotlight selector (string) or null
    _spotSoft: false,   // soft spotlight (no full-screen dim)
    _els: null,
    _wired: false,
    _savedCamSens: 0,
    _savedShootSens: 0,
    _sawLayout: false,
    _hitApplied: false,
    _hitAt: 0,

    /*----------------------------------------------------------------
      Entry / lifecycle
    ----------------------------------------------------------------*/
    // Offer the tutorial to a brand-new player (called once after the lobby is
    // up). Skipped if they've seen/finished it before (localStorage flag).
    maybeAutoPrompt() {
        try { if (localStorage.getItem('hnh_tutorial_done')) return; } catch (e) {}
        if (typeof UI === 'undefined' || !UI.showConfirm) return;
        // Give the auto-hosted lobby a beat to finish opening its peer.
        setTimeout(() => {
            if (this.active || gameState.phase !== 'LOBBY') return;
            UI.showConfirm('👋 New here?',
                'Take a quick interactive training run to learn the ropes?',
                () => this.start(), 'Start Training');
        }, 900);
    },

    start() {
        if (this.active) return;
        // Solo training rides the auto-hosted lobby: we must be the host with a
        // live player record sitting in the lobby.
        if (!isHost || !gameState.players[myId] || gameState.phase !== 'LOBBY') {
            if (typeof UI !== 'undefined' && UI.toast) UI.toast('Training needs the lobby — try again in a moment.');
            return;
        }
        this._cache();
        this._wire();

        this.active = true;
        gameState.training = true;
        gameState.levelName = 'Rainbow Woods';

        // Start as the HUNTER (Seeker) for the first track.
        const me = gameState.players[myId];
        me.role = 'Seeker';
        me.isReady = true;

        // Reuse the real match-start path (loads the level, spawns us, resets
        // combat, transitions to the game view). It sets phase HIDING; we
        // immediately promote to HUNTING so controls are live (no seeker blind).
        Network.startGameBroadcast();
        gameState.phase = 'HUNTING';
        gameState.timer = 999;
        gameState.huntStartT = Network.now();

        this._els.layer.style.display = 'block';
        this.steps = this._buildSteps();
        this.enterStep(0);
    },

    finish() { this._teardown(true); },
    skip()   { this._teardown(false); },

    _teardown(completed) {
        if (!this.active) return;
        this.active = false;
        this.despawnAllBots();
        // Hide overlay chrome.
        if (this._els) {
            this._els.layer.style.display = 'none';
            this._els.ring.style.display = 'none';
            this._els.arrow.style.display = 'none';
            this._els.dlg.style.display = 'none';
        }
        this._spotSel = null;
        if (typeof UI !== 'undefined') UI.clearObjective();
        try { localStorage.setItem('hnh_tutorial_done', '1'); } catch (e) {}

        // Reset the round in place and drop back to the lobby (bots already gone,
        // so returnToLobby won't turn a dummy into a lobby model).
        gameState.training = false;
        if (typeof Network !== 'undefined' && Network.returnToLobby) Network.returnToLobby();
    },

    /*----------------------------------------------------------------
      Step machine
    ----------------------------------------------------------------*/
    enterStep(i) {
        this.stepIndex = i;
        const step = this.steps[i];
        if (!step) { this.finish(); return; }
        // Per-step scratch flags reset.
        this._sawLayout = false;
        this._hitApplied = false;
        // Objective pill (tutorial owns it — UI.updateObjective is gated off in training).
        if (typeof UI !== 'undefined') {
            if (step.objective) UI.objective('🎓 ' + step.objective);
            else UI.clearObjective();
        }
        this._els.next.textContent = 'Next ▶';   // finish step overrides in its onEnter
        if (step.onEnter) step.onEnter.call(this);
        // Next button visibility: shown only for 'button' steps.
        this._els.next.style.display = (step.advance === 'button') ? '' : 'none';
        this._els.dlg.classList.toggle('tut-await', step.advance === 'auto');
        this._els.step.textContent = (i + 1) + ' / ' + this.steps.length;
    },

    nextStep() {
        const step = this.steps[this.stepIndex];
        if (step && step.onExit) step.onExit.call(this);
        if (this.stepIndex + 1 >= this.steps.length) { this.finish(); return; }
        this.enterStep(this.stepIndex + 1);
    },

    // Pumped every frame from animate() while active.
    update(dt) {
        if (!this.active) return;
        const step = this.steps[this.stepIndex];
        if (!step) return;
        // Live spotlight target (follows the player through menus).
        if (step.spot) {
            const sel = step.spot.call(this);
            this._applySpotlight(sel, !!step.soft);
        }
        this._reposition();
        // Auto-advance steps poll their objective check.
        if (step.advance === 'auto' && step.check && step.check.call(this)) {
            this.nextStep();
        }
    },

    /*----------------------------------------------------------------
      Coachmark rendering
    ----------------------------------------------------------------*/
    _cache() {
        if (this._els) return;
        const g = id => document.getElementById(id);
        this._els = {
            layer: g('tutorial-layer'), dim: g('tut-dim'), ring: g('tut-ring'),
            arrow: g('tut-arrow'), dlg: g('tut-dialogue'), title: g('tut-dlg-title'),
            body: g('tut-dlg-body'), step: g('tut-dlg-step'),
            next: g('tut-next'), skip: g('tut-skip')
        };
    },
    _wire() {
        if (this._wired) return;
        this._wired = true;
        this._els.next.addEventListener('click', () => {
            const step = this.steps[this.stepIndex];
            if (step && step.advance === 'button') this.nextStep();
        });
        this._els.skip.addEventListener('click', () => this.skip());
    },

    // Set the dialogue box content. body accepts HTML (kbd/bold).
    dialogue(title, bodyHtml) {
        this._els.title.textContent = title;
        this._els.body.innerHTML = bodyHtml;
        this._els.dlg.style.display = 'block';
    },

    // Record the intended spotlight; actual positioning happens in _reposition().
    _applySpotlight(sel, soft) {
        this._spotSel = sel || null;
        this._spotSoft = !!soft;
    },
    spotlight(sel, soft) { this._applySpotlight(sel, soft); this._reposition(); },
    noSpotlight() { this._spotSel = null; this._reposition(); },

    // Position ring + arrow over the current target each frame (tracks moving /
    // just-opened elements). Falls back to a plain dim when there's no target.
    _reposition() {
        const els = this._els;
        if (!els) return;
        let el = this._spotSel ? document.querySelector(this._spotSel) : null;
        let rect = el ? el.getBoundingClientRect() : null;
        const visible = rect && rect.width > 4 && rect.height > 4 &&
            rect.bottom > 0 && rect.right > 0 &&
            rect.top < innerHeight && rect.left < innerWidth;

        if (this._spotSel && visible) {
            const pad = 8;
            const x = rect.left - pad, y = rect.top - pad;
            const w = rect.width + pad * 2, h = rect.height + pad * 2;
            els.ring.style.left = x + 'px';
            els.ring.style.top = y + 'px';
            els.ring.style.width = w + 'px';
            els.ring.style.height = h + 'px';
            els.ring.classList.toggle('soft', this._spotSoft);
            els.ring.style.display = 'block';
            // Soft spotlight keeps the play view bright; hard one dims via the ring.
            els.dim.style.opacity = this._spotSoft ? '1' : '0';
            // Arrow: to the LEFT pointing right, unless the target hugs the left edge.
            const onLeftEdge = rect.left < 96;
            els.arrow.style.display = 'block';
            if (onLeftEdge) {
                els.arrow.style.setProperty('--ar', '180deg');
                els.arrow.style.left = (rect.right + pad + 6) + 'px';
                els.arrow.style.top = (rect.top + rect.height / 2 - 16) + 'px';
            } else {
                els.arrow.style.setProperty('--ar', '0deg');
                els.arrow.style.left = (x - 40) + 'px';
                els.arrow.style.top = (rect.top + rect.height / 2 - 16) + 'px';
            }
        } else {
            // No target → plain full-screen dim, no ring/arrow.
            els.ring.style.display = 'none';
            els.arrow.style.display = 'none';
            els.dim.style.opacity = this._spotSel ? '1' : '1';
        }
    },

    /*----------------------------------------------------------------
      World helpers
    ----------------------------------------------------------------*/
    // Unit forward vector from the current camera yaw (matches move(): W = (-sin,-cos)).
    forward() { return { x: -Math.sin(cameraYaw), z: -Math.cos(cameraYaw) }; },

    // Player's feet Y (ground plane the player stands on).
    feetY() { return localPos.y - PropLevel.PLAYER_BASE_HEIGHT; },

    // Point the camera yaw at a world XZ so the crosshair roughly frames it.
    facePoint(x, z) {
        const dx = x - localPos.x, dz = z - localPos.z;
        // forward (-sin,-cos) should align with (dx,dz) → yaw = atan2(-dx,-dz).
        cameraYaw = Math.atan2(-dx, -dz);
    },

    // First disguisable prop in the level (template for disguised dummies + a
    // place to teach disguising).
    findDisguisableProp() {
        if (!mapProps3D) return null;
        for (const p of mapProps3D) if (PropLevel.canDisguiseAs(p)) return p;
        return null;
    },

    // Move the local player next to a prop (within disguise reach) and face it.
    placePlayerNearProp(prop, dist) {
        const c = PropLevel.getPropCenter(prop);
        const ang = Math.random() * Math.PI * 2;
        const d = (dist != null) ? dist : (prop.radius + 1.2);
        const px = c.x + Math.cos(ang) * d, pz = c.z + Math.sin(ang) * d;
        localPos.x = px; localPos.z = pz;
        const me = gameState.players[myId];
        me.x = px; me.z = pz;
        this.facePoint(c.x, c.z);
    },

    /*----------------------------------------------------------------
      Dummy targets
    ----------------------------------------------------------------*/
    // Inject a non-AI hider record. opts: { x, z, disguise:boolean, name }.
    // Returns the bot id. The render loop builds its mesh from the record; its
    // position round-trips through the snapshot buffer, so setting x/y/z is enough.
    spawnDummy(key, opts) {
        opts = opts || {};
        const id = TUTORIAL_BOT_PREFIX + key;
        // Build a full, valid hider record (createPlayer seeds every field), then
        // override the placement.
        const rec = Network.createPlayer('Hider', [], opts.name || 'Target');
        rec.isReady = true;

        if (opts.disguise) {
            const t = this.findDisguisableProp();
            if (t) {
                rec.disguiseType = t.model;
                rec.propRadius = t.radius;
                rec.propHeight = t.height;
                rec.disguiseSize = (t.radius || 1) * 2;
                rec.propScale = (t.scale != null) ? t.scale : 1;
                rec.propRotation = t.rotation || null;
                rec.disguiseTexture = t.texture || null;
            }
        }
        const base = PropLevel.getDisguiseBaseHeight(rec);
        const feet = this.feetY();
        rec.x = (opts.x != null) ? opts.x : localPos.x;
        rec.z = (opts.z != null) ? opts.z : localPos.z;
        rec.y = feet + base;
        // Face the player.
        rec.rotY = Math.atan2(localPos.x - rec.x, localPos.z - rec.z);

        gameState.players[id] = rec;
        this.bots[id] = true;
        return id;
    },

    // Spawn a dummy a fixed distance straight ahead of the player (so the
    // crosshair already frames it), returning its id.
    spawnDummyAhead(key, dist, opts) {
        opts = opts || {};
        const f = this.forward();
        const d = dist || 8;
        opts.x = localPos.x + f.x * d;
        opts.z = localPos.z + f.z * d;
        return this.spawnDummy(key, opts);
    },

    despawnDummy(id) {
        if (gameState.players[id]) delete gameState.players[id];
        delete this.bots[id];
        // Mesh is auto-removed on the next render tick (level.js prunes meshes
        // whose player record is gone).
    },
    despawnAllBots() {
        for (const id in this.bots) { if (gameState.players[id]) delete gameState.players[id]; }
        this.bots = {};
    },
    bot(key) { return gameState.players[TUTORIAL_BOT_PREFIX + key]; },

    // Drop a beam at a specific spot (spawnBeam() picks a random point, so we
    // replicate its guts to place it under the player's nose for the pickup demo).
    dropBeamAt(kind, x, z, armMs) {
        const N = Network;
        if (!N._beams) N._beams = [];
        const b = { id: ++N._beamSeq, kind: kind, x: x, z: z,
                    spawnAt: N.now(), armMs: armMs || BEAM_ARM_MS };
        N._beams.push(b);
        if (typeof Level !== 'undefined' && Level.spawnBeam) Level.spawnBeam(b.id, kind, x, z, b.armMs);
        if (typeof Sound !== 'undefined' && Sound.beam) Sound.beam(kind);
        return b.id;
    },

    /*----------------------------------------------------------------
      Role switch (Hunter → Hider) for the second track
    ----------------------------------------------------------------*/
    switchToHider() {
        const me = gameState.players[myId];
        me.role = 'Hider';
        me.color = 0x2ed573;
        me.health = HIDER_MAX_HP;
        me.isCaught = false;
        me.revealedUntil = 0; me.disguiseLockUntil = 0;
        me.heldPower = null; me.invisUntil = 0; me.invisTotalMs = 0; me.shieldArmed = false;
        // Reset disguise state on the record + local mirror.
        if (typeof Mechanics !== 'undefined' && Mechanics.clearDisguise) Mechanics.clearDisguise();
        // Force a mesh rebuild so the hider rig (player.glb) replaces the hunter rig.
        if (typeof playerMeshes !== 'undefined' && playerMeshes[myId]) {
            scene.remove(playerMeshes[myId]);
            delete playerMeshes[myId];
        }
    },

    /*----------------------------------------------------------------
      The step list
    ----------------------------------------------------------------*/
    _buildSteps() {
        const T = this;
        const K = s => '<kbd>' + s + '</kbd>';
        return [
            // 0 — Intro
            {
                advance: 'button', objective: 'Welcome to training',
                onEnter() {
                    T.noSpotlight();
                    T.dialogue('🦝 Welcome, recruit!',
                        'This is <b>Rainbow Woods</b>. I\'ll teach you everything by having you <b>do</b> it — settings first, then how to <b>hunt</b>, then how to <b>hide</b>. Tap <b>Next</b> to begin.');
                }
            },

            // 1 — Sensitivity
            {
                advance: 'auto', objective: 'Adjust your sensitivity',
                spot() {
                    if (T._shown('controls-panel')) return '#ctl-sensitivity';
                    if (T._shown('game-menu')) return '#btn-controls';
                    return '#btn-leave';
                },
                onEnter() {
                    this._savedCamSens = GAME_SETTINGS.mouseSensitivity;
                    this._savedShootSens = GAME_SETTINGS.shootDragSensitivity;
                    T.dialogue('🎚 Aim feel',
                        'Open the menu (the <b>☰</b> button), choose <b>Controls</b>, then drag the <b>Camera</b> or <b>Shoot Sensitivity</b> slider to a value you like. Change one to continue.');
                },
                check() {
                    return Math.abs(GAME_SETTINGS.mouseSensitivity - this._savedCamSens) > 1e-9 ||
                           Math.abs(GAME_SETTINGS.shootDragSensitivity - this._savedShootSens) > 1e-9;
                }
            },

            // 2 — Edit Layout
            {
                advance: 'auto', objective: 'Edit your control layout',
                spot() {
                    if (typeof isEditingLayout !== 'undefined' && isEditingLayout)
                        return '#btn-layout-save';
                    if (T._shown('game-menu')) return '#btn-edit-layout';
                    return '#btn-leave';
                },
                onEnter() {
                    this._sawLayout = false;
                    T.dialogue('✥ Your HUD, your rules',
                        'Open <b>☰ → Edit Layout</b> to drag your on-screen buttons wherever they feel best, then <b>Save</b> (or Cancel). Open it once to continue.');
                },
                check() {
                    if (typeof isEditingLayout !== 'undefined' && isEditingLayout) this._sawLayout = true;
                    return this._sawLayout && !(typeof isEditingLayout !== 'undefined' && isEditingLayout);
                }
            },

            // 3 — Beams explainer
            {
                advance: 'button', objective: 'Learn the airdrop beams',
                onEnter() {
                    T.noSpotlight();
                    T.dialogue('✨ Airdrop beams',
                        'During a hunt, beams fall from the sky:<br>• <b>🟡 Gold beam</b> — grants a <b>power</b> (both roles).<br>• <b>🟣 Purple beam</b> — drops a <b>key</b> that only <b>Hiders</b> can grab (3 keys at an exit = Hiders win). Walk into a beam to collect it.');
                }
            },

            // 4 — Hunter intro
            {
                advance: 'button', objective: 'Play as the HUNTER',
                onEnter() {
                    T.noSpotlight();
                    const me = gameState.players[myId];
                    me.role = 'Seeker'; me.color = 0xff4757; me.isCaught = false;
                    T.dialogue('🔦 You are the Hunter',
                        'Hunters fire <b>energy pulses</b> to eliminate hiders. Your crosshair is centre-screen. Let\'s take some shots.');
                }
            },

            // 5 — Hunter obj1: shoot a hider
            {
                advance: 'auto', objective: 'Shoot the hider',
                onEnter() {
                    T.noSpotlight();
                    T.despawnDummy(TUTORIAL_BOT_PREFIX + 'h1');
                    T.spawnDummyAhead('h1', 8, { disguise: false });
                    T.dialogue('🎯 Take the shot',
                        'A hider is standing right ahead. Centre your crosshair on it and <b>' +
                        (GAME_SETTINGS.showMobileControls ? 'tap SHOOT' : 'left-click') +
                        '</b> to fire. Land one hit.');
                },
                check() { const b = T.bot('h1'); return b && b.health < HIDER_MAX_HP; },
                onExit() { T.despawnDummy(TUTORIAL_BOT_PREFIX + 'h1'); }
            },

            // 6 — Hunter obj2: shoot a DISGUISED hider (breaks disguise)
            {
                advance: 'auto', objective: 'Break a disguise',
                onEnter() {
                    T.noSpotlight();
                    T.despawnDummy(TUTORIAL_BOT_PREFIX + 'h2');
                    T.spawnDummyAhead('h2', 8, { disguise: true });
                    T.dialogue('🥸 Not a real prop',
                        'That "prop" ahead is a <b>disguised hider</b>. Shoot it — a successful hit <b>breaks their disguise</b> (and locks them out of re-disguising for 5s), forcing them back to their real body.');
                },
                check() { const b = T.bot('h2'); return b && b.disguiseType === 'player'; },
                onExit() {
                    T.dialogue('💥 Disguise broken!',
                        'See — the hit forced them out of the prop. Now you\'d chase and finish them.');
                    T.despawnDummy(TUTORIAL_BOT_PREFIX + 'h2');
                }
            },

            // 7 — Hunter power: SCAN
            {
                advance: 'button', objective: 'Hunter power: Scan',
                onEnter() {
                    T.noSpotlight();
                    T.despawnDummy(TUTORIAL_BOT_PREFIX + 'hp');
                    T.spawnDummyAhead('hp', 16, { disguise: true });
                    Network.grantPower(myId, 'gold', 'scan');
                    T.dialogue('🛰 Power 1 — SCAN',
                        'From a <b>gold beam</b> a Hunter can get <b>Scan</b>: for 15s every nearby hider glows as a see-through silhouette — <b>even through walls and disguises</b>. Look at the hider ahead. Tap Next.');
                },
                onExit() { T.despawnDummy(TUTORIAL_BOT_PREFIX + 'hp'); }
            },

            // 8 — Hunter power: JAMMER
            {
                advance: 'button', objective: 'Hunter power: Jammer',
                onEnter() {
                    T.noSpotlight();
                    T.despawnDummy(TUTORIAL_BOT_PREFIX + 'hp');
                    T.spawnDummyAhead('hp', 8, { disguise: false });
                    Network.grantPower(myId, 'gold', 'jammer');
                    T.dialogue('📡 Power 2 — JAMMER',
                        '<b>Jammer</b> locks every undisguised hider out of disguising for 15s — catch them in the open with no escape into a prop. Tap Next.');
                },
                onExit() { T.despawnDummy(TUTORIAL_BOT_PREFIX + 'hp'); }
            },

            // 9 — Hunter power: KILL
            {
                advance: 'auto', objective: 'Hunter power: One-Shot Kill',
                onEnter() {
                    T.noSpotlight();
                    T.despawnDummy(TUTORIAL_BOT_PREFIX + 'hk');
                    T.spawnDummyAhead('hk', 8, { disguise: false });
                    Network.grantPower(myId, 'gold', 'kill');
                    T.dialogue('☠ Power 3 — ONE-SHOT KILL',
                        'For 15s your next hits are <b>instant kills</b> — no chip damage. Eliminate the hider ahead with a single shot.');
                },
                check() { const b = T.bot('hk'); return !b || b.isCaught; },
                onExit() { T.despawnDummy(TUTORIAL_BOT_PREFIX + 'hk'); }
            },

            // 10 — Switch to HIDER
            {
                advance: 'button', objective: 'Now play as the HIDER',
                onEnter() {
                    T.noSpotlight();
                    T.switchToHider();
                    const prop = T.findDisguisableProp();
                    if (prop) T.placePlayerNearProp(prop, prop.radius + 1.2);
                    T.dialogue('🌳 You are the Hider',
                        'Hiders blend in as level props and survive the hunt. I\'ve moved you next to a prop you can copy. Tap Next.');
                }
            },

            // 11 — Hider obj1: disguise
            {
                advance: 'auto', objective: 'Disguise as the prop',
                soft: true,
                spot() {
                    if (T._shown('disguise-hint')) return '#disguise-hint';
                    return '#btn-action-disguise';
                },
                onEnter() {
                    const prop = T.findDisguisableProp();
                    if (prop) T.placePlayerNearProp(prop, prop.radius + 1.2);
                    T.dialogue('🥸 Blend in',
                        'Stand beside a prop and press ' + K('F') + ' (or the disguise button) to <b>become</b> it. Do it now.');
                },
                check() { return Mechanics.isDisguised(); }
            },

            // 12 — Hider obj2: un-disguise / reset
            {
                advance: 'auto', objective: 'Reset your disguise',
                soft: true, spot() { return '#btn-action-disguise'; },
                onEnter() {
                    T.dialogue('↺ Drop the disguise',
                        'Press ' + K('F') + ' again while away from a prop (or the <b>RESET</b> button) to return to your real body. Reset now.');
                },
                check() { return !Mechanics.isDisguised(); }
            },

            // 13 — Hider obj3: invisibility from a gold beam
            {
                advance: 'auto', objective: 'Grab the gold beam',
                onEnter() {
                    T.noSpotlight();
                    const f = T.forward();
                    this._beamId = T.dropBeamAt('gold', localPos.x + f.x * 3, localPos.z + f.z * 3, 1500);
                    T.dialogue('👻 Vanish',
                        'A <b>gold beam</b> landed just ahead. Wait for it to arm (~2s), then <b>walk into it</b> — collecting it turns you <b>invisible to Hunters for 5 seconds</b> and hands you a power to hold.');
                },
                check() {
                    const me = gameState.players[myId];
                    return me.invisUntil > Network.now();
                },
                onExit() {
                    T.dialogue('👻 Invisible!',
                        'You\'re a ghost to Hunters for a few seconds — the perfect moment to reposition.');
                }
            },

            // 14 — Hider obj4: disguise locked when hit
            {
                advance: 'auto', objective: 'Feel a disguise lock',
                onEnter() {
                    T.noSpotlight();
                    const prop = T.findDisguisableProp();
                    if (prop) {
                        T.placePlayerNearProp(prop, prop.radius + 0.8);
                        if (!Mechanics.isDisguised()) { Mechanics.applyDisguiseFromProp(prop); Network.sendDisguiseUpdate(); }
                    }
                    this._hitApplied = false;
                    this._hitAt = Network.now() + 1600;
                    T.dialogue('🛡 Taking fire',
                        'You\'re disguised as a prop. Watch what a Hunter\'s hit does...');
                },
                check() {
                    const me = gameState.players[myId];
                    const now = Network.now();
                    if (!this._hitApplied && now >= this._hitAt) {
                        this._hitApplied = true;
                        me.revealedUntil = now + REVEAL_MS;
                        me.disguiseLockUntil = now + DISGUISE_LOCK_MS;
                        if (Mechanics.isDisguised()) Mechanics.clearDisguise();
                        if (typeof Sound !== 'undefined' && Sound.hurt) Sound.hurt();
                        T.dialogue('🔒 Disguise LOCKED',
                            'A hit <b>breaks your disguise</b> and <b>locks</b> you out of re-disguising for 5s (see the top-of-screen timer). You can still <b>RESET</b>, but you can\'t become a new prop until it clears. Wait it out...');
                    }
                    return this._hitApplied && now > me.disguiseLockUntil;
                }
            },

            // 15 — Hider power: HEAL
            {
                advance: 'auto', objective: 'Hider power: Heal',
                soft: true, spot() { return T._powerSel(); },
                onEnter() {
                    const me = gameState.players[myId];
                    me.health = 4;
                    me.heldPower = 'heal';
                    T.dialogue('❤ Power 1 — HEAL',
                        'Hiders <b>hold</b> a beam power and use it with ' + K('E') + ' (or the power button). You\'re hurt (4 HP) — press ' + K('E') + ' to restore full health.');
                },
                check() { return gameState.players[myId].health >= HIDER_MAX_HP; }
            },

            // 16 — Hider power: INVIS
            {
                advance: 'auto', objective: 'Hider power: Invisibility',
                soft: true, spot() { return T._powerSel(); },
                onEnter() {
                    const me = gameState.players[myId];
                    me.heldPower = 'invis';
                    me.invisUntil = 0; me.invisTotalMs = 0;
                    T.dialogue('👻 Power 2 — INVISIBILITY',
                        'Press ' + K('E') + ' to turn <b>invisible for 10 seconds</b> — longer than the beam\'s auto-invis. Great for a clean escape.');
                },
                check() {
                    const me = gameState.players[myId];
                    return me.invisUntil > Network.now() && me.invisTotalMs === POWER_INVIS_MS;
                }
            },

            // 17 — Hider power: SHIELD
            {
                advance: 'auto', objective: 'Hider power: Shield',
                soft: true, spot() { return T._powerSel(); },
                onEnter() {
                    const me = gameState.players[myId];
                    me.heldPower = 'shield';
                    me.shieldArmed = false;
                    T.dialogue('🛡 Power 3 — SHIELD',
                        'Press ' + K('E') + ' to arm a <b>Shield</b> — it absorbs <b>one</b> hit while you\'re disguised (no break, no damage) and is spent on the next shot.');
                },
                check() { return gameState.players[myId].shieldArmed === true; }
            },

            // 18 — Finish
            {
                advance: 'button', objective: 'Training complete!',
                onEnter() {
                    T.noSpotlight();
                    T.dialogue('🎉 Training complete!',
                        'You\'ve learned settings, both roles, all powers, disguises and beams. Tap <b>Finish</b> to head back to the lobby and play for real. Good hunting!');
                    T._els.next.textContent = 'Finish';
                }
            }
        ];
    },

    // True if an element is actually rendered (computed display ≠ none). Robust
    // whether it's hidden via inline style OR a CSS class (a .style.display read
    // only sees inline, so a CSS-hidden panel wrongly looks "shown").
    _shown(id) {
        const el = document.getElementById(id);
        return !!(el && getComputedStyle(el).display !== 'none');
    },

    // Whichever "held power" affordance is visible (mobile button vs PC pill).
    _powerSel() {
        if (this._shown('btn-action-power')) return '#btn-action-power';
        return '#power-pill';
    }
};
