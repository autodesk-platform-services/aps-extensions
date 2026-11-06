# Contributing

## Adding a new extension

1) Copy the [_BasicSkeleton](https://github.com/autodesk-platform-services/aps-extensions/tree/main/public/extensions/_BasicSkeleton) folder in public/extensions and rename it to the name of the extension (the folder name is the name the extension is registered with in the viewer). Folders starting with `_` are not shown in the list.
<pre>
ExtensionName[Folder]
        |
        |->contents
        |     |->main.js
        |     |->main.css
        |->config.json (optional)
</pre>

2) Fill in `config.json`. Extensions are discovered from the folders on every request, so just refresh the page; no server restart is needed. Everything is optional and has a default:
<pre>
{
    "displayName": "display name in the list (default: folder name)",
    "description": "description for the extension",
    "options": {passed on to the extension constructor; when set, an Options button lets users edit them as JSON},
    "loadOnStartup": true (default: false),
    "link": "https link for a working explanation (default: the extension's README.md on GitHub, if there is one)",
    "disabled": "reason the extension can't be used for now" (default: not disabled),
    "dependencies": [
        "https://cdn.example.com/library.min.js",
        "libraries/helper.js",
        {"url": "https://cdn.example.com/styles", "type": "css"}
    ]
}
</pre>
- `dependencies`: scripts and stylesheets the extension needs, in load order. Full URLs are loaded as they are, other paths are relative to the extension's `contents/` folder. The type (`js` or `css`) comes from the file name; use the `{"url", "type"}` form only when the URL doesn't end in `.js` or `.css`.
- The extension's own `.js` and `.css` files directly inside `contents/` are always loaded after the dependencies, alphabetical with `main.*` last. To load one of them earlier, list it in `dependencies` (it won't be loaded twice).
- `disabled`: the extension is shown in the list, but can't be switched on. The reason is shown as a tooltip.
- A preview image named `extension.gif`, `.jpg`, `.jpeg` or `.png` in the extension folder is shown in the info popup.

Everything is loaded the first time the extension is switched on. A folder with a broken `config.json` is skipped with a warning in the server log.

Example: [IconMarkupExtension config.json](https://github.com/autodesk-platform-services/aps-extensions/blob/main/public/extensions/IconMarkupExtension/config.json)

> Note: The app uses Viewer v8. Use only documented APIs: no `THREE.*`, `viewer.impl`, `viewer.overlays`, or `NOP_VIEWER`. Get the object tree with `await model.getObjectTreeAsync()` instead of `model.getInstanceTree()`, and properties with `model.getPropertiesAsync()` or `model.getBulkPropertiesAsync()`. Use `Autodesk.Viewing.Math` for vectors, matrices, and boxes, and `Autodesk.Viewing.Scene` with render layers for custom geometry.
<pre>
class MyExtension extends Autodesk.Viewing.Extension {
    ...
    async load() {
        ...
        const tree = await this.viewer.model.getObjectTreeAsync();
        ...
        return true;
    }
    ...
}
</pre>
Example: [IconMarkupExtension load function](https://github.com/autodesk-platform-services/aps-extensions/blob/main/public/extensions/IconMarkupExtension/contents/main.js)
