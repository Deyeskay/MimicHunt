// --- BIND HTML BUTTONS TO NETWORK LOGIC ---
document.getElementById('btn-host').addEventListener('click', () => Network.initHost());
document.getElementById('btn-join').addEventListener('click', () => Network.initClient());
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
        const players = Object.values(gameState.players); 
        const allReady = players.every(p => p.isReady);

        if(!allReady)
        {
            UI.showModal(
                "Players Not Ready",
                "Everyone must mark Ready before starting."
            );
            return;
        }

        Network.startGameBroadcast();
    } else {
        amIReady = !amIReady;
        document.getElementById('btn-lobby-action').innerText = amIReady ? "Unready" : "Mark Ready";
        document.getElementById('btn-lobby-action').className = amIReady ? "secondary" : "success";
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
Level.loadModels(() =>
{
    Level.init();
    Mechanics.initInputs();
    animate();
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