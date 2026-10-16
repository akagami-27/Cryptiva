'use strict';

const express = require('express');

const router = express.Router();

const pageRedirects = {
    '/': '/react',
    '/login': '/react/login',
    '/register': '/react/register',
    '/dashboard': '/react/dashboard',
    '/files': '/react/files',
    '/files.html': '/react/files',
    '/shared': '/react/shared',
    '/activity': '/react/activity',
    '/activity.html': '/react/activity',
    '/profile': '/react/profile',
    '/profile.html': '/react/profile',
    '/security': '/react/security',
    '/security.html': '/react/security'
};

for (const [legacyPath, reactPath] of Object.entries(pageRedirects)) {
    router.get(legacyPath, (req, res) => {
        res.set('Cache-Control', 'no-store');
        return res.redirect(reactPath);
    });
}

module.exports = router;
