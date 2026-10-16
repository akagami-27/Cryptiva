const test = require('node:test');
const assert = require('node:assert/strict');

test('registration password confirmation reports mismatch and accepts matching values', async () => {
  const { getPasswordConfirmationError } = await import('../client/src/utils/authFormValidation.js');

  assert.equal(getPasswordConfirmationError('SecurePass1', ''), '');
  assert.equal(getPasswordConfirmationError('SecurePass1', 'DifferentPass2'), 'Passwords do not match.');
  assert.equal(getPasswordConfirmationError('SecurePass1', 'SecurePass1'), '');
});
