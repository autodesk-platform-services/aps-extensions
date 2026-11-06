const fs = require('fs');
const path = require('path');

const EXTENSIONS_DIR = path.join(__dirname, 'public', 'extensions');

const readJson = (...segments) => JSON.parse(fs.readFileSync(path.join(EXTENSIONS_DIR, ...segments), 'utf8'));

// Merge the master config with each extension's own config.json (read once, in memory).
function loadExtensionsConfig() {
    const master = readJson('config.json');
    master.Extensions = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => readJson(dirent.name, 'config.json'));
    return master;
}

module.exports = { loadExtensionsConfig };
