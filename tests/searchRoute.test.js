'use strict';

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('base64');

const ownerId = new mongoose.Types.ObjectId();
const otherId = new mongoose.Types.ObjectId();
const owner = { _id: ownerId, username: 'search_owner', status: 'active', authTokenVersion: 0 };
let state;

function createState() {
    return {
        files: [], shares: [], activities: [], fail: null,
        queries: { files: [], shares: [], activities: [] }
    };
}

function id(number) {
    return new mongoose.Types.ObjectId(number.toString(16).padStart(24, '0'));
}

function matchesRegex(value, regex) {
    return regex instanceof RegExp && regex.test(String(value || ''));
}

function sortAndLimit(items, sort, limit) {
    return [...items].sort((a, b) => {
        const dateOrder = new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        if (dateOrder) return dateOrder;
        return String(b._id).localeCompare(String(a._id));
    }).slice(0, limit);
}

function makeQuery(model, filter) {
    let limit = Infinity;
    let sort = null;
    return {
        select(fields) { state.queries[model].push({ fields }); return this; },
        sort(value) { sort = value; state.queries[model].push({ sort: value }); return this; },
        limit(value) { limit = value; state.queries[model].push({ limit: value }); return this; },
        async lean() {
            if (state.fail === model) throw new Error('DATABASE_SECRET_DETAIL');
            state.queries[model].push({ filter });
            let rows = [];
            if (model === 'files') {
                rows = state.files.filter(file =>
                    String(filter.ownerId) === String(file.ownerId) &&
                    filter.lifecycle.$in.includes(file.lifecycle ?? null) &&
                    matchesRegex(file.originalName, filter.originalName)
                );
            } else if (model === 'shares') {
                rows = state.shares.filter(share =>
                    String(filter.ownerId) === String(share.ownerId) &&
                    filter.revokedAt === null && share.revokedAt == null &&
                    filter.fileId.$in.some(fileId => String(fileId) === String(share.fileId))
                );
            } else {
                rows = state.activities.filter(activity =>
                    String(filter.userId) === String(activity.userId) &&
                    filter.$or.some(condition => matchesRegex(activity[Object.keys(condition)[0]], condition[Object.keys(condition)[0]]))
                );
            }
            return sort ? sortAndLimit(rows, sort, limit) : rows.slice(0, limit);
        }
    };
}

const File = { find(filter) { return makeQuery('files', filter); } };
const ShareLink = { find(filter) { return makeQuery('shares', filter); } };
const AuditLog = { find(filter) { return makeQuery('activities', filter); } };
const User = {
    findById(value) {
        return { select: async () => String(value) === String(ownerId) ? owner : null };
    }
};

const originals = new Map();
function installMock(relativePath, exports) {
    const filename = require.resolve(relativePath);
    originals.set(filename, require.cache[filename]);
    const mocked = new Module(filename, module);
    mocked.filename = filename;
    mocked.loaded = true;
    mocked.exports = exports;
    require.cache[filename] = mocked;
}

installMock('../models/user', User);
installMock('../models/file', File);
installMock('../models/shareLink', ShareLink);
installMock('../models/auditlog', AuditLog);
const { COOKIE_NAME, signAccessToken } = require('../services/jwtService');
const router = require('../routes/search');
const app = express();
app.use('/search', router);

function authenticated(path = '/search') {
    const { token } = signAccessToken({ _id: ownerId, authTokenVersion: 0 });
    return request(app)
        .get(path)
        .set('Accept', 'application/json')
        .set('Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}`);
}

function makeFile({ owner = ownerId, num, name, createdAt, lifecycle = 'active' }) {
    return {
        _id: id(num), ownerId: owner, originalName: name, size: 100 + num,
        createdAt: createdAt || new Date(2026, 0, num), lifecycle,
        storagePath: 'PRIVATE_STORAGE_PATH', encryption: { wrappedKey: 'PRIVATE_KEY' },
        integrity: { sha256: 'PRIVATE_HASH' }
    };
}

beforeEach(() => { state = createState(); });

test('global search requires a verified authenticated user', async () => {
    const response = await request(app).get('/search?q=notes').set('Accept', 'application/json');
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { error: 'Authentication required.' });
});

test('query validation rejects missing, short, long, duplicate, and control-character input', async () => {
    const invalidUrls = [
        '/search', '/search?q=', '/search?q=x', `/search?q=${'a'.repeat(81)}`,
        '/search?q=first&q=second', '/search?q=%00'
    ];
    for (const url of invalidUrls) {
        const response = await authenticated(url);
        assert.equal(response.status, 400, url);
        assert.equal(response.body.success, false);
        assert.match(response.body.error, /between 2 and 80/);
    }
    assert.equal(state.queries.files.length, 0);
});

test('regex metacharacters are treated as literal text and results are bounded and sorted', async () => {
    state.files = Array.from({ length: 24 }, (_, index) => makeFile({
        num: index + 1,
        name: index < 9 ? `Record .* literal ${index}` : `Other record ${index}`,
        createdAt: new Date(2026, 0, index + 1)
    }));
    state.shares = Array.from({ length: 9 }, (_, index) => ({
        _id: id(80 + index), fileId: state.files[index]._id, ownerId, revokedAt: null,
        createdAt: new Date(2026, 1, index + 1)
    }));
    state.activities = Array.from({ length: 9 }, (_, index) => ({
        _id: id(100 + index), userId: ownerId, action: 'security_event',
        fileName: null, description: `literal .* event ${index}`, createdAt: new Date(2026, 2, index + 1)
    }));
    const response = await authenticated('/search?q=%2E%2A');
    assert.equal(response.status, 200);
    assert.equal(response.body.results.filter(item => item.type === 'file').length, 5);
    assert.equal(response.body.results.filter(item => item.type === 'share').length, 5);
    assert.equal(response.body.results.filter(item => item.type === 'activity').length, 5);
    assert.equal(response.body.results.length, 15);
    assert.deepEqual(
        response.body.results.filter(item => item.type === 'file').map(item => item.title),
        ['Record .* literal 8', 'Record .* literal 7', 'Record .* literal 6', 'Record .* literal 5', 'Record .* literal 4']
    );
    assert.equal(response.body.results.some(item => item.title === 'Other record 23'), false);
    assert.equal(state.queries.files.find(query => query.limit)?.limit, 20);
    assert.deepEqual(state.queries.files.find(query => query.sort)?.sort, { createdAt: -1, _id: -1 });
    assert.equal(state.queries.shares.find(query => query.limit)?.limit, 5);
    assert.equal(state.queries.activities.find(query => query.limit)?.limit, 5);
});

test('cross-account files are isolated by owner-scoped file queries', async () => {
    state.files = [
        makeFile({ num: 1, name: 'Private blueprints' }),
        makeFile({ owner: otherId, num: 2, name: 'Private blueprints from another account' })
    ];
    const response = await authenticated('/search?q=private');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.results.filter(item => item.type === 'file').map(item => item.title), ['Private blueprints']);
    const fileFilter = state.queries.files.find(query => query.filter).filter;
    assert.equal(String(fileFilter.ownerId), String(ownerId));
});

test('only non-revoked owned shares are returned and sensitive file/share fields are excluded', async () => {
    const file = makeFile({ num: 3, name: 'Budget notes' });
    const otherFile = makeFile({ owner: otherId, num: 4, name: 'Budget notes private' });
    state.files = [file, otherFile];
    state.shares = [
        { _id: id(30), fileId: file._id, ownerId, revokedAt: null, tokenHash: 'TOKEN_HASH', tokenCiphertext: 'TOKEN_CIPHER' },
        { _id: id(31), fileId: file._id, ownerId, revokedAt: new Date(), tokenHash: 'REVOKED_HASH' },
        { _id: id(32), fileId: otherFile._id, ownerId: otherId, revokedAt: null, tokenHash: 'OTHER_HASH' }
    ];
    const response = await authenticated('/search?q=budget');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.results.filter(item => item.type === 'share').map(item => item.title), ['Budget notes']);
    const serialized = JSON.stringify(response.body);
    for (const secret of ['tokenHash', 'tokenCiphertext', 'storagePath', 'wrappedKey', 'sha256', 'ownerId', 'REVOKED_HASH']) {
        assert.equal(serialized.includes(secret), false, secret);
    }
    const shareFilter = state.queries.shares.find(query => query.filter).filter;
    assert.equal(String(shareFilter.ownerId), String(ownerId));
    assert.equal(shareFilter.revokedAt, null);
});

test('activity results are limited to the authenticated account and expose only safe fields', async () => {
    state.activities = [
        { _id: id(41), userId: ownerId, action: 'file_upload', status: 'success', fileName: 'Quarterly report', description: 'Quarterly report uploaded', createdAt: new Date(), ipAddress: 'PRIVATE_IP', userAgent: 'PRIVATE_AGENT', metadata: { secret: 'PRIVATE_METADATA' } },
        { _id: id(42), userId: otherId, action: 'file_upload', status: 'success', fileName: 'Quarterly report private', description: 'Quarterly report uploaded', createdAt: new Date(), ipAddress: 'OTHER_IP' }
    ];
    const response = await authenticated('/search?q=quarterly');
    assert.equal(response.status, 200);
    const activities = response.body.results.filter(item => item.type === 'activity');
    assert.equal(activities.length, 1);
    assert.equal(activities[0].fileName, 'Quarterly report');
    const logFilter = state.queries.activities.find(query => query.filter).filter;
    assert.equal(String(logFilter.userId), String(ownerId));
    const serialized = JSON.stringify(response.body);
    for (const secret of ['PRIVATE_IP', 'PRIVATE_AGENT', 'PRIVATE_METADATA', 'OTHER_IP']) {
        assert.equal(serialized.includes(secret), false, secret);
    }
});

test('empty results return a successful empty array', async () => {
    const response = await authenticated('/search?q=nomatch');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.results, []);
});

test('database errors return a generic response without leaking internal details', async () => {
    state.fail = 'activities';
    const response = await authenticated('/search?q=records');
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { success: false, error: 'Unable to search records.' });
    assert.equal(JSON.stringify(response.body).includes('DATABASE_SECRET_DETAIL'), false);
});

after(() => {
    for (const [filename, original] of originals) {
        if (original) require.cache[filename] = original;
        else delete require.cache[filename];
    }
});
