'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

const {
    MongoRateLimitStore,
    loginRateLimiter,
    sharePasswordRateLimiter
} = require('../middleware/rateLimit');

function installCollectionMock(t, collection, readyState = 1) {
    const originalCollection = mongoose.connection.collection;
    const hadOwnReadyState = Object.hasOwn(mongoose.connection, 'readyState');
    const originalReadyState = mongoose.connection.readyState;

    mongoose.connection.readyState = readyState;
    mongoose.connection.collection = () => collection;

    t.after(() => {
        mongoose.connection.collection = originalCollection;
        if (hadOwnReadyState) {
            mongoose.connection.readyState = originalReadyState;
        } else {
            delete mongoose.connection.readyState;
        }
    });
}

test('Mongo rate-limit store rejects when MongoDB is unavailable', async (t) => {
    installCollectionMock(t, {}, 0);
    const store = new MongoRateLimitStore('unit');

    await assert.rejects(store.increment('client-key'), /MongoDB is required/);
});

test('Mongo rate-limit store propagates database and index failures', async (t) => {
    const expectedError = new Error('simulated index failure');
    const collection = {
        async createIndex() {
            throw expectedError;
        }
    };
    installCollectionMock(t, collection);
    const store = new MongoRateLimitStore('unit');

    await assert.rejects(store.increment('client-key'), (error) => error === expectedError);
});

test('rate-limit store retries a concurrent first-hit duplicate key without upsert', async (t) => {
    const calls = [];
    const collection = {
        async createIndex() {},
        async findOneAndUpdate(filter, pipeline, options) {
            calls.push({ filter, pipeline, options });
            if (calls.length === 1) {
                const error = new Error('duplicate key');
                error.code = 11000;
                throw error;
            }
            return { totalHits: 1, resetTime: new Date(Date.now() + 60_000) };
        }
    };
    installCollectionMock(t, collection);
    const store = new MongoRateLimitStore('login');
    store.init({ windowMs: 60_000 });

    const result = await store.increment('client-key');

    assert.equal(result.totalHits, 1);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].filter, { key: 'login:client-key' });
    assert.deepEqual(calls[1].filter, calls[0].filter);
    assert.equal(calls[0].options.upsert, true);
    assert.notEqual(calls[1].options.upsert, true);
    assert.deepEqual(calls[1].pipeline, calls[0].pipeline);
});

test('rate-limit pipeline increments active windows and resets expired windows', async (t) => {
    const NativeDate = global.Date;
    let now = 1_700_000_000_000;
    global.Date = class TestDate extends NativeDate {
        constructor(...args) {
            super(...(args.length ? args : [now]));
        }
        static now() {
            return now;
        }
    };
    t.after(() => {
        global.Date = NativeDate;
    });

    let document;
    const collection = {
        async createIndex() {},
        async findOneAndUpdate(filter, pipeline, options) {
            const set = pipeline[0].$set;
            const expiryCheck = set.totalHits.$cond[0].$gt;
            const active = document && document.resetTime > expiryCheck[1];
            const resetTime = active
                ? document.resetTime
                : set.resetTime.$cond[2];
            document = {
                key: filter.key,
                totalHits: active ? document.totalHits + 1 : 1,
                resetTime
            };
            return { ...document };
        }
    };
    installCollectionMock(t, collection);
    const store = new MongoRateLimitStore('login');
    store.init({ windowMs: 60_000 });

    const first = await store.increment('client-key');
    const second = await store.increment('client-key');
    now = first.resetTime.getTime();
    const afterExpiry = await store.increment('client-key');

    assert.equal(first.totalHits, 1);
    assert.equal(second.totalHits, 2);
    assert.equal(afterExpiry.totalHits, 1);
    assert.equal(afterExpiry.resetTime.getTime(), now + 60_000);
});

test('login rate limiter fails closed when its MongoDB store fails', async (t) => {
    const collection = {
        async createIndex() {
            throw new Error('simulated rate-limit store failure');
        }
    };
    installCollectionMock(t, collection);

    const app = express();
    let loginHandlerCalled = false;
    app.post('/login', loginRateLimiter, (req, res) => {
        loginHandlerCalled = true;
        res.sendStatus(200);
    });
    app.use((error, req, res, next) => {
        res.status(500).send('request failed');
    });

    const response = await request(app).post('/login');

    assert.equal(response.status, 500);
    assert.equal(response.text, 'request failed');
    assert.equal(loginHandlerCalled, false);
});

test('share-password limiter decrements successful responses but retains failed attempts', async (t) => {
    let totalHits = 0;
    let decrements = 0;
    const collection = {
        async createIndex() {},
        async findOneAndUpdate() {
            totalHits += 1;
            return { totalHits, resetTime: new Date(Date.now() + 60_000) };
        },
        async updateOne() {
            decrements += 1;
        }
    };
    installCollectionMock(t, collection);

    const app = express();
    app.post('/shared/password', sharePasswordRateLimiter, (req, res) => {
        res.sendStatus(req.get('x-test-failed') ? 401 : 200);
    });

    const successfulResponse = await request(app).post('/shared/password');
    assert.equal(successfulResponse.status, 200);
    assert.equal(decrements, 1);

    const failedResponse = await request(app)
        .post('/shared/password')
        .set('x-test-failed', 'yes');
    assert.equal(failedResponse.status, 401);
    assert.equal(decrements, 1);
    assert.equal(totalHits, 2);
});
