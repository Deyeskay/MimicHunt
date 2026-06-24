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

// --- LOCAL PLAYER DATA ---
let localPos = { x: 0, z: 0 };
let localRotY = 0;
let localDisguise = { type: 'player', size: 2, color: 0x2ed573 };

// --- INPUTS ---
let keys = {};
let joyActive = false; 
let touchVector = { x: 0, y: 0 };

// --- 3D ENGINE REFERENCES ---
let scene, camera, renderer;
let playerMeshes = {}; 
let mapProps3D = [];