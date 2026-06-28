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

    // Prefab lookup with a safe fallback for unknown models.
    getPrefab: function(model) {
        if (typeof PrefabLibrary !== 'undefined' && PrefabLibrary[model]) {
            return PrefabLibrary[model];
        }
        return (typeof PREFAB_DEFAULT !== 'undefined')
            ? PREFAB_DEFAULT
            : { collision: true, climbable: false, hideSpot: false, canDisguise: false };
    },

    // Fill any gameplay metadata the instance didn't specify from its prefab.
    // Instance values always win when present (explicit per-level overrides); a
    // field that's omitted falls back to the prefab's type default.
    resolveGameplay: function(prop) {
        const def = this.getPrefab(prop.model);
        if (prop.collision === undefined) prop.collision = def.collision;
        if (prop.climbable === undefined) prop.climbable = def.climbable;
        if (prop.hideSpot === undefined) prop.hideSpot = def.hideSpot;
        return prop;
    },

    enrichProp: function(prop, mesh) {
        const bounds = this.computeBounds(mesh);

        prop.centerX = bounds.centerX;
        prop.centerZ = bounds.centerZ;
        prop.topY = bounds.topY;
        prop.bottomY = bounds.bottomY;
        prop.radius = bounds.radius;
        prop.height = bounds.height;

        this.resolveGameplay(prop);
        prop.colliders = this.resolveColliders(prop, bounds, this.getPrefab(prop.model));

        return prop;
    },

    // Turn a prefab's optional `colliders` template (fractions of bounds) into
    // concrete world cylinders { x, z, radius, yMin, yMax }. With no template,
    // fall back to one full-height cylinder = the model's bounding box (the
    // original single-collider behavior). Offsets are rotated by rotation.y.
    resolveColliders: function(prop, bounds, def) {
        const R = bounds.radius;
        const H = bounds.height;
        const base = bounds.bottomY;
        const tmpl = (def && def.colliders && def.colliders.length) ? def.colliders : null;

        if (!tmpl) {
            return [{ x: bounds.centerX, z: bounds.centerZ, radius: R, yMin: base, yMax: bounds.topY }];
        }

        const ry = THREE.MathUtils.degToRad((prop.rotation && prop.rotation.y) || 0);
        const cos = Math.cos(ry), sin = Math.sin(ry);

        return tmpl.map(c => {
            const ox = (c.offsetX || 0) * R;
            const oz = (c.offsetZ || 0) * R;
            return {
                x: bounds.centerX + ox * cos - oz * sin,
                z: bounds.centerZ + ox * sin + oz * cos,
                radius: (c.radius != null ? c.radius : 1) * R,
                yMin: base + (c.yMin != null ? c.yMin : 0) * H,
                yMax: base + (c.yMax != null ? c.yMax : 1) * H
            };
        });
    },

    // Safe accessor: precomputed colliders if enriched, else a single cylinder
    // derived from whatever bounds the prop already carries (never throws).
    getColliders: function(prop) {
        if (prop.colliders && prop.colliders.length) return prop.colliders;
        const cx = prop.centerX != null ? prop.centerX : prop.x;
        const cz = prop.centerZ != null ? prop.centerZ : prop.z;
        return [{
            x: cx, z: cz,
            radius: prop.radius || 0.5,
            yMin: prop.bottomY != null ? prop.bottomY : 0,
            yMax: this.getPropTop(prop)
        }];
    },

    hasCollision: function(prop) {
        return prop.collision !== false;
    },

    // Ray vs the level's collidable props (vertical-cylinder colliders). Returns
    // the nearest blocking distance along the ray within maxRange, or Infinity if
    // nothing blocks. (O is the ray origin, D the UNIT direction, so t is the 3D
    // distance.) Used so shots stop at rocks/trees instead of passing through.
    raycastProps: function(ox, oy, oz, dx, dy, dz, maxRange) {
        if (typeof mapProps3D === 'undefined' || !mapProps3D) return Infinity;
        const range = maxRange || 60;
        let best = Infinity;

        for (let i = 0; i < mapProps3D.length; i++) {
            const prop = mapProps3D[i];
            if (prop.model === 'spawn' || !this.hasCollision(prop)) continue;
            const pieces = this.getColliders(prop);
            for (let j = 0; j < pieces.length; j++) {
                const c = pieces[j];
                const ex = ox - c.x, ez = oz - c.z;
                const a = dx * dx + dz * dz;
                if (a < 1e-6) continue;                 // near-vertical ray: no column hit
                const b = 2 * (ex * dx + ez * dz);
                const cc = ex * ex + ez * ez - c.radius * c.radius;
                let disc = b * b - 4 * a * cc;
                if (disc < 0) continue;
                disc = Math.sqrt(disc);
                let t = (-b - disc) / (2 * a);          // nearest entry
                if (t < 0) t = (-b + disc) / (2 * a);   // origin inside → exit point
                if (t < 0 || t > range || t >= best) continue;
                const y = oy + dy * t;                  // height at the entry point
                if (y < c.yMin || y > c.yMax) continue; // outside the cylinder's band
                best = t;
            }
        }
        return best;
    },

    isClimbable: function(prop) {
        return prop.climbable === true;
    },

    canDisguiseAs: function(prop) {
        if (prop.hideSpot) return true;   // explicit hide spot is always disguisable
        return this.getPrefab(prop.model).canDisguise === true;
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
        const def = this.getPrefab(data.model);

        // Prefab-style export: always emit the identity + transform; centerX/Z,
        // topY, radius and height are recomputed by enrichProp() at load (bottomY
        // is kept because applyPropTransform() grounds the prop with it first).
        const out = {
            id: data.name,
            model: data.model,
            x: Number(object.position.x.toFixed(2)),
            y: Number(object.position.y.toFixed(2)),
            z: Number(object.position.z.toFixed(2)),
            bottomY: Number(bounds.bottomY.toFixed(2)),
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

        // Gameplay flags: emit only when they differ from the prefab default.
        if (data.collision !== def.collision) out.collision = data.collision;
        if (data.climbable !== def.climbable) out.climbable = data.climbable;
        if (data.hideSpot !== def.hideSpot) out.hideSpot = data.hideSpot;

        // Spawn flags are per-instance — emit only when set.
        if (data.spawnPoint) out.spawnPoint = true;
        if (data.seekerSpawn) out.seekerSpawn = true;
        if (data.hiderSpawn) out.hiderSpawn = true;

        return out;
    },

    groundObject: function(object, groundY) {
        const box = new THREE.Box3().setFromObject(object);
        object.position.y += groundY - box.min.y;
        return object;
    }
};
