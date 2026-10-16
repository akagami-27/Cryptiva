'use strict';

const User = require('../models/user');
const { readAuthCookie, verifyAccessToken } = require('../services/jwtService');

async function authenticateJwt(req) {
    if (req._cryptivaAuthChecked) return req.authUser || null;
    req._cryptivaAuthChecked = true;
    const payload = verifyAccessToken(readAuthCookie(req));
    if (!payload || !/^[a-f\d]{24}$/i.test(payload.sub)) return null;
    const user = await User.findById(payload.sub).select('_id username status authTokenVersion');
    if (!user || user.status !== 'active') return null;
    const currentVersion = Number.isSafeInteger(user.authTokenVersion) ? user.authTokenVersion : 0;
    if (payload.ver !== currentVersion) return null;
    const identity = { id: user._id.toString(), username: user.username, status: user.status };
    req.authUser = identity;
    req.authUserRecord = user;
    // Existing route handlers consume this verified identity for ownership.
    // The session remains for CSRF and transient share-flow state only.
    if (req.session) req.session.user = identity;
    return identity;
}

async function hydrateJwtIdentity(req, res, next) {
    if (req.session) delete req.session.user;
    if (!readAuthCookie(req)) return next();
    try {
        await authenticateJwt(req);
        return next();
    } catch (error) {
        return next(error);
    }
}

function wantsJson(req) {
    return req.path.startsWith('/api/') || req.path === '/me' || req.path.startsWith('/dashboard/data') || req.get?.('Accept')?.includes('application/json');
}

async function requireAuth(req, res, next) {
    try {
        if (await authenticateJwt(req)) return next();
    } catch (error) {
        return next(error);
    }
    if (wantsJson(req)) return res.status(401).json({ error: 'Authentication required.' });
    if (req.flash) req.flash('error', 'Please log in to continue.');
    return res.redirect('/login');
}

async function redirectIfAuth(req, res, next) {
    try {
        if (await authenticateJwt(req)) return res.redirect('/dashboard');
        return next();
    } catch (error) {
        return next(error);
    }
}

module.exports = { authenticateJwt, hydrateJwtIdentity, requireAuth, redirectIfAuth };
