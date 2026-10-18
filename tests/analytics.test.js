'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const request = require('supertest');
const analyticsRouter = require('../routes/analytics');

const fixedNow = new Date('2026-10-18T00:00:00.000Z');

function makeModels({ authenticated = true } = {}) {
    const state = { filePipeline: null, sharePipeline: null, activityPipeline: null, downloadQuery: null, recentQuery: null };
    const fileResult = [{
        totals: [{ totalFiles: 3, storageBytes: 3584, averageBytes: 1194.6, filesWithIntegrityRecord: 2 }],
        categories: [{ _id: 'document', files: 2, bytes: 3072 }, { _id: 'image', files: 1, bytes: 512 }],
        largest: [{ name: 'report.pdf', category: 'document', size: 2048, uploadedAt: new Date('2026-10-10T00:00:00Z') }]
    }];
    const shareResult = [{
        summary: [{ totalShares: 4, activeShares: 2, expiredShares: 1, revokedShares: 1, limitReachedShares: 0, expiringSoon: 1, passwordProtected: 2, downloadLimitedShares: 3, remainingLimitedDownloads: 5, successfulShareDownloads: 12 }],
        downloadsByFile: [{ name: 'report.pdf', downloads: 3, maximum: 5, remaining: 2, expiresAt: null }]
    }];
    const activityResult = [
        { date: '2026-10-17', uploads: 2, downloads: 1, sharesCreated: 1, shareAccesses: 0, deletions: 0, sharesRevoked: 0 },
        { date: '2026-10-18', uploads: 1, downloads: 1, sharesCreated: 0, shareAccesses: 1, deletions: 1, sharesRevoked: 0 }
    ];
    const recent = [{ action: 'file_upload', status: 'success', description: 'File uploaded: report.pdf', fileName: 'report.pdf', createdAt: fixedNow }];

    const FileModel = { aggregate(pipeline) { state.filePipeline = pipeline; return Promise.resolve(fileResult); } };
    const ShareLinkModel = { aggregate(pipeline) { state.sharePipeline = pipeline; return Promise.resolve(shareResult); } };
    const AuditLogModel = {
        aggregate(pipeline) { state.activityPipeline = pipeline; return Promise.resolve(activityResult); },
        countDocuments(query) { state.downloadQuery = query; return Promise.resolve(4); },
        find(query) {
            state.recentQuery = query;
            const chain = {
                select() { return chain; },
                sort() { return chain; },
                limit() { return chain; },
                lean() { return Promise.resolve(recent); }
            };
            return chain;
        }
    };
    const auth = (req, res, next) => {
        if (!authenticated) return res.status(401).json({ error: 'Authentication required.' });
        req.authUser = { id: '507f1f77bcf86cd799439011' };
        return next();
    };
    return { state, router: analyticsRouter.createAnalyticsRouter({ FileModel, ShareLinkModel, AuditLogModel, auth, clock: () => fixedNow }) };
}

test('analytics summary uses authenticated ownership and returns calculated real-data metrics', async () => {
    const { state, router } = makeModels();
    const app = express().use(router);
    const response = await request(app).get('/summary?range=7d&userId=someone-else');

    assert.equal(response.status, 200);
    assert.equal(response.body.summary.totalFiles, 3);
    assert.equal(response.body.summary.storageBytes, 3584);
    assert.equal(response.body.summary.activeShares, 2);
    assert.equal(response.body.summary.totalDownloads, 16);
    assert.equal(response.body.summary.uploadsInPeriod, 3);
    assert.equal(response.body.summary.downloadsInPeriod, 2);
    assert.equal(response.body.summary.expiringSoon, 1);
    assert.equal(response.body.summary.integrityRecordsMissing, 1);
    assert.equal(response.body.storage.largest[0].name, 'report.pdf');
    assert.equal(response.body.shares.passwordProtected, 2);
    assert.equal(response.body.shares.downloadLimited, 3);
    assert.equal(response.body.shares.remainingLimitedDownloads, 5);
    assert.equal(response.body.downloadsBySharedFile[0].downloads, 3);
    assert.match(response.body.trackingNotes.activity, /visitor/);
    assert.match(response.body.trackingNotes.activity, /deleted-link counters/);
    assert.equal(response.body.recentActivity.length, 1);
    assert.equal(JSON.stringify(response.body).includes('passwordHash'), false);
    assert.equal(JSON.stringify(response.body).includes('tokenCiphertext'), false);

    const fileMatch = state.filePipeline[0].$match;
    const shareMatch = state.sharePipeline[0].$match;
    const activityMatch = state.activityPipeline[0].$match;
    assert.equal(String(fileMatch.ownerId), '507f1f77bcf86cd799439011');
    assert.equal(String(shareMatch.ownerId), '507f1f77bcf86cd799439011');
    assert.equal(String(activityMatch.userId), '507f1f77bcf86cd799439011');
    assert.equal(String(state.downloadQuery.userId), '507f1f77bcf86cd799439011');
    assert.equal(String(state.recentQuery.userId), '507f1f77bcf86cd799439011');
    assert.ok(activityMatch.createdAt.$gte instanceof Date);
    assert.equal(activityMatch.createdAt.$lte.toISOString(), fixedNow.toISOString());
    assert.equal(state.recentQuery.createdAt.$lte.toISOString(), fixedNow.toISOString());
});

test('all-time activity and recent events still exclude future-dated audit records', async () => {
    const { state, router } = makeModels();
    const response = await request(express().use(router)).get('/summary?range=all');

    assert.equal(response.status, 200);
    assert.equal(state.activityPipeline[0].$match.createdAt.$lte.toISOString(), fixedNow.toISOString());
    assert.equal(state.activityPipeline[0].$match.createdAt.$gte, undefined);
    assert.equal(state.recentQuery.createdAt.$lte.toISOString(), fixedNow.toISOString());
    assert.equal(state.recentQuery.createdAt.$gte, undefined);
});

test('analytics refuses unauthenticated requests before querying data', async () => {
    const { state, router } = makeModels({ authenticated: false });
    const response = await request(express().use(router)).get('/summary');
    assert.equal(response.status, 401);
    assert.equal(state.filePipeline, null);
    assert.equal(state.sharePipeline, null);
});

test('analytics validates the selected range before database access', async () => {
    const { state, router } = makeModels();
    const response = await request(express().use(router)).get('/summary?range=365d');
    assert.equal(response.status, 400);
    assert.equal(state.filePipeline, null);
    assert.equal(state.activityPipeline, null);
});

test('analytics time-range helper supports bounded ranges and all time', () => {
    const now = new Date('2026-10-18T00:00:00.000Z');
    assert.equal(analyticsRouter.makeDateRange('7d', now).start.toISOString(), '2026-10-11T00:00:00.000Z');
    assert.equal(analyticsRouter.makeDateRange('all', now).start, null);
    assert.equal(analyticsRouter.makeDateRange('bad', now), null);
});
