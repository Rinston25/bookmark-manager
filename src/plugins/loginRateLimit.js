const fp = require('fastify-plugin');
const rateLimit = require('@fastify/rate-limit');
const config = require('../config');

// One counter per IP address and email, so guessing passwords for one account
// is slowed down without blocking everyone who shares that IP (an office, a school)
function loginAttemptKey(request) {
  const email = String(request.body?.email || '').toLowerCase();
  return `${request.ip}|${email}`;
}

// Adds `fastify.loginRateLimit`, a preHandler for POST /auth/login.
// It runs after body validation because the key needs the email from the body.
async function loginRateLimitPlugin(fastify, options) {
  const max = options.max ?? config.loginRateLimitMax;
  const windowSeconds = options.windowSeconds ?? config.loginRateLimitWindowSeconds;

  // global: false means nothing is limited until a route opts in
  await fastify.register(rateLimit, { global: false });

  const checkLimit = fastify.rateLimit({
    max,
    timeWindow: windowSeconds * 1000,
    keyGenerator: loginAttemptKey,
  });

  fastify.decorate('loginRateLimit', async (request, reply) => {
    try {
      await checkLimit(request, reply);
    } catch (error) {
      if (error.statusCode !== 429) throw error;

      // The plugin has already set Retry-After; answer in the same { error } shape as other routes
      return reply.code(429).send({ error: 'Too many login attempts, please try again later' });
    }
  });
}

module.exports = fp(loginRateLimitPlugin);
