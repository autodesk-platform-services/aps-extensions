///////////////////////////////////////////////////////////////////
// SceneAnimator: applies animated values (position, rotation, scale,
// visibility and theming color) to elements of a loaded model, using the
// Scene API of Viewer v8 (Autodesk.Viewing.Scene.InstanceCollection3D).
// Shared by the animation editor and player extensions, so that both
// bind Theatre.js objects to the model the same way.
//
// Each animated element (a dbId) rotates and scales around the center of its
// bounding box. When an animated element is inside another animated element in
// the object tree, it follows that parent element's transform.
//
// The transforms are set directly on the instances with setTransformWorld,
// based on each instance's original transform. (Wrapping the instances in Node3D
// groups would work for a fixed structure, but moving an InstanceNode3D to
// another group, which nesting needs when elements are added, creates new instances.)
///////////////////////////////////////////////////////////////////
(function () {
    if (window.SceneAnimator) return; // loaded by both extensions

    // Object keys in Theatre.js look like "Name [dbId]"; the dbId is what binds them to the model
    const KEY_PATTERN = /\[(\d+)\]\s*$/;
    const DEG = Math.PI / 180;

    // Theatre.js refuses to be loaded twice on a page. The editor extension loads core and studio together;
    // the player only needs the core, so it reuses that one when it's there, and loads the core-only bundle otherwise.
    const CORE_URL = 'https://cdn.jsdelivr.net/npm/@theatre/browser-bundles@0.7.2/dist/core-only.min.js';
    let corePromise = null;

    // Theatre.js studio from the core-and-studio bundle, or null. (The core-only bundle has a `studio` getter
    // that shows an alert, so don't just read the property.)
    function theatreStudio() {
        const descriptor = window.Theatre && Object.getOwnPropertyDescriptor(window.Theatre, 'studio');
        return descriptor && 'value' in descriptor ? descriptor.value : null;
    }

    class SceneAnimator {
        static theatreStudio() {
            return theatreStudio();
        }

        static loadTheatreCore() {
            if (window.Theatre && window.Theatre.core) return Promise.resolve(window.Theatre.core);
            corePromise = corePromise || new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = CORE_URL;
                script.onload = () => resolve(window.Theatre.core);
                script.onerror = () => {
                    corePromise = null;
                    reject(new Error('Failed to load ' + CORE_URL));
                };
                document.head.append(script);
            });
            return corePromise;
        }

        constructor(viewer, model) {
            this.viewer = viewer;
            this.model = model;
            this.instances = model.getInstances();
            this.entries = new Map(); // dbId -> { dbId, pivot, parent, values, themedDbIds }
            this.owner = new Map(); // instanceId -> entry whose transform the instance follows
            this.original = new Map(); // instanceId -> original world transform (Matrix4)
            this.tree = null;
            this._frame = 0;
        }

        static keyFor(dbId, name) {
            // Slashes would create folders in Theatre.js
            const label = String(name || 'Object').replace(/[\/\[\]]/g, '-').trim() || 'Object';
            return `${label} [${dbId}]`;
        }

        static dbIdFromKey(key) {
            const match = KEY_PATTERN.exec(key);
            return match ? parseInt(match[1], 10) : null;
        }

        // Keys of the objects that have values or keyframes in a sheet of a Theatre.js project state (as exported from the studio)
        static objectKeys(state, sheetName) {
            const sheet = state && state.sheetsById && state.sheetsById[sheetName];
            if (!sheet) return [];
            const hasValues = (value) => value !== null && typeof value === 'object'
                ? Object.values(value).some(hasValues)
                : value !== undefined;
            const hasKeyframes = (tracks) => Object.values((tracks && tracks.trackData) || {})
                .some(track => track.keyframes && track.keyframes.length > 0);
            const statics = (sheet.staticOverrides && sheet.staticOverrides.byObject) || {};
            const sequenced = (sheet.sequence && sheet.sequence.tracksByObject) || {};
            const keys = new Set([
                ...Object.keys(statics).filter(key => hasValues(statics[key])),
                ...Object.keys(sequenced).filter(key => hasKeyframes(sequenced[key]))
            ]);
            return [...keys];
        }

        // The props each animated object has in Theatre.js. `size` is the model size, used to pick sensible nudge steps.
        static createProps(types, size = 100) {
            const step = Math.max(size / 500, 1e-3);
            const vec = (value, nudgeMultiplier) => types.compound({
                x: types.number(value, { nudgeMultiplier }),
                y: types.number(value, { nudgeMultiplier }),
                z: types.number(value, { nudgeMultiplier })
            });
            return {
                position: vec(0, step), // offset in model units
                rotation: vec(0, 1), // degrees, applied in X, Y, Z order around the element's center
                scale: vec(1, 0.01),
                visibility: types.stringLiteral('visible', { visible: 'Visible', ghosted: 'Ghosted', hidden: 'Hidden' }),
                color: types.rgba({ r: 1, g: 0, b: 0, a: 0 }) // theming color, alpha is the intensity (0 = none)
            };
        }

        static defaultValues() {
            return {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
                visibility: 'visible',
                color: { r: 1, g: 0, b: 0, a: 0 }
            };
        }

        static visibilityState(value) {
            const states = Autodesk.Viewing.Scene.VisibilityState;
            return value === 'hidden' ? states.Hidden : value === 'ghosted' ? states.Ghosted : states.Visible;
        }

        async init() {
            if (!this.model.isLoadDone()) {
                await new Promise(resolve => {
                    const onLoaded = (event) => {
                        if (event.model !== this.model) return;
                        this.viewer.removeEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, onLoaded);
                        resolve();
                    };
                    this.viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, onLoaded);
                });
            }
            this.tree = await this.model.getObjectTreeAsync();
            this.size = this._computeModelSize();
            // Loaded models are optimized for rendering (UsageHint.Static); animated instances need Dynamic
            this.previousUsageHint = this.instances.getUsageHint();
            this.instances.setUsageHint(Autodesk.Viewing.Scene.UsageHint.Dynamic);
            return this;
        }

        modelSize() {
            return this.size;
        }

        _computeModelSize() {
            try {
                const box = this.model.getBoundingBox();
                const size = box ? box.getSize(new Autodesk.Viewing.Math.Vector3()).length() : 0;
                return size > 0 && isFinite(size) ? size : 100;
            } catch (err) {
                return 100;
            }
        }

        has(dbId) {
            return this.entries.has(dbId);
        }

        getName(dbId) {
            return this.tree.getNodeName(dbId);
        }

        _ancestors(dbId) {
            const ids = [];
            const rootId = this.tree.getRootId();
            for (let id = this.tree.getNodeParentId(dbId); typeof id === 'number' && id > 0; id = this.tree.getNodeParentId(id)) {
                ids.push(id);
                if (id === rootId) break;
            }
            return ids;
        }

        // Nearest animated ancestor of a dbId in the object tree
        _animatedAncestor(dbId) {
            const id = this._ancestors(dbId).find(ancestor => this.entries.has(ancestor));
            return id === undefined ? null : this.entries.get(id);
        }

        _instancesOf(dbId) {
            const ids = [];
            this.tree.enumNodeInstances(dbId, (instanceId) => {
                if (this.instances.getGeometry(instanceId)) ids.push(instanceId); // skip instances that are not loaded
            }, true);
            return ids;
        }

        // Starts animating a dbId. Returns false if it has no loaded geometry.
        add(dbId) {
            if (this.entries.has(dbId)) return true;
            const instanceIds = this._instancesOf(dbId);
            if (instanceIds.length === 0) return false;

            this._restructure(() => {
                const avm = Autodesk.Viewing.Math;
                const box = new avm.Box3(), bounds = new avm.Box3();
                for (const id of instanceIds) {
                    this.instances.getWorldBounds(id, bounds);
                    box.union(bounds);
                }
                const parent = this._animatedAncestor(dbId);
                const entry = {
                    dbId, parent,
                    pivot: box.getCenter(new avm.Vector3()),
                    values: SceneAnimator.defaultValues(),
                    themedDbIds: new Set()
                };
                this.entries.set(dbId, entry);
                // Animated elements inside this one now follow it
                for (const other of this.entries.values()) {
                    if (other !== entry && other.parent === parent && this._ancestors(other.dbId).includes(dbId)) {
                        other.parent = entry;
                    }
                }
                // Instances follow this element, unless they belong to an animated element inside it
                for (const id of instanceIds) {
                    const current = this.owner.get(id);
                    if (current && current !== parent) continue;
                    if (!this.original.has(id)) this.original.set(id, this._getTransform(id));
                    this.owner.set(id, entry);
                }
            });
            return true;
        }

        // Stops animating a dbId; its instances and animated children follow its parent again
        remove(dbId) {
            const entry = this.entries.get(dbId);
            if (!entry) return;
            this._restructure(() => {
                const visible = Autodesk.Viewing.Scene.VisibilityState.Visible;
                for (const [id, owner] of [...this.owner]) {
                    if (owner !== entry) continue;
                    if (entry.parent) {
                        this.owner.set(id, entry.parent);
                    } else {
                        this.owner.delete(id);
                        this.original.delete(id);
                        this.instances.setVisibilityState(id, visible);
                    }
                }
                for (const other of this.entries.values()) {
                    if (other.parent === entry) other.parent = entry.parent;
                }
                this._setColor(entry, null);
                this.entries.delete(dbId);
            });
        }

        // Applies animated values (as given by Theatre.js) to a dbId
        apply(dbId, values) {
            const entry = this.entries.get(dbId);
            if (!entry) return;
            entry.values = values;
            this._setColor(entry, values.color);
            this._scheduleUpdate();
        }

        // Runs `change` with every animated instance back in its original place, then applies the animated values
        // again. Pivots are computed from the original positions.
        _restructure(change) {
            for (const [id, matrix] of this.original) this.instances.setTransformWorld(id, matrix);
            change();
            this._updateThemedDbIds();
            this._update();
        }

        _getTransform(instanceId) {
            const matrix = new Autodesk.Viewing.Math.Matrix4();
            this.instances.getTransformWorld(instanceId, matrix);
            return matrix;
        }

        // The element's transform relative to its original place: rotate and scale around the pivot, then move
        _localTransform({ pivot, values: { position, rotation, scale } }) {
            const avm = Autodesk.Viewing.Math;
            const qx = new avm.Quaternion().setFromAxisAngle(new avm.Vector3(1, 0, 0), rotation.x * DEG);
            const qy = new avm.Quaternion().setFromAxisAngle(new avm.Vector3(0, 1, 0), rotation.y * DEG);
            const qz = new avm.Quaternion().setFromAxisAngle(new avm.Vector3(0, 0, 1), rotation.z * DEG);
            const quaternion = qz.multiply(qy).multiply(qx); // X first, then Y, then Z
            const translation = new avm.Vector3(pivot.x + position.x, pivot.y + position.y, pivot.z + position.z);
            const matrix = new avm.Matrix4().compose(translation, quaternion, new avm.Vector3(scale.x, scale.y, scale.z));
            return matrix.multiply(new avm.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
        }

        // Sets the transform and visibility of every animated instance from the current values
        _update() {
            const worlds = new Map(); // entry -> { matrix, visibility } including the parents' transforms
            const resolve = (entry) => {
                if (!worlds.has(entry)) {
                    const local = this._localTransform(entry);
                    const visibility = SceneAnimator.visibilityState(entry.values.visibility);
                    const parent = entry.parent ? resolve(entry.parent) : null;
                    worlds.set(entry, parent
                        // Hidden wins over ghosted, ghosted over visible (VisibilityState values grow in that order)
                        ? { matrix: parent.matrix.clone().multiply(local), visibility: Math.max(visibility, parent.visibility) }
                        : { matrix: local, visibility });
                }
                return worlds.get(entry);
            };
            for (const [id, entry] of this.owner) {
                const { matrix, visibility } = resolve(entry);
                this.instances.setTransformWorld(id, matrix.clone().multiply(this.original.get(id)));
                if (this.instances.getVisibilityState(id) !== visibility) this.instances.setVisibilityState(id, visibility);
            }
            this.viewer.refresh(true);
        }

        // At most one update per frame, however many values changed
        _scheduleUpdate() {
            if (this._frame) return;
            this._frame = requestAnimationFrame(() => {
                this._frame = 0;
                this._update();
            });
        }

        // Theming is per dbId: each animated element colors the dbIds of the instances that follow it
        _updateThemedDbIds() {
            for (const entry of this.entries.values()) {
                const dbIds = new Set();
                for (const [id, owner] of this.owner) {
                    if (owner === entry) dbIds.add(this.instances.getDbId(id));
                }
                for (const id of entry.themedDbIds) {
                    if (!dbIds.has(id)) this.instances.setThemingColor(id, undefined);
                }
                entry.themedDbIds = dbIds;
                this._setColor(entry, entry.values.color);
            }
        }

        _setColor(entry, color) {
            const vector = color && color.a > 0
                ? new Autodesk.Viewing.Math.Vector4(color.r, color.g, color.b, Math.min(color.a, 1))
                : undefined;
            for (const id of entry.themedDbIds) this.instances.setThemingColor(id, vector);
        }

        // Puts every animated element back as it was
        dispose() {
            if (this._frame) cancelAnimationFrame(this._frame);
            this._frame = 0;
            const visible = Autodesk.Viewing.Scene.VisibilityState.Visible;
            for (const [id, matrix] of this.original) {
                this.instances.setTransformWorld(id, matrix);
                this.instances.setVisibilityState(id, visible);
            }
            for (const entry of this.entries.values()) this._setColor(entry, null);
            if (this.previousUsageHint !== undefined) this.instances.setUsageHint(this.previousUsageHint);
            this.entries.clear();
            this.owner.clear();
            this.original.clear();
            this.viewer.refresh(true);
        }
    }

    window.SceneAnimator = SceneAnimator;
})();
