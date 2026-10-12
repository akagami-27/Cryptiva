'use strict';

const getPublicAppUrl = require('../config/publicAppUrl');

function createShareUrl(token) {
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(String(token || ''))) {
        throw new Error('Cannot create a share URL from an invalid token.');
    }

    return new URL(
        `/files/shared/${encodeURIComponent(String(token))}`,
        getPublicAppUrl()
    ).toString();
}

module.exports = { createShareUrl };
