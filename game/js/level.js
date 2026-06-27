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

        const total = files.length + 1;   // + the animated player character
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

        // Animated player character — keep BOTH scene and animations. If it
        // fails, the game falls back to box/cylinder primitives.
        loader.load(
            "assets/models/player.glb",
            (gltf) => {
                this.playerGLB = { scene: gltf.scene, animations: gltf.animations || [] };

                // Pick clips by name with sensible fallbacks.
                const anims = this.playerGLB.animations;
                const byName = subs => anims.find(a =>
                    subs.some(s => (a.name || '').toLowerCase().includes(s)));
                this.playerClips = {
                    idle:  byName(['idle', 'stand']) || anims[0] || null,
                    walk:  byName(['walk', 'move']) || anims[1] || anims[0] || null,
                    run:   byName(['run', 'sprint']) || null,
                    jump:  byName(['jump', 'leap']) || null,
                    shoot: byName(['shoot', 'fire', 'attack', 'aim', 'gun']) || null
                };
                console.log('player.glb clips:', anims.map(a => a.name),
                    '→ idle:', this.playerClips.idle && this.playerClips.idle.name,
                    'walk:', this.playerClips.walk && this.playerClips.walk.name,
                    'run:', this.playerClips.run && this.playerClips.run.name,
                    'jump:', this.playerClips.jump && this.playerClips.jump.name,
                    'shoot:', this.playerClips.shoot && this.playerClips.shoot.name);

                // Build an additive, UPPER-BODY-ONLY version of the shoot clip so it
                // overlays on top of any lower-body locomotion (legs keep walking).
                this.playerClips.shootAdditive = this.buildUpperBodyAdditive(this.playerClips.shoot);

                done();
            },
            undefined,
            (err) => { console.error("Failed: player.glb", err); done(); }
        );
    },

    // Build an ADDITIVE clip from the shoot clip that only touches UPPER-BODY
    // bones (rotation tracks), so it can overlay on lower-body locomotion. Bones
    // are split by name; tweak LOWER_BODY_RE if the console bone log shows the
    // legs animating during a shot. Returns null if unavailable.
    buildUpperBodyAdditive: function(shootClip) {
        if (!shootClip || !this.playerGLB || !THREE.AnimationUtils) return null;
        const LOWER_BODY_RE = /(hip|pelvis|thigh|leg|knee|shin|calf|foot|toe|root|ik)/i;

        const bones = [];
        this.playerGLB.scene.traverse(o => { if (o.isBone) bones.push(o.name); });
        console.log('player.glb bones:', bones);

        const keep = [];
        shootClip.tracks.forEach(tr => {
            const dot = tr.name.lastIndexOf('.');
            const bone = dot >= 0 ? tr.name.slice(0, dot) : tr.name;
            const prop = dot >= 0 ? tr.name.slice(dot + 1) : '';
            if (LOWER_BODY_RE.test(bone)) return;   // skip legs / hips / root
            if (prop === 'position') return;         // rotations only (no translation drift)
            keep.push(tr.clone());
        });
        if (!keep.length) { console.warn('shoot mask: no upper-body tracks found'); return null; }

        const clip = new THREE.AnimationClip(shootClip.name + '_upperAdditive', shootClip.duration, keep);
        // Reference the IDLE pose (not the shoot clip's own frame 0, which is
        // already aiming) so the additive delta is the full arm-raise+fire and
        // visibly overlays on the walking lower body.
        const refClip = (this.playerClips && this.playerClips.idle) || clip;
        THREE.AnimationUtils.makeClipAdditive(clip, 0, refClip, 30);
        return clip;
    },

    resize: function() {
        if (!renderer) return;
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
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
        if (this.playerGLB && THREE.SkeletonUtils) {
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

        const model = THREE.SkeletonUtils.clone(this.playerGLB.scene);

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

        // Animation: build the action set; start in idle. Locomotion actions are
        // (re)started on demand. Jump is a one-shot; shoot is an additive
        // upper-body overlay that layers on top of the locomotion.
        const mixer = new THREE.AnimationMixer(model);
        const clips = this.playerClips || {};
        const actions = {};
        if (clips.idle) actions.idle = mixer.clipAction(clips.idle);
        if (clips.walk) actions.walk = mixer.clipAction(clips.walk);
        if (clips.run)  actions.run  = mixer.clipAction(clips.run);
        if (clips.jump) {
            actions.jump = mixer.clipAction(clips.jump);
            actions.jump.setLoop(THREE.LoopOnce, 1);
            actions.jump.clampWhenFinished = true;
        }
        if (clips.shootAdditive) {
            actions.shoot = mixer.clipAction(clips.shootAdditive);  // additive (clip.blendMode set)
            actions.shoot.setEffectiveWeight(0);
            actions.shoot.play();   // additive runs continuously; weight gates it
        }
        if (actions.idle) actions.idle.play();
        else if (actions.walk) actions.walk.play();

        root.userData.isCharacter = true;
        root.userData.mixer = mixer;
        root.userData.actions = actions;
        root.userData.hasClips = !!(actions.idle || actions.walk);
        root.userData.ring = ring;
        root.userData.current = 'idle';
        root.userData.lastJumpAt = 0;
        root.userData.jumpActive = false;
        root.userData.shootOn = false;
        root.userData.lastPos = new THREE.Vector3(p.x, p.y, p.z);
        // For the procedural fallback (player.glb ships with no clips): bob the
        // model child around this grounded base Y so the foot ring stays put.
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

        let moving = (ud.current === 'walk' || ud.current === 'backwalk');
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

        // --- Base layer: jump one-shot overrides locomotion ---
        if (p.jumpAt && p.jumpAt > (ud.lastJumpAt || 0) && ud.actions.jump) {
            ud.lastJumpAt = p.jumpAt;
            const j = ud.actions.jump;
            j.reset(); j.setEffectiveTimeScale(1); j.setEffectiveWeight(1);
            j.fadeIn(0.1); j.play();
            const prev = ud.actions[ud.current === 'backwalk' ? 'walk' : ud.current];
            if (prev && prev !== j) prev.fadeOut(0.1);
            ud.jumpActive = true;
            ud.current = 'jump';
        }
        if (ud.jumpActive) {
            const j = ud.actions.jump;
            const dur = j ? j.getClip().duration : 0;
            if (!j || j.time >= dur - 0.02 || !j.isRunning()) ud.jumpActive = false;
        }

        if (!ud.jumpActive) {
            // Direction relative to facing → forward walk or reversed back-walk.
            const fwdX = Math.sin(p.rotY), fwdZ = Math.cos(p.rotY);
            const dotF = ud.velX * fwdX + ud.velZ * fwdZ;
            let target = !moving ? 'idle' : (dotF < -0.2 ? 'backwalk' : 'walk');
            if (target !== 'idle' && !ud.actions.walk) target = 'idle';

            if (target !== ud.current) this._setBaseAction(ud, target);
            // Keep the walk action's direction in sync every frame.
            if ((ud.current === 'walk' || ud.current === 'backwalk') && ud.actions.walk) {
                ud.actions.walk.setEffectiveTimeScale(ud.current === 'backwalk' ? -1 : 1);
            }
        }

        // --- Additive overlay: upper-body shoot while in the shoot window ---
        if (ud.actions.shoot) {
            const shooting = !p.isCaught && Network.now() < (p.shootingUntil || 0);
            if (shooting && !ud.shootOn) {
                ud.actions.shoot.reset();
                ud.actions.shoot.setEffectiveWeight(1);
                ud.actions.shoot.fadeIn(0.1);
                ud.actions.shoot.play();
                ud.shootOn = true;
            } else if (!shooting && ud.shootOn) {
                ud.actions.shoot.fadeOut(0.25);
                ud.shootOn = false;
            }
        }

        ud.mixer.update(dt);
    },

    // Crossfade the base locomotion action. 'backwalk' reuses the walk action
    // (reversed via timeScale by the caller), so switching walk<->backwalk does
    // not refade.
    _setBaseAction: function(ud, target) {
        const map = { idle: 'idle', walk: 'walk', backwalk: 'walk', run: 'run', jump: 'jump' };
        const nextName = ud.actions[map[target]] ? map[target] : 'idle';
        const prevName = map[ud.current] || ud.current;
        const next = ud.actions[nextName];
        const prev = ud.actions[prevName];
        if (next && next !== prev) {
            next.reset();
            next.setEffectiveWeight(1);
            next.fadeIn(0.2);
            next.play();
            if (prev) prev.fadeOut(0.2);
        }
        ud.current = target;
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
        return {
            ox: o.x, oy: o.y, oz: o.z,
            dx: d.x, dy: d.y, dz: d.z,
            mx: localPos.x, my: localPos.y + 1.0, mz: localPos.z
        };
    },

    // Spawn the visual bolt from the muzzle toward the ray's aim point.
    spawnPulse: function(ray) {
        const range = (typeof SHOT_RANGE !== 'undefined' ? SHOT_RANGE : 60);
        const ax = ray.ox + ray.dx * range;
        const ay = ray.oy + ray.dy * range;
        const az = ray.oz + ray.dz * range;
        const mx = ray.mx != null ? ray.mx : ray.ox;
        const my = ray.my != null ? ray.my : ray.oy;
        const mz = ray.mz != null ? ray.mz : ray.oz;
        this.spawnProjectile(mx, my, mz, ax - mx, ay - my, az - mz);
    },

    // Spawn a blue energy-pulse projectile that flies along (dx,dy,dz) and is
    // culled after SHOT_RANGE. Purely cosmetic — hit logic is host-authoritative.
    spawnProjectile: function(ox, oy, oz, dx, dy, dz) {
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
            maxDist: (typeof SHOT_RANGE !== 'undefined' ? SHOT_RANGE : 60)
        });
    },

    // Advance + cull live projectiles (called once per render frame).
    updateProjectiles: function(dt) {
        const list = this._projectiles;
        if (!list || !list.length) return;
        const speed = 90;   // world units / sec
        for (let i = list.length - 1; i >= 0; i--) {
            const pr = list[i];
            const step = speed * dt;
            pr.mesh.position.x += pr.dir.x * step;
            pr.mesh.position.y += pr.dir.y * step;
            pr.mesh.position.z += pr.dir.z * step;
            pr.traveled += step;
            if (pr.traveled >= pr.maxDist) {
                scene.remove(pr.mesh);
                pr.mesh.geometry.dispose();
                list.splice(i, 1);
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
                && !!this.playerGLB && !!THREE.SkeletonUtils;

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
