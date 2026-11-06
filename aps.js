const { AuthenticationClient, Scopes } = require('@aps_sdk/authentication');
const { OssClient } = require('@aps_sdk/oss');
const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_BUCKET } = require('./config.js');

const authenticationClient = new AuthenticationClient();
const ossClient = new OssClient();

// Scopes are kept minimal. The public token is only used by the Viewer to load translated designs.
const INTERNAL_SCOPES = [Scopes.DataRead, Scopes.BucketRead];
const PUBLIC_SCOPES = [Scopes.ViewablesRead];

// Cache token promises in memory and refresh one minute before expiry.
// A pending entry never expires, so concurrent requests share one APS call.
const cache = new Map();
function getToken(scopes) {
    const key = scopes.join(' ');
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now() + 60_000) return hit.promise;
    const entry = { expiresAt: Infinity };
    entry.promise = authenticationClient.getTwoLeggedToken(APS_CLIENT_ID, APS_CLIENT_SECRET, scopes)
        .then(({ access_token, expires_in }) => {
            entry.expiresAt = Date.now() + expires_in * 1000;
            return { access_token, expiresAt: entry.expiresAt };
        })
        .catch(err => {
            cache.delete(key);
            throw err;
        });
    cache.set(key, entry);
    return entry.promise;
}

// Token handed to the browser. `expires_in` reflects the remaining lifetime.
async function getPublicToken() {
    const { access_token, expiresAt } = await getToken(PUBLIC_SCOPES);
    return { access_token, expires_in: Math.floor((expiresAt - Date.now()) / 1000) };
}

// A single page is enough for a handful of models. OSS returns at most 100 objects per request (the default is 10).
async function listObjects() {
    const { access_token } = await getToken(INTERNAL_SCOPES);
    const { items } = await ossClient.getObjects(APS_BUCKET, { limit: 100, accessToken: access_token });
    return items;
}

module.exports = { getPublicToken, listObjects };
