// This config controls the state of the Gantt chart
const phasing_config = {
  "tasks": [],
  "objects": {},
  "propFilter": "Type Name",
  "requiredProps": {
    "id": "ID",
    "taskName": "NAME",
    "startDate": "START",
    "endDate": "END",
    "taskProgress": "PROGRESS",
    "dependencies": "DEPENDENCIES"
  },
  "mapTaksNProps": {},
  "viewModes": [
    // "Quarter Day",
    // "Half Day",
    "Day",
    "Week",
    "Month"
  ],
  "statusColors": {
    "finished": "31,246,14",
    "inProgress": "235,246,14",
    "late": "246,55,14",
    "notYetStarted": "",
    "advanced": "14,28,246"
  }
}

class PhasingPanel extends Autodesk.Viewing.UI.DockingPanel {
  constructor(extension, id, title, options) {
    super(extension.viewer.container, id, title, options);
    this.extension = extension;
    this.container.style.left = (options.x || 0) + 'px';
    this.container.style.top = (options.y || 0) + 'px';
    this.container.style.width = (options.width || 500) + 'px';
    this.container.style.height = (options.height || 400) + 'px';
    this.container.style.resize = 'both';
    this.container.style.overflow = 'overlay';
    this.container.style.backgroundColor = 'white';
    this.options = options;
    this.currentViewMode = 'Day';
  }

  initialize() {

    this.title = this.createTitleBar(this.titleLabel || this.container.id);
    this.title.style.overflow = 'auto';
    this.initializeMoveHandlers(this.title);
    this.container.appendChild(this.title);

    this.div = document.createElement('div');
    this.container.appendChild(this.div);

    //Here we add the button to update the csv
    this.importbutton = document.createElement('button');
    this.importbutton.innerHTML = 'IMPORT CSV';
    this.importbutton.style.width = (this.options.buttonWidth || 100) + 'px';
    this.importbutton.style.height = (this.options.buttonHeight || 24) + 'px';
    this.importbutton.style.margin = (this.options.margin || 5) + 'px';
    this.importbutton.style.verticalAlign = (this.options.verticalAlign || 'middle');
    this.importbutton.style.backgroundColor = (this.options.backgroundColor || 'white');
    this.importbutton.style.borderRadius = (this.options.borderRadius || 8) + 'px';
    this.importbutton.style.borderStyle = (this.options.borderStyle || 'groove');
    this.importbutton.style.color = "black";

    this.importbutton.onclick = this.importCSV.bind(this);
    this.div.appendChild(this.importbutton);

    //Here we add the button to export the Gantt as csv
    this.exportbutton = document.createElement('button');
    this.exportbutton.innerHTML = 'Export CSV';
    this.exportbutton.style.width = (this.options.buttonWidth || 100) + 'px';
    this.exportbutton.style.height = (this.options.buttonHeight || 24) + 'px';
    this.exportbutton.style.margin = (this.options.margin || 5) + 'px';
    this.exportbutton.style.verticalAlign = (this.options.verticalAlign || 'middle');
    this.exportbutton.style.backgroundColor = (this.options.backgroundColor || 'white');
    this.exportbutton.style.borderRadius = (this.options.borderRadius || 8) + 'px';
    this.exportbutton.style.borderStyle = (this.options.borderStyle || 'groove');
    this.exportbutton.style.color = "black";

    this.exportbutton.onclick = this.exportCSV.bind(this);
    this.div.appendChild(this.exportbutton);

    //Here we create a dropdown to control vision of the GANTT
    this.dropdown = document.createElement('select');
    this.dropdown.style.width = (this.options.dropdownWidth || 100) + 'px';
    this.dropdown.style.height = (this.options.dropdownHeight || 28) + 'px';
    this.dropdown.style.margin = (this.options.margin || 5) + 'px';
    this.dropdown.style.verticalAlign = (this.options.verticalAlign || 'middle');
    this.dropdown.style.backgroundColor = (this.options.backgroundColor || 'white');
    this.dropdown.style.borderRadius = (this.options.borderRadius || 8) + 'px';
    this.dropdown.style.borderStyle = (this.options.borderStyle || 'groove');
    for (const viewMode of phasing_config.viewModes) {
      let currentOption = document.createElement('option');
      currentOption.value = viewMode;
      currentOption.innerHTML = viewMode;
      this.dropdown.appendChild(currentOption);
    }

    this.dropdown.onchange = this.changeViewMode.bind(this);
    this.div.appendChild(this.dropdown);

    //Here we create a switch to control vision of the schedule based on the GANTT chart
    this.checkbox = document.createElement('input');
    this.checkbox.type = 'checkbox';
    this.checkbox.id = 'colormodel';
    this.checkbox.style.width = (this.options.checkboxWidth || 30) + 'px';
    this.checkbox.style.height = (this.options.checkboxHeight || 28) + 'px';
    this.checkbox.style.margin = '0 0 0 ' + (this.options.margin || 5) + 'px';
    this.checkbox.style.verticalAlign = (this.options.verticalAlign || 'middle');
    this.checkbox.style.backgroundColor = (this.options.backgroundColor || 'white');
    this.checkbox.style.borderRadius = (this.options.borderRadius || 8) + 'px';
    this.checkbox.style.borderStyle = (this.options.borderStyle || 'groove');

    this.checkbox.onchange = this.handleColors.bind(this);
    this.div.appendChild(this.checkbox);

    this.label = document.createElement('label');
    this.label.for = 'colormodel';
    this.label.innerHTML = 'Show Phases';
    this.label.style.fontSize = (this.options.fontSize || 14) + 'px';
    this.label.style.verticalAlign = (this.options.verticalAlign || 'middle');
    this.label.style.color = "black";
    this.div.appendChild(this.label);

    //Here we add the svg for the GANTT chart
    this.content = document.createElement('div');
    this.content.style.backgroundColor = (this.options.backgroundColor || 'white');
    this.content.innerHTML = `<svg id="phasing-container"></svg>`;
    this.container.appendChild(this.content);

    this.dockleft = document.createElement('img');
    //https://icons8.com/icon/105589/left-docking
    this.dockleft.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABmJLR0QA/wD/AP+gvaeTAAABGklEQVRoge2ZMQ6CQBBFn8bGxgNI7Rltbb2JFvbeiZgIjSUWsIYQdiMws8sm85IpDOuf/7MTNgAYhmGsmRPwAGqgWVg1cAeKmOZfAsaHVcYK8VAw7+oWI4DE2PjqLWVyE7jWTFj7D9J6AGwlRFJiAVKzm7B2OMOrIPsdyCXAZc6ftM4AV1PMzxrfuQ0l9Zz5LAP0zWcXYGg+qwBj5rMJ4DOfRYCQeW//NZ0DH2nBFCN0HlmXzQg5fCHUGmrojYVQbaihNwyh3lBDrx8iSkMNPRdilCkPNKm4AnvfRXsrkRoLkBoLkJrQbbQGDr3fEmeBo5ISCu3AU6pJZO0fBe3HiNBDxpwqgWOMAHSNbrRbvtR41WlFM28YhqHPF0NRPAWhEg4IAAAAAElFTkSuQmCC';
    this.dockleft.style.width = (this.options.imageWidth || 30) + 'px';
    this.dockleft.style.height = (this.options.imageHeight || 28) + 'px';
    this.dockleft.style.margin = '0 0 0 ' + (this.options.margin || 10) + 'px';
    this.dockleft.style.verticalAlign = (this.options.verticalAlign || 'middle');
    this.dockleft.onclick = this.toggleOrientation.bind(this, false);
    this.div.appendChild(this.dockleft);

    this.dockbottom = document.createElement('img');
    //https://icons8.com/icon/105606/bottom-docking
    this.dockbottom.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABmJLR0QA/wD/AP+gvaeTAAAA+0lEQVRoge2XsQ6CMBCGP9RV4yyzz+hofBsc2F0dfBriAC+AAzQhBBp6plxJ7ktuIC30+3OQUjAMw9g6N6AV1l3BdxJJiGTkHSEhkpN3LAmRrLzDFyJ5ecdUiM3IO4YhosnvYz0Y+AAZ8AYeEdcxDMPDFSiBBvn/jrQa4Ank/8h/FcTHVUlDlAnIuyrmJDNPgAY4BoaORQ2cpwZ8AdqAuTFYtP5uBZGoWABtDgFzx+9kEmy+AxZAm5BvQHsfmGTzHbAA2lgAbSyANr59oAFOg2vNf6F6bsDXgVcEESkil5zuQK19Hq6AiyQA/Y0FXQvXFq/7tcXyhmEY8fkBDhLw1fWJwhgAAAAASUVORK5CYII=';
    this.dockbottom.style.width = (this.options.imageWidth || 30) + 'px';
    this.dockbottom.style.height = (this.options.imageHeight || 28) + 'px';
    this.dockbottom.style.margin = '0 0 0 ' + (this.options.margin || 10) + 'px';
    this.dockbottom.style.verticalAlign = (this.options.verticalAlign || 'middle');
    this.dockbottom.onclick = this.toggleOrientation.bind(this, true);
    this.div.appendChild(this.dockbottom);

    this.updateTasks();
  }

  toggleOrientation(isVertical) {
    const { left: startX, top: startY, right: endX, bottom: endY } = this.extension.viewer.impl.getCanvasBoundingClientRect();

    let defaultPanelHeigth = (this.options.height || 400);
    let defaultPanelWidth = (this.options.width || 500);

    if (isVertical) {
      this.container.style.width = (endX - startX - 20) + 'px';
      this.container.style.height = defaultPanelHeigth + 'px';
      this.container.style.left = (this.options.x || 0) + 'px';
      this.container.style.top = (endY - startY - defaultPanelHeigth - this.options.y) + 'px';
    }
    else {
      this.container.style.width = defaultPanelWidth + 'px';
      this.container.style.height = (endY - startY - 20) + 'px';
      this.container.style.left = (this.options.x || 0) + 'px';
      this.container.style.top = (this.options.y || 0) + 'px';
    }
  }

  update(model, dbids) {
    if (phasing_config.tasks.length === 0) {
      this.inputCSV();
    }
    model.getBulkProperties(dbids, { propFilter: [phasing_config.propFilter] }, (results) => {
      results.map((result => {
        this.updateObjects(result);
      }))
    }, (err) => {
      console.error(err);
    });
    if (phasing_config.tasks.length > 0) {
      this.gantt = this.createGanttChart();
      this.handleColors.call(this);
      this.changeViewMode.call(this);
    }
  }

  async exportCSV() {
    let tasks = this.gantt.tasks.map(task => `${task.id},${task.name},${task._start.toISOString().split('T')[0]},${task._end.toISOString().split('T')[0]},${task.progress},${Object.keys(phasing_config.mapTaksNProps).find(key => phasing_config.mapTaksNProps[key] === task.id)},${task.dependencies.join('-')}`);

    let header = Object.values(phasing_config.requiredProps);
    header.splice(5, 0, phasing_config.propFilter);
    tasks.splice(0, 0, header.join(','));

    let csvString = tasks.join("%0A");
    let a = document.createElement('a');
    a.href = 'data:attachment/csv,' + csvString;
    a.target = '_blank';
    a.download = this.currentDataType + (new Date()).getTime() + '.csv';
    document.body.appendChild(a);
    a.click();
  }

  async importCSV() {
    await this.inputCSV();
    this.gantt = this.createGanttChart();
    this.handleColors.call(this);
  }

  createGanttChart() {
    document.getElementById('phasing-container').innerHTML = `<svg id="phasing-container"></svg>`;

    let newGantt = new Gantt("#phasing-container", phasing_config.tasks, {
      on_click: this.barCLickEvent.bind(this),
      on_progress_change: this.handleColors.bind(this),
      on_date_change: this.handleColors.bind(this)
    });
    return newGantt;
  }

  barCLickEvent(task) {
    this.extension.viewer.isolate(phasing_config.objects[task.id]);
  }

  updateObjects(result) {
    let currentTaskId = phasing_config.mapTaksNProps[result.properties[0].displayValue];
    if (!!currentTaskId) {
      if (!phasing_config.objects[currentTaskId])
        phasing_config.objects[currentTaskId] = [];

      phasing_config.objects[currentTaskId].push(result.dbId);
    }
  }

  updateTasks() {
    if (phasing_config.tasks.length === 0) {
      this.inputCSV();
    }
  }

  handleColors() {
    this.handleElementsColor.call(this);
    this.handleBarsColor.call(this);
  }

  handleElementsColor() {
    const overrideCheckbox = document.getElementById('colormodel');
    if (overrideCheckbox.checked) {
      let tasksNStatusArray = this.gantt.tasks.map(this.checkTaskStatus);
      let mappeddbIds = [];
      for (let index = 0; index < this.gantt.tasks.length; index++) {
        const currentTaskId = this.gantt.tasks[index].id;
        const currentdbIds = phasing_config.objects[currentTaskId];
        const colorVector4 = this.fromRGB2Color(phasing_config.statusColors[tasksNStatusArray[index]]);
        currentdbIds.forEach(dbId => {
          if (colorVector4) {
            this.extension.viewer.setThemingColor(dbId, colorVector4)
          }
          else {
            this.extension.viewer.hide(dbId);
          }
        });
        mappeddbIds.push(...currentdbIds);
      }
      this.extension.viewer.isolate(mappeddbIds);
    }
    else {
      this.extension.viewer.clearThemingColors();
      this.extension.viewer.showAll();
    }
  }

  handleBarsColor() {
    this.gantt.bars.map(bar => {
      let tasksStatus = this.checkTaskStatus(bar.task);
      let barColor = phasing_config.statusColors[tasksStatus];
      bar.$bar.style = `fill: rgb(${barColor})`;
    })
  }

  fromRGB2Color(rgbString) {
    if (rgbString) {
      let colorsInt = rgbString.replaceAll(' ', '').split(',').map(colorString => parseInt(colorString, 10));
      return new THREE.Vector4(colorsInt[0] / 255, colorsInt[1] / 255, colorsInt[2] / 255, 0.5);
    }
    else {
      return null;
    }
  }

  checkTaskStatus(task) {
    let currentDate = new Date();

    let taskStart = new Date(task._start);
    let taskEnd = new Date(task._end);

    let shouldHaveStarted = currentDate > taskStart;
    let shouldHaveEnded = currentDate > taskEnd;

    let taskProgress = parseInt(task.progress, 10);

    //We need to map finished, in progress, late, not yet started or advanced
    //finished should have started and ended and actually ended (progress 100%)
    //in progress should have started, not ended and progress should be greater than 0
    //late should have started and ended but progress is less than 100, or should have started not ended and progress is 0
    //not yet started should not have started nor ended and progress is 0
    //advanced should not have started and have progress greater than 0 or should not have ended and progress is 100

    if (shouldHaveStarted && shouldHaveEnded && taskProgress === 100)
      return 'finished';

    else if (shouldHaveStarted && !shouldHaveEnded) {
      switch (taskProgress) {
        case 100:
          return 'advanced';
        case 0:
          return 'late';
        default:
          return 'inProgress';
      }
    }

    else if (shouldHaveStarted && shouldHaveEnded && taskProgress < 100)
      return 'late';

    else if (!shouldHaveStarted && !shouldHaveEnded && taskProgress === 0)
      return 'notYetStarted';

    else if (!shouldHaveStarted && taskProgress > 0)
      return 'advanced';

  }

  changeViewMode(event) {
    const viewMode = event ? event.target.value : this.currentViewMode;
    this.gantt.change_view_mode(viewMode);
    this.handleColors.call(this);
    this.currentViewMode = viewMode;
  }

  async inputCSV() {
    const { value: file } = await Swal.fire({
      title: 'Select csv file',
      input: 'file',
      inputAttributes: {
        'accept': '.csv',
        'aria-label': 'Upload your csv for configuration'
      },
      footer: '<a href="https://gist.github.com/JoaoMartins-callmeJohn/488b4173c384ee12fc338dac02588385" target="_blank">GRAB A SAMPLE CSV HERE!</a>',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Import CSV'
    })
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        let lines = e.target.result.split('\n');
        if (this.validateCSV(lines[0])) {
          let header = lines[0];
          lines.shift();
          let newTasks = lines.map(line => this.lineToObject(line, header));
          phasing_config.tasks = newTasks;
        }
      }
      reader.readAsBinaryString(file);
    }
  }

  //This function converts a line from imported csv into an object to generate the GANTT chart
  lineToObject(line, inputHeadersLine) {
    let parameters = line.split(',');
    let inputHeaders = inputHeadersLine.split(',');
    let newObject = {};
    Object.values(phasing_config.requiredProps).forEach(requiredProp => {
      newObject.id = parameters[inputHeaders.findIndex(h => h === phasing_config.requiredProps.id)];
      newObject.name = parameters[inputHeaders.findIndex(h => h === phasing_config.requiredProps.taskName)];
      newObject.start = parameters[inputHeaders.findIndex(h => h === phasing_config.requiredProps.startDate)];
      newObject.end = parameters[inputHeaders.findIndex(h => h === phasing_config.requiredProps.endDate)];
      newObject.progress = parameters[inputHeaders.findIndex(h => h === phasing_config.requiredProps.taskProgress)];
      newObject.dependencies = parameters[inputHeaders.findIndex(h => h === phasing_config.requiredProps.dependencies)];
      newObject.dependencies.replaceAll('-', ',');
    });
    this.addPropToMask(parameters[inputHeaders.findIndex(h => h === phasing_config.propFilter)], newObject.id);
    return newObject;
  }

  addPropToMask(filterValue, taskId) {
    phasing_config.mapTaksNProps[filterValue] = taskId;
  }

  validateCSV(line) {
    let parameters = line.split(',');
    return Object.values(phasing_config.requiredProps).every((currentProp) => !!parameters.find(p => p === currentProp));
  }
}

class PhasingExtension extends Autodesk.Viewing.Extension {
  constructor(viewer, options) {
    super(viewer, options);
    this._button = null;
    this._panel = null;
  }

  async load() {
    super.load();
    await Promise.all([
      this.loadScript('https://cdn.jsdelivr.net/npm/frappe-gantt@0.6.1/dist/frappe-gantt.js', 'FrappeGantt'),
      this.loadScript('https://cdn.jsdelivr.net/npm/sweetalert2@11', 'SweetAlert2'),
      this.loadStylesheet('https://cdn.jsdelivr.net/npm/frappe-gantt@0.6.1/dist/frappe-gantt.css')
    ]);
    console.log('PhasingExtension loaded.');
    return true;
  }

  unload() {
    super.unload();
    if (this._button) {
      this.removeToolbarButton(this._button);
      this._button = null;
    }
    if (this._panel) {
      this._panel.setVisible(false);
      this._panel.uninitialize();
      this._panel = null;
    }
    this.viewer.clearThemingColors();
    this.viewer.showAll();
    console.log('PhasingExtension unloaded.');
    return true;
  }

  createToolbarButton(buttonId, buttonIconUrl, buttonTooltip) {
    let group = this.viewer.toolbar.getControl('dashboard-toolbar-group');
    if (!group) {
      group = new Autodesk.Viewing.UI.ControlGroup('dashboard-toolbar-group');
      this.viewer.toolbar.addControl(group);
    }
    const button = new Autodesk.Viewing.UI.Button(buttonId);
    button.setToolTip(buttonTooltip);
    group.addControl(button);
    const icon = button.container.querySelector('.adsk-button-icon');
    if (icon) {
      icon.style.backgroundImage = `url(${buttonIconUrl})`;
      icon.style.backgroundSize = `24px`;
      icon.style.backgroundRepeat = `no-repeat`;
      icon.style.backgroundPosition = `center`;
    }
    return button;
  }

  removeToolbarButton(button) {
    const group = this.viewer.toolbar.getControl('dashboard-toolbar-group');
    group.removeControl(button);
  }

  onToolbarCreated() {
    this._panel = new PhasingPanel(this, 'dashboard-phases-panel', 'Schedule', { x: 10, y: 10 });
    this._button = this.createToolbarButton('dashboard-phases-button', 'https://img.icons8.com/external-outline-black-m-oki-orlando/32/ffffff/external-gantt-charts-and-diagrams-outline-black-m-oki-orlando.png', 'Show Gantt Chart');//
    this._button.onClick = () => {
      this._panel.setVisible(!this._panel.isVisible());
      this._button.setState(this._panel.isVisible() ? Autodesk.Viewing.UI.Button.State.ACTIVE : Autodesk.Viewing.UI.Button.State.INACTIVE);
      if (this._panel.isVisible() && this.viewer.model) {
        this.update();
      }
    };
  }

  onModelLoaded(model) {
    super.onModelLoaded(model);
    if (this._panel && this._panel.isVisible()) {
      this.update();
    }
  }

  findLeafNodes(model) {
    return new Promise(function (resolve, reject) {
      model.getObjectTree(function (tree) {
        let leaves = [];
        tree.enumNodeChildren(tree.getRootId(), function (dbid) {
          if (tree.getChildCount(dbid) === 0) {
            leaves.push(dbid);
          }
        }, true);
        resolve(leaves);
      }, reject);
    });
  }

  async update() {
    const dbids = await this.findLeafNodes(this.viewer.model);
    this._panel.update(this.viewer.model, dbids);
  }

  loadScript(url, namespace) {
    if (window[namespace] !== undefined) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      const el = document.createElement('script');
      el.src = url;
      el.onload = resolve;
      el.onerror = reject;
      document.head.appendChild(el);
    });
  }

  loadStylesheet(url) {
    return new Promise(function (resolve, reject) {
      const el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = url;
      el.onload = resolve;
      el.onerror = reject;
      document.head.appendChild(el);
    });
  }
}

Autodesk.Viewing.theExtensionManager.registerExtension('PhasingExtension', PhasingExtension);