'use strict';

const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const originalModules = new Map();
let routeState;
let app;
let passwordHash;
let authRouter;

function replaceModule(relativePath, exports) {
    const filename = require.resolve(relativePath);
    originalModules.set(filename, require.cache[filename]);
    const mockedModule = new Module(filename, module);
    mockedModule.filename = filename;
    mockedModule.loaded = true;
    mockedModule.exports = exports;
    require.cache[filename] = mockedModule;
}

function createSession(req, initial = {}) {
    const session = {
        ...initial,
        regenerate(callback) {
            routeState.regenerateCalls += 1;
            req.session = createSession(req);
            callback(null);
        },
        save(callback) {
            routeState.saveCalls += 1;
            callback(routeState.saveError);
        },
        destroy(callback) {
            routeState.destroyCalls += 1;
            delete req.session;
            callback(routeState.destroyError);
        }
    };
    return session;
}

before(async () => {
    passwordHash = await bcrypt.hash('route-test-password', 4);

    const userModel = {
        async findOne() {
            return {
                _id: { toString: () => 'test-user-id' },
                username: 'route_test_user',
                status: 'active',
                passwordHash
            };
        }
    };
    const auditLogService = new Proxy({}, {
        get: () => async () => undefined
    });
    const passThroughLimiter = (req, res, next) => next();

    replaceModule('../models/user', userModel);
    replaceModule('../services/auditLogService', auditLogService);
    replaceModule('../middleware/rateLimit', {
        loginRateLimiter: passThroughLimiter,
        sharePasswordRateLimiter: passThroughLimiter
    });

    authRouter = require('../routes/auth');
});

beforeEach(() => {
    routeState = {
        regenerateCalls: 0,
        saveCalls: 0,
        destroyCalls: 0,
        saveError: null,
        destroyError: null,
        flashMessages: [],
        lastRequest: null
    };

    app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, res, next) => {
        routeState.lastRequest = req;
        req.flash = (type, message) => routeState.flashMessages.push({ type, message });
        req.session = createSession(req, { user: { id: 'test-user-id' } });
        next();
    });
    app.use(authRouter);
});

after(() => {
    for (const [filename, cachedModule] of originalModules) {
        if (cachedModule) {
            require.cache[filename] = cachedModule;
        } else {
            delete require.cache[filename];
        }
    }
    delete require.cache[require.resolve('../routes/auth')];
});

function assertSessionCookieCleared(response) {
    const setCookie = response.headers['set-cookie'] || [];
    assert.ok(setCookie.some((cookie) =>
        /^cryptiva\.sid=;/.test(cookie) &&
        /HttpOnly/i.test(cookie) &&
        /SameSite=Lax/i.test(cookie) &&
        /Path=\//i.test(cookie) &&
        /Expires=/i.test(cookie)
    ));
}

test('logout destroys the session and clears the session cookie', async () => {
    const response = await request(app).post('/logout').redirects(0);

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/login');
    assert.equal(routeState.destroyCalls, 1);
    assert.equal(routeState.lastRequest.session, undefined);
    assertSessionCookieCleared(response);
});

test('logout store failure clears the cookie without claiming session invalidation', async () => {
    routeState.destroyError = new Error('simulated store failure');
    const originalConsoleError = console.error;
    const capturedErrors = [];
    console.error = (...args) => capturedErrors.push(args);

    let response;
    try {
        response = await request(app).post('/logout').redirects(0);
    } finally {
        console.error = originalConsoleError;
    }

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/login');
    assert.equal(routeState.destroyCalls, 1);
    assertSessionCookieCleared(response);
    assert.equal(routeState.lastRequest.session, undefined);
    assert.equal(capturedErrors.length, 1);
    assert.equal(capturedErrors[0][0], 'Logout error:');
    assert.equal(routeState.flashMessages.some(({ message }) => /logged out successfully/i.test(message)), false);
});

test('successful login regenerates and explicitly saves the authenticated session', async () => {
    routeState.lastRequest = null;
    app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, res, next) => {
        routeState.lastRequest = req;
        req.flash = (type, message) => routeState.flashMessages.push({ type, message });
        req.session = createSession(req);
        next();
    });
    app.use(authRouter);

    const response = await request(app)
        .post('/login')
        .type('form')
        .send({ username: 'route_test_user', password: 'route-test-password' })
        .redirects(0);

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/react/dashboard');
    assert.equal(routeState.regenerateCalls, 1);
    assert.equal(routeState.saveCalls, 1);
    assert.equal(routeState.lastRequest.session.user.id, 'test-user-id');
});

test('login save failure does not redirect as a successful login', async () => {
    routeState.saveError = new Error('simulated session save failure');
    app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, res, next) => {
        routeState.lastRequest = req;
        req.flash = (type, message) => routeState.flashMessages.push({ type, message });
        req.session = createSession(req);
        next();
    });
    app.use(authRouter);

    const originalConsoleError = console.error;
    console.error = () => undefined;
    let response;
    try {
        response = await request(app)
            .post('/login')
            .type('form')
            .send({ username: 'route_test_user', password: 'route-test-password' })
            .redirects(0);
    } finally {
        console.error = originalConsoleError;
    }

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/login');
    assert.equal(routeState.regenerateCalls, 1);
    assert.equal(routeState.saveCalls, 1);
    assert.ok(routeState.flashMessages.some(({ message }) => message === 'Unable to process login.'));
});
