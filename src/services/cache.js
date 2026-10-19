const LIST_KEY_PREFIX = 'bookmarks:list';

// Key for one cached page of list results
function listCacheKey({ search, tag, limit }) {
  return `${LIST_KEY_PREFIX}:${search || ''}:${tag || ''}:${limit}`;
}

// Key for one cached bookmark
function detailCacheKey(bookmarkId) {
  return `bookmark:${bookmarkId}`;
}

// Returns the parsed cached value, or null on a cache miss
async function readCache(redis, key) {
  const cachedText = await redis.get(key);
  return cachedText ? JSON.parse(cachedText) : null;
}

// Stores a value as JSON that expires after `ttlSeconds`
async function writeCache(redis, key, value, ttlSeconds) {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

// Removes every cached list page
async function clearListCache(redis) {
  const listKeys = await redis.keys(`${LIST_KEY_PREFIX}:*`);
  if (listKeys.length > 0) {
    await redis.del(listKeys);
  }
}

module.exports = {
  listCacheKey,
  detailCacheKey,
  readCache,
  writeCache,
  clearListCache,
};
