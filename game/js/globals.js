// --- CONFIGURATION ---
let GAME_SETTINGS = {
    hidingTime: 20,
    huntingTime: 90,
    mouseSensitivity: 0.002,
    invertY: false,
    showMobileControls: true
};

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
let gameLoopInterval = null;
let timerInterval = null;

// --- PHYSICS & LOCAL PLAYER DATA ---
let localPos = { x: 0, y: 2, z: 0 }; // Added Y for verticality
let localDisguise = { type: 'player', size: 2, color: 0x2ed573 };

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