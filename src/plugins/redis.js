const fp = require('fastify-plugin');
const Redis = require('ioredis');
const config = require('../config');

// Exposes a Redis client as `fastify.redis` and closes it on shutdown.
// lazyConnect means the connection is only opened when the first command runs.
async function redisPlugin(fastify) {
  const redis = new Redis(config.redisUrl, { lazyConnect: true });

  redis.on('error', (error) => {
    fastify.log.error({ err: error }, 'Redis connection error');
  });

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    await redis.quit();
  });
}

module.exports = fp(redisPlugin);
