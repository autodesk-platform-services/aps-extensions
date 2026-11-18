///////////////////////////////////////////////////////////////////
// Animation editor extension
// Select elements in the viewer, add them to the animation, and keyframe their
// position, rotation, scale, visibility and theming color in the animation editor
// (the Theatre.js studio).
// The animation is applied to the model through the Scene API (see SceneAnimator.js),
// and can be exported to a JSON file for the AnimationPlayer extension.
///////////////////////////////////////////////////////////////////
(function () {
    // Theatre.js core and studio, loaded with the first editor (see SceneAnimator.loadTheatreStudio)
    let core = null, studio = null;
    const SHEET_NAME = 'Scene';
    let activeExtension = null; // the studio is a page-wide singleton, so its toolbar talks to the loaded extension
    let studioInitialized = false;

    const icon = (path) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
    const ICONS = {
        add: icon('<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M8 5.5v5M5.5 8h5"/>'),
        remove: icon('<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5.5 8h5"/>'),
        export: icon('<path d="M8 2.5v8M5 7.5l3 3 3-3M3 13.5h10"/>')
    };

    function initStudio() {
        if (studioInitialized) {
            studio.ui.restore();
            return;
        }
        studio.extend({
            id: 'aps-viewer-animation',
            toolbars: {
                global(set) {
                    set([
                        { type: 'Icon', title: 'Animate the elements selected in the viewer', svgSource: ICONS.add, onClick: () => activeExtension?.addSelection() },
                        { type: 'Icon', title: 'Stop animating the elements selected in the viewer', svgSource: ICONS.remove, onClick: () => activeExtension?.removeSelection() },
                        { type: 'Icon', title: 'Download the animation for the player extension', svgSource: ICONS.export, onClick: () => activeExtension?.exportAnimation() }
                    ]);
                    return () => { };
                }
            }
        });
        studio.initialize();
        studio.ui.restore(); // the studio remembers being hidden (e.g. when the extension was unloaded) in local storage
        studioInitialized = true;
    }

    // The studio renders into a full-window, fixed-position element on <body>. Fit that element to the viewer instead,
    // and make it the containing block of the studio's own fixed-position panels (with a transform), so that the
    // studio stays within the viewer. (Moving the element into the viewer would lose the studio's styles, which
    // are inserted into its shadow DOM as CSSOM rules.) Menus and tooltips are positioned from mouse coordinates in
    // a full-cover layer, which is moved back to cover the window so that they show up next to the mouse.
    // Returns a function that stops following the viewer.
    function bindStudioToElement(element) {
        let root = null, pointerRoot = null, frame = 0, stopped = false;
        const layerObserver = new MutationObserver(() => schedule());
        const isFullCover = (node) => {
            if (node.dataset.apsViewportLayer) return true;
            const style = getComputedStyle(node);
            return style.position === 'fixed' && style.left === '0px' && style.top === '0px'
                && style.right === '0px' && style.bottom === '0px';
        };
        const fit = () => {
            if (!root || !root.isConnected) root = document.getElementById('theatrejs-studio-root');
            if (!root) return false;
            const { left, top, width, height } = element.getBoundingClientRect();
            Object.assign(root.style, {
                inset: 'auto',
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                transform: 'translateZ(0)'
            });
            const pointer = root.shadowRoot && root.shadowRoot.getElementById('pointer-root');
            if (pointer && pointer !== pointerRoot) {
                pointerRoot = pointer;
                layerObserver.disconnect();
                layerObserver.observe(pointerRoot, { childList: true });
                for (const child of pointerRoot.children) layerObserver.observe(child, { childList: true });
            }
            if (pointerRoot) {
                for (const layer of pointerRoot.querySelectorAll(':scope > *, :scope > * > *')) {
                    if (!isFullCover(layer)) continue;
                    layer.dataset.apsViewportLayer = 'true';
                    Object.assign(layer.style, {
                        left: `${-left}px`,
                        top: `${-top}px`,
                        right: 'auto',
                        bottom: 'auto',
                        width: `${window.innerWidth}px`,
                        height: `${window.innerHeight}px`
                    });
                }
            }
            return !!pointerRoot;
        };
        const schedule = () => {
            if (!frame && !stopped) frame = requestAnimationFrame(() => { frame = 0; fit(); });
        };
        // The elements are created when the studio's UI is first rendered
        const waitForRoot = () => {
            if (stopped || fit()) return;
            requestAnimationFrame(waitForRoot);
        };
        waitForRoot();
        const resizeObserver = new ResizeObserver(schedule);
        resizeObserver.observe(element);
        window.addEventListener('resize', schedule);
        window.addEventListener('scroll', schedule, true); // page or panel scrolling moves the viewer
        return () => {
            stopped = true;
            if (frame) cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            layerObserver.disconnect();
            window.removeEventListener('resize', schedule);
            window.removeEventListener('scroll', schedule, true);
        };
    }

    // Project ids in Theatre.js have 3 to 32 characters
    function projectIdFor(model) {
        const urn = model.getData().urn;
        let hash = 0xcbf29ce484222325n;
        for (let i = 0; i < urn.length; i++) {
            hash ^= BigInt(urn.charCodeAt(i));
            hash = BigInt.asUintN(64, hash * 0x100000001b3n);
        }
        return hash.toString(16).padStart(16, '0');
    }

    class AnimationEditor extends Autodesk.Viewing.Extension {
        constructor(viewer, options) {
            super(viewer, options);
            this._group = null;
            this._button = null;
            this.objects = new Map(); // dbId -> { key, object, unsubscribe }
            this._onSelectionChanged = this._onSelectionChanged.bind(this);
            this._syncingSelection = false;
        }

        async load() {
            const model = this.viewer.model;
            if (!model) {
                console.warn('[AnimationEditor] Load a model before loading this extension');
                return false;
            }
            ({ core, studio } = await SceneAnimator.loadTheatreStudio());
            this.model = model;
            this.animator = await new SceneAnimator(this.viewer, model).init();
            this.props = SceneAnimator.createProps(core.types, this.animator.modelSize());

            initStudio();
            this._unbindStudio = bindStudioToElement(this.viewer.container);
            activeExtension = this;
            this.projectId = this.options.projectId || projectIdFor(model);
            this.project = core.getProject(this.projectId);
            this.sheet = this.project.sheet(SHEET_NAME);
            await this.project.ready;
            if (activeExtension !== this) return true; // unloaded in the meantime

            // The studio keeps the project in the browser's local storage; bring back the objects animated last time
            for (const key of SceneAnimator.objectKeys(studio.createContentOfSaveFile(this.projectId), SHEET_NAME)) {
                const dbId = SceneAnimator.dbIdFromKey(key);
                if (dbId !== null) this._addObject(dbId, key);
            }

            this._unsubscribeStudioSelection = studio.onSelectionChange(selection => this._onStudioSelection(selection));
            this.viewer.addEventListener(Autodesk.Viewing.AGGREGATE_SELECTION_CHANGED_EVENT, this._onSelectionChanged);
            console.log('AnimationEditor loaded');
            return true;
        }

        unload() {
            this.viewer.removeEventListener(Autodesk.Viewing.AGGREGATE_SELECTION_CHANGED_EVENT, this._onSelectionChanged);
            if (this._unsubscribeStudioSelection) this._unsubscribeStudioSelection();
            if (this._unbindStudio) this._unbindStudio();
            for (const { key, unsubscribe } of this.objects.values()) {
                unsubscribe();
                this.sheet.detachObject(key);
            }
            this.objects.clear();
            if (this.animator) this.animator.dispose();
            if (activeExtension === this) {
                activeExtension = null;
                if (studioInitialized) studio.ui.hide();
            }
            if (this._group) {
                this._group.removeControl(this._button);
                if (this._group.getNumberOfControls() === 0) {
                    this.viewer.toolbar.removeControl(this._group);
                }
            }
            console.log('AnimationEditor unloaded');
            return true;
        }

        onToolbarCreated() {
            this._group = this.viewer.toolbar.getControl('animationToolbar');
            if (!this._group) {
                this._group = new Autodesk.Viewing.UI.ControlGroup('animationToolbar');
                this.viewer.toolbar.addControl(this._group);
            }
            this._button = new Autodesk.Viewing.UI.Button('animationEditorButton');
            this._button.icon.classList.add('fas', 'fa-film');
            this._button.setToolTip('Show or hide the animation editor');
            this._button.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
            this._button.onClick = () => {
                const visible = this._button.getState() !== Autodesk.Viewing.UI.Button.State.ACTIVE;
                if (visible) studio.ui.restore();
                else studio.ui.hide();
                this._button.setState(visible ? Autodesk.Viewing.UI.Button.State.ACTIVE : Autodesk.Viewing.UI.Button.State.INACTIVE);
            };
            this._group.addControl(this._button);
        }

        _addObject(dbId, key) {
            if (this.objects.has(dbId)) return this.objects.get(dbId).object;
            if (!this.animator.add(dbId)) {
                console.warn(`[AnimationEditor] No loaded geometry found for dbId ${dbId}`);
                return null;
            }
            key = key || SceneAnimator.keyFor(dbId, this.animator.getName(dbId));
            const object = this.sheet.object(key, this.props, { reconfigure: true });
            const unsubscribe = object.onValuesChange(values => this.animator.apply(dbId, values));
            this.objects.set(dbId, { key, object, unsubscribe });
            return object;
        }

        _removeObject(dbId) {
            const entry = this.objects.get(dbId);
            if (!entry) return;
            // Clear its values and keyframes, so that it doesn't come back from the saved project
            studio.transaction((api) => {
                if (api.__experimental_forgetObject) api.__experimental_forgetObject(entry.object);
                else api.unset(entry.object.props); // keeps keyframes
            });
            entry.unsubscribe();
            this.sheet.detachObject(entry.key);
            this.objects.delete(dbId);
            this.animator.remove(dbId);
        }

        _viewerSelection() {
            return this.viewer.getAggregateSelection()
                .filter(({ model }) => model === this.model)
                .flatMap(({ selection }) => selection);
        }

        addSelection() {
            const dbIds = this._viewerSelection();
            if (dbIds.length === 0) {
                studio.ui.restore();
                core.notify?.info?.('Nothing selected', 'Select elements in the viewer first, then add them to the animation.');
                return;
            }
            const objects = dbIds.map(dbId => this._addObject(dbId)).filter(Boolean);
            if (objects.length) studio.setSelection(objects);
        }

        removeSelection() {
            const dbIds = this._viewerSelection().filter(dbId => this.objects.has(dbId));
            if (dbIds.length === 0) return;
            if (!window.confirm(`Remove ${dbIds.length} element(s) and their keyframes from the animation?`)) return;
            dbIds.forEach(dbId => this._removeObject(dbId));
        }

        exportAnimation() {
            const state = studio.createContentOfSaveFile(this.projectId);
            const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${this.projectId}.animation.json`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }

        // Selecting an animated element in the viewer selects its object in the studio, and the other way round
        _onSelectionChanged() {
            if (this._syncingSelection) return;
            const objects = this._viewerSelection().map(dbId => this.objects.get(dbId)?.object).filter(Boolean);
            if (objects.length === 0) return;
            this._syncingSelection = true;
            try { studio.setSelection(objects); } finally { this._syncingSelection = false; }
        }

        _onStudioSelection(selection) {
            if (this._syncingSelection) return;
            const dbIds = [];
            for (const [dbId, { object }] of this.objects) {
                if (selection.includes(object)) dbIds.push(dbId);
            }
            if (dbIds.length === 0) return;
            this._syncingSelection = true;
            try { this.viewer.select(dbIds, this.model); } finally { this._syncingSelection = false; }
        }
    }

    Autodesk.Viewing.theExtensionManager.registerExtension('AnimationEditor', AnimationEditor);
})();
