const crypto = require('crypto');

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;

function getMasterKey() {
    const encodedKey = process.env.MASTER_ENCRYPTION_KEY;

    if (!encodedKey) {
        throw new Error('MASTER_ENCRYPTION_KEY is not defined');
    }

    const masterKey = Buffer.from(encodedKey, 'base64');

    if (masterKey.length !== KEY_LENGTH) {
        throw new Error(
            'MASTER_ENCRYPTION_KEY must decode to exactly 32 bytes'
        );
    }

    return masterKey;
}

/**
 * Generate a cryptographically secure random Data Encryption Key (DEK).
 */
function generateDataEncryptionKey() {
    return crypto.randomBytes(KEY_LENGTH);
}

/**
 * Encrypt plaintext using AES-256-GCM.
 *
 * Returns:
 * - ciphertext
 * - iv
 * - authTag
 */
function encryptData(plaintext, key) {
    if (!Buffer.isBuffer(plaintext)) {
        plaintext = Buffer.from(plaintext);
    }

    if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
        throw new Error('Encryption key must be exactly 32 bytes');
    }

    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(
        AES_ALGORITHM,
        key,
        iv
    );

    const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    if (authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error('Invalid AES-GCM authentication tag length');
    }

    return {
        ciphertext,
        iv,
        authTag
    };
}

/**
 * Decrypt AES-256-GCM ciphertext.
 *
 * Authentication failure will throw an error.
 */
function decryptData(ciphertext, key, iv, authTag) {
    if (!Buffer.isBuffer(ciphertext)) {
        throw new Error('Ciphertext must be a Buffer');
    }

    if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
        throw new Error('Decryption key must be exactly 32 bytes');
    }

    if (!Buffer.isBuffer(iv) || iv.length !== IV_LENGTH) {
        throw new Error('Invalid AES-GCM IV');
    }

    if (!Buffer.isBuffer(authTag) || authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error('Invalid AES-GCM authentication tag');
    }

    const decipher = crypto.createDecipheriv(
        AES_ALGORITHM,
        key,
        iv
    );

    decipher.setAuthTag(authTag);

    return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
    ]);
}

/**
 * Wrap a Data Encryption Key (DEK) using the Cryptiva master key.
 *
 * The DEK itself is never stored in plaintext.
 */
function wrapDataEncryptionKey(dataEncryptionKey) {
    if (
        !Buffer.isBuffer(dataEncryptionKey) ||
        dataEncryptionKey.length !== KEY_LENGTH
    ) {
        throw new Error('Data Encryption Key must be exactly 32 bytes');
    }

    const masterKey = getMasterKey();
    const keyWrapIv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(
        AES_ALGORITHM,
        masterKey,
        keyWrapIv
    );

    const wrappedKey = Buffer.concat([
        cipher.update(dataEncryptionKey),
        cipher.final()
    ]);

    const keyWrapAuthTag = cipher.getAuthTag();

    if (keyWrapAuthTag.length !== AUTH_TAG_LENGTH) {
        throw new Error(
            'Invalid AES-GCM key wrapping authentication tag length'
        );
    }

    return {
        wrappedKey,
        keyWrapIv,
        keyWrapAuthTag
    };
}

/**
 * Unwrap a Data Encryption Key using the Cryptiva master key.
 */
function unwrapDataEncryptionKey(
    wrappedKey,
    keyWrapIv,
    keyWrapAuthTag
) {
    if (!Buffer.isBuffer(wrappedKey)) {
        throw new Error('Wrapped key must be a Buffer');
    }

    if (!Buffer.isBuffer(keyWrapIv) || keyWrapIv.length !== IV_LENGTH) {
        throw new Error('Invalid key wrapping IV');
    }

    if (
        !Buffer.isBuffer(keyWrapAuthTag) ||
        keyWrapAuthTag.length !== AUTH_TAG_LENGTH
    ) {
        throw new Error('Invalid key wrapping authentication tag');
    }

    const masterKey = getMasterKey();

    const decipher = crypto.createDecipheriv(
        AES_ALGORITHM,
        masterKey,
        keyWrapIv
    );

    decipher.setAuthTag(keyWrapAuthTag);

    const dataEncryptionKey = Buffer.concat([
        decipher.update(wrappedKey),
        decipher.final()
    ]);

    if (dataEncryptionKey.length !== KEY_LENGTH) {
        throw new Error(
            'Unwrapped Data Encryption Key has an invalid length'
        );
    }

    return dataEncryptionKey;
}

/**
 * Calculate SHA-256 hash.
 */
function calculateSha256(data) {
    if (!Buffer.isBuffer(data)) {
        data = Buffer.from(data);
    }

    return crypto
        .createHash('sha256')
        .update(data)
        .digest('hex');
}

module.exports = {
    AES_ALGORITHM,
    IV_LENGTH,
    KEY_LENGTH,
    AUTH_TAG_LENGTH,
    generateDataEncryptionKey,
    encryptData,
    decryptData,
    wrapDataEncryptionKey,
    unwrapDataEncryptionKey,
    calculateSha256
};