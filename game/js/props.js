const PropLevel = {
    WALL_COLOR: 0xc8b59a,
    PLAYER_BASE_HEIGHT: 1.5,

    createWallMesh: function() {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshLambertMaterial({ color: this.WALL_COLOR })
        );
        mesh.scale.set(4, 3, 0.3);
        return mesh;
    },

    applyScale: function(mesh, scale) {
        if (typeof scale === 'number') {
            mesh.scale.setScalar(scale);
        } else if (scale) {
            mesh.scale.set(scale.x, scale.y, scale.z);
        }
    },

    // Apply transformation to a prop mesh using precomputed bounds exported from the editor.
    // The editor now provides bottomY, topY, centerX, centerZ, height, radius.
    // Position the mesh so that its bottom aligns with the ground (groundY = 0).
    applyPropTransform: function(mesh, prop) {
        // Horizontal placement uses the original x/z coordinates.
        const x = prop.x;
        const z = prop.z;
        // Vertical placement uses the exported bottomY to offset the mesh.
        // groundY is assumed to be 0 (the ground plane's y position).
        const y = (prop.bottomY !== undefined) ? -prop.bottomY : (prop.y || 0);
        mesh.position.set(x, y, z);

        this.applyScale(mesh, prop.scale);
        if (prop.rotation) {
            mesh.rotation.set(
                THREE.MathUtils.degToRad(prop.rotation.x || 0),
                THREE.MathUtils.degToRad(prop.rotation.y || 0),
                THREE.MathUtils.degToRad(prop.rotation.z || 0)
            );
        }
        // No runtime groundObject call needed – bounds are pre‑computed.
    },

    createPropMesh: function(prop, modelLibrary) {
        let mesh;

        if (prop.model === 'wall') {
            mesh = this.createWallMesh();
        } else if (modelLibrary[prop.model]) {
            mesh = modelLibrary[prop.model].clone(true);
        } else {
            return null;
        }

        this.applyPropTransform(mesh, prop);
        return mesh;
    },

    createDisguiseMesh: function(disguiseType, modelLibrary, scale) {
        if (disguiseType === 'wall') {
            const mesh = this.createWallMesh();
            this.applyScale(mesh, scale ?? 1);
            return mesh;
        }

        if (disguiseType !== 'player' && modelLibrary[disguiseType]) {
            const mesh = modelLibrary[disguiseType].clone(true);
            this.applyScale(mesh, scale ?? 1);
            return mesh;
        }

        return null;
    },

    getDisguiseBaseHeight: function(player) {
        if (player.disguiseType === 'player') return this.PLAYER_BASE_HEIGHT;
        return player.propRadius || this.PLAYER_BASE_HEIGHT;
    },

    getPlayerGroundY: function(playerY, baseHeight) {
        return playerY - baseHeight;
    },

    positionDisguiseMesh: function(mesh, x, z, groundY) {
        mesh.position.set(x, 0, z);
        this.groundObject(mesh, groundY);
    },

    getDisguiseMeshKey: function(player) {
        return `${player.disguiseType}:${JSON.stringify(player.propScale ?? 1)}`;
    },

    computeBounds: function(object) {
        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        box.getSize(size);

        return {
            radius: Math.max(size.x, size.z) * 0.5,
            height: size.y,
            topY: box.max.y,
            bottomY: box.min.y,
            centerX: (box.min.x + box.max.x) * 0.5,
            centerZ: (box.min.z + box.max.z) * 0.5
        };
    },

    syncBoundsToData: function(object) {
        if (!object.userData?.data) return null;
        Object.assign(object.userData.data, this.computeBounds(object));
        return object.userData.data;
    },

    enrichProp: function(prop, mesh) {
        const bounds = this.computeBounds(mesh);

        prop.centerX = bounds.centerX;
        prop.centerZ = bounds.centerZ;
        prop.topY = bounds.topY;
        prop.bottomY = bounds.bottomY;
        prop.radius = bounds.radius;
        prop.height = bounds.height;

        if (prop.collision === undefined) prop.collision = true;
        if (prop.climbable === undefined) prop.climbable = true;
        if (prop.hideSpot === undefined) prop.hideSpot = false;

        return prop;
    },

    hasCollision: function(prop) {
        return prop.collision !== false;
    },

    isClimbable: function(prop) {
        return prop.climbable === true;
    },

    canDisguiseAs: function(prop) {
        if (prop.model === 'wall') return false;
        if (prop.hideSpot) return true;
        return ['tree', 'rock', 'bush'].includes(prop.model);
    },

    getPropCenter: function(prop) {
        return {
            x: prop.centerX ?? prop.x,
            z: prop.centerZ ?? prop.z
        };
    },

    getPropTop: function(prop) {
        if (prop.topY != null) return prop.topY;
        return (prop.y || 0) + (prop.height || 0);
    },

    getSpawnPositions: function(props) {
        const seekerSpawns = props.filter(p => p.seekerSpawn);
        const hiderSpawns = props.filter(p => p.hiderSpawn);
        const genericSpawns = props.filter(p => p.spawnPoint);

        return {
            seeker: seekerSpawns.length ? seekerSpawns : genericSpawns,
            hider: hiderSpawns.length ? hiderSpawns : genericSpawns
        };
    },

    pickSpawn: function(candidates, usedPositions) {
        if (!candidates.length) {
            return {
                x: Math.random() * 20 - 10,
                y: this.PLAYER_BASE_HEIGHT,
                z: Math.random() * 20 - 10
            };
        }

        const shuffled = candidates.slice().sort(() => Math.random() - 0.5);

        for (const prop of shuffled) {
            const center = this.getPropCenter(prop);
            const pos = {
                x: center.x,
                y: this.getPropTop(prop) + this.PLAYER_BASE_HEIGHT,
                z: center.z
            };

            const tooClose = usedPositions.some(p =>
                Math.hypot(p.x - pos.x, p.z - pos.z) < 3
            );

            if (!tooClose) return pos;
        }

        const fallback = shuffled[0];
        const center = this.getPropCenter(fallback);
        return {
            x: center.x,
            y: this.getPropTop(fallback) + this.PLAYER_BASE_HEIGHT,
            z: center.z
        };
    },

    exportProp: function(object) {
        const bounds = this.computeBounds(object);
        const data = object.userData.data;

        return {
            id: data.name,
            x: Number(object.position.x.toFixed(2)),
            y: Number(object.position.y.toFixed(2)),
            z: Number(object.position.z.toFixed(2)),
            model: data.model,
            collision: data.collision,
            climbable: data.climbable,
            hideSpot: data.hideSpot,
            spawnPoint: data.spawnPoint,
            seekerSpawn: data.seekerSpawn,
            hiderSpawn: data.hiderSpawn,
            radius: Number(bounds.radius.toFixed(2)),
            height: Number(bounds.height.toFixed(2)),
            topY: Number(bounds.topY.toFixed(2)),
            bottomY: Number(bounds.bottomY.toFixed(2)),
            centerX: Number(bounds.centerX.toFixed(2)),
            centerZ: Number(bounds.centerZ.toFixed(2)),
            scale: {
                x: Number(object.scale.x.toFixed(2)),
                y: Number(object.scale.y.toFixed(2)),
                z: Number(object.scale.z.toFixed(2))
            },
            rotation: {
                x: Number(THREE.MathUtils.radToDeg(object.rotation.x).toFixed(1)),
                y: Number(THREE.MathUtils.radToDeg(object.rotation.y).toFixed(1)),
                z: Number(THREE.MathUtils.radToDeg(object.rotation.z).toFixed(1))
            }
        };
    },

    groundObject: function(object, groundY) {
        const box = new THREE.Box3().setFromObject(object);
        object.position.y += groundY - box.min.y;
        return object;
    }
};
