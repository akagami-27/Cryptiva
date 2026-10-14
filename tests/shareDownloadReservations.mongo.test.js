'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const crypto = require('node:crypto');
const ShareLinkModel = require('../models/shareLink');
const {
    reserveDownloadSlot,
    settleDownloadReservation,
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

async function createIsolatedSettlementModel(t) {
    const dbName = `crs_${process.pid}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const connection = await mongoose.createConnection(mongoTestUri, { dbName }).asPromise();
    const collectionName = 'share_link_settlement_tests';
    const ShareLink = makeTestModel(connection, `SettlementShareLink_${Date.now()}`, collectionName);
    t.after(async () => {
        // This uniquely named database is created solely for this test.
        await connection.dropDatabase();
        await connection.close();
    });
    await ShareLink.init();
    return ShareLink;
}

function activeReservation(id, now = new Date()) {
    return {
        id,
        expiresAt: new Date(now.getTime() + RESERVATION_LEASE_MS)
    };
}

async function createReservedShare(ShareLink, reservations, overrides = {}) {
    return ShareLink.create({
        ...validShareFields(),
        maxDownloads: 10,
        downloadCount: 0,
        activeDownloads: reservations.length,
        activeDownloadReservations: reservations,
        ...overrides
    });
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

test('MongoDB settlement completes a reservation and increments downloadCount once', {
    skip: !mongoTestUri && 'Set MONGODB_TEST_URI to run MongoDB integration tests.'
}, async (t) => {
    const ShareLink = await createIsolatedSettlementModel(t);
    const reservationId = crypto.randomUUID();
    const share = await createReservedShare(
        ShareLink,
        [activeReservation(reservationId)]
    );

    const settled = await settleDownloadReservation(
        ShareLink,
        share._id,
        reservationId,
        true
    );

    assert.equal(settled, true);
    const stored = await ShareLink.findById(share._id).lean();
    assert.equal(stored.downloadCount, 1);
    assert.equal(stored.activeDownloads, 0);
    assert.deepEqual(stored.activeDownloadReservations, []);
});

test('MongoDB repeated settlement with the same reservation ID is idempotent', {
    skip: !mongoTestUri && 'Set MONGODB_TEST_URI to run MongoDB integration tests.'
}, async (t) => {
    const ShareLink = await createIsolatedSettlementModel(t);
    const reservationId = crypto.randomUUID();
    const share = await createReservedShare(
        ShareLink,
        [activeReservation(reservationId)]
    );

    const first = await settleDownloadReservation(
        ShareLink,
        share._id,
        reservationId,
        true
    );
    const repeated = await settleDownloadReservation(
        ShareLink,
        share._id,
        reservationId,
        true
    );

    assert.equal(first, true);
    assert.equal(repeated, false);
    const stored = await ShareLink.findById(share._id).lean();
    assert.equal(stored.downloadCount, 1);
    assert.equal(stored.activeDownloads, 0);
    assert.deepEqual(stored.activeDownloadReservations, []);
});

test('MongoDB settlement is isolated to its share and reservation ID', {
    skip: !mongoTestUri && 'Set MONGODB_TEST_URI to run MongoDB integration tests.'
}, async (t) => {
    const ShareLink = await createIsolatedSettlementModel(t);
    const reservationId = crypto.randomUUID();
    const siblingReservationId = crypto.randomUUID();
    const target = await createReservedShare(ShareLink, [
        activeReservation(reservationId),
        activeReservation(siblingReservationId)
    ]);
    // Reuse the ID on a separate document to prove the share ID is also part
    // of the atomic settlement predicate.
    const otherShare = await createReservedShare(ShareLink, [
        activeReservation(reservationId)
    ]);

    const settled = await settleDownloadReservation(
        ShareLink,
        target._id,
        reservationId,
        true
    );

    assert.equal(settled, true);
    const [targetAfter, otherShareAfter] = await Promise.all([
        ShareLink.findById(target._id).lean(),
        ShareLink.findById(otherShare._id).lean()
    ]);
    assert.equal(targetAfter.downloadCount, 1);
    assert.equal(targetAfter.activeDownloads, 1);
    assert.deepEqual(
        targetAfter.activeDownloadReservations.map((reservation) => reservation.id),
        [siblingReservationId]
    );
    assert.equal(otherShareAfter.downloadCount, 0);
    assert.equal(otherShareAfter.activeDownloads, 1);
    assert.deepEqual(
        otherShareAfter.activeDownloadReservations.map((reservation) => reservation.id),
        [reservationId]
    );
});

test('MongoDB concurrent settlement attempts increment only once', {
    skip: !mongoTestUri && 'Set MONGODB_TEST_URI to run MongoDB integration tests.'
}, async (t) => {
    const ShareLink = await createIsolatedSettlementModel(t);
    const reservationId = crypto.randomUUID();
    const share = await createReservedShare(
        ShareLink,
        [activeReservation(reservationId)]
    );

    const results = await Promise.all([
        settleDownloadReservation(ShareLink, share._id, reservationId, true),
        settleDownloadReservation(ShareLink, share._id, reservationId, true)
    ]);

    assert.deepEqual(results.sort(), [false, true]);
    const stored = await ShareLink.findById(share._id).lean();
    assert.equal(stored.downloadCount, 1);
    assert.equal(stored.activeDownloads, 0);
    assert.deepEqual(stored.activeDownloadReservations, []);
});
