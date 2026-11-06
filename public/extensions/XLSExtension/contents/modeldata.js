
// Model data in format for charts
class ModelData {
    constructor(model) {
        this._modelData = {};
        this._model = model;
    }

    async init(callback) {
        const dbIds = await this.getAllLeafComponents();
        const results = await this._model.getBulkPropertiesAsync(dbIds, { propFilter: null });
        results.forEach(({ dbId, properties }) => {
            properties.forEach(prop => {
                if (!isNaN(prop.displayValue)) return; // let's not categorize properties that store numbers

                // some adjustments for revit:
                prop.displayValue = prop.displayValue.replace('Revit ', ''); // remove this Revit prefix
                if (prop.displayValue.indexOf('<') == 0) return; // skip categories that start with <

                // ok, now let's organize the data into this hash table
                if (this._modelData[prop.displayName] == null) this._modelData[prop.displayName] = {};
                if (this._modelData[prop.displayName][prop.displayValue] == null) this._modelData[prop.displayName][prop.displayValue] = [];
                this._modelData[prop.displayName][prop.displayValue].push(dbId);
            });
        });
        callback();
    }

    async getAllLeafComponents() {
        // from https://learnforge.autodesk.io/#/viewer/extensions/panel?id=enumerate-leaf-nodes
        const tree = await this._model.getObjectTreeAsync();
        const leaves = [];
        tree.enumNodeChildren(tree.getRootId(), (dbId) => {
            if (tree.getChildCount(dbId) === 0) {
                leaves.push(dbId);
            }
        }, true);
        return leaves;
    }

    hasProperty(propertyName){
        return (this._modelData[propertyName] !== undefined);
    }

    getLabels(propertyName) {
        return Object.keys(this._modelData[propertyName]);
    }

    getCountInstances(propertyName) {
        return Object.keys(this._modelData[propertyName]).map(key => this._modelData[propertyName][key].length);
    }

    getIds(propertyName, propertyValue) {
        return this._modelData[propertyName][propertyValue];
    }
}
