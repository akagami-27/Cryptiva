'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const crypto = require('node:crypto');
const ShareLinkModel = require('../models/shareLink');
const {
    reserveDownloadSlot,
    RESERVATION_LEASE_MS
} = require('../services/shareDownloadReservations');

const mongoTestUri = process.env.MONGODB_TEST_URI;

function makeTestModel(connection, modelName, collectionName) {
    // Reuse the production schema, validators, defaults, and indexes while
    // binding it to an isolated test collection and connection.
    return connection.model(modelName, ShareLinkModel.schema, collectionName);
}

function validShareFields(overrides = {}) {
    return {
        fileId: new mongoose.Types.ObjectId(),
        ownerId: new mongoose.Types.ObjectId(),
        tokenHash: crypto.randomBytes(32).toString('hex'),
        ...overrides
    };
}

test('MongoDB atomically admits only one concurrent reservation at maxDownloads=1', {
    skip: !mongoTestUri && 'Set MONGODB_TEST_URI to run MongoDB integration tests.'
}, async (t) => {
    const dbName = `crt_${process.pid}_${Date.now()}`;
    const connection = await mongoose.createConnection(mongoTestUri, { dbName }).asPromise();
    const collectionName = 'share_link_reservation_tests';
    const ShareLink = makeTestModel(connection, 'ReservationShareLink', collectionName);
    t.after(async () => {
        await connection.dropDatabase();
        await connection.close();
    });
    await ShareLink.init();

    const share = await ShareLink.create({
        ...validShareFields(),
        maxDownloads: 1,
        downloadCount: 0,
        activeDownloads: 0,
        activeDownloadReservations: []
    });

    const claims = await Promise.all([
        reserveDownloadSlot(ShareLink, share._id),
        reserveDownloadSlot(ShareLink, share._id)
    ]);

    assert.equal(claims.filter(Boolean).length, 1);
    const stored = await ShareLink.findById(share._id).lean();
    assert.equal(stored.activeDownloadReservations.length, 1);
    assert.equal(stored.activeDownloads, 1);
});

test('MongoDB prunes an expired reservation and admits a replacement', {
    skip: !mongoTestUri && 'Set MONGODB_TEST_URI to run MongoDB integration tests.'
}, async (t) => {
    const dbName = `cre_${process.pid}_${Date.now()}`;
    const connection = await mongoose.createConnection(mongoTestUri, { dbName }).asPromise();
    const collectionName = 'share_link_expiry_tests';
    const ShareLink = makeTestModel(connection, 'ExpiredReservationShareLink', collectionName);
    t.after(async () => {
        await connection.dropDatabase();
        await connection.close();
    });
    await ShareLink.init();

    const now = new Date();
    const oldReservationId = 'expired-reservation';
    const share = await ShareLink.create({
        ...validShareFields(),
        maxDownloads: 1,
        downloadCount: 0,
        activeDownloads: 1,
        activeDownloadReservations: [{
            id: oldReservationId,
            expiresAt: new Date(now.getTime() - RESERVATION_LEASE_MS)
        }]
    });

    const replacement = await reserveDownloadSlot(ShareLink, share._id, now);

    assert.ok(replacement);
    const stored = await ShareLink.findById(share._id).lean();
    assert.deepEqual(
        stored.activeDownloadReservations.map((reservation) => reservation.id),
        [replacement]
    );
    assert.equal(stored.activeDownloads, 1);
});
