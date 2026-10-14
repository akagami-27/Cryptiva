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
        otherUser: { _id: new mongoose.Types.ObjectId(), status: 'active' },
        share,
        file,
        ciphertext: encrypted.ciphertext,
        acquisitions: [],
        settlements: [],
        fileQueries: [],
        storageDownloads: 0,
        storageRemovals: 0,
        fileDeletions: 0,
        shareDeletions: 0,
        shareCreations: 0,
        shareMutations: 0,
        shareMutationQueries: []
    };
}

const User = {
    async findById(id) {
        if (String(id) === String(context.user._id)) return context.user;
        if (String(id) === String(context.otherUser._id)) return context.otherUser;
        return null;
    }
};

const File = {
    async findOne(filter) {
        context.fileQueries.push(filter);
        return String(filter._id) === String(context.file._id) &&
            String(context.file.ownerId) === String(filter.ownerId) &&
            (!filter.lifecycle || filter.lifecycle.$in.includes(context.file.lifecycle))
            ? context.file
            : null;
    },
    async deleteOne(filter) {
        if (String(filter._id) === String(context.file._id) &&
            String(filter.ownerId) === String(context.file.ownerId)) {
            context.fileDeletions += 1;
            return { deletedCount: 1 };
        }
        return { deletedCount: 0 };
    }
};

const ShareLink = {
    async findOne(filter) {
        if (filter.tokenHash) {
            return filter.tokenHash === context.share.tokenHash ? context.share : null;
        }
        return String(filter.fileId) === String(context.share.fileId) &&
            String(filter.ownerId) === String(context.share.ownerId)
            ? context.share
            : null;
    },
    async deleteMany(filter) {
        if (String(filter.fileId) === String(context.file._id) &&
            String(filter.ownerId) === String(context.file.ownerId)) {
            context.shareDeletions += 1;
            return { deletedCount: 1 };
        }
        return { deletedCount: 0 };
    },
    async deleteOne() {
        context.shareDeletions += 1;
        return { deletedCount: 1 };
    },
    async create() {
        context.shareCreations += 1;
        return context.share;
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
        if (!filter.$or) {
            context.shareMutationQueries.push(filter);
            if (String(filter._id) !== String(context.share._id) ||
                String(filter.ownerId) !== String(context.share.ownerId) ||
                context.share.revokedAt) {
                return null;
            }
            context.share.revokedAt = new Date();
            context.shareMutations += 1;
            return context.share;
        }

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
                },
                async remove() {
                    context.storageRemovals += 1;
                    return { data: [], error: null };
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
const sharedRouter = require('../routes/shared');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.flash = () => undefined;
    req.session = { csrfToken: 'route-test-csrf' };
    if (req.get('x-test-user') === 'yes') {
        req.session.user = { id: String(context.user._id) };
    }
    if (req.get('x-test-other-user') === 'yes') {
        req.session.user = { id: String(context.otherUser._id) };
    }
    if (req.get('x-test-verified-share') === 'yes') {
        req.session.sharePasswordVerified = {
            tokenHash: context.share.tokenHash,
            shareId: String(context.share._id),
            passwordHash: context.share.passwordHash,
            expiresAt: req.get('x-test-verification-expires-now') === 'yes'
                ? Date.now()
                : Date.now() + 60_000
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
app.use('/shared', sharedRouter);

function authenticatedRequest() {
    return request(app)
        .post(`/files/shared/${context.token}/download`)
        .set('x-test-user', 'yes')
        .set('x-csrf-token', 'route-test-csrf');
}

function ordinaryDownloadRequest() {
    return request(app)
        .get(`/files/download/${context.fileId}`)
        .set('x-test-user', 'yes');
}

function sharedPageRequest() {
    return request(app)
        .get(`/files/shared/${context.token}`)
        .set('x-test-user', 'yes');
}

function assertNoFileBytes(response) {
    assert.ok(response.status >= 400, 'expected a non-success error response');
    assert.equal(response.headers['content-disposition'], undefined);
    assert.notEqual(response.headers['content-type']?.split(';')[0], 'application/octet-stream');

    const responseContent = Buffer.isBuffer(response.body)
        ? response.body
        : Buffer.from(response.text || JSON.stringify(response.body || {}));
    assert.ok(responseContent.length > 0, 'expected a non-empty error response');
    assert.equal(responseContent.includes(plaintext), false);
    assert.equal(responseContent.includes(plaintext.subarray(0, 12)), false);
    assert.equal(responseContent.includes(plaintext.subarray(-12)), false);
    assert.ok(
        Boolean(response.text || response.body?.error),
        'expected a textual or JSON error response rather than a file payload'
    );
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

test('actual ordinary-download route verifies the plaintext SHA-256 and returns the file', async () => {
    reset();
    const response = await ordinaryDownloadRequest().buffer(true);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, plaintext);
    assert.equal(context.storageDownloads, 1);
    assert.equal(context.fileQueries.length, 1);
    assert.equal(String(context.fileQueries[0].ownerId), String(context.user._id));
});

test('ordinary-download route blocks tampered ciphertext before sending file bytes', async () => {
    reset();
    context.ciphertext = Buffer.from(context.ciphertext);
    context.ciphertext[0] ^= 0x01;

    const response = await ordinaryDownloadRequest();

    assert.equal(response.status, 500);
    assertNoFileBytes(response);
    assert.equal(context.storageDownloads, 1);
});

test('ordinary-download route blocks missing, malformed, and incorrect SHA-256 metadata', async (t) => {
    const cases = [
        ['missing', undefined],
        ['malformed', 'not-a-sha256-digest'],
        ['valid format but incorrect', '0'.repeat(64)]
    ];

    for (const [label, digest] of cases) {
        await t.test(label, async () => {
            reset();
            context.file.integrity = digest === undefined ? {} : { sha256: digest };

            const response = await ordinaryDownloadRequest();

            assert.equal(response.status, 500);
            assertNoFileBytes(response);
            assert.equal(context.storageDownloads, 1);
        });
    }
});

test('shared-download route blocks tampered ciphertext before acquiring a reservation', async () => {
    reset();
    context.ciphertext = Buffer.from(context.ciphertext);
    context.ciphertext[0] ^= 0x01;

    const response = await authenticatedRequest();

    assert.equal(response.status, 500);
    assertNoFileBytes(response);
    assert.equal(context.acquisitions.length, 0);
    assert.equal(context.settlements.length, 0);
});

test('shared-download route blocks missing, malformed, and incorrect SHA-256 metadata before reservation', async (t) => {
    const cases = [
        ['missing', undefined],
        ['malformed', 'not-a-sha256-digest'],
        ['valid format but incorrect', '0'.repeat(64)]
    ];

    for (const [label, digest] of cases) {
        await t.test(label, async () => {
            reset();
            context.file.integrity = digest === undefined ? {} : { sha256: digest };

            const response = await authenticatedRequest();

            assert.equal(response.status, 500);
            assertNoFileBytes(response);
            assert.equal(context.acquisitions.length, 0);
            assert.equal(context.settlements.length, 0);
            assert.equal(context.share.downloadCount, 0);
        });
    }
});

test('public shared-file page rejects missing, malformed, and mismatched SHA-256 metadata', async (t) => {
    const cases = [
        ['missing', undefined, 'Integrity verification unavailable'],
        ['malformed', 'not-a-sha256-digest', 'Integrity verification unavailable'],
        ['valid format but mismatched', '0'.repeat(64), 'Integrity verification failed']
    ];

    for (const [label, digest, expectedMessage] of cases) {
        await t.test(label, async () => {
            reset();
            context.file.integrity = digest === undefined ? {} : { sha256: digest };

            const response = await sharedPageRequest();

            assert.equal(response.status, 500);
            assert.match(response.text, new RegExp(expectedMessage));
            assertNoFileBytes(response);
            assert.equal(context.storageDownloads, 1);
            assert.equal(context.acquisitions.length, 0);
            assert.equal(context.share.downloadCount, 0);
        });
    }
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

test('password verification is rejected at its exact expiry instant', async () => {
    reset({ share: { passwordHash: 'bcrypt-hash-placeholder' } });
    const fixedNow = 1_800_000_000_000;
    const originalNow = Date.now;
    Date.now = () => fixedNow;

    try {
        const response = await authenticatedRequest()
            .set('x-test-verified-share', 'yes')
            .set('x-test-verification-expires-now', 'yes');

        assert.equal(response.status, 403);
        assert.equal(context.acquisitions.length, 0);
        assert.equal(context.storageDownloads, 0);
    } finally {
        Date.now = originalNow;
    }
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

test('another authenticated user cannot download an ordinary file by manipulating its ID', async () => {
    reset();
    const response = await request(app)
        .get(`/files/download/${context.fileId}`)
        .set('x-test-other-user', 'yes');

    assert.equal(response.status, 404);
    assertNoFileBytes(response);
    assert.equal(context.fileQueries.length, 1);
    assert.equal(String(context.fileQueries[0].ownerId), String(context.otherUser._id));
    assert.equal(context.storageDownloads, 0);
});

test('another authenticated user cannot delete a file by manipulating its ID', async () => {
    reset();
    const response = await request(app)
        .delete(`/files/${context.fileId}`)
        .set('x-test-other-user', 'yes')
        .set('x-csrf-token', 'route-test-csrf');

    assert.equal(response.status, 404);
    assert.equal(context.fileQueries.length, 1);
    assert.equal(String(context.fileQueries[0].ownerId), String(context.otherUser._id));
    assert.equal(context.storageRemovals, 0);
    assert.equal(context.fileDeletions, 0);
    assert.equal(context.shareDeletions, 0);
});

test('another authenticated user cannot create a share for someone else’s file', async () => {
    reset();
    const response = await request(app)
        .post(`/files/share/${context.fileId}`)
        .set('x-test-other-user', 'yes')
        .set('x-csrf-token', 'route-test-csrf')
        .send({
            ownerId: String(context.ownerId),
            password: 'test-password-value'
        });

    assert.equal(response.status, 404);
    assert.equal(context.fileQueries.length, 1);
    assert.equal(String(context.fileQueries[0].ownerId), String(context.otherUser._id));
    assert.equal(context.shareCreations, 0);
    assert.equal(context.shareMutations, 0);
});

test('another authenticated user cannot revoke someone else’s share by manipulating its ID', async () => {
    reset();
    const response = await request(app)
        .delete(`/shared/${context.shareId}`)
        .set('x-test-other-user', 'yes')
        .set('x-csrf-token', 'route-test-csrf');

    assert.equal(response.status, 404);
    assert.equal(context.shareMutationQueries.length, 1);
    assert.equal(String(context.shareMutationQueries[0].ownerId), String(context.otherUser._id));
    assert.equal(context.shareMutations, 0);
    assert.equal(context.share.revokedAt, null);
});

test.after(() => {
    if (originalMasterKey === undefined) delete process.env.MASTER_ENCRYPTION_KEY;
    else process.env.MASTER_ENCRYPTION_KEY = originalMasterKey;
});
