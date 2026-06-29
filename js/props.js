const PropLevel = {
    WALL_COLOR: 0xc8b59a,
    // Player collider (eye/center height & horizontal radius). Seeded from
    // PlayerCollider in prefabs.js so the editor can tune them; fall back to the
    // historical literals if that config isn't present.
    PLAYER_BASE_HEIGHT: (typeof PlayerCollider !== 'undefined' && PlayerCollider.height != null) ? PlayerCollider.height : 1.5,
    PLAYER_COLLIDER_RADIUS: (typeof PlayerCollider !== 'undefined' && PlayerCollider.radius != null) ? PlayerCollider.radius : 1,

    createWallMesh: function() {
        // Per-wall material (so a disguised-as-wall hider's reveal blink doesn't
        // tint every wall), all sharing the same map texture object.
        const tex = this.getWallTexture();
        const mat = tex
            ? new THREE.MeshLambertMaterial({ map: tex })
            : new THREE.MeshLambertMaterial({ color: this.WALL_COLOR });
        // Walls bypass tone mapping so their saturated rainbow stripes stay vivid on
        // Medium/High. ACES Filmic (the colour-managed tiers) rolls bright saturated
        // primaries toward white — great for foliage, washed-out for the rainbow walls.
        // No-op on Low (no tone mapping there). Per-material, so nothing else changes.
        mat.toneMapped = false;
        if (tex) (this._wallMats = this._wallMats || []).push(mat);   // for image swap
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
        mesh.scale.set(4, 3, 0.3);
        return mesh;
    },

    // The current best wall map: the real image once loaded, else the procedural
    // brick texture (which also kicks off the async image load on first use).
    getWallTexture: function() {
        if (this._wallImageTex) return this._wallImageTex;
        if (this._wallTex) { this._loadWallImage(); return this._wallTex; }
        if (typeof document === 'undefined' || typeof THREE === 'undefined') return null;
        const W = 256, H = 256, rows = 6, cols = 4;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#5a5048';           // mortar
        ctx.fillRect(0, 0, W, H);
        const bh = H / rows, bw = W / cols, gap = 3;
        for (let r = 0; r < rows; r++) {
            const off = (r % 2) ? bw / 2 : 0;   // running-bond offset
            for (let i = -1; i < cols; i++) {
                const x = i * bw + off + gap, y = r * bh + gap;
                const w = bw - gap * 2, h = bh - gap * 2;
                const shade = 150 + (Math.random() * 50 | 0);
                ctx.fillStyle = 'rgb(' + shade + ',' + (shade - 22) + ',' + (shade - 55) + ')';
                ctx.fillRect(x, y, w, h);
            }
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 2);
        this._wallTex = tex;
        this._loadWallImage();
        return tex;
    },

    // Load assets/textures/wall.jpg once; when ready, swap it onto every wall
    // material (procedural brick stays as the fallback if it's missing/fails).
    _loadWallImage: function() {
        if (this._wallImageRequested) return;
        this._wallImageRequested = true;
        if (typeof THREE === 'undefined' || !THREE.TextureLoader) return;
        new THREE.TextureLoader().load(
            'assets/textures/wall.png',
            (tex) => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(2, 2);   // tune to taste
                this._wallImageTex = tex;
                (this._wallMats || []).forEach(m => { m.map = tex; m.needsUpdate = true; });
            },
            undefined,
            () => { /* missing/failed → keep the procedural fallback */ }
        );
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

        // Local (rotation-removed) horizontal extents — used by BOX colliders on
        // rotated props (walls), where the world AABB is much larger than the
        // actual box footprint. Computed by momentarily zeroing the rotation.
        let localX = size.x, localZ = size.z;
        const rot = object.rotation;
        if (object.quaternion && (rot.x || rot.y || rot.z)) {
            const q = object.quaternion.clone();
            object.quaternion.identity();
            object.updateMatrixWorld(true);
            const lbox = new THREE.Box3().setFromObject(object);
            const lsize = new THREE.Vector3();
            lbox.getSize(lsize);
            localX = lsize.x;
            localZ = lsize.z;
            object.quaternion.copy(q);
            object.updateMatrixWorld(true);
        }

        return {
            radius: Math.max(size.x, size.z) * 0.5,
            height: size.y,
            topY: box.max.y,
            bottomY: box.min.y,
            centerX: (box.min.x + box.max.x) * 0.5,
            centerZ: (box.min.z + box.max.z) * 0.5,
            localX: localX,
            localZ: localZ
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

    // Turn a prefab's optional `colliders` template into concrete world pieces.
    // Each template piece carries a SHAPE ('cylinder' | 'box' | 'sphere') and a
    // transform expressed as FRACTIONS of the placed instance's bounds, so it
    // scales with any instance:
    //     position {x,y,z}  – x/z fraction of bounds radius R (rotated by the
    //                         instance's rotation.y); y fraction of height H, the
    //                         piece CENTER measured up from the prop's bottom
    //     rotation {y}      – extra Y spin in degrees, added to the instance's
    //                         (only meaningful for box pieces)
    //     scale {x,y,z}     – x/z fraction of R (radius / half-extents); y
    //                         fraction of H (the piece's full height)
    // Emitted pieces are normalized to the runtime form the collision/render code
    // consumes: cylinder/sphere { x, z, radius, yMin, yMax }, box { x, z, halfX,
    // halfZ, rot, yMin, yMax }. Sphere collides like a circular footprint+band
    // (the 2.5D solver) but renders round. The OLD fraction format
    // ({radius, yMin, yMax, offsetX, offsetZ}, cylinder-only) is still accepted.
    // With no template, fall back to one full-height cylinder = the bounding box.
    resolveColliders: function(prop, bounds, def) {
        const R = bounds.radius;
        const H = bounds.height;
        const base = bounds.bottomY;

        // Box-shaped prop (walls): a single oriented box matching the prop's local
        // footprint, rotated by rotation.y. halfX/halfZ are LOCAL half-extents so
        // a rotated wall blocks as a thin rectangle, not a fat cylinder.
        if (def && def.colliderShape === 'box') {
            const ry = THREE.MathUtils.degToRad((prop.rotation && prop.rotation.y) || 0);
            const lx = (bounds.localX != null ? bounds.localX : R * 2);
            const lz = (bounds.localZ != null ? bounds.localZ : R * 2);
            return [{
                shape: 'box',
                x: bounds.centerX, z: bounds.centerZ,
                halfX: lx * 0.5, halfZ: lz * 0.5, rot: ry,
                yMin: base, yMax: bounds.topY
            }];
        }

        const tmpl = (def && def.colliders && def.colliders.length) ? def.colliders : null;

        if (!tmpl) {
            return [{ shape: 'cylinder', x: bounds.centerX, z: bounds.centerZ, radius: R, yMin: base, yMax: bounds.topY }];
        }

        const ry = THREE.MathUtils.degToRad((prop.rotation && prop.rotation.y) || 0);
        const cos = Math.cos(ry), sin = Math.sin(ry);

        return tmpl.map(c => {
            const shape = c.shape || 'cylinder';
            let ofX, ofZ, rad, halfX, halfZ, yMin, yMax, pieceRotY;

            if (c.position || c.scale) {
                // New transform format (fractions of bounds).
                const pos = c.position || {};
                const scl = c.scale || {};
                const sx = scl.x != null ? scl.x : 1;
                const sy = scl.y != null ? scl.y : 1;
                const sz = scl.z != null ? scl.z : sx;
                const py = pos.y != null ? pos.y : 0.5;      // center height, fraction of H
                const cy = base + py * H;
                const halfH = sy * H * 0.5;
                ofX = (pos.x || 0) * R;
                ofZ = (pos.z || 0) * R;
                rad = sx * R;
                halfX = sx * R; halfZ = sz * R;
                yMin = cy - halfH; yMax = cy + halfH;
                pieceRotY = (c.rotation && c.rotation.y) || 0;
            } else {
                // Legacy format: cylinder, radius·R, yMin/yMax·H, offset·R.
                ofX = (c.offsetX || 0) * R;
                ofZ = (c.offsetZ || 0) * R;
                rad = (c.radius != null ? c.radius : 1) * R;
                halfX = rad; halfZ = rad;
                yMin = base + (c.yMin != null ? c.yMin : 0) * H;
                yMax = base + (c.yMax != null ? c.yMax : 1) * H;
                pieceRotY = 0;
            }

            const x = bounds.centerX + ofX * cos - ofZ * sin;
            const z = bounds.centerZ + ofX * sin + ofZ * cos;

            if (shape === 'box') {
                return { shape: 'box', x, z, halfX, halfZ,
                    rot: ry + THREE.MathUtils.degToRad(pieceRotY), yMin, yMax };
            }
            // cylinder & sphere share the circular footprint runtime form.
            return { shape, x, z, radius: rad, yMin, yMax };
        });
    },

    // Build a wireframe-able THREE geometry for one resolved collider piece, so
    // every debug/preview outline (level.js, editor.html) draws the same shape
    // the solver uses. Caller wraps in EdgesGeometry and positions it at the
    // piece center; box pieces also need rotation.y = c.rot.
    colliderGeometry: function(c) {
        const h = Math.max((c.yMax || 0) - (c.yMin || 0), 0.1);
        if (c.shape === 'box') {
            return new THREE.BoxGeometry(c.halfX * 2, h, c.halfZ * 2);
        }
        if (c.shape === 'sphere') {
            const r = Math.max(c.radius || 0.1, 0.001);
            const geo = new THREE.SphereGeometry(r, 20, 14);
            geo.scale(1, h / (r * 2), 1);   // squash to the band → ellipsoid
            return geo;
        }
        return new THREE.CylinderGeometry(c.radius, c.radius, h, 24);
    },

    // Safe accessor: precomputed colliders if enriched, else a single cylinder
    // derived from whatever bounds the prop already carries (never throws).
    getColliders: function(prop) {
        if (prop.colliders && prop.colliders.length) return prop.colliders;
        const cx = prop.centerX != null ? prop.centerX : prop.x;
        const cz = prop.centerZ != null ? prop.centerZ : prop.z;
        return [{
            shape: 'cylinder',
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

                // Oriented-box piece (walls): ray-vs-rectangle in the box's local
                // XZ frame (2D slab test), then the same vertical-band check.
                if (c.shape === 'box') {
                    const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
                    const px = ox - c.x, pz = oz - c.z;
                    const lx = px * cs + pz * sn;      // into box-local frame (-rot)
                    const lz = -px * sn + pz * cs;
                    const ldx = dx * cs + dz * sn;
                    const ldz = -dx * sn + dz * cs;
                    let tmin = -Infinity, tmax = Infinity, skip = false;
                    // X slab
                    if (Math.abs(ldx) < 1e-6) { if (lx < -c.halfX || lx > c.halfX) skip = true; }
                    else { let t1 = (-c.halfX - lx) / ldx, t2 = (c.halfX - lx) / ldx;
                           if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
                           tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
                    // Z slab
                    if (!skip) {
                        if (Math.abs(ldz) < 1e-6) { if (lz < -c.halfZ || lz > c.halfZ) skip = true; }
                        else { let t1 = (-c.halfZ - lz) / ldz, t2 = (c.halfZ - lz) / ldz;
                               if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
                               tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
                    }
                    if (skip || tmax < Math.max(tmin, 0)) continue;
                    let tb = tmin > 0 ? tmin : tmax;
                    if (tb < 0 || tb > range || tb >= best) continue;
                    const yb = oy + dy * tb;
                    if (yb < c.yMin || yb > c.yMax) continue;
                    best = tb;
                    continue;
                }

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
