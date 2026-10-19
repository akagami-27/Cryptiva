'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const { ensureCsrfToken, requireCsrf, sendCsrfToken } = require('../middleware/csrf');

function createCsrfTestApp() {
    let loginReached = false;
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(session({
        name: 'cryptiva.sid',
        secret: 'csrf-session-test-secret-long-enough-for-express-session',
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: 'lax', secure: false, path: '/' }
    }));
    app.use(ensureCsrfToken);
    app.get('/csrf-token', sendCsrfToken);
    app.use(requireCsrf);
    app.post('/login', (req, res) => {
        req.session.regenerate((regenerateError) => {
            if (regenerateError) return res.status(500).end();

            req.session.user = { id: 'test-user' };
            req.session.save((saveError) => {
                if (saveError) return res.status(500).end();
                loginReached = true;
                return res.status(204).end();
            });
        });
    });
    return { app, loginWasReached: () => loginReached };
}

test('CSRF token endpoint and login form share the HTTP session in local development', async () => {
    const { app, loginWasReached } = createCsrfTestApp();
    const browser = request.agent(app);
    const tokenResponse = await browser.get('/csrf-token').set('Accept', 'application/json');

    assert.equal(tokenResponse.status, 200);
    assert.match(tokenResponse.body.csrfToken, /^[a-f0-9]{64}$/);
    assert.match(tokenResponse.headers['cache-control'], /no-store/);
    const sessionCookie = (tokenResponse.headers['set-cookie'] || []).find((cookie) => cookie.startsWith('cryptiva.sid='));
    assert.ok(sessionCookie, 'the token response establishes a session cookie');
    assert.doesNotMatch(sessionCookie, /; Secure(?:;|$)/i, 'local HTTP session cookies must be usable over HTTP');

    const loginResponse = await browser.post('/login').type('form').send({ username: 'test-user', password: 'test-password', _csrf: tokenResponse.body.csrfToken });
    assert.equal(loginResponse.status, 204);
    assert.equal(loginWasReached(), true);

    const postLoginTokenResponse = await browser.get('/csrf-token').set('Accept', 'application/json');
    assert.equal(postLoginTokenResponse.status, 200);
    assert.match(postLoginTokenResponse.body.csrfToken, /^[a-f0-9]{64}$/);
    assert.notEqual(postLoginTokenResponse.body.csrfToken, tokenResponse.body.csrfToken);
});

test('CSRF validation rejects missing and invalid login form tokens', async () => {
    const { app, loginWasReached } = createCsrfTestApp();
    const browser = request.agent(app);
    await browser.get('/csrf-token');

    const missing = await browser.post('/login').type('form').send({ username: 'test-user', password: 'test-password' });
    assert.equal(missing.status, 302);
    assert.equal(missing.headers.location, '/login');

    const invalid = await browser.post('/login').type('form').send({ username: 'test-user', password: 'test-password', _csrf: 'invalid-token' });
    assert.equal(invalid.status, 302);
    assert.equal(invalid.headers.location, '/login');
    assert.equal(loginWasReached(), false);
});

test('React login and dashboard requests use the backend CSRF response and token contract', () => {
    const login = fs.readFileSync(path.join(__dirname, '../client/src/pages/Login.jsx'), 'utf8');
    const apiClient = fs.readFileSync(path.join(__dirname, '../client/src/api/client.js'), 'utf8');
    const dashboard = fs.readFileSync(path.join(__dirname, '../client/src/pages/Dashboard.jsx'), 'utf8');
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

    assert.match(apiClient, /fetch\('\/csrf-token'/);
    assert.match(apiClient, /credentials:\s*'same-origin'/);
    assert.match(apiClient, /data\.csrfToken/);
    assert.match(login, /body\.set\('_csrf', token\)/);
    assert.match(login, /credentials:\s*'same-origin'/);
    assert.match(login, /csrfToken\s*\|\|\s*await refreshCsrfToken\(\)/);
    assert.match(dashboard, /import \{ ensureCsrfToken \} from "\.\.\/api\/client\.js"/);
    assert.match(dashboard, /headers\.set\("X-CSRF-Token", await ensureCsrfToken\(\)\)/);
    assert.match(dashboard, /const token = await ensureCsrfToken\(\)/);
    assert.match(dashboard, /xhr\.withCredentials = true/);
    assert.match(dashboard, /xhr\.setRequestHeader\("X-CSRF-Token", token\)/);
    assert.doesNotMatch(dashboard, /if\s*\(token\)\s*xhr\.setRequestHeader\("X-CSRF-Token"/);

    const csrfGenerationIndex = server.search(/app\.use\(\s*ensureCsrfToken\s*\)/);
    const csrfValidationIndex = server.search(/app\.use\(\s*requireCsrf\s*\)/);
    const filesRouterIndex = server.indexOf("require('./routes/files')");
    assert.ok(csrfGenerationIndex >= 0 && csrfGenerationIndex < csrfValidationIndex);
    assert.ok(csrfValidationIndex < filesRouterIndex, 'global CSRF validation must precede the files router');
});

test('dashboard token refresh uses the current Vite-proxied session and coalesces concurrent requests', async () => {
    const originalDocument = global.document;
    const originalFetch = global.fetch;
    const meta = {
        content: '',
        setAttribute(name, value) {
            assert.equal(name, 'content');
            this.content = value;
        }
    };
    let fetchCalls = 0;
    const freshToken = 'fresh-session-csrf-token';

    global.document = {
        querySelector(selector) {
            assert.equal(selector, 'meta[name="csrf-token"]');
            return meta;
        }
    };
    global.fetch = async (url, options) => {
        fetchCalls += 1;
        assert.equal(url, '/csrf-token');
        assert.equal(options.credentials, 'same-origin');
        assert.equal(options.cache, 'no-store');
        return {
            ok: true,
            async json() {
                return { csrfToken: freshToken };
            }
        };
    };

    try {
        const moduleUrl = `${pathToFileURL(path.join(__dirname, '../client/src/api/client.js')).href}?csrf-test=${Date.now()}`;
        const { ensureCsrfToken } = await import(moduleUrl);
        const tokens = await Promise.all([
            ensureCsrfToken(),
            ensureCsrfToken()
        ]);

        assert.deepEqual(tokens, [freshToken, freshToken]);
        assert.equal(meta.content, freshToken);
        assert.equal(fetchCalls, 1);
        assert.equal(await ensureCsrfToken(), freshToken);
        assert.equal(fetchCalls, 1);
    } finally {
        if (originalDocument === undefined) delete global.document;
        else global.document = originalDocument;
        global.fetch = originalFetch;
    }
});
