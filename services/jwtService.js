'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'cryptiva.auth';
const ISSUER = 'cryptiva';
const AUDIENCE = 'cryptiva-web';
const DEFAULT_TTL_SECONDS = 900;
const MIN_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 3600;

function getSecret() {
    const secret = process.env.JWT_SECRET;
    if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
        throw new Error('JWT_SECRET must be configured with at least 32 bytes.');
    }
    return secret;
}

function getTtlSeconds() {
    const configured = process.env.JWT_TTL_SECONDS;
    const ttl = configured === undefined ? DEFAULT_TTL_SECONDS : Number(configured);
    if (!Number.isSafeInteger(ttl) || ttl < MIN_TTL_SECONDS || ttl > MAX_TTL_SECONDS) {
        throw new Error(`JWT_TTL_SECONDS must be an integer between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS}.`);
    }
    return ttl;
}

function validateJwtConfig() {
    getSecret();
    getTtlSeconds();
}

function base64url(value) {
    return Buffer.from(value).toString('base64url');
}

function signAccessToken(user, now = Math.floor(Date.now() / 1000)) {
    const ttl = getTtlSeconds();
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
        sub: String(user._id || user.id),
        iss: ISSUER,
        aud: AUDIENCE,
        iat: now,
        exp: now + ttl,
        jti: crypto.randomBytes(16).toString('base64url'),
        ver: Number.isSafeInteger(user.authTokenVersion) ? user.authTokenVersion : 0
    };
    if (!payload.sub || payload.sub === 'undefined') throw new Error('JWT subject is required.');
    const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = crypto.createHmac('sha256', getSecret()).update(unsigned).digest('base64url');
    return { token: `${unsigned}.${signature}`, expiresAt: payload.exp, ttl };
}

function verifyAccessToken(token, now = Math.floor(Date.now() / 1000)) {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (!header || header.alg !== 'HS256' || header.typ !== 'JWT') return null;
        if (!payload || typeof payload.sub !== 'string' || !payload.sub || payload.iss !== ISSUER || payload.aud !== AUDIENCE) return null;
        if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.exp <= now || payload.iat > now + 60 || payload.exp <= payload.iat) return null;
        if (payload.exp - payload.iat > MAX_TTL_SECONDS || typeof payload.jti !== 'string' || !/^[A-Za-z0-9_-]{20,30}$/.test(payload.jti)) return null;
        if (!Number.isSafeInteger(payload.ver) || payload.ver < 0) return null;

        const expected = crypto.createHmac('sha256', getSecret()).update(`${parts[0]}.${parts[1]}`).digest();
        const supplied = Buffer.from(parts[2], 'base64url');
        if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
        return payload;
    } catch {
        return null;
    }
}

function readAuthCookie(req) {
    const cookieHeader = req.headers?.cookie || '';
    for (const item of cookieHeader.split(';')) {
        const separator = item.indexOf('=');
        if (separator < 0 || item.slice(0, separator).trim() !== COOKIE_NAME) continue;
        try {
            return decodeURIComponent(item.slice(separator + 1).trim());
        } catch {
            return '';
        }
    }
    return '';
}

function authCookieOptions(isProduction, maxAge) {
    return { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/', maxAge };
}

module.exports = {
    COOKIE_NAME,
    authCookieOptions,
    readAuthCookie,
    signAccessToken,
    validateJwtConfig,
    verifyAccessToken
};
