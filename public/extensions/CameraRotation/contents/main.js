/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by APS Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

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
        if (this.viewer.model.getInstanceTree()) {
            this.customize();
        } else {
            this.viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, this.customize());
        }        
        return true;
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

        let viewer = this.viewer;

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

            const nav = viewer.navigation;
            const pos = nav.getPosition();
            const piv = nav.getPivotPoint();
            const tar = nav.getTarget();
            const up = nav.getCameraUpVector();
            // determine the 'up' axis from the loaded model to apply matrix transformation
            const upAxis = nav.getWorldUpVector();
            const axis = new THREE.Vector3();
            if (upAxis.z == 1) {
                axis.set(0, 0, 1);
            } else if (upAxis.y == 1) {
                axis.set(0, 1, 0);
            } else {
                axis.set(1, 0, 0);                
            };   
            const speed = 10.0 * Math.PI / 180;
            const matrix = new THREE.Matrix4().makeRotationAxis(axis, speed * 0.1);

            // Rotate the camera position relative to the pivot
            pos.sub(piv); // Move the camera position relative to the pivot to (0,0,0)
            pos.applyMatrix4(matrix); // Apply the rotation
            pos.add(piv); // Move the camera position back to its original reference system of pivot()
            tar.sub(piv); // Move the target position relative to the pivot to (0,0,0)
            tar.applyMatrix4(matrix); // Apply the rotation
            tar.add(piv); // Move the target position back to its original reference system of pivot()     
            up.applyMatrix4(matrix);
            nav.setView(pos, tar);
            nav.setCameraUpVector(up);
            var viewState = viewer.getState();
            // viewer.restoreState(viewState);

        };

        this._button.onClick = function (e) {
            started = !started;
            if (started) rotateCamera()
        };

    }

}

Autodesk.Viewing.theExtensionManager.registerExtension('CameraRotation',
    TurnTableExtension);
