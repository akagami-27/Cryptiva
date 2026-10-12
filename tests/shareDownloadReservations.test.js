'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    RESERVATION_LEASE_MS,
    reserveDownloadSlot,
    settleDownloadReservation,
    renewReservationOrAbort,
    renewDownloadReservation
} = require('../services/shareDownloadReservations');

function mockShareLink(maxDownloads = 1) {
    const state = {
        _id: 'share-1',
        maxDownloads,
        expiresAt: null,
        revokedAt: null,
        downloadCount: 0,
        activeDownloads: 0,
        activeDownloadReservations: []
    };
    const model = {
        now: new Date('2026-01-01T00:00:00Z'),
        async updateOne(filter, pipeline) {
            const id = filter['activeDownloadReservations.id'] ||
                filter.activeDownloadReservations?.$elemMatch?.id;
            if (id) {
                const index = state.activeDownloadReservations.findIndex((r) => r.id === id);
                if (index < 0) return { modifiedCount: 0 };
                const expiresAfter = filter.activeDownloadReservations?.$elemMatch?.expiresAt?.$gt;
                if (expiresAfter && state.activeDownloadReservations[index].expiresAt <= expiresAfter) {
                    return { modifiedCount: 0 };
                }
                const set = pipeline[0].$set;
                if (set.activeDownloadReservations.$map) {
                    state.activeDownloadReservations[index].expiresAt =
                        set.activeDownloadReservations.$map.in.$cond[2].expiresAt;
                } else {
                    state.activeDownloadReservations = state.activeDownloadReservations.filter((r) => r.id !== id);
                    state.activeDownloads = state.activeDownloadReservations.length;
                    state.downloadCount = (state.downloadCount ?? 0) + set.downloadCount.$add[1];
                }
                return { modifiedCount: 1 };
            }

            const expiredBy = filter['activeDownloadReservations.expiresAt']?.$lte;
            if (expiredBy) {
                model.now = expiredBy;
                const before = state.activeDownloadReservations.length;
                state.activeDownloadReservations = state.activeDownloadReservations.filter(
                    (r) => r.expiresAt > expiredBy
                );
                state.activeDownloads = state.activeDownloadReservations.length;
                return { modifiedCount: before === state.activeDownloads ? 0 : 1 };
            }
            return { modifiedCount: 0 };
        },
        async findOneAndUpdate(_filter, pipeline) {
            const now = model.now;
            state.activeDownloadReservations = state.activeDownloadReservations.filter((r) => r.expiresAt > now);
            const shareActive = !state.revokedAt && (!state.expiresAt || state.expiresAt > now);
            const available = state.maxDownloads == null ||
                (state.downloadCount ?? 0) + state.activeDownloadReservations.length < state.maxDownloads;
            if (!shareActive || !available) return null;
            const reserved = pipeline[0].$set.activeDownloadReservations.$concatArrays[1][0];
            state.activeDownloadReservations.push(reserved);
            state.activeDownloads = state.activeDownloadReservations.length;
            return state;
        }
    };
    return { model, state };
}

test('atomic slot claims allow only one concurrent request at a one-download limit', async () => {
    const { model, state } = mockShareLink(1);
    const [first, second] = await Promise.all([
        reserveDownloadSlot(model, state._id, model.now),
        reserveDownloadSlot(model, state._id, model.now)
    ]);

    assert.equal([first, second].filter(Boolean).length, 1);
    assert.equal(state.activeDownloads, 1);
});

test('interrupted responses release their reservation without counting a download', async () => {
    const { model, state } = mockShareLink(1);
    const reservationId = await reserveDownloadSlot(model, state._id, model.now);

    await settleDownloadReservation(model, state._id, reservationId, false);

    assert.equal(state.downloadCount, 0);
    assert.equal(state.activeDownloads, 0);
});

test('completed responses count once and release their reservation', async () => {
    const { model, state } = mockShareLink(1);
    const reservationId = await reserveDownloadSlot(model, state._id, model.now);

    await settleDownloadReservation(model, state._id, reservationId, true);

    assert.equal(state.downloadCount, 1);
    assert.equal(state.activeDownloads, 0);
    assert.equal(await reserveDownloadSlot(model, state._id, model.now), null);
});

test('legacy links without downloadCount can reserve and settle safely', async () => {
    const { model, state } = mockShareLink(1);
    delete state.downloadCount;
    const reservationId = await reserveDownloadSlot(model, state._id, model.now);

    assert.ok(reservationId);
    await settleDownloadReservation(model, state._id, reservationId, true);
    assert.equal(state.downloadCount, 1);
});

test('renewal atomically requires the same reservation ID to have an unexpired lease', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    let query;
    const model = {
        async updateOne(filter) {
            query = filter;
            return { modifiedCount: 1 };
        }
    };

    const renewed = await renewDownloadReservation(model, 'share-1', 'lease-1', now);

    assert.equal(renewed, true);
    assert.deepEqual(query.activeDownloadReservations.$elemMatch, {
        id: 'lease-1',
        expiresAt: { $gt: now }
    });
});

test('renewal returns false when the reservation lease has expired', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const model = {
        async updateOne(filter) {
            assert.deepEqual(filter.activeDownloadReservations.$elemMatch, {
                id: 'expired-lease',
                expiresAt: { $gt: now }
            });
            return { modifiedCount: 0 };
        }
    };

    const renewed = await renewDownloadReservation(
        model,
        'share-1',
        'expired-lease',
        now
    );

    assert.equal(renewed, false);
});

test('expired reservation is recovered after a worker crash, with completion crash window documented', async () => {
    const { model, state } = mockShareLink(1);
    const reservationId = await reserveDownloadSlot(model, state._id, model.now);
    assert.ok(reservationId);

    // Simulate response delivery followed by a process crash before settle(true).
    model.now = new Date(model.now.getTime() + RESERVATION_LEASE_MS + 1);
    const recoveredReservation = await reserveDownloadSlot(model, state._id, model.now);

    assert.ok(recoveredReservation);
    assert.equal(state.downloadCount, 0);
    assert.equal(state.activeDownloads, 1);
    assert.equal(
        state.activeDownloadReservations.some((reservation) => reservation.id === reservationId),
        false
    );
});

test('renewal database errors destroy the response and attempt unsuccessful settlement', async () => {
    const res = { destroyed: false, destroy() { this.destroyed = true; } };
    let settlementValue;
    const originalError = console.error;
    console.error = () => {};
    try {
        const model = { async updateOne() { throw new Error('MongoDB unavailable'); } };
        const renewed = await renewReservationOrAbort(
            model,
            'share-1',
            'reservation-1',
            res,
            async (completed) => { settlementValue = completed; }
        );
        assert.equal(renewed, false);
    } finally {
        console.error = originalError;
    }
    assert.equal(res.destroyed, true);
    assert.equal(settlementValue, false);
});

test('renewal rejected for an expired lease destroys the response and settles unsuccessfully', async () => {
    const res = { destroyed: false, destroy() { this.destroyed = true; } };
    let settlementValue;
    const originalError = console.error;
    console.error = () => {};
    try {
        const model = { async updateOne() { return { modifiedCount: 0 }; } };
        const renewed = await renewReservationOrAbort(
            model,
            'share-1',
            'expired-lease',
            res,
            async (completed) => { settlementValue = completed; }
        );
        assert.equal(renewed, false);
    } finally {
        console.error = originalError;
    }
    assert.equal(res.destroyed, true);
    assert.equal(settlementValue, false);
});
