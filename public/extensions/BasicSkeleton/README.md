# Basic Skeleton

This basic skeleton extension is a small starting point for creating a reusable Autodesk Platform Services Viewer extension.

## Files

- `config.json` describes the extension to the sample's extension loader.
- `contents/main.js` defines and registers the `Autodesk.Viewing.Extension`.
- `contents/main.css` contains optional styles for toolbar controls.

## Extension lifecycle

The JavaScript skeleton demonstrates the core lifecycle:

1. `load()` runs when the Viewer loads the extension.
2. `onToolbarCreated()` creates a control group and button when toolbar access is available.
3. The button's `onClick` handler is the place for custom behavior.
4. `unload()` removes controls and releases UI state.

The class is registered with:

```javascript
Autodesk.Viewing.theExtensionManager.registerExtension('BasicSkeleton', BasicSkeleton);
```

To create a custom extension, copy this folder, change the registered name and configuration, then replace the button action with the desired Viewer behavior. Keep the extension self-contained so it can be copied into another Viewer application.

## Current APS guidance

The original `learnforge.autodesk.io` tutorial link is no longer available. These current Autodesk resources cover the same concepts:

- [Basic Extension tutorial](https://get-started.aps.autodesk.com/tutorials/dashboard/basic/)
- [Extension Skeleton: Toolbar & Docking Panel](https://aps.autodesk.com/blog/extension-skeleton-toolbar-docking-panel)
- [Autodesk Platform Services Viewer documentation](https://aps.autodesk.com/en/docs/viewer/v7/developers_guide/overview/)