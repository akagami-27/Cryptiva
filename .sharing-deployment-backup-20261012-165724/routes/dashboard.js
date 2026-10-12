'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

const { requireAuth } = require('../middleware/auth');

const File = require('../models/file');
const ShareLink = require('../models/shareLink');


/*
|--------------------------------------------------------------------------
| Dashboard Page
|--------------------------------------------------------------------------
*/

router.get(
    '/',
    requireAuth,
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                '..',
                'views',
                'dashboard.html'
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| Master Encryption Key
|--------------------------------------------------------------------------
*/

function getMasterEncryptionKey() {

    const encodedKey =
        process.env.MASTER_ENCRYPTION_KEY;


    if (!encodedKey) {

        throw new Error(
            'MASTER_ENCRYPTION_KEY is not defined.'
        );

    }


    const key =
        Buffer.from(
            encodedKey,
            'base64'
        );


    if (
        key.length !== 32
    ) {

        throw new Error(
            'MASTER_ENCRYPTION_KEY must decode to exactly 32 bytes.'
        );

    }


    return key;

}


/*
|--------------------------------------------------------------------------
| Decrypt Existing Share Token
|--------------------------------------------------------------------------
|
| Raw share tokens are encrypted in MongoDB.
|
| MongoDB stores:
|
| - tokenHash
| - tokenCiphertext
| - tokenIv
| - tokenAuthTag
|
| The raw token is only recovered server-side.
|--------------------------------------------------------------------------
*/

function decryptShareToken(
    share
) {

    if (
        !share ||
        !share.tokenCiphertext ||
        !share.tokenIv ||
        !share.tokenAuthTag
    ) {

        return null;

    }


    try {

        const key =
            getMasterEncryptionKey();


        const ciphertext =
            Buffer.from(
                share.tokenCiphertext,
                'base64'
            );


        const iv =
            Buffer.from(
                share.tokenIv,
                'base64'
            );


        const authTag =
            Buffer.from(
                share.tokenAuthTag,
                'base64'
            );


        if (
            iv.length !== 12 ||
            authTag.length !== 16 ||
            ciphertext.length === 0
        ) {

            return null;

        }


        const decipher =
            crypto.createDecipheriv(
                'aes-256-gcm',
                key,
                iv
            );


        decipher.setAuthTag(
            authTag
        );


        const plaintext =
            Buffer.concat([
                decipher.update(
                    ciphertext
                ),
                decipher.final()
            ]);


        return plaintext.toString(
            'utf8'
        );

    } catch (error) {

        console.error(
            'Share token decryption failed:',
            error.message
        );


        return null;

    }

}


/*
|--------------------------------------------------------------------------
| Dashboard Data
|--------------------------------------------------------------------------
|
| GET /dashboard/data
|
| Returns only safe metadata.
|
| Sensitive encryption material is NEVER returned.
|--------------------------------------------------------------------------
*/

router.get(
    '/data',
    requireAuth,
    async (req, res) => {

        try {

            /*
            |--------------------------------------------------------------------------
            | Authentication
            |--------------------------------------------------------------------------
            */

            if (
                !req.session ||
                !req.session.user ||
                !req.session.user.id
            ) {

                return res
                    .status(401)
                    .json({
                        success: false,
                        error:
                            'Authentication required.'
                    });

            }


            const userId =
                req.session.user.id;


            /*
            |--------------------------------------------------------------------------
            | Get Files
            |--------------------------------------------------------------------------
            */

            const files =
                await File
                    .find({
                        ownerId:
                            userId
                    })
                    .sort({
                        createdAt:
                            -1
                    })
                    .lean();


            /*
            |--------------------------------------------------------------------------
            | Get Share Links
            |--------------------------------------------------------------------------
            */

            const shareLinks =
                await ShareLink
                    .find({
                        ownerId:
                            userId
                    })
                    .sort({
                        createdAt:
                            -1
                    })
                    .lean();


            /*
            |--------------------------------------------------------------------------
            | Current Time
            |--------------------------------------------------------------------------
            */

            const now =
                new Date();


            /*
            |--------------------------------------------------------------------------
            | Active Shares
            |--------------------------------------------------------------------------
            */

            const activeShares =
                shareLinks.filter(
                    share => {

                        if (
                            share.revokedAt
                        ) {

                            return false;

                        }


                        if (
                            share.expiresAt &&
                            new Date(
                                share.expiresAt
                            ) <= now
                        ) {

                            return false;

                        }


                        if (
                            share.maxDownloads !== null &&
                            share.maxDownloads !== undefined &&
                            Number(
                                share.downloadCount || 0
                            ) >=
                            Number(
                                share.maxDownloads
                            )
                        ) {

                            return false;

                        }


                        return true;

                    }
                );


            /*
            |--------------------------------------------------------------------------
            | Map Active Shares To Files
            |--------------------------------------------------------------------------
            */

            const shareByFile =
                new Map();


            for (
                const share
                of activeShares
            ) {

                const fileId =
                    String(
                        share.fileId
                    );


                if (
                    !shareByFile.has(
                        fileId
                    )
                ) {

                    shareByFile.set(
                        fileId,
                        share
                    );

                }

            }


            /*
            |--------------------------------------------------------------------------
            | Total Storage
            |--------------------------------------------------------------------------
            */

            const totalSize =
                files.reduce(
                    (
                        total,
                        file
                    ) => {

                        return (
                            total +
                            Number(
                                file.size || 0
                            )
                        );

                    },
                    0
                );


            /*
            |--------------------------------------------------------------------------
            | Safe File Metadata
            |--------------------------------------------------------------------------
            */

            const safeFiles =
                files.map(
                    file => {

                        const activeShare =
                            shareByFile.get(
                                String(
                                    file._id
                                )
                            );


                        let shareUrl =
                            null;


                        let shareTokenAvailable =
                            false;


                        /*
                        |--------------------------------------------------------------------------
                        | Recover Share URL
                        |--------------------------------------------------------------------------
                        */

                        if (
                            activeShare
                        ) {

                            const rawToken =
                                decryptShareToken(
                                    activeShare
                                );


                            if (
                                rawToken
                            ) {

                                shareUrl =
                                    `/files/shared/${rawToken}`;

                                shareTokenAvailable =
                                    true;

                            }

                        }


                        return {

                            id:
                                String(
                                    file._id
                                ),

                            originalName:
                                file.originalName,

                            size:
                                Number(
                                    file.size || 0
                                ),

                            mimeType:
                                file.mimeType,

                            extension:
                                file.extension,

                            category:
                                file.category,

                            createdAt:
                                file.createdAt,

                            updatedAt:
                                file.updatedAt,

                            uploadedAt:
                                file.createdAt,

                            encryption: {

                                algorithm:
                                    file.encryption?.algorithm ||
                                    'aes-256-gcm'

                            },

                            integrity: {

                                sha256:
                                    file.integrity?.sha256 ||
                                    null,

                                verified:
                                    Boolean(
                                        file.integrity?.verified
                                    )

                            },

                            hasActiveShare:
                                Boolean(
                                    activeShare
                                ),

                            shareId:
                                activeShare
                                    ? String(
                                        activeShare._id
                                    )
                                    : null,

                            shareUrl,

                            shareTokenAvailable,

                            downloadCount:
                                activeShare
                                    ? Number(
                                        activeShare.downloadCount ||
                                        0
                                    )
                                    : 0,

                            maxDownloads:
                                activeShare &&
                                activeShare.maxDownloads !== null &&
                                activeShare.maxDownloads !== undefined
                                    ? Number(
                                        activeShare.maxDownloads
                                    )
                                    : null,

                            expiresAt:
                                activeShare
                                    ? activeShare.expiresAt ||
                                      null
                                    : null,

                            passwordProtected:
                                activeShare
                                    ? Boolean(
                                        activeShare.passwordHash
                                    )
                                    : false

                        };

                    }
                );


            /*
            |--------------------------------------------------------------------------
            | Response
            |--------------------------------------------------------------------------
            */

            return res
                .status(200)
                .json({

                    success:
                        true,

                    username:
                        req.session.user.username,

                    userId:
                        String(
                            userId
                        ),

                    fileCount:
                        safeFiles.length,

                    totalSize,

                    sharedCount:
                        activeShares.length,

                    files:
                        safeFiles,

                    serverTime:
                        new Date().toISOString()

                });

        } catch (error) {

            console.error(
                'Dashboard data error:',
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        'Unable to load dashboard data.'

                });

        }

    }
);


/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

module.exports =
    router;