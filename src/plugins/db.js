const fp = require('fastify-plugin');
const { createPool } = require('../db/pool');

// Exposes a Postgres pool as `fastify.db` and closes it on shutdown
async function dbPlugin(fastify) {
  const pool = createPool();

  fastify.decorate('db', pool);

  fastify.addHook('onClose', async () => {
    await pool.end();
  });
}

module.exports = fp(dbPlugin);
