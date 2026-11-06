const fs = require('fs');
const path = require('path');

const EXTENSIONS_DIR = path.join(__dirname, 'public', 'extensions');
const IMAGE_EXTENSIONS = ['gif', 'jpg', 'jpeg', 'png'];

const readJson = (...segments) => JSON.parse(fs.readFileSync(path.join(EXTENSIONS_DIR, ...segments), 'utf8'));

// Files directly inside <extension>/contents/ with the given extension, alphabetical, with main.* last
// so that helper scripts are loaded before the entry point. Extensions that need another order
// (or files from subfolders) can set "filestoload" in their config.json.
function scanContents(folder, ext) {
    const dir = path.join(EXTENSIONS_DIR, folder, 'contents');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.' + ext))
        .map(entry => entry.name)
        .sort((a, b) => (a === 'main.' + ext) - (b === 'main.' + ext) || a.localeCompare(b));
}

function findPreview(folder) {
    return IMAGE_EXTENSIONS.map(ext => 'extension.' + ext)
        .find(file => fs.existsSync(path.join(EXTENSIONS_DIR, folder, file)));
}

// Builds a complete extension entry for the client from the folder and its (optional, minimal) config.json.
// Anything set in config.json wins over the derived defaults. Folders starting with "_" are hidden from the list.
function describeExtension(folder) {
    const configPath = path.join(EXTENSIONS_DIR, folder, 'config.json');
    const config = fs.existsSync(configPath) ? readJson(folder, 'config.json') : {};
    const files = config.filestoload || {};
    return {
        name: folder,
        displayname: folder,
        description: '',
        options: {},
        loadonstartup: false,
        includeinlist: !folder.startsWith('_'),
        gif: findPreview(folder),
        externaldependencies: [],
        ...config,
        filestoload: {
            cssfiles: files.cssfiles || scanContents(folder, 'css'),
            jsfiles: files.jsfiles || scanContents(folder, 'js')
        }
    };
}

// The master config only lists the built-in viewer extensions. Custom extensions are discovered from the folders.
// This is cheap, so it runs on every request: new extensions show up on a page refresh, no restart needed.
function loadExtensionsConfig() {
    const master = readJson('config.json');
    master.Extensions = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .flatMap(dirent => {
            try {
                return [describeExtension(dirent.name)];
            } catch (err) {
                console.warn(`Skipping extension "${dirent.name}": ${err.message}`);
                return [];
            }
        });
    return master;
}

module.exports = { loadExtensionsConfig, describeExtension };
