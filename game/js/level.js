const Level = {
    init: function() {
        const canvas = document.getElementById('gameCanvas');
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb); // Sky blue
        scene.fog = new THREE.Fog(0x87ceeb, 20, 100);

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        scene.add(dirLight);

        // Ground plane
        const groundGeo = new THREE.PlaneGeometry(200, 200);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x228B22 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = false;
        scene.add(ground);

        //const gridHelper = new THREE.GridHelper(200, 50, 0x444444, 0x888888);
        //scene.add(gridHelper);

        // Define your level geometry her
        /*
        mapProps3D = [
            { x: 10, z: -15, type: 'box', size: 3, color: 0x8B4513 },
            { x: -20, z: -10, type: 'cylinder', size: 2, color: 0x556B2F },
            { x: 15, z: 20, type: 'box', size: 6, color: 0x8B4513 },
            { x: -10, z: 25, type: 'sphere', size: 3, color: 0x696969 },
            { x: 0, z: -30, type: 'cylinder', size: 2.5, color: 0x556B2F }
        ];
        */

        mapProps3D = [
            { x:10,z:-15,model:"tree",radius:2,height:8,scale:1 },
            { x:-15,z:5,model:"rock",radius:2,height:2,scale:1 },
            { x:5,z:20,model:"bush",radius:1.5,height:2,scale:1 }
        ];

        mapProps3D.forEach(prop =>
        {
            if(!modelLibrary[prop.model])
            {
                console.warn("Missing model:", prop.model);
                return;
            }

            const mesh =
                modelLibrary[prop.model].clone(true);

            mesh.position.set(
                prop.x,
                prop.y || 0,
                prop.z
            );

            if(typeof prop.scale === "number")
            {
                mesh.scale.setScalar(prop.scale);
            }
            else
            {
                mesh.scale.set(
                    prop.scale.x,
                    prop.scale.y,
                    prop.scale.z
                );
            }

            if(prop.rotation)
            {
                mesh.rotation.set(
                    THREE.MathUtils.degToRad(prop.rotation.x || 0),
                    THREE.MathUtils.degToRad(prop.rotation.y || 0),
                    THREE.MathUtils.degToRad(prop.rotation.z || 0)
                );
            }

            scene.add(mesh);
        });
        
       console.log(modelLibrary);
    },

    loadModels: function(callback)
    {
        const loader = new THREE.GLTFLoader();
        const files = [
            {
                key: "tree",
                path: "assets/models/tree1.glb"
            },
            {
                key: "rock",
                path: "assets/models/rock1.glb"
            },
            {
                key: "bush",
                path: "assets/models/bush1.glb"
            }
        ];

        let loaded = 0;

        files.forEach(file =>
        {
            loader.load(
                file.path,

                (gltf) =>
                {
                    console.log("Loaded:", file.path);

                    modelLibrary[file.key] = gltf.scene;

                    loaded++;

                    if(loaded === files.length)
                    {
                        callback();
                    }
                },

                undefined,

                (err) =>
                {
                    console.error("Failed:",file.path,err);
                }
            );
        });
    },

    resize: function() {
        if (!renderer) return;
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    },

    render: function() {
        if (!gameState || !gameState.players) return; 

        // Remove disconnected players
        for (let id in playerMeshes) {
            if (!gameState.players[id]) { scene.remove(playerMeshes[id]); delete playerMeshes[id]; }
        }

        console.log(gameState.players);
        // Draw active players
        for (let id in gameState.players) {
            let p = gameState.players[id];
            
            if (playerMeshes[id] && playerMeshes[id].userData.disguiseType !== p.disguiseType) {
                scene.remove(playerMeshes[id]); delete playerMeshes[id];
            }

            if (!playerMeshes[id])
            {
                let mesh;

                if(p.role === "Seeker")
                {
                    mesh = new THREE.Mesh(
                        new THREE.BoxGeometry(2,4,2),
                        new THREE.MeshLambertMaterial({
                            color:p.isCaught ? 0x333333 : p.color
                        })
                    );
                }
                else
                {
                    if(p.disguiseType !== "player" && modelLibrary[p.disguiseType])
                    {
                        mesh = modelLibrary[p.disguiseType].clone(true);
                        mesh.scale.setScalar(p.propScale || 1);
                    }
                    else
                    {
                        mesh = new THREE.Mesh(
                            new THREE.CylinderGeometry(1,1,3,16),
                            new THREE.MeshLambertMaterial({
                                color:p.color
                            })
                        );
                    }
                }

                mesh.userData =
                {
                    disguiseType:p.disguiseType
                };

                scene.add(mesh);

                playerMeshes[id] = mesh;
            }

            // Apply Y positions from network
            if (p.disguiseType !== "player")
            {
                playerMeshes[id].position.set(
                    p.x,
                    p.y - (p.propHeight || 0) / 2,
                    p.z
                );
            }
            else
            {
                playerMeshes[id].position.set(
                    p.x,
                    p.y,
                    p.z
                );
            }
            // Rotate mesh to face camera yaw (Optional, but looks nice)
            playerMeshes[id].rotation.y = p.rotY;
        }

        // --- THIRD PERSON CAMERA RIG ---
        if (gameState.players[myId]) {
            const camDistance = 15;
            
            // Calculate orbit positions
            let hDist = camDistance * Math.cos(cameraPitch);
            let vDist = camDistance * Math.sin(cameraPitch);
           
            const p = gameState.players[myId];

            camera.position.x = p.x + hDist * Math.sin(cameraYaw);
            camera.position.z = p.z + hDist * Math.cos(cameraYaw);
            camera.position.y = p.y + vDist + 2; // +2 offsets looking at feet

            camera.lookAt(p.x, p.y + 1.5, p.z);
        }

        renderer.render(scene, camera);
    }
};