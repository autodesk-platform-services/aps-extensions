///////////////////////////////////////////////////////////////////
// Bounding Box viewer extension
// Based on https://aps.autodesk.com/blog/adding-custom-lines-forge-viewer-scene
///////////////////////////////////////////////////////////////////
AutodeskNamespace("Autodesk.ADN.Viewing.Extension");

Autodesk.ADN.Viewing.Extension.BoundingBox =  function (viewer, options) {

    Autodesk.Viewing.Extension.call(this, viewer, options);

    let _self = this;

    _self.load = function () {

        viewer.addEventListener(
            Autodesk.Viewing.SELECTION_CHANGED_EVENT,
            onItemSelected);

        _self.linesMaterial = new THREE.LineBasicMaterial({
            color: 0xffff00,
            linewidth: 2
        });

        viewer.impl.createOverlayScene(
            'boundingBox',
            _self.linesMaterial);

        console.log('Autodesk.ADN.Viewing.Extension.BoundingBox loaded');

        return true;
    }

    _self.unload = function () {

        viewer.removeEventListener(
            Autodesk.Viewing.SELECTION_CHANGED_EVENT,
            onItemSelected);
       
        viewer.impl.removeOverlayScene('boundingBox');

        viewer.impl.sceneUpdated(true);

        console.log('Autodesk.ADN.Viewing.Extension.BoundingBox unloaded');

        return true;
    }

    function onItemSelected (event) {

        const bBox = getModifiedWorldBoundingBox(
          event.fragIdsArray,
          viewer.model.getFragmentList()
        );

        console.log(bBox);
        drawBox(bBox.min, bBox.max);
    }

    //returns bounding box as it appears in the viewer
    // (transformations could be applied)
    function getModifiedWorldBoundingBox(fragIds, fragList) {

        const fragbBox = new THREE.Box3();
        const nodebBox = new THREE.Box3();

        fragIds.forEach(function(fragId) {
            fragList.getWorldBounds(fragId, fragbBox);
            nodebBox.union(fragbBox);
        });

        return nodebBox;
    }

    // Returns bounding box as loaded in the file
    // (no explosion nor transformation)
    function getOriginalWorldBoundingBox(fragIds, fragList) {

        const fragBoundingBox = new THREE.Box3();
        const nodeBoundingBox = new THREE.Box3();

        const fragmentBoxes = fragList.boxes;

        fragIds.forEach(function(fragId) {

            const boffset = fragId * 6;

            fragBoundingBox.min.x = fragmentBoxes[boffset];
            fragBoundingBox.min.y = fragmentBoxes[boffset+1];
            fragBoundingBox.min.z = fragmentBoxes[boffset+2];
            fragBoundingBox.max.x = fragmentBoxes[boffset+3];
            fragBoundingBox.max.y = fragmentBoxes[boffset+4];
            fragBoundingBox.max.z = fragmentBoxes[boffset+5];

            nodeBoundingBox.union(fragBoundingBox);
        });

        return nodeBoundingBox;
    }

    function drawLines(coordsArray, material) {

        for (let i = 0; i < coordsArray.length; i+=2) {

            const start = coordsArray[i];
            const end = coordsArray[i+1];

            const geometry = new THREE.Geometry();

            geometry.vertices.push(new THREE.Vector3(
                start.x, start.y, start.z));

            geometry.vertices.push(new THREE.Vector3(
                end.x, end.y, end.z));

            geometry.computeLineDistances();

            const lines = new THREE.Line(geometry, material, THREE.LinePieces);

            viewer.impl.addOverlay('boundingBox', lines);
        }
    }

    function drawBox(min, max) {
        
        drawLines([

            {x: min.x, y: min.y, z: min.z},
            {x: max.x, y: min.y, z: min.z},

            {x: max.x, y: min.y, z: min.z},
            {x: max.x, y: min.y, z: max.z},

            {x: max.x, y: min.y, z: max.z},
            {x: min.x, y: min.y, z: max.z},

            {x: min.x, y: min.y, z: max.z},
            {x: min.x, y: min.y, z: min.z},

            {x: min.x, y: max.y, z: max.z},
            {x: max.x, y: max.y, z: max.z},

            {x: max.x, y: max.y, z: max.z},
            {x: max.x, y: max.y, z: min.z},

            {x: max.x, y: max.y, z: min.z},
            {x: min.x, y: max.y, z: min.z},

            {x: min.x, y: max.y, z: min.z},
            {x: min.x, y: max.y, z: max.z},

            {x: min.x, y: min.y, z: min.z},
            {x: min.x, y: max.y, z: min.z},

            {x: max.x, y: min.y, z: min.z},
            {x: max.x, y: max.y, z: min.z},

            {x: max.x, y: min.y, z: max.z},
            {x: max.x, y: max.y, z: max.z},

            {x: min.x, y: min.y, z: max.z},
            {x: min.x, y: max.y, z: max.z}],

            _self.linesMaterial);

        viewer.impl.sceneUpdated(true);
    }
};

Autodesk.ADN.Viewing.Extension.BoundingBox.prototype =
    Object.create(Autodesk.Viewing.Extension.prototype);

Autodesk.ADN.Viewing.Extension.BoundingBox.prototype.constructor =
    Autodesk.ADN.Viewing.Extension.BoundingBox;

Autodesk.Viewing.theExtensionManager.registerExtension(
    'BoundingBoxExtension',
    Autodesk.ADN.Viewing.Extension.BoundingBox);

