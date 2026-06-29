// --- DEVELOPER MODE ---
// Hardcode to true to draw yellow collider gizmos (Unity-style) for every
// prop in the scene, plus a cyan outline of the local player's own collision
// radius. Set false to hide them. Can also be toggled live with the 'G' key
// or Level.setDeveloper(true/false) from the console.
let developer = false;

// --- CONFIGURATION ---
let GAME_SETTINGS = {
    hidingTime: 20,
    huntingTime: 300,   // seconds (5 min); settings slider edits this in minutes (5–20)
    mouseSensitivity: 0.002,
    cameraFov: 60,
    graphicsQuality: 'medium',   // 'low' | 'medium' | 'high' (see Level.setGraphicsQuality)
    invertY: false,
    showMobileControls: true,
    playerName: '',
    // PUBG-style custom control layout: per-control { x, y } as % of the
    // viewport (centre of the element). Empty = use DEFAULT_CONTROL_LAYOUT.
    // Edited via the Edit Layout mode (js/layout.js); see LayoutEditor.
    controlLayout: {}
};

// Default on-screen positions for the touch controls (centre of each element as
// % of the viewport). Applied when the player hasn't saved a custom layout, and
// the target that "Reset" reverts to. shoot is stacked on prop (only one shows
// per role). Tuned to match the shipped mockup placement.
const DEFAULT_CONTROL_LAYOUT = {
    joystick: { x: 10.8, y: 73 },
    jump:     { x: 93.5, y: 65 },
    prop:     { x: 87,   y: 84 },
    shoot:    { x: 87,   y: 84 }
};

// True only while the Edit Layout overlay is open — movement/action touch
// handlers (js/mechanics.js) bail out so dragging a button doesn't also
// jump/shoot/move.
let isEditingLayout = false;

// Local player's chosen display name (entered on the menu).
let myName = '';

const HIDING_DURATION = () => GAME_SETTINGS.hidingTime;
const ROUND_DURATION = () => GAME_SETTINGS.huntingTime;

// --- GAME STATE ---
let gameState = { phase: 'LOBBY', timer: 0, players: {} };
let peer = null;
let connections = [];
let connToHost = null;
let isLeavingRoom = false;
let isHost = false;
let myId = null;
let amIReady = false;
let gameLoopInterval = null;   // 60 FPS physics loop
let networkInterval = null;    // 20 Hz network send/broadcast loop
let timerInterval = null;

// --- HOST MIGRATION ---
let migrating = false;         // a host-migration handshake is in flight
let sessionEnding = false;     // a terminal transition (gameOver/roomClosing) is underway — suppress migration

// --- DISCONNECT DETECTION (heartbeat / watchdog) ---
// conn.on('close') is unreliable on abrupt tab close, so the host pings and
// each client times out if it stops hearing from the host.
let heartbeatInterval = null;  // host: periodic ping to all clients (all phases)
let watchdogInterval = null;   // client: checks for host-message silence
const HEARTBEAT_MS = 1000;     // host ping cadence
const HOST_TIMEOUT_MS = 3000;  // client declares the host lost after this silence
const WATCHDOG_MS = 500;       // client check cadence
const CLIENT_TIMEOUT_MS = 3000;// host drops a client after this silence (ghost cleanup)
let departedHostId = null;     // peer id of the host that just dropped (excluded from election)
let pendingRoomCode = null;    // 4-digit code minted by a successor for new joiners
let rejoinExpected = {};       // successor: { peerId: timeoutHandle } of survivors we await
let codePeer = null;           // successor's second Peer (code alias) accepting brand-new joiners

// Network transmission rate (Hz). Physics/render stay at 60 FPS.
const NETWORK_SEND_RATE = 20;

// --- PHYSICS & LOCAL PLAYER DATA ---
let localPos = { x: 0, y: 2, z: 0 }; // Added Y for verticality
// localDisguise is the client-side source of truth for everything the local
// player controls about its appearance. Kept complete so it can be re-applied
// after an authoritative `sync` overwrites gameState.players[myId].
let localDisguise = {
    type: 'player',
    size: 2,
    color: 0x2ed573,
    propScale: 1,
    propHeight: 2,
    propRadius: 1,
    propRotation: null
};

// Camera & Movement Params
let cameraYaw = 0;   // Left/Right look (orbits the camera around the player)
let cameraPitch = 0.2; // Up/Down look
let localRotY = 0;   // character facing = MOVEMENT direction (PUBG-style), not cameraYaw
let velocityY = 0;
const GRAVITY = -0.015;
const JUMP_STRENGTH = 0.35;
let isGrounded = false;
const MOUSE_SENSITIVITY = 0.002;
const INVERT_Y = false;
const CAMERA_MAX_LOOK_UP = 70 * Math.PI / 180;
const CAMERA_MAX_LOOK_DOWN = -10 * Math.PI / 180;

// --- INPUTS ---
let keys = {};
let joyActive = false;
let touchVector = { x: 0, y: 0 };
// Multi-touch tracking: left thumb drives the joystick, right thumb the camera,
// so each is bound to its own touch identifier (PUBG-style dual-stick on mobile).
let joyTouchId = null;
let lookTouchId = null;
let lastLookX = 0;
let lastLookY = 0;

// --- COMBAT (seeker energy-pulse shooting) ---
const MAG_SIZE = 4;            // shots before a reload
const FIRE_INTERVAL_MS = 500;  // min time between shots (1 shot / 0.5s)
const RELOAD_MS = 1500;        // reload duration
const HIDER_MAX_HP = 5;        // hits to eliminate
const SHOT_RANGE = 60;         // max pulse travel / hit range (world units)
const HIT_SCORE = 100;         // points per hit
const REVEAL_MS = 2000;        // hider blinks red this long after a hit
const DISGUISE_LOCK_MS = 5000; // hider can't re-disguise this long after a hit
const SHOOT_ANIM_MS = 1200;    // aim-stance window after a shot (upper-body shoot + face target + back-walk)

// --- REMOTE FOOTSTEPS (heard from OTHER players; computed client-side, no packets) ---
const FOOTSTEP_MAX_DIST   = 40;   // beyond this (world units), remote footsteps are silent
const FOOTSTEP_MIN_DIST   = 4;    // within this, full volume
const FOOTSTEP_SPEED_ON   = 1.5;  // u/s to start stepping (matches anim walk threshold)
const FOOTSTEP_SPEED_OFF  = 0.5;  // u/s hysteresis to stop stepping
const FOOTSTEP_INTERVAL_MS = 330; // step cadence (same as the local player)

let ammo = MAG_SIZE;           // local seeker's current magazine
let reloading = false;
let lastShotAt = 0;
let reloadUntil = 0;

// Lightweight synthesized "pew" so shots have feedback without any audio assets.
const Sound = {
    ctx: null,
    ensure() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    },
    pew() {
        const ctx = this.ensure();
        if (!ctx) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(220, t + 0.12);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.14);
    },
    // Played on the hider that took the hit — a lower "ow" zap, distinct from pew.
    hurt() {
        const ctx = this.ensure();
        if (!ctx) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(420, t);
        osc.frequency.exponentialRampToValueAtTime(90, t + 0.22);
        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
    },
    // Mechanical "cha-chunk" played when a reload starts.
    reload() {
        const ctx = this.ensure();
        if (!ctx) return;
        const t = ctx.currentTime;
        [[0, 200], [0.2, 150]].forEach(([dt, f]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(f, t + dt);
            gain.gain.setValueAtTime(0.0001, t + dt);
            gain.gain.exponentialRampToValueAtTime(0.13, t + dt + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.09);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t + dt);
            osc.stop(t + dt + 0.1);
        });
    },
    // Output node for a sound: a StereoPannerNode (so remote sounds come from the
    // correct side) when a non-zero pan is given and the browser supports it, else
    // the bare destination. Returns a node you connect the sound's gain chain into.
    _spatialOut(pan) {
        const ctx = this.ensure();
        if (!ctx) return null;
        if (pan && ctx.createStereoPanner) {
            const p = ctx.createStereoPanner();
            p.pan.value = Math.max(-1, Math.min(1, pan));
            p.connect(ctx.destination);
            return p;
        }
        return ctx.destination;
    },
    // Short burst of band-limited white noise — the texture base for footsteps and
    // landing thuds (a pure oscillator reads as "musical", noise reads as physical).
    // `out` lets a caller route through a panner; defaults to the destination.
    _noiseBurst(dur, { freq = 400, q = 0.7, gain = 0.07, type = 'lowpass', out = null } = {}) {
        const ctx = this.ensure();
        if (!ctx) return;
        const t = ctx.currentTime;
        const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filt = ctx.createBiquadFilter();
        filt.type = type; filt.frequency.value = freq; filt.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(filt).connect(g).connect(out || ctx.destination);
        src.start(t);
        src.stop(t + dur);
    },
    // Footstep: a low sine "body" tap (carries the loudness) plus a brighter noise
    // scuff for texture. `right` alternates pitch/cutoff so a gait doesn't sound
    // like one repeated sample. opts.volume (0..1) and opts.pan (-1..1) let remote
    // players' steps attenuate with distance and come from the correct side; with
    // no opts (the local player) it's full-volume mono — unchanged behaviour.
    step(right, opts = {}) {
        const ctx = this.ensure();
        if (!ctx) return;
        const vol = opts.volume == null ? 1 : opts.volume;
        if (vol <= 0.001) return;
        const out = this._spatialOut(opts.pan || 0);
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const f = right ? 130 : 110;
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.65, t + 0.07);
        gain.gain.setValueAtTime(0.22 * vol, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        osc.connect(gain).connect(out);
        osc.start(t);
        osc.stop(t + 0.1);
        this._noiseBurst(0.07, { freq: right ? 900 : 760, q: 0.9, gain: 0.13 * vol, out });
    },
    // Quick upward "whoomp" as the player leaves the ground.
    jump() {
        const ctx = this.ensure();
        if (!ctx) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(620, t + 0.16);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.21);
    },
    // Low thud as the player touches down — tonal drop plus a noise transient.
    land() {
        const ctx = this.ensure();
        if (!ctx) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(170, t);
        osc.frequency.exponentialRampToValueAtTime(65, t + 0.12);
        gain.gain.setValueAtTime(0.26, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.16);
        this._noiseBurst(0.08, { freq: 320, q: 0.6, gain: 0.12 });
    },
    // Crisp UI blip for menu / button presses — matches the sci-fi energy theme.
    click() {
        const ctx = this.ensure();
        if (!ctx) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(680, t);
        osc.frequency.exponentialRampToValueAtTime(1040, t + 0.04);
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.08);
    }
};

// --- 3D ENGINE REFERENCES ---
let scene, camera, renderer;
let playerMeshes = {};
let mapProps3D = [];
let modelLibrary = {};