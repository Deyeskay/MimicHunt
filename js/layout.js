// =============================================================================
// LayoutEditor — PUBG-style "Edit Layout" for the on-screen touch controls.
//
// Lets the player drag the joystick and the jump / prop / shoot buttons to any
// spot on the screen, then Save. Positions are stored in GAME_SETTINGS.controlLayout
// as { x, y } percentages of the viewport (centre of each element) so they survive
// resolution / orientation changes, and are persisted with the rest of the settings.
//
// Wiring: hamburger (☰) → game-menu → "Edit Layout" calls LayoutEditor.open().
// LayoutEditor.apply() runs once at startup to restore a saved layout.
// =============================================================================
const LayoutEditor = {
    // Each draggable control: storage key + element id.
    DRAGGABLES: [
        { key: 'joystick', id: 'joystick-zone' },
        { key: 'jump',     id: 'btn-action-jump' },
        { key: 'prop',     id: 'btn-action-disguise' },
        { key: 'shoot',    id: 'btn-action-shoot' }
    ],

    _teardown: [],   // listener-removers active only while editing

    // Position an element by its CENTRE, given as viewport percentages.
    positionAt: function(el, xPct, yPct) {
        el.style.position  = 'fixed';
        el.style.left      = xPct + '%';
        el.style.top       = yPct + '%';
        el.style.right     = 'auto';
        el.style.bottom    = 'auto';
        el.style.margin    = '0';
        el.style.transform = 'translate(-50%, -50%)';
    },

    // Strip the inline positioning so the element falls back to its CSS default.
    clearInline: function(el) {
        ['position', 'left', 'top', 'right', 'bottom', 'margin', 'transform']
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
            if (L[d.key]) this.positionAt(el, L[d.key].x, L[d.key].y);
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

    open: function() {
        if (isEditingLayout) return;
        isEditingLayout = true;
        document.body.classList.add('layout-editing');           // forces controls visible
        const bar = document.getElementById('layout-editor');
        if (bar) bar.style.display = 'flex';

        // Let the forced-visible buttons settle, then pin each at its current
        // spot and attach drag handlers.
        requestAnimationFrame(() => {
            this.DRAGGABLES.forEach(d => {
                const el = document.getElementById(d.id);
                if (!el) return;
                const c = this.centerPct(el);
                if (c) this.positionAt(el, c.x, c.y);
                this._bindDrag(el);
            });
        });
    },

    _bindDrag: function(el) {
        const self = this;
        const onDown = function(e) {
            e.preventDefault();
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
                self.positionAt(el, cx / window.innerWidth * 100, cy / window.innerHeight * 100);
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
    // un-saved dragging is reverted.
    _close: function() {
        isEditingLayout = false;
        document.body.classList.remove('layout-editing');
        const bar = document.getElementById('layout-editor');
        if (bar) bar.style.display = 'none';
        this._teardown.forEach(fn => fn());
        this._teardown = [];
        this.applyAll(true);
    },

    save: function() {
        const L = {};
        this.DRAGGABLES.forEach(d => {
            const el = document.getElementById(d.id);
            if (!el) return;
            const c = this.centerPct(el);
            if (c) L[d.key] = c;
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
        this.applyAll(true);
        if (typeof UI !== 'undefined') UI.toast('Layout reset to default');
    }
};
