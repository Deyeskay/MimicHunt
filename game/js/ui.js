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

    transitionToMenu: function() {
        document.getElementById('gameCanvas').style.display = 'none';
        document.getElementById('ui-layer').style.display = 'none';
        document.getElementById('lobby-screen').style.display = 'none';
        document.getElementById('blind-overlay').style.display = 'none';
        document.getElementById('menu-screen').style.display = 'flex';
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

        if (isHost) {
            const actionBtn = document.getElementById('btn-lobby-action');
            actionBtn.innerText = "Start Game";
            if (totalHidersCount > 0 && readyHidersCount === totalHidersCount) {
                actionBtn.disabled = false; actionBtn.className = "success";
            } else {
                actionBtn.disabled = true;
            }
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
    }
};