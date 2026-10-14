'use strict';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const modelPath = require.resolve('../models/auditlog');
const servicePath = require.resolve('../services/auditLogService');
const originalModelModule = require.cache[modelPath];
const originalServiceModule = require.cache[servicePath];

const modelState = {
    created: [],
    createError: null,
    readbackError: null,
    readbackResult: null
};

const auditModelMock = {
    db: { name: 'isolated-unit-test-db' },
    collection: { name: 'auditLogs' },
    async create(document) {
        modelState.created.push(document);
        if (modelState.createError) throw modelState.createError;
        return { _id: 'audit-entry-id', action: document.action };
    },
    findById(id) {
        assert.equal(id, 'audit-entry-id');
        return {
            lean: async () => {
                if (modelState.readbackError) throw modelState.readbackError;
                return modelState.readbackResult;
            }
        };
    }
};

let auditLogService;

before(() => {
    const mockedModule = new Module(modelPath, module);
    mockedModule.filename = modelPath;
    mockedModule.loaded = true;
    mockedModule.exports = auditModelMock;
    require.cache[modelPath] = mockedModule;
    delete require.cache[servicePath];
    auditLogService = require('../services/auditLogService');
});

after(() => {
    if (originalModelModule) require.cache[modelPath] = originalModelModule;
    else delete require.cache[modelPath];
    if (originalServiceModule) require.cache[servicePath] = originalServiceModule;
    else delete require.cache[servicePath];
});

function resetModelState() {
    modelState.created = [];
    modelState.createError = null;
    modelState.readbackError = null;
    modelState.readbackResult = {
        _id: 'audit-entry-id',
        action: 'login_failed',
        status: 'failed'
    };
}

function requestWithSensitiveFields() {
    return {
        session: {
            id: 'session-id-sensitive',
            user: { id: 'user-id', username: 'test_user' }
        },
        sessionID: 'session-id-sensitive',
        ip: '192.0.2.20',
        body: {
            password: 'password-sensitive',
            csrfToken: 'csrf-sensitive'
        },
        cookies: { 'cryptiva.sid': 'cookie-sensitive' },
        get(name) {
            return name.toLowerCase() === 'user-agent'
                ? 'audit-unit-test-agent'
                : '';
        }
    };
}

async function captureConsole(callback) {
    const originalLog = console.log;
    const originalError = console.error;
    const entries = [];
    console.log = (...args) => entries.push(['log', ...args]);
    console.error = (...args) => entries.push(['error', ...args]);
    try {
        return { result: await callback(), entries };
    } finally {
        console.log = originalLog;
        console.error = originalError;
    }
}

test('login failure audit event persists selected fields without request secrets', async () => {
    resetModelState();
    const req = requestWithSensitiveFields();
    const { result, entries } = await captureConsole(() =>
        auditLogService.logLoginFailed(req, 'attempted_user')
    );

    assert.equal(result.action, 'login_failed');
    assert.equal(result.status, 'failed');
    assert.equal(modelState.created.length, 1);
    const persisted = modelState.created[0];
    assert.equal(persisted.userId, null);
    assert.equal(persisted.username, 'attempted_user');
    assert.equal(persisted.ipAddress, '192.0.2.20');
    assert.equal(persisted.userAgent, 'audit-unit-test-agent');
    assert.equal(persisted.description, 'Login attempt failed.');
    assert.deepEqual(Object.keys(persisted).sort(), [
        'action', 'description', 'fileId', 'fileName', 'ipAddress', 'metadata',
        'shareId', 'status', 'userAgent', 'userId', 'username'
    ]);
    const persistedText = JSON.stringify(persisted);
    for (const secret of [
        'session-id-sensitive',
        'password-sensitive',
        'csrf-sensitive',
        'cookie-sensitive'
    ]) {
        assert.equal(persistedText.includes(secret), false);
        assert.equal(JSON.stringify(entries).includes(secret), false);
    }
});

test('audit persistence failure is logged and remains best effort', async () => {
    resetModelState();
    modelState.createError = new Error('simulated audit persistence failure');

    const { result, entries } = await captureConsole(() =>
        auditLogService.writeAuditLog(requestWithSensitiveFields(), {
            action: 'security_event',
            status: 'failed',
            description: 'Audit persistence test.'
        })
    );

    assert.equal(result, null);
    assert.equal(entries.filter(([level]) => level === 'error').length, 2);
    assert.equal(entries[0][1], '[AUDIT] Persistence or read-back verification failed:');
    assert.match(entries[1][1].message, /simulated audit persistence failure/);
});

test('audit read-back failure is caught after the insert', async () => {
    resetModelState();
    modelState.readbackError = new Error('simulated audit read-back failure');

    const { result, entries } = await captureConsole(() =>
        auditLogService.writeAuditLog(requestWithSensitiveFields(), {
            action: 'security_event',
            status: 'failed',
            description: 'Audit read-back test.'
        })
    );

    assert.equal(modelState.created.length, 1);
    assert.equal(result, null);
    assert.equal(entries.filter(([level]) => level === 'error').length, 2);
    const errorEntries = entries.filter(([level]) => level === 'error');
    assert.equal(errorEntries[0][1], '[AUDIT] Persistence or read-back verification failed:');
    assert.match(errorEntries[1][1].message, /simulated audit read-back failure/);
});
