const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { PORT } = require('./config.js');
const { getPublicToken, listObjects } = require('./aps.js');
const { loadExtensionsConfig } = require('./extensions.js');

const app = express();
// Viewer pages rely on inline scripts, third-party CDNs and blob/worker URLs, so CSP is left to be tuned separately.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
// Discovered from the extension folders on every request, so new extensions appear on a page refresh.
app.get('/extensions/config.json', (req, res) => res.json(loadExtensionsConfig()));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/auth/token', async (req, res) => {
    res.json(await getPublicToken());
});

// Feeds the models list in the client with the designs in the configured bucket.
app.get('/api/models', async (req, res) => {
    const objects = await listObjects();
    res.json(objects.map(object => ({
        urn: Buffer.from(object.objectId).toString('base64url'),
        name: object.objectKey
    })));
});

// 404 for unknown API routes, then a final error handler that never leaks internals.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}...`));
