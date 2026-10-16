'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const secret = crypto.randomBytes(48).toString('base64');
process.env.JWT_SECRET = secret;
process.env.JWT_TTL_SECONDS = '900';
const { signAccessToken, verifyAccessToken, authCookieOptions, readAuthCookie } = require('../services/jwtService');

test('signs a minimal HS256 token with issuer, audience, expiry and no secret claims', () => {
    const issued = signAccessToken({ _id: 'user-1', authTokenVersion: 2 }, 1_800_000_000);
    const payload = verifyAccessToken(issued.token, 1_800_000_001);
    assert.equal(payload.sub, 'user-1');
    assert.equal(payload.iss, 'cryptiva');
    assert.equal(payload.aud, 'cryptiva-web');
    assert.equal(payload.exp, 1_800_000_900);
    assert.equal(payload.ver, 2);
    assert.equal('password' in payload, false);
    assert.equal('passwordHash' in payload, false);
    assert.equal(issued.ttl, 900);
});

test('rejects malformed, tampered and expired tokens', () => {
    const { token } = signAccessToken({ _id: 'user-1' }, 1_800_000_000);
    assert.equal(verifyAccessToken('not-a-token', 1_800_000_001), null);
    const [header, payload, signature] = token.split('.');
    assert.equal(verifyAccessToken(`${header}.${payload}.${'A'.repeat(signature.length)}`, 1_800_000_001), null);
    assert.equal(verifyAccessToken(token, 1_800_000_900), null);
});

test('rejects unsupported algorithms and wrong issuer or audience', () => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const payload = { sub: 'user-1', iss: 'cryptiva', aud: 'cryptiva-web', iat: 1000, exp: 1900, jti: crypto.randomBytes(16).toString('base64url'), ver: 0 };
    const forge = (header, claims) => {
        const unsigned = `${encode(header)}.${encode(claims)}`;
        const sig = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
        return `${unsigned}.${sig}`;
    };
    assert.equal(verifyAccessToken(forge({ alg: 'HS384', typ: 'JWT' }, payload), 1001), null);
    assert.equal(verifyAccessToken(forge({ alg: 'HS256', typ: 'JWT' }, { ...payload, iss: 'other' }), 1001), null);
    assert.equal(verifyAccessToken(forge({ alg: 'HS256', typ: 'JWT' }, { ...payload, aud: 'other' }), 1001), null);
});

test('requires strong signing configuration and bounds token lifetime', () => {
    const savedSecret = process.env.JWT_SECRET;
    const savedTtl = process.env.JWT_TTL_SECONDS;
    try {
        process.env.JWT_SECRET = 'too-short';
        assert.throws(() => signAccessToken({ _id: 'user-1' }), /JWT_SECRET/);
        process.env.JWT_SECRET = secret;
        process.env.JWT_TTL_SECONDS = '86400';
        assert.throws(() => signAccessToken({ _id: 'user-1' }), /JWT_TTL_SECONDS/);
    } finally {
        process.env.JWT_SECRET = savedSecret;
        process.env.JWT_TTL_SECONDS = savedTtl;
    }
});

test('uses an HttpOnly same-site auth cookie and reads only its named cookie', () => {
    const options = authCookieOptions(true, 900_000);
    assert.deepEqual(options, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 900_000 });
    assert.equal(readAuthCookie({ headers: { cookie: 'other=x; cryptiva.auth=abc%2Edef' } }), 'abc.def');
    assert.equal(readAuthCookie({ headers: { cookie: 'notcryptiva.auth=bad' } }), '');
});
