// routes/security.js

const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const router = express.Router();

const User = require('../models/user');
const AuditLog = require('../models/auditlog');

const { requireAuth } = require('../middleware/auth');
const {
    writeAuditLog
} = require('../services/auditLogService');


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getSessionUser(req) {

    if (
        !req.session ||
        !req.session.user
    ) {
        return null;
    }

    return req.session.user;
}


function isValidPassword(password) {

    if (
        typeof password !== 'string'
    ) {
        return false;
    }

    if (
        password.length < 8 ||
        password.length > 128
    ) {
        return false;
    }

    return true;
}


function getPasswordStrength(password) {

    const value =
        String(password || '');

    let score = 0;

    if (value.length >= 8) {
        score++;
    }

    if (value.length >= 12) {
        score++;
    }

    if (/[a-z]/.test(value)) {
        score++;
    }

    if (/[A-Z]/.test(value)) {
        score++;
    }

    if (/[0-9]/.test(value)) {
        score++;
    }

    if (/[^A-Za-z0-9]/.test(value)) {
        score++;
    }

    if (score <= 2) {
        return 'weak';
    }

    if (score <= 4) {
        return 'medium';
    }

    return 'strong';
}


/*
|--------------------------------------------------------------------------
| GET /security
|--------------------------------------------------------------------------
*/

router.get(
    '/',
    requireAuth,
    async (req, res) => {

        return res.sendFile(
            require('path').join(
                __dirname,
                '..',
                'public',
                'security.html'
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| GET /security/data
|--------------------------------------------------------------------------
|
| Returns safe security information.
|
| IP address is deliberately NOT returned to the browser.
|
|--------------------------------------------------------------------------
*/

router.get(
    '/data',
    requireAuth,
    async (req, res) => {

        try {

            const sessionUser =
                getSessionUser(req);

            if (
                !sessionUser ||
                !sessionUser.id ||
                !mongoose.Types.ObjectId.isValid(
                    sessionUser.id
                )
            ) {

                return res
                    .status(401)
                    .json({
                        error:
                            'Authenticated session is invalid.'
                    });

            }


            const user =
                await User.findById(
                    sessionUser.id
                )
                    .select(
                        '_id username status createdAt updatedAt'
                    )
                    .lean();


            if (!user) {

                return res
                    .status(404)
                    .json({
                        error:
                            'User account was not found.'
                    });

            }


            const logs =
                await AuditLog.find({
                    userId:
                        user._id,

                    action: {
                        $in: [
                            'login_success',
                            'login_failed',
                            'logout',
                            'password_changed',
                            'security_event',
                            'profile_updated'
                        ]
                    }
                })
                    .sort({
                        createdAt: -1
                    })
                    .limit(10)
                    .select(
                        'action status description createdAt username'
                    )
                    .lean();


            return res.json({

                username:
                    user.username,

                accountStatus:
                    user.status,

                accountCreated:
                    user.createdAt,

                lastUpdated:
                    user.updatedAt,

                recentSecurityActivity:
                    logs.map(
                        log => ({
                            id:
                                String(
                                    log._id
                                ),

                            action:
                                log.action,

                            status:
                                log.status,

                            description:
                                log.description ||
                                '',

                            username:
                                log.username ||
                                user.username,

                            createdAt:
                                log.createdAt
                        })
                    )

            });

        } catch (error) {

            console.error(
                'Security data error:',
                error.message
            );

            return res
                .status(500)
                .json({
                    error:
                        'Unable to load security information.'
                });

        }

    }
);


/*
|--------------------------------------------------------------------------
| POST /security/change-password
|--------------------------------------------------------------------------
*/

router.post(
    '/change-password',
    requireAuth,
    async (req, res) => {

        try {

            const sessionUser =
                getSessionUser(req);


            if (
                !sessionUser ||
                !sessionUser.id ||
                !mongoose.Types.ObjectId.isValid(
                    sessionUser.id
                )
            ) {

                return res
                    .status(401)
                    .json({
                        error:
                            'Authenticated session is invalid.'
                    });

            }


            const currentPassword =
                typeof req.body.currentPassword ===
                'string'
                    ? req.body.currentPassword
                    : '';


            const newPassword =
                typeof req.body.newPassword ===
                'string'
                    ? req.body.newPassword
                    : '';


            const confirmPassword =
                typeof req.body.confirmPassword ===
                'string'
                    ? req.body.confirmPassword
                    : '';


            /*
             * Basic validation.
             */

            if (
                !currentPassword ||
                !newPassword ||
                !confirmPassword
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            'All password fields are required.'
                    });

            }


            if (
                !isValidPassword(
                    newPassword
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            'New password must be between 8 and 128 characters.'
                    });

            }


            if (
                newPassword !==
                confirmPassword
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            'New passwords do not match.'
                    });

            }


            /*
             * Prevent unchanged password.
             */

            if (
                currentPassword ===
                newPassword
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            'New password must be different from your current password.'
                    });

            }


            /*
             * Load account.
             */

            const user =
                await User.findById(
                    sessionUser.id
                );


            if (!user) {

                return res
                    .status(404)
                    .json({
                        error:
                            'User account was not found.'
                    });

            }


            /*
             * Verify current password.
             */

            const currentPasswordValid =
                await bcrypt.compare(
                    currentPassword,
                    user.passwordHash
                );


            if (
                !currentPasswordValid
            ) {

                await writeAuditLog(
                    req,
                    {
                        userId:
                            user._id,

                        username:
                            user.username,

                        action:
                            'security_event',

                        status:
                            'failed',

                        description:
                            'Password change failed because the current password was incorrect.',

                        metadata: {
                            event:
                                'password_change_failed'
                        }
                    }
                );


                return res
                    .status(401)
                    .json({
                        error:
                            'Current password is incorrect.'
                    });

            }


            /*
             * Password strength validation.
             *
             * Require at least:
             * - lowercase
             * - uppercase
             * - number
             */

            const hasLowercase =
                /[a-z]/.test(
                    newPassword
                );

            const hasUppercase =
                /[A-Z]/.test(
                    newPassword
                );

            const hasNumber =
                /[0-9]/.test(
                    newPassword
                );


            if (
                !hasLowercase ||
                !hasUppercase ||
                !hasNumber
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            'New password must contain at least one uppercase letter, one lowercase letter, and one number.'
                    });

            }


            /*
             * Generate secure password hash.
             */

            const passwordHash =
                await bcrypt.hash(
                    newPassword,
                    12
                );


            /*
             * Update only passwordHash.
             */

            user.passwordHash =
                passwordHash;

            await user.save();


            /*
             * Audit successful password change.
             */

            await writeAuditLog(
                req,
                {
                    userId:
                        user._id,

                    username:
                        user.username,

                    action:
                        'password_changed',

                    status:
                        'success',

                    description:
                        'Account password was changed successfully.',

                    metadata: {
                        event:
                            'password_change'
                    }
                }
            );


            /*
             * Keep current authenticated session.
             *
             * Do NOT expose password information.
             */

            return res.json({
                success:
                    true,

                message:
                    'Password changed successfully.'
            });

        } catch (error) {

            console.error(
                'Password change error:',
                error.message
            );

            return res
                .status(500)
                .json({
                    error:
                        'Unable to change password.'
                });

        }

    }
);


module.exports = router;