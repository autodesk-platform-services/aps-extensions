const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_BUCKET, PORT = 3000 } = process.env;

const missing = Object.entries({ APS_CLIENT_ID, APS_CLIENT_SECRET, APS_BUCKET })
    .filter(([, value]) => !value)
    .map(([name]) => name);
if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
}

module.exports = { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_BUCKET, PORT };
