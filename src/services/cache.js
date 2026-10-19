const LIST_KEY_PREFIX = 'bookmarks:list';

// Key for one cached page of one user's list results.
// The user id comes first so a user's lists can be found and cleared by prefix.
// Search and tag are URL-encoded so a ":" typed by a user cannot blur the key parts.
function listCacheKey({ userId, page, limit, search, tag }) {
  const searchPart = encodeURIComponent(search || '');
  const tagPart = encodeURIComponent(tag || '');
  return `${LIST_KEY_PREFIX}:${userId}:${page}:${limit}:${searchPart}:${tagPart}`;
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

// Removes every cached list page of one user. SCAN walks Redis in small steps,
// unlike KEYS, which blocks the whole server while it searches every key.
async function clearListCache(redis, userId) {
  const pattern = `${LIST_KEY_PREFIX}:${userId}:*`;
  let cursor = '0';

  do {
    const [nextCursor, listKeys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    if (listKeys.length > 0) {
      await redis.del(...listKeys);
    }
    cursor = nextCursor;
  } while (cursor !== '0');
}

// Drops everything that can show an old copy of a changed or deleted bookmark
async function clearBookmarkCache(redis, userId, bookmarkId) {
  await redis.del(detailCacheKey(bookmarkId));
  await clearListCache(redis, userId);
}

module.exports = {
  listCacheKey,
  detailCacheKey,
  readCache,
  writeCache,
  clearListCache,
  clearBookmarkCache,
};
