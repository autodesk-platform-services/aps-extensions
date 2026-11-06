///////////////////////////////////////////////////////////////////
// Transform Tool viewer extension
// Originally by Philippe Leefsma, August 2015.
// Rewritten for the Scene API: drag a part to move it on the horizontal plane,
// or hold Shift while dragging to move it up and down.
///////////////////////////////////////////////////////////////////
const TransformToolName = 'Dotty.Viewing.Tool.TransformTool';

class TransformTool extends Autodesk.Viewing.ToolInterface {
    constructor() {
        super();
        // Make the tool controller call our class methods instead of the ones defined on the instance by ToolInterface
        delete this.getNames;
        delete this.getName;
        delete this.getPriority;
        delete this.activate;
        delete this.deactivate;
        delete this.handleButtonDown;
        delete this.handleButtonUp;
        delete this.handleMouseMove;

        this.names = [TransformToolName];
        this.viewer = null;
        this.drag = null;
        // Per model: the Node3D group created for each moved dbId, and the group each wrapped instance belongs to
        this.groups = new Map();
    }

    getNames() {
        return this.names;
    }

    getName() {
        return this.names[0];
    }

    getPriority() {
        return 1; // Higher than the default navigation tools, so that dragging a part doesn't orbit the camera
    }

    activate(name, viewer) {
        this.viewer = viewer;
        this.drag = null;
        this._showHint();
    }

    deactivate(name) {
        this._endDrag();
        this._hideHint();
        this.viewer = null;
    }

    // A short note over the viewer explaining how to move elements, shown while the tool is active
    _showHint() {
        if (this.hint) return;
        const hint = document.createElement('div');
        hint.className = 'transform-tool-hint';
        hint.setAttribute('role', 'status');
        const text = document.createElement('span');
        text.innerHTML = '<strong>Drag</strong> an element to move it horizontally. '
            + 'Hold <kbd>Shift</kbd> while dragging to move it up or down.';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'transform-tool-hint-close';
        close.title = 'Hide this tip';
        close.setAttribute('aria-label', 'Hide this tip');
        close.textContent = '×';
        close.addEventListener('click', () => this._hideHint());
        hint.append(text, close);
        this.viewer.container.appendChild(hint);
        this.hint = hint;
    }

    _hideHint() {
        if (this.hint) {
            this.hint.remove();
            this.hint = null;
        }
    }

    handleButtonDown(event, button) {
        if (button !== 0) return false;
        const { x, y } = this._canvasCoords(event);
        const hit = this.viewer.hitTest(x, y, true);
        if (!hit || !hit.model || hit.dbId === undefined) return false; // let navigation handle clicks on empty space

        this._startDrag(hit, event.shiftKey).catch(err => console.error(err));
        return true;
    }

    handleMouseMove(event) {
        if (!this.drag || !this.drag.nodes) return !!this.drag;
        const { x, y } = this._canvasCoords(event);
        const { start, axisU, axisV, step, nodes } = this.drag;
        // Horizontal drag: the point on the horizontal plane through the picked point; vertical drag: on the up axis
        const point = screenToPlane(this.viewer, x, y, start, axisU, axisV, step);
        if (!point) return true;

        const delta = point.sub(start);
        for (const { group, initialPosition } of nodes) {
            group.position.copy(initialPosition).add(delta);
            group.updateTransformWorld(true);
        }
        this.viewer.refresh(true);
        return true;
    }

    handleButtonUp(event, button) {
        if (button !== 0 || !this.drag) return false;
        this._endDrag();
        return true;
    }

    _endDrag() {
        const drag = this.drag;
        this.drag = null;
        // Let the viewer optimize the model for rendering again
        if (drag && drag.instances && drag.previousUsageHint !== undefined) {
            drag.instances.setUsageHint(drag.previousUsageHint);
        }
    }

    async _startDrag(hit, vertical) {
        const avm = Autodesk.Viewing.Math;
        const { model, dbId } = hit;
        const drag = { vertical };
        this.drag = drag;
        this.viewer.select([dbId], model);

        // Drag on the horizontal plane through the hit point, or along the up axis when Shift is held
        drag.start = new avm.Vector3(hit.point.x, hit.point.y, hit.point.z);
        const [up, u, v] = TransformTool.getAxes(model);
        drag.axisU = vertical ? up : u;
        drag.axisV = vertical ? null : v;
        // Not based on model.getBoundingBox(): with the legacy 'AutodeskProduction' env, the v8 preview throws there after instances of a loaded model were moved
        drag.step = Math.max(this.viewer.navigation.getPosition().distanceTo(drag.start), 1) * 1e-3;

        const tree = await model.getObjectTreeAsync();
        if (this.drag !== drag) return; // the button was released in the meantime
        const avs = Autodesk.Viewing.Scene;
        const instances = model.getInstances();
        const root = instances.getSceneGraph(true);
        if (!this.groups.has(model)) this.groups.set(model, { byDbId: new Map(), byInstanceId: new Map() });
        const { byDbId, byInstanceId } = this.groups.get(model);

        // Wrap the dbId's instances into a group (once), and move that group. Instances that were already
        // wrapped when moving another dbId (e.g. a parent) stay in their group, which then moves too.
        const groups = new Set();
        tree.enumNodeInstances(dbId, (instanceId) => {
            if (!instances.getGeometry(instanceId)) return; // not loaded (yet)
            let group = byInstanceId.get(instanceId);
            if (!group) {
                group = byDbId.get(dbId);
                if (!group) {
                    group = new avs.Node3D();
                    root.add(group);
                    byDbId.set(dbId, group);
                }
                avs.InstanceNode3D.fromInstance(instanceId, group);
                byInstanceId.set(instanceId, group);
            }
            groups.add(group);
        }, true);
        if (groups.size === 0) console.warn(`[TransformationExtension] No loaded geometry found for dbId ${dbId}`);

        // Loaded models are optimized for rendering (UsageHint.Static), and moved instances only show up
        // after the model is optimized again. Switch to Dynamic while dragging; _endDrag() restores it.
        drag.instances = instances;
        drag.previousUsageHint = instances.getUsageHint();
        instances.setUsageHint(avs.UsageHint.Dynamic);

        drag.nodes = [...groups].map(group => ({ group, initialPosition: group.position.clone() }));
    }

    _canvasCoords(event) {
        const rect = this.viewer.container.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    // [up, u, v]: the model's up axis (Z for Revit-like models, Y for Inventor-like models; Z if unknown),
    // and the two other world axes, which span the horizontal plane.
    static getAxes(model) {
        const avm = Autodesk.Viewing.Math;
        const axes = [new avm.Vector3(1, 0, 0), new avm.Vector3(0, 1, 0), new avm.Vector3(0, 0, 1)];
        let index = 2;
        const up = typeof model.getUpVector === 'function' ? model.getUpVector() : null;
        if (up && up.length === 3) {
            const magnitudes = up.map(Math.abs);
            index = magnitudes.indexOf(Math.max(...magnitudes));
        }
        const others = axes.filter((_, i) => i !== index);
        return [axes[index], others[0], others[1]];
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

class TransformationExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.tool = new TransformTool();
        this._group = null;
        this._button = null;
    }

    load() {
        this.viewer.toolController.registerTool(this.tool);
        console.log('TransformationExtension loaded');
        return true;
    }

    unload() {
        const controller = this.viewer.toolController;
        if (controller.isToolActivated(TransformToolName)) controller.deactivateTool(TransformToolName);
        controller.deregisterTool(this.tool);
        // Clean our UI elements if we added any
        if (this._group) {
            this._group.removeControl(this._button);
            if (this._group.getNumberOfControls() === 0) {
                this.viewer.toolbar.removeControl(this._group);
            }
        }
        console.log('TransformationExtension unloaded');
        return true;
    }

    onToolbarCreated() {
        // Create a new toolbar group if it doesn't exist
        this._group = this.viewer.toolbar.getControl('transformExtensionsToolbar');
        if (!this._group) {
            this._group = new Autodesk.Viewing.UI.ControlGroup('transformExtensionsToolbar');
            this.viewer.toolbar.addControl(this._group);
        }

        // Add a new button to the toolbar group
        this._button = new Autodesk.Viewing.UI.Button('transformExtensionButton');
        this._button.icon.classList.add('fas', 'fa-arrows-alt');
        this._button.onClick = () => {
            const controller = this.viewer.toolController;
            if (this._button.getState() !== Autodesk.Viewing.UI.Button.State.ACTIVE) {
                controller.activateTool(TransformToolName);
                this._button.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
            } else {
                controller.deactivateTool(TransformToolName);
                this._button.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);
            }
        };
        this._button.setToolTip('Transform Object (drag a part; hold Shift to move it vertically)');
        this._group.addControl(this._button);
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('TransformationExtension', TransformationExtension);
