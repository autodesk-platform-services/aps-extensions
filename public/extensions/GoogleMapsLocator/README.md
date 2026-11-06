# Google Maps Locator

[Demo](https://aps-extensions.autodesk.io/?extension=GoogleMapsLocator)

APS Viewer extension to show location of model on google maps.

![thumbnail](extension.gif)

## Usage

- Load the extension in the viewer
- Click the new maps icon in the toolbar
- New docking panel opens showing google maps and the model location mentioned in extension config

## Setup

Include the CSS & JS file on your page. This CDN is compatible with the lastest Viewer version (v7).

```xml
<link rel="stylesheet" href="http://cdn.jsdelivr.net/gh/autodesk-forge/forge-extensions/public/extensions/GoogleMapsLocator/contents/main.css">
<script src="http://cdn.jsdelivr.net/gh/autodesk-forge/forge-extensions/public/extensions/GoogleMapsLocator/contents/main.js"></script>
```

The following sample uses [font-awesome](https://fontawesome.com) icons, but any CSS icon library can be used.

```xml
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.11.2/css/all.min.css" />
```

The extension loads the Google Maps API itself, the first time the map is opened, using the `apiKey` option. Get your Google Maps API Key [here](https://developers.google.com/maps/documentation/javascript/get-api-key), and restrict it to your site's referrers.

```js
viewer.loadExtension('GoogleMapsLocator', { apiKey: '<Google Maps API Key>', latitude: 0, longitude: 0 });
```

If your page already includes the Google Maps API script, the `apiKey` option is not needed.

