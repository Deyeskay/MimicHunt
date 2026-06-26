How to add new levels
======================

STEP-1:

use Editor to create a Level and copy that result and paste it in "js/levels/mylevelname.js" 



STEP2:

Now inside register.js

// --- The only place you edit to add a level ---
const LEVEL_FILES = [
    'forest.js',
    'arena.js',
    'mylevel.js'     //<add here>
];
