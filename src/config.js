require('dotenv').config();

// All settings come from environment variables, with local-dev defaults
module.exports = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://bookmarks:bookmarks@localhost:5432/bookmarks',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // How long cached responses live in Redis
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS) || 60,
};
