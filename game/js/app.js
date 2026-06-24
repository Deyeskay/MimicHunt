// --- BIND HTML BUTTONS TO NETWORK LOGIC ---
document.getElementById('btn-host').addEventListener('click', () => Network.initHost());
document.getElementById('btn-join').addEventListener('click', () => Network.initClient());
document.getElementById('btn-leave').addEventListener('click', () => Network.exitRoom());
document.getElementById('btn-lobby-leave').addEventListener('click', () => Network.exitRoom());

document.getElementById('btn-lobby-action').addEventListener('click', () => {
    if (isHost) {
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
Level.init();
Mechanics.initInputs();
animate();