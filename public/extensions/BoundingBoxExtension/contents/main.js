///////////////////////////////////////////////////////////////////
// Bounding Box viewer extension
// Based on https://aps.autodesk.com/blog/adding-custom-lines-forge-viewer-scene
// Draws the box in an overlay render layer using the Scene API.
///////////////////////////////////////////////////////////////////
const BoundingBoxLayer = 'boundingBox';

class BoundingBoxExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this._onItemSelected = this._onItemSelected.bind(this);
        this._layerModel = null;
        this._material = null;
        this._boxInstanceId = null;
    }

    load() {
        const avs = Autodesk.Viewing.Scene;
        const layers = this.viewer.getRenderLayers();
        layers.create(BoundingBoxLayer, { renderTarget: 'overlay', renderOrder: 1 });
        this._layerModel = new Autodesk.Viewing.Model();
        layers.addModel(this._layerModel, BoundingBoxLayer);
        // Note: lines are always 1px wide in v8 (the v7 version used linewidth: 2)
        this._material = new avs.LineMaterial({ color: 0xffff00 });

        this.viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this._onItemSelected);
        console.log('BoundingBoxExtension loaded');
        return true;
    }

    unload() {
        this.viewer.removeEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this._onItemSelected);
        this.viewer.getRenderLayers().remove(BoundingBoxLayer);
        this._layerModel = null;
        this.viewer.refresh(true);
        console.log('BoundingBoxExtension unloaded');
        return true;
    }

    async _onItemSelected(event) {
        const model = event.model || this.viewer.model;
        const dbIds = event.dbIdArray || [];
        const box = dbIds.length > 0 ? await this._getModifiedWorldBoundingBox(model, dbIds) : null;
        if (!this._layerModel) return; // unloaded in the meantime
        this._drawBox(box);
    }

    // Returns bounding box as it appears in the viewer (transformations could be applied),
    // or null if none of the geometry has been loaded yet.
    async _getModifiedWorldBoundingBox(model, dbIds) {
        const avm = Autodesk.Viewing.Math;
        const tree = await model.getObjectTreeAsync();
        const instances = model.getInstances();
        const nodeBox = new avm.Box3();
        const instanceBox = new avm.Box3();
        let found = false;
        for (const dbId of dbIds) {
            tree.enumNodeInstances(dbId, (instanceId) => {
                if (instances.getGeometry(instanceId)) {
                    instances.getWorldBounds(instanceId, instanceBox);
                    nodeBox.union(instanceBox);
                    found = true;
                }
            }, true);
        }
        return found ? nodeBox : null;
    }

    // Replaces the previously drawn box (if any) with the new one; draws nothing for a null box.
    _drawBox(box) {
        const avs = Autodesk.Viewing.Scene;
        const instances = this._layerModel.getInstances();
        if (this._boxInstanceId !== null) {
            instances.remove(this._boxInstanceId);
            this._boxInstanceId = null;
        }
        if (box) {
            const { min, max } = box;
            // The 8 corners of the box...
            const positions = new Float32Array([
                min.x, min.y, min.z,  max.x, min.y, min.z,  max.x, min.y, max.z,  min.x, min.y, max.z,
                min.x, max.y, min.z,  max.x, max.y, min.z,  max.x, max.y, max.z,  min.x, max.y, max.z
            ]);
            // ... and its 12 edges, as pairs of corner indices (LineMaterial draws one segment per pair)
            const indices = new Uint16Array([
                0, 1,  1, 2,  2, 3,  3, 0, // bottom (min y)
                4, 5,  5, 6,  6, 7,  7, 4, // top (max y)
                0, 4,  1, 5,  2, 6,  3, 7  // sides
            ]);
            const geometry = new avs.BufferGeometry();
            geometry.setAttribute('position', new avs.BufferAttribute(positions, 3));
            geometry.setIndices(indices);
            const id = instances.add(geometry, this._material);
            if (id >= 0) this._boxInstanceId = id;
        }
        this.viewer.refresh(true);
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('BoundingBoxExtension', BoundingBoxExtension);
