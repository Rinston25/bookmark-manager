require('dotenv').config();

const DEFAULT_CACHE_TTL_SECONDS = 60;

// Redis rejects fractional or non-positive expiry times at request time (a 500),
// so a bad CACHE_TTL_SECONDS is refused at startup instead
function readCacheTtl(rawValue) {
  if (rawValue === undefined || rawValue === '') return DEFAULT_CACHE_TTL_SECONDS;

  const ttlSeconds = Number(rawValue);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new Error(`CACHE_TTL_SECONDS must be a whole number of at least 1, got "${rawValue}"`);
  }
  return ttlSeconds;
}

// All settings come from environment variables, with local-dev defaults
module.exports = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://bookmarks:bookmarks@localhost:5432/bookmarks',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // How long cached responses live in Redis
  cacheTtlSeconds: readCacheTtl(process.env.CACHE_TTL_SECONDS),
};

module.exports.readCacheTtl = readCacheTtl;
