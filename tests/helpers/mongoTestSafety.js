'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function getConfiguredApplicationUri() {
    if (process.env.MONGODB_URI) return process.env.MONGODB_URI;

    const envPath = path.join(__dirname, '..', '..', '.env');
    if (!fs.existsSync(envPath)) return undefined;

    // Parse only for host comparison; do not load or print any .env values.
    return dotenv.parse(fs.readFileSync(envPath, 'utf8')).MONGODB_URI;
}

function parseMongoUri(uri) {
    let parsed;
    try {
        parsed = new URL(uri);
    } catch {
        throw new Error('MONGODB_TEST_URI must be a valid MongoDB URI.');
    }

    if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
        throw new Error('MONGODB_TEST_URI must use the MongoDB protocol.');
    }

    const databaseName = decodeURIComponent(parsed.pathname.slice(1));
    if (!databaseName || !/(^|[-_])test($|[-_])/i.test(databaseName)) {
        throw new Error('MONGODB_TEST_URI must name a dedicated test database.');
    }

    return { host: parsed.hostname.toLowerCase(), databaseName };
}

function getSafeMongoTestUri({
    testUri = process.env.MONGODB_TEST_URI,
    applicationUri = getConfiguredApplicationUri(),
    allowRemote = process.env.MONGODB_TEST_ALLOW_REMOTE
} = {}) {
    if (!testUri) return null;

    const testTarget = parseMongoUri(testUri);

    if (applicationUri) {
        const applicationTarget = parseMongoUriForComparison(applicationUri);
        if (applicationTarget && testTarget.host === applicationTarget.host) {
            throw new Error('MONGODB_TEST_URI must use a different MongoDB host from MONGODB_URI.');
        }
    }

    if (!LOCAL_HOSTS.has(testTarget.host) && allowRemote !== 'I_UNDERSTAND_THIS_IS_DISPOSABLE') {
        throw new Error(
            'Remote MongoDB tests require MONGODB_TEST_ALLOW_REMOTE=I_UNDERSTAND_THIS_IS_DISPOSABLE after verifying a dedicated disposable test cluster.'
        );
    }

    return testUri;
}

function parseMongoUriForComparison(uri) {
    try {
        const parsed = new URL(uri);
        if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) return null;
        return { host: parsed.hostname.toLowerCase() };
    } catch {
        return null;
    }
}

module.exports = { getSafeMongoTestUri };
