// routes/files.js

const express = require('express');
const router = express.Router();

const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { requireAuth } = require('../middleware/auth');

const { sharePasswordRateLimiter } = require('../middleware/rateLimit');

const User = require('../models/user');
const File = require('../models/file');
const ShareLink = require('../models/shareLink');

const supabase = require('../config/supabase');
const { createShareUrl } = require('../services/shareUrlService');
const {
    RESERVATION_LEASE_MS,
    reserveDownloadSlot,
    renewReservationOrAbort,
    runReservedDownloadResponse
} = require('../services/shareDownloadReservations');

const {
    validateUploadedFile
} = require('../services/fileValidationService');

const {
    scanFile
} = require('../services/malwareScanService');

const {
    generateDataEncryptionKey,
    encryptData,
    decryptData,
    wrapDataEncryptionKey,
    unwrapDataEncryptionKey,
    calculateSha256
} = require('../services/cryptoService');

const {
    logFileUpload,
    logFileDownload,
    logFileDelete,
    logShareCreated,
    logShareUpdated,
    logShareRevoked,
    logShareAccessed,
    logSharePasswordFailed,
    logShareDownload
} = require('../services/auditLogService');


const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 20;

const SUPABASE_BUCKET =
    process.env.SUPABASE_BUCKET || 'cryptiva-files';

const TEMP_DIR = path.join(
    __dirname,
    '..',
    'tmp'
);


/*
|--------------------------------------------------------------------------
| Multer
|--------------------------------------------------------------------------
*/

const storage = multer.diskStorage({

    destination: async (req, file, cb) => {

        try {

            await fs.mkdir(
                TEMP_DIR,
                {
                    recursive: true
                }
            );

            cb(
                null,
                TEMP_DIR
            );

        } catch (error) {

            cb(error);

        }

    },

    filename: (req, file, cb) => {

        const temporaryName =
            `${crypto.randomBytes(16).toString('hex')}.upload`;

        cb(
            null,
            temporaryName
        );

    }

});


const upload = multer({

    storage,

    limits: {
        fileSize: MAX_FILE_SIZE,
        files: MAX_FILES_PER_UPLOAD
    }

});

const uploadFiles = upload.array('files', MAX_FILES_PER_UPLOAD);

function handleUploadFiles(req, res, next) {
    uploadFiles(req, res, async (error) => {
        if (!error) {
            return next();
        }

        for (const file of req.files || []) {
            try {
                await cleanupTempFile(file.path);
            } catch (cleanupError) {
                console.error(
                    'Failed to clean temporary upload file:',
                    cleanupError.message
                );
            }
        }

        const tooLarge =
            error instanceof multer.MulterError &&
            error.code === 'LIMIT_FILE_SIZE';

        if (error instanceof multer.MulterError) {
            return res.status(tooLarge ? 413 : 400).json({
                error: tooLarge
                    ? 'The uploaded file exceeds the allowed size.'
                    : 'The upload could not be processed.'
            });
        }

        console.error('Upload middleware failed:', error);
        return res.status(500).json({
            error: 'File upload failed. Please try again.'
        });
    });
}


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

async function getAuthenticatedUser(req) {

    if (
        !req.session ||
        !req.session.user
    ) {

        return null;

    }

    const userId =
        req.session.user.id;

    if (
        !userId ||
        !mongoose.Types.ObjectId.isValid(userId)
    ) {

        return null;

    }

    return User.findById(userId);

}


function generateStoragePath(
    userId,
    fileId
) {

    return `users/${userId}/${fileId}.enc`;

}


async function cleanupTempFile(
    filePath
) {

    if (!filePath) {

        return;

    }

    try {

        await fs.unlink(
            filePath
        );

    } catch (error) {

        if (
            error.code !== 'ENOENT'
        ) {

            console.error(
                'Temporary file cleanup failed:',
                error.message
            );

        }

    }

}


async function deleteSupabaseObject(
    storagePath
) {

    const {
        error
    } = await supabase
        .storage
        .from(SUPABASE_BUCKET)
        .remove([
            storagePath
        ]);

    if (error) {

        throw new Error(
            `Supabase deletion failed: ${error.message}`
        );

    }

}


async function downloadSupabaseObject(
    storagePath
) {

    const {
        data,
        error
    } = await supabase
        .storage
        .from(SUPABASE_BUCKET)
        .download(
            storagePath
        );

    if (error) {

        throw new Error(
            `Supabase download failed: ${error.message}`
        );

    }

    if (!data) {

        throw new Error(
            'Supabase returned no file data'
        );

    }

    const arrayBuffer =
        await data.arrayBuffer();

    return Buffer.from(
        arrayBuffer
    );

}


/*
|--------------------------------------------------------------------------
| Encrypt Share Token
|--------------------------------------------------------------------------
*/

function encryptShareToken(
    rawToken
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

    const iv =
        crypto.randomBytes(12);

    const cipher =
        crypto.createCipheriv(
            'aes-256-gcm',
            masterKey,
            iv
        );

    const ciphertext =
        Buffer.concat([
            cipher.update(
                rawToken,
                'utf8'
            ),
            cipher.final()
        ]);

    const authTag =
        cipher.getAuthTag();

    return {

        tokenCiphertext:
            ciphertext.toString(
                'base64'
            ),

        tokenIv:
            iv.toString(
                'base64'
            ),

        tokenAuthTag:
            authTag.toString(
                'base64'
            )

    };

}


/*
|--------------------------------------------------------------------------
| POST /files/upload
|--------------------------------------------------------------------------
*/

router.post(
    '/upload',
    requireAuth,
    handleUploadFiles,
    async (req, res) => {

        const temporaryFiles =
            req.files || [];
        const uploadedFiles = [];
        const createdFiles = [];

        try {

            if (
                temporaryFiles.length === 0
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            'No files received.'
                    });

            }

            const user =
                await getAuthenticatedUser(
                    req
                );

            if (!user) {
                for (const file of temporaryFiles) {
                    await cleanupTempFile(file.path);
                }

                return res.status(401).json({
                    error: 'Authenticated user not found.'
                });
            }
            
            if (user.status !== 'active') {
                for (const file of temporaryFiles) {
                    await cleanupTempFile(file.path);
                }

                return res.status(403).json({
                    error: 'This account is disabled.'
                });
            }

            for (
                const uploadedFile
                of temporaryFiles
            ) {

                const tempPath =
                    uploadedFile.path;

                    const validation =
                        await validateUploadedFile(
                            uploadedFile.originalname,
                            tempPath
                        );

                    const scanResult =
                        await scanFile(
                            tempPath
                        );

                    if (
                        scanResult.infected
                    ) {

                        throw new Error(
                            'File rejected because malware was detected.'
                        );

                    }

                    if (
                        scanResult.error
                    ) {

                        throw new Error(
                            'Malware scanner failed.'
                        );

                    }

                    let plaintext = null;
                    let dataEncryptionKey = null;

                    let sha256;
                    let encrypted;
                    let wrapped;

                    try {
                        plaintext = await fs.readFile(tempPath);

                        sha256 = calculateSha256(plaintext);

                        dataEncryptionKey = generateDataEncryptionKey();

                        encrypted = encryptData(
                            plaintext,
                            dataEncryptionKey
                        );

                        wrapped = wrapDataEncryptionKey(
                            dataEncryptionKey
                        );
                    } finally {
                        if (plaintext) {
                            plaintext.fill(0);
                        }

                        if (dataEncryptionKey) {
                            dataEncryptionKey.fill(0);
                        }
                    }

                    const actualFileId =
                        new mongoose.Types.ObjectId()
                            .toString();

                    const storagePath =
                        generateStoragePath(
                            user._id.toString(),
                            actualFileId
                        );

                    let fileDocument;

                    try {

                        fileDocument =
                            await File.create({

                                _id:
                                    actualFileId,

                                ownerId:
                                    user._id,

                                originalName:
                                    validation.originalName,

                                storagePath,

                                size:
                                    validation.size,

                                mimeType:
                                    validation.detectedMimeType ||
                                    uploadedFile.mimetype ||
                                    'application/octet-stream',

                                extension:
                                    validation.extension,

                                category:
                                    validation.category,

                                encryption: {

                                    algorithm:
                                        'aes-256-gcm',

                                    iv:
                                        encrypted.iv.toString(
                                            'base64'
                                        ),

                                    authTag:
                                        encrypted.authTag.toString(
                                            'base64'
                                        ),

                                    wrappedKey:
                                        wrapped.wrappedKey.toString(
                                            'base64'
                                        ),

                                    keyWrapIv:
                                        wrapped.keyWrapIv.toString(
                                            'base64'
                                        ),

                                    keyWrapAuthTag:
                                        wrapped.keyWrapAuthTag.toString(
                                            'base64'
                                        )

                                },

                                integrity: {

                                    sha256,

                                    verified:
                                        true

                                },

                                lifecycle: 'uploading'

                            });

                    } catch (databaseError) {
                        throw databaseError;

                    }

                    createdFiles.push(fileDocument);

                    const { error: uploadError } = await supabase
                        .storage
                        .from(SUPABASE_BUCKET)
                        .upload(storagePath, encrypted.ciphertext, {
                            contentType: 'application/octet-stream',
                            upsert: false
                        });

                    if (uploadError) {
                        throw new Error(`Supabase upload failed: ${uploadError.message}`);
                    }

                    fileDocument.lifecycle = 'active';
                    await fileDocument.save();

                    uploadedFiles.push({

                        id:
                            fileDocument._id.toString(),

                        originalName:
                            fileDocument.originalName,

                        size:
                            fileDocument.size,

                        mimeType:
                            fileDocument.mimeType,

                        extension:
                            fileDocument.extension,

                        category:
                            fileDocument.category,

                        uploadedAt:
                            fileDocument.createdAt

                    });

                }

            for (const fileDocument of createdFiles) {
                try {
                    await logFileUpload(req, fileDocument);
                } catch (auditError) {
                    console.error(
                        'File was uploaded, but its audit log could not be saved:',
                        {
                            fileId: fileDocument._id.toString(),
                            userId: user._id.toString(),
                            error: auditError.message
                        }
                    );
                }
            }

            return res.json({

                success:
                    true,

                files:
                    uploadedFiles

            });

        } catch (error) {
            console.error('File upload failed:', error);

            const rollbackFailures = [];
            for (const fileDocument of createdFiles.reverse()) {
                try {
                    await deleteSupabaseObject(fileDocument.storagePath);
                    await ShareLink.deleteMany({
                        fileId: fileDocument._id,
                        ownerId: fileDocument.ownerId
                    });
                    await File.deleteOne({
                        _id: fileDocument._id,
                        ownerId: fileDocument.ownerId
                    });
                } catch (rollbackError) {
                    rollbackFailures.push(fileDocument._id.toString());
                    await File.updateOne(
                        { _id: fileDocument._id, ownerId: fileDocument.ownerId },
                        { $set: { lifecycle: 'delete_failed', lifecycleError: String(rollbackError.message).slice(0, 500) } }
                    ).catch((statusError) => console.error('Could not persist upload rollback failure:', statusError.message));
                    console.error(
                        'Failed to roll back a partial multi-file upload:',
                        {
                            fileId: fileDocument._id.toString(),
                            error: rollbackError.message
                        }
                    );
                }
            }

            for (const file of temporaryFiles) {
                try {
                    await cleanupTempFile(file.path);
                } catch (cleanupError) {
                    console.error(
                        'Failed to clean temporary upload file:',
                        cleanupError.message
                    );
                }
            }

            const message = String(error?.message || '');

            let statusCode = 500;
            let publicMessage = 'File upload failed. Please try again.';

            if (
                message === 'No files received.' ||
                message.includes('File rejected because malware was detected.')
            ) {
                statusCode = 400;
                publicMessage =
                    message === 'No files received.'
                        ? 'No files received.'
                        : 'The uploaded file was rejected by the security scanner.';
            } else if (message.includes('Malware scanner failed.')) {
                statusCode = 503;
                publicMessage =
                    'File security scanning is temporarily unavailable. Please try again later.';
            } else if (
                message.toLowerCase().includes('file too large') ||
                message.toLowerCase().includes('file size')
            ) {
                statusCode = 413;
                publicMessage = 'The uploaded file exceeds the allowed size.';
            }

            return res.status(statusCode).json({
                error: rollbackFailures.length
                    ? 'The upload failed and some files could not be rolled back. Refresh your file list and contact support if they remain.'
                    : publicMessage,
                ...(rollbackFailures.length
                    ? { partial: true, fileIds: rollbackFailures }
                    : {})
            });
        }

    }
);


/*
|--------------------------------------------------------------------------
| GET /files/download/:id
|--------------------------------------------------------------------------
*/

router.get(
    '/download/:id',
    requireAuth,
    async (req, res) => {

        let plaintext = null;
        let dataEncryptionKey = null;

        try {

            const user =
                await getAuthenticatedUser(
                    req
                );

            
            if (!user) {
                return res.status(401).json({
                    error: 'Authenticated user not found.'
                });
            }

            if (user.status !== 'active') {
                return res.status(403).json({
                    error: 'This account is disabled.'
                });
            }

            if (
                !mongoose.Types.ObjectId.isValid(
                    req.params.id
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            'Invalid file ID.'
                    });

            }

            const file =
                await File.findOne({

                    _id:
                        req.params.id,

                    ownerId:
                        user._id,

                    lifecycle: { $in: ['active', null] }

                });

            if (!file) {

                return res
                    .status(404)
                    .json({
                        error:
                            'File not found.'
                    });

            }


            const encryptedBuffer =
                await downloadSupabaseObject(
                    file.storagePath
                );

            dataEncryptionKey =
                unwrapDataEncryptionKey(

                    Buffer.from(
                        file.encryption.wrappedKey,
                        'base64'
                    ),

                    Buffer.from(
                        file.encryption.keyWrapIv,
                        'base64'
                    ),

                    Buffer.from(
                        file.encryption.keyWrapAuthTag,
                        'base64'
                    )

                );

            plaintext =
                decryptData(

                    encryptedBuffer,

                    dataEncryptionKey,

                    Buffer.from(
                        file.encryption.iv,
                        'base64'
                    ),

                    Buffer.from(
                        file.encryption.authTag,
                        'base64'
                    )

                );

            const calculatedSha256 =
                calculateSha256(
                    plaintext
                );

                const storedSha256 = file.integrity?.sha256;
                if (!/^[a-f0-9]{64}$/i.test(String(storedSha256 || ''))) {
                    return res.status(500).json({
                        error: 'File integrity metadata is unavailable; download blocked.'
                    });
                }

                if (
                    calculatedSha256.toLowerCase() !==
                    storedSha256.toLowerCase()
                ) {

                return res
                    .status(500)
                    .json({
                        error:
                            'File integrity verification failed.'
                    });

            }

            res.setHeader(
                'Content-Type',
                file.mimeType
            );

            res.setHeader(
                'Content-Length',
                plaintext.length
            );

            const encodedFilename =
                encodeURIComponent(
                    file.originalName
                );

            res.setHeader(
                'Content-Disposition',
                `attachment; filename*=UTF-8''${encodedFilename}`
            );

            /*
            |--------------------------------------------------------------------------
            | Audit Log
            |--------------------------------------------------------------------------
            |
            | Log only after:
            | - authentication succeeds
            | - ownership is verified
            | - Supabase download succeeds
            | - AES-GCM decryption succeeds
            | - SHA-256 integrity verification succeeds
            |
            */

            // Ordinary download logging is best effort. Delivery must not fail
            // because the audit collection is temporarily unavailable.
            void logFileDownload(req, file).catch((auditError) => {
                console.error('File download audit log failed:', {
                    fileId: file._id.toString(),
                    error: auditError.message
                });
            });

            return res.send(
                plaintext
            );

        } catch (error) {

            console.error(
                'File download failed:',
                error.message
            );

            return res
                .status(500)
                .json({
                    error:
                        'Unable to download file.'
                });

        } finally {

            if (plaintext) {

                plaintext.fill(0);

            }

            if (dataEncryptionKey) {

                dataEncryptionKey.fill(0);

            }

        }

    }
);


/*
|--------------------------------------------------------------------------
| POST /files/share/:id
|--------------------------------------------------------------------------
| Create or update a secure share link.
|
| Rules:
| - Active share = update existing share settings and keep its token
| - Revoked share = permanently invalidate old token and create NEW token
| - Expired share = create NEW token
| - Download-limit-reached share = create NEW token
| - Never reuse a revoked token
|--------------------------------------------------------------------------
*/

router.post(
    '/share/:id',
    requireAuth,
    async (req, res) => {

        try {

        const user = await getAuthenticatedUser(req);

        if (!user) {
            return res.status(401).json({
                error: 'Authenticated user not found.'
            });
        }

        if (user.status !== 'active') {
            return res.status(403).json({
                error: 'This account is disabled.'
            });
        }


            /*
            |--------------------------------------------------------------------------
            | Validate File ID
            |--------------------------------------------------------------------------
            */

            if (
                !mongoose.Types.ObjectId.isValid(
                    req.params.id
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            'Invalid file ID.'
                    });

            }


            /*
            |--------------------------------------------------------------------------
            | Find File
            |--------------------------------------------------------------------------
            */

            const file =
                await File.findOne({
                    _id:
                        req.params.id,

                    ownerId:
                        user._id,
                    lifecycle: { $in: ['active', null] }
                });


            if (!file) {

                return res
                    .status(404)
                    .json({
                        error:
                            'File not found.'
                    });

            }


            /*
            |--------------------------------------------------------------------------
            | Validate Password
            |--------------------------------------------------------------------------
            */

            const password =
                String(
                    req.body.password ||
                    ''
                );


            if (
                password.length < 8 ||
                password.length > 128
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            'Share password must be between 8 and 128 characters.'
                    });

            }


            /*
            |--------------------------------------------------------------------------
            | Validate Expiry
            |--------------------------------------------------------------------------
            */

            let expiresAt =
                null;


            if (
                req.body.expiresInHours !==
                    undefined &&
                req.body.expiresInHours !==
                    null &&
                req.body.expiresInHours !==
                    ''
            ) {

                const expiresInHours =
                    Number(
                        req.body.expiresInHours
                    );


                if (
                    !Number.isFinite(
                        expiresInHours
                    ) ||
                    expiresInHours <= 0 ||
                    expiresInHours >
                        24 * 30
                ) {

                    return res
                        .status(400)
                        .json({
                            error:
                                'Expiration must be between 1 hour and 30 days.'
                        });

                }


                expiresAt =
                    new Date(
                        Date.now() +
                        expiresInHours *
                        60 *
                        60 *
                        1000
                    );

            }


            /*
            |--------------------------------------------------------------------------
            | Validate Maximum Downloads
            |--------------------------------------------------------------------------
            */

            let maxDownloads =
                null;


            if (
                req.body.maxDownloads !==
                    undefined &&
                req.body.maxDownloads !==
                    null &&
                req.body.maxDownloads !==
                    ''
            ) {

                const requestedLimit =
                    Number(
                        req.body.maxDownloads
                    );


                if (
                    !Number.isInteger(
                        requestedLimit
                    ) ||
                    requestedLimit < 1 ||
                    requestedLimit > 100000
                ) {

                    return res
                        .status(400)
                        .json({
                            error:
                                'Download limit must be between 1 and 100000.'
                        });

                }


                maxDownloads =
                    requestedLimit;

            }


            /*
            |--------------------------------------------------------------------------
            | Find Existing Share
            |--------------------------------------------------------------------------
            |
            | We intentionally search BOTH active and revoked shares.
            | This allows us to detect a revoked share and make sure its
            | token is never reused.
            |--------------------------------------------------------------------------
            */

            let existingShare =
                await ShareLink.findOne({

                    fileId:
                        file._id,

                    ownerId:
                        user._id

                });


            /*
            |--------------------------------------------------------------------------
            | HANDLE EXISTING SHARE
            |--------------------------------------------------------------------------
            */

            if (existingShare) {

                /*
                |--------------------------------------------------------------------------
                | REVOKED SHARE
                |--------------------------------------------------------------------------
                |
                | IMPORTANT:
                |
                | A revoked token is permanently dead.
                |
                | Delete the old record so the unique fileId index allows
                | creation of a completely NEW share record.
                |--------------------------------------------------------------------------
                */

                if (
                    existingShare.revokedAt
                ) {

                    await ShareLink.deleteOne({

                        _id:
                            existingShare._id

                    });


                    existingShare =
                        null;

                }

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK EXPIRATION
            |--------------------------------------------------------------------------
            */

            if (
                existingShare &&
                existingShare.expiresAt &&
                new Date(
                    existingShare.expiresAt
                ).getTime() <=
                    Date.now()
            ) {

                /*
                |--------------------------------------------------------------------------
                | Expired share gets a NEW token.
                |--------------------------------------------------------------------------
                */

                await ShareLink.deleteOne({

                    _id:
                        existingShare._id

                });


                existingShare =
                    null;

            }


            /*
            |--------------------------------------------------------------------------
            | CHECK DOWNLOAD LIMIT
            |--------------------------------------------------------------------------
            */

            if (
                existingShare &&
                existingShare.maxDownloads !==
                    null &&
                existingShare.maxDownloads !==
                    undefined &&
                Number(
                    existingShare.downloadCount ||
                    0
                ) >=
                    Number(
                        existingShare.maxDownloads
                    )
            ) {

                /*
                |--------------------------------------------------------------------------
                | Limit reached = NEW token.
                |--------------------------------------------------------------------------
                */

                await ShareLink.deleteOne({

                    _id:
                        existingShare._id

                });


                existingShare =
                    null;

            }


            /*
            |--------------------------------------------------------------------------
            | UPDATE ACTIVE SHARE
            |--------------------------------------------------------------------------
            |
            | If the share is still active, KEEP THE SAME TOKEN.
            |
            |--------------------------------------------------------------------------
            */

            if (existingShare) {

                /*
                |--------------------------------------------------------------------------
                | Recover existing token
                |--------------------------------------------------------------------------
                */

                const encodedKey =
                    process.env
                        .MASTER_ENCRYPTION_KEY;


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
                            existingShare.tokenIv,
                            'base64'
                        )
                    );


                decipher.setAuthTag(
                    Buffer.from(
                        existingShare.tokenAuthTag,
                        'base64'
                    )
                );


                const rawToken =
                    Buffer.concat([

                        decipher.update(
                            Buffer.from(
                                existingShare.tokenCiphertext,
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

                const calculatedTokenHash =
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
                    calculatedTokenHash !==
                    existingShare.tokenHash
                ) {

                    throw new Error(
                        'Existing share token integrity verification failed.'
                    );

                }


                const shareUrl =
                    createShareUrl(rawToken);

                // Validate token recovery before changing any persisted share settings.
                const passwordHash = await bcrypt.hash(password, 12);
                existingShare.passwordHash = passwordHash;
                existingShare.expiresAt = expiresAt;
                existingShare.maxDownloads = maxDownloads;
                existingShare.revokedAt = null;
                await existingShare.save();

                try {
                    const auditResult = await logShareUpdated(req, existingShare, file);
                    if (!auditResult) {
                        console.error('Share settings updated but audit logging failed:', {
                            shareId: existingShare._id.toString(),
                            fileId: file._id.toString()
                        });
                    }
                } catch (auditError) {
                    console.error('Share settings updated but audit logging failed:', auditError.message);
                }


                return res
                    .status(200)
                    .json({

                        success:
                            true,

                        existing:
                            true,

                        updated:
                            true,

                        newToken:
                            false,

                        shareUrl,

                        share: {

                            id:
                                existingShare._id.toString(),

                            fileId:
                                file._id.toString(),

                            originalName:
                                file.originalName,

                            shareUrl,

                            expiresAt:
                                existingShare.expiresAt,

                            maxDownloads:
                                existingShare.maxDownloads,

                            downloadCount:
                                Number(
                                    existingShare.downloadCount ||
                                    0
                                ),

                            passwordProtected:
                                true,

                            revokedAt:
                                null,

                            createdAt:
                                existingShare.createdAt

                        }

                    });

            }


            /*
            |--------------------------------------------------------------------------
            | CREATE COMPLETELY NEW SHARE
            |--------------------------------------------------------------------------
            |
            | This happens when:
            |
            | - No previous share exists
            | - Previous share was revoked
            | - Previous share expired
            | - Previous share reached download limit
            |
            | A NEW RANDOM TOKEN is generated.
            |--------------------------------------------------------------------------
            */

            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );


            /*
            |--------------------------------------------------------------------------
            | Generate NEW Cryptographically Secure Token
            |--------------------------------------------------------------------------
            */

            const rawToken =
                crypto
                    .randomBytes(
                        32
                    )
                    .toString(
                        'base64url'
                    );


            /*
            |--------------------------------------------------------------------------
            | Hash Token
            |--------------------------------------------------------------------------
            */

            const tokenHash =
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


            /*
            |--------------------------------------------------------------------------
            | Encrypt Token
            |--------------------------------------------------------------------------
            */

            const encryptedToken =
                encryptShareToken(
                    rawToken
                );


            /*
            |--------------------------------------------------------------------------
            | Create Share Record
            |--------------------------------------------------------------------------
            */

            const shareLink =
                await ShareLink.create({

                    fileId:
                        file._id,

                    ownerId:
                        user._id,

                    tokenHash,

                    tokenCiphertext:
                        encryptedToken
                            .tokenCiphertext,

                    tokenIv:
                        encryptedToken
                            .tokenIv,

                    tokenAuthTag:
                        encryptedToken
                            .tokenAuthTag,

                    passwordHash,

                    expiresAt,

                    maxDownloads,

                    downloadCount:
                        0,

                    revokedAt:
                        null

                });
            
            try {
                await logShareCreated(req, shareLink, file);
            } catch (auditError) {
                console.error(
                    'Share link was created, but its audit log could not be saved:',
                    {
                        shareId: shareLink._id.toString(),
                        fileId: file._id.toString(),
                        userId: user._id.toString(),
                        error: auditError.message
                    }
                );
            }


            /*
            |--------------------------------------------------------------------------
            | Build NEW URL
            |--------------------------------------------------------------------------
            */

            const shareUrl =
                createShareUrl(rawToken);


            /*
            |--------------------------------------------------------------------------
            | Response
            |--------------------------------------------------------------------------
            */

            return res
                .status(201)
                .json({

                    success:
                        true,

                    existing:
                        false,

                    updated:
                        false,

                    newToken:
                        true,

                    shareUrl,

                    share: {

                        id:
                            shareLink._id.toString(),

                        fileId:
                            file._id.toString(),

                        originalName:
                            file.originalName,

                        shareUrl,

                        expiresAt,

                        maxDownloads,

                        downloadCount:
                            0,

                        passwordProtected:
                            true,

                        revokedAt:
                            null,

                        createdAt:
                            shareLink.createdAt

                    }

                });

        } catch (error) {

            /*
            |--------------------------------------------------------------------------
            | Duplicate Key
            |--------------------------------------------------------------------------
            */

            if (
                error &&
                error.code === 11000
            ) {

                return res
                    .status(409)
                    .json({

                        error:
                            'A share already exists for this file. Please refresh and try again.'

                    });

            }


            console.error(
                'Share creation/update failed:',
                error
            );


            return res
                .status(500)
                .json({

                    error:
                        'Unable to create or update share link.'

                });

        }

    }
);



/*
|--------------------------------------------------------------------------
| PUBLIC SHARE PASSWORD PAGE
|--------------------------------------------------------------------------
|
| GET /files/shared/:token
|
| Shared-file recipients must be authenticated.
|
| The recipient can:
|
| 1. Open the share URL
| 2. Log in if required
| 3. See the password form
| 4. Submit the password
|
|--------------------------------------------------------------------------
*/

router.get(
    '/shared/:token',
    async (req, res) => {
        try {

            /*
            |--------------------------------------------------------------------------
            | Require authentication
            |--------------------------------------------------------------------------
            |
            | Shared-file recipients must have a Cryptiva account.
            |
            | The requested share path is stored in the server-side session
            | so the user can be returned to the exact share after login.
            |
            |--------------------------------------------------------------------------
            */

            if (
                !req.session ||
                !req.session.user
            ) {

                const sharePath =
                    `/files/shared/${encodeURIComponent(
                        String(
                            req.params.token || ''
                        )
                    )}`;

                req.session.returnTo = sharePath;

                return req.session.save(
                    (sessionError) => {

                        if (sessionError) {

                            console.error(
                                'Share redirect session save error:',
                                sessionError
                            );

                            return res.status(500).send(
                                renderPublicSharePage({
                                    title:
                                        'Unable to open share',
                                    message:
                                        'Unable to start the secure share session.',
                                    showForm: false
                                })
                            );

                        }

                        return res.redirect(
                            `/react/login?returnTo=${encodeURIComponent(sharePath)}`
                        );

                    }
                );
            }

            const user = await getAuthenticatedUser(req);

            if (!user) {
                return res.status(401).send(
                    'Authenticated user not found.'
                );
            }

            if (user.status !== 'active') {
                return res.status(403).send(
                    'This account is disabled.'
                );
            }

            const rawToken =
                String(
                    req.params.token || ''
                );

            /*
            |--------------------------------------------------------------------------
            | Existing share logic continues below
            |--------------------------------------------------------------------------
            */

            /*
             * 32 random bytes encoded as base64url
             * are normally around 43 characters.
             */
            if (
                rawToken.length < 40 ||
                rawToken.length > 64
            ) {
                return res.status(404).send(
                    renderPublicSharePage({
                        title:
                            'Share link not found',
                        message:
                            'This share link is invalid or no longer exists.',
                        showForm: false
                    })
                );
            }

            /*
             * Hash supplied token.
             */
            const tokenHash =
                crypto
                    .createHash('sha256')
                    .update(rawToken)
                    .digest('hex');

            /*
             * Find share.
             */
            const shareLink =
                await ShareLink.findOne({
                    tokenHash
                });

            if (!shareLink) {
                return res.status(404).send(
                    renderPublicSharePage({
                        title:
                            'Share link not found',
                        message:
                            'This share link is invalid or no longer exists.',
                        showForm: false
                    })
                );
            }

            /*
             * Revoked.
             */
            if (shareLink.revokedAt) {
                return res.status(410).send(
                    renderPublicSharePage({
                        title:
                            'Share link revoked',
                        message:
                            'This share link has been revoked by the owner.',
                        showForm: false
                    })
                );
            }

            /*
             * Expired.
             */
            if (
                shareLink.expiresAt &&
                shareLink.expiresAt.getTime() <=
                    Date.now()
            ) {
                return res.status(410).send(
                    renderPublicSharePage({
                        title:
                            'Share link expired',
                        message:
                            'This share link has expired.',
                        showForm: false
                    })
                );
            }

            /*
             * Download limit reached.
             */
            if (
                shareLink.maxDownloads !== null &&
                shareLink.downloadCount >=
                    shareLink.maxDownloads
            ) {
                return res.status(410).send(
                    renderPublicSharePage({
                        title:
                            'Download limit reached',
                        message:
                            'This share link has reached its download limit.',
                        showForm: false
                    })
                );
            }

            /*
             * Find file metadata.
             */
            const file =
                await File.findOne({
                    _id:
                        shareLink.fileId,
                    ownerId:
                        shareLink.ownerId,
                    lifecycle: { $in: ['active', null] }
                });

            if (!file) {
                return res.status(404).send(
                    renderPublicSharePage({
                        title:
                            'File not found',
                        message:
                            'The shared file no longer exists.',
                        showForm: false
                    })
                );
            }

            await logShareAccessed(
                req,
                shareLink,
                file
            );

            /*
             * If no password is configured,
             * download directly.
             */
            if (!shareLink.passwordHash) {
                return verifyPublicSharedFileIntegrity(
                    req,
                    res,
                    shareLink,
                    file
                );
            }

            /*
             * Password is required.
             *
             * Render a proper password page.
             */
            return res.status(200).send(
                renderPublicSharePage({
                    title:
                        'Protected file',

                    message:
                        'This file is protected by a password.',

                    showForm: true,

                    token:
                        rawToken,

                    filename:
                        file.originalName,

                    csrfToken:
                        req.session?.csrfToken || ''
                })
            );

        } catch (error) {
            console.error(
                'Public share page failed:',
                error.message
            );

            return res.status(500).send(
                renderPublicSharePage({
                    title:
                        'Unable to open share',
                    message:
                        'Unable to access this shared file.',
                    showForm: false
                })
            );
        }
    }
);


/*
|--------------------------------------------------------------------------
| PUBLIC SHARE PASSWORD SUBMISSION
|--------------------------------------------------------------------------
|
| POST /files/shared/:token
|
| The recipient must be authenticated.
|
|--------------------------------------------------------------------------
*/

router.post(
    '/shared/:token',
    sharePasswordRateLimiter,
    requireAuth,
    async (req, res) => {
        try {
            // Verify the authenticated user's current database account status.
            const user = await getAuthenticatedUser(req);

            if (!user) {
                return res.status(401).json({
                    error: 'Authenticated user not found.'
                });
            }

            if (user.status !== 'active') {
                return res.status(403).json({
                    error: 'This account is disabled.'
                });
            }

            // Continue with the existing code here.
            const rawToken = String(req.params.token || '');

            /*
             * Validate token format.
             */
            if (
                rawToken.length < 40 ||
                rawToken.length > 64
            ) {
                return res.status(404).send(
                    renderPublicSharePage({
                        title:
                            'Share link not found',
                        message:
                            'This share link is invalid or no longer exists.',
                        showForm: false
                    })
                );
            }

            /*
             * Find share by token hash.
             */
            const tokenHash =
                crypto
                    .createHash('sha256')
                    .update(rawToken)
                    .digest('hex');

            const shareLink =
                await ShareLink.findOne({
                    tokenHash
                });

            if (!shareLink) {
                return res.status(404).send(
                    renderPublicSharePage({
                        title:
                            'Share link not found',
                        message:
                            'This share link is invalid or no longer exists.',
                        showForm: false
                    })
                );
            }

            /*
             * Revocation.
             */
            if (shareLink.revokedAt) {
                return res.status(410).send(
                    renderPublicSharePage({
                        title:
                            'Share link revoked',
                        message:
                            'This share link has been revoked.',
                        showForm: false
                    })
                );
            }

            /*
             * Expiration.
             */
            if (
                shareLink.expiresAt &&
                shareLink.expiresAt.getTime() <=
                    Date.now()
            ) {
                return res.status(410).send(
                    renderPublicSharePage({
                        title:
                            'Share link expired',
                        message:
                            'This share link has expired.',
                        showForm: false
                    })
                );
            }

            /*
             * Download limit.
             */
            if (
                shareLink.maxDownloads !== null &&
                shareLink.downloadCount >=
                    shareLink.maxDownloads
            ) {
                return res.status(410).send(
                    renderPublicSharePage({
                        title:
                            'Download limit reached',
                        message:
                            'This share link has reached its download limit.',
                        showForm: false
                    })
                );
            }

            /*
             * Retrieve file.
             */
            const file =
                await File.findOne({
                    _id:
                        shareLink.fileId,
                    ownerId:
                        shareLink.ownerId,
                    lifecycle: { $in: ['active', null] }
                });

            if (!file) {
                return res.status(404).send(
                    renderPublicSharePage({
                        title:
                            'File not found',
                        message:
                            'The shared file no longer exists.',
                        showForm: false
                    })
                );
            }

            /*
             * If this share has no password,
             * allow the download.
             */
            if (!shareLink.passwordHash) {
                return verifyPublicSharedFileIntegrity(
                    req,
                    res,
                    shareLink,
                    file
                );
            }

            /*
             * Read submitted password.
             */
            const suppliedPassword =
                typeof req.body.password === 'string'
                    ? req.body.password
                    : '';

            /*
             * Empty password.
             */
            if (
                suppliedPassword.length === 0
            ) {
                return res.status(401).send(
                    renderPublicSharePage({
                        title:
                            'Password required',
                        message:
                            'Please enter the password for this file.',
                        showForm: true,
                        token:
                            rawToken,
                        filename:
                            file.originalName,
                        csrfToken:
                            req.session?.csrfToken || ''
                    })
                );
            }

            /*
             * Verify bcrypt password.
             */
            const passwordCorrect =
                await bcrypt.compare(
                    suppliedPassword,
                    shareLink.passwordHash
                );

            if (!passwordCorrect) {
                await logSharePasswordFailed(
                    req,
                    shareLink,
                    file
                );

                return res.status(401).send(
                    renderPublicSharePage({
                        title:
                            'Incorrect password',
                        message:
                            'The password you entered is incorrect.',
                        showForm: true,
                        token:
                            rawToken,
                        filename:
                            file.originalName,
                        csrfToken:
                            req.session?.csrfToken || ''
                    })
                );
            }

            /*
             * Correct password.
             *
             * Proceed with secure download.
             */
            req.session.sharePasswordVerified = {
                tokenHash: shareLink.tokenHash,
                shareId: shareLink._id.toString(),
                passwordHash: shareLink.passwordHash,
                expiresAt: Date.now() + 5 * 60 * 1000
            };

            return verifyPublicSharedFileIntegrity(
                req,
                res,
                shareLink,
                file
            );

        } catch (error) {
            console.error(
                'Public share password verification failed:',
                error.message
            );

            return res.status(500).send(
                renderPublicSharePage({
                    title:
                        'Download failed',
                    message:
                        'Unable to process the shared file.',
                    showForm: false
                })
            );
        }
    }
);


/* 
|-------------------------------------------------------------------------- 
| PUBLIC SHARE INTEGRITY VERIFICATION
|-------------------------------------------------------------------------- 
| 
| Verifies the decrypted shared file before allowing the recipient
| to download it.
|
|-------------------------------------------------------------------------- 
*/

async function verifyPublicSharedFileIntegrity(
    req,
    res,
    shareLink,
    file
) {
    let plaintext = null;
    let dataEncryptionKey = null;

    try {

        /*
        |--------------------------------------------------------------------------
        | Re-check expiration
        |--------------------------------------------------------------------------
        */

        if (
            shareLink.expiresAt &&
            shareLink.expiresAt.getTime() <= Date.now()
        ) {

            return res.status(410).send(
                renderPublicSharePage({
                    title:
                        'Share link expired',

                    message:
                        'This share link has expired.',

                    showForm:
                        false
                })
            );

        }


        /*
        |--------------------------------------------------------------------------
        | Re-check download limit
        |--------------------------------------------------------------------------
        */

        if (
            shareLink.maxDownloads !== null &&
            shareLink.downloadCount >=
                shareLink.maxDownloads
        ) {

            return res.status(410).send(
                renderPublicSharePage({
                    title:
                        'Download limit reached',

                    message:
                        'This share link has reached its download limit.',

                    showForm:
                        false
                })
            );

        }


        /*
        |--------------------------------------------------------------------------
        | Download encrypted ciphertext
        |--------------------------------------------------------------------------
        */

        const encryptedBuffer =
            await downloadSupabaseObject(
                file.storagePath
            );


        /*
        |--------------------------------------------------------------------------
        | Unwrap per-file DEK
        |--------------------------------------------------------------------------
        */

        dataEncryptionKey =
            unwrapDataEncryptionKey(
                Buffer.from(
                    file.encryption.wrappedKey,
                    'base64'
                ),

                Buffer.from(
                    file.encryption.keyWrapIv,
                    'base64'
                ),

                Buffer.from(
                    file.encryption.keyWrapAuthTag,
                    'base64'
                )
            );


        /*
        |--------------------------------------------------------------------------
        | AES-256-GCM decrypt
        |--------------------------------------------------------------------------
        */

        plaintext =
            decryptData(
                encryptedBuffer,
                dataEncryptionKey,

                Buffer.from(
                    file.encryption.iv,
                    'base64'
                ),

                Buffer.from(
                    file.encryption.authTag,
                    'base64'
                )
            );


        /*
        |--------------------------------------------------------------------------
        | SHA-256 integrity verification
        |--------------------------------------------------------------------------
        */

        const calculatedSha256 =
            calculateSha256(
                plaintext
            );

        const storedSha256 =
            file.integrity &&
            file.integrity.sha256
                ? String(
                    file.integrity.sha256
                ).toLowerCase()
                : '';


        /*
        |--------------------------------------------------------------------------
        | Integrity unavailable
        |--------------------------------------------------------------------------
        */

        if (!/^[a-f0-9]{64}$/i.test(storedSha256)) {

            return res.status(500).send(
                renderPublicSharePage({
                    title:
                        'Integrity verification unavailable',

                    message:
                        'The file does not contain a valid SHA-256 integrity record. The download has been blocked for security.',

                    showForm:
                        false
                })
            );

        }


        /*
        |--------------------------------------------------------------------------
        | Integrity mismatch
        |--------------------------------------------------------------------------
        */

        if (
            calculatedSha256.toLowerCase() !==
            storedSha256
        ) {

            return res.status(500).send(
                renderPublicSharePage({
                    title:
                        'Integrity verification failed',

                    message:
                        'The file failed SHA-256 integrity verification and cannot be downloaded.',

                    showForm:
                        false
                })
            );

        }

        /*
|--------------------------------------------------------------------------
| PUBLIC SHARE INTEGRITY RESULT PAGE
|--------------------------------------------------------------------------
*/

function renderPublicShareIntegrityPage({
    filename,
    size,
    expectedSha256,
    calculatedSha256,
    token,
    csrfToken,
}) {

    const safeFilename =
        String(
            filename || 'Shared file'
        )
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');


    const safeExpectedSha256 =
        String(
            expectedSha256 || ''
        )
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

    const safeCalculatedSha256 =
        String(
            calculatedSha256 || ''
        )
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');


    const safeToken =
        encodeURIComponent(
            String(token || '')
        );

    const safeCsrfToken =
    String(
        csrfToken || ''
    )
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');



    const formattedSize =
        Number.isFinite(Number(size))
            ? `${Number(size).toLocaleString()} bytes`
            : 'Unknown size';


    return `
<!DOCTYPE html>
<html lang="en">

<head>

    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>Integrity Verified - Cryptiva</title>

    <style>

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;

            display: flex;
            align-items: center;
            justify-content: center;

            padding: 24px;

            font-family:
                Arial,
                Helvetica,
                sans-serif;

            background:
                #f8fafc;

            color:
                #111827;
        }

        .card {
            width: 100%;
            max-width: 620px;

            background:
                #ffffff;

            border:
                1px solid #e5e7eb;

            border-radius:
                16px;

            padding:
                32px;

            box-shadow:
                0 10px 30px
                rgba(0, 0, 0, 0.08);
        }

        .status {
            display: flex;
            align-items: center;
            gap: 12px;

            margin-bottom: 24px;

            color:
                #166534;

            font-weight:
                700;
        }

        .check {
            width: 42px;
            height: 42px;

            display: flex;
            align-items: center;
            justify-content: center;

            border-radius:
                50%;

            background:
                #dcfce7;

            color:
                #166534;

            font-size:
                22px;
        }

        h1 {
            margin:
                0 0 10px;

            font-size:
                26px;
        }

        .filename {
            margin:
                0 0 24px;

            color:
                #4b5563;

            word-break:
                break-word;
        }

        .integrity-box {
            padding:
                18px;

            margin-bottom:
                24px;

            border:
                1px solid #bbf7d0;

            border-radius:
                12px;

            background:
                #f0fdf4;
        }

        .integrity-title {
            margin-bottom:
                8px;

            font-weight:
                700;

            color:
                #166534;
        }

        .hash {
            padding:
                12px;

            border-radius:
                8px;

            background:
                #ffffff;

            border:
                1px solid #dcfce7;

            font-family:
                Consolas,
                Monaco,
                monospace;

            font-size:
                13px;

            word-break:
                break-all;

            color:
                #374151;
        }

        .details {
            margin-bottom:
                24px;

            color:
                #6b7280;

            font-size:
                14px;
        }

        button {
            width: 100%;

            border: 0;

            border-radius:
                10px;

            padding:
                13px 18px;

            background:
                #111827;

            color:
                #ffffff;

            font-size:
                15px;

            font-weight:
                700;

            cursor:
                pointer;
        }

        button:hover {
            opacity:
                0.92;
        }

        button:disabled {
            opacity:
                0.6;

            cursor:
                not-allowed;
        }

    </style>

</head>

<body>

    <main class="card">

        <div class="status">

            <div class="check">
                âœ“
            </div>

            <div>
                Integrity Verified
            </div>

        </div>


        <h1>
            ${safeFilename}
        </h1>


        <p class="filename">
            The file has successfully passed
            SHA-256 integrity verification.
        </p>


        <section class="integrity-box">

            <div class="integrity-title">Expected SHA-256 (stored record)</div>

            <div class="hash">
                ${safeExpectedSha256}
            </div>

            <div class="integrity-title">Calculated SHA-256 (file bytes)</div>

            <div class="hash">
                ${safeCalculatedSha256}
            </div>

        </section>


        <div class="details">
            File size: ${formattedSize}
        </div>


        <form
            method="POST"
            action="/files/shared/${safeToken}/download"
        >

            <input
                type="hidden"
                name="_csrf"
                value="${safeCsrfToken}"
            >

            <button
                type="submit"
            >
                Download File
            </button>

        </form>

    </main>

</body>

</html>
`;
}

        /*
        |--------------------------------------------------------------------------
        | Integrity verified
        |--------------------------------------------------------------------------
        |
        | Do NOT increment the download counter here.
        |
        | The counter should only increase when the recipient actually
        | clicks the Download File button.
        |
        |--------------------------------------------------------------------------
        */

        return res.status(200).send(
            renderPublicShareIntegrityPage({
            filename:
                file.originalName,

            size:
                file.size,

            expectedSha256:
                storedSha256,

            calculatedSha256,

            token:
                req.params.token,

            csrfToken:
                req.session?.csrfToken || ''
            })
    );

    } catch (error) {

        console.error(
            'Public share integrity verification failed:',
            error
        );

        return res.status(500).send(
            renderPublicSharePage({
                title:
                    'Integrity verification failed',

                message:
                    'Unable to verify the integrity of the shared file.',

                showForm:
                    false
            })
        );

    } finally {

        if (plaintext) plaintext.fill(0);
        if (dataEncryptionKey) dataEncryptionKey.fill(0);

    }
}

/*
|--------------------------------------------------------------------------
| PUBLIC SHARE FINAL DOWNLOAD
|--------------------------------------------------------------------------
|
| The file must have passed integrity verification before this route
| is allowed to download it.
|
|--------------------------------------------------------------------------
*/

router.post(
    '/shared/:token/download',
    requireAuth,
    async (req, res) => {
        try {
            const user = await getAuthenticatedUser(req);

            if (!user) {
                return res.status(401).json({
                    error: 'Authenticated user not found.'
                });
            }

            if (user.status !== 'active') {
                return res.status(403).json({
                    error: 'This account is disabled.'
                });
            }

            // Continue with the existing token validation here.
            const rawToken = String(req.params.token || '');


            if (
                rawToken.length < 40 ||
                rawToken.length > 64
            ) {

                return res.status(404).send(
                    renderPublicSharePage({
                        title:
                            'Share link not found',

                        message:
                            'This share link is invalid or no longer exists.',

                        showForm:
                            false
                    })
                );

            }


            const tokenHash =
                crypto
                    .createHash('sha256')
                    .update(rawToken)
                    .digest('hex');


            const shareLink =
                await ShareLink.findOne({
                    tokenHash
                });

            if (!shareLink) {
                return res.status(404).send(
                    renderPublicSharePage({
                        title: 'Share link not found',
                        message: 'This share link is invalid or no longer exists.',
                        showForm: false
                    })
                );
            }

            const verified = req.session.sharePasswordVerified;

            if (
                shareLink.passwordHash &&
                (!verified ||
                    verified.tokenHash !== shareLink.tokenHash ||
                    verified.shareId !== shareLink._id.toString() ||
                    verified.passwordHash !== shareLink.passwordHash ||
                    verified.expiresAt <= Date.now())
            ) {
                return res.status(403).send(
                    'Share password verification required.'
                );
            }


            if (shareLink.revokedAt) {

                return res.status(410).send(
                    renderPublicSharePage({
                        title:
                            'Share link revoked',

                        message:
                            'This share link has been revoked.',

                        showForm:
                            false
                    })
                );

            }


            if (
                shareLink.expiresAt &&
                shareLink.expiresAt.getTime() <=
                    Date.now()
            ) {

                return res.status(410).send(
                    renderPublicSharePage({
                        title:
                            'Share link expired',

                        message:
                            'This share link has expired.',

                        showForm:
                            false
                    })
                );

            }


            if (
                shareLink.maxDownloads !== null &&
                shareLink.downloadCount >=
                    shareLink.maxDownloads
            ) {

                return res.status(410).send(
                    renderPublicSharePage({
                        title:
                            'Download limit reached',

                        message:
                            'This share link has reached its download limit.',

                        showForm:
                            false
                    })
                );

            }


            const file =
                await File.findOne({
                    _id:
                        shareLink.fileId,

                    ownerId:
                        shareLink.ownerId,
                    lifecycle: { $in: ['active', null] }
                });


            if (!file) {

                return res.status(404).send(
                    renderPublicSharePage({
                        title:
                            'File not found',

                        message:
                            'The shared file no longer exists.',

                        showForm:
                            false
                    })
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Re-verify integrity immediately before download.
            |--------------------------------------------------------------------------
            |
            | This prevents somebody from bypassing the verification page
            | and directly calling the download endpoint.
            |
            |--------------------------------------------------------------------------
            */

            let plaintext = null;
            let dataEncryptionKey = null;

            try {

                const encryptedBuffer =
                    await downloadSupabaseObject(
                        file.storagePath
                    );


                dataEncryptionKey =
                    unwrapDataEncryptionKey(
                        Buffer.from(
                            file.encryption.wrappedKey,
                            'base64'
                        ),

                        Buffer.from(
                            file.encryption.keyWrapIv,
                            'base64'
                        ),

                        Buffer.from(
                            file.encryption.keyWrapAuthTag,
                            'base64'
                        )
                    );


                plaintext =
                    decryptData(
                        encryptedBuffer,
                        dataEncryptionKey,

                        Buffer.from(
                            file.encryption.iv,
                            'base64'
                        ),

                        Buffer.from(
                            file.encryption.authTag,
                            'base64'
                        )
                    );


                const calculatedSha256 =
                    calculateSha256(
                        plaintext
                    );


                const storedSha256 =
                    file.integrity &&
                    file.integrity.sha256
                        ? String(
                            file.integrity.sha256
                        ).toLowerCase()
                        : '';


                if (
                    !/^[a-f0-9]{64}$/i.test(storedSha256) ||
                    calculatedSha256.toLowerCase() !==
                    storedSha256
                ) {

                    return res.status(500).send(
                        renderPublicSharePage({
                            title:
                                'Integrity verification failed',

                            message:
                                'The file failed SHA-256 integrity verification and cannot be downloaded.',

                            showForm:
                                false
                        })
                    );

                }

            } finally {

                if (plaintext) plaintext.fill(0);
                if (dataEncryptionKey) dataEncryptionKey.fill(0);

            }


            /*
            |--------------------------------------------------------------------------
            | Final download
            |--------------------------------------------------------------------------
            */
           delete req.session.sharePasswordVerified;

            return downloadPublicSharedFile(
                req,
                res,
                shareLink,
                file
            );

        } catch (error) {

            console.error(
                'Final shared-file download failed:',
                error
            );

            return res.status(500).send(
                renderPublicSharePage({
                    title:
                        'Download failed',

                    message:
                        'Unable to download the shared file.',

                    showForm:
                        false
                })
            );

        }

    }
);

/*
|--------------------------------------------------------------------------
| PUBLIC SHARE DOWNLOAD HELPER
|--------------------------------------------------------------------------
*/

async function downloadPublicSharedFile(
    req,
    res,
    shareLink,
    file
) {
    let plaintext = null;
    let dataEncryptionKey = null;

    try {
        /*
         * Re-check expiration immediately before download.
         */
        if (
            shareLink.expiresAt &&
            shareLink.expiresAt.getTime() <=
                Date.now()
        ) {
            return res.status(410).send(
                renderPublicSharePage({
                    title:
                        'Share link expired',
                    message:
                        'This share link has expired.',
                    showForm: false
                })
            );
        }

        /*
         * Re-check download limit.
         */
        if (
            shareLink.maxDownloads !== null &&
            shareLink.downloadCount >=
                shareLink.maxDownloads
        ) {
            return res.status(410).send(
                renderPublicSharePage({
                    title:
                        'Download limit reached',
                    message:
                        'This share link has reached its download limit.',
                    showForm: false
                })
            );
        }

        /*
         * Download encrypted ciphertext.
         */
        const encryptedBuffer =
            await downloadSupabaseObject(
                file.storagePath
            );

        /*
         * Unwrap per-file DEK.
         */
        dataEncryptionKey =
            unwrapDataEncryptionKey(
                Buffer.from(
                    file.encryption.wrappedKey,
                    'base64'
                ),
                Buffer.from(
                    file.encryption.keyWrapIv,
                    'base64'
                ),
                Buffer.from(
                    file.encryption.keyWrapAuthTag,
                    'base64'
                )
            );

        /*
         * AES-256-GCM decrypt.
         */
        plaintext =
            decryptData(
                encryptedBuffer,
                dataEncryptionKey,
                Buffer.from(
                    file.encryption.iv,
                    'base64'
                ),
                Buffer.from(
                    file.encryption.authTag,
                    'base64'
                )
            );

        /*
         * SHA-256 integrity verification.
         */
        const calculatedSha256 =
            calculateSha256(
                plaintext
            );

        if (
            !/^[a-f0-9]{64}$/i.test(String(file.integrity?.sha256 || ''))
        ) {
            return res.status(500).send(
                renderPublicSharePage({
                    title: 'Integrity verification unavailable',
                    message: 'The file has no valid integrity record and cannot be downloaded.',
                    showForm: false
                })
            );
        }

        if (
            calculatedSha256.toLowerCase() !==
            file.integrity.sha256.toLowerCase()
        ) {
            return res.status(500).send(
                renderPublicSharePage({
                    title: 'Integrity verification failed',
                    message: 'The file failed integrity verification and cannot be downloaded.',
                    showForm: false
                })
            );
        }

        // Reserve a slot atomically before sending. A completed response counts;
        // a disconnected/failed response releases its reservation.
        const reservationId = await reserveDownloadSlot(
            ShareLink,
            shareLink._id
        );

        if (!reservationId) {
            return res.status(410).send(
                renderPublicSharePage({
                    title: 'Download limit reached',
                    message: 'This share link has reached its download limit.',
                    showForm: false
                })
            );
        }

        return await runReservedDownloadResponse({
            ShareLink,
            shareId: shareLink._id,
            reservationId,
            res,
            onCompleted: () => {
                void logShareDownload(req, shareLink, file).catch((auditError) => {
                    console.error('Shared download audit log failed:', {
                        shareId: shareLink._id.toString(),
                        fileId: file._id.toString(),
                        error: auditError.message
                    });
                });
            },
            sendResponse: async (settle, setHeartbeat) => {
                res.setHeader('Cache-Control', 'no-store');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Referrer-Policy', 'no-referrer');
                res.setHeader('Content-Type', file.mimeType);
                res.setHeader('Content-Length', plaintext.length);
                const encodedFilename = encodeURIComponent(file.originalName);
                res.setHeader(
                    'Content-Disposition',
                    `attachment; filename*=UTF-8''${encodedFilename}`
                );

                // Keep the response buffer intact until Node finishes writing it.
                const responseBody = Buffer.from(plaintext);
                const clearResponseBody = () => {
                    responseBody.fill(0);
                    res.off('finish', clearResponseBody);
                    res.off('close', clearResponseBody);
                };
                let renewalInProgress = false;
                const heartbeat = setInterval(() => {
                    if (renewalInProgress) return;
                    renewalInProgress = true;
                    void renewReservationOrAbort(
                        ShareLink,
                        shareLink._id,
                        reservationId,
                        res,
                        settle
                    ).finally(() => {
                        renewalInProgress = false;
                    });
                }, Math.floor(RESERVATION_LEASE_MS / 3));
                heartbeat.unref?.();
                setHeartbeat(heartbeat);
                res.once('finish', clearResponseBody);
                res.once('close', clearResponseBody);
                return res.send(responseBody);
            }
        });
    } catch (error) {
        console.error('Public shared file download failed:', error.message);
        return res.status(500).send(
            renderPublicSharePage({
                title: 'Download failed',
                message: 'Unable to download the shared file.',
                showForm: false
            })
        );
    } finally {
        if (plaintext) plaintext.fill(0);
        if (dataEncryptionKey) dataEncryptionKey.fill(0);
    }
}
/*
|--------------------------------------------------------------------------
| PUBLIC SHARE HTML PAGE
|--------------------------------------------------------------------------
*/
function renderPublicSharePage({
    title,
    message,
    showForm = false,
    token = '',
    filename = '',
    csrfToken = ''
}) {
    const safeTitle = escapeHtml(title);
    const safeMessage = escapeHtml(message);
    const safeFilename = escapeHtml(filename);
    const safeToken = encodeURIComponent(token);
    const safeCsrfToken = escapeHtml(csrfToken);

    const form = showForm
        ? `
            <form
                method="POST"
                action="/files/shared/${safeToken}"
                class="unlock-form"
                autocomplete="off"
            >
                <input
                    type="hidden"
                    name="_csrf"
                    value="${safeCsrfToken}"
                >

                <div class="input-wrapper">
                    <svg
                        class="input-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <rect
                            x="3"
                            y="11"
                            width="18"
                            height="10"
                            rx="2"
                        ></rect>

                        <path
                            d="M7 11V7a5 5 0 0 1 10 0v4"
                        ></path>
                    </svg>

                    <input
                        id="password"
                        name="password"
                        type="password"
                        minlength="8"
                        maxlength="128"
                        required
                        autocomplete="off"
                        autofocus
                        placeholder="Enter file password"
                    >

                    <button
                        type="button"
                        class="password-toggle"
                        onclick="togglePassword()"
                        aria-label="Show password"
                    >
                        <svg
                            id="eyeIcon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path
                                d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
                            ></path>

                            <circle
                                cx="12"
                                cy="12"
                                r="3"
                            ></circle>
                        </svg>
                    </button>
                </div>

                <button
                    type="submit"
                    class="unlock-button"
                >
                    <span>Unlock file</span>

                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M5 12h14"></path>
                        <path d="m13 6 6 6-6 6"></path>
                    </svg>
                </button>
            </form>
        `
        : '';

    const fileSection = filename
        ? `
            <div class="file-card">
                <div class="file-icon">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                    >
                        <path
                            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                        ></path>

                        <path d="M14 2v6h6"></path>

                        <path d="M8 13h8"></path>
                        <path d="M8 17h6"></path>
                    </svg>
                </div>

                <div class="file-info">
                    <span class="file-label">SHARED FILE</span>

                    <div class="file-name">
                        ${safeFilename}
                    </div>
                </div>

                <div class="protected-badge">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <rect
                            x="3"
                            y="11"
                            width="18"
                            height="10"
                            rx="2"
                        ></rect>

                        <path
                            d="M7 11V7a5 5 0 0 1 10 0v4"
                        ></path>
                    </svg>

                    Protected
                </div>
            </div>
        `
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
    >

    <meta
        name="robots"
        content="noindex,nofollow,noarchive"
    >

    <meta
        name="referrer"
        content="no-referrer"
    >

    <title>${safeTitle} - Cryptiva</title>

    <style>
        * {
            box-sizing: border-box;
        }

        html,
        body {
            margin: 0;
            padding: 0;
            min-height: 100%;
        }

        body {
            min-height: 100vh;
            font-family:
                Inter,
                ui-sans-serif,
                system-ui,
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                sans-serif;

            color: #f5f7ff;

            background:
                radial-gradient(
                    circle at 15% 10%,
                    rgba(59, 130, 246, 0.16),
                    transparent 32%
                ),
                radial-gradient(
                    circle at 85% 80%,
                    rgba(124, 58, 237, 0.16),
                    transparent 34%
                ),
                #070b14;

            display: flex;
            flex-direction: column;
            overflow-x: hidden;
        }

        body::before {
            content: "";
            position: fixed;
            inset: 0;

            pointer-events: none;

            background-image:
                linear-gradient(
                    rgba(255, 255, 255, 0.025) 1px,
                    transparent 1px
                ),
                linear-gradient(
                    90deg,
                    rgba(255, 255, 255, 0.025) 1px,
                    transparent 1px
                );

            background-size: 44px 44px;

            mask-image:
                linear-gradient(
                    to bottom,
                    rgba(0,0,0,0.9),
                    transparent 85%
                );
        }

        .ambient {
            position: fixed;
            width: 420px;
            height: 420px;
            border-radius: 50%;

            filter: blur(100px);

            opacity: 0.16;

            pointer-events: none;
        }

        .ambient.one {
            top: -180px;
            left: -160px;
            background: #2563eb;
        }

        .ambient.two {
            right: -180px;
            bottom: -180px;
            background: #7c3aed;
        }

        .topbar {
            position: relative;
            z-index: 2;

            width: 100%;
            padding: 28px 34px;

            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .brand {
            display: inline-flex;
            align-items: center;
            gap: 11px;

            color: #ffffff;
            text-decoration: none;

            font-size: 19px;
            font-weight: 700;
            letter-spacing: -0.4px;
        }

        .brand-icon {
            width: 36px;
            height: 36px;

            display: grid;
            place-items: center;

            border-radius: 10px;

            background:
                linear-gradient(
                    135deg,
                    #2563eb,
                    #7c3aed
                );

            box-shadow:
                0 8px 30px rgba(37, 99, 235, 0.28);
        }

        .brand-icon svg {
            width: 20px;
            height: 20px;
        }

        .secure-indicator {
            display: inline-flex;
            align-items: center;
            gap: 7px;

            padding: 8px 12px;

            border: 1px solid rgba(255,255,255,0.08);

            border-radius: 999px;

            background: rgba(255,255,255,0.035);

            color: #9ca8bd;

            font-size: 12px;
            font-weight: 600;
        }

        .secure-dot {
            width: 7px;
            height: 7px;

            border-radius: 50%;

            background: #34d399;

            box-shadow:
                0 0 12px rgba(52,211,153,0.7);
        }

        .page {
            position: relative;
            z-index: 1;

            flex: 1;

            display: flex;
            align-items: center;
            justify-content: center;

            padding: 50px 20px 80px;
        }

        .card {
            width: 100%;
            max-width: 520px;

            padding: 42px;

            border: 1px solid rgba(255,255,255,0.09);

            border-radius: 24px;

            background:
                linear-gradient(
                    145deg,
                    rgba(255,255,255,0.075),
                    rgba(255,255,255,0.025)
                );

            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);

            box-shadow:
                0 30px 80px rgba(0,0,0,0.42),
                inset 0 1px 0 rgba(255,255,255,0.05);

            animation: cardIn 0.55s ease-out;
        }

        @keyframes cardIn {
            from {
                opacity: 0;
                transform: translateY(14px) scale(0.985);
            }

            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        .hero-icon {
            width: 64px;
            height: 64px;

            margin-bottom: 24px;

            display: grid;
            place-items: center;

            border-radius: 18px;

            background:
                linear-gradient(
                    135deg,
                    rgba(37,99,235,0.18),
                    rgba(124,58,237,0.18)
                );

            border: 1px solid rgba(96,165,250,0.16);

            color: #8ab4ff;
        }

        .hero-icon svg {
            width: 30px;
            height: 30px;
        }

        .eyebrow {
            margin: 0 0 10px;

            color: #7f8ca5;

            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1.7px;
            text-transform: uppercase;
        }

        h1 {
            margin: 0;

            color: #ffffff;

            font-size: clamp(28px, 5vw, 38px);
            line-height: 1.12;
            letter-spacing: -1.3px;
        }

        .message {
            margin: 14px 0 26px;

            color: #98a5ba;

            font-size: 15px;
            line-height: 1.65;
        }

        .file-card {
            display: flex;
            align-items: center;
            gap: 14px;

            padding: 15px;

            margin-bottom: 24px;

            border: 1px solid rgba(255,255,255,0.07);

            border-radius: 15px;

            background: rgba(255,255,255,0.035);
        }

        .file-icon {
            flex: 0 0 auto;

            width: 44px;
            height: 44px;

            display: grid;
            place-items: center;

            border-radius: 12px;

            color: #8ab4ff;

            background: rgba(37,99,235,0.12);

            border: 1px solid rgba(96,165,250,0.12);
        }

        .file-icon svg {
            width: 22px;
            height: 22px;
        }

        .file-info {
            min-width: 0;
            flex: 1;
        }

        .file-label {
            display: block;

            margin-bottom: 4px;

            color: #66748b;

            font-size: 9px;
            font-weight: 800;
            letter-spacing: 1.2px;
        }

        .file-name {
            color: #e8edf7;

            font-size: 13px;
            font-weight: 600;

            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .protected-badge {
            flex: 0 0 auto;

            display: inline-flex;
            align-items: center;
            gap: 5px;

            padding: 6px 8px;

            border-radius: 8px;

            background: rgba(124,58,237,0.12);

            border: 1px solid rgba(124,58,237,0.18);

            color: #b7a1ff;

            font-size: 10px;
            font-weight: 700;
        }

        .protected-badge svg {
            width: 12px;
            height: 12px;
        }

        .unlock-form {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .input-wrapper {
            position: relative;
        }

        .input-wrapper input {
            width: 100%;

            height: 54px;

            padding: 0 48px 0 46px;

            border: 1px solid rgba(255,255,255,0.09);

            border-radius: 13px;

            outline: none;

            background: rgba(0,0,0,0.18);

            color: #ffffff;

            font-size: 14px;

            transition:
                border-color 0.2s ease,
                box-shadow 0.2s ease,
                background 0.2s ease;
        }

        .input-wrapper input::placeholder {
            color: #59667d;
        }

        .input-wrapper input:focus {
            border-color: rgba(96,165,250,0.55);

            background: rgba(0,0,0,0.25);

            box-shadow:
                0 0 0 4px rgba(37,99,235,0.10);
        }

        .input-icon {
            position: absolute;

            left: 16px;
            top: 50%;

            width: 19px;
            height: 19px;

            transform: translateY(-50%);

            color: #65738b;

            pointer-events: none;
        }

        .password-toggle {
            position: absolute;

            right: 10px;
            top: 50%;

            width: 34px;
            height: 34px;

            transform: translateY(-50%);

            display: grid;
            place-items: center;

            border: 0;

            border-radius: 9px;

            background: transparent;

            color: #66748b;

            cursor: pointer;

            transition:
                color 0.2s ease,
                background 0.2s ease;
        }

        .password-toggle:hover {
            color: #a8b7d1;
            background: rgba(255,255,255,0.05);
        }

        .password-toggle svg {
            width: 18px;
            height: 18px;
        }

        .unlock-button {
            width: 100%;
            height: 54px;

            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;

            border: 0;

            border-radius: 13px;

            background:
                linear-gradient(
                    135deg,
                    #2563eb,
                    #6d4aff 55%,
                    #7c3aed
                );

            color: #ffffff;

            font-size: 14px;
            font-weight: 700;

            cursor: pointer;

            box-shadow:
                0 12px 30px rgba(37,99,235,0.23);

            transition:
                transform 0.2s ease,
                box-shadow 0.2s ease,
                filter 0.2s ease;
        }

        .unlock-button:hover {
            transform: translateY(-1px);

            filter: brightness(1.08);

            box-shadow:
                0 16px 36px rgba(37,99,235,0.32);
        }

        .unlock-button:active {
            transform: translateY(0);
        }

        .unlock-button svg {
            width: 18px;
            height: 18px;
        }

        .security-note {
            display: flex;
            align-items: flex-start;
            gap: 10px;

            margin-top: 22px;
            padding-top: 20px;

            border-top: 1px solid rgba(255,255,255,0.06);

            color: #66748b;

            font-size: 11px;
            line-height: 1.6;
        }

        .security-note svg {
            flex: 0 0 auto;

            width: 16px;
            height: 16px;

            margin-top: 1px;

            color: #5d7192;
        }

        .footer {
            position: relative;
            z-index: 1;

            padding: 0 20px 28px;

            text-align: center;

            color: #414d62;

            font-size: 11px;
        }

        .footer strong {
            color: #59667c;
            font-weight: 700;
        }

        .error-state {
            text-align: center;
        }

        .error-state .hero-icon {
            margin-left: auto;
            margin-right: auto;
        }

        @media (max-width: 640px) {
            .topbar {
                padding: 20px;
            }

            .secure-indicator {
                display: none;
            }

            .page {
                padding:
                    30px 16px 60px;
            }

            .card {
                padding: 30px 22px;
                border-radius: 20px;
            }

            .file-card {
                align-items: flex-start;
            }

            .protected-badge {
                display: none;
            }

            h1 {
                font-size: 30px;
            }
        }
    </style>
</head>

<body>

    <div class="ambient one"></div>
    <div class="ambient two"></div>

    <header class="topbar">

        <div class="brand">

            <div class="brand-icon">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3z"
                    ></path>

                    <path d="m9 12 2 2 4-4"></path>
                </svg>
            </div>

            Cryptiva

        </div>

        <div class="secure-indicator">

            <span class="secure-dot"></span>

            Secure file sharing

        </div>

    </header>

    <main class="page">

        <section class="card">

            ${
                showForm
                    ? `
                        <div class="hero-icon">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                            >
                                <rect
                                    x="3"
                                    y="11"
                                    width="18"
                                    height="10"
                                    rx="2"
                                ></rect>

                                <path
                                    d="M7 11V7a5 5 0 0 1 10 0v4"
                                ></path>
                            </svg>
                        </div>
                    `
                    : `
                        <div class="hero-icon">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                            >
                                <path
                                    d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3z"
                                ></path>

                                <path d="M9 12h6"></path>
                            </svg>
                        </div>
                    `
            }

            <p class="eyebrow">
                Cryptiva Secure Share
            </p>

            <h1>
                ${safeTitle}
            </h1>

            <p class="message">
                ${safeMessage}
            </p>

            ${fileSection}

            ${form}

            ${
                showForm
                    ? `
                        <div class="security-note">

                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <path
                                    d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3z"
                                ></path>

                                <path d="M12 8v4"></path>
                                <circle
                                    cx="12"
                                    cy="16"
                                    r=".5"
                                    fill="currentColor"
                                ></circle>
                            </svg>

                            <span>
                                This file is protected by Cryptiva.
                                Your password is verified securely
                                before the encrypted file is released.
                            </span>

                        </div>
                    `
                    : ''
            }

        </section>

    </main>

    <footer class="footer">
        Secured by <strong>Cryptiva</strong> Â· Private encrypted file sharing
    </footer>

    <script>
        function togglePassword() {
            const input = document.getElementById('password');
            const icon = document.getElementById('eyeIcon');

            if (!input || !icon) {
                return;
            }

            if (input.type === 'password') {
                input.type = 'text';

                icon.innerHTML =
                    '<path d="M3 3l18 18"></path>' +
                    '<path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path>' +
                    '<path d="M9.9 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a18.2 18.2 0 0 1-3 3.9"></path>' +
                    '<path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.2-1"></path>';
            } else {
                input.type = 'password';

                icon.innerHTML =
                    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path>' +
                    '<circle cx="12" cy="12" r="3"></circle>';
            }
        }
    </script>

</body>
</html>`;
}

/*
|--------------------------------------------------------------------------
| HTML ESCAPE
|--------------------------------------------------------------------------
*/

function escapeHtml(value) {
    return String(
        value ?? ''
    )
        .replaceAll(
            '&',
            '&amp;'
        )
        .replaceAll(
            '<',
            '&lt;'
        )
        .replaceAll(
            '>',
            '&gt;'
        )
        .replaceAll(
            '"',
            '&quot;'
        )
        .replaceAll(
            "'",
            '&#039;'
        );
}


/*
|--------------------------------------------------------------------------
| DELETE /files/:id
|--------------------------------------------------------------------------
*/

router.delete(
    '/:id',
    requireAuth,
    async (req, res) => {

        try {

            const user =
                await getAuthenticatedUser(
                    req
                );

            
            
            if (!user) {
                return res.status(401).json({
                    error: 'Authenticated user not found.'
                });
            }

            if (user.status !== 'active') {
                return res.status(403).json({
                    error: 'This account is disabled.'
                });
            }

            if (
                !mongoose.Types.ObjectId.isValid(
                    req.params.id
                )
            ) {

                return res
                    .status(400)
                    .json({
                        error:
                            'Invalid file ID.'
                    });

            }

            const file =
                await File.findOne({

                    _id:
                        req.params.id,

                    ownerId:
                        user._id

                });

            if (!file) {

                return res
                    .status(404)
                    .json({
                        error:
                            'File not found.'
                    });

            }

            // Mark first so downloads and shares can reject this file while
            // deletion is in progress. A retry resumes the idempotent workflow.
            file.lifecycle = 'deleting';
            file.lifecycleError = null;
            await file.save();
            try {
                await deleteSupabaseObject(file.storagePath);
                await ShareLink.deleteMany({ fileId: file._id, ownerId: user._id });
                await File.deleteOne({ _id: file._id, ownerId: user._id });
            } catch (cleanupError) {
                await File.updateOne(
                    { _id: file._id, ownerId: user._id },
                    { $set: { lifecycle: 'delete_failed', lifecycleError: String(cleanupError.message).slice(0, 500) } }
                ).catch((statusError) => console.error('Could not persist deletion failure state:', statusError.message));
                throw cleanupError;
            }
            try {
                const auditResult = await logFileDelete(req, file);
                if (!auditResult) {
                    console.error('File deleted, but deletion audit logging failed:', {
                        fileId: file._id.toString(),
                        userId: user._id.toString()
                    });
                }
            } catch (auditError) {
                // Cleanup already succeeded; an audit outage must not report a false deletion failure.
                console.error('File deleted, but deletion audit logging failed:', auditError.message);
            }

            return res.json({

                success:
                    true

            });

        } catch (error) {

            console.error(
                'File deletion failed:',
                error.message
            );

            return res
                .status(500)
                .json({
                    error:
                        'Unable to delete file.'
                });

        }

    }
);

/*
|--------------------------------------------------------------------------
| GET /files/data
|--------------------------------------------------------------------------
| Return the authenticated user's files in real time.
|--------------------------------------------------------------------------
*/

router.get(
    '/data',
    requireAuth,
    async (req, res) => {
        try {
            const user = await getAuthenticatedUser(req);

            if (!user) {
                return res.status(401).json({
                    error: 'Authenticated user not found.'
                });
            }

            if (user.status !== 'active') {
                return res.status(403).json({
                    error: 'This account is disabled.'
                });
            }

            const files = await File
                .find({
                    ownerId: user._id,
                    lifecycle: { $in: ['active', null] }
                })
                .sort({
                    createdAt: -1
                })
                .lean();

            const cleanupRequired = await File.find({
                ownerId: user._id,
                lifecycle: { $in: ['uploading', 'deleting', 'delete_failed'] }
            }).select('_id lifecycle').lean();

            const fileData = files.map(
                (file) => {

                    return {
                        id: String(file._id),

                        originalName:
                            file.originalName,

                        size:
                            Number(file.size || 0),

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
                        }
                    };

                }
            );

            const totalSize =
                fileData.reduce(
                    (total, file) =>
                        total +
                        Number(file.size || 0),
                    0
                );

            const sharedCount =
                await ShareLink.countDocuments({
                    ownerId: user._id
                });

            return res.status(200).json({

                success: true,

                username:
                    user.username,

                fileCount:
                    fileData.length,

                totalSize,

                sharedCount,

                files:
                    fileData,

                cleanupRequired: cleanupRequired.map((file) => ({
                    id: String(file._id),
                    status: file.lifecycle
                }))

            });

        } catch (error) {

            console.error(
                'GET /files/data failed:',
                error
            );

            return res.status(500).json({

                error:
                    'Unable to load files.'

            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| Export Router
|--------------------------------------------------------------------------
*/

module.exports = router;




