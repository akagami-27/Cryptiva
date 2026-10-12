'use strict';

const AuditLog = require('../models/auditlog');


/*
|--------------------------------------------------------------------------
| Get Request IP
|--------------------------------------------------------------------------
*/

function getIpAddress(req) {
    if (!req) {
        return null;
    }

    const ip =
        req.ip ||
        req.socket?.remoteAddress ||
        null;

    return ip
        ? String(ip).substring(0, 100)
        : null;
}


/*
|--------------------------------------------------------------------------
| Get User Agent
|--------------------------------------------------------------------------
*/

function getUserAgent(req) {
    if (!req) {
        return null;
    }

    const userAgent =
        req.get
            ? req.get('user-agent')
            : null;

    return userAgent
        ? String(userAgent).substring(0, 1000)
        : null;
}


/*
|--------------------------------------------------------------------------
| Get Session User
|--------------------------------------------------------------------------
*/

function getSessionUser(req) {
    if (
        !req ||
        !req.session ||
        !req.session.user
    ) {
        return {
            userId: null,
            username: null
        };
    }

    const sessionUser = req.session.user;

    return {
        userId:
            sessionUser.id ||
            sessionUser._id ||
            null,

        username:
            sessionUser.username ||
            null
    };
}


/*
|--------------------------------------------------------------------------
| Write Audit Log
|--------------------------------------------------------------------------
*/

async function writeAuditLog(
    req,
    data = {}
) {
    try {

        const sessionUser =
            getSessionUser(req);


        const userId =
            data.userId !== undefined
                ? data.userId
                : sessionUser.userId;


        const username =
            data.username !== undefined
                ? data.username
                : sessionUser.username;


        /*
        |--------------------------------------------------------------------------
        | Create Audit Log
        |--------------------------------------------------------------------------
        */

        const auditLog =
            await AuditLog.create({

                userId,

                username,

                action:
                    data.action,

                status:
                    data.status ||
                    'success',

                fileId:
                    data.fileId ||
                    null,

                fileName:
                    data.fileName ||
                    null,

                shareId:
                    data.shareId ||
                    null,

                description:
                    data.description ||
                    'System activity recorded.',

                ipAddress:
                    data.ipAddress !== undefined
                        ? data.ipAddress
                        : getIpAddress(req),

                userAgent:
                    data.userAgent !== undefined
                        ? data.userAgent
                        : getUserAgent(req),

                metadata:
                    data.metadata ||
                    null
            });


        /*
        |--------------------------------------------------------------------------
        | Verify MongoDB Insert
        |--------------------------------------------------------------------------
        |
        | This confirms exactly where Mongoose wrote the document.
        |
        */

        console.log(
            '[AUDIT] Inserted successfully'
        );

        console.log(
            '[AUDIT] Database:',
            AuditLog.db?.name || 'unknown'
        );

        console.log(
            '[AUDIT] Collection:',
            AuditLog.collection?.name || 'unknown'
        );

        console.log(
            '[AUDIT] Document ID:',
            auditLog?._id
        );

        console.log(
            '[AUDIT] Action:',
            auditLog?.action
        );


        /*
        |--------------------------------------------------------------------------
        | Verify Document Can Be Read Back
        |--------------------------------------------------------------------------
        */

        const verifiedLog =
            await AuditLog.findById(
                auditLog._id
            ).lean();


        if (!verifiedLog) {

            console.error(
                '[AUDIT] ERROR: Document was inserted but could not be read back.'
            );

            return null;
        }


        console.log(
            '[AUDIT] Read-back verification: SUCCESS'
        );


        return verifiedLog;


    } catch (error) {

        /*
        |--------------------------------------------------------------------------
        | Audit logging must never break the main application.
        |--------------------------------------------------------------------------
        */

        console.error(
            '[AUDIT] MongoDB insert failed:'
        );

        console.error(
            error
        );

        return null;
    }
}


/*
|--------------------------------------------------------------------------
| Login Success
|--------------------------------------------------------------------------
*/

async function logLoginSuccess(
    req,
    user
) {

    return writeAuditLog(
        req,
        {

            userId:
                user?._id ||
                user?.id ||
                null,

            username:
                user?.username ||
                null,

            action:
                'login_success',

            status:
                'success',

            description:
                'User logged in successfully.'

        }
    );
}


/*
|--------------------------------------------------------------------------
| Login Failed
|--------------------------------------------------------------------------
*/

async function logLoginFailed(
    req,
    username
) {

    return writeAuditLog(
        req,
        {

            userId:
                null,

            username:
                username ||
                null,

            action:
                'login_failed',

            status:
                'failed',

            description:
                'Login attempt failed.'

        }
    );
}


/*
|--------------------------------------------------------------------------
| Logout
|--------------------------------------------------------------------------
*/

async function logLogout(
    req
) {

    return writeAuditLog(
        req,
        {

            action:
                'logout',

            status:
                'success',

            description:
                'User logged out.'

        }
    );
}


/*
|--------------------------------------------------------------------------
| File Upload
|--------------------------------------------------------------------------
*/

async function logFileUpload(
    req,
    file
) {

    return writeAuditLog(
        req,
        {

            action:
                'file_upload',

            status:
                'success',

            fileId:
                file?._id ||
                null,

            fileName:
                file?.originalName ||
                null,

            description:
                `File uploaded: ${
                    file?.originalName ||
                    'Unknown file'
                }`

        }
    );
}


/*
|--------------------------------------------------------------------------
| File Download
|--------------------------------------------------------------------------
*/

async function logFileDownload(
    req,
    file
) {

    return writeAuditLog(
        req,
        {

            action:
                'file_download',

            status:
                'success',

            fileId:
                file?._id ||
                null,

            fileName:
                file?.originalName ||
                null,

            description:
                `File downloaded: ${
                    file?.originalName ||
                    'Unknown file'
                }`

        }
    );
}


/*
|--------------------------------------------------------------------------
| File Delete
|--------------------------------------------------------------------------
*/

async function logFileDelete(
    req,
    file
) {

    return writeAuditLog(
        req,
        {

            action:
                'file_delete',

            status:
                'success',

            fileId:
                file?._id ||
                null,

            fileName:
                file?.originalName ||
                null,

            description:
                `File deleted: ${
                    file?.originalName ||
                    'Unknown file'
                }`

        }
    );
}


/*
|--------------------------------------------------------------------------
| Share Created
|--------------------------------------------------------------------------
*/

async function logShareCreated(
    req,
    share,
    file
) {

    return writeAuditLog(
        req,
        {

            action:
                'share_created',

            status:
                'success',

            fileId:
                file?._id ||
                share?.fileId ||
                null,

            fileName:
                file?.originalName ||
                null,

            shareId:
                share?._id ||
                null,

            description:
                `Secure share link created for ${
                    file?.originalName ||
                    'file'
                }`

        }
    );
}


/*
|--------------------------------------------------------------------------
| Share Updated
|--------------------------------------------------------------------------
*/

async function logShareUpdated(
    req,
    share,
    file
) {

    return writeAuditLog(
        req,
        {

            action:
                'share_updated',

            status:
                'success',

            fileId:
                file?._id ||
                share?.fileId ||
                null,

            fileName:
                file?.originalName ||
                null,

            shareId:
                share?._id ||
                null,

            description:
                `Secure share settings updated for ${
                    file?.originalName ||
                    'file'
                }`

        }
    );
}


/*
|--------------------------------------------------------------------------
| Share Revoked
|--------------------------------------------------------------------------
*/

async function logShareRevoked(
    req,
    share,
    file
) {

    return writeAuditLog(
        req,
        {

            action:
                'share_revoked',

            status:
                'success',

            fileId:
                file?._id ||
                share?.fileId ||
                null,

            fileName:
                file?.originalName ||
                null,

            shareId:
                share?._id ||
                null,

            description:
                `Secure share link revoked for ${
                    file?.originalName ||
                    'file'
                }`

        }
    );
}


/*
|--------------------------------------------------------------------------
| Share Accessed
|--------------------------------------------------------------------------
*/

async function logShareAccessed(
    req,
    share,
    file
) {

    return writeAuditLog(
        req,
        {

            action:
                'share_accessed',

            status:
                'success',

            fileId:
                file?._id ||
                share?.fileId ||
                null,

            fileName:
                file?.originalName ||
                null,

            shareId:
                share?._id ||
                null,

            description:
                `Shared link accessed for ${
                    file?.originalName ||
                    'file'
                }`

        }
    );
}


/*
|--------------------------------------------------------------------------
| Share Password Failed
|--------------------------------------------------------------------------
*/

async function logSharePasswordFailed(
    req,
    share,
    file
) {

    return writeAuditLog(
        req,
        {

            action:
                'share_password_failed',

            status:
                'failed',

            fileId:
                file?._id ||
                share?.fileId ||
                null,

            fileName:
                file?.originalName ||
                null,

            shareId:
                share?._id ||
                null,

            description:
                `Incorrect share password entered for ${
                    file?.originalName ||
                    'file'
                }`

        }
    );
}


/*
|--------------------------------------------------------------------------
| Share Download
|--------------------------------------------------------------------------
*/

async function logShareDownload(
    req,
    share,
    file
) {

    return writeAuditLog(
        req,
        {

            action:
                'share_download',

            status:
                'success',

            fileId:
                file?._id ||
                share?.fileId ||
                null,

            fileName:
                file?.originalName ||
                null,

            shareId:
                share?._id ||
                null,

            description:
                `Shared file downloaded: ${
                    file?.originalName ||
                    'file'
                }`

        }
    );
}


/*
|--------------------------------------------------------------------------
| Module Exports
|--------------------------------------------------------------------------
*/

module.exports = {

    writeAuditLog,

    logLoginSuccess,

    logLoginFailed,

    logLogout,

    logFileUpload,

    logFileDownload,

    logFileDelete,

    logShareCreated,

    logShareUpdated,

    logShareRevoked,

    logShareAccessed,

    logSharePasswordFailed,

    logShareDownload

};