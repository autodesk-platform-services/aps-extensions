// *******************************************
// Custom Property Panel
// *******************************************
class CustomPropertyPanel extends Autodesk.Viewing.Extensions.ViewerPropertyPanel {
    constructor (viewer, options) {
        super(viewer, options);
        this.properties = options.properties || {};
    }

    setAggregatedProperties(propertySet) {
        Autodesk.Viewing.Extensions.ViewerPropertyPanel.prototype.setAggregatedProperties.call(this, propertySet);

        // add your custom properties here
        const dbids = propertySet.getDbIds();
        dbids.forEach(id => {
            var propsForObject = this.properties[id.toString()];
            if (propsForObject) {
                for (const groupName in propsForObject) {
                    const group = propsForObject[groupName];
                    for (const propName in group) {
                        const prop = group[propName];
                        this.addProperty(propName, prop, groupName);
                    }
                }
            }
        });
    }
};

// *******************************************
// Custom Properties Extension
// *******************************************
class CustomPropertiesExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
       
        this.panel = new CustomPropertyPanel(viewer, options);
    }

    async load() {
        var ext = await this.viewer.getExtension('Autodesk.PropertiesManager');
        ext.setPanel(this.panel);

        return true;
    }

    async unload() {
        var ext = await this.viewer.getExtension('Autodesk.PropertiesManager');
        ext.setDefaultPanel();

        return true;
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('CustomPropertiesExtension', CustomPropertiesExtension);