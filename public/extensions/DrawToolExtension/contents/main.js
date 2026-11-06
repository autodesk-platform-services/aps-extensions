const BoxDrawToolName = 'box-draw-tool';
const SphereDrawToolName = 'sphere-draw-tool';
const DrawToolOverlay = 'draw-tool-overlay';

// Simple viewer tool for drawing boxes and spheres
class DrawTool extends Autodesk.Viewing.ToolInterface {
    constructor(extension) {
        super();
        this.extension = extension;

        // Hack: delete functions defined *on the instance* of the tool.
        // We want the tool controller to call our class methods instead.
        delete this.register;
        delete this.deregister;
        delete this.activate;
        delete this.deactivate;
        delete this.getPriority;
        delete this.handleMouseMove;
        delete this.handleButtonDown;
        delete this.handleButtonUp;
        delete this.handleSingleClick;

        this.state = ''; // '' (inactive), 'xy' (specifying extent in the XY plane), or 'z' (specifying height)
        this.names = [BoxDrawToolName, SphereDrawToolName];
    }

    register() {
        console.log('DrawTool registered.');
    }

    deregister() {
        console.log('DrawTool unregistered.');
    }

    activate(name, viewer) {
        this.viewer = viewer;
        this.overlayModel = this.extension.overlayModel;
        this.geometries = this.extension.geometries;
        this.materials = this.extension.materials;
        this.state = '';
        this.mode = (name === BoxDrawToolName) ? 'box' : 'sphere';
        console.log('DrawTool', name, 'activated.');
    }

    deactivate(name) {
        this.viewer = null;
        this.state = '';
        console.log('DrawTool', name, 'deactivated.');
    }

    getPriority() {
        return 1; // Use any number higher than 0 (the priority of all default tools)
    }

    handleButtonDown(event, button) {
        // If left button is pressed and we're not drawing already
        if (button === 0 && this.state === '') {
            const { clientX, clientY } = this._canvasCoords(event);
            const start = this._pickStart(clientX, clientY);
            if (!start) {
                this.bypassed = true;
                return false;
            }

            // Add a new instance of the unit box or sphere to the overlay; _update() scales and positions it
            const instances = this.overlayModel.getInstances();
            this.instanceId = (this.mode === 'box')
                ? instances.add(this.geometries.box, this.materials.box)
                : instances.add(this.geometries.sphere, this.materials.sphere);

            // Initialize the 3 values that will control the geometry's size (1st corner in the XY plane, 2nd corner in the XY plane, and height)
            this.corner1 = this.corner2 = start;
            this.height = 0.1;
            this._update();
            this.state = 'xy'; // Now we're drawing in the XY plane
            return true; // Stop the event from going to other tools in the stack
        }
        // Otherwise let another tool handle the event, and make note that our tool is now bypassed
        this.bypassed = true;
        return false;
    }

    handleButtonUp(event, button) {
        // If left button is released and we're drawing in the XY plane
        if (button === 0 && this.state === 'xy') {
            const { clientX, clientY } = this._canvasCoords(event);

            // Update the 2nd corner in the XY plane and switch to the 'z' state
            this.corner2 = this._intersect(clientX, clientY) || this.corner2;
            this._update();
            this.state = 'z';
            this.lastClientY = clientY; // Store the current mouse Y coordinate to compute height later on
            return true; // Stop the event from going to other tools in the stack
        }
        // Otherwise let another tool handle the event, and make note that our tool is no longer bypassed
        this.bypassed = false;
        return false;
    }

    handleMouseMove(event) {
        const { clientX, clientY } = this._canvasCoords(event);

        if (!this.bypassed && this.state === 'xy') {
            // If we're in the "XY plane drawing" state, and not bypassed by another tool
            this.corner2 = this._intersect(clientX, clientY) || this.corner2;
            this._update();
            return true;
        } else if (!this.bypassed && this.state === 'z') {
            // If we're in the "height drawing" state, and not bypassed by another tool
            this.height = this.lastClientY - clientY;
            this._update();
            return true;
        }
        // Otherwise let another tool handle the event
        return false;
    }

    handleSingleClick(event, button) {
        // If left button is clicked and we're currently in the "height drawing" state
        if (button === 0 && this.state === 'z') {
            this.state = '';
            return true; // Stop the event from going to other tools in the stack
        }
        // Otherwise let another tool handle the event
        return false;
    }

    _canvasCoords(event) {
        const rect = this.viewer.container.getBoundingClientRect();
        return { clientX: event.clientX - rect.left, clientY: event.clientY - rect.top };
    }

    // The first corner is the point on the model under the cursor. If there's no model there,
    // it's on the plane at the bottom of the model. Further points are on the horizontal plane through the first corner.
    _pickStart(clientX, clientY) {
        const avm = Autodesk.Viewing.Math;
        const bounds = this.extension.modelBounds;
        if (!bounds) return null; // the object tree isn't available yet
        this.step = Math.max(bounds.min.distanceTo(bounds.max), 1) * 1e-3;
        const hit = this.viewer.clientToWorld(clientX, clientY, true);
        if (hit && hit.point) {
            this.planeOrigin = new avm.Vector3(hit.point.x, hit.point.y, hit.point.z);
            return this.planeOrigin.clone();
        }
        // Start the search from the middle of the model's bottom
        this.planeOrigin = new avm.Vector3(
            (bounds.min.x + bounds.max.x) / 2,
            (bounds.min.y + bounds.max.y) / 2,
            bounds.min.z);
        return this._intersect(clientX, clientY);
    }

    _intersect(clientX, clientY) {
        const avm = Autodesk.Viewing.Math;
        return screenToPlane(this.viewer, clientX, clientY, this.planeOrigin,
            new avm.Vector3(1, 0, 0), new avm.Vector3(0, 1, 0), this.step);
    }

    _update() {
        const avm = Autodesk.Viewing.Math;
        const { corner1, corner2, height } = this;
        const minX = Math.min(corner1.x, corner2.x), maxX = Math.max(corner1.x, corner2.x);
        const minY = Math.min(corner1.y, corner2.y), maxY = Math.max(corner1.y, corner2.y);
        const position = new avm.Vector3(minX + 0.5 * (maxX - minX), minY + 0.5 * (maxY - minY), corner1.z + 0.5 * height);
        // Avoid a zero scale, which would make the transform non-invertible
        const nonZero = (v) => Math.abs(v) < 1e-6 ? 1e-6 : v;
        const scale = new avm.Vector3(nonZero(maxX - minX), nonZero(maxY - minY), nonZero(height));
        const transform = new avm.Matrix4().compose(position, new avm.Quaternion(), scale);
        this.overlayModel.getInstances().setTransformWorld(this.instanceId, transform);
        this.viewer.refresh(true);
    }
}

// Finds the world point on a plane (or line) that the viewer projects to the given canvas point
// (in pixels from the top-left corner of the viewer). The plane goes through `origin` and is spanned by
// `axisU` and `axisV` (unit vectors); pass `axisV = null` for a line along `axisU`.
// Uses only viewer.worldToClient, as there's no public ray-casting API: Newton's method on the projection.
// `step` is the world-space distance used to measure how the projection changes (e.g. 1/1000 of the model size).
// Returns null if the point can't be found, e.g. when the plane is seen edge-on.
function screenToPlane(viewer, clientX, clientY, origin, axisU, axisV, step) {
    const avm = Autodesk.Viewing.Math;
    const at = (a, b) => new avm.Vector3(
        origin.x + a * axisU.x + (axisV ? b * axisV.x : 0),
        origin.y + a * axisU.y + (axisV ? b * axisV.y : 0),
        origin.z + a * axisU.z + (axisV ? b * axisV.z : 0));
    const project = (a, b) => viewer.worldToClient(at(a, b));
    let a = 0, b = 0;
    for (let i = 0; i < 20; i++) {
        const s0 = project(a, b);
        const ex = clientX - s0.x, ey = clientY - s0.y;
        if (Math.abs(ex) < 0.5 && Math.abs(ey) < 0.5) return at(a, b);
        const sa = project(a + step, b);
        const jux = (sa.x - s0.x) / step, juy = (sa.y - s0.y) / step;
        if (axisV) {
            const sb = project(a, b + step);
            const jvx = (sb.x - s0.x) / step, jvy = (sb.y - s0.y) / step;
            const det = jux * jvy - jvx * juy;
            if (!isFinite(det) || Math.abs(det) < 1e-12) return null;
            a += (jvy * ex - jvx * ey) / det;
            b += (-juy * ex + jux * ey) / det;
        } else {
            // Least squares along the line's direction on screen
            const lengthSq = jux * jux + juy * juy;
            if (!isFinite(lengthSq) || lengthSq < 1e-12) return null;
            a += (jux * ex + juy * ey) / lengthSq;
            if (i > 0 && Math.abs(jux * ex + juy * ey) / Math.sqrt(lengthSq) < 0.5) return at(a, b);
        }
        if (!isFinite(a) || !isFinite(b)) return null;
    }
    return null;
}

class DrawToolExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.tool = new DrawTool(this);
    }

    load() {
        const avs = Autodesk.Viewing.Scene;
        // Shapes are drawn on top of the model in an overlay render layer
        const layers = this.viewer.getRenderLayers();
        layers.create(DrawToolOverlay, { renderTarget: 'overlay', renderOrder: 1 });
        this.overlayModel = new Autodesk.Viewing.Model();
        layers.addModel(this.overlayModel, DrawToolOverlay);
        // Unit shapes shared by all instances; each instance is scaled and positioned by its transform
        this.geometries = {
            box: avs.GeometryFactory.createBox(1, 1, 1),
            sphere: avs.GeometryFactory.createSphere(0.5, 16, 16)
        };
        this.materials = {
            box: new avs.StandardMaterial({ color: 0x00ff00 }),
            sphere: new avs.StandardMaterial({ color: 0x0000ff })
        };

        // The model bounds, from the object tree's root box. Not from model.getBoundingBox(), which with the legacy
        // 'AutodeskProduction' env throws in the v8 preview after instances of a loaded model were moved (e.g. by the Transformation extension).
        this.modelBounds = null;
        this.viewer.model.getObjectTreeAsync().then(tree => {
            const avm = Autodesk.Viewing.Math;
            const box = new Float32Array(6);
            tree.getNodeBox(tree.getRootId(), box);
            this.modelBounds = new avm.Box3(new avm.Vector3(box[0], box[1], box[2]), new avm.Vector3(box[3], box[4], box[5]));
        }).catch(err => console.error(err));

        this.viewer.toolController.registerTool(this.tool);
        this._createUI();
        console.log('DrawToolExtension loaded.');
        return true;
    }

    unload() {
        this.viewer.toolController.deregisterTool(this.tool);
        this.viewer.getRenderLayers().remove(DrawToolOverlay);
        this.overlayModel = null;
        this.viewer.refresh(true);
        this._removeUI();
        console.log('DrawToolExtension unloaded.');
        return true;
    }

    onToolbarCreated() {
        this._createUI();
    }

    _createUI() {
        const toolbar = this.viewer.toolbar;
        if (toolbar && !this.group) {
            const controller = this.viewer.toolController;
            this.button1 = new Autodesk.Viewing.UI.Button('box-draw-tool-button');
            this.button1.onClick = (ev) => {
                if (controller.isToolActivated(BoxDrawToolName)) {
                    controller.deactivateTool(BoxDrawToolName);
                    this.button1.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);
                } else {
                    controller.deactivateTool(SphereDrawToolName);
                    controller.activateTool(BoxDrawToolName);
                    this.button2.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);
                    this.button1.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
                }
            };
            this.button1.setToolTip('Box Draw Tool');

            this.button2 = new Autodesk.Viewing.UI.Button('sphere-draw-tool-button');
            this.button2.onClick = (ev) => {
                if (controller.isToolActivated(SphereDrawToolName)) {
                    controller.deactivateTool(SphereDrawToolName);
                    this.button2.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);
                } else {
                    controller.deactivateTool(BoxDrawToolName);
                    controller.activateTool(SphereDrawToolName);
                    this.button1.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);
                    this.button2.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
                }
            };
            this.button2.setToolTip('Sphere Draw Tool');

            this.group = new Autodesk.Viewing.UI.ControlGroup('draw-tool-group');
            this.group.addControl(this.button1);
            this.group.addControl(this.button2);
            toolbar.addControl(this.group);
        }
    }

    _removeUI() {
        if (this.group) {
            this.viewer.toolbar.removeControl(this.group);
            this.group = null;
        }
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('DrawToolExtension', DrawToolExtension);