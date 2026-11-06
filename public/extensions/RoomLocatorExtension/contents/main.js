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

        async getElementsByCategoryAsync(category) {
            return this.viewer.model.searchAsync(category, ['Category'], { searchHidden: true });
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

        // Calls the callback for each loaded instance (with geometry) of a dbId and its children.
        async enumLoadedInstances(dbId, model, callback) {
            const tree = await model.getObjectTreeAsync();
            const instances = model.getInstances();
            tree.enumNodeInstances(dbId, (instanceId) => {
                if (instances.getGeometry(instanceId)) callback(instanceId, instances);
            }, true);
        }

        async getBoundingBox(dbId, model) {
            const avm = Autodesk.Viewing.Math;
            const bounds = new avm.Box3();
            const box = new avm.Box3();
            await this.enumLoadedInstances(dbId, model, (instanceId, instances) => {
                instances.getWorldBounds(instanceId, box);
                bounds.union(box);
            });
            return bounds;
        }

        // Collects the world-space vertices and triangles of a dbId's geometry.
        // Returns { vertices: Float64Array (x, y, z, ...), triangles: Float64Array (9 values per triangle) }.
        async getWorldMesh(dbId, model) {
            const avm = Autodesk.Viewing.Math;
            const vertices = [];
            const triangles = [];
            const matrix = new avm.Matrix4();
            const point = new avm.Vector3();
            await this.enumLoadedInstances(dbId, model, (instanceId, instances) => {
                const geometry = instances.getGeometry(instanceId);
                instances.getTransformWorld(instanceId, matrix);
                const vertexCount = geometry.getVertexCount();
                const world = new Float64Array(vertexCount * 3);
                for (let i = 0; i < vertexCount; i++) {
                    if (!geometry.getPosition(i, point)) continue;
                    point.applyMatrix4(matrix);
                    world[i * 3] = point.x;
                    world[i * 3 + 1] = point.y;
                    world[i * 3 + 2] = point.z;
                }
                for (let i = 0; i < world.length; i++) vertices.push(world[i]);

                // Non-indexed geometry lists the triangle vertices in order
                const indices = geometry.getIndices();
                const indexCount = indices ? indices.length : vertexCount;
                for (let i = 0; i + 2 < indexCount; i += 3) {
                    for (let k = 0; k < 3; k++) {
                        const v = indices ? indices[i + k] : i + k;
                        triangles.push(world[v * 3], world[v * 3 + 1], world[v * 3 + 2]);
                    }
                }
            });
            return { vertices: new Float64Array(vertices), triangles: new Float64Array(triangles) };
        }

        // Counts how many triangles a ray crosses (Moller-Trumbore); an odd count means the origin is inside a closed mesh.
        static isPointInsideMesh(px, py, pz, triangles) {
            // A direction that's unlikely to be parallel to (or pass exactly through edges of) axis-aligned geometry
            const dx = 0.5773, dy = 0.5774, dz = 0.5776;
            const EPS = 1e-9;
            let crossings = 0;
            for (let i = 0; i < triangles.length; i += 9) {
                const ax = triangles[i], ay = triangles[i + 1], az = triangles[i + 2];
                const e1x = triangles[i + 3] - ax, e1y = triangles[i + 4] - ay, e1z = triangles[i + 5] - az;
                const e2x = triangles[i + 6] - ax, e2y = triangles[i + 7] - ay, e2z = triangles[i + 8] - az;
                const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
                const det = e1x * hx + e1y * hy + e1z * hz;
                if (Math.abs(det) < EPS) continue;
                const inv = 1 / det;
                const sx = px - ax, sy = py - ay, sz = pz - az;
                const u = inv * (sx * hx + sy * hy + sz * hz);
                if (u < 0 || u > 1) continue;
                const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
                const v = inv * (dx * qx + dy * qy + dz * qz);
                if (v < 0 || u + v > 1) continue;
                const t = inv * (e2x * qx + e2y * qy + e2z * qz);
                if (t > EPS) crossings++;
            }
            return (crossings % 2) === 1;
        }

        // True if any of the points (x, y, z, ...) inside the box is inside the mesh. Tests at most maxPoints points.
        static anyPointInsideMesh(points, box, triangles, maxPoints = 500) {
            const count = points.length / 3;
            const step = Math.max(1, Math.ceil(count / maxPoints));
            for (let i = 0; i < count; i += step) {
                const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
                if (x < box.min.x || x > box.max.x || y < box.min.y || y > box.max.y || z < box.min.z || z > box.max.z) continue;
                if (RoomLocatorExtension.isPointInsideMesh(x, y, z, triangles)) return true;
            }
            return false;
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
            const model = this.viewer.model;
            let bbox = await this.getBoundingBox(dbId, model);
            if (bbox.min.x > bbox.max.x) return []; // no geometry loaded for this element
            const center = bbox.getCenter(new Autodesk.Viewing.Math.Vector3());
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
                    if (roomBox.containsPoint(bbox.min) || roomBox.containsPoint(bbox.max) || roomBox.containsPoint(center)) {
                        coarseResult.push(parseInt(roomDbId));
                    }
                }
            }

            // Fine Phase Collision: the element is in a room if one of its vertices (or its center) is inside the room's mesh,
            // or one of the room's vertices is inside the element's mesh (for elements larger than the room).
            const fineResult = [];
            const element = await this.getWorldMesh(dbId, model);
            const elementPoints = new Float64Array([center.x, center.y, center.z, ...element.vertices]);

            for (let i = 0; i < coarseResult.length; i++) {
                let roomDbId = coarseResult[i];
                const room = await this.getWorldMesh(roomDbId, model);
                const roomBox = this.cachedBBoxes['rooms'][roomDbId];

                if (RoomLocatorExtension.anyPointInsideMesh(elementPoints, roomBox, room.triangles) ||
                    RoomLocatorExtension.anyPointInsideMesh(room.vertices, bbox, element.triangles)) {
                    fineResult.push(roomDbId);
                }
            }

            return fineResult;
        }

        async load() {
            // Models stream in: wait until the geometry is loaded before reading room bounds
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