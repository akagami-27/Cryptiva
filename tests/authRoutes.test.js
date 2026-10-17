'use strict';

const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const express = require('express');
const bcrypt = require('bcryptjs');
const request = require('supertest');
process.env.JWT_SECRET = process.env.JWT_SECRET || require('node:crypto').randomBytes(48).toString('base64');

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
        async findOne(query) {
            if (query.username === 'route_test_user') return {
                _id: { toString: () => 'test-user-id' },
                username: 'route_test_user',
                status: 'active',
                authTokenVersion: 0,
                passwordHash
            };
        },
        async create(user) { routeState.createdUser = user; return user; },
        async updateOne(filter, update) {
            routeState.tokenVersionUpdates.push({ filter, update });
            if (routeState.tokenVersionError) throw routeState.tokenVersionError;
            return { acknowledged: true, modifiedCount: 1 };
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
    replaceModule('../middleware/auth', {
        requireAuth(req, res, next) { req.authUser = { id: 'test-user-id' }; next(); },
        redirectIfAuth(req, res, next) { next(); }
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
        tokenVersionError: null,
        flashMessages: [],
        lastRequest: null,
        createdUser: null,
        tokenVersionUpdates: []
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
    assert.deepEqual(routeState.tokenVersionUpdates[0], {
        filter: { _id: 'test-user-id' },
        update: { $inc: { authTokenVersion: 1 } }
    });
    assertSessionCookieCleared(response);
    assert.ok((response.headers['set-cookie'] || []).some((cookie) =>
        /^cryptiva\.auth=;/.test(cookie) && /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie) && /Path=\//i.test(cookie)
    ));
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
    assert.equal(routeState.tokenVersionUpdates.length, 1);
    assertSessionCookieCleared(response);
    assert.equal(routeState.lastRequest.session, undefined);
    assert.equal(capturedErrors.length, 1);
    assert.equal(capturedErrors[0][0], 'Logout error:');
    assert.equal(routeState.flashMessages.some(({ message }) => /logged out successfully/i.test(message)), false);
});

test('logout token-version write failure does not claim revocation or successful logout', async () => {
    routeState.tokenVersionError = new Error('simulated token-version write failure');
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
    assert.equal(routeState.tokenVersionUpdates.length, 1);
    assert.equal(routeState.destroyCalls, 0);
    assertSessionCookieCleared(response);
    assert.ok((response.headers['set-cookie'] || []).some((cookie) => /^cryptiva\.auth=;/.test(cookie)));
    assert.equal(routeState.flashMessages.some(({ message }) => /logged out successfully/i.test(message)), false);
    assert.equal(capturedErrors[0][0], 'Logout error:');
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
    assert.equal(response.headers.location, '/dashboard');
    assert.equal(routeState.regenerateCalls, 1);
    assert.equal(routeState.saveCalls, 1);
    assert.equal(routeState.lastRequest.session.user.id, 'test-user-id');
    const authCookie = (response.headers['set-cookie'] || []).find((cookie) => /^cryptiva\.auth=/.test(cookie));
    assert.ok(authCookie, 'successful login sets the HttpOnly JWT cookie');
    assert.match(authCookie, /HttpOnly/i);
    assert.match(authCookie, /SameSite=Lax/i);
    assert.match(authCookie, /Max-Age=900/i);
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

test('unknown usernames and incorrect passwords do not receive a JWT', async (t) => {
    await t.test('unknown user', async () => {
        const response = await request(app).post('/login').type('form')
            .send({ username: 'unknown_user', password: 'wrong-password' }).redirects(0);
        assert.equal(response.status, 302);
        assert.equal(response.headers.location, '/login');
        assert.equal((response.headers['set-cookie'] || []).some((cookie) => /^cryptiva\.auth=/.test(cookie)), false);
        assert.equal(routeState.regenerateCalls, 0);
    });

    await t.test('incorrect password', async () => {
        const response = await request(app).post('/login').type('form')
            .send({ username: 'route_test_user', password: 'incorrect-password' }).redirects(0);
        assert.equal(response.status, 302);
        assert.equal(response.headers.location, '/login');
        assert.equal((response.headers['set-cookie'] || []).some((cookie) => /^cryptiva\.auth=/.test(cookie)), false);
        assert.equal(routeState.regenerateCalls, 0);
    });
});

test('registration validates, hashes the password, and does not auto-issue a JWT', async () => {
    const response = await request(app)
        .post('/register')
        .type('form')
        .send({ username: 'new_user', password: 'registration-password', confirmPassword: 'registration-password' })
        .redirects(0);

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/login');
    assert.equal(routeState.createdUser.username, 'new_user');
    assert.notEqual(routeState.createdUser.passwordHash, 'registration-password');
    assert.equal(await bcrypt.compare('registration-password', routeState.createdUser.passwordHash), true);
    assert.equal((response.headers['set-cookie'] || []).some((cookie) => /^cryptiva\.auth=/.test(cookie)), false);
});

test('registration rejects missing required fields and mismatched password confirmation', async () => {
    const missing = await request(app).post('/register').type('form').send({}).redirects(0);
    assert.equal(missing.status, 302);
    assert.equal(missing.headers.location, '/register');
    assert.equal(routeState.createdUser, null);

    const mismatch = await request(app).post('/register').type('form').send({
        username: 'new_user', password: 'registration-password', confirmPassword: 'different-password'
    }).redirects(0);
    assert.equal(mismatch.status, 302);
    assert.equal(mismatch.headers.location, '/register');
    assert.equal(routeState.createdUser, null);
});

test('registration reports a duplicate username without creating an account', async () => {
    routeState.existingUsername = 'taken_user';
    const originalFindOne = require.cache[require.resolve('../models/user')].exports.findOne;
    require.cache[require.resolve('../models/user')].exports.findOne = async (query) =>
        query.username === 'taken_user' ? { username: 'taken_user' } : originalFindOne(query);
    try {
        const response = await request(app).post('/register').type('form').send({
            username: 'taken_user', password: 'registration-password', confirmPassword: 'registration-password'
        }).redirects(0);
        assert.equal(response.status, 302);
        assert.equal(response.headers.location, '/register');
        assert.equal(routeState.createdUser, null);
    } finally {
        require.cache[require.resolve('../models/user')].exports.findOne = originalFindOne;
    }
});
