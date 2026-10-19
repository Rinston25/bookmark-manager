const fp = require('fastify-plugin');
const { verifyToken } = require('../services/tokens');

// Pulls the token out of an "Authorization: Bearer <token>" header
function readBearerToken(request) {
  const header = request.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

// preHandler that rejects requests without a valid token and sets request.user
async function authenticate(request, reply) {
  const token = readBearerToken(request);
  if (!token) {
    return reply.code(401).send({ error: 'Missing bearer token' });
  }

  try {
    const payload = verifyToken(token);
    request.user = { id: payload.userId, email: payload.email };
  } catch (error) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
}

async function authPlugin(fastify) {
  fastify.decorateRequest('user', null);
  fastify.decorate('authenticate', authenticate);
}

module.exports = fp(authPlugin);
