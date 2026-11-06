const CUSTOM_LIST_ID = 'extensionlist';
const INBUILT_LIST_ID = 'inbuiltextensionlist';

const isHttps = url => /^https:\/\//.test(url || '');

function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
}

// Each script or stylesheet is only added to the page once, however many extensions need it.
const resources = new Map();
function loadResource(type, url) {
    if (!resources.has(url)) {
        resources.set(url, new Promise((resolve, reject) => {
            const node = type === 'js' ? el('script', { src: url }) : el('link', { rel: 'stylesheet', href: url });
            node.onload = resolve;
            node.onerror = () => {
                resources.delete(url);
                reject(new Error('Failed to load ' + url));
            };
            document.head.append(node);
        }));
    }
    return resources.get(url);
}

// Loads an extension's dependencies (which include its own files) the first time it is needed.
// Stylesheets load in parallel; scripts load one after the other so that they keep their declared order.
function loadExtensionFiles(extension) {
    if (!extension.ready) {
        extension.ready = (async () => {
            const { dependencies } = extension;
            await Promise.all(dependencies.filter(d => d.type === 'css').map(d => loadResource('css', d.url)));
            for (const d of dependencies.filter(d => d.type === 'js')) await loadResource('js', d.url);
        })();
        extension.ready.catch(() => { extension.ready = null; });
    }
    return extension.ready;
}

document.addEventListener('DOMContentLoaded', async () => {
    let config;
    try {
        const resp = await fetch('extensions/config.json');
        if (!resp.ok) throw new Error(resp.statusText);
        config = await resp.json();
    } catch (err) {
        console.error('Could not load the extensions configuration', err);
        return;
    }
    init(config);
});

function init(config) {
    const customExtensions = config.extensions.filter(extension => extension.includeInList);
    const inbuiltExtensions = Object.entries(config.builtInExtensions).map(([name, isDefaultOn]) => ({ name, isDefaultOn }));
    let currentViewer = null;

    // One checkbox per extension. Disabled until a viewer exists to load the extension into,
    // and always disabled for extensions marked as disabled in their config.
    function createRow(extension, label, isDefaultOn, onToggle) {
        const supported = !extension.disabled;
        const checkbox = el('input', { type: 'checkbox', name: extension.name, value: extension.name, disabled: true });
        checkbox.addEventListener('change', () => onToggle(checkbox.checked));
        const text = supported ? label : `${label} (unavailable)`;
        const row = el('div', { className: 'ext-row' }, el('label', {}, checkbox, text));
        if (typeof extension.disabled === 'string') row.title = extension.disabled;
        return { extension, checkbox, row, isDefaultOn: isDefaultOn && supported, supported };
    }

    async function setCustomExtension(item, on) {
        if (!on) {
            currentViewer.unloadExtension(item.extension.name);
            return;
        }
        try {
            await loadExtensionFiles(item.extension);
            await currentViewer.loadExtension(item.extension.name, item.extension.options);
        } catch (err) {
            console.error(err);
            item.checkbox.checked = false;
        }
    }

    const customItems = customExtensions.map(extension => {
        const item = createRow(extension, extension.displayName, extension.loadOnStartup, on => setCustomExtension(item, on));

        const details = el('div', { className: 'ext-details', hidden: true }, el('p', {}, extension.description));
        if (isHttps(extension.link)) {
            details.append(el('a', { href: extension.link, target: '_blank', rel: 'noopener', textContent: 'Learn more' }));
        }
        if (extension.preview) {
            details.append(el('img', {
                src: 'extensions/' + extension.name + '/' + extension.preview,
                alt: extension.displayName + ' sample',
                loading: 'lazy'
            }));
        }
        const infoButton = el('button', { type: 'button', className: 'icon-button info-button', textContent: 'i', title: 'About ' + extension.displayName });
        infoButton.setAttribute('aria-expanded', 'false');
        infoButton.addEventListener('click', () => {
            details.hidden = !details.hidden;
            infoButton.setAttribute('aria-expanded', String(!details.hidden));
        });
        item.row.append(infoButton);

        if (extension.editable) {
            const editButton = el('button', { type: 'button', className: 'text-button', textContent: 'Options', title: 'Edit options of ' + extension.displayName });
            editButton.addEventListener('click', () => openEditDialog(item));
            item.row.append(editButton);
        }
        item.container = el('div', { className: 'ext' }, item.row, details);
        return item;
    });

    const inbuiltItems = inbuiltExtensions.map(extension => {
        const item = createRow(extension, extension.name.slice('Autodesk.'.length), extension.isDefaultOn, on => {
            if (on) currentViewer.loadExtension(extension.name);
            else currentViewer.unloadExtension(extension.name);
        });
        item.container = el('div', { className: 'ext' }, item.row);
        return item;
    });

    document.getElementById(CUSTOM_LIST_ID).replaceChildren(...customItems.map(item => item.container));
    document.getElementById(INBUILT_LIST_ID).replaceChildren(...inbuiltItems.map(item => item.container));

    // Every new viewer starts with its default extensions, so reset the checkboxes to match.
    document.addEventListener('viewerinstance', e => {
        currentViewer = e.detail.viewer;
        for (const item of [...customItems, ...inbuiltItems]) {
            item.checkbox.disabled = !item.supported;
            item.checkbox.checked = item.isDefaultOn;
        }
        customItems.filter(item => item.isDefaultOn).forEach(item => setCustomExtension(item, true));
        const requested = new URLSearchParams(window.location.search).get('extension');
        if (requested) {
            const target = customItems.find(item => item.extension.name === requested && item.supported);
            if (target) target.checkbox.click();
        }
    });

    // Edit options dialog
    const dialog = document.getElementById('editConfigModal');
    const textarea = document.getElementById('editextensionconfig');
    const errorBox = document.getElementById('editConfigError');
    let editItem;

    function openEditDialog(item) {
        editItem = item;
        textarea.value = JSON.stringify(item.extension.options, undefined, 2);
        const link = document.getElementById('learnmore');
        link.hidden = !isHttps(item.extension.link);
        link.href = item.extension.link || '#';
        errorBox.hidden = true;
        dialog.showModal();
    }
    document.getElementById('cancelconfig').addEventListener('click', () => dialog.close());
    document.getElementById('editConfigForm').addEventListener('submit', e => {
        e.preventDefault();
        try {
            editItem.extension.options = JSON.parse(textarea.value);
        } catch (err) {
            errorBox.textContent = 'Invalid JSON: ' + err.message;
            errorBox.hidden = false;
            return;
        }
        // New options only matter for an extension that is currently on; otherwise they apply the next time it is enabled.
        if (editItem.checkbox.checked) {
            currentViewer.unloadExtension(editItem.extension.name);
            currentViewer.loadExtension(editItem.extension.name, editItem.extension.options);
        }
        dialog.close();
    });
}
