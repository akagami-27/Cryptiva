const express = require('express');

const router = express.Router();

const { requireAuth } = require('../middleware/auth');

const AuditLog = require('../models/auditlog');


/*
|--------------------------------------------------------------------------
| Activity Log Page
|--------------------------------------------------------------------------
*/

router.get(
    '/',
    requireAuth,
    (req, res) => {

        return res.sendFile(
            require('path').join(
                __dirname,
                '..',
                'public',
                'activity.html'
            )
        );

    }
);


/*
|--------------------------------------------------------------------------
| Activity Data
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Users can ONLY retrieve their own audit logs.
|
| Never allow the client to supply a userId.
|
|--------------------------------------------------------------------------
*/

router.get(
    '/data',
    requireAuth,
    async (req, res) => {

        try {

            const sessionUser =
                req.session?.user;


            const userId =
                sessionUser?.id ||
                sessionUser?._id;


            if (!userId) {

                return res.status(401).json({
                    error:
                        'Authentication required.'
                });

            }


            /*
            |--------------------------------------------------------------------------
            | Pagination
            |--------------------------------------------------------------------------
            */

            let page =
                Number(
                    req.query.page || 1
                );


            let limit =
                Number(
                    req.query.limit || 20
                );


            if (
                !Number.isInteger(page) ||
                page < 1
            ) {

                page = 1;

            }


            if (
                !Number.isInteger(limit) ||
                limit < 1
            ) {

                limit = 20;

            }


            /*
            |--------------------------------------------------------------------------
            | Maximum page size
            |--------------------------------------------------------------------------
            */

            limit =
                Math.min(
                    limit,
                    50
                );


            /*
            |--------------------------------------------------------------------------
            | Search / Filters
            |--------------------------------------------------------------------------
            */

            const search =
                String(
                    req.query.search || ''
                )
                    .trim()
                    .slice(
                        0,
                        100
                    );


            const action =
                String(
                    req.query.action || ''
                )
                    .trim()
                    .slice(
                        0,
                        100
                    );


            const status =
                String(
                    req.query.status || ''
                )
                    .trim()
                    .slice(
                        0,
                        30
                    );


            /*
            |--------------------------------------------------------------------------
            | Base Query
            |--------------------------------------------------------------------------
            |
            | The authenticated account is ALWAYS the owner of the query.
            |
            */

            const query = {

                userId:
                    userId

            };


            /*
            |--------------------------------------------------------------------------
            | Action Filter
            |--------------------------------------------------------------------------
            */

            if (action) {

                query.action =
                    action;

            }


            /*
            |--------------------------------------------------------------------------
            | Status Filter
            |--------------------------------------------------------------------------
            */

            if (status) {

                query.status =
                    status;

            }


            /*
            |--------------------------------------------------------------------------
            | Search
            |--------------------------------------------------------------------------
            */

            if (search) {

                const escapedSearch =
                    search.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        '\\$&'
                    );


                const searchRegex =
                    new RegExp(
                        escapedSearch,
                        'i'
                    );


                query.$or = [

                    {
                        username:
                            searchRegex
                    },

                    {
                        action:
                            searchRegex
                    },

                    {
                        fileName:
                            searchRegex
                    },

                    {
                        description:
                            searchRegex
                    },

                    {
                        ipAddress:
                            searchRegex
                    }

                ];

            }


            /*
            |--------------------------------------------------------------------------
            | Total Count
            |--------------------------------------------------------------------------
            */

            const total =
                await AuditLog.countDocuments(
                    query
                );


            /*
            |--------------------------------------------------------------------------
            | Pagination Calculation
            |--------------------------------------------------------------------------
            */

            const pages =
                Math.max(
                    1,
                    Math.ceil(
                        total /
                        limit
                    )
                );


            if (
                page > pages
            ) {

                page = pages;

            }


            const skip =
                (page - 1) *
                limit;


            /*
            |--------------------------------------------------------------------------
            | Retrieve Logs
            |--------------------------------------------------------------------------
            |
            | Only expose safe audit information.
            |
            */

            const logs =
                await AuditLog
                    .find(
                        query
                    )
                    .sort({
                        createdAt:
                            -1
                    })
                    .skip(
                        skip
                    )
                    .limit(
                        limit
                    )
                    .select({
                        _id:
                            1,

                        userId:
                            1,

                        username:
                            1,

                        action:
                            1,

                        status:
                            1,

                        fileId:
                            1,

                        fileName:
                            1,

                        shareId:
                            1,

                        description:
                            1,

                        ipAddress:
                            1,

                        userAgent:
                            1,

                        metadata:
                            1,

                        createdAt:
                            1

                    })
                    .lean();


            /*
            |--------------------------------------------------------------------------
            | Statistics
            |--------------------------------------------------------------------------
            */

            const [
                successCount,
                failedCount
            ] =
                await Promise.all([

                    AuditLog.countDocuments({
                        ...query,
                        status:
                            'success'
                    }),

                    AuditLog.countDocuments({
                        ...query,
                        status: {
                            $in: [
                                'failed',
                                'blocked',
                                'denied'
                            ]
                        }
                    })

                ]);


            /*
            |--------------------------------------------------------------------------
            | Safe Response
            |--------------------------------------------------------------------------
            */

            const activities =
                logs.map(
                    log => ({

                        id:
                            String(
                                log._id
                            ),

                        userId:
                            log.userId
                                ? String(
                                    log.userId
                                )
                                : null,

                        username:
                            log.username ||
                            null,

                        action:
                            log.action,

                        status:
                            log.status,

                        fileId:
                            log.fileId
                                ? String(
                                    log.fileId
                                )
                                : null,

                        fileName:
                            log.fileName ||
                            null,

                        shareId:
                            log.shareId
                                ? String(
                                    log.shareId
                                )
                                : null,

                        description:
                            log.description ||
                            '',

                        ipAddress:
                            log.ipAddress ||
                            null,

                        userAgent:
                            log.userAgent ||
                            null,

                        metadata:
                            log.metadata ||
                            null,

                        createdAt:
                            log.createdAt

                    })
                );


            return res.json({

                success:
                    true,

                activities,

                total,

                page,

                limit,

                pages,

                successCount,

                failedCount

            });


        } catch (error) {

            console.error(
                'Activity data error:',
                error
            );


            return res.status(
                500
            ).json({

                error:
                    'Unable to load activity.'

            });

        }

    }
);


module.exports =
    router;