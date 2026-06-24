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

        const gridHelper = new THREE.GridHelper(200, 50, 0x444444, 0x888888);
        scene.add(gridHelper);

        // Define your level geometry here
        mapProps3D = [
            { x: 10, z: -15, type: 'box', size: 3, color: 0x8B4513 },
            { x: -20, z: -10, type: 'cylinder', size: 2, color: 0x556B2F },
            { x: 15, z: 20, type: 'box', size: 4, color: 0x8B4513 },
            { x: -10, z: 25, type: 'sphere', size: 3, color: 0x696969 },
            { x: 0, z: -30, type: 'cylinder', size: 2.5, color: 0x556B2F }
        ];

        mapProps3D.forEach(prop => {
            let geo, mat;
            mat = new THREE.MeshLambertMaterial({ color: prop.color });
            if (prop.type === 'box') geo = new THREE.BoxGeometry(prop.size, prop.size, prop.size);
            if (prop.type === 'cylinder') geo = new THREE.CylinderGeometry(prop.size/2, prop.size/2, prop.size);
            if (prop.type === 'sphere') geo = new THREE.SphereGeometry(prop.size/1.5, 16, 16);
            
            let mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(prop.x, prop.size/2, prop.z);
            scene.add(mesh);
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

        // Draw active players
        for (let id in gameState.players) {
            let p = gameState.players[id];
            
            if (playerMeshes[id] && playerMeshes[id].userData.disguiseType !== p.disguiseType) {
                scene.remove(playerMeshes[id]); delete playerMeshes[id];
            }

            if (!playerMeshes[id]) {
                let geo, mat;
                let pColor = p.isCaught ? 0x333333 : p.color;

                if (p.role === 'Seeker') { 
                    geo = new THREE.BoxGeometry(2, 4, 2); 
                } else {
                    if (p.disguiseType === 'box') geo = new THREE.BoxGeometry(p.disguiseSize, p.disguiseSize, p.disguiseSize);
                    else if (p.disguiseType === 'cylinder') geo = new THREE.CylinderGeometry(p.disguiseSize/2, p.disguiseSize/2, p.disguiseSize);
                    else if (p.disguiseType === 'sphere') geo = new THREE.SphereGeometry(p.disguiseSize/1.5, 16, 16);
                    else geo = new THREE.CylinderGeometry(1, 1, 3, 16); // Default character
                }

                mat = new THREE.MeshLambertMaterial({ color: pColor });
                let mesh = new THREE.Mesh(geo, mat);
                mesh.userData = { disguiseType: p.disguiseType };
                scene.add(mesh);
                playerMeshes[id] = mesh;
            }

            let meshHeight = (p.role === 'Seeker' || p.disguiseType === 'player') ? 2 : p.disguiseSize/2;
            playerMeshes[id].position.set(p.x, meshHeight, p.z);
            playerMeshes[id].rotation.y = p.rotY;
        }

        // Camera chases the local player
        if (gameState.players[myId]) {
            const camDistance = 15;
            const camHeight = 8;
            camera.position.x = localPos.x + Math.sin(localRotY) * camDistance;
            camera.position.z = localPos.z + Math.cos(localRotY) * camDistance;
            camera.position.y = camHeight;
            camera.lookAt(localPos.x, 2, localPos.z);
        }

        renderer.render(scene, camera);
    }
};