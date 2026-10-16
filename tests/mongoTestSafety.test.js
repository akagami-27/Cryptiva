'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getSafeMongoTestUri } = require('./helpers/mongoTestSafety');

test('MongoDB integration tests remain skipped without a dedicated test URI', () => {
    assert.equal(getSafeMongoTestUri({ testUri: '', applicationUri: '' }), null);
});

test('MongoDB test URI must name a dedicated test database', () => {
    assert.throws(
        () => getSafeMongoTestUri({
            testUri: 'mongodb://127.0.0.1:27017/cryptiva',
            applicationUri: ''
        }),
        /dedicated test database/
    );
});

test('MongoDB test URI cannot use the application database host', () => {
    assert.throws(
        () => getSafeMongoTestUri({
            testUri: 'mongodb://db.example.invalid:27017/cryptiva_test',
            applicationUri: 'mongodb+srv://db.example.invalid/cryptiva',
            allowRemote: 'I_UNDERSTAND_THIS_IS_DISPOSABLE'
        }),
        /different MongoDB host/
    );
});

test('local disposable MongoDB test URI is accepted without a remote override', () => {
    const uri = 'mongodb://127.0.0.1:27017/cryptiva_test';
    assert.equal(getSafeMongoTestUri({ testUri: uri, applicationUri: '' }), uri);
});

test('remote MongoDB test URI requires explicit disposable-cluster confirmation', () => {
    const uri = 'mongodb+srv://test.invalid/cryptiva_test';
    assert.throws(
        () => getSafeMongoTestUri({ testUri: uri, applicationUri: '' }),
        /MONGODB_TEST_ALLOW_REMOTE/
    );
    assert.equal(
        getSafeMongoTestUri({
            testUri: uri,
            applicationUri: '',
            allowRemote: 'I_UNDERSTAND_THIS_IS_DISPOSABLE'
        }),
        uri
    );
});
