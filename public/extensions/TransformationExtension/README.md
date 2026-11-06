# Transform

[Demo](https://aps-extensions.autodesk.io/?extension=TransformationExtension)

Allows moving elements on the model.

![thumbnail](extension.gif)

## Usage

Enable the extension and switch on the tool in the toolbar. Then drag a model element to move it on the horizontal plane, or hold Shift while dragging to move it up and down.

## Setup

Include the CSS & JS file on your page. This CDN is compatible with the lastest Viewer version (v7).

```xml
<link rel="stylesheet" href="http://cdn.jsdelivr.net/gh/autodesk-forge/forge-extensions/public/extensions/transform/contents/main.css">
<script src="http://cdn.jsdelivr.net/gh/autodesk-forge/forge-extensions/public/extensions/transform/contents/main.js"></script>
```

After Viewer is ready, preferable inside `onDocumentLoadSuccess`, load the extension

```javascript
viewer.loadExtension("TransformationExtension")
```

## How it works

The tool uses `viewer.hitTest` to find the element under the cursor. It then wraps the element's instances in `Autodesk.Viewing.Scene.InstanceNode3D` nodes of the model's scene graph (Scene API) and moves them as the mouse moves along a drag plane through the picked point. Only documented APIs are used, so the extension works with both Viewer v7 (with the Scene API enabled) and Viewer v8.

The previous version used a port of the three.js transform controls gizmo. That gizmo depended on three.js and viewer internals that are no longer available in Viewer v8.
