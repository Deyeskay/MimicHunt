// --- CONFIGURATION ---
const HIDING_DURATION = 20;
const ROUND_DURATION = 90;

// --- GAME STATE ---
let gameState = { phase: 'LOBBY', timer: 0, players: {} };
let peer = null;
let connections = [];
let connToHost = null;
let isHost = false;
let myId = null;
let amIReady = false;
let gameLoopInterval = null;

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

// --- INPUTS ---
let keys = {};
let joyActive = false; 
let touchVector = { x: 0, y: 0 };

// --- 3D ENGINE REFERENCES ---
let scene, camera, renderer;
let playerMeshes = {}; 
let mapProps3D = [];