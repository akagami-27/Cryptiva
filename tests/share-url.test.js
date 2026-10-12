'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const getPublicAppUrl = require('../config/publicAppUrl');
const { createShareUrl } = require('../services/shareUrlService');

const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL
};

function restoreEnvironment() {
    for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

test('share link uses the configured public origin and actual recipient route', () => {
    try {
        process.env.NODE_ENV = 'production';
        process.env.PUBLIC_APP_URL = 'https://cryptiva.example.com';
        assert.equal(
            createShareUrl('A'.repeat(43)),
            `https://cryptiva.example.com/files/shared/${'A'.repeat(43)}`
        );
    } finally {
        restoreEnvironment();
    }
});

test('production URL configuration requires a public HTTPS origin', () => {
    try {
        process.env.NODE_ENV = 'production';
        delete process.env.PUBLIC_APP_URL;
        assert.throws(getPublicAppUrl, /PUBLIC_APP_URL must be configured/);
        process.env.PUBLIC_APP_URL = 'http://cryptiva.example.com';
        assert.throws(getPublicAppUrl, /must use HTTPS/);
    } finally {
        restoreEnvironment();
    }
});

test('development URL defaults to the local Express origin', () => {
    try {
        process.env.NODE_ENV = 'development';
        process.env.PORT = '3000';
        delete process.env.PUBLIC_APP_URL;
        assert.equal(getPublicAppUrl(), 'http://127.0.0.1:3000');
    } finally {
        restoreEnvironment();
    }
});

test('share link builder rejects malformed tokens', () => {
    assert.throws(() => createShareUrl('not-a-share-token'), /invalid token/);
});
