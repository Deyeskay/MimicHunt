const UI = {
    // Replaces the old native alert() popup
    showModal: function(title, message, callback) {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-msg').innerText = message;
        document.getElementById('custom-modal').style.display = 'flex';
        
        document.getElementById('modal-btn').onclick = () => {
            document.getElementById('custom-modal').style.display = 'none';
            if (callback) callback();
        };
    },

    updateStatus: function(msg) {
        document.getElementById('status-msg').innerText = msg;
    },

    transitionToGame: function() {
        document.getElementById('lobby-screen').style.display = 'none';
        document.getElementById('menu-screen').style.display = 'none';
        document.getElementById('ui-layer').style.display = 'flex';
        document.getElementById('gameCanvas').style.display = 'block';
        setTimeout(() => { Level.resize(); }, 50); // Ensures Canvas resizes to screen
    },

    transitionToLobby: function() {
        // Used when a client is dropped into a (new) host's lobby — e.g. after a
        // host migration ends the round. Hides the game view, shows the lobby.
        document.getElementById('gameCanvas').style.display = 'none';
        document.getElementById('ui-layer').style.display = 'none';
        document.getElementById('blind-overlay').style.display = 'none';
        document.getElementById('menu-screen').style.display = 'none';
        document.getElementById('lobby-screen').style.display = 'flex';
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

        const status = document.createElement('div');
        status.className = 'lobby-level-status';
        status.innerHTML = 'Map: <b>' + (selected || '—') + '</b>';
        wrap.appendChild(status);

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
        const namePrefix = me.name ? `${me.name} — ` : '';
        const suffix = (!isSeeker && me.isCaught) ? ' (ELIMINATED)' : '';
        document.getElementById('role-badge').innerText = `${namePrefix}${me.role.toUpperCase()}${suffix}`;
        document.getElementById('role-badge').style.color = isSeeker ? 'var(--accent-red)' : 'var(--accent-green)';

        let m = Math.floor(gameState.timer / 60).toString().padStart(2, '0');
        let s = (gameState.timer % 60).toString().padStart(2, '0');
        document.getElementById('timer-display').innerText = `${gameState.phase}: ${m}:${s}`;

        document.getElementById('blind-overlay').style.display = (gameState.phase === 'HIDING' && isSeeker) ? 'flex' : 'none';

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

        // Mobile action buttons by role: Seeker shoots, Hider disguises.
        const shootBtn = document.getElementById('btn-action-shoot');
        const propBtn = document.getElementById('btn-action-disguise');
        if (shootBtn) shootBtn.style.display = isSeeker ? '' : 'none';
        if (propBtn) propBtn.style.display = isSeeker ? 'none' : '';
    }
};