const fs = require('fs');
const path = require('path');

const EXTENSIONS_DIR = path.join(__dirname, 'public', 'extensions');
const REPO_URL = 'https://github.com/autodesk-platform-services/aps-extensions/tree/main/public/extensions/';
const PREVIEW_FILES = ['gif', 'jpg', 'jpeg', 'png'].map(ext => 'extension.' + ext);

const readJson = (...segments) => JSON.parse(fs.readFileSync(path.join(EXTENSIONS_DIR, ...segments), 'utf8'));
const exists = (...segments) => fs.existsSync(path.join(EXTENSIONS_DIR, ...segments));

// Files directly inside <extension>/contents/ with the given extension, alphabetical, with main.* last
// so that helper scripts are loaded before the entry point.
function scanContents(folder, ext) {
    const dir = path.join(EXTENSIONS_DIR, folder, 'contents');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.' + ext))
        .map(entry => entry.name)
        .sort((a, b) => (a === 'main.' + ext) - (b === 'main.' + ext) || a.localeCompare(b));
}

// A dependency is a URL, or a path relative to the extension's contents/ folder, either as a plain string
// or as { "url": "...", "type": "js" | "css" }. The type is guessed from the file name when not given.
function resolveDependency(folder, dependency) {
    const { url, type } = typeof dependency === 'string' ? { url: dependency } : dependency;
    if (!url) throw new Error('Dependency without a URL: ' + JSON.stringify(dependency));
    const absolute = /^https?:\/\//.test(url);
    const resolved = absolute ? url : 'extensions/' + folder + '/contents/' + url;
    const pathname = absolute ? new URL(url).pathname : url.split('?')[0];
    return { url: resolved, type: type || (pathname.endsWith('.css') ? 'css' : 'js') };
}

// Builds a complete extension entry for the client from the folder and its (optional, minimal) config.json.
// Folders starting with "_" are hidden from the list.
function describeExtension(folder) {
    const config = exists(folder, 'config.json') ? readJson(folder, 'config.json') : {};
    const { displayName = folder, description = '', options, loadOnStartup = false, dependencies = [] } = config;
    const ownFiles = [...scanContents(folder, 'css'), ...scanContents(folder, 'js')];
    return {
        name: folder,
        displayName,
        description,
        options: options || {},
        editable: options !== undefined,
        loadOnStartup,
        includeInList: !folder.startsWith('_'),
        link: config.link || (exists(folder, 'README.md') ? REPO_URL + folder : undefined),
        preview: PREVIEW_FILES.find(file => exists(folder, file)),
        // Declared dependencies first, in order, then the extension's own files. Listing one of the extension's
        // own files in "dependencies" just moves it earlier.
        dependencies: [...dependencies, ...ownFiles]
            .map(dependency => resolveDependency(folder, dependency))
            .filter((dependency, index, all) => all.findIndex(other => other.url === dependency.url) === index)
    };
}

// The master config only lists the built-in viewer extensions. Custom extensions are discovered from the folders.
// This is cheap, so it runs on every request: new extensions show up on a page refresh, no restart needed.
function loadExtensionsConfig() {
    const { builtInExtensions } = readJson('config.json');
    const extensions = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .flatMap(dirent => {
            try {
                return [describeExtension(dirent.name)];
            } catch (err) {
                console.warn(`Skipping extension "${dirent.name}": ${err.message}`);
                return [];
            }
        });
    return { builtInExtensions, extensions };
}

module.exports = { loadExtensionsConfig, describeExtension };
