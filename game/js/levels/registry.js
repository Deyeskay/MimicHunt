/*=====================================================================
  registry.js – Level registry + loader
  ---------------------------------------------------------------
  Each level file in this folder calls registerLevel(name, props) to
  add itself to the bundle. The lobby reads LEVELS to build its level
  carousel, and the game loads a level's props by name.

  TO ADD A NEW LEVEL:
    1. Create `js/levels/<file>.js` that calls registerLevel('Name', [...]).
    2. Add its filename to the LEVEL_FILES array below.
  No <script> tag needed — loadLevelScripts() injects them for you (in
  this order, so LEVELS[0] is the default map).

  Must be loaded (via its own <script> tag) BEFORE level.js / network.js.
=====================================================================*/

const LEVELS = [];

function registerLevel(name, props) {
    LEVELS.push({ name: name, props: props });
}

// --- The only place you edit to add a level ---
const LEVEL_FILES = [
    'forest.js',
    'arena.js'
];

// Inject each level file in order and resolve once all have registered.
// Sequential so LEVELS keeps LEVEL_FILES order (first = default map).
function loadLevelScripts() {
    if (typeof document === 'undefined') return Promise.resolve();
    return LEVEL_FILES.reduce((chain, file) => chain.then(() => new Promise(resolve => {
        const s = document.createElement('script');
        s.src = 'js/levels/' + file + '?v=10';
        s.onload = resolve;
        s.onerror = () => { console.warn('Level failed to load:', file); resolve(); };
        document.head.appendChild(s);
    })), Promise.resolve());
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LEVELS, registerLevel, LEVEL_FILES, loadLevelScripts };
}
