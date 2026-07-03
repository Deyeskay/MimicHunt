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

// --- Share room link (WhatsApp / any app) + deep-link auto-join ---
// The share button in the lobby builds "<site>?room=CODE". Opening that link
// prefills the code and (if a name is already saved) joins straight into the lobby.
function buildRoomShareUrl(code) {
    return location.origin + location.pathname + '?room=' + encodeURIComponent(code);
}
const shareRoomBtn = document.getElementById('btn-share-room');
if (shareRoomBtn) shareRoomBtn.addEventListener('click', async () => {
    const code = currentRoomCode;
    if (!code) return;
    const url = buildRoomShareUrl(code);
    // Native share sheet on mobile (lets the user pick WhatsApp directly).
    if (navigator.share) {
        try {
            await navigator.share({ title: 'Hide & Hunt', text: 'Join my Hide & Hunt room ' + code + '!', url });
            return;
        } catch (e) {
            if (e && e.name === 'AbortError') return;   // user dismissed the sheet
            // otherwise fall through to clipboard copy
        }
    }
    // Desktop / no Web Share: copy the link and show it so it can be pasted anywhere.
    try {
        await navigator.clipboard.writeText(url);
        UI.showModal('Room link copied!', 'Paste it to your friends:\n\n' + url);
    } catch (e) {
        UI.showModal('Share this room link', url);
    }
});

// Read a ?room=CODE deep link (validated to a real 4-digit code) once, at boot.
function getRoomDeepLink() {
    try {
        const p = new URLSearchParams(location.search).get('room');
        return (p && /^\d{4}$/.test(p)) ? p : null;
    } catch (e) { return null; }
}
// Called once the menu is revealed: honour a ?room= deep link by joining.
function handleRoomDeepLink() {
    const code = getRoomDeepLink();
    if (!code) return;
    const roomInput = document.getElementById('input-room-id');
    if (roomInput) roomInput.value = code;
    // Strip the query so a refresh (or the successor's own re-share) doesn't re-fire it.
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    if (myName && myName.trim()) {
        // Returning player (saved name) — go straight to the lobby.
        commitPlayerName();
        Network.initClient();
    } else {
        // First-timer: need a name before we can join. Strip the menu down to just
        // the name field + JOIN (no hosting / code entry — they came via a link).
        document.body.classList.add('join-via-link');
        UI.updateStatus('Enter your name to join room ' + code + '.');
        const nameEl = document.getElementById('input-player-name');
        if (nameEl) nameEl.focus();
    }
}
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
// --- FPS meter ---
// Averages frame count over ~0.5s windows so the number is readable (not jittering
// every frame). Only touches the DOM when SHOW_FPS is on. The #fps-meter element is
// hidden in markup; reveal it once here based on the flag.
let _fpsFrames = 0, _fpsLast = performance.now();
(function initFps() {
    const el = document.getElementById('fps-meter');
    if (el) el.style.display = SHOW_FPS ? 'block' : 'none';
})();
function updateFps() {
    if (!SHOW_FPS) return;
    _fpsFrames++;
    const now = performance.now();
    const elapsed = now - _fpsLast;
    if (elapsed >= 500) {
        const fps = Math.round((_fpsFrames * 1000) / elapsed);
        const val = document.getElementById('fps-value');
        if (val) val.textContent = fps;
        _fpsFrames = 0;
        _fpsLast = now;
    }
}

// Mobile framerate cap. On 90/120 Hz phones an uncapped rAF renders as fast as the
// panel refreshes, which just heats the SoC → thermal throttle → LOWER, jittery
// sustained FPS. Capping the mobile tier to 60 keeps frametimes steady and cooler.
// 0 = uncapped (Low/Medium/High run at the display's native rate).
const _FRAME_CAP_MOBILE = 60;
let _lastFrameTs = 0;
function animate(now) {
    requestAnimationFrame(animate);
    const cap = (typeof GAME_SETTINGS !== 'undefined' && GAME_SETTINGS.graphicsQuality === 'mobile')
        ? _FRAME_CAP_MOBILE : 0;
    if (cap) {
        if (now === undefined) now = performance.now();
        // −1 ms slack so a 60 Hz panel (16.67 ms frames) doesn't miss the 16.67 ms
        // gate and collapse to 30; on 120 Hz it renders every other frame → ~60.
        if (now - _lastFrameTs < (1000 / cap) - 1) return;
        _lastFrameTs = now;
    }
    updateFps();
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
// --- Boot loading screen: swipeable wallpaper carousel + progress, then a
// "PRESS ENTER TO CONTINUE" gate. The menu is revealed only when the player
// presses Enter or taps Continue — not automatically when assets finish.
// Navigation: swipe/drag, the ‹ › arrows, the dots, or ←/→ keys. A gentle
// auto-advance runs but pauses/reschedules around any manual interaction. ---
const LoadingScreen = (function () {
    const el         = document.getElementById('loading-screen');
    const track      = document.getElementById('ls-track');
    const dotsHost   = document.getElementById('ls-dots');
    const prevBtn    = document.getElementById('ls-prev');
    const nextBtn    = document.getElementById('ls-next');
    const barEl      = document.getElementById('loading-bar');
    const pctEl      = document.getElementById('loading-pct');
    const loadingUI  = document.getElementById('ls-loading');
    const continueEl = document.getElementById('ls-continue');

    // Wallpapers in the carousel (add more files here to extend).
    const SLIDES = [
        'assets/images/loading_screen1.jpg',
        'assets/images/loading_screen2.jpg',
        'assets/images/loading_screen3.jpg'
    ];
    const AUTO_MS = 6000;

    let idx = 0, count = 0, auto = null, ready = false, dismissed = false, onDone = null;

    // Build the slides + dot indicators.
    if (track) {
        SLIDES.forEach((src, i) => {
            const s = document.createElement('div');
            s.className = 'ls-slide';
            s.style.backgroundImage = "url('" + src + "')";
            track.appendChild(s);
            if (dotsHost) {
                const dot = document.createElement('button');
                dot.className = 'ls-dot' + (i === 0 ? ' active' : '');
                dot.addEventListener('click', () => goTo(i, true));
                dotsHost.appendChild(dot);
            }
        });
        count = SLIDES.length;
    }

    function render() {
        if (track) track.style.transform = 'translateX(' + (-idx * 100) + '%)';
        if (dotsHost) for (let i = 0; i < dotsHost.children.length; i++)
            dotsHost.children[i].classList.toggle('active', i === idx);
    }
    function goTo(i, manual) {
        if (!count) return;
        idx = (i % count + count) % count;
        render();
        if (manual) restartAuto();
    }
    const next = (m) => goTo(idx + 1, m);
    const prev = (m) => goTo(idx - 1, m);

    function startAuto()   { if (count > 1 && !dismissed) auto = setInterval(() => next(false), AUTO_MS); }
    function stopAuto()    { if (auto) { clearInterval(auto); auto = null; } }
    function restartAuto() { stopAuto(); startAuto(); }

    if (prevBtn) prevBtn.addEventListener('click', () => prev(true));
    if (nextBtn) nextBtn.addEventListener('click', () => next(true));

    // --- Swipe / drag (pointer events) ---
    let dragging = false, startX = 0, dx = 0, w = 0;
    function onDown(e) {
        if (!count) return;
        dragging = true; startX = e.clientX; dx = 0;
        w = (el ? el.clientWidth : window.innerWidth) || 1;
        stopAuto();
        if (track) {
            track.classList.add('dragging');
            if (track.setPointerCapture) { try { track.setPointerCapture(e.pointerId); } catch (_) {} }
        }
    }
    function onMove(e) {
        if (!dragging) return;
        dx = e.clientX - startX;
        if (track) track.style.transform = 'translateX(calc(' + (-idx * 100) + '% + ' + dx + 'px))';
    }
    function onUp() {
        if (!dragging) return;
        dragging = false;
        if (track) track.classList.remove('dragging');
        const threshold = Math.min(80, w * 0.15);
        if (dx <= -threshold) next(false);
        else if (dx >= threshold) prev(false);
        else render();
        restartAuto();
    }
    if (track) {
        track.addEventListener('pointerdown', onDown);
        track.addEventListener('pointermove', onMove);
        track.addEventListener('pointerup', onUp);
        track.addEventListener('pointercancel', onUp);
    }

    // --- Keyboard: arrows navigate, Enter continues ---
    function onKey(e) {
        if (e.key === 'ArrowLeft')       prev(true);
        else if (e.key === 'ArrowRight') next(true);
        else if (e.key === 'Enter')      dismiss();
    }
    window.addEventListener('keydown', onKey);

    function dismiss() {
        if (!ready || dismissed) return;   // only after assets are ready, once
        dismissed = true;
        stopAuto();
        window.removeEventListener('keydown', onKey);
        if (el) {
            el.classList.add('hidden');
            setTimeout(() => { el.style.display = 'none'; }, 550);   // after the fade
        }
        if (onDone) onDone();
    }
    if (continueEl) continueEl.addEventListener('click', dismiss);

    render();
    startAuto();

    return {
        setProgress: function (loaded, total) {
            const pct = Math.round((loaded / total) * 100);
            if (barEl) barEl.style.width = pct + '%';
            if (pctEl) pctEl.textContent = pct + '%';
        },
        // Assets loaded → swap the bar for the press-enter prompt; cb runs on dismiss.
        markReady: function (cb) {
            onDone = cb;
            ready = true;
            if (barEl) barEl.style.width = '100%';
            if (pctEl) pctEl.textContent = '100%';
            if (loadingUI) loadingUI.style.display = 'none';
            if (continueEl) continueEl.style.display = 'flex';
        }
    };
})();

// Load all level files (registry.js → LEVEL_FILES) before init reads LEVELS.
loadLevelScripts().then(() =>
{
    Level.loadModels(() =>
    {
        Level.init();
        Mechanics.initInputs();
        animate();
        // Assets ready → show "PRESS ENTER TO CONTINUE"; reveal the menu only when
        // the player confirms (Enter / tap), handled inside LoadingScreen.
        LoadingScreen.markReady(() => {
            document.getElementById('menu-screen').style.display = 'flex';
            handleRoomDeepLink();
        });
    }, (loaded, total) => LoadingScreen.setProgress(loaded, total));
});

const savedSettings = localStorage.getItem('hidehunt_settings');

// Auto-detect mobile/tablet on a FRESH install (no saved settings) and default the
// graphics tier to 'mobile' — the most aggressive preset (pixelRatio 1, 1024² shadows,
// pulled-in fog). Coarse pointer (no hover) or a mobile UA both count. Returning users
// keep whatever they saved.
function isMobileDevice() {
    const coarse = window.matchMedia &&
        (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches);
    const ua = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini/i.test(navigator.userAgent || '');
    return !!(coarse || ua);
}
if(!savedSettings && isMobileDevice()) {
    GAME_SETTINGS.graphicsQuality = 'mobile';
    const g = document.getElementById('setting-graphics');
    if (g) g.value = 'mobile';
}

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