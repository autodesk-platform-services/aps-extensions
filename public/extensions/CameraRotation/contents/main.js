///////////////////////////////////////////////////////////////////////////////
// TurnTable extension illustrating camera rotation around the model
// by Denis Grigor, November 2018
// modified by ahhhchuen Mar 2025
// features enriched:
//  - routine to clear scheduled animation frame when unload
//  - use correct up axis as rotation axis, to suit models from: e.g. Revit, Inventor alike
//  - turntable rotate around pivot instead of 0,0,0 to allow for user navigation during animation
//
///////////////////////////////////////////////////////////////////////////////

class TurnTableExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.viewer = viewer;
        this._group = null;
        this._button = null;
        this.requestId = null;
        this.customize = this.customize.bind(this);
    }

    load() {
        if (this.viewer.toolbar) {
            this.customize();
        }
        return true;
    }

    onToolbarCreated() {
        this.customize();
    }
    
    unload() {
        console.log('TurnTableExtension is now unloaded!');
        
        // Clean the scheduled animation frame request, as a best practice
        if (this.requestId) {
            cancelAnimationFrame(this.requestId);
            this.requestId = null;
        }
        
        // Clean our UI elements if we added any
        if (this._group) {
            this._group.removeControl(this._button);
            if (this._group.getNumberOfControls() === 0) {
                this.viewer.toolbar.removeControl(this._group);
            }
        }
        return true;
    }

    customize() {
        if (this._group) return;

        let viewer = this.viewer;
        const avm = Autodesk.Viewing.Math;

        this._button = new Autodesk.Viewing.UI.Button('turnTableButton');
        this._button.addClass('toolbarCameraRotation');
        this._button.setToolTip('Start/Stop Camera rotation');

        // _group
        this._group = new Autodesk.Viewing.UI.ControlGroup('CameraRotateToolbar');
        this._group.addControl(this._button);
        this.viewer.toolbar.addControl(this._group);

        let started = false;

        let rotateCamera = () => {
            if (started) {
                this.requestId = requestAnimationFrame(rotateCamera);
            }

            // Camera properties are read-only in v8, so work on copies and apply them with setView
            const nav = viewer.navigation;
            const pos = nav.getPosition().clone();
            const piv = nav.getPivotPoint().clone();
            const tar = nav.getTarget().clone();
            const up = viewer.getCamera().up.clone();
            // rotate around the world axis closest to the camera's up vector, to suit Z-up (e.g. Revit) and Y-up (e.g. Inventor) models
            const axis = new avm.Vector3();
            const [ax, ay, az] = [Math.abs(up.x), Math.abs(up.y), Math.abs(up.z)];
            if (az >= ax && az >= ay) {
                axis.set(0, 0, 1);
            } else if (ay >= ax) {
                axis.set(0, 1, 0);
            } else {
                axis.set(1, 0, 0);
            }
            const speed = 10.0 * Math.PI / 180;
            const matrix = new avm.Matrix4().makeRotationAxis(axis, speed * 0.1);

            // Rotate the camera position relative to the pivot
            pos.sub(piv); // Move the camera position relative to the pivot to (0,0,0)
            pos.applyMatrix4(matrix); // Apply the rotation
            pos.add(piv); // Move the camera position back to its original reference system of pivot()
            tar.sub(piv); // Move the target position relative to the pivot to (0,0,0)
            tar.applyMatrix4(matrix); // Apply the rotation
            tar.add(piv); // Move the target position back to its original reference system of pivot()     
            up.applyMatrix4(matrix);
            nav.setView(pos, tar, up);
        };

        this._button.onClick = function (e) {
            started = !started;
            if (started) rotateCamera()
        };

    }

}

Autodesk.Viewing.theExtensionManager.registerExtension('CameraRotation',
    TurnTableExtension);
