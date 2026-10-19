require('./helpers/testEnv');
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { signToken, verifyToken } = require('../src/services/tokens');

const USER = { id: 3, email: 'a@example.com' };

test('a fresh token verifies and carries the user id', () => {
  const payload = verifyToken(signToken(USER));

  assert.strictEqual(payload.userId, 3);
});

test('an expired token is rejected', () => {
  const expiredToken = jwt.sign({ userId: 3 }, config.jwtSecret, { expiresIn: -10 });

  assert.throws(() => verifyToken(expiredToken), /jwt expired/);
});

test('a token signed with another secret is rejected', () => {
  const forgedToken = jwt.sign({ userId: 3 }, 'not-the-real-secret', { expiresIn: '1h' });

  assert.throws(() => verifyToken(forgedToken), /invalid signature/);
});

test('a token signed with the old hard-coded secret is rejected', () => {
  const oldSecretToken = jwt.sign({ userId: 3 }, 'bm-api-secret-2024-change-later', {
    expiresIn: '1h',
  });

  assert.throws(() => verifyToken(oldSecretToken));
});

test('an unsigned (alg: none) token is rejected', () => {
  const unsignedToken = jwt.sign({ userId: 3 }, '', { algorithm: 'none' });

  assert.throws(() => verifyToken(unsignedToken));
});
