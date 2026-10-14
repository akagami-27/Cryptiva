
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { requireAuth, redirectIfAuth } = require('../middleware/auth');
const { ensureCsrfToken, requireCsrf } = require('../middleware/csrf');

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
        body,
        path,
        originalUrl: path,
        get(name) {
            return headers[name.toLowerCase()] || '';
        },
        flash() {}
    };
}

test('requireAuth allows authenticated users', () => {
    const req = mockRequest({ session: { user: { id: '123' } } });
    const res = mockResponse();
    let nextCalled = false;

    requireAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.redirectedTo, null);
});

test('requireAuth redirects unauthenticated users', () => {
    const req = mockRequest();
    const res = mockResponse();

    requireAuth(req, res, () => assert.fail('next should not run'));

    assert.equal(res.redirectedTo, '/login');
});

test('redirectIfAuth redirects authenticated users', () => {
    const req = mockRequest({ session: { user: { id: '123' } } });
    const res = mockResponse();

    redirectIfAuth(req, res, () => assert.fail('next should not run'));

    assert.equal(res.redirectedTo, '/dashboard');
});

test('redirectIfAuth allows unauthenticated users', () => {
    const req = mockRequest();
    const res = mockResponse();
    let nextCalled = false;

    redirectIfAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
});

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
