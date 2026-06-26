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

        const players = Object.keys(gameState.players);
        let totalHidersCount = 0; let readyHidersCount = 0;

        players.forEach((id, index) => {
            const p = gameState.players[id];
            const item = document.createElement('div');
            item.className = 'player-item';
            
            let displayName = id === myId ? "You" : `Player ${index + 1}`;
            let statusText = p.isReady ? "READY" : "NOT READY";
            let statusClass = p.isReady ? "status-ready" : "status-not";
            
            if (p.role === 'Seeker') {
                displayName += " [Host/Hunter]"; statusText = "HOST"; statusClass = "status-ready";
            } else {
                totalHidersCount++; if(p.isReady) readyHidersCount++;
            }

            item.innerHTML = `<span>${displayName}</span><span class="${statusClass}">${statusText}</span>`;
            container.appendChild(item);
        });

        const actionBtn = document.getElementById('btn-lobby-action');

        if (isHost) {
            actionBtn.innerText = "Start Game";
            if (totalHidersCount > 0 && readyHidersCount === totalHidersCount) {
                actionBtn.disabled = false; actionBtn.className = "success";
            } else {
                actionBtn.disabled = true;
            }
        } else {
            // Drive the client's Ready button from the authoritative lobby state
            // (not just the optimistic local toggle), so a lobbySync that crosses
            // a ready click can't leave the button and the row out of sync. Set
            // it unconditionally — if our record isn't present yet (e.g. a fresh
            // room after a previous match) we still clear any stale "Unready".
            const me = gameState.players[myId];
            amIReady = !!(me && me.isReady);
            actionBtn.disabled = false;
            actionBtn.innerText = amIReady ? "Unready" : "Mark Ready";
            actionBtn.className = amIReady ? "secondary" : "success";
        }
    },

    updateHUD: function() {
        const me = gameState.players[myId];
        if (!me) return;

        document.getElementById('role-badge').innerText = `${me.role.toUpperCase()} ${me.isCaught ? '(CAUGHT)' : ''}`;
        document.getElementById('role-badge').style.color = me.role === 'Seeker' ? 'var(--accent-red)' : 'var(--accent-green)';

        let m = Math.floor(gameState.timer / 60).toString().padStart(2, '0');
        let s = (gameState.timer % 60).toString().padStart(2, '0');
        document.getElementById('timer-display').innerText = `${gameState.phase}: ${m}:${s}`;

        document.getElementById('blind-overlay').style.display = (gameState.phase === 'HIDING' && me.role === 'Seeker') ? 'flex' : 'none';

        // Live player count (top-right pill). Keeps updating on host (60fps loop)
        // and clients (snapshot handler), including after a host migration.
        const pc = document.getElementById('player-count');
        if (pc) pc.innerText = Object.keys(gameState.players).length;
    }
};