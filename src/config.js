require('dotenv').config();

// Returns a setting that has no safe default. Failing at startup is better than
// running with a secret that anyone reading the source code could guess.
function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Copy .env.example to .env and set it.`);
  }
  return value;
}

// All settings come from environment variables, with local-dev defaults
module.exports = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://bookmarks:bookmarks@localhost:5432/bookmarks',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // Signs login tokens; there is deliberately no default
  jwtSecret: readRequiredEnv('JWT_SECRET'),
};

module.exports.readRequiredEnv = readRequiredEnv;
