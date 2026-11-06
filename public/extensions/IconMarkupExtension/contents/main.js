class IconMarkupExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this._group = null;
        this._button = null;
        this._icons = options.icons || [];
        this._tree = null;
        this._updateIconsCallback = () => {
            if (this._enabled) {
                this.updateIcons();
            }
        };
    }

    async load() {
        this._tree = await this.viewer.model.getObjectTreeAsync();
        this.viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, this._updateIconsCallback);
        this.viewer.addEventListener(Autodesk.Viewing.ISOLATE_EVENT, this._updateIconsCallback);
        this.viewer.addEventListener(Autodesk.Viewing.HIDE_EVENT, this._updateIconsCallback);
        this.viewer.addEventListener(Autodesk.Viewing.SHOW_EVENT, this._updateIconsCallback);
        return true;
    }

    unload() {
        this.viewer.removeEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, this._updateIconsCallback);
        this.viewer.removeEventListener(Autodesk.Viewing.ISOLATE_EVENT, this._updateIconsCallback);
        this.viewer.removeEventListener(Autodesk.Viewing.HIDE_EVENT, this._updateIconsCallback);
        this.viewer.removeEventListener(Autodesk.Viewing.SHOW_EVENT, this._updateIconsCallback);
        // Clean our UI elements if we added any
        if (this._group) {
            this._group.removeControl(this._button);
            if (this._group.getNumberOfControls() === 0) {
                this.viewer.toolbar.removeControl(this._group);
            }
        }
        $('#' + this.viewer.clientContainer.id + ' div.adsk-viewing-viewer label.markup').remove();
        return true;
    }

    onToolbarCreated() {
        // Create a new toolbar group if it doesn't exist
        this._group = this.viewer.toolbar.getControl('customExtensions');
        if (!this._group) {
            this._group = new Autodesk.Viewing.UI.ControlGroup('customExtensions');
            this.viewer.toolbar.addControl(this._group);
        }

        // Add a new button to the toolbar group
        this._button = new Autodesk.Viewing.UI.Button('IconExtension');
        this._button.onClick = (ev) => {
            this._enabled = !this._enabled;
            this.showIcons(this._enabled);
            this._button.setState(this._enabled ? 0 : 1);

        };
        this._button.setToolTip(this.options.button.tooltip);
        this._button.icon.classList.add('fas', this.options.button.icon);
        this._group.addControl(this._button);
    }

    showIcons(show) {
        const $viewer = $('#' + this.viewer.clientContainer.id + ' div.adsk-viewing-viewer');

        // remove previous...
        $('#' + this.viewer.clientContainer.id + ' div.adsk-viewing-viewer label.markup').remove();
        if (!show) return;

        // do we have anything to show?
        if (!this._icons) return;

        // do we have access to the object tree?
        if (!this._tree) { console.log('Loading tree...'); return; }

        const onClick = (e) => {
            const dbId = $(e.currentTarget).data('id');
            this.viewer.select(dbId);
            this.viewer.fitToView([dbId]);
        };

        for (const icon of this._icons) {
            // create the label for the dbId
            const $label = $(`
            <label class="markup update" data-id="${icon.dbId}">
                <span class="${icon.css}"> ${icon.label || ''}</span>
            </label>
            `);
            $label.css('display', this.viewer.isNodeVisible(icon.dbId) ? 'block' : 'none');
            $label.on('click', this.options.onClick || onClick);
            $viewer.append($label);
        }
        this.updateIcons();
    }

    // Returns the bounding box of a dbId (and its children) as it appears in the viewer,
    // or null if none of its geometry has been loaded yet (models stream in).
    getModifiedWorldBoundingBox(dbId) {
        const avm = Autodesk.Viewing.Math;
        const instances = this.viewer.model.getInstances();
        const nodeBox = new avm.Box3();
        const instanceBox = new avm.Box3();
        let found = false;
        this._tree.enumNodeInstances(dbId, (instanceId) => {
            if (instances.getGeometry(instanceId)) {
                instances.getWorldBounds(instanceId, instanceBox);
                nodeBox.union(instanceBox);
                found = true;
            }
        }, true);
        return found ? nodeBox : null;
    }

    updateIcons() {
        for (const label of $('#' + this.viewer.clientContainer.id + ' div.adsk-viewing-viewer .update')) {
            const $label = $(label);
            const id = $label.data('id');

            // get the center of the dbId (based on its bounding box)
            const box = this.getModifiedWorldBoundingBox(id);
            if (!box) {
                $label.css('display', 'none');
                continue;
            }
            const center = box.getCenter(new Autodesk.Viewing.Math.Vector3());
            const pos = this.viewer.worldToClient(center);

            // position the label center to it
            $label.css('left', Math.floor(pos.x - $label[0].offsetWidth / 2) + 'px');
            $label.css('top', Math.floor(pos.y - $label[0].offsetHeight / 2) + 'px');
            $label.css('display', this.viewer.isNodeVisible(id) ? 'block' : 'none');
        }
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('IconMarkupExtension', IconMarkupExtension);
