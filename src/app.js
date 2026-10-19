const Fastify = require('fastify');
const dbPlugin = require('./plugins/db');
const authPlugin = require('./plugins/auth');
const errorHandlerPlugin = require('./plugins/errorHandler');
const authRoutes = require('./routes/auth');
const bookmarkRoutes = require('./routes/bookmarks');

// Builds the Fastify instance without starting it, so it is easy to reuse
function buildApp(options = {}) {
  const app = Fastify({ logger: true, ...options });

  app.register(errorHandlerPlugin);
  app.register(dbPlugin);
  app.register(authPlugin);
  app.register(authRoutes);
  app.register(bookmarkRoutes);

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

module.exports = buildApp;
