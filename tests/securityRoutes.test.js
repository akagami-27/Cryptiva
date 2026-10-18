'use strict';

const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const express = require('express');
const bcrypt = require('bcryptjs');
const request = require('supertest');

process.env.JWT_SECRET ||= crypto.randomBytes(48).toString('base64');

const USER_ID = '0123456789abcdef01234567';
const CSRF_TOKEN = 'security-route-test-csrf-token';
const originalModules = new Map();
let routeState;
let app;
let securityRouter;
let requireAuth;
let passwordHash;

function replaceModule(relativePath, exports) {
    const filename = require.resolve(relativePath);
    originalModules.set(filename, require.cache[filename]);
    const mockedModule = new Module(filename, module);
    mockedModule.filename = filename;
    mockedModule.loaded = true;
    mockedModule.exports = exports;
    require.cache[filename] = mockedModule;
}

function makeUser() {
    return {
        _id: USER_ID,
        username: 'security_test_user',
        status: 'active',
        authTokenVersion: routeState.authTokenVersion,
        passwordHash: routeState.passwordHash
    };
}

before(async () => {
    passwordHash = await bcrypt.hash('CurrentPassword123', 4);

    const userModel = {
        findById() {
            const query = Promise.resolve(makeUser());
            query.select = async () => {
                const user = makeUser();
                delete user.passwordHash;
                return user;
            };
            return query;
        },
        async findOneAndUpdate(filter, update, options) {
            routeState.updateCalls.push({ filter, update, options });
            if (routeState.updateError) throw routeState.updateError;
            if (routeState.concurrentLogout) routeState.authTokenVersion += 1;
            const versionMatches = filter.authTokenVersion !== undefined
                ? filter.authTokenVersion === routeState.authTokenVersion
                : filter.$or?.some((condition) =>
                    condition.authTokenVersion === routeState.authTokenVersion ||
                    (condition.authTokenVersion === null && routeState.authTokenVersion === 0)
                );
            if (
                filter._id !== USER_ID ||
                filter.passwordHash !== routeState.passwordHash ||
                !versionMatches
            ) {
                return null;
            }

            routeState.passwordHash = update.$set.passwordHash;
            if (update.$set.authTokenVersion !== undefined) {
                routeState.authTokenVersion = update.$set.authTokenVersion;
            } else {
                routeState.authTokenVersion += update.$inc.authTokenVersion;
            }
            return makeUser();
        }
    };

    replaceModule('../models/user', userModel);
    replaceModule('../services/auditLogService', {
        async writeAuditLog() { return { _id: 'test-audit-entry' }; }
    });

    // Use the real JWT authentication middleware against the controlled user fixture.
    ({ requireAuth } = require('../middleware/auth'));
    securityRouter = require('../routes/security');
});

beforeEach(() => {
    routeState = {
        authTokenVersion: 3,
        passwordHash,
        updateCalls: [],
        updateError: null,
        concurrentLogout: false
    };

    app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    app.use((req, res, next) => {
        req.session = {
            csrfToken: CSRF_TOKEN,
            user: { id: USER_ID, username: 'security_test_user' }
        };
        next();
    });
    app.use(require('../middleware/csrf').requireCsrf);
    app.use('/security', securityRouter);
    app.get('/auth-check', requireAuth, (req, res) => {
        res.json({ authenticated: true, username: req.authUser.username });
    });
});

after(() => {
    for (const [filename, cachedModule] of originalModules) {
        if (cachedModule) require.cache[filename] = cachedModule;
        else delete require.cache[filename];
    }
    delete require.cache[require.resolve('../routes/security')];
    delete require.cache[require.resolve('../middleware/auth')];
});

function authCookie(version = routeState.authTokenVersion) {
    const { signAccessToken, COOKIE_NAME } = require('../services/jwtService');
    const token = signAccessToken({
        _id: USER_ID,
        authTokenVersion: version
    }).token;
    return `${COOKIE_NAME}=${encodeURIComponent(token)}`;
}

function postPasswordChange({
    currentPassword = 'CurrentPassword123',
    newPassword = 'NewPassword456',
    confirmPassword = newPassword,
    cookie = authCookie()
} = {}) {
    return request(app)
        .post('/security/change-password')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', CSRF_TOKEN)
        .type('form')
        .send({ currentPassword, newPassword, confirmPassword });
}

function getJwtCookie(response) {
    const cookie = (response.headers['set-cookie'] || []).find((value) =>
        value.startsWith('cryptiva.auth=')
    );
    assert.ok(cookie, 'response should set the authenticated JWT cookie');
    const value = cookie.split(';', 1)[0].slice('cryptiva.auth='.length);
    return decodeURIComponent(value);
}

test('password change rotates JWT version and keeps this browser authenticated with a fresh cookie', async () => {
    const oldCookie = authCookie(3);
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    let response;
    try {
        response = await postPasswordChange({ cookie: oldCookie });
    } finally {
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalNodeEnv;
    }

    assert.equal(response.status, 200);
    assert.equal(routeState.authTokenVersion, 4);
    assert.equal(routeState.updateCalls.length, 1);
    assert.deepEqual(routeState.updateCalls[0].filter, {
        _id: USER_ID,
        passwordHash,
        authTokenVersion: 3
    });
    assert.deepEqual(routeState.updateCalls[0].update.$inc, { authTokenVersion: 1 });
    assert.deepEqual(routeState.updateCalls[0].options, { new: true, runValidators: true });
    assert.equal(await bcrypt.compare('NewPassword456', routeState.passwordHash), true);
    assert.equal(response.body.success, true);
    assert.equal(Object.hasOwn(response.body, 'token'), false);

    const freshToken = getJwtCookie(response);
    const { verifyAccessToken } = require('../services/jwtService');
    const freshPayload = verifyAccessToken(freshToken);
    assert.equal(freshPayload.ver, 4);

    const setCookie = response.headers['set-cookie'].find((value) => value.startsWith('cryptiva.auth='));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, new RegExp(`Max-Age=${freshPayload.exp - freshPayload.iat}`, 'i'));
    assert.match(setCookie, /Path=\//i);

    const oldTokenResponse = await request(app)
        .get('/auth-check')
        .set('Cookie', oldCookie);
    assert.equal(oldTokenResponse.status, 302);
    assert.equal(oldTokenResponse.headers.location, '/login');

    const currentSessionResponse = await request(app)
        .get('/auth-check')
        .set('Cookie', `cryptiva.auth=${encodeURIComponent(freshToken)}`);
    assert.equal(currentSessionResponse.status, 200);
    assert.deepEqual(currentSessionResponse.body, {
        authenticated: true,
        username: 'security_test_user'
    });
});

test('incorrect current password does not update the password or token version', async () => {
    const response = await postPasswordChange({ currentPassword: 'IncorrectPassword123' });

    assert.equal(response.status, 401);
    assert.equal(routeState.updateCalls.length, 0);
    assert.equal(routeState.authTokenVersion, 3);
    assert.equal(routeState.passwordHash, passwordHash);
    assert.equal((response.headers['set-cookie'] || []).some((value) => value.startsWith('cryptiva.auth=')), false);
});

test('password change initializes an absent or default-zero token version safely', async () => {
    routeState.authTokenVersion = 0;
    const response = await postPasswordChange({ cookie: authCookie(0) });

    assert.equal(response.status, 200);
    assert.equal(routeState.authTokenVersion, 1);
    assert.deepEqual(routeState.updateCalls[0].update.$set.authTokenVersion, 1);
    assert.equal(require('../services/jwtService').verifyAccessToken(getJwtCookie(response)).ver, 1);
});

test('validation failures do not update the password or token version', async (t) => {
    await t.test('password confirmation mismatch', async () => {
        const response = await postPasswordChange({ confirmPassword: 'DifferentPassword789' });
        assert.equal(response.status, 400);
        assert.equal(routeState.updateCalls.length, 0);
        assert.equal(routeState.authTokenVersion, 3);
    });

    await t.test('password strength requirements fail', async () => {
        const response = await postPasswordChange({
            newPassword: 'weakpassword',
            confirmPassword: 'weakpassword'
        });
        assert.equal(response.status, 400);
        assert.equal(routeState.updateCalls.length, 0);
        assert.equal(routeState.authTokenVersion, 3);
        assert.equal(routeState.passwordHash, passwordHash);
    });
});

test('database update failure does not change credentials or issue a replacement JWT', async () => {
    routeState.updateError = new Error('simulated database write failure');
    const originalConsoleError = console.error;
    console.error = () => undefined;

    let response;
    try {
        response = await postPasswordChange();
    } finally {
        console.error = originalConsoleError;
    }

    assert.equal(response.status, 500);
    assert.equal(routeState.authTokenVersion, 3);
    assert.equal(routeState.passwordHash, passwordHash);
    assert.equal((response.headers['set-cookie'] || []).some((value) => value.startsWith('cryptiva.auth=')), false);
});

test('concurrent logout conflict does not issue a replacement JWT', async () => {
    routeState.concurrentLogout = true;
    const response = await postPasswordChange();

    assert.equal(response.status, 409);
    assert.equal(routeState.authTokenVersion, 4);
    assert.equal(routeState.passwordHash, passwordHash);
    assert.equal((response.headers['set-cookie'] || []).some((value) => value.startsWith('cryptiva.auth=')), false);
});
