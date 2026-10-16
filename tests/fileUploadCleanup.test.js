'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const Module = require('node:module');
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');

process.env.MASTER_ENCRYPTION_KEY = cryptoKey();

function cryptoKey() {
    return require('node:crypto').randomBytes(32).toString('base64');
}

const context = {
    scenario: {},
    validationCalls: 0,
    scanCalls: 0,
    uploadCalls: 0,
    records: [],
    storageRemovals: []
};

const testUserId = new mongoose.Types.ObjectId();
const User = {
    async findById(id) {
        return String(id) === String(testUserId)
            ? { _id: testUserId, status: 'active' }
            : null;
    }
};

const File = {
    async create(fields) {
        const call = context.records.length + 1;
        if (context.scenario.createFailureOn === call) {
            throw new Error('simulated metadata creation failure');
        }

        const record = {
            ...fields,
            createdAt: new Date(),
            async save() {
                if (context.scenario.activationSaveFailure && this.lifecycle === 'active') {
                    throw new Error('simulated activation persistence failure');
                }
            }
        };
        context.records.push(record);
        return record;
    },
    async deleteOne(filter) {
        context.records = context.records.filter(
            (record) => String(record._id) !== String(filter._id)
        );
        return { deletedCount: 1 };
    },
    async updateOne() {
        return { modifiedCount: 1 };
    }
};

const ShareLink = {
    async deleteMany() {
        return { deletedCount: 0 };
    }
};

const supabase = {
    storage: {
        from() {
            return {
                async upload() {
                    context.uploadCalls += 1;
                    if (context.scenario.storageFailureOn === context.uploadCalls) {
                        return { error: { message: 'simulated storage failure' } };
                    }
                    return { error: null };
                },
                async remove(paths) {
                    context.storageRemovals.push(...paths);
                    return { error: null };
                }
            };
        }
    }
};

const auditLogService = new Proxy({}, {
    get: () => async () => undefined
});

const actualCryptoService = require('../services/cryptoService');
const cryptoService = {
    ...actualCryptoService,
    encryptData(...args) {
        if (context.scenario.encryptionFailure) {
            throw new Error('simulated encryption failure');
        }
        return actualCryptoService.encryptData(...args);
    }
};

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
installModuleMock('../services/cryptoService', cryptoService);
installModuleMock('../services/fileValidationService', {
    async validateUploadedFile(originalName) {
        context.validationCalls += 1;
        if (context.scenario.validationFailureOn === context.validationCalls) {
            throw new Error('simulated validation rejection');
        }
        return {
            originalName,
            size: 12,
            detectedMimeType: 'text/plain',
            extension: '.txt',
            category: 'document'
        };
    }
});
installModuleMock('../services/malwareScanService', {
    async scanFile() {
        context.scanCalls += 1;
        if (context.scenario.scanFailureOn === context.scanCalls) {
            throw new Error('Malware scanner failed.');
        }
        return {
            clean: !context.scenario.infectedOn?.includes(context.scanCalls),
            infected: context.scenario.infectedOn?.includes(context.scanCalls) || false,
            error: false
        };
    }
});
installModuleMock('../middleware/auth', {
    requireAuth(req, res, next) {
        if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
        req.authUser = req.session.user;
        return next();
    }
});

const router = require('../routes/files');
const app = express();
app.use((req, res, next) => {
    req.session = { user: { id: String(testUserId) } };
    next();
});
app.use('/files', router);

const tempDirectory = path.join(__dirname, '..', 'tmp');

function resetScenario(scenario = {}) {
    context.scenario = scenario;
    context.validationCalls = 0;
    context.scanCalls = 0;
    context.uploadCalls = 0;
    context.records = [];
    context.storageRemovals = [];
}

async function listUploadFiles() {
    try {
        return (await fs.readdir(tempDirectory)).filter((name) => name.endsWith('.upload'));
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
}

async function sendUpload(names) {
    let uploadRequest = request(app)
        .post('/files/upload')
        .set('x-test-upload', 'true');
    for (const name of names) {
        uploadRequest = uploadRequest.attach('files', Buffer.from(`test contents for ${name}`), name);
    }
    return uploadRequest;
}

async function withUploadAndCleanupAssertion(names) {
    const before = new Set(await listUploadFiles());
    try {
        const response = await sendUpload(names);
        const created = (await listUploadFiles()).filter((name) => !before.has(name));
        assert.deepEqual(created, [], 'request temporary uploads should be removed');
        return response;
    } finally {
        // Remove only files created by this test if an assertion catches a regression.
        for (const name of await listUploadFiles()) {
            if (!before.has(name)) {
                await fs.unlink(path.join(tempDirectory, name)).catch((error) => {
                    if (error.code !== 'ENOENT') throw error;
                });
            }
        }
    }
}

test('successful single-file and multi-file uploads remove their plaintext temporaries', async () => {
    resetScenario();
    const single = await withUploadAndCleanupAssertion(['one.txt']);
    assert.equal(single.status, 200);
    assert.equal(single.body.files.length, 1);

    resetScenario();
    const batch = await withUploadAndCleanupAssertion(['one.txt', 'two.txt']);
    assert.equal(batch.status, 200);
    assert.equal(batch.body.files.length, 2);
});

test('validation rejection and malware detection both remove temporary uploads', async () => {
    resetScenario({ validationFailureOn: 1 });
    const invalid = await withUploadAndCleanupAssertion(['invalid.txt']);
    assert.equal(invalid.status, 500);

    resetScenario({ infectedOn: [1] });
    const infected = await withUploadAndCleanupAssertion(['infected.txt']);
    assert.equal(infected.status, 400);
    assert.match(infected.body.error, /security scanner/);
});

test('scanner failure removes its temporary upload', async () => {
    resetScenario({ scanFailureOn: 1 });
    const response = await withUploadAndCleanupAssertion(['scanner-error.txt']);
    assert.equal(response.status, 503);
    assert.match(response.body.error, /scanning is temporarily unavailable/);
});

test('encryption and unexpected metadata failures remove their temporary uploads', async () => {
    resetScenario({ encryptionFailure: true });
    const encryption = await withUploadAndCleanupAssertion(['encryption-error.txt']);
    assert.equal(encryption.status, 500);

    resetScenario({ createFailureOn: 1 });
    const metadata = await withUploadAndCleanupAssertion(['metadata-error.txt']);
    assert.equal(metadata.status, 500);
});

test('storage failure removes temporary data and preserves rollback behavior', async () => {
    resetScenario({ storageFailureOn: 1 });
    const response = await withUploadAndCleanupAssertion(['storage-error.txt']);
    assert.equal(response.status, 500);
    assert.match(response.body.error, /upload failed/i);
    assert.equal(context.records.length, 0);
    assert.equal(context.storageRemovals.length, 1);
});

test('partial multi-file failure cleans all request temporaries and rolls back earlier files', async () => {
    resetScenario({ scanFailureOn: 2 });
    const response = await withUploadAndCleanupAssertion(['first.txt', 'second.txt']);
    assert.equal(response.status, 503);
    assert.equal(context.records.length, 0);
    assert.equal(context.storageRemovals.length, 1);
});

test('cleanup failure does not replace the original processing failure', async () => {
    resetScenario({ scanFailureOn: 1 });
    const fsDescriptor = Object.getOwnPropertyDescriptor(fs, 'unlink');
    const originalUnlink = fs.unlink;
    const errors = [];
    const originalConsoleError = console.error;
    const before = new Set(await listUploadFiles());

    try {
        Object.defineProperty(fs, 'unlink', {
            configurable: true,
            value: async () => {
                const error = new Error('simulated cleanup failure');
                error.code = 'EACCES';
                throw error;
            }
        });
        console.error = (...args) => errors.push(args);

        const response = await sendUpload(['cleanup-error.txt']);
        assert.equal(response.status, 503);
        assert.match(response.body.error, /scanning is temporarily unavailable/);
        assert.ok(errors.some((args) => String(args[0]).includes('Temporary file cleanup failed')));
    } finally {
        console.error = originalConsoleError;
        if (fsDescriptor) Object.defineProperty(fs, 'unlink', fsDescriptor);
        else Object.defineProperty(fs, 'unlink', { configurable: true, value: originalUnlink });

        for (const name of await listUploadFiles()) {
            if (!before.has(name)) {
                await originalUnlink(path.join(tempDirectory, name)).catch((error) => {
                    if (error.code !== 'ENOENT') throw error;
                });
            }
        }
    }
});
