'use strict';

const FRONTEND_PATHS = [
    '/',
    '/login',
    '/register',
    '/dashboard',
    '/files',
    '/shared',
    '/activity',
    '/profile',
    '/security'
];

function registerReactPages(app, { requireAuth, redirectIfAuth, sendApp }) {
    app.get('/', sendApp);
    app.get('/login', redirectIfAuth, sendApp);
    app.get('/register', redirectIfAuth, sendApp);

    for (const routePath of FRONTEND_PATHS.slice(3)) {
        app.get(routePath, requireAuth, sendApp);
    }

    app.get(/^\/react\/(login|register|dashboard|files|shared|activity|profile|security)$/, (req, res) => {
        const queryIndex = req.url.indexOf('?');
        const query = queryIndex < 0 ? '' : req.url.slice(queryIndex);
        return res.redirect(308, `/${req.params[0]}${query}`);
    });
}

module.exports = { FRONTEND_PATHS, registerReactPages };
