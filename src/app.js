const Fastify = require('fastify');
const dbPlugin = require('./plugins/db');
const demoUserPlugin = require('./plugins/demoUser');
const bookmarkRoutes = require('./routes/bookmarks');

// Builds the Fastify instance without starting it, so it is easy to reuse
function buildApp(options = {}) {
  const app = Fastify({ logger: true, ...options });

  app.register(dbPlugin);
  app.register(demoUserPlugin);
  app.register(bookmarkRoutes);

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

module.exports = buildApp;
