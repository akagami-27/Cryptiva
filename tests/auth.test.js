
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { requireAuth, redirectIfAuth, hydrateJwtIdentity } = require('../middleware/auth');
const { ensureCsrfToken, requireCsrf } = require('../middleware/csrf');
const User = require('../models/user');
const { signAccessToken } = require('../services/jwtService');
process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('base64');

const originalFindById = User.findById;
function issueTestCookie({ tokenVersion = 0, currentVersion = 0 } = {}) {
    const { token } = signAccessToken({ _id: '0123456789abcdef01234567', authTokenVersion: tokenVersion });
    User.findById = () => ({
        select: async () => ({ _id: { toString: () => 'test-user' }, username: 'test_user', status: 'active', authTokenVersion: currentVersion })
    });
    return `cryptiva.auth=${encodeURIComponent(token)}`;
}

function mockResponse() {
    return {
        statusCode: 200,
        body: null,
        redirectedTo: null,
        locals: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        redirect(path) {
            this.redirectedTo = path;
            return this;
        }
    };
}

function mockRequest({ method = 'GET', session = {}, headers = {}, body = {}, path = '/test' } = {}) {
    return {
        method,
        session,
        headers,
        body,
        path,
        originalUrl: path,
        get(name) {
            return headers[name.toLowerCase()] || '';
        },
        flash() {}
    };
}

test('requireAuth accepts a verified JWT and ignores session-only identity', async () => {
    const cookie = issueTestCookie();
    const req = mockRequest({ session: { user: { id: 'attacker-controlled' } }, headers: { cookie } });
    const res = mockResponse();
    let nextCalled = false;

    await requireAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.redirectedTo, null);
    assert.equal(req.session.user.id, 'test-user');
});

test('requireAuth rejects a session without a JWT', async () => {
    const req = mockRequest({ session: { user: { id: '123' } } });
    const res = mockResponse();

    await requireAuth(req, res, () => assert.fail('next should not run'));

    assert.equal(res.redirectedTo, '/login');
});

test('request hydration clears legacy session identity when there is no JWT', async () => {
    const req = mockRequest({ session: { user: { id: 'legacy-session-user' } } });
    let nextCalled = false;
    await hydrateJwtIdentity(req, mockResponse(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.session.user, undefined);
});

test('requireAuth rejects a JWT issued before logout version rotation', async () => {
    const req = mockRequest({ headers: { cookie: issueTestCookie({ tokenVersion: 0, currentVersion: 1 }) } });
    const res = mockResponse();
    await requireAuth(req, res, () => assert.fail('revoked token must not pass'));
    assert.equal(res.redirectedTo, '/login');
});

test('requireAuth rejects a valid JWT when the account is disabled', async () => {
    const cookie = issueTestCookie();
    User.findById = () => ({
        select: async () => ({
            _id: { toString: () => 'test-user' },
            username: 'test_user',
            status: 'disabled',
            authTokenVersion: 0
        })
    });
    const req = mockRequest({ headers: { cookie } });
    const res = mockResponse();

    await requireAuth(req, res, () => assert.fail('disabled account must not pass'));

    assert.equal(res.redirectedTo, '/login');
    assert.equal(req.authUser, undefined);
});

test('requireAuth propagates account lookup failures without authenticating the session', async () => {
    const cookie = issueTestCookie();
    const databaseError = new Error('simulated account lookup failure');
    User.findById = () => ({ select: async () => { throw databaseError; } });
    const req = mockRequest({
        headers: { cookie },
        session: { user: { id: 'session-only-identity' } }
    });
    let nextError;

    await requireAuth(req, mockResponse(), (error) => { nextError = error; });

    assert.equal(nextError, databaseError);
    assert.equal(req.authUser, undefined);
    assert.equal(req.session.user.id, 'session-only-identity');
});

test('redirectIfAuth redirects a user with a verified JWT', async () => {
    const req = mockRequest({ headers: { cookie: issueTestCookie() } });
    const res = mockResponse();

    await redirectIfAuth(req, res, () => assert.fail('next should not run'));

    assert.equal(res.redirectedTo, '/dashboard');
});

test('redirectIfAuth allows unauthenticated users', async () => {
    const req = mockRequest();
    const res = mockResponse();
    let nextCalled = false;

    await redirectIfAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
});

test.after(() => { User.findById = originalFindById; });

test('ensureCsrfToken creates a 64-character token', () => {
    const req = mockRequest({ session: {} });
    const res = mockResponse();
    let nextCalled = false;

    ensureCsrfToken(req, res, () => { nextCalled = true; });

    assert.match(req.session.csrfToken, /^[a-f0-9]{64}$/);
    assert.equal(res.locals.csrfToken, req.session.csrfToken);
    assert.equal(nextCalled, true);
});

test('ensureCsrfToken rejects missing sessions', () => {
    const req = mockRequest();
    req.session = undefined;

    const res = mockResponse();

    ensureCsrfToken(req, res, () => assert.fail('next should not run'));

    assert.equal(res.statusCode, 500);
    assert.equal(res.body, 'Session is not available.');
});

test('CSRF middleware allows safe GET requests', () => {
    const req = mockRequest({ method: 'GET' });
    const res = mockResponse();
    let nextCalled = false;

    requireCsrf(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
});

test('CSRF middleware rejects POST without a token', () => {
    const req = mockRequest({ method: 'POST', session: { csrfToken: 'abc' } });
    const res = mockResponse();

    requireCsrf(req, res, () => assert.fail('next should not run'));

    assert.equal(res.statusCode, 403);
    assert.equal(res.body, 'Forbidden - invalid or missing CSRF token.');
});

test('CSRF failure logs redact shared-link tokens and omit query strings', async (t) => {
    for (const routeSuffix of ['', '/download']) {
        await t.test(routeSuffix || 'share page', () => {
            const token = 'D'.repeat(43);
            const captured = [];
            const originalConsoleWarn = console.warn;
            console.warn = (message) => captured.push(message);

            try {
                const req = mockRequest({
                    method: 'POST',
                    session: { csrfToken: 'session-value' },
                    path: `/files/shared/${token}${routeSuffix}?password=query-secret`
                });
                requireCsrf(req, mockResponse(), () => {
                    assert.fail('CSRF validation should fail');
                });
            } finally {
                console.warn = originalConsoleWarn;
            }

            const logged = captured.join('\n');
            assert.equal(logged.includes(token), false);
            assert.equal(logged.includes('query-secret'), false);
            assert.match(logged, /POST \/files\/shared\/\[REDACTED\]/);
            if (routeSuffix) assert.match(logged, /\/download/);
        });
    }
});

test('CSRF failure logs redact tokens from malformed shared paths and preserve suffix context', () => {
    const token = 'M'.repeat(43);
    const captured = [];
    const originalConsoleWarn = console.warn;
    console.warn = (message) => captured.push(message);

    try {
        const req = mockRequest({
            method: 'POST',
            session: { csrfToken: 'session-value' },
            path: `/files/shared/${token}/download/extra?password=query-secret`
        });
        requireCsrf(req, mockResponse(), () => {
            assert.fail('CSRF validation should fail');
        });
    } finally {
        console.warn = originalConsoleWarn;
    }

    const logged = captured.join('\n');
    assert.equal(logged.includes(token), false);
    assert.equal(logged.includes('query-secret'), false);
    assert.match(logged, /POST \/files\/shared\/\[REDACTED\]\/download\/extra/);
});

test('CSRF middleware rejects an incorrect token', () => {
    const req = mockRequest({
        method: 'POST',
        session: { csrfToken: 'correct-token' },
        headers: { 'x-csrf-token': 'wrong-token' }
    });
    const res = mockResponse();

    requireCsrf(req, res, () => assert.fail('next should not run'));

    assert.equal(res.statusCode, 403);
});

test('CSRF middleware accepts a matching header token', () => {
    const token = 'matching-token';
    const req = mockRequest({
        method: 'POST',
        session: { csrfToken: token },
        headers: { 'x-csrf-token': token }
    });
    const res = mockResponse();
    let nextCalled = false;

    requireCsrf(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
});

test('CSRF middleware accepts a matching form token', () => {
    const token = 'matching-form-token';
    const req = mockRequest({
        method: 'POST',
        session: { csrfToken: token },
        body: { _csrf: token }
    });
    const res = mockResponse();
    let nextCalled = false;

    requireCsrf(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
});


test('CSRF middleware allows HEAD requests', () => {
    const req = mockRequest({ method: 'HEAD' });
    const res = mockResponse();
    let nextCalled = false;

    requireCsrf(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
});

test('CSRF middleware allows OPTIONS requests', () => {
    const req = mockRequest({ method: 'OPTIONS' });
    const res = mockResponse();
    let nextCalled = false;

    requireCsrf(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
});

test('CSRF middleware rejects requests without a session', () => {
    const req = mockRequest({ method: 'POST' });
    req.session = undefined;

    const res = mockResponse();

    requireCsrf(req, res, () => {
        assert.fail('next should not run');
    });

    assert.equal(res.statusCode, 403);
});

test('CSRF middleware rejects requests when the session token is missing', () => {
    const req = mockRequest({
        method: 'POST',
        session: {},
        headers: { 'x-csrf-token': 'submitted-token' }
    });

    const res = mockResponse();

    requireCsrf(req, res, () => {
        assert.fail('next should not run');
    });

    assert.equal(res.statusCode, 403);
});

test('CSRF middleware returns JSON for requests accepting JSON', () => {
    const req = mockRequest({
        method: 'POST',
        session: { csrfToken: 'correct-token' },
        headers: { accept: 'application/json' }
    });

    const res = mockResponse();

    requireCsrf(req, res, () => {
        assert.fail('next should not run');
    });

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, {
        error: 'Invalid or missing CSRF token.'
    });
});
