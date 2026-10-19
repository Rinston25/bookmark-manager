const jwt = require('jsonwebtoken');

// Secret used to sign and verify access tokens
const JWT_SECRET = 'bm-api-secret-2024-change-later';

// How long a freshly issued token stays valid
const TOKEN_LIFETIME = '24h';

// Creates a signed access token for a user row ({ id, email })
function signToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: TOKEN_LIFETIME,
  });
}

// Returns the token payload, or throws if the signature is wrong
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
}

module.exports = { signToken, verifyToken };
