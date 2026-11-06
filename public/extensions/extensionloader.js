const CUSTOM_LIST_ID = 'extensionlist';
const INBUILT_LIST_ID = 'inbuiltextensionlist';

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

// Loads an extension's dependencies and its own files the first time it is needed.
// Scripts are loaded one after the other so that they keep their declared order.
function loadExtensionFiles(extension) {
    if (!extension.ready) {
        extension.ready = (async () => {
            const path = 'extensions/' + extension.name + '/contents/';
            const dependencies = extension.externaldependencies || [];
            await Promise.all(dependencies.filter(d => d.type === 'css').map(d => loadResource('css', d.link)));
            for (const d of dependencies.filter(d => d.type === 'js')) await loadResource('js', d.link);
            await Promise.all(extension.filestoload.cssfiles.map(file => loadResource('css', path + file)));
            for (const file of extension.filestoload.jsfiles) await loadResource('js', path + file);
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
    const customExtensions = config.Extensions.filter(extension => extension.includeinlist);
    const inbuiltExtensions = config.InbuiltExtensions.filter(extension => extension.includeinlist !== false);
    let currentViewer = null;

    // One checkbox per extension. Disabled until a viewer exists to load the extension into.
    function createRow(extension, label, isDefaultOn, onToggle) {
        const checkbox = el('input', { type: 'checkbox', name: extension.name, value: extension.name, disabled: true });
        checkbox.addEventListener('change', () => onToggle(checkbox.checked));
        const row = el('div', { className: 'ext-row' }, el('label', {}, checkbox, label));
        return { extension, checkbox, row, isDefaultOn };
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
        const item = createRow(extension, extension.displayname, extension.loadonstartup, on => setCustomExtension(item, on));

        const details = el('div', { className: 'ext-details', hidden: true }, el('p', {}, extension.description));
        if (/^https:\/\//.test(extension.bloglink || '')) {
            details.append(el('a', { href: extension.bloglink, target: '_blank', rel: 'noopener', textContent: 'Learn more' }));
        }
        if (extension.gif) {
            details.append(el('img', {
                src: 'extensions/' + extension.name + '/' + extension.gif,
                alt: extension.displayname + ' sample',
                loading: 'lazy'
            }));
        }
        const infoButton = el('button', { type: 'button', className: 'icon-button info-button', textContent: 'i', title: 'About ' + extension.displayname });
        infoButton.setAttribute('aria-expanded', 'false');
        infoButton.addEventListener('click', () => {
            details.hidden = !details.hidden;
            infoButton.setAttribute('aria-expanded', String(!details.hidden));
        });
        item.row.append(infoButton);

        if (extension.editoptions) {
            const editButton = el('button', { type: 'button', className: 'text-button', textContent: 'Options', title: 'Edit options of ' + extension.displayname });
            editButton.addEventListener('click', () => openEditDialog(item));
            item.row.append(editButton);
        }
        item.container = el('div', { className: 'ext' }, item.row, details);
        return item;
    });

    const inbuiltItems = inbuiltExtensions.map(extension => {
        const item = createRow(extension, extension.name.slice('Autodesk.'.length), extension.default, on => {
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
            item.checkbox.disabled = false;
            item.checkbox.checked = item.isDefaultOn;
        }
        customItems.filter(item => item.isDefaultOn).forEach(item => setCustomExtension(item, true));
        const requested = new URLSearchParams(window.location.search).get('extension');
        if (requested) {
            const target = customItems.find(item => item.extension.name === requested);
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
        link.hidden = !/^https:\/\//.test(item.extension.bloglink || '');
        link.href = item.extension.bloglink || '#';
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
