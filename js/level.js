const Level = {
    init: function() {
        const canvas = document.getElementById('gameCanvas');
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);
        scene.fog = new THREE.Fog(0x87ceeb, 20, 100);

        // Vertical FOV from settings (default 60° — Unity's third-person default;
        // the old 75° produced noticeable perspective stretch toward the screen
        // edges while orbiting). Adjustable live via the Settings screen → setFov().
        const fov = (typeof GAME_SETTINGS !== 'undefined' && GAME_SETTINGS.cameraFov) || 60;
        camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 1000);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        scene.add(ambientLight);
        const hemiLight = new THREE.HemisphereLight(0xbfd8ff, 0x4a6a3a, 0.6);
        scene.add(hemiLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(2048, 2048);
        // Orthographic shadow frustum covering the play area around the origin.
        const sc = dirLight.shadow.camera;
        sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60;
        sc.near = 0.5; sc.far = 120;
        dirLight.shadow.bias = -0.0005;
        scene.add(dirLight);

        const groundGeo = new THREE.PlaneGeometry(200, 200);
        const groundTex = this.makeGroundTexture();
        const groundMat = new THREE.MeshLambertMaterial(groundTex ? { map: groundTex } : { color: 0x228B22 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        scene.add(ground);

        // Load the first registered level as the default. Levels come from the
        // js/levels/ folder via the registry (LEVELS); the lobby lets the host
        // pick which one, and loadLevel() swaps it in at game start.
        const def = (typeof LEVELS !== 'undefined' && LEVELS[0]) ? LEVELS[0].props : [];
        this.loadLevel(def);
    },

    // Procedural grass texture (no asset files): a green base with speckled
    // light/dark noise + faint blade flecks, tiled across the ground. Returns null
    // if canvas isn't available (falls back to a flat color).
    makeGroundTexture: function() {
        if (typeof document === 'undefined') return null;
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#2f7d32';
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 4000; i++) {
            const x = Math.random() * 256, y = Math.random() * 256;
            const g = 80 + (Math.random() * 110 | 0);
            const a = 0.25 + Math.random() * 0.4;
            ctx.fillStyle = 'rgba(' + (25 + (Math.random() * 30 | 0)) + ',' + g + ',' + (25 + (Math.random() * 25 | 0)) + ',' + a + ')';
            ctx.fillRect(x, y, 2, Math.random() < 0.3 ? 4 : 2);
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(40, 40);    // ~5 world units per tile across the 200×200 plane
        return tex;
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

            // One outline per collider piece (e.g. trunk + canopy for a tree, or
            // an oriented box for a wall).
            for (const c of PropLevel.getColliders(prop)) {
                const h = Math.max(c.yMax - c.yMin, 0.1);
                const geo = (c.shape === 'box')
                    ? new THREE.BoxGeometry(c.halfX * 2, h, c.halfZ * 2)
                    : new THREE.CylinderGeometry(c.radius, c.radius, h, 24);
                const mat = new THREE.LineBasicMaterial({ color: 0xffff00 });
                mat.depthTest = false;   // draw over geometry like editor gizmos
                const helper = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat);
                helper.position.set(c.x, (c.yMin + c.yMax) / 2, c.z);
                if (c.shape === 'box') helper.rotation.y = c.rot || 0;
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

        const total = files.length + 2;   // + the two animated characters (player + hunter)
        let loaded = 0;
        const done = () => { loaded++; if (loaded === total) callback(); };

        files.forEach(file => {
            loader.load(
                file.path,
                (gltf) => { modelLibrary[file.key] = gltf.scene; done(); },
                undefined,
                (err) => { console.error("Failed:", file.path, err); done(); }
            );
        });

        // Animated characters — Hiders use player.glb, Seekers use hunter.glb.
        // Each is processed into a "rig" (scene + animations + split clips). If a
        // model fails to load the game falls back to box/cylinder primitives (and
        // if only hunter.glb is missing, seekers fall back to the player rig).
        this.rigs = this.rigs || {};
        const loadRig = (key, path) => loader.load(
            path,
            (gltf) => { this.rigs[key] = this.buildRig(gltf, path); done(); },
            undefined,
            (err) => { console.error("Failed:", path, err); done(); }
        );
        loadRig('player', "assets/models/player.glb");   // Hider
        loadRig('hunter', "assets/models/hunter.glb");   // Seeker
    },

    // Process a loaded character GLB into a rig: its scene + animations + the
    // per-layer split clips used by makeCharacterMesh. Also flags its meshes to
    // cast shadows (SkeletonUtils clones inherit this).
    buildRig: function(gltf, path) {
        const rig = { scene: gltf.scene, animations: gltf.animations || [] };
        const anims = rig.animations;
        const byName = subs => anims.find(a =>
            subs.some(s => (a.name || '').toLowerCase().includes(s)));

        // Pick clips by name with sensible fallbacks.
        const c = {
            idle:  byName(['idle', 'stand']) || anims[0] || null,
            walk:  byName(['walk', 'move']) || anims[1] || anims[0] || null,
            run:   byName(['run', 'sprint']) || null,
            jump:  byName(['jump', 'leap']) || null,
            shoot: byName(['shoot', 'fire', 'attack', 'aim', 'gun']) || null
        };
        console.log(path, 'clips:', anims.map(a => a.name),
            '→ idle:', c.idle && c.idle.name, 'walk:', c.walk && c.walk.name,
            'run:', c.run && c.run.name, 'jump:', c.jump && c.jump.name,
            'shoot:', c.shoot && c.shoot.name);

        // Split clips into LOWER-body (legs/hips) and UPPER-body (spine/arms/head)
        // layers on disjoint bone sets — lets the upper body play the shoot clip as
        // a true OVERRIDE while the legs keep locomotion (additive fought the
        // animated "searching" idle).
        c.idleLower = this.splitClip(c.idle, true);
        c.idleUpper = this.splitClip(c.idle, false);
        c.walkLower = this.splitClip(c.walk, true);
        c.walkUpper = this.splitClip(c.walk, false);
        c.runLower  = this.splitClip(c.run, true);
        c.runUpper  = this.splitClip(c.run, false);
        c.shootUpper = this.splitClip(c.shoot, false);  // upper-only shoot override
        rig.clips = c;

        rig.scene.traverse(o => { if (o.isMesh) o.castShadow = true; });
        return rig;
    },

    // The character rig for a role: Seeker → hunter.glb, Hider → player.glb.
    // Falls back to whichever rig loaded if its preferred one is missing.
    rigForRole: function(role) {
        const r = this.rigs || {};
        return role === "Seeker" ? (r.hunter || r.player) : (r.player || r.hunter);
    },

    // Split a clip into a lower-body or upper-body sub-clip by bone name, so the
    // two halves can be driven by independent layers (legs locomotion + upper-body
    // shoot override). keepLower=true keeps hips/legs/feet; false keeps spine/
    // arms/head. Tweak LOWER_BODY_RE if the console bone log shows a mis-split.
    splitClip: function(clip, keepLower) {
        if (!clip) return null;
        const LOWER_BODY_RE = /(hip|pelvis|thigh|leg|knee|shin|calf|foot|toe|root|ik)/i;
        const keep = [];
        clip.tracks.forEach(tr => {
            const dot = tr.name.lastIndexOf('.');
            const bone = dot >= 0 ? tr.name.slice(0, dot) : tr.name;
            if (LOWER_BODY_RE.test(bone) === !!keepLower) keep.push(tr.clone());
        });
        if (!keep.length) return null;
        return new THREE.AnimationClip(clip.name + (keepLower ? '_lower' : '_upper'),
            clip.duration, keep);
    },

    resize: function() {
        if (!renderer) return;
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    },

    // Change the camera FOV live (from the Settings screen). Clamped to a sane
    // third-person range.
    setFov: function(fov) {
        if (!camera) return;
        camera.fov = Math.max(40, Math.min(100, fov));
        camera.updateProjectionMatrix();
    },

    // Yaw applied to the character model on top of p.rotY. rotY is now the
    // MOVEMENT heading (atan2(moveX,moveZ)) and the model faces +Z, so offset 0
    // makes it face the way it's moving. Flip to Math.PI if it faces backwards.
    PLAYER_YAW_OFFSET: 0,

    createPlayerMesh: function(p) {
        // Disguised hider → the prop mesh (no character / no animation).
        if (p.role !== "Seeker" && p.disguiseType !== "player") {
            const mesh = PropLevel.createDisguiseMesh(p.disguiseType, modelLibrary, p.propScale);
            if (mesh) {
                mesh.userData.meshKey = PropLevel.getDisguiseMeshKey(p);
                return mesh;
            }
        }

        // Seeker or undisguised hider → animated character (when loaded).
        if (this.rigForRole(p.role) && THREE.SkeletonUtils) {
            return this.makeCharacterMesh(p);
        }

        // Fallback primitives (model not loaded / SkeletonUtils missing).
        if (p.role === "Seeker") {
            return new THREE.Mesh(
                new THREE.BoxGeometry(2, 4, 2),
                new THREE.MeshLambertMaterial({ color: p.isCaught ? 0x333333 : p.color })
            );
        }
        return new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 3, 16),
            new THREE.MeshLambertMaterial({ color: p.color })
        );
    },

    // Build an animated character instance: a skinned clone (SkeletonUtils is
    // required — plain .clone() breaks skinning), grounded so its feet sit at the
    // group origin, plus a role-colored foot ring and a per-instance AnimationMixer.
    makeCharacterMesh: function(p) {
        const root = new THREE.Group();

        // Pick the rig for this role (Seeker → hunter.glb, Hider → player.glb).
        const rig = this.rigForRole(p.role);
        const model = THREE.SkeletonUtils.clone(rig.scene);
        model.traverse(o => { if (o.isMesh) o.castShadow = true; });

        // Scale to ~3 tall by measuring the actual clone (respects any intrinsic
        // scale in the GLB), then drop it so its feet sit at the group origin
        // regardless of where the GLB's pivot is.
        const m0 = new THREE.Box3().setFromObject(model);
        const sz = new THREE.Vector3();
        m0.getSize(sz);
        if (sz.y > 0) model.scale.multiplyScalar(3 / sz.y);
        const box = new THREE.Box3().setFromObject(model);
        model.position.y -= box.min.y;
        root.add(model);

        // Role-colored foot ring (red Seeker / green Hider) for at-a-glance ID.
        const ringColor = p.isCaught ? 0x333333 : (p.role === "Seeker" ? 0xff4757 : 0x2ed573);
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.7, 1.0, 24),
            new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide,
                transparent: true, opacity: 0.85 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        root.add(ring);

        // Two animation layers on disjoint bone sets: LOWER (legs) + UPPER
        // (spine/arms). The upper layer crossfades idle/walk <-> shoot as a real
        // override (no additive), so a shot replaces the searching idle on the
        // torso while the legs keep their locomotion. Jump is a full-body one-shot.
        const mixer = new THREE.AnimationMixer(model);
        const clips = rig.clips || {};
        const act = (clip, once) => {
            if (!clip) return null;
            const a = mixer.clipAction(clip);
            if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
            return a;
        };
        const lower = { idle: act(clips.idleLower), walk: act(clips.walkLower), run: act(clips.runLower) };
        const upper = { idle: act(clips.idleUpper), walk: act(clips.walkUpper), run: act(clips.runUpper), shoot: act(clips.shootUpper) };
        const jumpAction = act(clips.jump, true);
        if (lower.idle) { lower.idle.setEffectiveWeight(1); lower.idle.play(); }
        if (upper.idle) { upper.idle.setEffectiveWeight(1); upper.idle.play(); }

        root.userData.isCharacter = true;
        root.userData.mixer = mixer;
        root.userData.lower = lower;
        root.userData.upper = upper;
        root.userData.jumpAction = jumpAction;
        root.userData.hasClips = !!(lower.idle || upper.idle || lower.walk || upper.walk);
        root.userData.ring = ring;
        root.userData.lowerCur = 'idle';
        root.userData.upperCur = 'idle';
        root.userData.jumpActive = false;
        root.userData.lastJumpAt = 0;
        root.userData.lastPos = new THREE.Vector3(p.x, p.y, p.z);
        // Procedural fallback refs (model without baked clips): bob the model
        // child around this grounded base Y so the foot ring stays put.
        root.userData.model = model;
        root.userData.modelBaseY = model.position.y;
        root.userData.animT = 0;
        return root;
    },

    updatePlayerMeshTransform: function(mesh, p) {
        // Animated character: group origin = feet, so drop by the player base
        // height (primitives were centered on p.y). Face the movement direction.
        if (mesh.userData.isCharacter) {
            mesh.position.set(p.x, p.y - PropLevel.PLAYER_BASE_HEIGHT, p.z);
            mesh.rotation.set(0, p.rotY + (this.PLAYER_YAW_OFFSET || 0), 0);
            return;
        }

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

    // Crossfade idle/walk based on the character's rendered movement speed, then
    // advance its mixer. Works for the local player and interpolated remotes alike
    // because it measures the mesh's own position delta (no networked anim state).
    updateCharacterAnim: function(mesh, p, dt) {
        const ud = mesh.userData;

        // Per-frame movement delta (speed + direction). Physics runs on a 60Hz
        // setInterval while this runs on rAF, so frames can see zero movement —
        // smooth speed AND direction with an EMA so a stale frame can't flip state.
        let dx = 0, dz = 0;
        if (ud.lastPos && dt > 0) {
            dx = mesh.position.x - ud.lastPos.x;
            dz = mesh.position.z - ud.lastPos.z;
        }
        if (ud.lastPos) ud.lastPos.set(mesh.position.x, mesh.position.y, mesh.position.z);
        const inst = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
        const a = Math.min(1, dt * 12);
        ud.speed = (ud.speed || 0) + (inst - (ud.speed || 0)) * a;
        ud.velX = (ud.velX || 0) + ((dt > 0 ? dx / dt : 0) - (ud.velX || 0)) * a;
        ud.velZ = (ud.velZ || 0) + ((dt > 0 ? dz / dt : 0) - (ud.velZ || 0)) * a;

        let moving = (ud.lowerCur === 'walk');
        if (ud.speed > 1.5) moving = true;
        else if (ud.speed < 0.5) moving = false;
        if (p.isCaught) moving = false;             // eliminated players freeze

        if (ud.ring && p.isCaught) ud.ring.material.color.setHex(0x333333);

        if (!ud.hasClips) {
            // Procedural fallback (model has no baked clips): bob + sway.
            if (ud.model) {
                ud.animT = (ud.animT || 0) + dt;
                const freq = moving ? 8 : 2;
                const amp = moving ? 0.18 : 0.05;
                const bob = (Math.sin(ud.animT * freq) * 0.5 + 0.5) * amp;
                ud.model.position.y = ud.modelBaseY + bob;
                ud.model.rotation.z = moving ? Math.sin(ud.animT * freq) * 0.07 : 0;
            }
            return;
        }

        // --- Jump: full-body one-shot that overrides BOTH layers ---
        if (p.jumpAt && p.jumpAt > (ud.lastJumpAt || 0) && ud.jumpAction) {
            ud.lastJumpAt = p.jumpAt;
            const j = ud.jumpAction;
            j.reset(); j.setEffectiveTimeScale(1); j.setEffectiveWeight(1); j.fadeIn(0.1); j.play();
            this._fadeOutLayer(ud.lower, 0.1);
            this._fadeOutLayer(ud.upper, 0.1);
            ud.jumpActive = true;
        }
        if (ud.jumpActive) {
            const j = ud.jumpAction;
            const dur = j ? j.getClip().duration : 0;
            if (!j || j.time >= dur - 0.02 || !j.isRunning()) {
                ud.jumpActive = false;
                if (j) j.fadeOut(0.15);
                this._playLayer(ud.lower, ud.lowerCur, 0.15);
                this._playLayer(ud.upper, ud.upperCur, 0.15);
            } else {
                ud.mixer.update(dt);
                return;
            }
        }

        // Movement direction relative to facing → reversed walk for back-pedal.
        const fwdX = Math.sin(p.rotY), fwdZ = Math.cos(p.rotY);
        const back = moving && (ud.velX * fwdX + ud.velZ * fwdZ) < -0.2;

        // LOWER body: idle / walk (back-pedal = reversed walk).
        const lowerT = (moving && ud.lower.walk) ? 'walk' : 'idle';
        if (lowerT !== ud.lowerCur) { this._crossfade(ud.lower, ud.lowerCur, lowerT, 0.2); ud.lowerCur = lowerT; }
        if (ud.lower.walk) ud.lower.walk.setEffectiveTimeScale(back ? -1 : 1);

        // UPPER body: shoot overrides; otherwise mirror the locomotion.
        const shooting = !p.isCaught && ud.upper.shoot && Network.now() < (p.shootingUntil || 0);
        const upperT = shooting ? 'shoot' : ((moving && ud.upper.walk) ? 'walk' : 'idle');
        if (upperT !== ud.upperCur) { this._crossfade(ud.upper, ud.upperCur, upperT, 0.15); ud.upperCur = upperT; }
        if (ud.upper.walk && upperT === 'walk') ud.upper.walk.setEffectiveTimeScale(back ? -1 : 1);

        ud.mixer.update(dt);
    },

    // Crossfade within one layer (disjoint bone set → clean override).
    _crossfade: function(layer, fromName, toName, dur) {
        if (fromName === toName) return;
        const next = layer[toName], prev = layer[fromName];
        if (next) { next.reset(); next.setEffectiveWeight(1); next.fadeIn(dur); next.play(); }
        if (prev && prev !== next) prev.fadeOut(dur);
    },
    _fadeOutLayer: function(layer, dur) {
        for (const k in layer) if (layer[k]) layer[k].fadeOut(dur);
    },
    _playLayer: function(layer, name, dur) {
        const a = layer[name] || layer.idle;
        if (a) { a.reset(); a.setEffectiveWeight(1); a.fadeIn(dur); a.play(); }
    },

    // Aim ray for a shot. The HIT ray (o*, d*) is the CAMERA ray through the
    // crosshair (so hits match exactly what's centered on screen). The muzzle
    // (m*) is the player's chest — the visual bolt flies from there toward the
    // aim point so it reads as coming from the character for every viewer.
    getAimRay: function() {
        const o = new THREE.Vector3();
        const d = new THREE.Vector3();
        if (camera) { camera.getWorldPosition(o); camera.getWorldDirection(d); }
        else { o.set(localPos.x, localPos.y + 1, localPos.z); d.set(0, 0, -1); }
        // Muzzle = the player's right hand: lower than the head and offset
        // forward + right of the body so the bolt reads as fired from the held
        // weapon (not the head). HAND_UP is below the old +1.0 chest origin.
        const fX = -Math.sin(cameraYaw), fZ = -Math.cos(cameraYaw);   // forward
        const rX = -fZ, rZ = fX;                                       // screen-right
        const HAND_FWD = 0.45, HAND_RIGHT = 0.35, HAND_UP = 0.35;
        return {
            ox: o.x, oy: o.y, oz: o.z,
            dx: d.x, dy: d.y, dz: d.z,
            mx: localPos.x + fX * HAND_FWD + rX * HAND_RIGHT,
            my: localPos.y + HAND_UP,
            mz: localPos.z + fZ * HAND_FWD + rZ * HAND_RIGHT
        };
    },

    // Spawn the visual bolt from the muzzle toward the ray's aim point.
    // Spawn the visual bolt from the muzzle toward the aim point. stopDist (along
    // the camera ray) ends the bolt at the impact (a prop or hider); default =
    // full range. An impact flash shows when it actually hit something.
    spawnPulse: function(ray, stopDist) {
        const full = (typeof SHOT_RANGE !== 'undefined' ? SHOT_RANGE : 60);
        const range = (stopDist != null && isFinite(stopDist)) ? stopDist : full;
        const ax = ray.ox + ray.dx * range;
        const ay = ray.oy + ray.dy * range;
        const az = ray.oz + ray.dz * range;
        const mx = ray.mx != null ? ray.mx : ray.ox;
        const my = ray.my != null ? ray.my : ray.oy;
        const mz = ray.mz != null ? ray.mz : ray.oz;
        const maxDist = Math.hypot(ax - mx, ay - my, az - mz);
        this.spawnProjectile(mx, my, mz, ax - mx, ay - my, az - mz, maxDist, range < full - 0.5);
    },

    // Spawn a blue energy-pulse projectile that flies along (dx,dy,dz) and is
    // culled after maxDist. Purely cosmetic — hit logic is host-authoritative.
    spawnProjectile: function(ox, oy, oz, dx, dy, dz, maxDist, impact) {
        if (!scene) return;
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 10, 10),
            new THREE.MeshBasicMaterial({ color: 0x49b6ff })
        );
        mesh.position.set(ox, oy, oz);
        scene.add(mesh);
        const len = Math.hypot(dx, dy, dz) || 1;
        this._projectiles = this._projectiles || [];
        this._projectiles.push({
            mesh,
            dir: { x: dx / len, y: dy / len, z: dz / len },
            traveled: 0,
            maxDist: (maxDist != null ? maxDist : (typeof SHOT_RANGE !== 'undefined' ? SHOT_RANGE : 60)),
            impact: !!impact
        });
    },

    // A brief expanding/fading flash where a bolt hit something.
    spawnImpact: function(x, y, z) {
        if (!scene) return;
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.25, 10, 10),
            new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.9 })
        );
        mesh.position.set(x, y, z);
        scene.add(mesh);
        this._impacts = this._impacts || [];
        this._impacts.push({ mesh, life: 0, maxLife: 0.18 });
    },

    // Advance + cull live projectiles and impact flashes (once per render frame).
    updateProjectiles: function(dt) {
        const list = this._projectiles;
        if (list && list.length) {
            const speed = 90;   // world units / sec
            for (let i = list.length - 1; i >= 0; i--) {
                const pr = list[i];
                const step = speed * dt;
                pr.mesh.position.x += pr.dir.x * step;
                pr.mesh.position.y += pr.dir.y * step;
                pr.mesh.position.z += pr.dir.z * step;
                pr.traveled += step;
                if (pr.traveled >= pr.maxDist) {
                    if (pr.impact) this.spawnImpact(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z);
                    scene.remove(pr.mesh);
                    pr.mesh.geometry.dispose();
                    list.splice(i, 1);
                }
            }
        }

        const impacts = this._impacts;
        if (impacts && impacts.length) {
            for (let i = impacts.length - 1; i >= 0; i--) {
                const im = impacts[i];
                im.life += dt;
                const k = im.life / im.maxLife;
                im.mesh.scale.setScalar(1 + k * 2.5);
                im.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
                if (im.life >= im.maxLife) {
                    scene.remove(im.mesh);
                    im.mesh.geometry.dispose();
                    impacts.splice(i, 1);
                }
            }
        }
    },

    // Blink the (per-instance) foot ring red while a hider is "revealed" after a
    // hit. Restores the base color once the reveal window ends. Caught/eliminated
    // players keep their grey ring (handled in updateCharacterAnim).
    applyRevealBlink: function(mesh, p) {
        const ring = mesh.userData && mesh.userData.ring;
        if (!ring) return;
        const revealed = !p.isCaught && Network.now() < (p.revealedUntil || 0);
        if (revealed) {
            const on = Math.floor(Network.now() / 150) % 2 === 0;
            const base = p.role === 'Seeker' ? 0xff4757 : 0x2ed573;
            ring.material.color.setHex(on ? 0xff0000 : base);
            mesh.userData._wasRevealed = true;
        } else if (mesh.userData._wasRevealed) {
            ring.material.color.setHex(p.isCaught ? 0x333333 : (p.role === 'Seeker' ? 0xff4757 : 0x2ed573));
            mesh.userData._wasRevealed = false;
        }
    },

    render: function() {
        if (!gameState || !gameState.players) return;

        // Delta time for animation mixers (lazily create the shared clock).
        const dt = (this.animClock || (this.animClock = new THREE.Clock())).getDelta();

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

            // A character mesh is wanted when the player isn't disguised as a prop
            // and the model is loaded. If a cached mesh is still a fallback box/
            // cylinder (created before player.glb finished/failed to load), upgrade
            // it now — this self-heals the load race that left one client on
            // primitives.
            const wantCharacter = (p.role === "Seeker" || p.disguiseType === "player")
                && !!this.rigForRole(p.role) && !!THREE.SkeletonUtils;

            if (
                playerMeshes[id] &&
                (playerMeshes[id].userData.disguiseType !== p.disguiseType ||
                 playerMeshes[id].userData.meshKey !== meshKey ||
                 (wantCharacter && !playerMeshes[id].userData.isCharacter))
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

            // Drive the character animation from its rendered movement.
            if (mesh.userData.mixer) this.updateCharacterAnim(mesh, p, dt);
            // Red reveal blink after a hit.
            this.applyRevealBlink(mesh, p);
        }

        // Advance energy-pulse projectiles.
        this.updateProjectiles(dt);

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
            // Follow the player's body (incl. jumping) — centered on p.y, not a
            // fixed ground height — so the gizmo rises with the character.
            this.playerColliderHelper.position.set(p.x, p.y, p.z);
        } else if (!developer && this.playerColliderHelper) {
            scene.remove(this.playerColliderHelper);
            this.playerColliderHelper = null;
        }

        if (gameState.players[myId]) {
            const p = gameState.players[myId];
            const groundY = p.y - PropLevel.PLAYER_BASE_HEIGHT;   // player's feet

            // --- Over-the-shoulder (PUBG/Free Fire style) rig. Tunables: ---
            //  CAM_BACK   distance behind the player (smaller = bigger character)
            //  CAM_RIGHT  right-shoulder offset → player sits left-of-centre
            //  CAM_EYE    camera height above the player's feet
            //  (default downward tilt comes from cameraPitch ≈ 0.2 rad ≈ 11°)
            const CAM_BACK = 5.0;
            const CAM_RIGHT = 1.7;
            const CAM_EYE = 2.6;

            // Horizontal forward (into the screen) + screen-right vectors.
            const fX = -Math.sin(cameraYaw), fZ = -Math.cos(cameraYaw);
            const rX = -fZ, rZ = fX;
            // Full look direction includes pitch (pitch>0 looks down).
            const cp = Math.cos(cameraPitch), sp = Math.sin(cameraPitch);
            const dX = fX * cp, dY = -sp, dZ = fZ * cp;

            camera.position.set(
                p.x - fX * CAM_BACK + rX * CAM_RIGHT,
                groundY + CAM_EYE,
                p.z - fZ * CAM_BACK + rZ * CAM_RIGHT
            );
            // Aim straight along the look direction so the centred crosshair = the
            // shot direction; the right offset keeps the body left-of-centre.
            camera.lookAt(
                camera.position.x + dX,
                camera.position.y + dY,
                camera.position.z + dZ
            );
        }

        renderer.render(scene, camera);
    }
};
