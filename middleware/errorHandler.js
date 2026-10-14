const fs = require('fs');
const path = require('path');
const {
    getSafeRequestLogUrl,
    redactLogMessage
} = require('./safeRequestLog');

function sendErrorPage(res, statusCode) {
    const errorPage = path.join(
        __dirname,
        '..',
        'public',
        'errors',
        `${statusCode}.html`
    );

    if (!fs.existsSync(errorPage)) {
        return res
            .status(statusCode)
            .send(`Error ${statusCode}`);
    }

    return res
        .status(statusCode)
        .sendFile(errorPage);
}

function errorHandler(err, req, res, next) {
    const { url, sensitiveSegments } = getSafeRequestLogUrl(req);
    const safeErrorMessage = redactLogMessage(err.message, sensitiveSegments);

    console.error('Cryptiva error:', {
        method: req.method,
        url,
        status: err.status || err.statusCode || 500,
        message: safeErrorMessage
    });

    const statusCode =
        Number(err.status || err.statusCode) >= 400 &&
        Number(err.status || err.statusCode) < 600
            ? Number(err.status || err.statusCode)
            : 500;

    return sendErrorPage(res, statusCode);
}

function notFoundHandler(req, res) {
    return sendErrorPage(res, 404);
}

module.exports = {
    errorHandler,
    notFoundHandler,
    sendErrorPage
};
