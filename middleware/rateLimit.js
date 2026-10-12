'use strict';

const {
    rateLimit
} = require('express-rate-limit');
const mongoose = require('mongoose');

class MongoRateLimitStore {
    constructor(namespace) {
        this.namespace = namespace;
        this.windowMs = 15 * 60 * 1000;
        this.localKeys = false;
        this.indexPromise = null;
    }

    init(options) {
        this.windowMs = options.windowMs;
    }

    async collection() {
        if (mongoose.connection.readyState !== 1) {
            throw new Error('MongoDB is required for rate limiting.');
        }
        const collection = mongoose.connection.collection('rateLimitBuckets');
        this.indexPromise ||= Promise.all([
            collection.createIndex({ key: 1 }, { unique: true }),
            collection.createIndex({ resetTime: 1 }, { expireAfterSeconds: 0 })
        ]).catch((error) => {
            this.indexPromise = null;
            throw error;
        });
        await this.indexPromise;
        return collection;
    }

    bucketKey(key) {
        return `${this.namespace}:${key}`;
    }

    async increment(key) {
        const collection = await this.collection();
        const now = new Date();
        const resetTime = new Date(now.getTime() + this.windowMs);
        const updatePipeline = [{ $set: {
                key: this.bucketKey(key),
                totalHits: {
                    $cond: [
                        { $gt: ['$resetTime', now] },
                        { $add: [{ $ifNull: ['$totalHits', 0] }, 1] },
                        1
                    ]
                },
                resetTime: {
                    $cond: [
                        { $gt: ['$resetTime', now] },
                        '$resetTime',
                        resetTime
                    ]
                }
            } }];
        let doc;
        try {
            doc = await collection.findOneAndUpdate(
                { key: this.bucketKey(key) },
                updatePipeline,
                { upsert: true, returnDocument: 'after' }
            );
        } catch (error) {
            // Concurrent first hits can race to insert the same unique key.
            if (error.code !== 11000) throw error;
            doc = await collection.findOneAndUpdate(
                { key: this.bucketKey(key) },
                updatePipeline,
                { returnDocument: 'after' }
            );
        }
        return { totalHits: doc.totalHits, resetTime: doc.resetTime };
    }

    async decrement(key) {
        const collection = await this.collection();
        await collection.updateOne(
            { key: this.bucketKey(key) },
            [{ $set: {
                totalHits: { $max: [0, { $subtract: ['$totalHits', 1] }] }
            } }]
        );
    }

    async get(key) {
        const collection = await this.collection();
        const doc = await collection.findOne({
            key: this.bucketKey(key),
            resetTime: { $gt: new Date() }
        });
        return doc ? { totalHits: doc.totalHits, resetTime: doc.resetTime } : undefined;
    }

    async resetKey(key) {
        const collection = await this.collection();
        await collection.deleteOne({ key: this.bucketKey(key) });
    }

    async resetAll() {
        const collection = await this.collection();
        await collection.deleteMany({ key: new RegExp(`^${this.namespace}:`) });
    }

    shutdown() {}
}


const loginRateLimiter = rateLimit({

    store: new MongoRateLimitStore('login'),

    windowMs: 15 * 60 * 1000,

    limit: 5,

    standardHeaders: 'draft-8',

    legacyHeaders: false,

    skipSuccessfulRequests: false,

    skipFailedRequests: false,

    handler: (req, res) => {

        console.warn(
            `Login rate limit exceeded from IP: ${req.ip}`
        );

        return res.status(429).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                >
                <title>Too Many Attempts — Cryptiva</title>

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

                        background:
                            radial-gradient(
                                circle at 15% 20%,
                                rgba(108, 95, 250, 0.16),
                                transparent 35%
                            ),
                            radial-gradient(
                                circle at 85% 80%,
                                rgba(0, 212, 255, 0.10),
                                transparent 35%
                            ),
                            #07070d;

                        color: #ede9ff;

                        font-family:
                            Inter,
                            "Segoe UI",
                            Arial,
                            sans-serif;

                        padding: 24px;
                    }

                    .card {
                        width: 100%;
                        max-width: 460px;

                        padding: 38px;

                        border-radius: 26px;

                        background:
                            rgba(15, 15, 26, 0.92);

                        border:
                            1px solid
                            rgba(255, 255, 255, 0.10);

                        box-shadow:
                            0 30px 100px
                            rgba(0, 0, 0, 0.45);

                        text-align: center;
                    }

                    .icon {
                        width: 58px;
                        height: 58px;

                        margin: 0 auto 20px;

                        display: flex;
                        align-items: center;
                        justify-content: center;

                        border-radius: 18px;

                        background:
                            rgba(248, 113, 113, 0.10);

                        border:
                            1px solid
                            rgba(248, 113, 113, 0.25);

                        font-size: 27px;
                    }

                    h1 {
                        margin: 0 0 12px;

                        font-size: 26px;
                        font-weight: 700;
                    }

                    p {
                        margin: 0 0 26px;

                        color: #85859d;

                        font-size: 14px;
                        line-height: 1.7;
                    }

                    a {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;

                        padding: 13px 22px;

                        border-radius: 12px;

                        color: white;

                        text-decoration: none;

                        font-size: 14px;
                        font-weight: 600;

                        background:
                            linear-gradient(
                                135deg,
                                #6c5ffa,
                                #00c9f2
                            );

                        transition:
                            transform 0.2s ease,
                            box-shadow 0.2s ease;
                    }

                    a:hover {
                        transform: translateY(-2px);

                        box-shadow:
                            0 12px 30px
                            rgba(108, 95, 250, 0.28);
                    }
                </style>
            </head>

            <body>

                <div class="card">

                    <div class="icon">
                        ⚠
                    </div>

                    <h1>
                        Too many login attempts
                    </h1>

                    <p>
                        Too many login attempts.
                        Please try again later.
                    </p>

                    <a href="/login">
                        Return to sign in
                    </a>

                </div>

            </body>
            </html>
        `);
    }

});


const sharePasswordRateLimiter = rateLimit({

    store: new MongoRateLimitStore('share-password'),

    windowMs: 15 * 60 * 1000,

    limit: 5,

    standardHeaders: 'draft-8',

    legacyHeaders: false,

    skipSuccessfulRequests: true,

    skipFailedRequests: false,

    handler: (req, res) => {

        console.warn(
            `Share password rate limit exceeded from IP: ${req.ip}`
        );

        return res.status(429).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">

                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                >

                <title>Too Many Attempts — Cryptiva</title>

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

                        background: #07070d;

                        color: #ede9ff;

                        font-family:
                            Inter,
                            "Segoe UI",
                            Arial,
                            sans-serif;

                        padding: 24px;
                    }

                    .card {
                        width: 100%;
                        max-width: 460px;

                        padding: 38px;

                        border-radius: 26px;

                        background:
                            rgba(15, 15, 26, 0.92);

                        border:
                            1px solid
                            rgba(255, 255, 255, 0.10);

                        box-shadow:
                            0 30px 100px
                            rgba(0, 0, 0, 0.45);

                        text-align: center;
                    }

                    h1 {
                        margin: 0 0 12px;

                        font-size: 26px;
                        font-weight: 700;
                    }

                    p {
                        margin: 0 0 26px;

                        color: #85859d;

                        font-size: 14px;
                        line-height: 1.7;
                    }

                    a {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;

                        padding: 13px 22px;

                        border-radius: 12px;

                        color: white;

                        text-decoration: none;

                        font-size: 14px;
                        font-weight: 600;

                        background:
                            linear-gradient(
                                135deg,
                                #6c5ffa,
                                #00c9f2
                            );
                    }
                </style>
            </head>

            <body>

                <div class="card">

                    <h1>
                        Too many attempts
                    </h1>

                    <p>
                        Too many password attempts.
                        Please try again later.
                    </p>

                    <a href="/dashboard">
                        Return to Cryptiva
                    </a>

                </div>

            </body>
            </html>
        `);
    }

});


module.exports = {
    MongoRateLimitStore,
    loginRateLimiter,
    sharePasswordRateLimiter
};
