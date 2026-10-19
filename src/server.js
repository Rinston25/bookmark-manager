const buildApp = require('./app');
const config = require('./config');

async function start() {
  const app = buildApp();

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();
