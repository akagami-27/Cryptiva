'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { ensureCsrfToken, requireCsrf } = require('../middleware/csrf');

const originalMasterKey = process.env.MASTER_ENCRYPTION_KEY;
process.env.MASTER_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
const cryptoService = require('../services/cryptoService');
const plaintext = Buffer.from('Cryptiva route integration fixture');

let context = createContext();

function createContext(overrides = {}) {
    const ownerId = new mongoose.Types.ObjectId();
    const fileId = new mongoose.Types.ObjectId();
    const shareId = new mongoose.Types.ObjectId();
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const key = cryptoService.generateDataEncryptionKey();
    const encrypted = cryptoService.encryptData(plaintext, key);
    const wrapped = cryptoService.wrapDataEncryptionKey(key);
    key.fill(0);

    const share = {
        _id: shareId,
        fileId,
        ownerId,
        tokenHash,
        passwordHash: null,
        expiresAt: null,
        revokedAt: null,
        maxDownloads: 1,
        downloadCount: 0,
        activeDownloads: 0,
        activeDownloadReservations: [],
        ...overrides.share
    };
    const file = {
        _id: fileId,
        ownerId,
        lifecycle: 'active',
        storagePath: `users/${ownerId}/${fileId}.enc`,
        originalName: 'route-test.txt',
        mimeType: 'application/octet-stream',
        integrity: { sha256: cryptoService.calculateSha256(plaintext) },
        encryption: {
            iv: encrypted.iv.toString('base64'),
            authTag: encrypted.authTag.toString('base64'),
            wrappedKey: wrapped.wrappedKey.toString('base64'),
            keyWrapIv: wrapped.keyWrapIv.toString('base64'),
            keyWrapAuthTag: wrapped.keyWrapAuthTag.toString('base64')
        },
        ...overrides.file
    };

    return {
        ownerId,
        fileId,
        shareId,
        token,
        user: { _id: ownerId, status: 'active' },
        share,
        file,
        ciphertext: encrypted.ciphertext,
        acquisitions: [],
        settlements: [],
        fileQueries: [],
        storageDownloads: 0
    };
}

const User = {
    async findById(id) {
        return String(id) === String(context.user._id) ? context.user : null;
    }
};

const File = {
    async findOne(filter) {
        context.fileQueries.push(filter);
        return String(filter._id) === String(context.file._id) &&
            String(filter.ownerId) === String(context.share.ownerId) &&
            String(context.file.ownerId) === String(filter.ownerId) &&
            filter.lifecycle?.$in?.includes(context.file.lifecycle)
            ? context.file
            : null;
    }
};

const ShareLink = {
    async findOne(filter) {
        return filter.tokenHash === context.share.tokenHash ? context.share : null;
    },
    async updateOne(filter, pipeline) {
        if (Object.hasOwn(filter, 'activeDownloadReservations.expiresAt')) {
            const now = filter['activeDownloadReservations.expiresAt'].$lte;
            const priorLength = context.share.activeDownloadReservations.length;
            context.share.activeDownloadReservations =
                context.share.activeDownloadReservations.filter((entry) => entry.expiresAt > now);
            context.share.activeDownloads = context.share.activeDownloadReservations.length;
            return { modifiedCount: priorLength === context.share.activeDownloads ? 0 : 1 };
        }

        const reservationId = filter['activeDownloadReservations.id'];
        const matchIndex = context.share.activeDownloadReservations.findIndex(
            (entry) => entry.id === reservationId
        );
        if (matchIndex < 0) return { modifiedCount: 0 };

        const completed = pipeline[0].$set.downloadCount.$add[1] === 1;
        context.settlements.push({ reservationId, completed });
        context.share.activeDownloadReservations =
            context.share.activeDownloadReservations.filter((entry) => entry.id !== reservationId);
        context.share.activeDownloads = context.share.activeDownloadReservations.length;
        if (completed) context.share.downloadCount += 1;
        return { modifiedCount: 1 };
    },
    async findOneAndUpdate(filter, pipeline) {
        const now = filter.$or.find((condition) => condition.expiresAt)?.expiresAt?.$gt;
        const active = !context.share.revokedAt &&
            (!context.share.expiresAt || context.share.expiresAt > now);
        const slotsAvailable = context.share.maxDownloads == null ||
            context.share.downloadCount + context.share.activeDownloadReservations.length < context.share.maxDownloads;
        if (String(filter._id) !== String(context.share._id) || !active || !slotsAvailable) return null;

        const reservation = pipeline[0].$set.activeDownloadReservations.$concatArrays[1][0];
        context.acquisitions.push(reservation.id);
        context.share.activeDownloadReservations.push(reservation);
        context.share.activeDownloads = context.share.activeDownloadReservations.length;
        return context.share;
    }
};

const supabase = {
    storage: {
        from() {
            return {
                async download() {
                    context.storageDownloads += 1;
                    return { data: new Blob([context.ciphertext]), error: null };
                }
            };
        }
    }
};

const auditLogService = new Proxy({}, {
    get: () => async () => undefined
});

function installModuleMock(relativePath, exports) {
    const filename = require.resolve(relativePath);
    const mockedModule = new Module(filename, module);
    mockedModule.filename = filename;
    mockedModule.loaded = true;
    mockedModule.exports = exports;
    require.cache[filename] = mockedModule;
}

installModuleMock('../models/user', User);
installModuleMock('../models/file', File);
installModuleMock('../models/shareLink', ShareLink);
installModuleMock('../config/supabase', supabase);
installModuleMock('../services/auditLogService', auditLogService);

const router = require('../routes/files');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.flash = () => undefined;
    req.session = { csrfToken: 'route-test-csrf' };
    if (req.get('x-test-user') === 'yes') {
        req.session.user = { id: String(context.user._id) };
    }
    if (req.get('x-test-verified-share') === 'yes') {
        req.session.sharePasswordVerified = {
            tokenHash: context.share.tokenHash,
            shareId: String(context.share._id),
            passwordHash: context.share.passwordHash,
            expiresAt: Date.now() + 60_000
        };
    }

    if (req.get('x-test-fail-setup') === 'yes') {
        const originalSetHeader = res.setHeader;
        let fail = true;
        res.setHeader = function (name, value) {
            if (fail && name.toLowerCase() === 'content-disposition') {
                fail = false;
                throw new Error('simulated response header failure');
            }
            return originalSetHeader.call(this, name, value);
        };
    }

    if (req.get('x-test-fail-send') === 'yes') {
        const originalSend = res.send;
        let fail = true;
        res.send = function (body) {
            if (fail && Buffer.isBuffer(body)) {
                fail = false;
                throw new Error('simulated response send failure');
            }
            return originalSend.call(this, body);
        };
    }

    if (req.get('x-test-slow-send') === 'yes') {
        const originalSend = res.send;
        res.send = function (body) {
            if (!Buffer.isBuffer(body)) return originalSend.call(this, body);
            const timer = setTimeout(() => {
                if (!this.destroyed) this.end(body.subarray(1024));
            }, 2000);
            this.once('close', () => clearTimeout(timer));
            this.write(body.subarray(0, 1024));
            return this;
        };
    }

    if (req.get('x-test-close-before-finish') === 'yes') {
        const originalSend = res.send;
        let emitted = false;
        res.send = function (body) {
            if (!emitted && Buffer.isBuffer(body)) {
                emitted = true;
                this.emit('close');
            }
            return originalSend.call(this, body);
        };
    }
    next();
});
app.use(ensureCsrfToken);
app.use(requireCsrf);
app.use('/files', router);

function authenticatedRequest() {
    return request(app)
        .post(`/files/shared/${context.token}/download`)
        .set('x-test-user', 'yes')
        .set('x-csrf-token', 'route-test-csrf');
}

function reset(overrides) {
    context = createContext(overrides);
}

test('actual shared-download route completes and settles its reservation exactly once', async () => {
    reset();
    const response = await authenticatedRequest().buffer(true);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, plaintext);
    assert.equal(context.acquisitions.length, 1);
    assert.equal(context.settlements.length, 1);
    assert.deepEqual(context.settlements[0], {
        reservationId: context.acquisitions[0],
        completed: true
    });
    assert.equal(context.share.downloadCount, 1);
});

test('actual route releases its reservation when response setup throws', async () => {
    reset();
    const response = await authenticatedRequest()
        .set('x-test-fail-setup', 'yes');

    assert.equal(response.status, 500);
    assert.equal(context.acquisitions.length, 1);
    assert.deepEqual(context.settlements, [{
        reservationId: context.acquisitions[0],
        completed: false
    }]);
    assert.equal(context.share.downloadCount, 0);
    assert.equal(context.share.activeDownloads, 0);
});

test('actual route releases its reservation when response sending throws', async () => {
    reset();
    const response = await authenticatedRequest()
        .set('x-test-fail-send', 'yes');

    assert.equal(response.status, 500);
    assert.equal(context.acquisitions.length, 1);
    assert.deepEqual(context.settlements, [{
        reservationId: context.acquisitions[0],
        completed: false
    }]);
    assert.equal(context.share.downloadCount, 0);
    assert.equal(context.share.activeDownloads, 0);
});

test('actual route releases the matching reservation on client disconnect before completion', async (t) => {
    reset();
    const largePlaintext = Buffer.alloc(12 * 1024 * 1024, 0x61);
    const key = cryptoService.generateDataEncryptionKey();
    const encrypted = cryptoService.encryptData(largePlaintext, key);
    const wrapped = cryptoService.wrapDataEncryptionKey(key);
    key.fill(0);
    context.ciphertext = encrypted.ciphertext;
    context.file.integrity.sha256 = cryptoService.calculateSha256(largePlaintext);
    context.file.encryption = {
        iv: encrypted.iv.toString('base64'),
        authTag: encrypted.authTag.toString('base64'),
        wrappedKey: wrapped.wrappedKey.toString('base64'),
        keyWrapIv: wrapped.keyWrapIv.toString('base64'),
        keyWrapAuthTag: wrapped.keyWrapAuthTag.toString('base64')
    };

    const http = require('node:http');
    const server = await new Promise((resolve) => {
        const listeningServer = app.listen(0, () => resolve(listeningServer));
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));

    await new Promise((resolve, reject) => {
        const req = http.request({
            method: 'POST',
            port: server.address().port,
            path: `/files/shared/${context.token}/download`,
            headers: {
                'x-test-user': 'yes',
                'x-csrf-token': 'route-test-csrf',
                'x-test-slow-send': 'yes'
            }
        }, (res) => {
            res.once('data', () => {
                res.destroy();
                resolve();
            });
            res.once('error', () => resolve());
        });
        req.once('error', reject);
        req.end();
    });

    for (let attempt = 0; attempt < 50 && context.settlements.length === 0; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(context.acquisitions.length, 1);
    assert.deepEqual(context.settlements, [{
        reservationId: context.acquisitions[0],
        completed: false
    }]);
    assert.equal(context.share.downloadCount, 0);
});

test('actual route does not double settle when close precedes finish', async () => {
    reset();
    const response = await authenticatedRequest()
        .set('x-test-close-before-finish', 'yes')
        .buffer(true);

    assert.equal(response.status, 200);
    assert.equal(context.acquisitions.length, 1);
    assert.deepEqual(context.settlements, [{
        reservationId: context.acquisitions[0],
        completed: false
    }]);
    assert.equal(context.share.downloadCount, 0);
});

test('actual route counts one successful settlement when finish precedes close', async () => {
    reset();
    const response = await authenticatedRequest().buffer(true);

    assert.equal(response.status, 200);
    assert.equal(context.settlements.length, 1);
    assert.deepEqual(context.settlements[0], {
        reservationId: context.acquisitions[0],
        completed: true
    });
    assert.equal(context.share.downloadCount, 1);
});

test('expired and revoked links are rejected before acquiring a reservation', async (t) => {
    for (const kind of ['expired', 'revoked']) {
        await t.test(kind, async () => {
            reset({ share: kind === 'expired'
                ? { expiresAt: new Date(Date.now() - 1000) }
                : { revokedAt: new Date() } });
            const response = await authenticatedRequest();
            assert.equal(response.status, 410);
            assert.equal(context.acquisitions.length, 0);
        });
    }
});

test('a request without a valid password-verification session cannot acquire a reservation', async () => {
    reset({ share: { passwordHash: 'bcrypt-hash-placeholder' } });
    const response = await authenticatedRequest();

    assert.equal(response.status, 403);
    assert.equal(context.acquisitions.length, 0);
    assert.equal(context.storageDownloads, 0);
});

test('unauthenticated requests cannot download or reserve another user’s shared file', async () => {
    reset();
    const response = await request(app)
        .post(`/files/shared/${context.token}/download`)
        .set('x-csrf-token', 'route-test-csrf');

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/login');
    assert.equal(context.acquisitions.length, 0);
    assert.equal(context.storageDownloads, 0);
});

test('the file lookup is constrained to the share owner before reservation', async () => {
    reset();
    context.file = { ...context.file, ownerId: new mongoose.Types.ObjectId() };
    const response = await authenticatedRequest();

    assert.equal(response.status, 404);
    assert.equal(context.fileQueries.length, 1);
    assert.equal(String(context.fileQueries[0].ownerId), String(context.share.ownerId));
    assert.equal(context.acquisitions.length, 0);
    assert.equal(context.storageDownloads, 0);
});

test.after(() => {
    if (originalMasterKey === undefined) delete process.env.MASTER_ENCRYPTION_KEY;
    else process.env.MASTER_ENCRYPTION_KEY = originalMasterKey;
});
