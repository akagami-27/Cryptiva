const crypto = require('crypto');
const { getSafeRequestLogUrl } = require('./safeRequestLog');

const SAFE_METHODS = new Set([
    'GET',
    'HEAD',
    'OPTIONS'
]);


/*
|--------------------------------------------------------------------------
| Generate / Preserve CSRF Token
|--------------------------------------------------------------------------
*/

function ensureCsrfToken(req, res, next) {

    if (!req.session) {
        return res
            .status(500)
            .send('Session is not available.');
    }


    if (!req.session.csrfToken) {

        req.session.csrfToken =
            crypto
                .randomBytes(32)
                .toString('hex');
    }


    res.locals.csrfToken =
        req.session.csrfToken;


    next();
}


/*
|--------------------------------------------------------------------------
| Validate CSRF Token
|--------------------------------------------------------------------------
*/

function requireCsrf(req, res, next) {

    /*
    |--------------------------------------------------------------------------
    | Safe HTTP Methods
    |--------------------------------------------------------------------------
    */

    if (
        SAFE_METHODS.has(req.method)
    ) {
        return next();
    }


    /*
    |--------------------------------------------------------------------------
    | Session Check
    |--------------------------------------------------------------------------
    */

    if (!req.session) {
        return csrfError(
            req,
            res
        );
    }


    /*
    |--------------------------------------------------------------------------
    | Get Submitted Token
    |--------------------------------------------------------------------------
    */

    const submittedToken =
        req.get('X-CSRF-Token') ||
        req.body?._csrf;


    /*
    |--------------------------------------------------------------------------
    | Get Session Token
    |--------------------------------------------------------------------------
    */

    const sessionToken =
        req.session.csrfToken;


    /*
    |--------------------------------------------------------------------------
    | Missing Token
    |--------------------------------------------------------------------------
    */

    if (
        !submittedToken ||
        !sessionToken
    ) {

        return csrfError(
            req,
            res
        );
    }


    /*
    |--------------------------------------------------------------------------
    | Constant-Time Comparison
    |--------------------------------------------------------------------------
    */

    let valid = false;


    try {

        const submittedBuffer =
            Buffer.from(
                String(submittedToken),
                'utf8'
            );


        const sessionBuffer =
            Buffer.from(
                String(sessionToken),
                'utf8'
            );


        if (
            submittedBuffer.length ===
            sessionBuffer.length
        ) {

            valid =
                crypto.timingSafeEqual(
                    submittedBuffer,
                    sessionBuffer
                );
        }

    } catch (error) {

        valid = false;
    }


    /*
    |--------------------------------------------------------------------------
    | Invalid Token
    |--------------------------------------------------------------------------
    */

    if (!valid) {

        return csrfError(
            req,
            res
        );
    }


    /*
    |--------------------------------------------------------------------------
    | Valid Token
    |--------------------------------------------------------------------------
    */

    next();
}


/*
|--------------------------------------------------------------------------
| CSRF Error Handler
|--------------------------------------------------------------------------
*/

function csrfError(
    req,
    res
) {

    const { url } = getSafeRequestLogUrl(req);

    console.warn(
        `CSRF validation failed: ${req.method} ${url}`
    );


    /*
    |--------------------------------------------------------------------------
    | JSON Requests
    |--------------------------------------------------------------------------
    */

    const acceptsJson =
        req.get('Accept')?.includes(
            'application/json'
        ) ||
        req.get('X-CSRF-Token');


    if (acceptsJson) {

        return res
            .status(403)
            .json({
                error:
                    'Invalid or missing CSRF token.'
            });
    }


    /*
    |--------------------------------------------------------------------------
    | Browser Form Requests
    |--------------------------------------------------------------------------
    |
    | Redirect the user back to the appropriate page instead of showing
    | a raw CSRF error page.
    |
    |--------------------------------------------------------------------------
    */

    if (
        req.path === '/login'
    ) {

        if (req.flash) {

            req.flash(
                'error',
                'Your security session expired. Please try again.'
            );
        }

        return res
            .redirect('/login');
    }


    if (
        req.path === '/register'
    ) {

        if (req.flash) {

            req.flash(
                'error',
                'Your security session expired. Please try again.'
            );
        }

        return res
            .redirect('/register');
    }


    /*
    |--------------------------------------------------------------------------
    | Other Browser Requests
    |--------------------------------------------------------------------------
    */

    return res
        .status(403)
        .send(
            'Forbidden - invalid or missing CSRF token.'
        );
}


module.exports = {
    ensureCsrfToken,
    requireCsrf
};
