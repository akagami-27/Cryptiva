'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { errorHandler } = require('../middleware/errorHandler');

function invokeErrorHandler(originalUrl, error) {
    const response = {
        statusCode: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        send() {
            return this;
        },
        sendFile() {
            return this;
        }
    };

    errorHandler(error, {
        method: 'GET',
        originalUrl
    }, response, () => {});

    return response;
}

test('global error logging redacts share tokens and omits query strings', () => {
    const token = 'A'.repeat(43);
    const captured = [];
    const originalConsoleError = console.error;
    console.error = (...args) => captured.push(args);

    try {
        const response = invokeErrorHandler(
            `/files/shared/${token}?password=query-secret`,
            Object.assign(new Error(`failure for ${token}`), { status: 500 })
        );

        assert.equal(response.statusCode, 500);
    } finally {
        console.error = originalConsoleError;
    }

    const logged = JSON.stringify(captured);
    assert.equal(logged.includes(token), false);
    assert.equal(logged.includes('query-secret'), false);
    assert.match(logged, /GET/);
    assert.match(logged, /\/files\/shared\/\[REDACTED\]/);
    assert.match(logged, /failure for \[REDACTED\]/);
    assert.match(logged, /500/);
});

test('global error logging preserves shared-download route context while redacting its token', () => {
    const token = 'B'.repeat(43);
    const captured = [];
    const originalConsoleError = console.error;
    console.error = (...args) => captured.push(args);

    try {
        invokeErrorHandler(
            `/files/shared/${token}/download`,
            new Error('storage unavailable')
        );
    } finally {
        console.error = originalConsoleError;
    }

    const logged = JSON.stringify(captured);
    assert.equal(logged.includes(token), false);
    assert.match(logged, /\/files\/shared\/\[REDACTED\]\/download/);
    assert.match(logged, /storage unavailable/);
});

test('global error logging redacts encoded path tokens and their decoded form in messages', () => {
    const decodedToken = 'C'.repeat(43);
    const encodedToken = `%${decodedToken.charCodeAt(0).toString(16)}${decodedToken.slice(1)}`;
    const captured = [];
    const originalConsoleError = console.error;
    console.error = (...args) => captured.push(args);

    try {
        invokeErrorHandler(
            `/files/shared/${encodedToken}/download?next=private`,
            new Error(`failed for ${decodedToken}`)
        );
    } finally {
        console.error = originalConsoleError;
    }

    const logged = JSON.stringify(captured);
    assert.equal(logged.includes(decodedToken), false);
    assert.equal(logged.includes(encodedToken), false);
    assert.equal(logged.includes('private'), false);
    assert.match(logged, /\/files\/shared\/\[REDACTED\]\/download/);
    assert.match(logged, /failed for \[REDACTED\]/);
});

test('malformed percent encoding does not throw or expose a shared path segment', () => {
    const malformedToken = 'bad%E0%A4%A';
    const captured = [];
    const originalConsoleError = console.error;
    console.error = (...args) => captured.push(args);

    try {
        assert.doesNotThrow(() => invokeErrorHandler(
            `/files/shared/${malformedToken}`,
            new Error(`failed for ${malformedToken}`)
        ));
    } finally {
        console.error = originalConsoleError;
    }

    const logged = JSON.stringify(captured);
    assert.equal(logged.includes(malformedToken), false);
    assert.match(logged, /\/files\/shared\/\[REDACTED\]/);
});

test('global error logging keeps unrelated route context without redacting its path', () => {
    const captured = [];
    const originalConsoleError = console.error;
    console.error = (...args) => captured.push(args);

    try {
        invokeErrorHandler(
            '/files/metadata/report?password=query-secret',
            new Error('metadata lookup failed')
        );
    } finally {
        console.error = originalConsoleError;
    }

    const logged = JSON.stringify(captured);
    assert.match(logged, /\/files\/metadata\/report/);
    assert.doesNotMatch(logged, /\[REDACTED\]/);
    assert.equal(logged.includes('query-secret'), false);
});
