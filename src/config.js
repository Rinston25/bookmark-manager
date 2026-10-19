require('dotenv').config();

// All settings come from environment variables, with local-dev defaults
module.exports = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://bookmarks:bookmarks@localhost:5432/bookmarks',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // Failed or successful, this many logins per IP + email are allowed in each window
  loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 5,
  loginRateLimitWindowSeconds: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS) || 900,
};
