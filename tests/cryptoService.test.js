
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Set a temporary test master key before loading cryptoService.
// This is a randomly generated key for testing only.
const originalMasterKey = process.env.MASTER_ENCRYPTION_KEY;
process.env.MASTER_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const {
    generateDataEncryptionKey,
    encryptData,
    decryptData,
    wrapDataEncryptionKey,
    unwrapDataEncryptionKey,
    calculateSha256,
    validateMasterEncryptionKey,
    IV_LENGTH,
    KEY_LENGTH,
    AUTH_TAG_LENGTH
} = require('../services/cryptoService');

const TEST_MASTER_KEY = process.env.MASTER_ENCRYPTION_KEY;

function restoreEnvironment() {
    if (originalMasterKey === undefined) {
        delete process.env.MASTER_ENCRYPTION_KEY;
    } else {
        process.env.MASTER_ENCRYPTION_KEY = originalMasterKey;
    }
}

test('encryption generates ciphertext that decrypts to the original data', () => {
    const plaintext = Buffer.from('Cryptiva encryption test');
    const key = generateDataEncryptionKey();

    const encrypted = encryptData(plaintext, key);

    assert.ok(Buffer.isBuffer(encrypted.ciphertext));
    assert.ok(Buffer.isBuffer(encrypted.iv));
    assert.ok(Buffer.isBuffer(encrypted.authTag));

    assert.equal(encrypted.iv.length, IV_LENGTH);
    assert.equal(encrypted.authTag.length, AUTH_TAG_LENGTH);
    assert.notDeepEqual(encrypted.ciphertext, plaintext);

    const decrypted = decryptData(
        encrypted.ciphertext,
        key,
        encrypted.iv,
        encrypted.authTag
    );

    assert.deepEqual(decrypted, plaintext);
});

test('encryption uses a fresh IV for each encryption', () => {
    const plaintext = Buffer.from('Same plaintext');
    const key = generateDataEncryptionKey();

    const first = encryptData(plaintext, key);
    const second = encryptData(plaintext, key);

    assert.notDeepEqual(first.iv, second.iv);
    assert.notDeepEqual(first.ciphertext, second.ciphertext);
});

test('decryption rejects tampered ciphertext', () => {
    const plaintext = Buffer.from('Data that must remain protected');
    const key = generateDataEncryptionKey();

    const encrypted = encryptData(plaintext, key);
    const tampered = Buffer.from(encrypted.ciphertext);

    // Change one ciphertext byte.
    tampered[0] ^= 0x01;

    assert.throws(() => {
        decryptData(
            tampered,
            key,
            encrypted.iv,
            encrypted.authTag
        );
    });
});

test('decryption rejects a modified IV with the expected length', () => {
    const key = generateDataEncryptionKey();
    const encrypted = encryptData(Buffer.from('Authenticated file data'), key);
    const modifiedIv = Buffer.from(encrypted.iv);
    modifiedIv[0] ^= 0x01;

    assert.equal(modifiedIv.length, IV_LENGTH);
    assert.throws(() => decryptData(
        encrypted.ciphertext,
        key,
        modifiedIv,
        encrypted.authTag
    ));
});

test('decryption rejects a modified authentication tag with the expected length', () => {
    const key = generateDataEncryptionKey();
    const encrypted = encryptData(Buffer.from('Authenticated file data'), key);
    const modifiedAuthTag = Buffer.from(encrypted.authTag);
    modifiedAuthTag[0] ^= 0x01;

    assert.equal(modifiedAuthTag.length, AUTH_TAG_LENGTH);
    assert.throws(() => decryptData(
        encrypted.ciphertext,
        key,
        encrypted.iv,
        modifiedAuthTag
    ));
});

test('encryption and decryption round-trip empty and binary Buffers', () => {
    const key = generateDataEncryptionKey();
    const inputs = [
        Buffer.alloc(0),
        Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff, 0x00])
    ];

    for (const plaintext of inputs) {
        const encrypted = encryptData(plaintext, key);
        const decrypted = decryptData(
            encrypted.ciphertext,
            key,
            encrypted.iv,
            encrypted.authTag
        );

        assert.deepEqual(decrypted, plaintext);
    }
});

test('decryption rejects an incorrect key', () => {
    const plaintext = Buffer.from('Secret file contents');
    const key = generateDataEncryptionKey();
    const wrongKey = generateDataEncryptionKey();

    const encrypted = encryptData(plaintext, key);

    assert.throws(() => {
        decryptData(
            encrypted.ciphertext,
            wrongKey,
            encrypted.iv,
            encrypted.authTag
        );
    });
});

test('encryption rejects a key with an invalid length', () => {
    const plaintext = Buffer.from('Test data');
    const invalidKey = crypto.randomBytes(KEY_LENGTH - 1);

    assert.throws(
        () => encryptData(plaintext, invalidKey),
        /exactly 32 bytes/
    );
});

test('decryption rejects an invalid IV length', () => {
    const key = generateDataEncryptionKey();
    const encrypted = encryptData(Buffer.from('Test data'), key);

    assert.throws(
        () => decryptData(
            encrypted.ciphertext,
            key,
            Buffer.alloc(8),
            encrypted.authTag
        ),
        /Invalid AES-GCM IV/
    );
});

test('decryption rejects an invalid authentication tag length', () => {
    const key = generateDataEncryptionKey();
    const encrypted = encryptData(Buffer.from('Test data'), key);

    assert.throws(
        () => decryptData(
            encrypted.ciphertext,
            key,
            encrypted.iv,
            Buffer.alloc(8)
        ),
        /Invalid AES-GCM authentication tag/
    );
});

test('data encryption key can be wrapped and unwrapped', () => {
    const originalKey = generateDataEncryptionKey();

    const wrapped = wrapDataEncryptionKey(originalKey);

    assert.ok(Buffer.isBuffer(wrapped.wrappedKey));
    assert.ok(Buffer.isBuffer(wrapped.keyWrapIv));
    assert.ok(Buffer.isBuffer(wrapped.keyWrapAuthTag));

    assert.notDeepEqual(wrapped.wrappedKey, originalKey);

    const recoveredKey = unwrapDataEncryptionKey(
        wrapped.wrappedKey,
        wrapped.keyWrapIv,
        wrapped.keyWrapAuthTag
    );

    assert.deepEqual(recoveredKey, originalKey);
});

test('repeated DEK wrapping uses a fresh IV', () => {
    const key = generateDataEncryptionKey();

    const first = wrapDataEncryptionKey(key);
    const second = wrapDataEncryptionKey(key);

    assert.equal(first.keyWrapIv.length, IV_LENGTH);
    assert.equal(second.keyWrapIv.length, IV_LENGTH);
    assert.notDeepEqual(first.keyWrapIv, second.keyWrapIv);
});

test('unwrapping rejects a tampered wrapped key', () => {
    const key = generateDataEncryptionKey();
    const wrapped = wrapDataEncryptionKey(key);
    const tampered = Buffer.from(wrapped.wrappedKey);

    tampered[0] ^= 0x01;

    assert.throws(() => {
        unwrapDataEncryptionKey(
            tampered,
            wrapped.keyWrapIv,
            wrapped.keyWrapAuthTag
        );
    });
});

test('unwrapping rejects modified wrapped-key IV and authentication tag', () => {
    const key = generateDataEncryptionKey();
    const wrapped = wrapDataEncryptionKey(key);
    const modifiedIv = Buffer.from(wrapped.keyWrapIv);
    const modifiedAuthTag = Buffer.from(wrapped.keyWrapAuthTag);
    modifiedIv[0] ^= 0x01;
    modifiedAuthTag[0] ^= 0x01;

    assert.throws(() => unwrapDataEncryptionKey(
        wrapped.wrappedKey,
        modifiedIv,
        wrapped.keyWrapAuthTag
    ));
    assert.throws(() => unwrapDataEncryptionKey(
        wrapped.wrappedKey,
        wrapped.keyWrapIv,
        modifiedAuthTag
    ));
});

test('unwrapping rejects a wrong but correctly sized master key', () => {
    const key = generateDataEncryptionKey();
    const wrapped = wrapDataEncryptionKey(key);
    const previousMasterKey = process.env.MASTER_ENCRYPTION_KEY;

    try {
        process.env.MASTER_ENCRYPTION_KEY = crypto.randomBytes(KEY_LENGTH).toString('base64');

        assert.throws(() => unwrapDataEncryptionKey(
            wrapped.wrappedKey,
            wrapped.keyWrapIv,
            wrapped.keyWrapAuthTag
        ));
    } finally {
        process.env.MASTER_ENCRYPTION_KEY = previousMasterKey;
    }
});

test('wrapping rejects malformed DEK inputs and unwrapping rejects malformed fields', () => {
    assert.throws(
        () => wrapDataEncryptionKey(Buffer.alloc(KEY_LENGTH - 1)),
        /Data Encryption Key must be exactly 32 bytes/
    );
    assert.throws(
        () => wrapDataEncryptionKey(Buffer.alloc(KEY_LENGTH + 1)),
        /Data Encryption Key must be exactly 32 bytes/
    );
    assert.throws(
        () => wrapDataEncryptionKey('not-a-buffer'),
        /Data Encryption Key must be exactly 32 bytes/
    );
    assert.throws(
        () => unwrapDataEncryptionKey('not-a-buffer', Buffer.alloc(IV_LENGTH), Buffer.alloc(AUTH_TAG_LENGTH)),
        /Wrapped key must be a Buffer/
    );
    assert.throws(
        () => unwrapDataEncryptionKey(Buffer.alloc(KEY_LENGTH), Buffer.alloc(IV_LENGTH - 1), Buffer.alloc(AUTH_TAG_LENGTH)),
        /Invalid key wrapping IV/
    );
    assert.throws(
        () => unwrapDataEncryptionKey(Buffer.alloc(KEY_LENGTH), Buffer.alloc(IV_LENGTH), Buffer.alloc(AUTH_TAG_LENGTH - 1)),
        /Invalid key wrapping authentication tag/
    );
});

test('unwrapping rejects authenticated wrapped data that is not a 32-byte DEK', () => {
    const masterKey = Buffer.from(TEST_MASTER_KEY, 'base64');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    const malformedWrappedKey = Buffer.concat([
        cipher.update(Buffer.alloc(KEY_LENGTH - 1)),
        cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    masterKey.fill(0);

    assert.throws(
        () => unwrapDataEncryptionKey(malformedWrappedKey, iv, authTag),
        /Unwrapped Data Encryption Key has an invalid length/
    );
});

test('unwrapping rejects an invalid master key', () => {
    const original = process.env.MASTER_ENCRYPTION_KEY;

    try {
        process.env.MASTER_ENCRYPTION_KEY =
            crypto.randomBytes(16).toString('base64');

        assert.throws(
            () => unwrapDataEncryptionKey(
                Buffer.alloc(32),
                crypto.randomBytes(IV_LENGTH),
                crypto.randomBytes(AUTH_TAG_LENGTH)
            ),
            /valid Base64 encoding of exactly 32 bytes/
        );
    } finally {
        process.env.MASTER_ENCRYPTION_KEY = original;
    }
});

test('startup master-key validation accepts a valid key and rejects missing or malformed values', () => {
    const original = process.env.MASTER_ENCRYPTION_KEY;

    try {
        process.env.MASTER_ENCRYPTION_KEY = TEST_MASTER_KEY;
        assert.doesNotThrow(() => validateMasterEncryptionKey());

        delete process.env.MASTER_ENCRYPTION_KEY;
        assert.throws(
            () => validateMasterEncryptionKey(),
            /MASTER_ENCRYPTION_KEY is not defined/
        );

        process.env.MASTER_ENCRYPTION_KEY = crypto.randomBytes(16).toString('base64');
        assert.throws(
            () => validateMasterEncryptionKey(),
            /valid Base64 encoding of exactly 32 bytes/
        );
    } finally {
        if (original === undefined) delete process.env.MASTER_ENCRYPTION_KEY;
        else process.env.MASTER_ENCRYPTION_KEY = original;
    }
});

test('SHA-256 returns the expected digest', () => {
    const data = Buffer.from('abc');

    assert.equal(
        calculateSha256(data),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
});

test('SHA-256 returns the same digest for a Buffer and a string', () => {
    assert.equal(
        calculateSha256(Buffer.from('Cryptiva')),
        calculateSha256('Cryptiva')
    );
});

// Restore the environment after the test file finishes.
process.on('exit', restoreEnvironment);
