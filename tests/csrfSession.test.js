'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
        loginReached = true;
        return res.status(204).end();
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

test('React login and API client use the backend CSRF response and form-token contract', () => {
    const login = fs.readFileSync(path.join(__dirname, '../client/src/pages/Login.jsx'), 'utf8');
    const apiClient = fs.readFileSync(path.join(__dirname, '../client/src/api/client.js'), 'utf8');

    assert.match(apiClient, /fetch\('\/csrf-token'/);
    assert.match(apiClient, /credentials:\s*'same-origin'/);
    assert.match(apiClient, /data\.csrfToken/);
    assert.match(login, /body\.set\('_csrf', token\)/);
    assert.match(login, /credentials:\s*'same-origin'/);
    assert.match(login, /csrfToken\s*\|\|\s*await refreshCsrfToken\(\)/);
});
