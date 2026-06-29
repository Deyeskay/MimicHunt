// --- BIND HTML BUTTONS TO NETWORK LOGIC ---
// Capture + persist the chosen display name before hosting/joining.
function commitPlayerName() {
    const input = document.getElementById('input-player-name');
    myName = (input ? input.value : '').trim().slice(0, 16);
    GAME_SETTINGS.playerName = myName;
    localStorage.setItem('hidehunt_settings', JSON.stringify(GAME_SETTINGS));
}

// A display name is mandatory before hosting/joining — bail with an inline error
// + red shake on the field if it's empty.
function requireName() {
    const input = document.getElementById('input-player-name');
    const name = (input ? input.value : '').trim();
    if (!name) {
        UI.updateStatus('Please enter your name to continue.');
        if (input) {
            input.classList.remove('input-error');
            void input.offsetWidth;            // restart the shake animation on repeat clicks
            input.classList.add('input-error');
            input.focus();
        }
        return false;
    }
    return true;
}
const nameField = document.getElementById('input-player-name');
if (nameField) nameField.addEventListener('input', () => nameField.classList.remove('input-error'));

document.getElementById('btn-host').addEventListener('click', () => { if (!requireName()) return; commitPlayerName(); Network.initHost(); });
document.getElementById('btn-join').addEventListener('click', () => { if (!requireName()) return; commitPlayerName(); Network.initClient(); });
// Hamburger (☰) now opens a small dropdown (Edit Layout / Exit Game) instead of
// leaving the match directly.
const gameMenu = document.getElementById('game-menu');
function toggleGameMenu(show) {
    const open = (show === undefined) ? (gameMenu.style.display === 'none') : show;
    gameMenu.style.display = open ? 'flex' : 'none';
}
document.getElementById('btn-leave').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleGameMenu();
});
// Click anywhere else closes the dropdown.
document.addEventListener('click', (e) => {
    if (gameMenu.style.display !== 'none' && !gameMenu.contains(e.target) &&
        e.target.id !== 'btn-leave') {
        toggleGameMenu(false);
    }
});
document.getElementById('btn-edit-layout').addEventListener('click', () => {
    toggleGameMenu(false);
    LayoutEditor.open();
});
document.getElementById('btn-exit-game').addEventListener('click', () => {
    toggleGameMenu(false);
    UI.showConfirm('Exit Game?', 'Are you sure you want to leave the match?',
        () => Network.leaveMatch(), 'Exit');
});

// In-game Controls panel (opened from the ☰ menu). Camera look sens, FOV and
// invert mirror GAME_SETTINGS (same values as the Settings screen, kept in sync
// both ways); shoot-drag sens is unique to the mobile fire button. Changes apply
// live and persist when the panel is dismissed.
const controlsPanel = document.getElementById('controls-panel');
function syncControlsDisplays() {
    setChip('ctl-val-sensitivity', Number(GAME_SETTINGS.mouseSensitivity).toFixed(4));
    setChip('ctl-val-shoot-sens', Number(GAME_SETTINGS.shootDragSensitivity).toFixed(4));
    setChip('ctl-val-fov', String(Math.round(GAME_SETTINGS.cameraFov)));
}
function openControlsPanel() {
    document.getElementById('ctl-sensitivity').value = GAME_SETTINGS.mouseSensitivity;
    document.getElementById('ctl-shoot-sens').value = GAME_SETTINGS.shootDragSensitivity;
    document.getElementById('ctl-fov').value = GAME_SETTINGS.cameraFov;
    document.getElementById('ctl-invert-y').checked = GAME_SETTINGS.invertY;
    syncControlsDisplays();
    controlsPanel.style.display = 'flex';
}
function closeControlsPanel() {
    controlsPanel.style.display = 'none';
    localStorage.setItem('hidehunt_settings', JSON.stringify(GAME_SETTINGS));
}
document.getElementById('btn-controls').addEventListener('click', () => {
    toggleGameMenu(false);
    openControlsPanel();
});
document.getElementById('btn-controls-close').addEventListener('click', closeControlsPanel);
document.getElementById('btn-controls-reset').addEventListener('click', () => {
    // Defaults mirror GAME_SETTINGS in js/globals.js.
    GAME_SETTINGS.mouseSensitivity = 0.002;
    GAME_SETTINGS.shootDragSensitivity = 0.003;
    GAME_SETTINGS.cameraFov = 60;
    GAME_SETTINGS.invertY = false;
    Level.setFov(GAME_SETTINGS.cameraFov);
    openControlsPanel();   // repopulate this panel's inputs + chips
    // Keep the Settings screen inputs in sync (they share these values).
    const s = document.getElementById('setting-sensitivity'); if (s) s.value = GAME_SETTINGS.mouseSensitivity;
    const f = document.getElementById('setting-fov'); if (f) f.value = GAME_SETTINGS.cameraFov;
    const i = document.getElementById('setting-invert-y'); if (i) i.checked = GAME_SETTINGS.invertY;
    syncSettingDisplays();
});
controlsPanel.addEventListener('click', (e) => { if (e.target === controlsPanel) closeControlsPanel(); });
(function wireControlsPanel() {
    const sens = document.getElementById('ctl-sensitivity');
    const shoot = document.getElementById('ctl-shoot-sens');
    const fov = document.getElementById('ctl-fov');
    const inv = document.getElementById('ctl-invert-y');
    sens.addEventListener('input', () => {
        GAME_SETTINGS.mouseSensitivity = parseFloat(sens.value);
        const s = document.getElementById('setting-sensitivity'); if (s) s.value = sens.value;
        syncControlsDisplays(); syncSettingDisplays();
    });
    shoot.addEventListener('input', () => {
        GAME_SETTINGS.shootDragSensitivity = parseFloat(shoot.value);
        syncControlsDisplays();
    });
    fov.addEventListener('input', () => {
        GAME_SETTINGS.cameraFov = Math.round(Number(fov.value));
        Level.setFov(GAME_SETTINGS.cameraFov);
        const f = document.getElementById('setting-fov'); if (f) f.value = fov.value;
        syncControlsDisplays(); syncSettingDisplays();
    });
    inv.addEventListener('change', () => {
        GAME_SETTINGS.invertY = inv.checked;
        const i = document.getElementById('setting-invert-y'); if (i) i.checked = inv.checked;
    });
})();

// Player count pill (👥) → open the in-game player roster modal.
document.getElementById('player-count-card').addEventListener('click', () => UI.showPlayerList());
document.getElementById('btn-players-close').addEventListener('click', () => UI.hidePlayerList());
// Click the dim backdrop (outside the card) to dismiss.
document.getElementById('players-modal').addEventListener('click', (e) => {
    if (e.target.id === 'players-modal') UI.hidePlayerList();
});

// Edit Layout toolbar actions.
document.getElementById('btn-layout-save').addEventListener('click', () => LayoutEditor.save());
document.getElementById('btn-layout-cancel').addEventListener('click', () => LayoutEditor.cancel());
document.getElementById('btn-layout-reset').addEventListener('click', () => LayoutEditor.reset());
document.getElementById('btn-lobby-leave').addEventListener('click', () => Network.leaveMatch());

document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('settings-screen').style.display = 'flex';
});

document.getElementById('btn-back-menu').addEventListener('click', () => {
    document.getElementById('settings-screen').style.display = 'none';
    document.getElementById('menu-screen').style.display = 'flex';
});

document.getElementById('btn-save-settings').addEventListener('click', () => {

    GAME_SETTINGS.hidingTime = parseInt(document.getElementById('setting-hide-time').value);
    // Hunting-time slider is in MINUTES (5–20); store huntingTime in seconds.
    GAME_SETTINGS.huntingTime = parseInt(document.getElementById('setting-hunt-time').value) * 60;
    GAME_SETTINGS.mouseSensitivity = parseFloat(document.getElementById('setting-sensitivity').value);
    GAME_SETTINGS.cameraFov = parseInt(document.getElementById('setting-fov').value);
    GAME_SETTINGS.graphicsQuality = document.getElementById('setting-graphics').value;
    GAME_SETTINGS.invertY = document.getElementById('setting-invert-y').checked;
    GAME_SETTINGS.showMobileControls = document.getElementById('setting-mobile-ui').checked;

    Level.setFov(GAME_SETTINGS.cameraFov);
    refreshMobileControls();
    localStorage.setItem('hidehunt_settings',JSON.stringify(GAME_SETTINGS));
    UI.showModal("Saved","Settings saved successfully.");
});

// Live-apply the slider settings as the user drags (so changes are felt this
// session immediately). Sensitivity is read live from GAME_SETTINGS by
// Mechanics; FOV applies to the camera via Level.setFov.
function setChip(id, text) { const el = document.getElementById(id); if (el) el.innerText = text; }
function syncSettingDisplays() {
    const s = document.getElementById('setting-sensitivity');
    const f = document.getElementById('setting-fov');
    if (s) setChip('val-sensitivity', Number(s.value).toFixed(4));
    if (f) setChip('val-fov', String(Math.round(Number(f.value))));
    const ht = document.getElementById('setting-hide-time');
    const hu = document.getElementById('setting-hunt-time');
    if (ht) setChip('val-hide-time', String(parseInt(ht.value)));
    if (hu) setChip('val-hunt-time', String(parseInt(hu.value)));
}
(function wireLiveSettings() {
    const sens = document.getElementById('setting-sensitivity');
    const fov = document.getElementById('setting-fov');
    const hide = document.getElementById('setting-hide-time');
    const hunt = document.getElementById('setting-hunt-time');
    if (sens) sens.addEventListener('input', () => {
        GAME_SETTINGS.mouseSensitivity = parseFloat(sens.value);
        syncSettingDisplays();
    });
    if (fov) fov.addEventListener('input', () => {
        GAME_SETTINGS.cameraFov = Math.round(Number(fov.value));
        Level.setFov(GAME_SETTINGS.cameraFov);
        syncSettingDisplays();
    });
    const gfx = document.getElementById('setting-graphics');
    if (gfx) gfx.addEventListener('change', () => {
        GAME_SETTINGS.graphicsQuality = gfx.value;
        Level.setGraphicsQuality(gfx.value);
    });
    // Time sliders apply on Save; just keep their value chips live.
    if (hide) hide.addEventListener('input', syncSettingDisplays);
    if (hunt) hunt.addEventListener('input', syncSettingDisplays);
})();

document.getElementById('btn-lobby-action').addEventListener('click', () => {
    if (isHost)
    {
        // Defensive re-check (the button is already disabled by updateLobby when
        // invalid). Need >=1 Seeker, >=1 Hider, and everyone ready; the inline
        // #lobby-warning explains what's missing.
        const players = Object.values(gameState.players);
        const seekers = players.filter(p => p.role === 'Seeker').length;
        const hiders = players.filter(p => p.role === 'Hider').length;
        const allReady = players.every(p => p.isReady);

        if (seekers < 1 || hiders < 1 || !allReady) {
            UI.updateLobby();   // refresh the inline warning
            return;
        }

        Network.startGameBroadcast();
    } else {
        // Toggle off the authoritative ready state (falling back to the local
        // flag before the first sync), then optimistically reflect it. The next
        // lobbySync reconciles the button via UI.updateLobby.
        const me = gameState.players[myId];
        const current = me ? !!me.isReady : amIReady;
        amIReady = !current;

        const btn = document.getElementById('btn-lobby-action');
        btn.innerText = amIReady ? "Unready" : "Mark Ready";
        btn.className = amIReady ? "secondary" : "success";

        if(connToHost && connToHost.open) connToHost.send({ type: 'lobbyReady', readyState: amIReady });
    }
});

// --- RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);
    if (gameState.phase !== 'LOBBY' && document.getElementById('gameCanvas').style.display === 'block') {
        Level.render();
    }
}

// --- INITIALIZE APPLICATION ---
window.addEventListener('resize', () => Level.resize());
// Mobile browser toolbars show/hide without firing 'resize' — refit on those too.
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => Level.resize());
window.addEventListener('orientationchange', () => setTimeout(() => Level.resize(), 250));

// --- Fullscreen toggle (explicit button, like CrazyGames) ---
// Hides the mobile browser address bar and gives the game the whole screen.
function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function enterFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (req) { try { req.call(el); } catch (e) {} }
    if (screen.orientation && screen.orientation.lock) {
        try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
    }
}
function exitFullscreen() {
    const x = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (x) { try { x.call(document); } catch (e) {} }
}
function toggleFullscreen() { isFullscreen() ? exitFullscreen() : enterFullscreen(); }

function syncFullscreenButtons() {
    const fs = isFullscreen();
    // Only the fullscreen-toggle buttons (.fs-toggle) — NOT other .fs-btn-styled
    // icons like the settings gear, which must keep their own glyph/action.
    document.querySelectorAll('.fs-toggle').forEach(b => {
        b.innerText = fs ? '🗗' : '⛶';
        b.title = fs ? 'Exit Fullscreen' : 'Fullscreen';
    });
}
document.querySelectorAll('.fs-toggle').forEach(b => b.addEventListener('click', toggleFullscreen));
document.addEventListener('fullscreenchange', () => { syncFullscreenButtons(); Level.resize(); });
document.addEventListener('webkitfullscreenchange', () => { syncFullscreenButtons(); Level.resize(); });
syncFullscreenButtons();

// --- Screen Wake Lock ---
// Keep the display awake during a match — otherwise the phone dims/auto-locks on
// its normal timer (fullscreen alone does NOT hold the screen on). Requires a
// secure context (https or localhost). The OS releases the lock when the tab is
// backgrounded, so we re-acquire on visibilitychange. UI.transitionTo* drives
// enable()/disable() (enable on game start, disable back in lobby/menu).
const WakeLock = {
    _lock: null,
    _want: false,
    enable() { this._want = true; this._acquire(); },
    disable() {
        this._want = false;
        if (this._lock) { try { this._lock.release(); } catch (e) {} this._lock = null; }
    },
    async _acquire() {
        if (!this._want || this._lock || !('wakeLock' in navigator)) return;
        try {
            this._lock = await navigator.wakeLock.request('screen');
            this._lock.addEventListener('release', () => { this._lock = null; });
        } catch (e) { /* not visible / not secure — retried on visibilitychange */ }
    }
};
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') WakeLock._acquire();
});

// --- PWA service worker ---
// Registered only in a secure context (https / localhost). Network-first (see
// sw.js) so the no-build hard-refresh dev workflow still serves fresh source.
if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
// Load all level files (registry.js → LEVEL_FILES) before init reads LEVELS.
loadLevelScripts().then(() =>
{
    Level.loadModels(() =>
    {
        Level.init();
        Mechanics.initInputs();
        animate();
    });
});

const savedSettings = localStorage.getItem('hidehunt_settings');

if(savedSettings)
{
    // Merge over the defaults so settings added in newer versions (e.g. cameraFov)
    // keep their default when an older saved blob is loaded.
    GAME_SETTINGS = Object.assign({}, GAME_SETTINGS, JSON.parse(savedSettings));
    document.getElementById('setting-hide-time').value = GAME_SETTINGS.hidingTime;
    // huntingTime is stored in seconds; the slider shows minutes (clamped 5–20).
    // Normalise legacy seconds-based saves so the value and the slider agree.
    const huntMin = Math.min(20, Math.max(5, Math.round(GAME_SETTINGS.huntingTime / 60)));
    GAME_SETTINGS.huntingTime = huntMin * 60;
    document.getElementById('setting-hunt-time').value = huntMin;
    document.getElementById('setting-sensitivity').value = GAME_SETTINGS.mouseSensitivity;
    document.getElementById('setting-fov').value = GAME_SETTINGS.cameraFov;
    document.getElementById('setting-graphics').value = GAME_SETTINGS.graphicsQuality;
    document.getElementById('setting-invert-y').checked = GAME_SETTINGS.invertY;
    document.getElementById('setting-mobile-ui').checked = GAME_SETTINGS.showMobileControls;
}
syncSettingDisplays();

// Pre-fill the name input from the last saved name.
myName = GAME_SETTINGS.playerName || '';
const nameInput = document.getElementById('input-player-name');
if (nameInput) nameInput.value = myName;

refreshMobileControls();
// Restore any saved custom control layout (PUBG-style Edit Layout positions).
LayoutEditor.apply();

function refreshMobileControls()
{
    if(GAME_SETTINGS.showMobileControls)
    {
        document.body.classList.remove(
            'hide-mobile-controls'
        );
    }
    else
    {
        document.body.classList.add(
            'hide-mobile-controls'
        );
    }
}