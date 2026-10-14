'use strict';

function getSafeRequestLogUrl(req) {
    const requestUrl = String(req.originalUrl || req.url || req.path || '');
    const queryStart = requestUrl.search(/[?#]/);
    const pathname = queryStart === -1
        ? requestUrl
        : requestUrl.slice(0, queryStart);
    // Shared-link tokens are the first path segment after this route prefix.
    // Redact that segment even when an invalid request has extra path segments.
    const sharedRoute = pathname.match(
        /^(\/files\/shared\/)([^/]+)(.*)$/
    );

    if (!sharedRoute) {
        return { url: pathname, sensitiveSegments: [] };
    }

    const encodedToken = sharedRoute[2];
    let decodedToken = encodedToken;

    try {
        // Decode only the token segment once, matching Express route-parameter
        // decoding without interpreting or normalizing the rest of the URL.
        decodedToken = decodeURIComponent(encodedToken);
    } catch {
        // Malformed escapes remain redacted in their original representation.
    }

    return {
        url: `${sharedRoute[1]}[REDACTED]${sharedRoute[3]}`,
        sensitiveSegments: [...new Set([encodedToken, decodedToken])]
    };
}

function redactLogMessage(message, sensitiveSegments = []) {
    let safeMessage = String(message || 'Unknown error');

    for (const segment of sensitiveSegments) {
        if (segment) {
            safeMessage = safeMessage.split(segment).join('[REDACTED]');
        }
    }

    return safeMessage;
}

module.exports = {
    getSafeRequestLogUrl,
    redactLogMessage
};
