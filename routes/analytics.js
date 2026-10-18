'use strict';

const express = require('express');
const mongoose = require('mongoose');
const File = require('../models/file');
const ShareLink = require('../models/shareLink');
const AuditLog = require('../models/auditlog');
const { requireAuth } = require('../middleware/auth');

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const OWNER_ACTIONS = [
    'file_upload', 'file_download', 'file_delete',
    'share_created', 'share_updated', 'share_revoked'
];
const SHARE_ACTIONS = ['share_accessed', 'share_download'];
const RECENT_ACTIONS = [...OWNER_ACTIONS, ...SHARE_ACTIONS, 'share_password_failed'];

function makeDateRange(range, now) {
    if (range === 'all') return { range, start: null, end: now };
    if (!Object.hasOwn(RANGE_DAYS, range)) return null;
    return {
        range,
        start: new Date(now.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000),
        end: now
    };
}

function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function filePipeline(ownerId) {
    const hasHash = { $regexMatch: {
        input: { $convert: { input: '$integrity.sha256', to: 'string', onError: '', onNull: '' } },
        regex: '^[a-fA-F0-9]{64}$'
    } };
    return [
        { $match: { ownerId, lifecycle: { $in: ['active', null] } } },
        { $facet: {
            totals: [{ $group: {
                _id: null,
                totalFiles: { $sum: 1 },
                storageBytes: { $sum: { $ifNull: ['$size', 0] } },
                averageBytes: { $avg: '$size' },
                filesWithIntegrityRecord: { $sum: { $cond: [hasHash, 1, 0] } }
            } }],
            categories: [{ $group: {
                _id: { $ifNull: ['$category', 'other'] },
                files: { $sum: 1 },
                bytes: { $sum: { $ifNull: ['$size', 0] } }
            } }, { $sort: { bytes: -1, _id: 1 } }],
            largest: [{ $sort: { size: -1, createdAt: -1 } }, { $limit: 5 }, { $project: {
                _id: 0,
                name: '$originalName',
                category: { $ifNull: ['$category', 'other'] },
                size: { $ifNull: ['$size', 0] },
                uploadedAt: '$createdAt'
            } }],
            recentUploads: [{ $sort: { createdAt: -1 } }, { $limit: 5 }, { $project: {
                _id: 0,
                name: '$originalName',
                category: { $ifNull: ['$category', 'other'] },
                size: { $ifNull: ['$size', 0] },
                uploadedAt: '$createdAt'
            } }]
        } }
    ];
}

function sharePipeline(ownerId, now, expiresSoonAt) {
    const isRevoked = { $ne: [{ $ifNull: ['$revokedAt', null] }, null] };
    const hasExpiry = { $ne: [{ $ifNull: ['$expiresAt', null] }, null] };
    const hasLimit = { $ne: [{ $ifNull: ['$maxDownloads', null] }, null] };
    const limitReached = { $and: [hasLimit, { $gte: [{ $ifNull: ['$downloadCount', 0] }, '$maxDownloads'] }] };
    const active = { $and: [
        { $eq: [{ $ifNull: ['$revokedAt', null] }, null] },
        { $or: [{ $eq: [{ $ifNull: ['$expiresAt', null] }, null] }, { $gt: ['$expiresAt', now] }] },
        { $or: [{ $eq: [{ $ifNull: ['$maxDownloads', null] }, null] }, { $lt: [{ $ifNull: ['$downloadCount', 0] }, '$maxDownloads'] }] }
    ] };

    return [
        { $match: { ownerId } },
        { $project: {
            ownerId: 1,
            fileId: 1,
            createdAt: 1,
            expiresAt: 1,
            revokedAt: 1,
            maxDownloads: 1,
            downloadCount: 1,
            isRevoked,
            isExpired: { $and: [hasExpiry, { $lte: ['$expiresAt', now] }] },
            isLimitReached: limitReached,
            isActive: active,
            isExpiringSoon: { $and: [active, hasExpiry, { $gt: ['$expiresAt', now] }, { $lte: ['$expiresAt', expiresSoonAt] }] },
            isPasswordProtected: { $ne: [{ $ifNull: ['$passwordHash', null] }, null] }
        } },
        { $facet: {
            summary: [{ $group: {
                _id: null,
                totalShares: { $sum: 1 },
                activeShares: { $sum: { $cond: ['$isActive', 1, 0] } },
                expiredShares: { $sum: { $cond: [{ $and: [{ $eq: ['$isRevoked', false] }, '$isExpired'] }, 1, 0] } },
                revokedShares: { $sum: { $cond: ['$isRevoked', 1, 0] } },
                limitReachedShares: { $sum: { $cond: [{ $and: [{ $eq: ['$isRevoked', false] }, { $eq: ['$isExpired', false] }, '$isLimitReached'] }, 1, 0] } },
                expiringSoon: { $sum: { $cond: ['$isExpiringSoon', 1, 0] } },
                passwordProtected: { $sum: { $cond: ['$isPasswordProtected', 1, 0] } },
                downloadLimitedShares: { $sum: { $cond: [hasLimit, 1, 0] } },
                remainingLimitedDownloads: { $sum: { $cond: [
                    { $and: ['$isActive', hasLimit] },
                    { $max: [0, { $subtract: ['$maxDownloads', { $ifNull: ['$downloadCount', 0] }] }] },
                    0
                ] } },
                successfulShareDownloads: { $sum: { $ifNull: ['$downloadCount', 0] } }
            } }],
            downloadsByFile: [
                { $match: { downloadCount: { $gt: 0 } } },
                { $sort: { downloadCount: -1, createdAt: -1 } },
                { $limit: 5 },
                { $lookup: { from: 'files', localField: 'fileId', foreignField: '_id', as: 'file' } },
                { $unwind: '$file' },
                { $match: { 'file.ownerId': ownerId, 'file.lifecycle': { $in: ['active', null] } } },
                { $project: {
                    _id: 0,
                    name: '$file.originalName',
                    downloads: { $ifNull: ['$downloadCount', 0] },
                    maximum: { $ifNull: ['$maxDownloads', null] },
                    remaining: { $cond: [hasLimit, { $max: [0, { $subtract: ['$maxDownloads', { $ifNull: ['$downloadCount', 0] }] }] }, null] },
                    expiresAt: 1
                } }
            ]
        } }
    ];
}

function activityPipeline(ownerId, range, now) {
    const match = {
        userId: ownerId,
        status: 'success',
        action: { $in: [...OWNER_ACTIONS, ...SHARE_ACTIONS] }
    };
    match.createdAt = { $type: 'date', $lte: now };
    if (range.start) match.createdAt.$gte = range.start;

    return [
        { $match: match },
        { $group: {
            _id: { $dateToString: { format: range.range === 'all' ? '%Y-%m' : '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
            uploads: { $sum: { $cond: [{ $eq: ['$action', 'file_upload'] }, 1, 0] } },
            downloads: { $sum: { $cond: [{ $in: ['$action', ['file_download', 'share_download']] }, 1, 0] } },
            sharesCreated: { $sum: { $cond: [{ $eq: ['$action', 'share_created'] }, 1, 0] } },
            shareAccesses: { $sum: { $cond: [{ $eq: ['$action', 'share_accessed'] }, 1, 0] } },
            deletions: { $sum: { $cond: [{ $eq: ['$action', 'file_delete'] }, 1, 0] } },
            sharesRevoked: { $sum: { $cond: [{ $eq: ['$action', 'share_revoked'] }, 1, 0] } }
        } },
        { $project: { _id: 0, date: '$_id', uploads: 1, downloads: 1, sharesCreated: 1, shareAccesses: 1, deletions: 1, sharesRevoked: 1 } },
        { $sort: { date: 1 } }
    ];
}

function createAnalyticsRouter({
    FileModel = File,
    ShareLinkModel = ShareLink,
    AuditLogModel = AuditLog,
    auth = requireAuth,
    clock = () => new Date()
} = {}) {
    const router = express.Router();

    router.get('/summary', auth, async (req, res) => {
        const authenticatedId = req.authUser?.id;
        if (!mongoose.Types.ObjectId.isValid(authenticatedId)) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const ownerId = new mongoose.Types.ObjectId(authenticatedId);

        const now = clock();
        const range = makeDateRange(String(req.query.range || '30d'), now);
        if (!range) return res.status(400).json({ error: 'Range must be 7d, 30d, 90d, or all.' });

        const expiresSoonAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const recentMatch = {
            userId: ownerId,
            action: { $in: RECENT_ACTIONS }
        };
        recentMatch.createdAt = { $type: 'date', $lte: now };
        if (range.start) recentMatch.createdAt.$gte = range.start;

        try {
            const [fileResult, shareResult, activity, directDownloads, recent] = await Promise.all([
                FileModel.aggregate(filePipeline(ownerId)),
                ShareLinkModel.aggregate(sharePipeline(ownerId, now, expiresSoonAt)),
                AuditLogModel.aggregate(activityPipeline(ownerId, range, now)),
                AuditLogModel.countDocuments({ userId: ownerId, action: 'file_download', status: 'success' }),
                AuditLogModel.find(recentMatch)
                    .select('action status description fileName createdAt')
                    .sort({ createdAt: -1 })
                    .limit(8)
                    .lean()
            ]);

            const fileStats = fileResult?.[0] || {};
            const totals = fileStats.totals?.[0] || {};
            const shareFacets = shareResult?.[0] || {};
            const shares = shareFacets.summary?.[0] || {};
            const uploadsInPeriod = activity.reduce((sum, point) => sum + Number(point.uploads || 0), 0);
            const downloadsInPeriod = activity.reduce((sum, point) => sum + Number(point.downloads || 0), 0);
            const largest = fileStats.largest || [];
            const integrityMissing = Math.max(0, Number(totals.totalFiles || 0) - Number(totals.filesWithIntegrityRecord || 0));
            const insights = [];

            if (Number(shares.expiringSoon || 0) > 0) {
                insights.push({
                    message: `${shares.expiringSoon} sharing link${shares.expiringSoon === 1 ? '' : 's'} expire within the next 7 days.`,
                    href: '/shared',
                    label: 'Review shares'
                });
            }
            if (Number(shares.limitReachedShares || 0) > 0) {
                insights.push({
                    message: `${shares.limitReachedShares} sharing link${shares.limitReachedShares === 1 ? ' has' : 's have'} reached its download limit.`,
                    href: '/shared',
                    label: 'Review shares'
                });
            }
            if (largest[0]) {
                insights.push({
                    message: `Your largest file is ${largest[0].name} (${formatBytes(largest[0].size)}).`,
                    href: '/files',
                    label: 'View files'
                });
            }
            if (integrityMissing > 0) {
                insights.push({
                    message: `${integrityMissing} file${integrityMissing === 1 ? ' is' : 's are'} missing a valid SHA-256 integrity record.`,
                    href: '/files',
                    label: 'Review files'
                });
            }
            if (insights.length === 0) insights.push({ message: 'No notable file or sharing changes are recorded for this account.', href: '/activity', label: 'View activity' });

            return res.json({
                range: range.range,
                rangeStart: range.start,
                generatedAt: now,
                summary: {
                    totalFiles: Number(totals.totalFiles || 0),
                    storageBytes: Number(totals.storageBytes || 0),
                    averageBytes: Math.round(Number(totals.averageBytes || 0)),
                    activeShares: Number(shares.activeShares || 0),
                    totalDownloads: Number(directDownloads || 0) + Number(shares.successfulShareDownloads || 0),
                    uploadsInPeriod,
                    downloadsInPeriod,
                    expiringSoon: Number(shares.expiringSoon || 0),
                    filesWithIntegrityRecord: Number(totals.filesWithIntegrityRecord || 0),
                    integrityRecordsMissing: integrityMissing
                },
                shares: {
                    total: Number(shares.totalShares || 0),
                    active: Number(shares.activeShares || 0),
                    expired: Number(shares.expiredShares || 0),
                    revoked: Number(shares.revokedShares || 0),
                    limitReached: Number(shares.limitReachedShares || 0),
                    expiringSoon: Number(shares.expiringSoon || 0),
                    passwordProtected: Number(shares.passwordProtected || 0),
                    downloadLimited: Number(shares.downloadLimitedShares || 0),
                    remainingLimitedDownloads: Number(shares.remainingLimitedDownloads || 0)
                },
                storage: {
                    basis: 'logical-file-size',
                    categories: (fileStats.categories || []).map((item) => ({ category: item._id || 'other', files: Number(item.files || 0), bytes: Number(item.bytes || 0) })),
                    largest,
                    recentUploads: fileStats.recentUploads || []
                },
                downloadsBySharedFile: shareFacets.downloadsByFile || [],
                activity,
                recentActivity: (recent || []).map((event) => ({
                    action: event.action,
                    status: event.status,
                    description: event.description,
                    fileName: event.fileName || null,
                    createdAt: event.createdAt
                })),
                insights,
                trackingNotes: {
                    storage: 'Storage is the sum of logical file sizes; encryption overhead and storage-provider billing are not measured.',
                    integrity: 'The dashboard reports whether a SHA-256 record is present. Historical verification results are not recorded.',
                    malware: 'Malware scan outcomes are not retained in the file metadata and are not reported here.',
                    activity: 'Period activity uses audit events assigned to this account. Public share visits and downloads are attributed to the authenticated visitor, when available, rather than the link owner. The all-time download total also includes counters on current owned share links; deleted-link counters are not retained.'
                }
            });
        } catch (error) {
            console.error('File analytics request failed:', error.message);
            return res.status(500).json({ error: 'Unable to load file analytics.' });
        }
    });

    return router;
}

const router = createAnalyticsRouter();
router.createAnalyticsRouter = createAnalyticsRouter;
router.makeDateRange = makeDateRange;
router.filePipeline = filePipeline;
router.sharePipeline = sharePipeline;
router.activityPipeline = activityPipeline;

module.exports = router;
