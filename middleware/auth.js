/*
|--------------------------------------------------------------------------
| Authentication Middleware
|--------------------------------------------------------------------------
|
| Contains reusable authentication middleware for Cryptiva.
|
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| requireAuth
|--------------------------------------------------------------------------
|
| Allows access only to authenticated users.
|
| If the user is not logged in, redirect them to the login page.
|
|--------------------------------------------------------------------------
*/

function requireAuth(req, res, next) {

    if (
        req.session &&
        req.session.user
    ) {
        return next();
    }

    req.flash(
        'error',
        'Please log in to continue.'
    );

    return res.redirect('/login');
}


/*
|--------------------------------------------------------------------------
| redirectIfAuth
|--------------------------------------------------------------------------
|
| Prevents authenticated users from accessing pages such as:
|
| - /login
| - /register
|
| Authenticated users are redirected to the dashboard.
|
|--------------------------------------------------------------------------
*/

function redirectIfAuth(req, res, next) {

    if (
        req.session &&
        req.session.user
    ) {
        return res.redirect('/dashboard');
    }

    return next();
}


/*
|--------------------------------------------------------------------------
| Export Middleware
|--------------------------------------------------------------------------
*/

module.exports = {
    requireAuth,
    redirectIfAuth
};