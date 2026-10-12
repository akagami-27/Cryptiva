
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
    validateFilename,
    validateExtension,
    validateFileSize,
    validateUploadedFile,
    MAX_FILE_SIZE
} = require('../services/fileValidationService');

async function tempFile(data) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cryptiva-test-'));
    const file = path.join(dir, 'test.txt');
    await fs.writeFile(file, data);
    return {
        file,
        cleanup: () => fs.rm(dir, { recursive: true, force: true })
    };
}

test('accepts a valid filename', () => {
    assert.equal(validateFilename('report.pdf'), 'report.pdf');
});

test('rejects empty and invalid filenames', () => {
    for (const name of ['', '../secret.txt', '..', 'a'.repeat(256)]) {
        assert.throws(() => validateFilename(name));
    }
});

test('accepts supported extensions', () => {
    assert.equal(validateExtension('report.pdf'), '.pdf');
    assert.equal(validateExtension('photo.jpg'), '.jpg');
});

test('rejects unsupported and dangerous extensions', () => {
    for (const name of ['script.js', 'app.exe', 'archive.zip', 'noextension']) {
        assert.throws(() => validateExtension(name));
    }
});

test('rejects an empty file', async () => {
    const temp = await tempFile('');
    try {
        await assert.rejects(validateFileSize(temp.file), /Empty files/);
    } finally {
        await temp.cleanup();
    }
});

test('rejects a file larger than the configured limit', async () => {
    const temp = await tempFile(Buffer.alloc(MAX_FILE_SIZE + 1));
    try {
        await assert.rejects(validateFileSize(temp.file), /50 MB/);
    } finally {
        await temp.cleanup();
    }
});

test('accepts a non-empty file within the size limit', async () => {
    const temp = await tempFile('hello');
    try {
        assert.equal(await validateFileSize(temp.file), 5);
    } finally {
        await temp.cleanup();
    }
});

test('rejects a PDF extension with a non-PDF signature', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cryptiva-test-'));
    const file = path.join(dir, 'fake.pdf');

    try {
        await fs.writeFile(file, 'not a real PDF');
        await assert.rejects(
            validateUploadedFile('fake.pdf', file),
            /signature/
        );
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

test('accepts a plain text file without a binary signature', async () => {
    const temp = await tempFile('Cryptiva validation test');
    try {
        const result = await validateUploadedFile('test.txt', temp.file);
        assert.equal(result.extension, '.txt');
        assert.equal(result.category, 'document');
    } finally {
        await temp.cleanup();
    }
});
