/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
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

(function () {
    const Utility = {
        /**
         * Rest an object
         * @param {Object} obj An object to be reset.
         * ref: https://stackoverflow.com/a/24090180
         */
        resetObject: function (obj) {
            for (let key in Object.getOwnPropertyNames(obj)) {
                if (!obj.hasOwnProperty(key)) continue;

                let val = obj[key];
                switch (typeof val) {
                    case 'string':
                        obj[key] = ''; break;
                    case 'number':
                        obj[key] = 0; break;
                    case 'boolean':
                        obj[key] = false; break;
                    case 'object':
                        if (val === null) break;
                        if (val instanceof Array) {
                            while (obj[key].length > 0) {
                                obj[key].pop();
                            }
                            break;
                        }
                        val = {};
                        //Or recursively clear the sub-object
                        //resetObject(val);
                        break;
                }
            }
        }
    };

    /**
     * A Forge Viewer extension for loading and rendering Revit Grids by AEC Model Data
     * @class
     */
    class RoomLocatorExtension extends Autodesk.Viewing.Extension {
        constructor(viewer, options) {
            super(viewer, options);

            this.roomCategoryName = options.roomCategoryName || 'Revit Rooms';//'Revit Habitaciones'
            this.onContextMenu = this.onContextMenu.bind(this);
        }

        onContextMenu(menu, status) {
            if (status.hasSelected) {
                menu.push({
                    title: 'Find room',
                    target: async () => {
                        let selSet = this.viewer.getSelection();
                        this.viewer.clearSelection();

                        const roomDbIds = await this.locateElementByRoom(selSet[0]);
                        if (!roomDbIds || roomDbIds.length <= 0) return;

                        this.viewer.select(roomDbIds);
                    }
                });
            }
        }

        async getPropertiesAsync(dbId, model) {
            return new Promise((resolve, reject) => {
                model.getProperties2(
                    dbId,
                    (result) => resolve(result),
                    (error) => reject(error)
                );
            });
        }

        async getElementsByCategoryAsync(category) {
            return new Promise((resolve, reject) => {
                this.viewer.search(
                    category,
                    (dbIds) => resolve(dbIds),
                    (error) => reject(error),
                    ['Category'],
                    { searchHidden: true }
                );
            });
        }

        async getRoomDbIds() {
            try {
                const roomDbIds = await this.getElementsByCategoryAsync(this.roomCategoryName);
                if (!roomDbIds || roomDbIds.length <= 0) {
                    throw new Error('No Rooms found in current model');
                }

                return roomDbIds;
            } catch (ex) {
                console.warn(`[RoomLocatorExtension]: ${ex}`);
                throw new Error('No room found');
            }
        }

        getBoundingBox(dbId, model) {
            const it = model.getInstanceTree();
            const fragList = model.getFragmentList();
            let bounds = new THREE.Box3();

            it.enumNodeFragments(dbId, (fragId) => {
                let box = new THREE.Box3();
                fragList.getWorldBounds(fragId, box);
                bounds.union(box);
            }, true);

            return bounds;
        }

        getLeafFragIds(model, leafId) {
            const instanceTree = model.getData().instanceTree;
            const fragIds = [];

            instanceTree.enumNodeFragments(leafId, function (fragId) {
                fragIds.push(fragId);
            });

            return fragIds;
        }

        getComponentGeometryInfo(dbId, model) {
            const viewer = this.viewer;
            const viewerImpl = viewer.impl;
            const fragIds = this.getLeafFragIds(model, dbId);
            let matrixWorld = null;

            const meshes = fragIds.map((fragId) => {
                const renderProxy = viewerImpl.getRenderProxy(model, fragId);

                const geometry = renderProxy.geometry;
                const attributes = geometry.attributes;
                const positions = geometry.vb ? geometry.vb : attributes.position.array;

                const indices = attributes.index.array || geometry.ib;
                const stride = geometry.vb ? geometry.vbstride : 3;
                const offsets = geometry.offsets;

                matrixWorld = matrixWorld || renderProxy.matrixWorld.elements;

                return {
                    positions,
                    indices,
                    offsets,
                    stride
                };
            });

            return {
                matrixWorld,
                meshes
            };
        }

        getComponentGeometry(data, vertexArray) {
            const offsets = [
                {
                    count: data.indices.length,
                    index: 0,
                    start: 0
                }
            ];

            for (let oi = 0, ol = offsets.length; oi < ol; ++oi) {
                let start = offsets[oi].start;
                let count = offsets[oi].count;
                let index = offsets[oi].index;

                for (let i = start, il = start + count; i < il; i += 3) {
                    const a = index + data.indices[i];
                    const b = index + data.indices[i + 1];
                    const c = index + data.indices[i + 2];

                    const vA = new THREE.Vector3();
                    const vB = new THREE.Vector3();
                    const vC = new THREE.Vector3();

                    vA.fromArray(data.positions, a * data.stride);
                    vB.fromArray(data.positions, b * data.stride);
                    vC.fromArray(data.positions, c * data.stride);

                    vertexArray.push(vA);
                    vertexArray.push(vB);
                    vertexArray.push(vC);
                }
            }
        }

        buildComponentMesh(data) {
            const vertexArray = [];

            for (let idx = 0; idx < data.nbMeshes; ++idx) {
                const meshData = {
                    positions: data['positions' + idx],
                    indices: data['indices' + idx],
                    stride: data['stride' + idx]
                }

                this.getComponentGeometry(meshData, vertexArray);
            }

            const geometry = new THREE.Geometry();

            for (let i = 0; i < vertexArray.length; i += 3) {
                geometry.vertices.push(vertexArray[i]);
                geometry.vertices.push(vertexArray[i + 1]);
                geometry.vertices.push(vertexArray[i + 2]);

                const face = new THREE.Face3(i, i + 1, i + 2);
                geometry.faces.push(face);
            }

            const matrixWorld = new THREE.Matrix4();
            matrixWorld.fromArray(data.matrixWorld);

            const mesh = new THREE.Mesh(geometry);
            mesh.applyMatrix(matrixWorld);
            mesh.boundingBox = data.boundingBox;
            mesh.bsp = new ThreeBSP(mesh)
            mesh.dbId = data.dbId;

            return mesh;
        }

        buildCsgMesh(dbId, model) {
            const geometry = this.getComponentGeometryInfo(dbId, model);
            const data = {
                boundingBox: this.getBoundingBox(dbId, model),
                matrixWorld: geometry.matrixWorld,
                nbMeshes: geometry.meshes.length,
                dbId
            };

            geometry.meshes.forEach((mesh, idx) => {
                data['positions' + idx] = mesh.positions;
                data['indices' + idx] = mesh.indices;
                data['stride' + idx] = mesh.stride;
            });

            return this.buildComponentMesh(data);
        }

        async buildBBoxes() {
            try {
                const model = this.viewer.model;
                const roomBBoxes = {};
                const roomDbIds = await this.getRoomDbIds();
                if (!roomDbIds || roomDbIds.length <= 0)
                    throw new Error('No room found in the current model. For Revit model, rooms/spaces exist in the master views only.');

                for (let i = 0; i < roomDbIds.length; i++) {
                    let dbId = roomDbIds[i];
                    let bbox = await this.getBoundingBox(dbId, model);
                    roomBBoxes[dbId] = bbox;
                }
                this.cachedBBoxes['rooms'] = roomBBoxes;
            } catch (ex) {
                console.warn(`[RoomLocatorExtension]: ${ex}`);
                throw new Error('Cannot build bounding boxes from rooms');
            }
        }

        async locateElementByRoom(dbId) {
            let bbox = await this.getBoundingBox(dbId, this.viewer.model);
            const roomDbIds = Object.keys(this.cachedBBoxes['rooms']);
            const roomBoxes = Object.values(this.cachedBBoxes['rooms']);

            // Coarse Phase Collision
            const coarseResult = [];
            for (let i = 0; i < roomDbIds.length; i++) {
                let roomDbId = roomDbIds[i];
                let roomBox = roomBoxes[i];

                if (roomBox.containsBox(bbox)) {
                    coarseResult.push(parseInt(roomDbId));
                } else {
                    if (roomBox.containsPoint(bbox.min) || roomBox.containsPoint(bbox.max) || roomBox.containsPoint(bbox.center())) {
                        coarseResult.push(parseInt(roomDbId));
                    }
                }
            }

            // Fine Phase Collision
            const fineResult = [];
            let elementCsgMesh = this.buildCsgMesh(dbId, this.viewer.model);

            for (let i = 0; i < coarseResult.length; i++) {
                let roomDbId = coarseResult[i];
                let roomCsgMesh = this.buildCsgMesh(roomDbId, this.viewer.model);

                let result = elementCsgMesh.bsp.intersect(roomCsgMesh.bsp);
                if (result.tree.polygons.length <= 0) {
                    result = roomCsgMesh.bsp.intersect(elementCsgMesh.bsp);

                    // ====== Start ====== Uncomment here to draw intersected mesh ====== 
                    // if (!this.viewer.overlays.hasScene('csg'))
                    //     this.viewer.overlays.addScene('csg');
                    // else
                    //     this.viewer.overlays.clearScene('csg');

                    // let mat = new THREE.MeshBasicMaterial({ color: 'red' })
                    // let mesh = result.toMesh(mat);
                    // this.viewer.overlays.addMesh(mesh, 'csg')
                    // ====== End ====== Uncomment here to draw intersected mesh ====== 

                    if (result.tree.polygons.length <= 0) continue;
                }

                fineResult.push(roomDbId);
            }

            return fineResult;
        }

        async load() {
            await Autodesk.Viewing.Private.theResourceLoader.loadScript(
                'https://cdn.jsdelivr.net/gh/Wilt/ThreeCSG@develop/ThreeCSG.js',
                'ThreeBSP'
            );

            if (!window.ThreeBSP)
                throw new Error('Cannot load ThreeCSG.js, please download a copy from https://github.com/Wilt/ThreeCSG/blob/develop/ThreeCSG.js')

            await this.viewer.waitForLoadDone();

            this.cachedBBoxes = {};
            await this.buildBBoxes();

            this.viewer.registerContextMenuCallback(
                'RoomLocatorExtension',
                this.onContextMenu
            );

            return true;
        }

        unload() {
            Utility.resetObject(this.cachedBBoxes);
            this.viewer.unregisterContextMenuCallback(
                'RoomLocatorExtension',
                this.onContextMenu
            );

            return true;
        }
    }

    Autodesk.Viewing.theExtensionManager.registerExtension('RoomLocatorExtension', RoomLocatorExtension);
})();