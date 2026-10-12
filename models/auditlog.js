'use strict';

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: false,
            index: true
        },

        username: {
            type: String,
            trim: true,
            maxlength: 20,
            default: null
        },

        action: {
            type: String,
            enum: [
                'login_success',
                'login_failed',
                'logout',

                'file_upload',
                'file_download',
                'file_delete',

                'share_created',
                'share_updated',
                'share_accessed',
                'share_password_failed',
                'share_download',
                'share_download_limit_reached',
                'share_expired',
                'share_revoked',

                'password_changed',
                'profile_updated',

                'security_event'
            ],
            required: true,
            index: true
        },

        status: {
            type: String,
            enum: [
                'success',
                'failed',
                'blocked',
                'denied'
            ],
            required: true,
            index: true
        },

        fileId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'File',
            default: null,
            index: true
        },

        fileName: {
            type: String,
            trim: true,
            maxlength: 255,
            default: null
        },

        shareId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ShareLink',
            default: null,
            index: true
        },

        description: {
            type: String,
            required: true,
            maxlength: 500
        },

        ipAddress: {
            type: String,
            maxlength: 100,
            default: null
        },

        userAgent: {
            type: String,
            maxlength: 1000,
            default: null
        },

        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        }
    },
    {
        timestamps: true,
        collection: 'auditLogs'
    }
);


/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

auditLogSchema.index({
    userId: 1,
    createdAt: -1
});


auditLogSchema.index({
    action: 1,
    createdAt: -1
});


auditLogSchema.index({
    fileId: 1,
    createdAt: -1
});


auditLogSchema.index({
    shareId: 1,
    createdAt: -1
});


module.exports =
    mongoose.model(
        'AuditLog',
        auditLogSchema
    );