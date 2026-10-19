const jwt = require('jsonwebtoken');
const config = require('../config');

// Pinned so a token cannot pick its own (weaker) algorithm
const TOKEN_ALGORITHM = 'HS256';

// How long a freshly issued token stays valid
const TOKEN_LIFETIME = '24h';

// Creates a signed access token for a user row ({ id, email })
function signToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, config.jwtSecret, {
    algorithm: TOKEN_ALGORITHM,
    expiresIn: TOKEN_LIFETIME,
  });
}

// Returns the token payload, or throws if the signature is wrong or the token has expired
function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: [TOKEN_ALGORITHM] });
}

module.exports = { signToken, verifyToken };
