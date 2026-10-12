const mongoose = require('mongoose');

const shareLinkSchema = new mongoose.Schema(
    {
        /*
         * ONE SHARE LINK PER FILE
         */
        fileId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'File',
            required: true
        },

        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        /*
         * SHA-256 hash of the random share token.
         *
         * The raw token is never stored as plaintext.
         */
        tokenHash: {
            type: String,
            required: true,
            match: /^[a-fA-F0-9]{64}$/
        },

        /*
         * Encrypted raw share token.
         *
         * AES-256-GCM using MASTER_ENCRYPTION_KEY.
         */
        tokenCiphertext: {
            type: String,
            default: null
        },

        tokenIv: {
            type: String,
            default: null
        },

        tokenAuthTag: {
            type: String,
            default: null
        },

        /*
         * Optional bcrypt password hash.
         */
        passwordHash: {
            type: String,
            default: null
        },

        /*
         * Share expiration.
         *
         * null = never expires.
         */
        expiresAt: {
            type: Date,
            default: null
        },

        /*
         * Maximum successful downloads.
         *
         * null = unlimited.
         */
        maxDownloads: {
            type: Number,
            default: null,
            min: 1,
            max: 100000
        },

        /*
         * Successful download count.
         */
        downloadCount: {
            type: Number,
            default: 0,
            min: 0
        },

        // Reservations prevent concurrent responses exceeding maxDownloads.
        activeDownloads: {
            type: Number,
            default: 0,
            min: 0
        },

        // Individual expiring leases allow crashed workers to be reclaimed.
        activeDownloadReservations: {
            type: [{
                _id: false,
                id: { type: String, required: true },
                expiresAt: { type: Date, required: true }
            }],
            default: []
        },

        /*
         * Revocation timestamp.
         *
         * null = active.
         */
        revokedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true,
        collection: 'shareLinks'
    }
);


/*
|--------------------------------------------------------------------------
| INDEXES
|--------------------------------------------------------------------------
*/

/*
 * ONE SHARE LINK PER FILE
 */
shareLinkSchema.index(
    { fileId: 1 },
    { unique: true }
);

/*
 * Owner dashboard sorting
 */
shareLinkSchema.index({
    ownerId: 1,
    createdAt: -1
});

/*
 * Token lookup
 */
shareLinkSchema.index(
    { tokenHash: 1 },
    { unique: true }
);

/*
 * Expiration lookup
 */
shareLinkSchema.index({
    expiresAt: 1
});


/*
|--------------------------------------------------------------------------
| MODEL
|--------------------------------------------------------------------------
*/

module.exports = mongoose.model(
    'ShareLink',
    shareLinkSchema
);
