///////////////////////////////////////////////////////////////////
// Animation player extension
// Plays animations made with the AnimationEditor extension (Theatre.js
// project state files) on the loaded model, using only the lightweight
// Theatre.js core and the Scene API (see SceneAnimator.js).
///////////////////////////////////////////////////////////////////
(function () {
    let core = null; // Theatre.js core, loaded with the first player (see SceneAnimator.loadTheatreCore)
    const SHEET_NAME = 'Scene';
    // Theatre.js projects can't be removed, so each loaded animation gets a new one. The ids are unique across page loads,
    // as the studio (when the editor extension is loaded too) keeps the projects it has seen in local storage.
    const PAGE_ID = Date.now().toString(36);
    let projectCount = 0;

    class AnimationPlayer extends Autodesk.Viewing.Extension {
        constructor(viewer, options) {
            super(viewer, options);
            this.options = Object.assign({ animationUrl: '', autoplay: true, loop: true }, options);
            this._group = null;
            this._button = null;
            this.objects = [];
            this.sheet = null;
            this._onDragOver = this._onDragOver.bind(this);
            this._onDrop = this._onDrop.bind(this);
        }

        async load() {
            const model = this.viewer.model;
            if (!model) {
                console.warn('[AnimationPlayer] Load a model before loading this extension');
                return false;
            }
            this.model = model;
            core = await SceneAnimator.loadTheatreCore();
            this.animator = await new SceneAnimator(this.viewer, model).init();
            this.props = SceneAnimator.createProps(core.types, this.animator.modelSize());
            this._createPanel();
            this.viewer.container.addEventListener('dragover', this._onDragOver);
            this.viewer.container.addEventListener('drop', this._onDrop);
            if (this.options.animationUrl) {
                this.loadFromUrl(this.options.animationUrl).catch(err => this._setStatus(err.message, true));
            }
            console.log('AnimationPlayer loaded');
            return true;
        }

        unload() {
            this._clear();
            if (this.animator) this.animator.dispose();
            this.viewer.container.removeEventListener('dragover', this._onDragOver);
            this.viewer.container.removeEventListener('drop', this._onDrop);
            if (this.panel) this.panel.remove();
            if (this._group) {
                this._group.removeControl(this._button);
                if (this._group.getNumberOfControls() === 0) {
                    this.viewer.toolbar.removeControl(this._group);
                }
            }
            console.log('AnimationPlayer unloaded');
            return true;
        }

        onToolbarCreated() {
            this._group = this.viewer.toolbar.getControl('animationToolbar');
            if (!this._group) {
                this._group = new Autodesk.Viewing.UI.ControlGroup('animationToolbar');
                this.viewer.toolbar.addControl(this._group);
            }
            this._button = new Autodesk.Viewing.UI.Button('animationPlayerButton');
            this._button.icon.classList.add('fas', 'fa-play-circle');
            this._button.setToolTip('Show or hide the animation player');
            this._button.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
            this._button.onClick = () => {
                const visible = this.panel.hidden;
                this.panel.hidden = !visible;
                this._button.setState(visible ? Autodesk.Viewing.UI.Button.State.ACTIVE : Autodesk.Viewing.UI.Button.State.INACTIVE);
            };
            this._group.addControl(this._button);
        }

        // Public API

        async loadFromUrl(url) {
            this._setStatus('Loading…');
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Could not load the animation (${response.status} ${response.statusText})`);
            this.loadAnimation(await response.json());
        }

        // Loads a Theatre.js project state, as exported by the editor extension (or the Theatre.js studio)
        loadAnimation(state) {
            if (!state || !state.sheetsById) throw new Error('Not an animation file');
            this._clear();
            const sheetName = state.sheetsById[SHEET_NAME] ? SHEET_NAME : Object.keys(state.sheetsById)[0];
            const project = core.getProject(`Player ${PAGE_ID}-${++projectCount}`, { state });
            this.sheet = project.sheet(sheetName);

            let missing = 0;
            for (const key of SceneAnimator.objectKeys(state, sheetName)) {
                const dbId = SceneAnimator.dbIdFromKey(key);
                // The key also has the element's name: skip elements of other models that happen to have the same dbId
                const matches = dbId !== null && key === SceneAnimator.keyFor(dbId, this.animator.getName(dbId));
                if (!matches || !this.animator.add(dbId)) {
                    missing++;
                    continue;
                }
                const object = this.sheet.object(key, this.props);
                this.objects.push({ key, object, unsubscribe: object.onValuesChange(values => this.animator.apply(dbId, values)) });
            }

            const sequence = this.sheet.sequence;
            this.length = core.val(sequence.pointer.length);
            this.seek.max = String(this.length);
            this._unsubscribePosition = core.onChange(sequence.pointer.position, position => this._showPosition(position));
            this._unsubscribePlaying = core.onChange(sequence.pointer.playing, playing => this._showPlaying(playing));
            this.panel.classList.add('has-animation');
            this._setStatus(missing
                ? `${missing} animated element(s) are not in this model.`
                : `${this.objects.length} animated element(s).`, missing > 0);
            project.ready.then(() => {
                if (this.sheet === project.sheet(sheetName) && this.options.autoplay) this.play();
            });
        }

        play() {
            if (!this.sheet) return;
            const sequence = this.sheet.sequence;
            if (!this.options.loop && sequence.position >= this.length) sequence.position = 0;
            sequence.play({ iterationCount: this.options.loop ? Infinity : 1 });
        }

        pause() {
            if (this.sheet) this.sheet.sequence.pause();
        }

        // Unloads the current animation and puts the model back as it was
        _clear() {
            if (this.sheet) this.sheet.sequence.pause();
            if (this._unsubscribePosition) this._unsubscribePosition();
            if (this._unsubscribePlaying) this._unsubscribePlaying();
            this._unsubscribePosition = this._unsubscribePlaying = null;
            for (const { key, unsubscribe } of this.objects) {
                unsubscribe();
                this.sheet.detachObject(key);
                this.animator.remove(SceneAnimator.dbIdFromKey(key));
            }
            this.objects = [];
            this.sheet = null;
            if (this.panel) this.panel.classList.remove('has-animation');
        }

        // UI: a small bar over the bottom of the viewer

        _createPanel() {
            const el = (tag, props = {}, ...children) => {
                const node = Object.assign(document.createElement(tag), props);
                node.append(...children);
                return node;
            };
            this.playButton = el('button', { type: 'button', className: 'animation-player-play', title: 'Play' });
            this.playButton.setAttribute('aria-label', 'Play');
            this.playButton.addEventListener('click', () => {
                if (this.sheet && core.val(this.sheet.sequence.pointer.playing)) this.pause();
                else this.play();
            });
            this.seek = el('input', { type: 'range', min: '0', max: '1', step: 'any', value: '0', className: 'animation-player-seek' });
            this.seek.setAttribute('aria-label', 'Animation position');
            this.seek.addEventListener('input', () => {
                if (!this.sheet) return;
                this.pause();
                this.sheet.sequence.position = parseFloat(this.seek.value);
            });
            this.time = el('span', { className: 'animation-player-time', textContent: '0.00 s' });
            this.fileInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
            this.fileInput.addEventListener('change', () => {
                if (this.fileInput.files[0]) this._loadFile(this.fileInput.files[0]);
                this.fileInput.value = '';
            });
            const openButton = el('button', { type: 'button', className: 'animation-player-open', textContent: 'Open…', title: 'Open an animation file (.json), or drop one on the viewer' });
            openButton.addEventListener('click', () => this.fileInput.click());
            this.status = el('span', { className: 'animation-player-status', textContent: 'Open or drop an animation file' });
            this.status.setAttribute('role', 'status');

            this.panel = el('div', { className: 'animation-player' },
                el('div', { className: 'animation-player-controls' }, this.playButton, this.seek, this.time, openButton, this.fileInput),
                this.status);
            this.viewer.container.appendChild(this.panel);
        }

        _showPosition(position) {
            this.seek.value = String(position);
            this.time.textContent = `${position.toFixed(2)} s`;
        }

        _showPlaying(playing) {
            this.playButton.classList.toggle('playing', playing);
            const label = playing ? 'Pause' : 'Play';
            this.playButton.title = label;
            this.playButton.setAttribute('aria-label', label);
        }

        _setStatus(text, isError = false) {
            if (!this.status) return;
            this.status.textContent = text;
            this.status.classList.toggle('error', isError);
        }

        async _loadFile(file) {
            try {
                this.loadAnimation(JSON.parse(await file.text()));
            } catch (err) {
                console.error(err);
                this._setStatus(`Could not open ${file.name}: ${err.message}`, true);
            }
        }

        _onDragOver(event) {
            if (event.dataTransfer && [...event.dataTransfer.items].some(item => item.kind === 'file')) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
            }
        }

        _onDrop(event) {
            const file = event.dataTransfer && event.dataTransfer.files[0];
            if (!file) return;
            event.preventDefault();
            this._loadFile(file);
        }
    }

    Autodesk.Viewing.theExtensionManager.registerExtension('AnimationPlayer', AnimationPlayer);
})();
