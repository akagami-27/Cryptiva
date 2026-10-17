const express = require('express');

const session = require('express-session');

const { MongoStore } = require('connect-mongo');

const mongoose = require('mongoose');

const flash = require('connect-flash');

const path = require('path');

const helmet = require('helmet');

const dotenv = require('dotenv');

const fs = require('fs');

const getPublicAppUrl = require('./config/publicAppUrl');

const connectMongoDB = require('./config/mongodb');
const { validateMasterEncryptionKey } = require('./services/cryptoService');
const { validateJwtConfig } = require('./services/jwtService');
const { hydrateJwtIdentity } = require('./middleware/auth');

const {
    ensureCsrfToken,
    requireCsrf
} = require('./middleware/csrf');

const {
    errorHandler,
    notFoundHandler
} = require('./middleware/errorHandler');

const securityRoutes =
    require('./routes/security');

const profileRoutes =
    require('./routes/profile');


/*
|--------------------------------------------------------------------------
| Environment Configuration
|--------------------------------------------------------------------------
*/

dotenv.config();


const SESSION_SECRET = process.env.SESSION_SECRET;

const PORT = process.env.PORT || 3000;

const NODE_ENV = process.env.NODE_ENV || 'development';

const sessionTtlSeconds = 60 * 60 * 24;
let resolveMongoSessionClient;
const mongoSessionClient = new Promise((resolve) => {
    resolveMongoSessionClient = resolve;
});
const sessionStore = MongoStore.create({
    clientPromise: mongoSessionClient,
    collectionName: 'sessions',
    ttl: sessionTtlSeconds,
    autoRemove: 'native'
});


/*
|--------------------------------------------------------------------------
| Environment Validation
|--------------------------------------------------------------------------
*/

if (!SESSION_SECRET) {

    console.error(
        '✗ SESSION_SECRET is not defined in .env'
    );

    process.exit(1);

}


if (SESSION_SECRET.length < 32) {

    console.error(
        '✗ SESSION_SECRET must be at least 32 characters long'
    );

    process.exit(1);

}

try {
    validateMasterEncryptionKey();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

try {
    validateJwtConfig();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

try {
    getPublicAppUrl();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}


/*
|--------------------------------------------------------------------------
| Express Application
|--------------------------------------------------------------------------
*/

const app = express();


/*
|--------------------------------------------------------------------------
| Basic Express Hardening
|--------------------------------------------------------------------------
*/

app.disable('x-powered-by');


/*
|--------------------------------------------------------------------------
| Security Headers - Helmet
|--------------------------------------------------------------------------
*/

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                'upgrade-insecure-requests':
                    NODE_ENV === 'production'
                        ? []
                        : null
            }
        },

        strictTransportSecurity:
            NODE_ENV === 'production'
                ? undefined
                : false
    })
);

app.get('/health/live', (req, res) => res.status(200).json({ status: 'live' }));
app.get('/health/ready', (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    return res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready' });
});

/* Route page aliases before public static files so legacy HTML cannot win. */
// Removed legacy reactPages router



/*
|--------------------------------------------------------------------------
| Trust Proxy
|--------------------------------------------------------------------------
*/

if (NODE_ENV === 'production') {

    app.set(
        'trust proxy',
        1
    );

}


/*
|--------------------------------------------------------------------------
| Request Parsing
|--------------------------------------------------------------------------
*/

app.use(
    express.urlencoded({
        extended: true
    })
);


app.use(
    express.json({
        limit: '1mb'
    })
);


/*
|--------------------------------------------------------------------------
| Static Files
|--------------------------------------------------------------------------
*/

app.use(
    express.static(
        path.join(
            __dirname,
            'public'
        )
    )
);


/*
|--------------------------------------------------------------------------
| Secure Session
|--------------------------------------------------------------------------
*/

app.use(
    session({

        secret: SESSION_SECRET,

        resave: false,

        saveUninitialized: false,

        store: sessionStore,

        name: 'cryptiva.sid',

        cookie: {

            httpOnly: true,

            sameSite: 'lax',

            secure:
                NODE_ENV === 'production',

            maxAge:
                1000 *
                60 *
                60 *
                24,

            path: '/'
        }

    })
);

// JWT is the authenticated credential. The Mongo session is retained only for
// CSRF state and temporary secure-share workflows; old session-only identities
// are cleared before any route can consume req.session.user.
app.use(hydrateJwtIdentity);


/*
|--------------------------------------------------------------------------
| Prevent Browser Caching of Dynamic/Auth Pages
|--------------------------------------------------------------------------
*/

app.use(
    (req, res, next) => {

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

        next();

    }
);


/*
|--------------------------------------------------------------------------
| CSRF Token Generation
|--------------------------------------------------------------------------
*/

app.use(
    ensureCsrfToken
);


/*
|--------------------------------------------------------------------------
| React CSRF Token Endpoint
|--------------------------------------------------------------------------
| React is served by Vite during development, so its index.html meta tag
| cannot be populated by Express. Return the current session token instead.
*/

app.get('/csrf-token', (req, res) => {
    if (!req.session?.csrfToken) {
        return res.status(500).json({ error: 'Unable to initialize CSRF token.' });
    }

    return res
        .set('Cache-Control', 'no-store')
        .json({ csrfToken: req.session.csrfToken });
});


/*
|--------------------------------------------------------------------------
| CSRF Protection
|--------------------------------------------------------------------------
*/

app.use(
    requireCsrf
);


/*
|--------------------------------------------------------------------------
| Flash Messages
|--------------------------------------------------------------------------
*/

app.use(
    flash()
);


/*
|--------------------------------------------------------------------------
| Preserve Original sendFile
|--------------------------------------------------------------------------
*/

app.use(
    (req, res, next) => {

        res.originalSendFile =
            res.sendFile.bind(res);

        next();

    }
);


/*
|--------------------------------------------------------------------------
| Flash / User Variables / HTML Injection
|--------------------------------------------------------------------------
*/

app.use(
    (req, res, next) => {

        /*
        |--------------------------------------------------------------------------
        | Preserve JSON Endpoints
        |--------------------------------------------------------------------------
        */

        if (
            req.path.startsWith('/dashboard/data') ||
            req.path.startsWith('/me')
        ) {

            return next();

        }


        /*
        |--------------------------------------------------------------------------
        | Flash Messages
        |--------------------------------------------------------------------------
        */

        res.locals.flashError =
            req.flash('error')[0] || '';

        res.locals.flashSuccess =
            req.flash('success')[0] || '';


        /*
        |--------------------------------------------------------------------------
        | Current User
        |--------------------------------------------------------------------------
        */

        res.locals.user =
            req.session?.user || null;


        /*
        |--------------------------------------------------------------------------
        | CSRF Token
        |--------------------------------------------------------------------------
        */

        res.locals.csrfToken =
            req.session?.csrfToken || '';


        /*
        |--------------------------------------------------------------------------
        | Override sendFile for HTML Pages
        |--------------------------------------------------------------------------
        */

        res.sendFile = (
            filePath
        ) => {

            /*
            |--------------------------------------------------------------------------
            | Non-HTML Files
            |--------------------------------------------------------------------------
            */

            if (
                !filePath.endsWith('.html')
            ) {

                return res.originalSendFile(
                    filePath
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Read HTML File
            |--------------------------------------------------------------------------
            */

            fs.readFile(
                filePath,
                'utf-8',
                (
                    error,
                    html
                ) => {

                    if (error) {

                        console.error(
                            'Failed to load HTML file:',
                            error
                        );

                        return res
                            .status(500)
                            .send(
                                'Page load error'
                            );

                    }


                    /*
                    |--------------------------------------------------------------------------
                    | Escape HTML Attribute Data
                    |--------------------------------------------------------------------------
                    */

                    const safe =
                        (value) =>
                            String(value)
                                .replace(
                                    /&/g,
                                    '&amp;'
                                )
                                .replace(
                                    /"/g,
                                    '&quot;'
                                )
                                .replace(
                                    /</g,
                                    '&lt;'
                                )
                                .replace(
                                    />/g,
                                    '&gt;'
                                );


                    /*
                    |--------------------------------------------------------------------------
                    | CSRF Token
                    |--------------------------------------------------------------------------
                    */

                    const csrfToken =
                        safe(
                            res.locals.csrfToken || ''
                        );


                    /*
                    |--------------------------------------------------------------------------
                    | Inject Flash Data
                    |--------------------------------------------------------------------------
                    */

                    html =
                        html.replace(
                            '<body>',
                            `<body data-error="${safe(
                                res.locals.flashError
                            )}" data-success="${safe(
                                res.locals.flashSuccess
                            )}">`
                        );


                    /*
                    |--------------------------------------------------------------------------
                    | Inject CSRF Meta Tag
                    |--------------------------------------------------------------------------
                    */

                    if (
                        html.includes(
                            '<meta name="csrf-token"'
                        )
                    ) {

                        html =
                            html.replace(
                                /<meta name="csrf-token"[^>]*>/i,
                                `<meta name="csrf-token" content="${csrfToken}">`
                            );

                    } else {

                        html =
                            html.replace(
                                '<head>',
                                `<head>
<meta name="csrf-token" content="${csrfToken}">`
                            );

                    }


                    /*
                    |--------------------------------------------------------------------------
                    | Inject CSRF Token Into POST Forms
                    |--------------------------------------------------------------------------
                    */

                    html =
                        html.replace(
                            /<form\b[^>]*method=["']POST["'][^>]*>/gi,
                            (formTag) => {

                                return (
                                    formTag +
                                    `<input type="hidden" name="_csrf" value="${csrfToken}">`
                                );

                            }
                        );


                    /*
                    |--------------------------------------------------------------------------
                    | Response Headers
                    |--------------------------------------------------------------------------
                    */

                    res.setHeader(
                        'Content-Type',
                        'text/html; charset=utf-8'
                    );


                    /*
                    |--------------------------------------------------------------------------
                    | Send HTML
                    |--------------------------------------------------------------------------
                    */

                    res.send(
                        html
                    );

                }
            );

        };


        next();

    }
);


/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
*/

app.use(
    '/',
    require('./routes/auth')
);


/*
|--------------------------------------------------------------------------
| Dashboard
|--------------------------------------------------------------------------
*/

app.use(
    '/dashboard',
    require('./routes/dashboard')
);

/*
|--------------------------------------------------------------------------
| Activity Log
|--------------------------------------------------------------------------
*/

app.use(
    '/activity',
    require('./routes/activity')
);

app.use(
    '/search',
    require('./routes/search')
);


/*
|--------------------------------------------------------------------------
| Files Page
|--------------------------------------------------------------------------
|
| GET /files
|
| This route serves the Cryptiva My Files interface.
|
| IMPORTANT:
| This must come BEFORE the existing files API router.
|
|--------------------------------------------------------------------------
*/

app.use(
    '/files',
    require('./routes/filepage')
);


/*
|--------------------------------------------------------------------------
| Files API
|--------------------------------------------------------------------------
|
| Existing secure file operations remain here:
|
| POST   /files/upload
| GET    /files/download/:id
| POST   /files/share/:id
| GET    /files/shared/:token
| POST   /files/shared/:token
| DELETE /files/:id
|
|--------------------------------------------------------------------------
*/

app.use(
    '/files',
    require('./routes/files')
);

app.use(
    '/shared', 
    require('./routes/shared')
);

app.use(
    '/security',
    securityRoutes
);


app.use(
    '/profile',
    profileRoutes
);

/* Serve the production React build and support direct BrowserRouter refreshes. */
const reactDistPath = path.join(__dirname, 'client', 'dist');
const reactIndexPath = path.join(reactDistPath, 'index.html');
app.use(express.static(reactDistPath, { index: false }));
app.get(/^\/(?!api|health|files|shared|security|profile|activity|search|dashboard|login|register|logout|csrf-token).*$/, (req, res, next) => {
    if (!fs.existsSync(reactIndexPath)) return next();
    return res.sendFile(reactIndexPath);
});


/*
|--------------------------------------------------------------------------
| Test Endpoint
|--------------------------------------------------------------------------
*/

app.get(
    '/test',
    (req, res) => {

        res.send(
            'Test working'
        );

    }
);


/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/

app.use(
    notFoundHandler
);


/*
|--------------------------------------------------------------------------
| Centralized Error Handler
|--------------------------------------------------------------------------
*/

app.use(
    errorHandler
);


/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/

async function startServer() {

    try {

        console.log(
            'Connecting to MongoDB Atlas...'
        );


        await connectMongoDB();

        resolveMongoSessionClient(mongoose.connection.getClient());


        console.log(
            '✓ MongoDB Atlas connection successful'
        );


        const httpServer = app.listen(
            PORT,
            () => {

                console.log(
                    `Cryptiva listening on port ${PORT}`
                );

                console.log(
                    `✓ Environment: ${NODE_ENV}`
                );

            }
        );

        const shutdown = (signal) => {
            console.log(`${signal} received; closing Cryptiva.`);
            httpServer.close(async () => {
                try {
                    await mongoose.disconnect();
                    process.exit(0);
                } catch (error) {
                    console.error('Graceful shutdown failed:', error.message);
                    process.exit(1);
                }
            });
            setTimeout(() => process.exit(1), 10000).unref();
        };

        process.once('SIGTERM', () => shutdown('SIGTERM'));
        process.once('SIGINT', () => shutdown('SIGINT'));


    } catch (error) {

        console.error(
            '✗ Failed to start Cryptiva'
        );

        console.error(
            error.message
        );

        process.exit(1);

    }

}


if (require.main === module) {
    startServer();
}

module.exports = app;
