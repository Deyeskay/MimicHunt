const PropLevel = {
    WALL_COLOR: 0xc8b59a,
    // Default texture filenames (in assets/textures/) for cube/wall. Kept here
    // (not in prefabs.js) because the editor regenerates prefabs.js.
    DEFAULT_CUBE_TEXTURE: 'crate.png',
    DEFAULT_WALL_TEXTURE: 'wall.png',
    // Prop models that support a per-instance `texture` (picked in the editor).
    TEXTURABLE_MODELS: ['cube', 'wall'],
    defaultTextureFor: function(model) {
        return model === 'wall' ? this.DEFAULT_WALL_TEXTURE : this.DEFAULT_CUBE_TEXTURE;
    },
    // Default texture tiling (repeat) per model — walls tile 2× (matches the shipped
    // wall look), cubes 1×. Used for slim export + the editor's Tiling X/Y defaults.
    defaultTilingFor: function(model) {
        return model === 'wall' ? { x: 2, y: 2 } : { x: 1, y: 1 };
    },
    // Player collider (eye/center height & horizontal radius). Seeded from
    // PlayerCollider in prefabs.js so the editor can tune them; fall back to the
    // historical literals if that config isn't present.
    PLAYER_BASE_HEIGHT: (typeof PlayerCollider !== 'undefined' && PlayerCollider.height != null) ? PlayerCollider.height : 1.5,
    PLAYER_COLLIDER_RADIUS: (typeof PlayerCollider !== 'undefined' && PlayerCollider.radius != null) ? PlayerCollider.radius : 1,

    createWallMesh: function(prop) {
        // Per-wall material (so a disguised-as-wall hider's reveal blink doesn't
        // tint every wall). A wall with a per-instance `texture` uses that file and
        // stays OUT of the shared wall.png swap list; a plain wall keeps the default
        // wall texture (procedural brick → wall.png once loaded, swapped globally).
        let tex, custom = prop && prop.texture;
        if (custom) tex = this.getPropTexture(prop.texture, { x: prop.tileX || 2, y: prop.tileY || 2 });
        else        tex = this.getWallTexture();
        const mat = tex
            ? new THREE.MeshLambertMaterial({ map: tex })
            : new THREE.MeshLambertMaterial({ color: this.WALL_COLOR });
        // Walls bypass tone mapping so their saturated rainbow stripes stay vivid on
        // Medium/High. ACES Filmic (the colour-managed tiers) rolls bright saturated
        // primaries toward white — great for foliage, washed-out for the rainbow walls.
        // No-op on Low (no tone mapping there). Per-material, so nothing else changes.
        mat.toneMapped = false;
        if (tex && !custom) (this._wallMats = this._wallMats || []).push(mat);   // shared wall.png swap
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

    // Load (and cache) a texture from assets/textures/ at a given tiling (repeat).
    // THREE's TextureLoader.load() returns the Texture object synchronously and fills
    // the image in on completion, so callers can assign it as a material map right away
    // and it renders once decoded. Cached per (filename, tilingX, tilingY): props that
    // share the same file AND tiling share ONE texture object (never disposed on swap);
    // a different tiling gets its own copy so per-instance tiling can't cross-talk.
    getPropTexture: function(filename, repeat) {
        const name = filename || this.DEFAULT_CUBE_TEXTURE;
        const rx = (repeat && repeat.x) || 1, ry = (repeat && repeat.y) || 1;
        const key = name + '@' + rx + 'x' + ry;
        this._propTexCache = this._propTexCache || {};
        if (this._propTexCache[key]) return this._propTexCache[key];
        if (typeof THREE === 'undefined' || !THREE.TextureLoader) return null;
        const tex = new THREE.TextureLoader().load('assets/textures/' + name);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(rx, ry);
        this._propTexCache[key] = tex;
        return tex;
    },

    // A unit cube (1×1×1) textured from assets/textures/. Per-cube material (so a
    // disguise blink or a per-instance texture swap doesn't touch other cubes) that
    // shares the cached map texture object. toneMapped:false matches walls — keeps
    // the texture vivid on the colour-managed (Medium/High) tiers.
    createCubeMesh: function(prop) {
        const rep = { x: (prop && prop.tileX) || 1, y: (prop && prop.tileY) || 1 };
        const tex = this.getPropTexture((prop && prop.texture) || this.DEFAULT_CUBE_TEXTURE, rep);
        const mat = tex
            ? new THREE.MeshLambertMaterial({ map: tex })
            : new THREE.MeshLambertMaterial({ color: this.WALL_COLOR });
        mat.toneMapped = false;
        return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    },

    // Live-swap a placed prop's texture (used by the editor's texture picker for
    // cube + wall). Swaps the shared cached map; the old one is left intact for
    // other props. For a wall this also drops the material out of the shared
    // wall.png swap list so a late wall.png load can't clobber the custom pick.
    applyPropTexture: function(mesh, filename, repeat) {
        if (!mesh || !mesh.material) return;
        const tex = this.getPropTexture(filename, repeat);
        if (!tex) return;
        if (this._wallMats) {
            const i = this._wallMats.indexOf(mesh.material);
            if (i >= 0) this._wallMats.splice(i, 1);
        }
        mesh.material.map = tex;
        mesh.material.needsUpdate = true;
    },

    applyScale: function(mesh, scale) {
        if (typeof scale === 'number') {
            mesh.scale.setScalar(scale);
        } else if (scale) {
            mesh.scale.set(scale.x, scale.y, scale.z);
        }
    },

    // Apply transformation to a prop mesh using the transform exported from the editor.
    // Vertical placement uses the authored `y` (the editor's WYSIWYG center position)
    // so ELEVATED props — raised platforms / multi-level floors — render at the same
    // height the editor shows. The old `-bottomY` "drop bottom to ground" convention
    // sank anything not resting on the ground (its world-space bottomY also encodes y),
    // which made floating platforms vanish far below the floor. enrichProp() recomputes
    // bottomY/topY/colliders from the placed mesh, so collision stays consistent.
    // Legacy levels that stored only bottomY (origin-at-ground) still ground via fallback.
    applyPropTransform: function(mesh, prop) {
        // Horizontal placement uses the original x/z coordinates.
        const x = prop.x;
        const z = prop.z;
        const y = (prop.y !== undefined) ? prop.y
                : (prop.bottomY !== undefined ? -prop.bottomY : 0);
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
            mesh = this.createWallMesh(prop);
        } else if (prop.model === 'cube') {
            mesh = this.createCubeMesh(prop);
        } else if (modelLibrary[prop.model]) {
            mesh = modelLibrary[prop.model].clone(true);
        } else {
            return null;
        }

        this.applyPropTransform(mesh, prop);
        return mesh;
    },

    createDisguiseMesh: function(disguiseType, modelLibrary, scale, texture) {
        if (disguiseType === 'wall') {
            const mesh = this.createWallMesh();
            this.applyScale(mesh, scale ?? 1);
            return mesh;
        }

        if (disguiseType === 'cube') {
            const mesh = this.createCubeMesh({ texture: texture });
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
        return `${player.disguiseType}:${JSON.stringify(player.propScale ?? 1)}:${player.disguiseTexture || ''}`;
    },

    computeBounds: function(object) {
        object.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        box.getSize(size);

        // Un-rotated (LOCAL) AABB — momentarily zero the rotation so we capture the
        // prop's true box in its own frame. This is what BOX colliders need to build
        // an ORIENTED box: a tilted wall's collider must follow all three of the
        // object's axes, not the (much larger, axis-aligned) world AABB. We also
        // record the rotation `pivot` (the object's world origin) and `quat` (its
        // world rotation) so resolveColliders can rebuild the oriented box exactly.
        let localX = size.x, localZ = size.z;
        let local = null, pivot = null, quat = null;
        const rot = object.rotation;
        const q0 = (object.quaternion && (rot.x || rot.y || rot.z)) ? object.quaternion.clone() : null;
        if (q0) {
            object.quaternion.identity();
            object.updateMatrixWorld(true);
            const lbox = new THREE.Box3().setFromObject(object);
            object.quaternion.copy(q0);
            object.updateMatrixWorld(true);
            localX = lbox.max.x - lbox.min.x;
            localZ = lbox.max.z - lbox.min.z;
            local = { minX: lbox.min.x, maxX: lbox.max.x,
                      minY: lbox.min.y, maxY: lbox.max.y,
                      minZ: lbox.min.z, maxZ: lbox.max.z };
            const wp = object.getWorldPosition(new THREE.Vector3());
            pivot = { x: wp.x, y: wp.y, z: wp.z };
            quat = { x: q0.x, y: q0.y, z: q0.z, w: q0.w };
        }

        return {
            radius: Math.max(size.x, size.z) * 0.5,
            height: size.y,
            topY: box.max.y,
            bottomY: box.min.y,
            centerX: (box.min.x + box.max.x) * 0.5,
            centerZ: (box.min.z + box.max.z) * 0.5,
            localX: localX,
            localZ: localZ,
            local: local,
            pivot: pivot,
            quat: quat
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
    // Quaternion (THREE) from a prop's Euler rotation in DEGREES, using the same
    // 'XYZ' order the editor applies via object.rotation.set(x,y,z).
    _propQuat: function(rot) {
        const e = new THREE.Euler(
            THREE.MathUtils.degToRad((rot && rot.x) || 0),
            THREE.MathUtils.degToRad((rot && rot.y) || 0),
            THREE.MathUtils.degToRad((rot && rot.z) || 0), 'XYZ');
        return new THREE.Quaternion().setFromEuler(e);
    },

    // Assemble one ORIENTED-BOX collider piece. localMin/localMax are the piece's
    // un-rotated, world-positioned corners; the piece is then rotated about `pivot`
    // (a THREE.Vector3) — its CENTER by centerQ and its AXES by axisQ (these differ
    // only when a template piece carries its own extra spin on top of the prop's).
    // Emits { shape:'box', x,y,z (center), hx,hy,hz (half-extents), ax/ay/az (unit
    // world axes), yMin,yMax (conservative world-AABB Y band for broad-phase) }.
    _obbPiece: function(localMin, localMax, pivot, centerQ, axisQ) {
        const c0 = new THREE.Vector3(
            (localMin.x + localMax.x) * 0.5,
            (localMin.y + localMax.y) * 0.5,
            (localMin.z + localMax.z) * 0.5);
        const hx = (localMax.x - localMin.x) * 0.5;
        const hy = (localMax.y - localMin.y) * 0.5;
        const hz = (localMax.z - localMin.z) * 0.5;
        const off = c0.sub(pivot).applyQuaternion(centerQ);
        const cx = pivot.x + off.x, cy = pivot.y + off.y, cz = pivot.z + off.z;
        const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(axisQ);
        const ay = new THREE.Vector3(0, 1, 0).applyQuaternion(axisQ);
        const az = new THREE.Vector3(0, 0, 1).applyQuaternion(axisQ);
        const ey = Math.abs(ax.y) * hx + Math.abs(ay.y) * hy + Math.abs(az.y) * hz;
        return {
            shape: 'box', x: cx, y: cy, z: cz, hx: hx, hy: hy, hz: hz,
            ax: [ax.x, ax.y, ax.z], ay: [ay.x, ay.y, ay.z], az: [az.x, az.y, az.z],
            yMin: cy - ey, yMax: cy + ey
        };
    },

    resolveColliders: function(prop, bounds, def) {
        const R = bounds.radius;
        const H = bounds.height;
        const base = bounds.bottomY;

        // Full 3D rotation: prefer the mesh's actual quaternion (ground truth from
        // computeBounds); otherwise build one from the prop's Euler degrees. Box
        // pieces become true oriented boxes, so a wall/rock tilted on ANY axis gets
        // a collider that follows it. Cylinders/spheres stay vertical (2.5D solver)
        // — only their CENTER follows the rotation.
        const quat = bounds.quat
            ? new THREE.Quaternion(bounds.quat.x, bounds.quat.y, bounds.quat.z, bounds.quat.w)
            : this._propQuat(prop.rotation);

        // Local (un-rotated) frame + rotation pivot. From a mesh we have the exact
        // un-rotated AABB; otherwise (disguised hiders, runtime rebuilds) we
        // synthesize it from the footprint — those props only spin about Y, where
        // the synthesized frame is exact.
        const L = bounds.local;
        const pivot = bounds.pivot
            ? new THREE.Vector3(bounds.pivot.x, bounds.pivot.y, bounds.pivot.z)
            : new THREE.Vector3(bounds.centerX, base, bounds.centerZ);
        const lcx = L ? (L.minX + L.maxX) * 0.5 : bounds.centerX;
        const lcz = L ? (L.minZ + L.maxZ) * 0.5 : bounds.centerZ;
        const lbase = L ? L.minY : base;
        const lH = L ? (L.maxY - L.minY) : H;
        const Rl = L ? Math.max(L.maxX - L.minX, L.maxZ - L.minZ) * 0.5 : R;

        // Box-shaped prop (walls): a single oriented box = the prop's whole box.
        if (def && def.colliderShape === 'box') {
            const lx = (bounds.localX != null ? bounds.localX : R * 2);
            const lz = (bounds.localZ != null ? bounds.localZ : R * 2);
            const lmin = { x: lcx - lx * 0.5, y: lbase,      z: lcz - lz * 0.5 };
            const lmax = { x: lcx + lx * 0.5, y: lbase + lH, z: lcz + lz * 0.5 };
            return [this._obbPiece(lmin, lmax, pivot, quat, quat)];
        }

        const tmpl = (def && def.colliders && def.colliders.length) ? def.colliders : null;

        if (!tmpl) {
            return [{ shape: 'cylinder', x: bounds.centerX, z: bounds.centerZ, radius: R, yMin: base, yMax: bounds.topY }];
        }

        return tmpl.map(c => {
            const shape = c.shape || 'cylinder';
            let ofX, ofZ, rad, halfX, halfZ, pcy, phy, pieceRotY;

            if (c.position || c.scale) {
                // New transform format (fractions of bounds).
                const pos = c.position || {};
                const scl = c.scale || {};
                const sx = scl.x != null ? scl.x : 1;
                const sy = scl.y != null ? scl.y : 1;
                const sz = scl.z != null ? scl.z : sx;
                const py = pos.y != null ? pos.y : 0.5;      // center height, fraction of H
                pcy = lbase + py * lH;
                phy = sy * lH * 0.5;
                ofX = (pos.x || 0) * Rl;
                ofZ = (pos.z || 0) * Rl;
                rad = sx * Rl;
                halfX = sx * Rl; halfZ = sz * Rl;
                pieceRotY = (c.rotation && c.rotation.y) || 0;
            } else {
                // Legacy format: cylinder, radius·R, yMin/yMax·H, offset·R.
                ofX = (c.offsetX || 0) * Rl;
                ofZ = (c.offsetZ || 0) * Rl;
                rad = (c.radius != null ? c.radius : 1) * Rl;
                halfX = rad; halfZ = rad;
                const yMin = lbase + (c.yMin != null ? c.yMin : 0) * lH;
                const yMax = lbase + (c.yMax != null ? c.yMax : 1) * lH;
                pcy = (yMin + yMax) * 0.5; phy = (yMax - yMin) * 0.5;
                pieceRotY = 0;
            }

            // Piece center in the local (un-rotated) frame.
            const lcxP = lcx + ofX, lczP = lcz + ofZ;

            if (shape === 'box') {
                const lmin = { x: lcxP - halfX, y: pcy - phy, z: lczP - halfZ };
                const lmax = { x: lcxP + halfX, y: pcy + phy, z: lczP + halfZ };
                // Piece's own Y spin composes on top of the prop's full rotation for
                // its AXES; its CENTER is carried by the prop rotation alone.
                const axisQ = quat.clone().multiply(this._propQuat({ y: pieceRotY }));
                return this._obbPiece(lmin, lmax, pivot, quat, axisQ);
            }

            // Cylinder & sphere stay vertical; their center follows the rotation.
            const ctr = new THREE.Vector3(lcxP, pcy, lczP).sub(pivot).applyQuaternion(quat).add(pivot);
            return { shape, x: ctr.x, z: ctr.z, radius: rad, yMin: ctr.y - phy, yMax: ctr.y + phy };
        });
    },

    // Build a wireframe-able THREE geometry for one resolved collider piece, so
    // every debug/preview outline (level.js, editor.html) draws the same shape
    // the solver uses. Caller positions via colliderCenter(c) and orients via
    // colliderQuat(c) (box pieces are oriented boxes; cylinders stay upright).
    colliderGeometry: function(c) {
        if (c.shape === 'box') {
            return new THREE.BoxGeometry(c.hx * 2, c.hy * 2, c.hz * 2);
        }
        const h = Math.max((c.yMax || 0) - (c.yMin || 0), 0.1);
        if (c.shape === 'sphere') {
            const r = Math.max(c.radius || 0.1, 0.001);
            const geo = new THREE.SphereGeometry(r, 20, 14);
            geo.scale(1, h / (r * 2), 1);   // squash to the band → ellipsoid
            return geo;
        }
        return new THREE.CylinderGeometry(c.radius, c.radius, h, 24);
    },

    // Where to position a collider outline. Box pieces carry an explicit center;
    // cylinders/spheres sit at the mid-height of their vertical band.
    colliderCenter: function(c) {
        if (c.shape === 'box') return { x: c.x, y: c.y, z: c.z };
        return { x: c.x, y: ((c.yMin || 0) + (c.yMax || 0)) * 0.5, z: c.z };
    },

    // Orientation for a collider outline. Box pieces are full oriented boxes (the
    // quaternion is rebuilt from their world axes); everything else is upright.
    colliderQuat: function(c) {
        if (c.shape === 'box' && c.ax && c.ay && c.az) {
            const m = new THREE.Matrix4().makeBasis(
                new THREE.Vector3(c.ax[0], c.ax[1], c.ax[2]),
                new THREE.Vector3(c.ay[0], c.ay[1], c.ay[2]),
                new THREE.Vector3(c.az[0], c.az[1], c.az[2]));
            return new THREE.Quaternion().setFromRotationMatrix(m);
        }
        return new THREE.Quaternion();
    },

    // Nearest entry distance t where a ray (unit dir D) enters an ORIENTED-box
    // collider piece, or Infinity if it misses. Shared by shot/camera raycasts and
    // the "stand on a tilted surface" probe. Works in the box's local frame via its
    // unit axes, so it handles tilt on all three axes.
    rayBox: function(ox, oy, oz, dx, dy, dz, c) {
        const px = ox - c.x, py = oy - c.y, pz = oz - c.z;
        const A = [c.ax, c.ay, c.az], hh = [c.hx, c.hy, c.hz];
        let tmin = -Infinity, tmax = Infinity;
        for (let s = 0; s < 3; s++) {
            const a = A[s], h = hh[s];
            const lo = px * a[0] + py * a[1] + pz * a[2];
            const ld = dx * a[0] + dy * a[1] + dz * a[2];
            if (Math.abs(ld) < 1e-6) { if (lo < -h || lo > h) return Infinity; }
            else {
                let t1 = (-h - lo) / ld, t2 = (h - lo) / ld;
                if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
                if (t1 > tmin) tmin = t1;
                if (t2 < tmax) tmax = t2;
            }
        }
        if (tmax < Math.max(tmin, 0)) return Infinity;
        return tmin > 0 ? tmin : (tmax >= 0 ? tmax : Infinity);
    },

    // Squared distance from a point to an oriented-box piece (0 if inside). Used by
    // movement collision to test the player's body column against tilted boxes.
    pointBoxDist2: function(px, py, pz, c) {
        const dx = px - c.x, dy = py - c.y, dz = pz - c.z;
        const A = [c.ax, c.ay, c.az], hh = [c.hx, c.hy, c.hz];
        let d2 = 0;
        for (let s = 0; s < 3; s++) {
            const a = A[s], h = hh[s];
            const proj = dx * a[0] + dy * a[1] + dz * a[2];
            const cl = proj < -h ? -h : (proj > h ? h : proj);
            const diff = proj - cl;
            d2 += diff * diff;
        }
        return d2;
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

                // Oriented-box piece (walls, rock body, tree canopy): full 3D
                // ray-vs-OBB in the box's local frame, so a ray piercing ANY face —
                // including the top/bottom of a tilted or horizontal slab —
                // registers, not just hits through the upright sides.
                if (c.shape === 'box') {
                    const tb = this.rayBox(ox, oy, oz, dx, dy, dz, c);
                    if (tb < 0 || tb > range || tb >= best) continue;
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

    // Exit-door submit zones (Phase 2 keys): any prop placed as a `door` marker, or
    // an existing prop flagged `exitDoor`. Returns [{x,z}] centres for the deposit
    // check (Network.tickKeys) and the door glow render (Level.buildDoors).
    getDoorPositions: function(props) {
        return (props || [])
            .filter(p => p.model === 'door' || p.exitDoor)
            .map(p => { const c = this.getPropCenter(p); return { x: c.x, z: c.z }; });
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
        if (data.exitDoor) out.exitDoor = true;

        // Persist the chosen texture filename + tiling so it renders in-game.
        if (this.TEXTURABLE_MODELS.indexOf(data.model) !== -1) {
            const dt = this.defaultTilingFor(data.model);
            const tiled = (data.tileX != null && data.tileX !== dt.x) ||
                          (data.tileY != null && data.tileY !== dt.y);
            // Cubes always carry a texture (default crate.png). Walls only when
            // overridden — but a non-default tiling forces the custom path, so emit
            // a texture (default wall.png) for a tiled wall too. Plain walls stay slim.
            if (data.model === 'cube') out.texture = data.texture || this.DEFAULT_CUBE_TEXTURE;
            else if (data.texture || tiled) out.texture = data.texture || this.DEFAULT_WALL_TEXTURE;
            // Tiling emitted only when it differs from the model default (keeps output slim).
            if (tiled) { out.tileX = data.tileX ?? dt.x; out.tileY = data.tileY ?? dt.y; }
        }

        return out;
    },

    groundObject: function(object, groundY) {
        const box = new THREE.Box3().setFromObject(object);
        object.position.y += groundY - box.min.y;
        return object;
    }
};
