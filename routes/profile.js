'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const router = express.Router();

const User =
    require('../models/user');

const {
    requireAuth
} = require('../middleware/auth');

const {
    writeAuditLog
} = require('../services/auditLogService');


/*
|--------------------------------------------------------------------------
| Resolve Current User
|--------------------------------------------------------------------------
*/

async function getCurrentUser(req) {

    const sessionUser =
        req.session?.user;

    if (!sessionUser) {
        return null;
    }


    /*
    |--------------------------------------------------------------------------
    | Primary lookup: session user ID
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
            )
                .select(
                    '_id username status createdAt updatedAt'
                )
                .lean();

        if (user) {
            return user;
        }

    }


    /*
    |--------------------------------------------------------------------------
    | Fallback: session _id
    |--------------------------------------------------------------------------
    */

    if (
        sessionUser._id &&
        mongoose.Types.ObjectId.isValid(
            sessionUser._id
        )
    ) {

        const user =
            await User.findById(
                sessionUser._id
            )
                .select(
                    '_id username status createdAt updatedAt'
                )
                .lean();

        if (user) {
            return user;
        }

    }


    /*
    |--------------------------------------------------------------------------
    | Final fallback: username
    |--------------------------------------------------------------------------
    */

    if (sessionUser.username) {

        const user =
            await User.findOne({
                username:
                    sessionUser.username
            })
                .select(
                    '_id username status createdAt updatedAt'
                )
                .lean();

        return user || null;
    }


    return null;
}


/*
|--------------------------------------------------------------------------
| Escape HTML
|--------------------------------------------------------------------------
*/

function escapeHtml(value) {

    return String(value ?? '')
        .replace(
            /&/g,
            '&amp;'
        )
        .replace(
            /</g,
            '&lt;'
        )
        .replace(
            />/g,
            '&gt;'
        )
        .replace(
            /"/g,
            '&quot;'
        )
        .replace(
            /'/g,
            '&#039;'
        );

}


/*
|--------------------------------------------------------------------------
| Format Date
|--------------------------------------------------------------------------
*/

function formatDate(value) {

    if (!value) {
        return '—';
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return '—';
    }

    return new Intl.DateTimeFormat(
        'en-MY',
        {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }
    ).format(date);

}


/*
|--------------------------------------------------------------------------
| GET /profile
|--------------------------------------------------------------------------
|
| Server-side rendering.
|
| MongoDB
|    ↓
| Express
|    ↓
| profile.html
|    ↓
| Browser
|
| No initial AJAX request is required.
|
|--------------------------------------------------------------------------
*/

router.get(
    '/',
    requireAuth,
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);


            if (!user) {

                return res
                    .status(404)
                    .send(
                        'User account was not found.'
                    );

            }


            /*
            |--------------------------------------------------------------------------
            | Prepare values
            |--------------------------------------------------------------------------
            */

            const username =
                escapeHtml(
                    user.username
                );


            const status =
                escapeHtml(
                    user.status
                        ? (
                            user.status
                                .charAt(0)
                                .toUpperCase() +
                            user.status.slice(1)
                        )
                        : 'Active'
                );


            const createdAt =
                escapeHtml(
                    formatDate(
                        user.createdAt
                    )
                );


            const updatedAt =
                escapeHtml(
                    formatDate(
                        user.updatedAt
                    )
                );


            /*
            |--------------------------------------------------------------------------
            | CSRF token
            |--------------------------------------------------------------------------
            */

            const csrfToken =
                escapeHtml(
                    req.session?.csrfToken || ''
                );


            /*
            |--------------------------------------------------------------------------
            | Read profile HTML
            |--------------------------------------------------------------------------
            */

            const filePath =
                path.join(
                    __dirname,
                    '..',
                    'public',
                    'profile.html'
                );


            let html =
                fs.readFileSync(
                    filePath,
                    'utf8'
                );


            /*
            |--------------------------------------------------------------------------
            | Username card
            |--------------------------------------------------------------------------
            */

            html =
                html.replace(
                    /(<strong[^>]*id=["']profile-username-card["'][^>]*>)[\s\S]*?(<\/strong>)/i,
                    `$1${username}$2`
                );


            /*
            |--------------------------------------------------------------------------
            | Username input
            |--------------------------------------------------------------------------
            */

            html =
                html.replace(
                    /(<input[^>]*id=["']username["'][^>]*)(>)/i,
                    `$1 value="${username}"$2`
                );


            /*
            |--------------------------------------------------------------------------
            | Account status
            |--------------------------------------------------------------------------
            */

            html =
                html.replace(
                    /(<strong[^>]*id=["']profile-status["'][^>]*>)[\s\S]*?(<\/strong>)/i,
                    `$1${status}$2`
                );


            /*
            |--------------------------------------------------------------------------
            | Member since
            |--------------------------------------------------------------------------
            */

            html =
                html.replace(
                    /(<strong[^>]*id=["']profile-created["'][^>]*>)[\s\S]*?(<\/strong>)/i,
                    `$1${createdAt}$2`
                );


            /*
            |--------------------------------------------------------------------------
            | Account details status
            |--------------------------------------------------------------------------
            */

            html =
                html.replace(
                    /(<strong[^>]*id=["']profile-detail-status["'][^>]*>)[\s\S]*?(<\/strong>)/i,
                    `$1${status}$2`
                );


            /*
            |--------------------------------------------------------------------------
            | Account created
            |--------------------------------------------------------------------------
            */

            html =
                html.replace(
                    /(<strong[^>]*id=["']profile-detail-created["'][^>]*>)[\s\S]*?(<\/strong>)/i,
                    `$1${createdAt}$2`
                );


            /*
            |--------------------------------------------------------------------------
            | Last profile update
            |--------------------------------------------------------------------------
            */

            html =
                html.replace(
                    /(<strong[^>]*id=["']profile-detail-updated["'][^>]*>)[\s\S]*?(<\/strong>)/i,
                    `$1${updatedAt}$2`
                );


            /*
            |--------------------------------------------------------------------------
            | Inject CSRF token
            |--------------------------------------------------------------------------
            */

            html =
                html.replace(
                    /<meta\s+name=["']csrf-token["'][^>]*>/i,
                    `<meta name="csrf-token" content="${csrfToken}">`
                );


            /*
            |--------------------------------------------------------------------------
            | Prevent stale profile HTML
            |--------------------------------------------------------------------------
            */

            res.setHeader(
                'Cache-Control',
                'no-store, no-cache, must-revalidate, private'
            );

            res.setHeader(
                'Pragma',
                'no-cache'
            );

            res.setHeader(
                'Expires',
                '0'
            );


            /*
            |--------------------------------------------------------------------------
            | Send completed HTML
            |--------------------------------------------------------------------------
            */

            return res
                .type('html')
                .send(html);

        } catch (error) {

            console.error(
                '[PROFILE] Page error:',
                error
            );

            return res
                .status(500)
                .send(
                    'Unable to load profile.'
                );

        }

    }
);


/*
|--------------------------------------------------------------------------
| GET /profile/data
|--------------------------------------------------------------------------
|
| Used after a profile update to refresh the displayed values.
|
|--------------------------------------------------------------------------
*/

router.get(
    '/data',
    requireAuth,
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);


            if (!user) {

                return res
                    .status(404)
                    .json({
                        error:
                            'User account was not found.'
                    });

            }


            return res.json({

                success:
                    true,

                username:
                    user.username,

                status:
                    user.status,

                createdAt:
                    user.createdAt,

                updatedAt:
                    user.updatedAt

            });

        } catch (error) {

            console.error(
                '[PROFILE] Data error:',
                error
            );

            return res
                .status(500)
                .json({
                    error:
                        'Unable to load profile information.'
                });

        }

    }
);


/*
|--------------------------------------------------------------------------
| POST /profile/update
|--------------------------------------------------------------------------
*/

router.post(
    '/update',
    requireAuth,
    async (req, res) => {

        try {

            const user =
                await getCurrentUser(req);


            if (!user) {

                return res
                    .status(404)
                    .json({
                        error:
                            'User account was not found.'
                    });

            }


            /*
            |--------------------------------------------------------------------------
            | Read username
            |--------------------------------------------------------------------------
            */

            const username =
                typeof req.body.username === 'string'
                    ? req.body.username.trim()
                    : '';


            /*
            |--------------------------------------------------------------------------
            | Required
            |--------------------------------------------------------------------------
            */

            if (!username) {

                return res
                    .status(400)
                    .json({
                        error:
                            'Username is required.'
                    });

            }


            /*
            |--------------------------------------------------------------------------
            | Length
            |--------------------------------------------------------------------------
            */

            if (
                username.length < 3 ||
                username.length > 20
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            'Username must be between 3 and 20 characters.'
                    });

            }


            /*
            |--------------------------------------------------------------------------
            | Allowed characters
            |--------------------------------------------------------------------------
            */

            if (
                !/^[a-zA-Z0-9_]+$/.test(
                    username
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            'Username may only contain letters, numbers, and underscores.'
                    });

            }


            /*
            |--------------------------------------------------------------------------
            | Get database user
            |--------------------------------------------------------------------------
            */

            const dbUser =
                await User.findById(
                    user._id
                );


            if (!dbUser) {

                return res
                    .status(404)
                    .json({
                        error:
                            'User account was not found.'
                    });

            }


            /*
            |--------------------------------------------------------------------------
            | No change
            |--------------------------------------------------------------------------
            */

            if (
                dbUser.username === username
            ) {

                return res.json({

                    success:
                        true,

                    changed:
                        false,

                    username:
                        dbUser.username,

                    message:
                        'No profile changes were made.'

                });

            }


            /*
            |--------------------------------------------------------------------------
            | Duplicate username
            |--------------------------------------------------------------------------
            */

            const existingUser =
                await User.findOne({

                    username,

                    _id: {
                        $ne:
                            dbUser._id
                    }

                })
                    .select('_id')
                    .lean();


            if (existingUser) {

                return res
                    .status(409)
                    .json({
                        error:
                            'That username is already in use.'
                    });

            }


            /*
            |--------------------------------------------------------------------------
            | Store previous username
            |--------------------------------------------------------------------------
            */

            const previousUsername =
                dbUser.username;


            /*
            |--------------------------------------------------------------------------
            | Update username
            |--------------------------------------------------------------------------
            */

            dbUser.username =
                username;


            await dbUser.save();


            /*
            |--------------------------------------------------------------------------
            | Synchronize session
            |--------------------------------------------------------------------------
            */

            if (
                req.session?.user
            ) {

                req.session.user.username =
                    dbUser.username;

            }


            /*
            |--------------------------------------------------------------------------
            | Audit log
            |--------------------------------------------------------------------------
            */

            await writeAuditLog(
                req,
                {

                    userId:
                        dbUser._id,

                    username:
                        dbUser.username,

                    action:
                        'profile_updated',

                    status:
                        'success',

                    description:
                        'Account profile was updated.',

                    metadata: {

                        field:
                            'username',

                        previousUsername,

                        newUsername:
                            dbUser.username

                    }

                }
            );


            /*
            |--------------------------------------------------------------------------
            | Response
            |--------------------------------------------------------------------------
            */

            return res.json({

                success:
                    true,

                changed:
                    true,

                username:
                    dbUser.username,

                message:
                    'Profile updated successfully.'

            });

        } catch (error) {

            /*
            |--------------------------------------------------------------------------
            | Duplicate key protection
            |--------------------------------------------------------------------------
            */

            if (
                error?.code === 11000
            ) {

                return res
                    .status(409)
                    .json({
                        error:
                            'That username is already in use.'
                    });

            }


            console.error(
                '[PROFILE] Update error:',
                error
            );


            return res
                .status(500)
                .json({
                    error:
                        'Unable to update profile.'
                });

        }

    }
);


/*
|--------------------------------------------------------------------------
| Export Router
|--------------------------------------------------------------------------
*/

module.exports =
    router;