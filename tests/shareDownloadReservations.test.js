'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    RESERVATION_LEASE_MS,
    reserveDownloadSlot,
    settleDownloadReservation,
    renewReservationOrAbort,
    renewDownloadReservation,
    runReservedDownloadResponse
} = require('../services/shareDownloadReservations');
const { EventEmitter } = require('node:events');

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

class MockResponse extends EventEmitter {
    constructor() {
        super();
        this.writableFinished = false;
        this.destroyed = false;
        this.headers = {};
    }

    setHeader(name, value) {
        this.headers[name] = value;
    }

    send() {
        return this;
    }
}

async function withReservedResponse(sendResponse, options = {}) {
    const { model, state } = mockShareLink(1);
    const reservationId = await reserveDownloadSlot(model, state._id, model.now);
    assert.ok(reservationId);
    const res = options.res || new MockResponse();
    const responsePromise = runReservedDownloadResponse({
        ShareLink: options.model || model,
        shareId: state._id,
        reservationId,
        res,
        onCompleted: options.onCompleted,
        sendResponse: (settle) => sendResponse(res, settle)
    });
    return { model, state, reservationId, res, responsePromise };
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

test('an exception after reservation acquisition releases it without counting a download', async () => {
    const { state, responsePromise } = await withReservedResponse(() => {
        throw new Error('response preparation failed');
    });

    await assert.rejects(responsePromise, /response preparation failed/);
    assert.equal(state.downloadCount, 0);
    assert.equal(state.activeDownloads, 0);
});

test('a response setup failure after reservation acquisition releases its slot', async () => {
    const res = new MockResponse();
    res.setHeader = () => { throw new Error('header setup failed'); };
    const { state, responsePromise } = await withReservedResponse((response) => {
        response.setHeader('Content-Type', 'application/octet-stream');
        return response.send(Buffer.from('data'));
    }, { res });

    await assert.rejects(responsePromise, /header setup failed/);
    assert.equal(state.downloadCount, 0);
    assert.equal(state.activeDownloads, 0);
});

test('a response send failure after reservation acquisition releases its slot', async () => {
    const res = new MockResponse();
    res.send = () => { throw new Error('send failed'); };
    const { state, responsePromise } = await withReservedResponse(
        (response) => response.send(Buffer.from('data')),
        { res }
    );

    await assert.rejects(responsePromise, /send failed/);
    assert.equal(state.downloadCount, 0);
    assert.equal(state.activeDownloads, 0);
});

test('close before response completion releases the reservation without counting it', async () => {
    const { state, res, responsePromise } = await withReservedResponse(
        (response) => response.send(Buffer.from('data'))
    );
    await responsePromise;

    res.emit('close');
    await Promise.resolve();

    assert.equal(state.downloadCount, 0);
    assert.equal(state.activeDownloads, 0);
});

test('finish settles a successful response and increments the counter once', async () => {
    const { state, res, responsePromise } = await withReservedResponse(
        (response) => response.send(Buffer.from('data'))
    );
    await responsePromise;

    res.writableFinished = true;
    res.emit('finish');
    await Promise.resolve();

    assert.equal(state.downloadCount, 1);
    assert.equal(state.activeDownloads, 0);
});

test('finish followed by close does not settle or count the reservation twice', async () => {
    let completedCallbacks = 0;
    const { state, res, responsePromise } = await withReservedResponse(
        (response) => response.send(Buffer.from('data')),
        { onCompleted: () => { completedCallbacks += 1; } }
    );
    await responsePromise;

    res.writableFinished = true;
    res.emit('finish');
    res.emit('close');
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(state.downloadCount, 1);
    assert.equal(state.activeDownloads, 0);
    assert.equal(completedCallbacks, 1);
});

test('settlement failures are logged and the reservation is recovered after its lease expires', async () => {
    const { model, state, responsePromise } = await withReservedResponse(
        (response) => response.send(Buffer.from('data'))
    );
    const originalUpdateOne = model.updateOne.bind(model);
    let settlementAttempts = 0;
    model.updateOne = async (...args) => {
        settlementAttempts += 1;
        throw new Error('MongoDB unavailable');
    };

    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args);
    try {
        await responsePromise;
        // A send failure forces the unsuccessful settlement attempt.
        const res = new MockResponse();
        const reservationId = state.activeDownloadReservations[0].id;
        res.send = () => { throw new Error('send failed'); };
        await assert.rejects(runReservedDownloadResponse({
            ShareLink: model,
            shareId: state._id,
            reservationId,
            res,
            sendResponse: () => res.send()
        }), /send failed/);
    } finally {
        console.error = originalError;
    }

    assert.ok(errors.some((args) => String(args[0]).includes('Could not finalize')));
    assert.equal(settlementAttempts, 3);
    assert.equal(state.downloadCount, 0);
    assert.equal(state.activeDownloads, 1);

    model.updateOne = originalUpdateOne;
    model.now = new Date(model.now.getTime() + RESERVATION_LEASE_MS + 1);
    const replacement = await reserveDownloadSlot(model, state._id, model.now);
    assert.ok(replacement);
    assert.equal(state.activeDownloads, 1);
    assert.equal(state.downloadCount, 0);
});

test('transient settlement failures retry the same reservation ID and then succeed', async () => {
    const { model, state } = mockShareLink(1);
    const reservationId = await reserveDownloadSlot(model, state._id, model.now);
    const originalUpdateOne = model.updateOne.bind(model);
    const attemptedIds = [];
    let failuresRemaining = 2;
    model.updateOne = async (filter, ...args) => {
        attemptedIds.push(filter['activeDownloadReservations.id']);
        if (failuresRemaining > 0) {
            failuresRemaining -= 1;
            throw new Error('temporary MongoDB failure');
        }
        return originalUpdateOne(filter, ...args);
    };

    await runReservedDownloadResponse({
        ShareLink: model,
        shareId: state._id,
        reservationId,
        res: new MockResponse(),
        sendResponse: (settle) => settle(true)
    });

    assert.deepEqual(attemptedIds, [reservationId, reservationId, reservationId]);
    assert.equal(state.downloadCount, 1);
    assert.equal(state.activeDownloads, 0);
});

test('exhausted settlement retries log failure and leave lease expiry recovery available', async () => {
    const { model, state } = mockShareLink(1);
    const reservationId = await reserveDownloadSlot(model, state._id, model.now);
    const originalUpdateOne = model.updateOne.bind(model);
    let attempts = 0;
    model.updateOne = async (filter) => {
        attempts += 1;
        assert.equal(filter._id, state._id);
        assert.equal(filter['activeDownloadReservations.id'], reservationId);
        throw new Error('MongoDB unavailable');
    };

    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args);
    try {
        await runReservedDownloadResponse({
            ShareLink: model,
            shareId: state._id,
            reservationId,
            res: new MockResponse(),
            sendResponse: (settle) => settle(false)
        });
    } finally {
        console.error = originalError;
    }

    assert.equal(attempts, 3);
    assert.ok(errors.some((args) => String(args[0]).includes('Could not finalize')));
    assert.equal(state.downloadCount, 0);
    assert.equal(state.activeDownloads, 1);

    model.updateOne = originalUpdateOne;
    model.now = new Date(model.now.getTime() + RESERVATION_LEASE_MS + 1);
    const replacement = await reserveDownloadSlot(model, state._id, model.now);
    assert.ok(replacement);
    assert.equal(state.activeDownloads, 1);
    assert.equal(state.downloadCount, 0);
});

test('retry after a lost settlement acknowledgement cannot increment twice', async () => {
    const { model, state } = mockShareLink(1);
    const reservationId = await reserveDownloadSlot(model, state._id, model.now);
    const originalUpdateOne = model.updateOne.bind(model);
    let attempts = 0;
    const attemptedIds = [];
    model.updateOne = async (filter, ...args) => {
        attempts += 1;
        attemptedIds.push(filter['activeDownloadReservations.id']);
        const result = await originalUpdateOne(filter, ...args);
        if (attempts === 1) throw new Error('acknowledgement lost after write');
        return result;
    };

    await runReservedDownloadResponse({
        ShareLink: model,
        shareId: state._id,
        reservationId,
        res: new MockResponse(),
        sendResponse: (settle) => settle(true)
    });

    assert.equal(attempts, 2);
    assert.deepEqual(attemptedIds, [reservationId, reservationId]);
    assert.equal(state.downloadCount, 1);
    assert.equal(state.activeDownloads, 0);
});

test('close and finish during retries share one lifecycle settlement sequence', async () => {
    const { model, state, res, responsePromise } = await withReservedResponse(
        (response) => response.send(Buffer.from('data'))
    );
    const originalUpdateOne = model.updateOne.bind(model);
    let attempts = 0;
    model.updateOne = async (...args) => {
        attempts += 1;
        if (attempts < 3) throw new Error('temporary MongoDB failure');
        return originalUpdateOne(...args);
    };

    await responsePromise;
    res.emit('close');
    res.writableFinished = true;
    res.emit('finish');
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(attempts, 3);
    assert.equal(state.downloadCount, 0);
    assert.equal(state.activeDownloads, 0);
});
