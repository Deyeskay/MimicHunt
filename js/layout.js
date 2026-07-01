// =============================================================================
// LayoutEditor — PUBG-style "Edit Layout" for the on-screen touch controls.
//
// Lets the player drag the joystick and the jump / prop / shoot / power buttons
// to any spot on the screen AND tune each control's SIZE (scale) and OPACITY,
// then Save. Positions are stored in GAME_SETTINGS.controlLayout per control as
// { x, y, scale, opacity } — x/y are % of the viewport (centre of the element)
// so they survive resolution / orientation changes; scale/opacity default to 1
// when absent (older saves). Persisted with the rest of the settings.
//
// Wiring: hamburger (☰) → game-menu → "Edit Layout" calls LayoutEditor.open().
// LayoutEditor.apply() runs once at startup to restore a saved layout. Tap a
// control to bind it to the Size/Opacity sliders in the editor bar.
// =============================================================================
const LayoutEditor = {
    // Each draggable control: storage key + element id.
    DRAGGABLES: [
        { key: 'joystick', id: 'joystick-zone' },
        { key: 'jump',     id: 'btn-action-jump' },
        { key: 'prop',     id: 'btn-action-disguise' },
        { key: 'shoot',    id: 'btn-action-shoot' },
        { key: 'power',    id: 'btn-action-power' }
    ],

    // Short label shown by the sliders for the selected control.
    LABELS: { joystick: 'MOVE', jump: 'JUMP', prop: 'PROP', shoot: 'SHOOT', power: 'POWER' },

    _teardown: [],       // listener-removers active only while editing
    _work: {},           // per-key { scale, opacity } being edited this session
    _selected: null,     // key of the control bound to the sliders

    // The CSS transform that centres an element on its (left,top) anchor and
    // applies its scale. Scale origin is the element centre, so scaling never
    // moves the anchor — the sliders can rewrite this without touching left/top.
    transformFor: function(scale) {
        return 'translate(-50%, -50%) scale(' + (scale != null ? scale : 1) + ')';
    },

    // Position an element by its CENTRE (viewport %), at an optional scale.
    positionAt: function(el, xPct, yPct, scale) {
        el.style.position  = 'fixed';
        el.style.left      = xPct + '%';
        el.style.top       = yPct + '%';
        el.style.right     = 'auto';
        el.style.bottom    = 'auto';
        el.style.margin    = '0';
        el.style.transform = this.transformFor(scale);
    },

    // Full config (position + scale + opacity) for normal (non-editing) use.
    // Opacity is only pinned inline when < 1 so a control at full opacity still
    // gets its natural disabled-state dimming from CSS.
    applyStyle: function(el, cfg) {
        this.positionAt(el, cfg.x, cfg.y, cfg.scale);
        const o = (cfg.opacity != null ? cfg.opacity : 1);
        if (o < 1) el.style.opacity = o;
        else el.style.removeProperty('opacity');
    },

    // Strip the inline positioning so the element falls back to its CSS default.
    clearInline: function(el) {
        ['position', 'left', 'top', 'right', 'bottom', 'margin', 'transform', 'opacity']
            .forEach(p => el.style.removeProperty(p));
    },

    // Effective layout = the player's saved custom one, or the shipped default
    // when they haven't customised (controlLayout empty).
    effective: function() {
        const L = GAME_SETTINGS.controlLayout || {};
        return Object.keys(L).length > 0 ? L : DEFAULT_CONTROL_LAYOUT;
    },

    // Apply the effective layout. clearMissing=true reverts any control NOT in
    // the layout back to its CSS default (used on Save / Cancel / Reset).
    applyAll: function(clearMissing) {
        const L = this.effective();
        document.body.classList.add('has-custom-layout');
        this.DRAGGABLES.forEach(d => {
            const el = document.getElementById(d.id);
            if (!el) return;
            if (L[d.key]) this.applyStyle(el, L[d.key]);
            else if (clearMissing) this.clearInline(el);
        });
    },

    // Startup restore.
    apply: function() { this.applyAll(false); },

    // Centre of an element as viewport percentages, or null if it isn't rendered.
    centerPct: function(el) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        return {
            x: +(((r.left + r.width  / 2) / window.innerWidth)  * 100).toFixed(2),
            y: +(((r.top  + r.height / 2) / window.innerHeight) * 100).toFixed(2)
        };
    },

    idOf: function(key) {
        const d = this.DRAGGABLES.find(d => d.key === key);
        return d ? d.id : null;
    },

    open: function() {
        if (isEditingLayout) return;
        isEditingLayout = true;
        document.body.classList.add('layout-editing');           // forces controls visible
        const bar = document.getElementById('layout-editor');
        if (bar) bar.style.display = 'flex';

        // Seed the per-control working scale/opacity from the saved layout.
        const L = this.effective();
        this._work = {};
        this.DRAGGABLES.forEach(d => {
            const c = L[d.key] || {};
            this._work[d.key] = {
                scale:   c.scale   != null ? c.scale   : 1,
                opacity: c.opacity != null ? c.opacity : 1
            };
        });

        // Let the forced-visible buttons settle, then pin each at its current
        // spot (with its working scale/opacity) and attach drag handlers.
        requestAnimationFrame(() => {
            this.DRAGGABLES.forEach(d => {
                const el = document.getElementById(d.id);
                if (!el) return;
                const c = this.centerPct(el);
                const w = this._work[d.key];
                if (c) this.positionAt(el, c.x, c.y, w.scale);
                // Show the working opacity live (even at 1) so the preview is
                // deterministic and overrides the disabled-state dimming.
                el.style.opacity = w.opacity;
                this._bindDrag(el, d.key);
            });
            this._bindSliders();
            // Auto-select the first rendered control so the sliders are live.
            const first = this.DRAGGABLES.find(d => {
                const el = document.getElementById(d.id);
                return el && this.centerPct(el);
            });
            if (first) this.select(first.key);
        });
    },

    // Bind the size/opacity sliders to whatever control is selected.
    select: function(key) {
        this._selected = key;
        this.DRAGGABLES.forEach(d => {
            const el = document.getElementById(d.id);
            if (el) el.classList.toggle('le-selected', d.key === key);
        });
        const w = this._work[key] || { scale: 1, opacity: 1 };
        const size = document.getElementById('le-size');
        const op   = document.getElementById('le-opacity');
        const name = document.getElementById('le-sel-name');
        if (size) size.value = w.scale;
        if (op)   op.value   = w.opacity;
        if (name) name.textContent = this.LABELS[key] || key.toUpperCase();
    },

    _bindSliders: function() {
        const self = this;
        const size = document.getElementById('le-size');
        const op   = document.getElementById('le-opacity');
        const onSize = function() {
            if (!self._selected) return;
            const v = parseFloat(size.value);
            self._work[self._selected].scale = v;
            const el = document.getElementById(self.idOf(self._selected));
            if (el) el.style.transform = self.transformFor(v);   // left/top unchanged
        };
        const onOp = function() {
            if (!self._selected) return;
            const v = parseFloat(op.value);
            self._work[self._selected].opacity = v;
            const el = document.getElementById(self.idOf(self._selected));
            if (el) el.style.opacity = v;
        };
        if (size) { size.addEventListener('input', onSize); this._teardown.push(() => size.removeEventListener('input', onSize)); }
        if (op)   { op.addEventListener('input', onOp);     this._teardown.push(() => op.removeEventListener('input', onOp)); }
    },

    _bindDrag: function(el, key) {
        const self = this;
        const onDown = function(e) {
            e.preventDefault();
            self.select(key);                     // tap-to-select for the sliders
            const r = el.getBoundingClientRect();
            const offX = e.clientX - (r.left + r.width / 2);
            const offY = e.clientY - (r.top + r.height / 2);
            const halfW = r.width / 2, halfH = r.height / 2;
            el.classList.add('le-dragging');
            try { el.setPointerCapture(e.pointerId); } catch (_) {}

            const onMove = function(ev) {
                let cx = ev.clientX - offX, cy = ev.clientY - offY;
                cx = Math.max(halfW, Math.min(window.innerWidth  - halfW, cx));
                cy = Math.max(halfH, Math.min(window.innerHeight - halfH, cy));
                self.positionAt(el, cx / window.innerWidth * 100, cy / window.innerHeight * 100,
                                self._work[key] ? self._work[key].scale : 1);
            };
            const onUp = function(ev) {
                el.classList.remove('le-dragging');
                try { el.releasePointerCapture(e.pointerId); } catch (_) {}
                el.removeEventListener('pointermove', onMove);
                el.removeEventListener('pointerup', onUp);
                el.removeEventListener('pointercancel', onUp);
            };
            el.addEventListener('pointermove', onMove);
            el.addEventListener('pointerup', onUp);
            el.addEventListener('pointercancel', onUp);
        };
        el.addEventListener('pointerdown', onDown);
        this._teardown.push(() => el.removeEventListener('pointerdown', onDown));
    },

    // Exit edit mode (without persisting). Re-applies the saved layout so any
    // un-saved dragging / sizing is reverted.
    _close: function() {
        isEditingLayout = false;
        document.body.classList.remove('layout-editing');
        const bar = document.getElementById('layout-editor');
        if (bar) bar.style.display = 'none';
        this._teardown.forEach(fn => fn());
        this._teardown = [];
        this.DRAGGABLES.forEach(d => {
            const el = document.getElementById(d.id);
            if (el) el.classList.remove('le-selected');
        });
        this._selected = null;
        this.applyAll(true);
    },

    save: function() {
        const L = {};
        this.DRAGGABLES.forEach(d => {
            const el = document.getElementById(d.id);
            if (!el) return;
            const c = this.centerPct(el);
            if (!c) return;
            const w = this._work[d.key] || { scale: 1, opacity: 1 };
            L[d.key] = { x: c.x, y: c.y, scale: +w.scale, opacity: +w.opacity };
        });
        GAME_SETTINGS.controlLayout = L;
        localStorage.setItem('hidehunt_settings', JSON.stringify(GAME_SETTINGS));
        this._close();
        if (typeof UI !== 'undefined') UI.toast('Layout saved');
    },

    cancel: function() { this._close(); },

    reset: function() {
        // Clearing the custom layout makes effective() fall back to the shipped
        // default; re-apply it live so the preview snaps to the default spots.
        GAME_SETTINGS.controlLayout = {};
        localStorage.setItem('hidehunt_settings', JSON.stringify(GAME_SETTINGS));
        // Reset the working scale/opacity too so a subsequent Save doesn't
        // re-persist stale slider values.
        this.DRAGGABLES.forEach(d => { this._work[d.key] = { scale: 1, opacity: 1 }; });
        if (isEditingLayout) {
            // Snap the previews to the shipped DEFAULT positions at full size/opacity.
            const L = this.effective();   // == DEFAULT_CONTROL_LAYOUT
            this.DRAGGABLES.forEach(d => {
                const el = document.getElementById(d.id);
                if (!el) return;
                if (L[d.key]) this.positionAt(el, L[d.key].x, L[d.key].y, 1);
                el.style.opacity = 1;
            });
            if (this._selected) this.select(this._selected);
        } else {
            this.applyAll(true);
        }
        if (typeof UI !== 'undefined') UI.toast('Layout reset to default');
    }
};
