const Level = {
    init: function() {
        const canvas = document.getElementById('gameCanvas');
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);
        scene.fog = new THREE.Fog(0x87ceeb, 20, 100);

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        scene.add(dirLight);

        const groundGeo = new THREE.PlaneGeometry(200, 200);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x228B22 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = false;
        scene.add(ground);

        // Load the first registered level as the default. Levels come from the
        // js/levels/ folder via the registry (LEVELS); the lobby lets the host
        // pick which one, and loadLevel() swaps it in at game start.
        const def = (typeof LEVELS !== 'undefined' && LEVELS[0]) ? LEVELS[0].props : [];
        this.loadLevel(def);
    },

    // Swap the active level: remove the previous level's prop meshes and spawn
    // the new ones. Props are cloned so enrichProp() doesn't mutate the shared
    // registry source (the same level can be loaded repeatedly).
    loadLevel: function(props) {
        if (this.levelMeshes) {
            this.levelMeshes.forEach(m => scene.remove(m));
        }
        this.levelMeshes = [];

        mapProps3D = JSON.parse(JSON.stringify(props || []));
        mapProps3D.forEach(prop => this.spawnProp(prop));

        this.buildColliderGizmos();
    },

    // --- DEVELOPER MODE: collider visualization ---
    // Draw a yellow cylinder outline matching each prop's ACTUAL collider:
    // a circle of radius prop.radius centered at (centerX, centerZ), from the
    // ground up to topY. This is exactly what mechanics.handleLocalMovement
    // tests against, so it reveals over-sized / overlapping colliders.
    buildColliderGizmos: function() {
        if (this.colliderHelpers) this.colliderHelpers.forEach(h => scene.remove(h));
        this.colliderHelpers = [];
        if (!developer || !scene) return;

        for (const prop of mapProps3D) {
            if (prop.model === 'spawn') continue;
            if (!PropLevel.hasCollision(prop)) continue;

            // One outline per collider piece (e.g. trunk + canopy for a tree).
            for (const c of PropLevel.getColliders(prop)) {
                const h = Math.max(c.yMax - c.yMin, 0.1);
                const geo = new THREE.CylinderGeometry(c.radius, c.radius, h, 24);
                const mat = new THREE.LineBasicMaterial({ color: 0xffff00 });
                mat.depthTest = false;   // draw over geometry like editor gizmos
                const helper = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat);
                helper.position.set(c.x, (c.yMin + c.yMax) / 2, c.z);
                helper.renderOrder = 999;
                scene.add(helper);
                this.colliderHelpers.push(helper);
                geo.dispose();
            }
        }
    },

    // Toggle developer gizmos at runtime (console or 'G' key).
    setDeveloper: function(on) {
        developer = !!on;
        this.buildColliderGizmos();
        if (!developer && this.playerColliderHelper) {
            scene.remove(this.playerColliderHelper);
            this.playerColliderHelper = null;
        }
    },

    spawnProp: function(prop) {
        // Spawn markers are placement metadata only — they stay in mapProps3D so
        // PropLevel.getSpawnPositions can find them, but they have no in-game
        // mesh and are never rendered or collided with. Still resolve their
        // gameplay flags from the prefab (so collision=false is concrete).
        if (prop.model === 'spawn') { PropLevel.resolveGameplay(prop); return; }

        const mesh = PropLevel.createPropMesh(prop, modelLibrary);
        if (!mesh) {
            console.warn("Missing model:", prop.model);
            return;
        }

        PropLevel.enrichProp(prop, mesh);
        mesh.userData.propData = prop;
        scene.add(mesh);
        (this.levelMeshes = this.levelMeshes || []).push(mesh);
    },

    loadModels: function(callback) {
        const loader = new THREE.GLTFLoader();
        const files = [
            { key: "tree", path: "assets/models/tree1.glb" },
            { key: "rock", path: "assets/models/rock1.glb" },
            { key: "bush", path: "assets/models/bush1.glb" }
        ];

        let loaded = 0;

        files.forEach(file => {
            loader.load(
                file.path,
                (gltf) => {
                    modelLibrary[file.key] = gltf.scene;
                    loaded++;
                    if (loaded === files.length) callback();
                },
                undefined,
                (err) => console.error("Failed:", file.path, err)
            );
        });
    },

    resize: function() {
        if (!renderer) return;
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    },

    createPlayerMesh: function(p) {
        if (p.role === "Seeker") {
            return new THREE.Mesh(
                new THREE.BoxGeometry(2, 4, 2),
                new THREE.MeshLambertMaterial({
                    color: p.isCaught ? 0x333333 : p.color
                })
            );
        }

        if (p.disguiseType !== "player") {
            const mesh = PropLevel.createDisguiseMesh(p.disguiseType, modelLibrary, p.propScale);
            if (mesh) {
                mesh.userData.meshKey = PropLevel.getDisguiseMeshKey(p);
                return mesh;
            }
        }

        return new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 3, 16),
            new THREE.MeshLambertMaterial({ color: p.color })
        );
    },

    updatePlayerMeshTransform: function(mesh, p) {
        if (p.disguiseType !== "player" && p.role !== "Seeker") {
            const baseHeight = PropLevel.getDisguiseBaseHeight(p);
            const groundY = PropLevel.getPlayerGroundY(p.y, baseHeight);

            mesh.position.set(p.x, groundY, p.z);
            mesh.rotation.set(
                p.propRotation ? THREE.MathUtils.degToRad(p.propRotation.x || 0) : 0,
                p.rotY,
                p.propRotation ? THREE.MathUtils.degToRad(p.propRotation.z || 0) : 0
            );
        // Position already accounts for precomputed bounds; no groundObject needed.
            return;
        }

        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.y = p.rotY;
    },

    render: function() {
        if (!gameState || !gameState.players) return;

        // Sample remote players from the snapshot buffer at a fixed delay behind
        // real time. Interpolation between buffered snapshots (in Network) does
        // the smoothing, so the render loop just applies the result.
        const sampled = Network.sampleSnapshot(Network.now() - Network.INTERP_DELAY);

        for (let id in playerMeshes) {
            if (!gameState.players[id]) {
                scene.remove(playerMeshes[id]);
                delete playerMeshes[id];
            }
        }

        for (let id in gameState.players) {
            let p = gameState.players[id];
            const meshKey = p.disguiseType !== "player" ? PropLevel.getDisguiseMeshKey(p) : p.disguiseType;

            if (
                playerMeshes[id] &&
                (playerMeshes[id].userData.disguiseType !== p.disguiseType ||
                 playerMeshes[id].userData.meshKey !== meshKey)
            ) {
                scene.remove(playerMeshes[id]);
                delete playerMeshes[id];
            }

            if (!playerMeshes[id]) {
                const mesh = this.createPlayerMesh(p);
                mesh.userData.disguiseType = p.disguiseType;
                mesh.userData.meshKey = meshKey;
                scene.add(mesh);
                playerMeshes[id] = mesh;
            }

            const mesh = playerMeshes[id];

            // The local player is simulated at 60 FPS, so render it exactly.
            // Remote players are drawn from the interpolated snapshot buffer;
            // until a sample exists we fall back to their last known record.
            if (id === myId) {
                this.updatePlayerMeshTransform(mesh, p);
            } else {
                const s = sampled && sampled[id];
                this.updatePlayerMeshTransform(
                    mesh,
                    s ? { ...p, x: s.x, y: s.y, z: s.z, rotY: s.rotY } : p
                );
            }
        }

        // Developer: outline the local player's own collision radius (cyan) so
        // you can see why you wedge in tight spaces — myRadius (1 for player,
        // disguiseSize/2 when disguised) plus each prop radius is the no-go gap.
        if (developer && gameState.players[myId]) {
            const p = gameState.players[myId];
            const myRadius = localDisguise.type === 'player' ? 1 : (localDisguise.size / 2);
            // When disguised, the player takes the target prop's footprint AND
            // its height (propHeight), so the cyan gizmo matches the yellow prop
            // collider it's imitating instead of a constant 3-tall cylinder.
            const myHeight = localDisguise.type === 'player' ? 3 : (localDisguise.propHeight || 3);
            if (!this.playerColliderHelper ||
                this.playerColliderHelper.userData.r !== myRadius ||
                this.playerColliderHelper.userData.h !== myHeight) {
                if (this.playerColliderHelper) scene.remove(this.playerColliderHelper);
                const geo = new THREE.CylinderGeometry(myRadius, myRadius, myHeight, 24);
                const mat = new THREE.LineBasicMaterial({ color: 0x00e5ff });
                mat.depthTest = false;
                this.playerColliderHelper = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat);
                this.playerColliderHelper.renderOrder = 999;
                this.playerColliderHelper.userData.r = myRadius;
                this.playerColliderHelper.userData.h = myHeight;
                scene.add(this.playerColliderHelper);
                geo.dispose();
            }
            this.playerColliderHelper.position.set(p.x, this.playerColliderHelper.userData.h / 2, p.z);
        } else if (!developer && this.playerColliderHelper) {
            scene.remove(this.playerColliderHelper);
            this.playerColliderHelper = null;
        }

        if (gameState.players[myId]) {
            const camDistance = 15;
            let hDist = camDistance * Math.cos(cameraPitch);
            let vDist = camDistance * Math.sin(cameraPitch);
            const p = gameState.players[myId];

            camera.position.x = p.x + hDist * Math.sin(cameraYaw);
            camera.position.z = p.z + hDist * Math.cos(cameraYaw);
            camera.position.y = p.y + vDist + 2;
            camera.lookAt(p.x, p.y + 1.5, p.z);
        }

        renderer.render(scene, camera);
    }
};
