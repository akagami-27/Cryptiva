const path = require('path');
const fs = require('fs/promises');
const { fileTypeFromFile } = require('file-type');

// Cryptiva application limit.
// Supabase also has a 50 MB limit for this project.
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Explicit allowlist.
// Anything not listed here is rejected.
const ALLOWED_EXTENSIONS = new Map([
    // Documents
    ['.pdf', 'document'],
    ['.doc', 'document'],
    ['.docx', 'document'],
    ['.xls', 'document'],
    ['.xlsx', 'document'],
    ['.ppt', 'document'],
    ['.pptx', 'document'],
    ['.txt', 'document'],
    ['.csv', 'document'],

    // Images
    ['.jpg', 'image'],
    ['.jpeg', 'image'],
    ['.png', 'image'],
    ['.webp', 'image'],
    ['.gif', 'image'],

    // Audio
    ['.mp3', 'audio'],

    // Video
    ['.mp4', 'video']
]);

// Explicitly rejected dangerous extensions.
// These are rejected even before MIME/signature validation.
const BLOCKED_EXTENSIONS = new Set([
    '.exe',
    '.dll',
    '.bat',
    '.cmd',
    '.com',
    '.msi',
    '.scr',
    '.ps1',
    '.psm1',
    '.sh',
    '.bash',
    '.zsh',
    '.php',
    '.php3',
    '.php4',
    '.php5',
    '.phtml',
    '.js',
    '.mjs',
    '.cjs',
    '.vbs',
    '.vbe',
    '.wsf',
    '.wsc',
    '.hta',
    '.jar',
    '.war',
    '.class',
    '.apk',
    '.appx',
    '.deb',
    '.rpm'
]);

function getExtension(filename) {
    return path.extname(filename).toLowerCase();
}

function validateFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        throw new Error('Invalid filename');
    }

    const basename = path.basename(filename);

    if (basename !== filename) {
        throw new Error('Invalid filename');
    }

    if (basename.length > 255) {
        throw new Error('Filename is too long');
    }

    if (basename === '.' || basename === '..') {
        throw new Error('Invalid filename');
    }

    return basename;
}

function validateExtension(filename) {
    const extension = getExtension(filename);

    if (!extension) {
        throw new Error(
            'Files without an extension are not allowed'
        );
    }

    if (BLOCKED_EXTENSIONS.has(extension)) {
        throw new Error(
            `File type ${extension} is not allowed`
        );
    }

    if (!ALLOWED_EXTENSIONS.has(extension)) {
        throw new Error(
            `File extension ${extension} is not supported`
        );
    }

    return extension;
}

async function validateFileSize(filePath) {
    const stats = await fs.stat(filePath);

    if (!stats.isFile()) {
        throw new Error('Uploaded object is not a regular file');
    }

    if (stats.size < 1) {
        throw new Error('Empty files are not allowed');
    }

    if (stats.size > MAX_FILE_SIZE) {
        throw new Error('File exceeds the 50 MB size limit');
    }

    return stats.size;
}

async function detectFileType(filePath) {
    return fileTypeFromFile(filePath);
}

function validateDetectedType(extension, detectedType) {
    /*
     * Some legitimate document formats are containers
     * and file-type may identify them as ZIP.
     *
     * We therefore use extension + detected signature
     * rather than blindly trusting the detected MIME.
     */

    if (!detectedType) {
        // Text-based formats such as TXT/CSV may not have
        // a recognizable binary signature.
        if (extension === '.txt' || extension === '.csv') {
            return;
        }

        throw new Error(
            'Unable to verify the file signature'
        );
    }

    const detectedExtension =
        `.${detectedType.ext}`.toLowerCase();

    const compatibleExtensions = {
        '.jpg': ['.jpg', '.jpeg'],
        '.jpeg': ['.jpg', '.jpeg'],
        '.docx': ['.docx'],
        '.xlsx': ['.xlsx'],
        '.pptx': ['.pptx'],
        '.png': ['.png'],
        '.webp': ['.webp'],
        '.gif': ['.gif'],
        '.mp3': ['.mp3'],
        '.mp4': ['.mp4'],
        '.pdf': ['.pdf']
    };

    if (compatibleExtensions[extension]) {
        if (!compatibleExtensions[extension].includes(detectedExtension)) {
            throw new Error(
                `File signature does not match ${extension}`
            );
        }

        return;
    }

    /*
     * Legacy Office formats (.doc, .xls, .ppt) and plain text
     * need additional handling because their signatures may not
     * map cleanly to their extension.
     *
     * Do not automatically accept a mismatched signature.
     */
    if (
        extension === '.doc' ||
        extension === '.xls' ||
        extension === '.ppt'
    ) {
        if (detectedType.mime === 'application/x-cfb') {
            return;
        }

        throw new Error(
            `File signature does not match ${extension}`
        );
    }

    throw new Error(
        `File signature does not match ${extension}`
    );
}

async function validateUploadedFile(filename, filePath) {
    const safeFilename = validateFilename(filename);

    const extension = validateExtension(safeFilename);

    const size = await validateFileSize(filePath);

    const detectedType = await detectFileType(filePath);

    validateDetectedType(extension, detectedType);

    return {
        originalName: safeFilename,
        extension,
        category: ALLOWED_EXTENSIONS.get(extension),
        size,
        detectedMimeType: detectedType
            ? detectedType.mime
            : null,
        detectedExtension: detectedType
            ? `.${detectedType.ext}`.toLowerCase()
            : null
    };
}

module.exports = {
    MAX_FILE_SIZE,
    ALLOWED_EXTENSIONS,
    BLOCKED_EXTENSIONS,
    validateUploadedFile,
    validateFilename,
    validateExtension,
    validateFileSize,
    detectFileType
};