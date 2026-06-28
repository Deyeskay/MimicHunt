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
document.getElementById('btn-leave').addEventListener('click', () => Network.leaveMatch());
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
    GAME_SETTINGS.invertY = document.getElementById('setting-invert-y').checked; 
    GAME_SETTINGS.showMobileControls = document.getElementById('setting-mobile-ui').checked;

    localStorage.setItem('hidehunt_settings',JSON.stringify(GAME_SETTINGS));
    UI.showModal("Saved","Settings saved successfully.");
});

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
    GAME_SETTINGS = JSON.parse(savedSettings); 
    document.getElementById('setting-hide-time').value = GAME_SETTINGS.hidingTime; 
    document.getElementById('setting-hunt-time').value = GAME_SETTINGS.huntingTime; 
    document.getElementById('setting-sensitivity').value = GAME_SETTINGS.mouseSensitivity; 
    document.getElementById('setting-invert-y').checked = GAME_SETTINGS.invertY; 
    document.getElementById('setting-mobile-ui').checked = GAME_SETTINGS.showMobileControls;
}

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