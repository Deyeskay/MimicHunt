const UI = {
    // Replaces the old native alert() popup
    showModal: function(title, message, callback) {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-msg').innerText = message;
        document.getElementById('custom-modal').style.display = 'flex';

        const cancel = document.getElementById('modal-cancel-btn');
        if (cancel) cancel.style.display = 'none';   // single-button info modal
        const ok = document.getElementById('modal-btn');
        ok.innerText = 'OK';
        ok.onclick = () => {
            document.getElementById('custom-modal').style.display = 'none';
            if (callback) callback();
        };
    },

    // Yes/Cancel confirmation. onConfirm runs only if the user confirms.
    showConfirm: function(title, message, onConfirm, confirmLabel) {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-msg').innerText = message;
        document.getElementById('custom-modal').style.display = 'flex';

        const ok = document.getElementById('modal-btn');
        const cancel = document.getElementById('modal-cancel-btn');
        ok.innerText = confirmLabel || 'Yes';
        ok.onclick = () => {
            document.getElementById('custom-modal').style.display = 'none';
            if (onConfirm) onConfirm();
        };
        if (cancel) {
            cancel.style.display = 'inline-block';
            cancel.onclick = () => {
                document.getElementById('custom-modal').style.display = 'none';
            };
        }
    },

    updateStatus: function(msg) {
        document.getElementById('status-msg').innerText = msg;
    },

    // Lobby title: "ROOM CODE:" in yellow, the code itself white + larger so it
    // stands out as the thing players share. Called from every spot that knows the code.
    setLobbyCode: function(code) {
        const t = document.getElementById('lobby-title');
        if (!t) return;
        t.innerHTML = '<span style="color:#ffd54a;">ROOM CODE:</span> ' +
            '<span style="color:#ffffff; font-size:1.35em; font-weight:800;">' + code + '</span>';
    },

    // Transient bottom-center notification (player left / eliminated / disconnected).
    // Auto-dismisses; CSS handles the fade in/out. `opts.duration` (ms) overrides the
    // default 4.1s for messages that need longer to read (e.g. seeker-ability alerts);
    // the fade-out is re-keyed inline so it still fades ~0.5s before removal.
    toast: function(text, opts) {
        const box = document.getElementById('toast-container');
        if (!box) return;
        const dur = (opts && opts.duration) || 4100;
        const el = document.createElement('div');
        el.className = 'toast';
        el.innerText = text;
        if (dur !== 4100) {
            // Keep fade-in at 0s; start fade-out 0.4s before removal.
            el.style.animationDelay = '0s, ' + Math.max(0, (dur - 400) / 1000) + 's';
        }
        box.appendChild(el);
        while (box.children.length > 4) box.removeChild(box.firstChild);   // cap visible
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, dur);
    },

    // AAA-style centre-screen announcement (power / key pickups): a beveled hexagon panel
    // with a translucent (see-through) fill, a small subtitle on top and a big gradient
    // title below, that rises up and fades. Renders in #center-announce.
    //   announce(title, subtitle, opts)  — subtitle optional; opts.duration in ms.
    //   announce(title, opts)            — back-compat single-line form.
    // The 2.2s figure matches the .ca-item `ca-rise` animation length.
    announce: function(title, subtitle, opts) {
        if (subtitle && typeof subtitle === 'object') { opts = subtitle; subtitle = ''; }
        const box = document.getElementById('center-announce');
        if (!box) return;
        const dur = (opts && opts.duration) || 2200;
        const el = document.createElement('div');
        el.className = 'ca-item';

        if (subtitle) {
            const sub = document.createElement('div');
            sub.className = 'ca-sub';
            sub.textContent = subtitle;
            el.appendChild(sub);
        }

        // Split a leading emoji from the title so it stays full-colour — a gradient
        // text-clip renders emoji transparent (invisible) in Chrome otherwise.
        const ttl = document.createElement('div');
        ttl.className = 'ca-title';
        let emoji = '', rest = title;
        const sp = title.indexOf(' ');
        if (sp > 0 && /^\p{Extended_Pictographic}/u.test(title)) {
            emoji = title.slice(0, sp); rest = title.slice(sp + 1);
        }
        if (emoji) {
            const e = document.createElement('span');
            e.className = 'ca-emoji'; e.textContent = emoji;
            ttl.appendChild(e);
        }
        const t = document.createElement('span');
        t.className = 'ca-txt'; t.textContent = rest;
        ttl.appendChild(t);
        el.appendChild(ttl);

        if (dur !== 2200) el.style.animationDuration = (dur / 1000) + 's';
        box.appendChild(el);
        while (box.children.length > 3) box.removeChild(box.firstChild);   // cap visible
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, dur + 60);
    },

    // Persistent top-left "objective" pill (current goal/state). Replace semantics:
    // each call swaps the text; clearObjective() hides it. Driven by updateObjective().
    objective: function(text) {
        const hud = document.getElementById('objective-hud');
        const el = document.getElementById('objective-text');
        if (!hud || !el) return;
        if (el.innerText !== text) el.innerText = text;
        hud.style.display = 'flex';
    },
    clearObjective: function() {
        const hud = document.getElementById('objective-hud');
        if (hud) hud.style.display = 'none';
    },

    // Compute the single objective-slot text from local game state, by priority
    // (highest wins). Called each tick from updateHUD. Phase/role goals + the live
    // exit-unlock countdown + the key/escape goals.
    updateObjective: function() {
        if (typeof gameState === 'undefined' || !gameState) { this.clearObjective(); return; }
        const phase = gameState.phase;
        if (phase === 'LOBBY' || phase === 'ENDED' || !phase) { this.clearObjective(); return; }

        const me = gameState.players && gameState.players[myId];
        if (!me) { this.clearObjective(); return; }
        const role = me.role;
        if (role !== 'Hider' && role !== 'Seeker') { this.clearObjective(); return; }
        const carrying = role === 'Hider' && (me.carriedKeys > 0);
        const now = (typeof Network !== 'undefined' && Network.now) ? Network.now() : 0;
        const actAt = gameState.doorsActivateAt;
        const exitsOpen = actAt && now >= actAt;

        if (phase === 'HUNTING') {
            if (exitsOpen) {
                this.objective(carrying ? '🚪 Deposit your key at an EXIT!' : '🚪 EXITS OPEN — escape!');
            } else if (actAt) {
                const secs = Math.max(0, Math.ceil((actAt - now) / 1000));
                const mmss = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
                this.objective(carrying ? ('🔑 Key secured — exits unlock in ' + mmss)
                                        : ('⏳ Exits unlock in ' + mmss));
            } else {
                // No exit schedule (short match) — fall back to the role goal.
                this.objective(role === 'Seeker' ? '🎯 Hunt the hiders' : '🏃 Survive!');
            }
            return;
        }

        // HIDING
        if (role === 'Seeker') this.objective('⏳ Hunt begins in ' + (gameState.timer || 0) + 's');
        else this.objective('🫥 Hide — disguise as a prop');
    },

    transitionToGame: function() {
        document.getElementById('lobby-screen').style.display = 'none';
        document.getElementById('menu-screen').style.display = 'none';
        document.getElementById('ui-layer').style.display = 'flex';
        document.getElementById('gameCanvas').style.display = 'block';
        setTimeout(() => { Level.resize(); }, 50); // Ensures Canvas resizes to screen
        if (typeof WakeLock !== 'undefined') WakeLock.enable();   // keep the screen awake in-match
    },

    transitionToLobby: function() {
        // Used when a client is dropped into a (new) host's lobby — e.g. after a
        // host migration ends the round. Hides the game view, shows the lobby.
        document.getElementById('gameCanvas').style.display = 'none';
        document.getElementById('ui-layer').style.display = 'none';
        document.getElementById('blind-overlay').style.display = 'none';
        document.getElementById('menu-screen').style.display = 'none';
        document.getElementById('lobby-screen').style.display = 'flex';
        if (typeof WakeLock !== 'undefined') WakeLock.disable();   // leaving the match → allow sleep
        this.renderLevelSelector();
    },

    // Lobby map picker: a small status line + a horizontal carousel of level
    // cards (from the bundled registry). The host can click a card to choose;
    // everyone else sees the selection read-only. Rebuilt only on lobby entry /
    // selection change (NOT from updateLobby) to avoid resetting scroll on every
    // ready toggle.
    renderLevelSelector: function() {
        const wrap = document.getElementById('lobby-level');
        if (!wrap) return;

        const names = Network.getLevelList();
        const selected = gameState.levelName || names[0] || '';

        wrap.innerHTML = '';

        // "Map: X" lives in the .lobby-meta row (next to the subtitle), not here.
        const mapLabel = document.getElementById('lobby-map');
        if (mapLabel) mapLabel.innerHTML = 'Map: <b>' + (selected || '—') + '</b>';

        const carousel = document.createElement('div');
        carousel.className = 'level-carousel';
        names.forEach(name => {
            const card = document.createElement('div');
            card.className = 'level-card' + (name === selected ? ' selected' : '');
            card.textContent = name;
            if (isHost) {
                card.style.cursor = 'pointer';
                card.onclick = () => Network.selectLevel(name);
            }
            carousel.appendChild(card);
        });
        wrap.appendChild(carousel);
    },

    transitionToMenu: function() {
        document.getElementById('gameCanvas').style.display = 'none';
        document.getElementById('ui-layer').style.display = 'none';
        document.getElementById('lobby-screen').style.display = 'none';
        document.getElementById('blind-overlay').style.display = 'none';
        document.getElementById('menu-screen').style.display = 'flex';
        if (typeof WakeLock !== 'undefined') WakeLock.disable();   // back at menu → allow sleep

        // Reset the lobby action button so a stale label (e.g. "Unready" from a
        // previous match) can't carry into the next room.
        const actionBtn = document.getElementById('btn-lobby-action');
        actionBtn.innerText = "Mark Ready";
        actionBtn.className = "success";
        actionBtn.disabled = false;

        this.updateStatus("");
    },

    // Player-facing display name for a role. The internal role id stays 'Seeker'
    // everywhere in the logic/protocol; only what the UI shows changes.
    roleLabel: function(role) { return role === 'Seeker' ? 'Hunter' : role; },

    updateLobby: function() {
        const container = document.getElementById('player-list-container');
        container.innerHTML = "";

        const ids = Object.keys(gameState.players);
        const hostId = isHost ? myId : (connToHost && connToHost.peer);
        const ROLE_ICONS = { Hider: '🙈', Seeker: '🔦' };

        let seekers = 0, hiders = 0, total = 0, readyCount = 0;

        ids.forEach((id, index) => {
            const p = gameState.players[id];
            total++;
            if (p.role === 'Seeker') seekers++; else hiders++;
            if (p.isReady) readyCount++;

            const item = document.createElement('div');
            item.className = 'player-item';

            // Name (+ host tag)
            const nameSpan = document.createElement('span');
            let label = p.name || (id === myId ? 'You' : `Player ${index + 1}`);
            if (id === hostId) label += ' (Host)';
            nameSpan.textContent = label;
            item.appendChild(nameSpan);

            // Role: editable segmented toggle for the local player, read-only chip otherwise
            if (id === myId) {
                const roleWrap = document.createElement('span');
                roleWrap.className = 'role-toggle';
                ['Hider', 'Seeker'].forEach(r => {
                    const b = document.createElement('button');
                    b.textContent = `${ROLE_ICONS[r]} ${this.roleLabel(r)}`;
                    b.dataset.role = r;
                    b.className = 'role-btn' + (p.role === r ? ' role-active' : '');
                    b.onclick = () => Network.setLocalRole(r);
                    roleWrap.appendChild(b);
                });
                item.appendChild(roleWrap);
            } else {
                const roleSpan = document.createElement('span');
                roleSpan.className = 'role-tag role-tag-' + (p.role === 'Seeker' ? 'seeker' : 'hider');
                roleSpan.textContent = `${ROLE_ICONS[p.role] || ''} ${this.roleLabel(p.role)}`;
                item.appendChild(roleSpan);
            }

            // Ready status
            const statusSpan = document.createElement('span');
            statusSpan.textContent = p.isReady ? 'READY' : 'NOT READY';
            statusSpan.className = p.isReady ? 'status-ready' : 'status-not';
            item.appendChild(statusSpan);

            container.appendChild(item);
        });

        // Validation: need >=1 of each role AND everyone ready.
        const composOk = seekers >= 1 && hiders >= 1;
        const allReady = total > 0 && readyCount === total;
        let warning = '';
        if (!composOk) warning = 'Need at least 1 Hider and 1 Hunter to start.';
        else if (!allReady) warning = 'Waiting for all players to be ready.';
        const warnEl = document.getElementById('lobby-warning');
        if (warnEl) warnEl.textContent = warning;

        const actionBtn = document.getElementById('btn-lobby-action');

        if (isHost) {
            const canStart = composOk && allReady;
            actionBtn.innerText = "Start Game";
            actionBtn.disabled = !canStart;
            actionBtn.className = canStart ? "success" : "secondary";
        } else {
            // Drive the client's Ready button from the authoritative lobby state
            // so a lobbySync that crosses a ready click can't desync it.
            const me = gameState.players[myId];
            amIReady = !!(me && me.isReady);
            actionBtn.disabled = false;
            actionBtn.innerText = amIReady ? "Unready" : "Mark Ready";
            actionBtn.className = amIReady ? "secondary" : "success";
        }
    },

    // In-game player roster, opened by the 👥 count pill. Shows each player's
    // name, role, and alive/eliminated status. Read-only (no lobby role toggles).
    showPlayerList: function() {
        const list = document.getElementById('players-modal-list');
        if (!list) return;
        list.innerHTML = '';
        const ROLE_ICONS = { Hider: '🙈', Seeker: '🔦' };
        const hostId = isHost ? myId : (connToHost && connToHost.peer);
        const ids = Object.keys(gameState.players);
        ids.forEach((id, index) => {
            const p = gameState.players[id];
            const item = document.createElement('div');
            item.className = 'player-item';

            const nameSpan = document.createElement('span');
            let label = p.name || (id === myId ? 'You' : `Player ${index + 1}`);
            if (id === myId) label += ' (You)';
            if (id === hostId) label += ' (Host)';
            nameSpan.textContent = label;
            item.appendChild(nameSpan);

            const roleSpan = document.createElement('span');
            roleSpan.className = 'role-tag role-tag-' + (p.role === 'Seeker' ? 'seeker' : 'hider');
            roleSpan.textContent = `${ROLE_ICONS[p.role] || ''} ${this.roleLabel(p.role)}`;
            item.appendChild(roleSpan);

            const statusSpan = document.createElement('span');
            const out = (p.role !== 'Seeker' && p.isCaught);
            statusSpan.textContent = out ? 'ELIMINATED' : 'ALIVE';
            statusSpan.className = out ? 'status-not' : 'status-ready';
            item.appendChild(statusSpan);

            list.appendChild(item);
        });
        document.getElementById('players-modal').style.display = 'flex';
    },

    hidePlayerList: function() {
        const m = document.getElementById('players-modal');
        if (m) m.style.display = 'none';
    },

    // Brief red crosshair flash when the local seeker lands a hit.
    hitMarker: function() {
        const ch = document.getElementById('crosshair');
        if (!ch) return;
        ch.classList.add('hit');
        clearTimeout(this._hitT);
        this._hitT = setTimeout(() => ch.classList.remove('hit'), 150);
    },

    updateHUD: function() {
        const me = gameState.players[myId];
        if (!me) return;

        const isSeeker = me.role === 'Seeker';
        const suffix = (!isSeeker && me.isCaught) ? ' (ELIMINATED)' : '';
        document.getElementById('role-badge').innerText = `YOU — ${this.roleLabel(me.role).toUpperCase()}${suffix}`;
        document.getElementById('role-badge').style.color = isSeeker ? 'var(--accent-red)' : 'var(--accent-green)';
        const roleCard = document.getElementById('role-card');
        if (roleCard) roleCard.style.borderColor = isSeeker ? 'var(--accent-red)' : 'var(--accent-green)';

        let m = Math.floor(gameState.timer / 60).toString().padStart(2, '0');
        let s = (gameState.timer % 60).toString().padStart(2, '0');
        document.getElementById('timer-display').innerText = `${gameState.phase}: ${m}:${s}`;

        const blinded = (gameState.phase === 'HIDING' && isSeeker);
        document.getElementById('blind-overlay').style.display = blinded ? 'flex' : 'none';
        if (blinded) {
            const cd = document.getElementById('blind-countdown');
            if (cd) cd.innerText = `${gameState.timer}s`;
        }

        // Live player count (top-right pill). Keeps updating on host (60fps loop)
        // and clients (snapshot handler), including after a host migration.
        const pc = document.getElementById('player-count');
        if (pc) pc.innerText = Object.keys(gameState.players).length;

        // --- Combat UI: crosshair + ammo/score, Seeker only, while alive in HUNTING ---
        const combatActive = isSeeker && gameState.phase === 'HUNTING' && !me.isCaught;
        // PUBG-style reload: while reloading, hide the crosshair and show a centre-screen
        // ring that fills over RELOAD_MS. The combat pill still flips ammo to "RELOAD".
        const reloadingNow = combatActive && reloading;
        const ch = document.getElementById('crosshair');
        const ring = document.getElementById('reload-ring');
        if (ch) ch.style.display = (combatActive && !reloadingNow) ? 'block' : 'none';
        if (ring) {
            ring.style.display = reloadingNow ? 'block' : 'none';
            if (reloadingNow) {
                const prog = Math.max(0, Math.min(1, (RELOAD_MS - (reloadUntil - Network.now())) / RELOAD_MS));
                ring.style.setProperty('--p', (prog * 360) + 'deg');
            }
        }
        const combat = document.getElementById('combat-hud');
        if (combat) {
            combat.style.display = combatActive ? 'flex' : 'none';
            if (combatActive) {
                const ammoEl = document.getElementById('ammo-display');
                const scoreEl = document.getElementById('score-display');
                if (ammoEl) ammoEl.innerText = reloading ? 'RELOAD' : `${ammo}/${MAG_SIZE}`;
                if (scoreEl) scoreEl.innerText = me.score || 0;
            }
        }
        // Hider health bar (top HUD): visible for a hider in-game.
        const healthHud = document.getElementById('health-hud');
        if (healthHud) {
            const showHealth = !isSeeker && gameState.phase !== 'LOBBY';
            healthHud.style.display = showHealth ? 'flex' : 'none';
            if (showHealth) {
                const hp = me.health != null ? me.health : HIDER_MAX_HP;
                const pct = Math.max(0, Math.min(1, hp / HIDER_MAX_HP));
                const fill = document.getElementById('hp-fill');
                if (fill) {
                    fill.style.width = (pct * 100) + '%';
                    fill.style.background = pct > 0.6 ? 'var(--accent-green)'
                        : pct > 0.3 ? '#ffa502' : 'var(--accent-red)';
                }
            }
        }

        // Hider disguise cooldown (top-center): after a hit, disguising is locked for
        // DISGUISE_LOCK_MS — show the remaining time + a depleting bar so the escaping
        // hider knows when they can hide again. Driven each HUD tick (60fps).
        const cdEl = document.getElementById('disguise-cd');
        if (cdEl) {
            const remainMs = (me.disguiseLockUntil || 0) - Network.now();
            const showCd = !isSeeker && !me.isCaught && gameState.phase !== 'LOBBY' && remainMs > 0;
            cdEl.style.display = showCd ? 'flex' : 'none';
            if (showCd) {
                const txt = document.getElementById('disguise-cd-text');
                if (txt) txt.innerText = (remainMs / 1000).toFixed(1) + 's';
                const bar = document.getElementById('disguise-cd-bar');
                if (bar) bar.style.width = Math.max(0, Math.min(1, remainMs / DISGUISE_LOCK_MS)) * 100 + '%';
            }
        }

        // Mobile action buttons by role: Seeker shoots, Hider disguises.
        const shootBtn = document.getElementById('btn-action-shoot');
        const propBtn = document.getElementById('btn-action-disguise');
        if (shootBtn) shootBtn.style.display = isSeeker ? '' : 'none';
        if (propBtn) {
            propBtn.style.display = isSeeker ? 'none' : '';
            if (!isSeeker) {
                const swap = document.getElementById('db-swap');
                const icon = document.getElementById('db-icon');
                const label = document.getElementById('db-label');
                // Render either a PNG icon (path ending in .png) or an emoji glyph
                // into a slot span — lets the same states fall back to emoji where
                // no artwork exists (locked/reset).
                const setIcon = (el, val) => {
                    if (!el) return;
                    if (val && val.slice(-4) === '.png') {
                        el.innerHTML = '<img class="db-img" src="' + val + '" alt="">';
                    } else {
                        el.textContent = val;
                    }
                };
                const setBtn = (cls, sw, ic, lb, dis) => {
                    propBtn.classList.remove('db-reset', 'db-locked');
                    if (cls) propBtn.classList.add(cls);
                    setIcon(swap, sw);
                    setIcon(icon, ic);
                    if (label) label.textContent = lb;
                    propBtn.disabled = dis;
                };
                const canAct = !me.isCaught && gameState.phase !== 'LOBBY';
                const locked = canAct && me.disguiseLockUntil && Network.now() < me.disguiseLockUntil;
                const near = canAct ? Mechanics.findNearestDisguiseProp() : null;
                if (near && !locked) {
                    // Near a disguisable prop (and not locked) → name + icon it (green
                    // ring). Pressing disguises OR switches directly to it — so while
                    // already disguised the button keeps showing the prop you're beside
                    // (not RESET), and standing at a different prop lets you swap
                    // straight to it (e.g. rock → tree) without resetting first.
                    setBtn(null, 'assets/icons/refresh.png', this.propIcon(near.model),
                           near.model.toUpperCase(), false);
                } else if (canAct && Mechanics.isDisguised()) {
                    // Disguised but not beside a switchable prop → offer Reset (blue ring).
                    setBtn('db-reset', 'assets/icons/refresh.png', 'assets/icons/face.png', 'RESET', false);
                } else if (locked) {
                    // Hit recently → disguise locked; show the countdown (red ring).
                    setBtn('db-locked', '🔒', '⏳', ((me.disguiseLockUntil - Network.now()) / 1000).toFixed(1) + 's', true);
                } else {
                    // Not disguised & not near a prop → disabled placeholder (green ring).
                    setBtn(null, 'assets/icons/refresh.png', '❓', 'PROP', true);
                }
            }
        }

        // --- Airdrop power-up HUD (held power + active timed effects) ---
        this.updatePowerHUD(me, isSeeker);

        // --- Next-airdrop countdown (top-right) ---
        this.updateNextDrop();

        // --- Key objective (top-left) ---
        this.updateKeysHUD(me);

        // --- Persistent objective pill (top-left, under the role card) ---
        this.updateObjective();
    },

    // Team key progress (deposited toward the hider win) for everyone, plus the
    // local hider's carried (un-deposited) keys. Only during HUNTING.
    updateKeysHUD: function(me) {
        const el = document.getElementById('keys-hud');
        if (!el) return;
        const goal = (typeof KEYS_TO_WIN !== 'undefined') ? KEYS_TO_WIN : 3;
        if (gameState.phase !== 'HUNTING') { el.style.display = 'none'; return; }
        el.style.display = 'flex';
        let txt = '🔑 ' + (gameState.submittedKeys || 0) + '/' + goal;
        if (me.role === 'Hider' && me.carriedKeys > 0) txt += ' · 🎒 ' + me.carriedKeys;
        const t = document.getElementById('keys-hud-text');
        if (t) t.innerText = txt;
    },

    // Top-right "Next Drop in M:SS" pill. The beam schedule is fixed seconds into
    // HUNTING, so every peer derives the countdown from gameState.timer alone
    // (no need for the host-only huntStartT): elapsed = huntingTime − timer.
    updateNextDrop: function() {
        const el = document.getElementById('next-drop');
        if (!el) return;
        let secs = null, kind = null;
        if (gameState.phase === 'HUNTING' && typeof computeBeamSchedule !== 'undefined') {
            // Use the HOST's hunting length (synced on gameState), not the local
            // GAME_SETTINGS — a client's own huntingTime may differ, which would
            // otherwise make its countdown wrong. computeBeamSchedule is deterministic,
            // so this recomputes the host's exact schedule with no extra packets.
            const huntLen = gameState.huntingTime || ROUND_DURATION();
            const elapsed = huntLen - gameState.timer;        // seconds into hunting
            // Next drop = the soonest upcoming GOLD (power) or PURPLE (key) beam.
            const sc = computeBeamSchedule(huntLen);
            const sched = sc.gold.map(t => ({ at: t, kind: 'gold' }))
                .concat(sc.purple.map(t => ({ at: t, kind: 'purple' })))
                .filter(e => e.at > elapsed && e.at < huntLen)
                .sort((a, b) => a.at - b.at);
            if (sched.length) { secs = sched[0].at - elapsed; kind = sched[0].kind; }
        }
        if (secs == null) { el.style.display = 'none'; return; }
        el.style.display = 'flex';
        const m = Math.floor(secs / 60).toString();
        const s = (secs % 60).toString().padStart(2, '0');
        const ic = el.querySelector('.nd-ic');
        if (ic) ic.textContent = kind === 'purple' ? '🟣' : '🔔';
        const t = document.getElementById('next-drop-time');
        if (t) t.innerText = `${m}:${s}`;
        el.classList.toggle('imminent', secs <= 10);
    },

    // Held airdrop power → the bottom-right "held pill" (awaiting [E]) + the hider's
    // mobile "use power" button. The ACTIVE effect (once triggered / auto for seekers)
    // is a separate bottom-center indicator — see updateActiveEffect.
    HELD_POWERS: { heal: ['❤️', 'FULL HEALTH'], invis: ['👻', 'INVISIBLE'], shield: ['🛡️', 'DISGUISE SHIELD'] },
    updatePowerHUD: function(me, isSeeker) {
        const inGame = gameState.phase !== 'LOBBY' && !me.isCaught;
        const HELD = this.HELD_POWERS;

        // --- Held pill (bottom-center-RIGHT): a hider's un-activated power (press E). ---
        // Seekers have no held state (their powers auto-activate on pickup). On touch
        // layouts the held power is shown on the mobile button instead, so suppress the
        // duplicate pill there — only PC players (no mobile controls) get the pill.
        const hasHeld = inGame && !isSeeker && !!me.heldPower && HELD[me.heldPower];
        const suppressPill = hasHeld && GAME_SETTINGS.showMobileControls;
        // Detect the moment a power is freshly acquired (none → held) so the held pill /
        // power button can flash a one-shot "activated" pop the instant it appears.
        const justGained = hasHeld && me.heldPower !== this._heldPowerShown;
        this._heldPowerShown = hasHeld ? me.heldPower : null;

        const pill = document.getElementById('power-pill');
        if (pill) {
            if (hasHeld && !suppressPill) {
                pill.style.display = 'flex';
                const ic = document.getElementById('power-pill-icon');
                const tx = document.getElementById('power-pill-text');
                if (ic) ic.textContent = HELD[me.heldPower][0];
                if (tx) tx.textContent = HELD[me.heldPower][1] + ' [E]';
                if (justGained) this.pulsePickup(pill);
            } else {
                pill.style.display = 'none';
            }
        }

        // Mobile "use power" button — hider only, only while holding an unused power.
        const powerBtn = document.getElementById('btn-action-power');
        if (powerBtn) {
            const showBtn = inGame && !isSeeker && !!me.heldPower;
            powerBtn.style.display = showBtn ? '' : 'none';
            if (showBtn && HELD[me.heldPower]) {
                const ic = document.getElementById('pb-icon');
                const lb = document.getElementById('pb-label');
                if (ic) ic.textContent = HELD[me.heldPower][0];
                if (lb) lb.textContent = HELD[me.heldPower][1];
                if (justGained) this.pulsePickup(powerBtn);
            }
        }

        // --- Active effect (bottom-center, above the health/combat pill). ---
        this.updateActiveEffect(me, isSeeker);
    },

    // One-shot "power acquired" pop on an element (held pill / power button): a quick grow
    // + gold flare that reverts. Uses the Web Animations API so the scale COMPOSES (add)
    // with the layout editor's inline transform (translate(-50%,-50%) scale()) on the mobile
    // button — a plain CSS `transform` animation would drop that translate and make the
    // button jump. Glow uses default (replace) compositing and isn't `forwards`, so the base
    // box-shadow is restored when it finishes.
    pulsePickup: function(el) {
        if (!el || !el.animate) return;
        el.animate(
            [ { transform: 'scale(1)' }, { transform: 'scale(1.28)', offset: 0.35 }, { transform: 'scale(1)' } ],
            { duration: 500, easing: 'ease-out', composite: 'add' }
        );
        el.animate(
            [ { boxShadow: '0 0 14px rgba(255,215,0,0.30)' },
              { boxShadow: '0 0 28px rgba(255,215,0,0.95), 0 0 12px rgba(255,255,255,0.65)', offset: 0.35 },
              { boxShadow: '0 0 14px rgba(255,215,0,0.30)' } ],
            { duration: 500, easing: 'ease-out' }
        );
    },

    // Flash a brief INSTANT effect (e.g. heal → "HEALTH RESTORED") in the active-effect
    // indicator. Countdown/toggle effects render from player state instead.
    flashEffect: function(icon, label, ms) {
        this._flashIcon = icon;
        this._flashLabel = label;
        this._flashUntil = Network.now() + (ms || 1500);
    },

    // The single active power-effect indicator. Picks ONE effect by priority and renders
    // it by TYPE: countdown (depleting bar), toggle (persists), instant (brief flash).
    updateActiveEffect: function(me, isSeeker) {
        const el = document.getElementById('active-effect');
        if (!el) return;
        const now = Network.now();
        const inGame = gameState.phase !== 'LOBBY' && !me.isCaught;
        const secs = (until) => ((until - now) / 1000).toFixed(1) + 's';
        const clamp01 = (v) => Math.max(0, Math.min(1, v));

        let icon = null, label = '', kind = null, frac = 0;
        if (this._flashUntil && now < this._flashUntil) {
            // Instant flash (heal) takes brief priority over everything else.
            icon = this._flashIcon; label = this._flashLabel; kind = 'instant';
        } else if (inGame && !isSeeker) {
            if (me.invisUntil > now) {
                icon = '👻'; kind = 'count';
                label = 'INVISIBLE ' + secs(me.invisUntil);
                frac = clamp01((me.invisUntil - now) / (me.invisTotalMs || POWER_INVIS_MS));
            } else if (me.shieldArmed) {
                icon = '🛡️'; label = 'SHIELD ACTIVE'; kind = 'toggle';
            }
        } else if (inGame && isSeeker) {
            if (me.scanUntil > now) {
                icon = '📡'; kind = 'count'; label = 'SCAN ' + secs(me.scanUntil);
                frac = clamp01((me.scanUntil - now) / POWER_SCAN_MS);
            } else if (me.killUntil > now) {
                icon = '🎯'; kind = 'count'; label = 'ONE-SHOT KILL ' + secs(me.killUntil);
                frac = clamp01((me.killUntil - now) / POWER_KILL_MS);
            } else if (me.jamUntil > now) {
                icon = '🚫'; kind = 'count'; label = 'JAMMER ' + secs(me.jamUntil);
                frac = clamp01((me.jamUntil - now) / POWER_JAM_MS);
            }
        }

        if (!icon) { el.style.display = 'none'; return; }
        el.style.display = 'flex';
        el.className = 'ae-' + kind;   // ae-count | ae-toggle | ae-instant (drives styling)
        const ic = document.getElementById('ae-icon');
        const lb = document.getElementById('ae-label');
        const track = document.getElementById('ae-track');
        const bar = document.getElementById('ae-bar');
        if (ic) ic.textContent = icon;
        if (lb) lb.textContent = label;
        if (track) track.style.display = (kind === 'count') ? '' : 'none';
        if (kind === 'count' && bar) bar.style.width = (frac * 100) + '%';
    },

    // Icon for a disguisable prop type, shown on the switch button. PNG artwork
    // where it exists; emoji fallback otherwise (setIcon picks renderer by suffix).
    propIcon: function(model) {
        switch (model) {
            case 'tree': return 'assets/icons/tree.png';
            case 'bush': return 'assets/icons/bush.png';
            case 'rock': return 'assets/icons/rock.png';
            case 'wall': return '🧱';
            default:     return '📦';
        }
    }
};