'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const reactPages = require('../routes/reactPages');

const destinations = new Map([
    ['/', '/react'],
    ['/login', '/react/login'],
    ['/register', '/react/register'],
    ['/dashboard', '/react/dashboard'],
    ['/files', '/react/files'],
    ['/files.html', '/react/files'],
    ['/shared', '/react/shared'],
    ['/activity', '/react/activity'],
    ['/activity.html', '/react/activity'],
    ['/profile', '/react/profile'],
    ['/profile.html', '/react/profile'],
    ['/security', '/react/security'],
    ['/security.html', '/react/security']
]);

function createApp() {
    const app = express();
    app.use(reactPages);
    app.post('/login', (req, res) => res.status(204).end());
    app.get('/files/data', (req, res) => res.json({ api: true }));
    app.use((req, res) => res.sendStatus(404));
    return app;
}

test('legacy page URLs redirect to their React routes', async (t) => {
    const app = createApp();

    for (const [legacyPath, reactPath] of destinations) {
        await t.test(`${legacyPath} redirects to ${reactPath}`, async () => {
            const response = await request(app).get(legacyPath).redirects(0);
            assert.equal(response.status, 302);
            assert.equal(response.headers.location, reactPath);
        });
    }
});

test('legacy POST endpoints and nested file API paths pass through unchanged', async () => {
    const app = createApp();
    const loginResponse = await request(app).post('/login').redirects(0);
    const filesResponse = await request(app).get('/files/data');

    assert.equal(loginResponse.status, 204);
    assert.equal(filesResponse.status, 200);
    assert.deepEqual(filesResponse.body, { api: true });
});
