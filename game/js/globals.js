// --- DEVELOPER MODE ---
// Hardcode to true to draw yellow collider gizmos (Unity-style) for every
// prop in the scene, plus a cyan outline of the local player's own collision
// radius. Set false to hide them. Can also be toggled live with the 'G' key
// or Level.setDeveloper(true/false) from the console.
let developer = true;

// --- CONFIGURATION ---
let GAME_SETTINGS = {
    hidingTime: 20,
    huntingTime: 90,
    mouseSensitivity: 0.002,
    invertY: false,
    showMobileControls: true,
    playerName: ''
};

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
let cameraYaw = 0;   // Left/Right look
let cameraPitch = 0.2; // Up/Down look
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

// --- 3D ENGINE REFERENCES ---
let scene, camera, renderer;
let playerMeshes = {}; 
let mapProps3D = [];
let modelLibrary = {};