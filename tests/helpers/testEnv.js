// Settings the app needs to start. Require this before anything that loads src/config.js.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-used-anywhere-else';
