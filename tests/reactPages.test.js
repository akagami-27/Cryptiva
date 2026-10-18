'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const request = require('supertest');
const { FRONTEND_PATHS, registerReactPages } = require('../routes/reactPages');
const { notFoundHandler } = require('../middleware/errorHandler');

function createApp(authenticated = false) {
    const app = express();
    const requireAuth = (req, res, next) => {
        if (authenticated) return next();
        return res.redirect('/login');
    };
    const redirectIfAuth = (req, res, next) => next();
    registerReactPages(app, {
        requireAuth,
        redirectIfAuth,
        sendApp: (req, res) => res.type('html').send('<div id="root">react-app</div>')
    });
    app.use(notFoundHandler);
    return app;
}

test('public root and auth pages serve the React entry point', async () => {
    const app = createApp();
    for (const path of ['/', '/login', '/register']) {
        const response = await request(app).get(path);
        assert.equal(response.status, 200, path);
        assert.match(response.text, /id="root"/, path);
    }
});

test('workspace page entry points require authentication and serve React when allowed', async () => {
    for (const path of FRONTEND_PATHS.slice(3)) {
        const anonymousResponse = await request(createApp()).get(path).redirects(0);
        assert.equal(anonymousResponse.status, 302, path);
        assert.equal(anonymousResponse.headers.location, '/login', path);

        const authenticatedResponse = await request(createApp(true)).get(path);
        assert.equal(authenticatedResponse.status, 200, path);
        assert.match(authenticatedResponse.text, /id="root"/, path);
    }
});

test('unmatched page and nested API paths do not receive the React application', async () => {
    const app = createApp(true);
    for (const path of ['/unknown-page', '/api/unknown', '/files/unknown']) {
        const response = await request(app).get(path);
        assert.equal(response.status, 404, path);
        assert.doesNotMatch(response.text, /id="root"/, path);
    }
});

test('unknown API requests return JSON 404 rather than an HTML application response', async () => {
    const response = await request(createApp(true)).get('/api/unknown');
    assert.equal(response.status, 404);
    assert.match(response.headers['content-type'], /application\/json/);
    assert.deepEqual(response.body, { error: 'Not found.' });
});

test('legacy React dashboard URL permanently redirects to its clean URL', async () => {
    const response = await request(createApp(true)).get('/react/dashboard?from=bookmark').redirects(0);
    assert.equal(response.status, 308);
    assert.equal(response.headers.location, '/dashboard?from=bookmark');
});
