'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const router = express.Router();

const { requireAuth } =
    require('../middleware/auth');

const ShareLink =
    require('../models/shareLink');

const File =
    require('../models/file');


/*
|--------------------------------------------------------------------------
| Decrypt Share Token
|--------------------------------------------------------------------------
*/

function decryptShareToken(
    share
) {

    const encodedKey =
        process.env.MASTER_ENCRYPTION_KEY;


    if (!encodedKey) {

        throw new Error(
            'MASTER_ENCRYPTION_KEY is not defined.'
        );

    }


    const masterKey =
        Buffer.from(
            encodedKey,
            'base64'
        );


    if (
        masterKey.length !== 32
    ) {

        throw new Error(
            'MASTER_ENCRYPTION_KEY must decode to exactly 32 bytes.'
        );

    }


    const decipher =
        crypto.createDecipheriv(
            'aes-256-gcm',
            masterKey,
            Buffer.from(
                share.tokenIv,
                'base64'
            )
        );


    decipher.setAuthTag(
        Buffer.from(
            share.tokenAuthTag,
            'base64'
        )
    );


    const rawToken =
        Buffer.concat([

            decipher.update(
                Buffer.from(
                    share.tokenCiphertext,
                    'base64'
                )
            ),

            decipher.final()

        ]).toString(
            'utf8'
        );


    /*
    |--------------------------------------------------------------------------
    | Verify Token Integrity
    |--------------------------------------------------------------------------
    */

    const calculatedHash =
        crypto
            .createHash(
                'sha256'
            )
            .update(
                rawToken
            )
            .digest(
                'hex'
            );


    if (
        calculatedHash !==
        share.tokenHash
    ) {

        throw new Error(
            'Share token integrity verification failed.'
        );

    }


    return rawToken;

}


/*
|--------------------------------------------------------------------------
| GET /shared
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
                'shared.html'
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| GET /shared/data
|--------------------------------------------------------------------------
*/

router.get(
    '/data',
    requireAuth,
    async (
        req,
        res
    ) => {

        try {

            const userId =
                req.session.user.id ||
                req.session.user._id;


            if (!userId) {

                return res
                    .status(401)
                    .json({

                        success:
                            false,

                        error:
                            'Authenticated user not found.'

                    });

            }


            /*
            |--------------------------------------------------------------------------
            | Owner-Scoped Shares
            |--------------------------------------------------------------------------
            */

            const shares =
                await ShareLink
                    .find({

                        ownerId:
                            userId,

                        revokedAt:
                            null

                    })
                    .sort({

                        createdAt:
                            -1

                    })
                    .lean();


            /*
            |--------------------------------------------------------------------------
            | Prevent Duplicate Display
            |--------------------------------------------------------------------------
            |
            | If old database records contain multiple shares for the same
            | file, only the newest one is returned.
            |
            |--------------------------------------------------------------------------
            */

            const uniqueShares =
                new Map();


            for (
                const share of shares
            ) {

                const fileId =
                    String(
                        share.fileId
                    );


                if (
                    !uniqueShares.has(
                        fileId
                    )
                ) {

                    uniqueShares.set(
                        fileId,
                        share
                    );

                }

            }


            const cleanShares =
                Array.from(
                    uniqueShares.values()
                );


            /*
            |--------------------------------------------------------------------------
            | Files
            |--------------------------------------------------------------------------
            */

            const fileIds =
                cleanShares.map(
                    share =>
                        share.fileId
                );


            const files =
                await File
                    .find({

                        _id: {
                            $in:
                                fileIds
                        },

                        ownerId:
                            userId

                    })
                    .select(
                        '_id originalName size mimeType extension category createdAt integrity'
                    )
                    .lean();


            const fileMap =
                new Map(
                    files.map(
                        file => [
                            String(
                                file._id
                            ),
                            file
                        ]
                    )
                );


            const now =
                Date.now();


            /*
            |--------------------------------------------------------------------------
            | Build Response
            |--------------------------------------------------------------------------
            */

            const sharedFiles =
                [];


            for (
                const share of cleanShares
            ) {

                const file =
                    fileMap.get(
                        String(
                            share.fileId
                        )
                    );


                if (!file) {
                    continue;
                }


                const expired =
                    Boolean(

                        share.expiresAt &&
                        new Date(
                            share.expiresAt
                        ).getTime() <=
                            now

                    );


                const downloadLimitReached =
                    Boolean(

                        share.maxDownloads !==
                            null &&
                        share.maxDownloads !==
                            undefined &&
                        Number(
                            share.downloadCount ||
                            0
                        ) >=
                            Number(
                                share.maxDownloads
                            )

                    );


                const active =
                    !expired &&
                    !downloadLimitReached;


                /*
                |--------------------------------------------------------------------------
                | Recover Share URL
                |--------------------------------------------------------------------------
                */

                let shareUrl =
                    null;


                try {

                    if (
                        share.tokenCiphertext &&
                        share.tokenIv &&
                        share.tokenAuthTag
                    ) {

                        const rawToken =
                            decryptShareToken(
                                share
                            );


                        shareUrl =
                            `/files/shared/${rawToken}`;

                    }

                } catch (error) {

                    console.error(
                        `Unable to recover share URL for ${share._id}:`,
                        error.message
                    );

                }


                sharedFiles.push({

                    id:
                        String(
                            share._id
                        ),

                    fileId:
                        String(
                            file._id
                        ),

                    originalName:
                        file.originalName,

                    size:
                        Number(
                            file.size ||
                            0
                        ),

                    mimeType:
                        file.mimeType,

                    extension:
                        file.extension,

                    category:
                        file.category,

                    createdAt:
                        share.createdAt,

                    expiresAt:
                        share.expiresAt ||
                        null,

                    downloadCount:
                        Number(
                            share.downloadCount ||
                            0
                        ),

                    maxDownloads:
                        share.maxDownloads !==
                            null &&
                        share.maxDownloads !==
                            undefined

                            ? Number(
                                share.maxDownloads
                            )

                            : null,

                    passwordProtected:
                        Boolean(
                            share.passwordHash
                        ),

                    integrity: file.integrity
                        ? {
                            sha256: file.integrity.sha256 || null,
                            verified: Boolean(file.integrity.verified)
                        }
                        : {
                            sha256: null,
                            verified: false
                        },

                    shareUrl,

                    active,

                    expired,

                    downloadLimitReached



                });

            }


            return res
                .status(200)
                .json({

                    success:
                        true,

                    sharedCount:
                        sharedFiles.length,

                    files:
                        sharedFiles

                });

        } catch (error) {

            console.error(
                'Shared Files data error:',
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        'Unable to load shared files.'

                });

        }

    }
);


/*
|--------------------------------------------------------------------------
| DELETE /shared/:id
|--------------------------------------------------------------------------
| Revoke share
|--------------------------------------------------------------------------
*/

router.delete(
    '/:id',
    requireAuth,
    async (
        req,
        res
    ) => {

        try {

            const userId =
                req.session.user.id ||
                req.session.user._id;


            const shareId =
                String(
                    req.params.id ||
                    ''
                ).trim();


            if (
                !mongoose.Types.ObjectId.isValid(
                    shareId
                )
            ) {

                return res
                    .status(404)
                    .json({

                        success:
                            false,

                        error:
                            'Shared file not found.'

                    });

            }


            const share =
                await ShareLink.findOneAndUpdate(

                    {

                        _id:
                            shareId,

                        ownerId:
                            userId,

                        revokedAt:
                            null

                    },

                    {

                        $set: {

                            revokedAt:
                                new Date()

                        }

                    },

                    {

                        new:
                            true

                    }

                );


            if (!share) {

                return res
                    .status(404)
                    .json({

                        success:
                            false,

                        error:
                            'Shared file not found.'

                    });

            }


            return res
                .status(200)
                .json({

                    success:
                        true,

                    message:
                        'Shared link revoked successfully.'

                });

        } catch (error) {

            console.error(
                'Share revoke error:',
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        'Unable to revoke shared link.'

                });

        }

    }
);


module.exports =
    router;