'use strict';

function getPublicAppUrl() {
    const configured = String(process.env.PUBLIC_APP_URL || '').trim();

    if (!configured && process.env.NODE_ENV === 'production') {
        throw new Error('PUBLIC_APP_URL must be configured in production.');
    }

    const fallbackPort = Number(process.env.PORT) || 3000;
    const value = configured || `http://127.0.0.1:${fallbackPort}`;
    let parsed;

    try {
        parsed = new URL(value);
    } catch {
        throw new Error('PUBLIC_APP_URL must be a valid absolute URL.');
    }

    if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== '/' ||
        parsed.search ||
        parsed.hash
    ) {
        throw new Error('PUBLIC_APP_URL must contain only an HTTP(S) origin.');
    }

    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
        throw new Error('PUBLIC_APP_URL must use HTTPS in production.');
    }

    return parsed.origin;
}

module.exports = getPublicAppUrl;
