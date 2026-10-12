'use strict';

const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');

const router = express.Router();

const User =
    require('../models/user');

const {
    requireAuth,
    redirectIfAuth
} = require('../middleware/auth');

const {
    loginRateLimiter
} = require('../middleware/rateLimit');

const {
    logLoginSuccess,
    logLoginFailed,
    logLogout
} = require('../services/auditLogService');


/*
|--------------------------------------------------------------------------
| SAFE RETURN PATH
|--------------------------------------------------------------------------
|
| Only allow local application paths.
|
| This prevents an attacker from abusing the login redirect:
|
| /login?redirect=https://attacker.com
|
|--------------------------------------------------------------------------
*/


function getSafeReturnPath(value) {
    if (
        typeof value !== 'string' ||
        value.length === 0
    ) {
        return '/react/dashboard';
    }

    if (
        !value.startsWith('/') ||
        value.startsWith('//') ||
        value.includes('\\')
    ) {
        return '/react/dashboard';
    }

    if (
        value === '/dashboard' ||
        [
            '/react/dashboard',
            '/react/files',
            '/react/shared',
            '/react/activity',
            '/react/profile',
            '/react/security'
        ].includes(value) ||
        value.startsWith('/files/shared/')
    ) {
        return value === '/dashboard'
            ? '/react/dashboard'
            : value;
    }

    return '/react/dashboard';
}


/*
|--------------------------------------------------------------------------
| HOMEPAGE
|--------------------------------------------------------------------------
*/

router.get(
    '/',
    (req, res) => {

        if (
            req.session &&
            req.session.user
        ) {
            return res.redirect('/dashboard');
        }

        return res.sendFile(
            path.join(
                __dirname,
                '..',
                'views',
                'index.html'
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| LOGIN PAGE
|--------------------------------------------------------------------------
*/

router.get(
    '/login',
    redirectIfAuth,
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                '..',
                'views',
                'login.html'
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| REGISTER PAGE
|--------------------------------------------------------------------------
*/

router.get(
    '/register',
    redirectIfAuth,
    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                '..',
                'views',
                'register.html'
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| REGISTER
|--------------------------------------------------------------------------
*/

router.post(
    '/register',
    redirectIfAuth,
    async (
        req,
        res
    ) => {

        try {

            const username =
                String(
                    req.body.username ||
                    ''
                ).trim();

            const password =
                String(
                    req.body.password ||
                    ''
                );


            /*
            |--------------------------------------------------------------------------
            | Validate Username
            |--------------------------------------------------------------------------
            */

            if (
                !/^[a-zA-Z0-9_]{3,20}$/
                    .test(username)
            ) {

                req.flash(
                    'error',
                    'Username must be 3-20 characters and contain only letters, numbers and underscores.'
                );

                return res.redirect(
                    '/register'
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Validate Password
            |--------------------------------------------------------------------------
            */

            if (
                password.length < 8 ||
                password.length > 128
            ) {

                req.flash(
                    'error',
                    'Password must be between 8 and 128 characters.'
                );

                return res.redirect(
                    '/register'
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Check Existing User
            |--------------------------------------------------------------------------
            */

            const existingUser =
                await User.findOne({
                    username
                });


            if (existingUser) {

                req.flash(
                    'error',
                    'Username is already registered.'
                );

                return res.redirect(
                    '/register'
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Hash Password
            |--------------------------------------------------------------------------
            */

            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );


            /*
            |--------------------------------------------------------------------------
            | Create User
            |--------------------------------------------------------------------------
            */

            await User.create({

                username,

                passwordHash,

                status:
                    'active'

            });


            /*
            |--------------------------------------------------------------------------
            | Registration Success
            |--------------------------------------------------------------------------
            */

            req.flash(
                'success',
                'Registration successful. You can now log in.'
            );

            return res.redirect(
                '/login'
            );


        } catch (error) {

            console.error(
                'Registration error:',
                error
            );


            /*
            |--------------------------------------------------------------------------
            | Handle Duplicate Username Race Condition
            |--------------------------------------------------------------------------
            */

            if (
                error &&
                error.code === 11000
            ) {

                req.flash(
                    'error',
                    'Username is already registered.'
                );

                return res.redirect(
                    '/register'
                );

            }


            req.flash(
                'error',
                'Unable to create your account.'
            );

            return res.redirect(
                '/register'
            );

        }

    }
);


/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
|
| Security controls:
|
| - Login rate limiting
| - Generic authentication errors
| - Dummy bcrypt comparison for unknown users
| - Disabled-account protection
| - bcrypt password verification
| - Session regeneration
| - Session fixation protection
| - Explicit session save
| - Safe post-login redirect
| - Login audit logging
|
|--------------------------------------------------------------------------
*/

router.post(
    '/login',
    loginRateLimiter,
    async (
        req,
        res
    ) => {

        const username =
            String(
                req.body.username ||
                ''
            ).trim();

        const password =
            String(
                req.body.password ||
                ''
            );


        /*
        |--------------------------------------------------------------------------
        | Capture Return Destination
        |--------------------------------------------------------------------------
        |
        | This is stored server-side by /files/shared/:token.
        |
        | It must be captured BEFORE session regeneration because
        | session regeneration creates a new session.
        |
        |--------------------------------------------------------------------------
        */

        const returnTo =
            getSafeReturnPath(
                req.session?.returnTo || req.body?.returnTo
            );


        try {

            /*
            |--------------------------------------------------------------------------
            | Basic Input Validation
            |--------------------------------------------------------------------------
            */

            if (
                !username ||
                !password
            ) {

                await logLoginFailed(
                    req,
                    username
                );

                req.flash(
                    'error',
                    'Invalid username or password.'
                );

                return res.redirect(
                    '/login'
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Find User
            |--------------------------------------------------------------------------
            */

            const user =
                await User.findOne({
                    username
                });


            /*
            |--------------------------------------------------------------------------
            | User Not Found
            |--------------------------------------------------------------------------
            |
            | Perform a bcrypt comparison against a dummy hash.
            |
            | This reduces username-enumeration timing differences.
            |
            |--------------------------------------------------------------------------
            */

            if (!user) {

                const dummyHash =
                    '$2b$12$C6UzMDM.H6dfI/f/IKcEe.WJ8M7ZJY5mV4VY1QX8L9E8m5Xq2k8K';

                await bcrypt.compare(
                    password,
                    dummyHash
                );


                await logLoginFailed(
                    req,
                    username
                );


                req.flash(
                    'error',
                    'Invalid username or password.'
                );

                return res.redirect(
                    '/login'
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Disabled Account
            |--------------------------------------------------------------------------
            */

            if (
                user.status ===
                'disabled'
            ) {

                await logLoginFailed(
                    req,
                    username
                );


                req.flash(
                    'error',
                    'Invalid username or password.'
                );

                return res.redirect(
                    '/login'
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Password Verification
            |--------------------------------------------------------------------------
            */

            const passwordValid =
                await bcrypt.compare(
                    password,
                    user.passwordHash
                );


            if (!passwordValid) {

                await logLoginFailed(
                    req,
                    username
                );


                req.flash(
                    'error',
                    'Invalid username or password.'
                );

                return res.redirect(
                    '/login'
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Session Fixation Protection
            |--------------------------------------------------------------------------
            |
            | Regenerate the session ID after successful authentication.
            |
            |--------------------------------------------------------------------------
            */

            await new Promise(
                (
                    resolve,
                    reject
                ) => {

                    req.session.regenerate(
                        error => {

                            if (error) {

                                reject(
                                    error
                                );

                                return;

                            }

                            resolve();

                        }
                    );

                }
            );


            /*
            |--------------------------------------------------------------------------
            | Create Authenticated Session
            |--------------------------------------------------------------------------
            */

            req.session.user = {

                id:
                    user._id.toString(),

                username:
                    user.username,

                status:
                    user.status

            };


            /*
            |--------------------------------------------------------------------------
            | Clear One-Time Return Destination
            |--------------------------------------------------------------------------
            |
            | The destination was already captured into returnTo before
            | session regeneration.
            |
            |--------------------------------------------------------------------------
            */

            req.session.returnTo =
                null;


            /*
            |--------------------------------------------------------------------------
            | Save Session
            |--------------------------------------------------------------------------
            */

            await new Promise(
                (
                    resolve,
                    reject
                ) => {

                    req.session.save(
                        error => {

                            if (error) {

                                reject(
                                    error
                                );

                                return;

                            }

                            resolve();

                        }
                    );

                }
            );


            /*
            |--------------------------------------------------------------------------
            | Audit Log
            |--------------------------------------------------------------------------
            */

            await logLoginSuccess(
                req,
                user
            );


            /*
            |--------------------------------------------------------------------------
            | Redirect
            |--------------------------------------------------------------------------
            |
            | Normal login:
            |     /dashboard
            |
            | Shared file login:
            |     /files/shared/:token
            |
            |--------------------------------------------------------------------------
            */

            return res.redirect(
                returnTo
            );


        } catch (error) {

            console.error(
                'Login error:',
                error
            );


            /*
            |--------------------------------------------------------------------------
            | Do Not Expose Internal Errors
            |--------------------------------------------------------------------------
            */

            await logLoginFailed(
                req,
                username
            );


            req.flash(
                'error',
                'Unable to process login.'
            );

            return res.redirect(
                '/login'
            );

        }

    }
);


/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

router.post(
    '/logout',
    requireAuth,
    async (
        req,
        res
    ) => {

        try {

            /*
            |--------------------------------------------------------------------------
            | Record Logout BEFORE Destroying Session
            |--------------------------------------------------------------------------
            */

            await logLogout(
                req
            );


            /*
            |--------------------------------------------------------------------------
            | Destroy Session
            |--------------------------------------------------------------------------
            */

            await new Promise(
                (
                    resolve,
                    reject
                ) => {

                    req.session.destroy(
                        error => {

                            if (error) {

                                reject(
                                    error
                                );

                                return;

                            }

                            resolve();

                        }
                    );

                }
            );


            /*
            |--------------------------------------------------------------------------
            | Clear Session Cookie
            |--------------------------------------------------------------------------
            */

            res.clearCookie(
                'cryptiva.sid',
                {
                    httpOnly:
                        true,

                    sameSite:
                        'lax',

                    secure:
                        process.env.NODE_ENV ===
                        'production',

                    path:
                        '/'
                }
            );


            return res.redirect(
                '/login'
            );


        } catch (error) {

            console.error(
                'Logout error:',
                error
            );


            /*
            |--------------------------------------------------------------------------
            | Even if session destruction fails,
            | return the user to login.
            |--------------------------------------------------------------------------
            */

            return res.redirect(
                '/login'
            );

        }

    }
);


/*
|--------------------------------------------------------------------------
| CURRENT USER
|--------------------------------------------------------------------------
*/

router.get(
    '/me',
    requireAuth,
    async (
        req,
        res
    ) => {

        try {

            const user =
                await User.findById(
                    req.session.user.id
                ).select(
                    '_id username status createdAt updatedAt'
                );


            if (!user) {

                return res
                    .status(401)
                    .json({

                        error:
                            'User not found.'

                    });

            }


            return res
                .status(200)
                .json({

                    user: {

                        id:
                            user._id.toString(),

                        username:
                            user.username,

                        status:
                            user.status,

                        createdAt:
                            user.createdAt,

                        updatedAt:
                            user.updatedAt

                    }

                });


        } catch (error) {

            console.error(
                'Current user error:',
                error
            );


            return res
                .status(500)
                .json({

                    error:
                        'Unable to retrieve user information.'

                });

        }

    }
);


/*
|--------------------------------------------------------------------------
| EXPORT ROUTER
|--------------------------------------------------------------------------
*/

module.exports =
    router;
