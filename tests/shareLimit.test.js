const test = require('node:test');
const assert = require('node:assert/strict');

test('share limit accepts the backend range and unlimited blank value', async () => {
  const { parseShareLimit } = await import('../client/src/utils/shareLimit.js');

  assert.equal(parseShareLimit('1'), 1);
  assert.equal(parseShareLimit('100000'), 100000);
  assert.equal(parseShareLimit(''), null);
  assert.equal(parseShareLimit('   '), null);
});

test('share limit rejects invalid, fractional, and out-of-range values', async () => {
  const { parseShareLimit } = await import('../client/src/utils/shareLimit.js');

  for (const value of ['0', '-1', '100001', '1.5', 'abc']) {
    assert.throws(() => parseShareLimit(value), /whole number from 1 to 100000/);
  }
});
