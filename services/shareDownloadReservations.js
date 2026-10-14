'use strict';

const crypto = require('crypto');

const RESERVATION_LEASE_MS = 2 * 60 * 1000;
const SETTLEMENT_RETRY_DELAYS_MS = [50, 100];

function liveReservationsExpression(now) {
    return {
        $filter: {
            input: { $ifNull: ['$activeDownloadReservations', []] },
            as: 'reservation',
            cond: { $gt: ['$$reservation.expiresAt', now] }
        }
    };
}

async function pruneExpiredDownloadReservations(ShareLink, shareId, now = new Date()) {
    const live = liveReservationsExpression(now);
    await ShareLink.updateOne(
        { _id: shareId, 'activeDownloadReservations.expiresAt': { $lte: now } },
        [{ $set: {
            activeDownloadReservations: live,
            activeDownloads: { $size: live }
        } }],
        { updatePipeline: true }
    );
}

async function reserveDownloadSlot(ShareLink, shareId, now = new Date()) {
    await pruneExpiredDownloadReservations(ShareLink, shareId, now);
    const reservationId = crypto.randomUUID();
    const live = liveReservationsExpression(now);
    const filter = {
        _id: shareId,
        revokedAt: null,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        $expr: {
            $or: [
                { $eq: [{ $ifNull: ['$maxDownloads', null] }, null] },
                {
                    $lt: [
                        { $add: [{ $ifNull: ['$downloadCount', 0] }, { $size: live }] },
                        '$maxDownloads'
                    ]
                }
            ]
        }
    };
    const reserved = {
        id: reservationId,
        expiresAt: new Date(now.getTime() + RESERVATION_LEASE_MS)
    };
    const nextReservations = { $concatArrays: [live, [reserved]] };
    const updated = await ShareLink.findOneAndUpdate(
        filter,
        [{ $set: {
            activeDownloadReservations: nextReservations,
            activeDownloads: { $size: nextReservations }
        } }],
        { returnDocument: 'after', updatePipeline: true }
    );
    return updated ? reservationId : null;
}

async function renewDownloadReservation(ShareLink, shareId, reservationId, now = new Date()) {
    const expiresAt = new Date(now.getTime() + RESERVATION_LEASE_MS);
    const updated = await ShareLink.updateOne(
        {
            _id: shareId,
            activeDownloadReservations: {
                $elemMatch: {
                    id: reservationId,
                    expiresAt: { $gt: now }
                }
            }
        },
        [{ $set: {
            activeDownloadReservations: {
                $map: {
                    input: { $ifNull: ['$activeDownloadReservations', []] },
                    as: 'reservation',
                    in: {
                        $cond: [
                            { $eq: ['$$reservation.id', reservationId] },
                            { id: '$$reservation.id', expiresAt },
                            '$$reservation'
                        ]
                    }
                }
            }
        } }],
        { updatePipeline: true }
    );
    return updated.modifiedCount > 0;
}

async function renewReservationOrAbort(ShareLink, shareId, reservationId, res, settle) {
    let renewed = false;
    try {
        renewed = await renewDownloadReservation(ShareLink, shareId, reservationId);
    } catch (renewalError) {
        console.error('Could not renew shared download reservation:', {
            shareId: String(shareId),
            reservationId,
            error: renewalError.message
        });
    }

    if (renewed) return true;

    console.error('Shared download reservation renewal was rejected:', {
        shareId: String(shareId),
        reservationId
    });

    if (!res.destroyed) res.destroy();
    try {
        await settle(false);
    } catch (settlementError) {
        console.error('Could not settle failed shared download reservation:', {
            shareId: String(shareId),
            reservationId,
            error: settlementError.message
        });
    }
    return false;
}

async function settleDownloadReservation(ShareLink, shareId, reservationId, completed) {
    const remaining = {
        $filter: {
            input: { $ifNull: ['$activeDownloadReservations', []] },
            as: 'reservation',
            cond: { $ne: ['$$reservation.id', reservationId] }
        }
    };
    const result = await ShareLink.updateOne(
        { _id: shareId, 'activeDownloadReservations.id': reservationId },
        [{ $set: {
            activeDownloadReservations: remaining,
            activeDownloads: { $size: remaining },
            downloadCount: {
                $add: [{ $ifNull: ['$downloadCount', 0] }, completed ? 1 : 0]
            }
        } }],
        { updatePipeline: true }
    );
    return result.modifiedCount > 0;
}

async function settleDownloadReservationWithRetry(
    ShareLink,
    shareId,
    reservationId,
    completed
) {
    let lastError;
    for (let attempt = 0; attempt <= SETTLEMENT_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
            return await settleDownloadReservation(
                ShareLink,
                shareId,
                reservationId,
                completed
            );
        } catch (error) {
            lastError = error;
            if (attempt === SETTLEMENT_RETRY_DELAYS_MS.length) break;
            await new Promise((resolve) => {
                setTimeout(resolve, SETTLEMENT_RETRY_DELAYS_MS[attempt]);
            });
        }
    }

    throw lastError;
}

async function runReservedDownloadResponse({
    ShareLink,
    shareId,
    reservationId,
    res,
    sendResponse,
    onCompleted
}) {
    let settled = false;
    let heartbeat = null;
    const settle = async (completed) => {
        if (settled) return false;
        settled = true;
        if (heartbeat) clearInterval(heartbeat);

        try {
            // The settled latch above prevents lifecycle events from starting
            // competing retry sequences. Every retry retains the reservation ID.
            const settledReservation = await settleDownloadReservationWithRetry(
                ShareLink,
                shareId,
                reservationId,
                completed
            );
            if (completed && !settledReservation) {
                console.warn('Completed shared response had an expired reservation:', {
                    shareId: String(shareId),
                    reservationId
                });
            }
        } catch (settlementError) {
            // If all attempts fail, lease expiry remains the recovery path;
            // a completed response may then remain absent from downloadCount.
            console.error('Could not finalize shared download reservation:', {
                shareId: String(shareId),
                reservationId,
                completed,
                error: settlementError.message
            });
        }

        if (completed && onCompleted) {
            try {
                onCompleted();
            } catch (callbackError) {
                console.error('Shared download completion callback failed:', {
                    shareId: String(shareId),
                    reservationId,
                    error: callbackError.message
                });
            }
        }
        return true;
    };

    try {
        res.once('finish', () => { void settle(true); });
        res.once('close', () => {
            if (!res.writableFinished) void settle(false);
        });
        return await sendResponse(settle, (interval) => { heartbeat = interval; });
    } catch (error) {
        await settle(false);
        throw error;
    }
}

module.exports = {
    RESERVATION_LEASE_MS,
    pruneExpiredDownloadReservations,
    reserveDownloadSlot,
    renewDownloadReservation,
    renewReservationOrAbort,
    settleDownloadReservation,
    runReservedDownloadResponse
};
