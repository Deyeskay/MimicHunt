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
    // Auto-dismisses; CSS handles the fade in/out.
    toast: function(text) {
        const box = document.getElementById('toast-container');
        if (!box) return;
        const el = document.createElement('div');
        el.className = 'toast';
        el.innerText = text;
        box.appendChild(el);
        while (box.children.length > 4) box.removeChild(box.firstChild);   // cap visible
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 4100);
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
                    b.textContent = `${ROLE_ICONS[r]} ${r}`;
                    b.dataset.role = r;
                    b.className = 'role-btn' + (p.role === r ? ' role-active' : '');
                    b.onclick = () => Network.setLocalRole(r);
                    roleWrap.appendChild(b);
                });
                item.appendChild(roleWrap);
            } else {
                const roleSpan = document.createElement('span');
                roleSpan.className = 'role-tag role-tag-' + (p.role === 'Seeker' ? 'seeker' : 'hider');
                roleSpan.textContent = `${ROLE_ICONS[p.role] || ''} ${p.role}`;
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
        if (!composOk) warning = 'Need at least 1 Hider and 1 Seeker to start.';
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
            roleSpan.textContent = `${ROLE_ICONS[p.role] || ''} ${p.role}`;
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
        document.getElementById('role-badge').innerText = `YOU — ${me.role.toUpperCase()}${suffix}`;
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
        const ch = document.getElementById('crosshair');
        const combat = document.getElementById('combat-hud');
        if (ch) ch.style.display = combatActive ? 'block' : 'none';
        if (combat) {
            combat.style.display = combatActive ? 'flex' : 'none';
            if (combatActive) {
                const ammoEl = document.getElementById('ammo-display');
                const scoreEl = document.getElementById('score-display');
                if (ammoEl) ammoEl.innerText = reloading ? 'RELOAD' : `${ammo}/${MAG_SIZE}`;
                if (scoreEl) scoreEl.innerText = me.score || 0;
            }
        }
        // Bottom-center blinking "RELOADING…" while a seeker reloads.
        const reloadEl = document.getElementById('reload-indicator');
        if (reloadEl) {
            const showReload = combatActive && reloading;
            reloadEl.style.display = showReload ? 'flex' : 'none';
            reloadEl.classList.toggle('blink', showReload);
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
                if (canAct && Mechanics.isDisguised()) {
                    // Disguised → offer Reset (blue ring).
                    setBtn('db-reset', 'assets/icons/refresh.png', 'assets/icons/face.png', 'RESET', false);
                } else if (locked) {
                    // Hit recently → disguise locked; show the countdown (red ring).
                    setBtn('db-locked', '🔒', '⏳', ((me.disguiseLockUntil - Network.now()) / 1000).toFixed(1) + 's', true);
                } else {
                    // Not disguised → name + icon the prop only when near one (green ring).
                    const near = canAct ? Mechanics.findNearestDisguiseProp() : null;
                    setBtn(null, 'assets/icons/refresh.png', near ? this.propIcon(near.model) : '❓',
                           near ? near.model.toUpperCase() : 'PROP', !near);
                }
            }
        }
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