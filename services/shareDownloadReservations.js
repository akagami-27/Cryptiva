'use strict';

const crypto = require('crypto');

const RESERVATION_LEASE_MS = 2 * 60 * 1000;

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

module.exports = {
    RESERVATION_LEASE_MS,
    pruneExpiredDownloadReservations,
    reserveDownloadSlot,
    renewDownloadReservation,
    renewReservationOrAbort,
    settleDownloadReservation
};
