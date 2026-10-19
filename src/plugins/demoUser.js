const fp = require('fastify-plugin');

// The seeded demo account from schema.sql
const DEMO_USER_ID = 1;

// Temporary stand-in for authentication: every request acts as the demo user
async function demoUserPlugin(fastify) {
  fastify.decorateRequest('user', null);

  fastify.addHook('onRequest', async (request) => {
    request.user = { id: DEMO_USER_ID };
  });
}

module.exports = fp(demoUserPlugin);
