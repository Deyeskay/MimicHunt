// --- BIND HTML BUTTONS TO NETWORK LOGIC ---
// Capture + persist the chosen display name before hosting/joining.
function commitPlayerName() {
    const input = document.getElementById('input-player-name');
    myName = (input ? input.value : '').trim().slice(0, 16);
    GAME_SETTINGS.playerName = myName;
    localStorage.setItem('hidehunt_settings', JSON.stringify(GAME_SETTINGS));
}

document.getElementById('btn-host').addEventListener('click', () => { commitPlayerName(); Network.initHost(); });
document.getElementById('btn-join').addEventListener('click', () => { commitPlayerName(); Network.initClient(); });
document.getElementById('btn-leave').addEventListener('click', () => {
    UI.showConfirm('Exit Match?', 'Are you sure you want to leave the match?',
        () => Network.leaveMatch(), 'Exit');
});
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
    GAME_SETTINGS.huntingTime = parseInt(document.getElementById('setting-hunt-time').value);
    GAME_SETTINGS.mouseSensitivity = parseFloat(document.getElementById('setting-sensitivity').value);
    GAME_SETTINGS.cameraFov = parseInt(document.getElementById('setting-fov').value);
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
    document.querySelectorAll('.fs-btn').forEach(b => {
        b.innerText = fs ? '🗗' : '⛶';
        b.title = fs ? 'Exit Fullscreen' : 'Fullscreen';
    });
}
document.querySelectorAll('.fs-btn').forEach(b => b.addEventListener('click', toggleFullscreen));
document.addEventListener('fullscreenchange', () => { syncFullscreenButtons(); Level.resize(); });
document.addEventListener('webkitfullscreenchange', () => { syncFullscreenButtons(); Level.resize(); });
syncFullscreenButtons();
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
    document.getElementById('setting-hunt-time').value = GAME_SETTINGS.huntingTime;
    document.getElementById('setting-sensitivity').value = GAME_SETTINGS.mouseSensitivity;
    document.getElementById('setting-fov').value = GAME_SETTINGS.cameraFov;
    document.getElementById('setting-invert-y').checked = GAME_SETTINGS.invertY;
    document.getElementById('setting-mobile-ui').checked = GAME_SETTINGS.showMobileControls;
}
syncSettingDisplays();

// Pre-fill the name input from the last saved name.
myName = GAME_SETTINGS.playerName || '';
const nameInput = document.getElementById('input-player-name');
if (nameInput) nameInput.value = myName;

refreshMobileControls();

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