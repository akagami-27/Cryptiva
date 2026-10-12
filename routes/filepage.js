const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const router = express.Router();

const {
    requireAuth
} = require('../middleware/auth');

const User = require('../models/user');
const File = require('../models/file');
const ShareLink = require('../models/shareLink');


/*
|--------------------------------------------------------------------------
| Get Authenticated User
|--------------------------------------------------------------------------
|
| Supports both:
|
| req.session.user.id
| req.session.user.username
|
| This makes the Files page compatible with the existing authentication
| system even if the session structure changes slightly.
|
|--------------------------------------------------------------------------
*/

async function getAuthenticatedUser(req) {

    if (
        !req.session ||
        !req.session.user
    ) {
        return null;
    }


    const sessionUser =
        req.session.user;


    /*
    |--------------------------------------------------------------------------
    | Method 1: MongoDB ObjectId
    |--------------------------------------------------------------------------
    */

    if (
        sessionUser.id &&
        mongoose.Types.ObjectId.isValid(
            sessionUser.id
        )
    ) {

        const user =
            await User.findById(
                sessionUser.id
            );


        if (user) {

            return user;

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Method 2: Username fallback
    |--------------------------------------------------------------------------
    */

    if (
        sessionUser.username
    ) {

        const user =
            await User.findOne({
                username:
                    sessionUser.username
            });


        if (user) {

            return user;

        }

    }


    return null;

}


/*
|--------------------------------------------------------------------------
| GET /files
|--------------------------------------------------------------------------
|
| Files management page.
|
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
                'public',
                'files.html'
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| GET /files/data
|--------------------------------------------------------------------------
|
| REAL-TIME FILE DATA
|
| Returns the current authenticated user's files directly from MongoDB.
|
|--------------------------------------------------------------------------
*/

router.get(
    '/data',
    requireAuth,
    async (req, res) => {

        try {

            /*
            |--------------------------------------------------------------------------
            | Get authenticated MongoDB user
            |--------------------------------------------------------------------------
            */

            const user =
                await getAuthenticatedUser(
                    req
                );


            if (!user) {

                console.error(
                    'Files data: authenticated user could not be resolved.'
                );


                return res
                    .status(401)
                    .json({
                        success: false,
                        error:
                            'Authenticated user not found.'
                    });

            }


            /*
            |--------------------------------------------------------------------------
            | Get all files belonging to this user
            |--------------------------------------------------------------------------
            |
            | IMPORTANT:
            |
            | ownerId is the authorization boundary.
            |
            |--------------------------------------------------------------------------
            */

            const files =
                await File.find({
                    ownerId:
                        user._id
                })
                    .sort({
                        createdAt:
                            -1
                    })
                    .lean();


            /*
            |--------------------------------------------------------------------------
            | Get shares belonging to this user
            |--------------------------------------------------------------------------
            */

            const shares =
                await ShareLink.find({
                    ownerId:
                        user._id
                })
                    .select(
                        [
                            'fileId',
                            'expiresAt',
                            'revokedAt',
                            'maxDownloads',
                            'downloadCount',
                            'passwordHash'
                        ].join(' ')
                    )
                    .lean();


            /*
            |--------------------------------------------------------------------------
            | Current server time
            |--------------------------------------------------------------------------
            */

            const now =
                new Date();


            /*
            |--------------------------------------------------------------------------
            | Determine Active Shares
            |--------------------------------------------------------------------------
            */

            const activeShares =
                shares.filter(
                    share => {

                        /*
                        |----------------------------------------------------------
                        | Revoked
                        |----------------------------------------------------------
                        */

                        if (
                            share.revokedAt
                        ) {

                            return false;

                        }


                        /*
                        |----------------------------------------------------------
                        | Expired
                        |----------------------------------------------------------
                        */

                        if (
                            share.expiresAt &&
                            new Date(
                                share.expiresAt
                            ) <= now
                        ) {

                            return false;

                        }


                        /*
                        |----------------------------------------------------------
                        | Download limit reached
                        |----------------------------------------------------------
                        */

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
            | Map shares by File ID
            |--------------------------------------------------------------------------
            */

            const shareByFile =
                new Map();


            for (
                const share of activeShares
            ) {

                const fileId =
                    String(
                        share.fileId
                    );


                shareByFile.set(
                    fileId,
                    share
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Safe File Metadata
            |--------------------------------------------------------------------------
            |
            | NEVER expose:
            |
            | - storagePath
            | - encryption keys
            | - wrapped keys
            | - IV
            | - authTag
            | - tokenHash
            | - tokenCiphertext
            |
            |--------------------------------------------------------------------------
            */

            const safeFiles =
                files.map(
                    file => {

                        const share =
                            shareByFile.get(
                                String(
                                    file._id
                                )
                            );


                        return {
                            id: String(file._id),
                            originalName: file.originalName,
                            size: Number(file.size || 0),
                            mimeType: file.mimeType,
                            extension: file.extension,
                            category: file.category,

                            uploadedAt: file.createdAt,
                            updatedAt: file.updatedAt,

                            integrity: file.integrity
                                ? {
                                    sha256: file.integrity.sha256 || null,
                                    verified: Boolean(file.integrity.verified)
                                }
                                : {
                                    sha256: null,
                                    verified: false
                                },

                            hasActiveShare: Boolean(share),
                            shareId: share ? String(share._id) : null,
                            downloadCount: share
                                ? Number(share.downloadCount || 0)
                                : 0,
                            maxDownloads:
                                share &&
                                share.maxDownloads !== null &&
                                share.maxDownloads !== undefined
                                    ? Number(share.maxDownloads)
                                    : null,
                            expiresAt:
                                share
                                    ? share.expiresAt || null
                                    : null,
                            passwordProtected:
                                share
                                    ? Boolean(share.passwordHash)
                                    : false
                        };

                    }
                );


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
            | Response
            |--------------------------------------------------------------------------
            */

            return res.json({

                success:
                    true,

                username:
                    user.username,

                userId:
                    String(
                        user._id
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
                'Files data error:',
                error
            );


            return res
                .status(500)
                .json({

                    success:
                        false,

                    error:
                        'Unable to load files.'

                });

        }

    }
);


module.exports = router;