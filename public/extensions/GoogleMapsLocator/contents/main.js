// *******************************************
// Google Maps API, loaded on first use with the API key from the extension options
// *******************************************
var googleMapsPromise = null;
function loadGoogleMaps(apiKey) {
    if (window.google && window.google.maps) return Promise.resolve();
    if (!apiKey) return Promise.reject(new Error('Set your Google Maps API key as "apiKey" in the extension options.'));
    if (!googleMapsPromise) {
        googleMapsPromise = new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(apiKey);
            script.onload = resolve;
            script.onerror = function () {
                googleMapsPromise = null;
                script.remove();
                reject(new Error('Could not load the Google Maps API.'));
            };
            document.head.appendChild(script);
        });
    }
    return googleMapsPromise;
}

// *******************************************
// MiniMap Extension
// *******************************************
function GoogleMapsLocator(viewer, options) {
    Autodesk.Viewing.Extension.call(this, viewer, options);
    this.viewer = viewer;
    this.panel = null; // dock panel
    this.map = null; // Google Map
    this.geoExtension = null; // Autodesk.Geolocation extension
    this.options = options; 

    var _this = this;
    // load extension...
    viewer.loadExtension('Autodesk.Geolocation').then(function (ext) { _this.geoExtension = ext });
}

GoogleMapsLocator.prototype = Object.create(Autodesk.Viewing.Extension.prototype);
GoogleMapsLocator.prototype.constructor = GoogleMapsLocator;

GoogleMapsLocator.prototype.load = function () {
    return true;
};

GoogleMapsLocator.prototype.onToolbarCreated = function () {
    // Create a new toolbar group if it doesn't exist
    this._group = this.viewer.toolbar.getControl('customExtensions');
    if (!this._group) {
        this._group = new Autodesk.Viewing.UI.ControlGroup('customExtensions');
        this.viewer.toolbar.addControl(this._group);
    }

    // Add a new button to the toolbar group
    this._button = new Autodesk.Viewing.UI.Button('showMiniMap');
    this._button.onClick = (ev) => {
        if (this.geoExtension === null || !this.geoExtension.hasGeolocationData()) {
            alert('Model does not contain geo location information');
            return;
        }
        if (!this.options.apiKey && !(window.google && window.google.maps)) {
            alert('Set your Google Maps API key as "apiKey" in the extension options.');
            return;
        }

        this._enabled = !this._enabled;
        this._button.setState(this._enabled ? 0 : 1);

        // if null, create it
        if (this.panel == null) {
            this.panel = new MiniMapPanel(this.viewer, this.viewer.container, 'miniMapPanel', 'Mini Map');
        }

        // show/hide docking panel
        this.panel.setVisible(!this.panel.isVisible());

        if (!this._enabled) return;

        loadGoogleMaps(this.options.apiKey).then(() => {
            // initialize the map
            if (this.map == null) {
                this.map = new google.maps.Map(document.getElementById('googlemap'), {
                    zoom: 16,
                    center: { lat: this.options.latitude, lng: this.options.longitude },
                    mapTypeId: 'satellite',
                    rotateControl: false,
                    streetViewControl: false,
                    tilt: 0
                });
            }

            // draw model boundoung box & center
            var bb = this.viewer.model.getBoundingBox();
            this.drawBoundingBox(bb.min, bb.max);
            this.cameraChanged(this.viewer.autocam); // first run (center of the model)
        }).catch(err => alert(err.message));
    };
    this._button.setToolTip('Show map location');
    this._button.container.children[0].classList.add('fas', 'fa-map-marked');
    this._group.addControl(this._button);

    // listen to camera changes
    this.viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, (e) => { this.cameraChanged(e.target.autocam) });
};

GoogleMapsLocator.prototype.drawBoundingBox = function (min, max) {
    // basic check...
    if (this.map == null) return;
    if (this.geoExtension == null) return;

    // prepare a polygon with the bounding box information
    var polygon = [];
    polygon.push({ x: min.x, y: min.y });
    polygon.push({ x: min.x, y: max.y });
    polygon.push({ x: max.x, y: max.y });
    polygon.push({ x: max.x, y: min.y });

    this.drawPolygon(polygon);
}

GoogleMapsLocator.prototype.drawPolygon = function (polygon) {
    // basic check...
    var _this = this;
    if (_this.map == null) return;
    if (_this.geoExtension == null) return;

    // prepare the polygon coordinate to draw it
    var coords = [];
    polygon.forEach(function (point) {
        var geoLoc = _this.geoExtension.lmvToLonLat(point);
        coords.push({ lat: geoLoc.y, lng: geoLoc.x });
    });
    var polyOptions = {
        path: coords,
        strokeColor: '#FF0000',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#FF0000',
        fillOpacity: 0.1,
    };
    var polygon = new google.maps.Polygon(polyOptions);
    polygon.setMap(_this.map);
}

GoogleMapsLocator.prototype.cameraChanged = function (camera) {
    // basic check...
    if (this.map == null) return;
    if (this.geoExtension == null) return;

    // adjust the center of the map
    var geoLoc = this.geoExtension.lmvToLonLat(camera.center);
    this.map.setCenter({ lat: geoLoc.y, lng: geoLoc.x });
}


GoogleMapsLocator.prototype.unload = function () {
    if (this.viewer.toolbar !== null) this.viewer.toolbar.removeControl(this.subToolbar);
    if (this.panel !== null) this.panel.setVisible(false);
    if (this._group) {
        this._group.removeControl(this._button);
        if (this._group.getNumberOfControls() === 0) {
            this.viewer.toolbar.removeControl(this._group);
        }
    }
    return true;
};

Autodesk.Viewing.theExtensionManager.registerExtension('GoogleMapsLocator', GoogleMapsLocator);

// *******************************************
// MiniMap Panel
// *******************************************
function MiniMapPanel(viewer, container, id, title, options) {
    this.viewer = viewer;
    Autodesk.Viewing.UI.DockingPanel.call(this, container, id, title, options);

    // the style of the docking panel
    // use this built-in style to support Themes on Viewer 4+
    this.container.classList.add('docking-panel-container-solid-color-a');
    this.container.style.top = "10px";
    this.container.style.left = "10px";
    this.container.style.width = "300px";
    this.container.style.height = "300px";
    this.container.style.resize = "auto";

    // here we check the existence of a googlemap div
    // and remove it if it does
    var googleMap = document.getElementById('googlemap');
    if(!!googleMap){
        googleMap.parentElement.removeChild(googleMap)
    }
    
    // this is where we should place the content of our panel
    var div = document.createElement('div');
    div.id = 'googlemap';
    this.container.appendChild(div);
}
MiniMapPanel.prototype = Object.create(Autodesk.Viewing.UI.DockingPanel.prototype);
MiniMapPanel.prototype.constructor = MiniMapPanel;
