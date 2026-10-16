'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const File = require('../models/file');
const ShareLink = require('../models/shareLink');
const AuditLog = require('../models/auditlog');

const router = express.Router();
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;
const RESULT_LIMIT = 5;
const FILE_CANDIDATE_LIMIT = 20;

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function invalidQuery(res) {
    return res.status(400).json({
        success: false,
        error: 'Search query must be between 2 and 80 characters.'
    });
}

router.get('/', requireAuth, async (req, res) => {
    const rawQuery = req.query.q;
    if (typeof rawQuery !== 'string') return invalidQuery(res);

    const query = rawQuery.trim();
    if (
        query.length < MIN_QUERY_LENGTH ||
        query.length > MAX_QUERY_LENGTH ||
        /[\u0000-\u001f\u007f]/.test(query)
    ) {
        return invalidQuery(res);
    }

    const userId = req.authUser?.id;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const literal = new RegExp(escapeRegex(query), 'i');

    try {
        const [files, activities] = await Promise.all([
            File.find({
                ownerId: userId,
                lifecycle: { $in: ['active', null] },
                originalName: literal
            })
                .select('_id originalName size createdAt')
                .sort({ createdAt: -1, _id: -1 })
                .limit(FILE_CANDIDATE_LIMIT)
                .lean(),
            AuditLog.find({
                userId,
                $or: [
                    { action: literal },
                    { fileName: literal },
                    { description: literal }
                ]
            })
                .select('_id action fileName description createdAt')
                .sort({ createdAt: -1, _id: -1 })
                .limit(RESULT_LIMIT)
                .lean()
        ]);

        const fileById = new Map(files.map(file => [String(file._id), file]));
        const shares = files.length
            ? await ShareLink.find({
                ownerId: userId,
                fileId: { $in: files.map(file => file._id) },
                revokedAt: null
            })
                .select('_id fileId createdAt')
                .sort({ createdAt: -1, _id: -1 })
                .limit(RESULT_LIMIT)
                .lean()
            : [];

        const results = [
            ...files.slice(0, RESULT_LIMIT).map(file => ({
                id: String(file._id),
                type: 'file',
                title: file.originalName,
                size: Number(file.size) || 0,
                createdAt: file.createdAt || null
            })),
            ...shares.flatMap(share => {
                const file = fileById.get(String(share.fileId));
                return file ? [{
                    id: String(share._id),
                    type: 'share',
                    title: file.originalName,
                    createdAt: share.createdAt || null
                }] : [];
            }),
            ...activities.map(activity => ({
                id: String(activity._id),
                type: 'activity',
                title: String(activity.action || 'Activity').replaceAll('_', ' '),
                detail: String(activity.description || '').slice(0, 160),
                fileName: activity.fileName || null,
                createdAt: activity.createdAt || null
            }))
        ];

        return res.status(200).json({ success: true, query, results });
    } catch (error) {
        console.error('Global search failed:', error);
        return res.status(500).json({ success: false, error: 'Unable to search records.' });
    }
});

module.exports = router;
